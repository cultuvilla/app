import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Whether the app is in front of the user. Only `background` counts as away:
 * iOS passes through `inactive` for a notification shade or the app switcher,
 * and closing listeners for that would only reopen them a second later.
 */
export function isForeground(state: AppStateStatus): boolean {
  return state !== 'background';
}

export function useAppForeground(): boolean {
  const [foreground, setForeground] = useState(() => isForeground(AppState.currentState));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setForeground(isForeground(state));
    });
    return () => {
      sub.remove();
    };
  }, []);
  return foreground;
}
