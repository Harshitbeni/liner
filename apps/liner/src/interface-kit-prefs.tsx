import * as React from 'react';
import {
  loadInterfaceKitEnabled,
  saveInterfaceKitEnabled,
} from './storage';

type InterfaceKitPrefsContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

const InterfaceKitPrefsContext =
  React.createContext<InterfaceKitPrefsContextValue | null>(null);

export function InterfaceKitPrefsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [enabled, setEnabledState] = React.useState(loadInterfaceKitEnabled);

  const setEnabled = React.useCallback((next: boolean) => {
    saveInterfaceKitEnabled(next);
    setEnabledState(next);
  }, []);

  const value = React.useMemo(
    () => ({ enabled, setEnabled }),
    [enabled, setEnabled],
  );

  return (
    <InterfaceKitPrefsContext.Provider value={value}>
      {children}
    </InterfaceKitPrefsContext.Provider>
  );
}

export function useInterfaceKitPrefs(): InterfaceKitPrefsContextValue {
  const ctx = React.useContext(InterfaceKitPrefsContext);
  if (!ctx) {
    throw new Error(
      'useInterfaceKitPrefs must be used within InterfaceKitPrefsProvider',
    );
  }
  return ctx;
}
