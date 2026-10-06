import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Screen } from '../primitives/Screen';

export type AuthCardProps = { children: ReactNode };

export function AuthCard({ children }: AuthCardProps) {
  return (
    <Screen scroll>
      <View style={{ flex: 1 }}>
        <View className="flex-1 items-center pt-6">
          <View style={{ maxWidth: 360, width: '100%', alignSelf: 'center' }}>
            {children}
          </View>
        </View>
      </View>
    </Screen>
  );
}
