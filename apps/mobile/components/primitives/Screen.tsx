import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { ScrollView, View } from 'react-native';
import type { ReactNode } from 'react';
import { KeyboardAvoider } from './KeyboardAvoider';

export type ScreenProps = {
  children: ReactNode;
  /** Apply default horizontal+vertical padding (p-4). Defaults to true. */
  padded?: boolean;
  /** Wrap content in a ScrollView. Defaults to false. */
  scroll?: boolean;
  /** When the screen renders its own top chrome (e.g. AppHeader) that should
   * extend behind the OS status bar, set false so SafeAreaView doesn't claim
   * the top inset with the surface background. Defaults to true. */
  topInset?: boolean;
  /** Claim the bottom safe-area inset (home indicator / gesture bar) so footer
   * content isn't clipped. Defaults to true. Set false on bottom-tab screens
   * (the tab bar already reserves the bottom inset) and on screens that apply
   * insets.bottom themselves, to avoid double padding. */
  bottomInset?: boolean;
  testID?: string;
};

// Page-level wrapper. Sets the surface background, safe-area insets, and
// optional scroll/padding that keep content clear of OS chrome. Every screen
// also avoids the keyboard here, so a form never needs its own
// KeyboardAvoidingView — nesting one would pad twice.
// Mirrors the prop API of apps/web/components/primitives/Screen.tsx while
// adding mobile-specific padded + scroll conveniences.
// testID is placed on the inner content container so callers can assert
// on the padding/bg classes that apply there.
export function Screen({
  children,
  padded = true,
  scroll = false,
  topInset = true,
  bottomInset = true,
  testID,
}: ScreenProps) {
  const paddingClass = padded ? 'p-4' : '';
  // A View fills with `flex-1`. A ScrollView must NOT put `flex-1` on its
  // content container — that locks the content to the viewport height so there
  // is nothing to overflow and the screen won't scroll (silently broken on
  // web). Use `grow` (flex-grow) on the content container instead: it still
  // fills the surface for short content but lets long content overflow + scroll.
  const viewClass = `flex-1 bg-surface ${paddingClass}`.trim();
  const scrollClass = 'flex-1 bg-surface';
  const scrollContentClass = `grow bg-surface ${paddingClass}`.trim();
  const Inner = scroll ? ScrollView : View;
  const edges: Edge[] = ['left', 'right'];
  if (topInset) edges.unshift('top');
  if (bottomInset) edges.push('bottom');
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={edges}>
      <KeyboardAvoider>
        <Inner
          className={scroll ? scrollClass : viewClass}
          testID={testID}
          {...(scroll
            ? { contentContainerClassName: scrollContentClass, keyboardShouldPersistTaps: 'handled' as const }
            : {})}
        >
          {children}
        </Inner>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}
