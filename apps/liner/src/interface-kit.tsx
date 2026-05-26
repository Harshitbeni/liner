import * as React from 'react';
import type { ReactNode } from 'react';
import {
  loadInterfaceKitEnabled,
  saveInterfaceKitEnabled,
} from './storage';

type Ctx = {
  enabled: boolean;
  setInterfaceKitEnabled: (on: boolean) => void;
};

const InterfaceKitContext = React.createContext<Ctx | null>(null);

export function useInterfaceKit(): Ctx {
  const ctx = React.useContext(InterfaceKitContext);
  if (!ctx) {
    throw new Error('useInterfaceKit must be used within InterfaceKitRoot');
  }
  return ctx;
}

function InterfaceKitPortal() {
  const { enabled } = useInterfaceKit();
  const [Kit, setKit] = React.useState<
    React.ComponentType<{ enabled?: boolean }> | null
  >(null);

  React.useEffect(() => {
    if (!enabled) {
      setKit(null);
      return;
    }

    const load = () => {
      void import('interface-kit/react').then((m) => {
        setKit(() => m.InterfaceKit);
      });
    };

    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(load);
      return () => cancelIdleCallback(id);
    }
    const t = window.setTimeout(load, 50);
    return () => window.clearTimeout(t);
  }, [enabled]);

  if (!enabled || !Kit) return null;

  return <Kit enabled />;
}

export function InterfaceKitRoot({ children }: { children: ReactNode }) {
  const [enabled] = React.useState(loadInterfaceKitEnabled);

  const setInterfaceKitEnabled = React.useCallback((on: boolean) => {
    if (on === enabled) return;
    saveInterfaceKitEnabled(on);
    window.location.reload();
  }, [enabled]);

  const value = React.useMemo(
    () => ({ enabled, setInterfaceKitEnabled }),
    [enabled, setInterfaceKitEnabled],
  );

  return (
    <InterfaceKitContext.Provider value={value}>
      {children}
      <InterfaceKitPortal />
    </InterfaceKitContext.Provider>
  );
}
