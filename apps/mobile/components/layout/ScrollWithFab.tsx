import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

/**
 * A screen's scrolling page with its floating button pinned over it. The
 * button sits outside the scroll so it stays put, and the page leaves room
 * at the bottom so the last row is never hidden under it.
 */
export function ScrollWithFab({ fab, children, testID }: { fab: ReactNode; children: ReactNode; testID?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerClassName="px-4 pt-3 pb-24" keyboardShouldPersistTaps="handled" testID={testID}>
        {children}
      </ScrollView>
      {fab}
    </View>
  );
}
