import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, View, type ViewStyle } from 'react-native';
import { colors } from '@cultuvilla/shared/design-system';

/**
 * A little village whose houses and church tower are also the bars of a rising
 * chart, with a dashed trend line over the roofs, on sage hills.
 *
 * Drawn with Views on the approved mock's 240×150 grid rather than SVG: the app
 * ships no react-native-svg, and adding a native module would wait for a store
 * binary where this reaches installed apps over the air.
 */
const VIEW_W = 240;
const VIEW_H = 150;
const BASELINE = 132;

const c = colors.light;
const INK = c.fg.primary;

interface Bar {
  body: { x: number; y: number; w: number; h: number; color: string };
  roof: { x: number; top: number; w: number; h: number; color: string };
  windows?: { x: number; y: number }[];
  door?: { x: number; y: number };
}

const BARS: Bar[] = [
  {
    body: { x: 28, y: 92, w: 34, h: 40, color: c.bg['accent-subtle'] },
    roof: { x: 24, top: 76, w: 42, h: 18, color: c.bg.accent },
    door: { x: 40, y: 112 },
  },
  {
    body: { x: 72, y: 74, w: 34, h: 58, color: c.bg.subtle },
    roof: { x: 68, top: 58, w: 42, h: 18, color: c.bg['accent-pressed'] },
    windows: [
      { x: 80, y: 86 },
      { x: 92, y: 86 },
    ],
    door: { x: 84, y: 112 },
  },
  // The church tower, the tallest bar; its clock, arched door and cross are drawn below.
  {
    body: { x: 116, y: 40, w: 30, h: 92, color: c.bg['accent-subtle'] },
    roof: { x: 112, top: 18, w: 38, h: 24, color: c.bg.accent },
  },
  {
    body: { x: 156, y: 84, w: 34, h: 48, color: c.bg.subtle },
    roof: { x: 152, top: 68, w: 42, h: 18, color: c.bg['accent-pressed'] },
    door: { x: 168, y: 112 },
  },
];

type Point = { x: number; y: number };
const TREND_SEGMENTS: [Point, Point][] = [
  [{ x: 45, y: 70 }, { x: 89, y: 52 }],
  [{ x: 89, y: 52 }, { x: 131, y: 4 }],
  [{ x: 131, y: 4 }, { x: 173, y: 62 }],
];

const RISE_MS = 900;
const STAGGER_MS = 120;

export function AnalyticsConsentIllustration({ width }: { width: number }) {
  const s = width / VIEW_W;
  const height = VIEW_H * s;
  const bars = useRef(BARS.map((bar) => ({ bar, rise: new Animated.Value(1) }))).current;

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => true)
      .then((reduce) => {
        if (cancelled || reduce) return;
        bars.forEach(({ rise }) => {
          rise.setValue(0.2);
        });
        Animated.stagger(
          STAGGER_MS,
          bars.map(({ rise }) => Animated.timing(rise, { toValue: 1, duration: RISE_MS, useNativeDriver: true })),
        ).start();
      });
    return () => {
      cancelled = true;
    };
  }, [bars]);

  const box = (x: number, y: number, w: number, h: number, style: ViewStyle = {}): ViewStyle => ({
    position: 'absolute',
    left: x * s,
    top: y * s,
    width: w * s,
    height: h * s,
    ...style,
  });

  const roof = (r: Bar['roof']): ViewStyle => ({
    position: 'absolute',
    left: r.x * s,
    top: r.top * s,
    width: 0,
    height: 0,
    borderLeftWidth: (r.w / 2) * s,
    borderRightWidth: (r.w / 2) * s,
    borderBottomWidth: r.h * s,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: r.color,
  });

  const towerDetails: ReactNode = (
    <>
      <View style={box(125, 52, 12, 12, { borderRadius: 6 * s, backgroundColor: c.bg.surface, borderWidth: 2 * s, borderColor: INK })} />
      <View style={box(130.2, 54, 1.6, 4.8, { backgroundColor: INK })} />
      <View style={box(130.2, 57.2, 4.6, 1.6, { backgroundColor: INK })} />
      <View
        style={box(124, 105, 14, 27, {
          backgroundColor: INK,
          borderTopLeftRadius: 7 * s,
          borderTopRightRadius: 7 * s,
        })}
      />
      <View style={box(130, 8, 2, 10, { backgroundColor: INK, borderRadius: s })} />
      <View style={box(126, 10, 10, 2, { backgroundColor: INK, borderRadius: s })} />
    </>
  );

  return (
    <View
      style={{ width, height, overflow: 'hidden' }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      testID="analytics-consent-illustration"
    >
      {/* Hills */}
      <View style={box(-40, 106, 220, 70, { borderRadius: 110 * s, backgroundColor: c.bg['secondary-subtle'], opacity: 0.55 })} />
      <View style={box(110, 103, 190, 60, { borderRadius: 95 * s, backgroundColor: c.bg['secondary-subtle'], opacity: 0.55 })} />
      {/* Sun */}
      <View style={box(180, 18, 32, 32, { borderRadius: 16 * s, backgroundColor: c.bg.subtle })} />

      {bars.map(({ bar, rise }, i) => (
        <Animated.View
          key={bar.body.x}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width,
            height,
            transformOrigin: `50% ${String((BASELINE / VIEW_H) * 100)}%`,
            transform: [{ scaleY: rise }],
          }}
        >
          <View style={box(bar.body.x, bar.body.y, bar.body.w, bar.body.h, { backgroundColor: bar.body.color })} />
          <View style={roof(bar.roof)} />
          {bar.windows?.map((w) => (
            <View key={w.x} style={box(w.x, w.y, 8, 8, { backgroundColor: INK })} />
          ))}
          {bar.door ? <View style={box(bar.door.x, bar.door.y, 10, 20, { backgroundColor: INK })} /> : null}
          {i === 2 ? towerDetails : null}
        </Animated.View>
      ))}

      {/* The trend line over the roofs, one dash at a time: RN draws no dashed single-side border on Android. */}
      {TREND_SEGMENTS.map(([{ x: x1, y: y1 }, { x: x2, y: y2 }]) => {
        const len = Math.hypot(x2 - x1, y2 - y1);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const dashes = Math.floor(len / 8);
        return (
          <View
            key={x2}
            style={{
              position: 'absolute',
              left: ((x1 + x2) / 2 - len / 2) * s,
              top: ((y1 + y2) / 2 - 1) * s,
              width: len * s,
              height: 2 * s,
              flexDirection: 'row',
              opacity: 0.7,
              transform: [{ rotate: `${String(angle)}rad` }],
            }}
          >
            {Array.from({ length: dashes }, (_, d) => (
              <View key={d} style={{ width: 4 * s, height: 2 * s, marginRight: 4 * s, backgroundColor: INK }} />
            ))}
          </View>
        );
      })}

      {/* Ground line */}
      <View style={box(0, BASELINE - 1, VIEW_W, 2, { backgroundColor: INK })} />
    </View>
  );
}
