import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet } from 'react-native';
import LottieView from 'lottie-react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { observability } from '@cultuvilla/shared';
import { colors } from '@cultuvilla/shared/design-system';
import { useT } from '../../lib/i18n';
import { consumeIntroSkip } from '../../lib/intro/introSkip';

// Regenerate from the animator's export with scripts/prepare-intro-lottie.mjs.
const ANIMATION = require('../../assets/intro/cultuvilla-intro.json');
const SOUND = require('../../assets/intro/cultuvilla-intro.mp3');

/** Longest the intro may hold the screen, waiting for the app, before it gives up. */
export const INTRO_MAX_MS = 10_000;
const FADE_MS = 300;

// The app's surface, which the animation and the native splash are also
// painted on, so splash → intro → app reads as one continuous screen.
const INTRO_BACKGROUND = colors.light.bg.surface;

type Phase = 'starting' | 'playing' | 'leaving' | 'gone';

/**
 * Runs a synchronous expo-audio call that must never take the app down.
 *
 * These calls throw `AppContextLost` once the JS runtime is being torn down —
 * which happens with the intro still on screen when a launch restarts the app
 * at once (clearLocalCacheAndRestart, from the one-off runaway-queue purge). Thrown from an effect, that
 * is an unhandled JS exception during launch, and expo-updates' error recovery
 * answers it by aborting the process. The intro's sound is decoration: losing
 * it is fine, crashing for it is not.
 */
function safelyAudio(operation: string, call: () => void): void {
  try {
    call();
  } catch (err) {
    // A runtime being torn down is the expected case above, not a fault worth a report.
    if (err instanceof Error && err.message.includes('AppContextLost')) return;
    observability.captureError(err, { operation: `intro:sound:${operation}` });
  }
}

/**
 * Full-screen startup intro, shown once per cold start over the app while it
 * loads. It leaves when the animation has finished AND the app is ready, when
 * tapped, or after INTRO_MAX_MS — whichever comes first. Skipped entirely for
 * users with Reduce Motion on, and on the restart that follows a sign-out.
 */
function releasePlayer(ref: { current: AudioPlayer | null }): void {
  const current = ref.current;
  ref.current = null;
  if (current) safelyAudio('remove', () => current.remove());
}

export function IntroOverlay({ appReady }: { appReady: boolean }) {
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>('starting');
  const [animationDone, setAnimationDone] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const player = useRef<AudioPlayer | null>(null);

  const leave = useCallback(() => {
    setPhase((current) => (current === 'starting' || current === 'playing' ? 'leaving' : current));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [reduceMotion, skip] = await Promise.all([
        AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
        consumeIntroSkip(),
      ]);
      if (cancelled) return;
      if (reduceMotion || skip) {
        setPhase('gone');
        return;
      }
      try {
        // iOS: respect the silent switch. Android has none — expo-audio maps
        // `false` to "skip play() unless the ringer is NORMAL", which silenced
        // phones on vibrate with media volume up, so media volume decides
        // there. Never stop the user's own music.
        await setAudioModeAsync({
          playsInSilentMode: Platform.OS === 'android',
          interruptionMode: 'mixWithOthers',
        });
        if (cancelled) return;
        player.current = createAudioPlayer(SOUND);
        player.current.play();
      } catch (err) {
        observability.captureError(err, { operation: 'intro:sound' });
      }
      if (!cancelled) setPhase((current) => (current === 'starting' ? 'playing' : current));
    })();
    const giveUp = setTimeout(leave, INTRO_MAX_MS);
    return () => {
      cancelled = true;
      clearTimeout(giveUp);
      releasePlayer(player);
    };
  }, [leave]);

  useEffect(() => {
    if (animationDone && appReady) leave();
  }, [animationDone, appReady, leave]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const current = player.current;
    if (current) safelyAudio('pause', () => current.pause());
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() => {
      // The overlay stays mounted for the app's lifetime, so release the
      // player here rather than waiting for an unmount that never comes.
      releasePlayer(player);
      setPhase('gone');
    });
  }, [phase, opacity]);

  if (phase === 'gone') return null;

  return (
    // NativeWind drops className on Animated components — style only.
    <Animated.View
      style={[StyleSheet.absoluteFill, { backgroundColor: INTRO_BACKGROUND, opacity }]}
      pointerEvents={phase === 'leaving' ? 'none' : 'auto'}
      testID="intro-backdrop"
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={leave}
        accessibilityRole="button"
        accessibilityLabel={t('intro.skip')}
        testID="intro-overlay"
      >
        {phase !== 'starting' && (
          <LottieView
            source={ANIMATION}
            autoPlay
            loop={false}
            resizeMode="contain"
            style={StyleSheet.absoluteFill}
            onAnimationFinish={() => setAnimationDone(true)}
            onAnimationFailure={(error) => {
              observability.captureError(new Error(error), { operation: 'intro:animation' });
              leave();
            }}
          />
        )}
      </Pressable>
    </Animated.View>
  );
}
