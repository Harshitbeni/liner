import * as React from 'react';
import type { ReactNode } from 'react';
import { InterfaceKit } from 'interface-kit/react';
import {
  InterfaceKitPrefsProvider,
  useInterfaceKitPrefs,
} from './interface-kit-prefs';

const MOUNT_HOST_ID = 'liner-interface-kit-host';

function InterfaceKitMount() {
  const { enabled } = useInterfaceKitPrefs();
  const [mountTarget, setMountTarget] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    let host = document.getElementById(MOUNT_HOST_ID) as HTMLElement | null;
    if (!host) {
      host = document.createElement('div');
      host.id = MOUNT_HOST_ID;
      document.body.appendChild(host);
    }
    setMountTarget(host);
    return () => {
      host?.remove();
      setMountTarget(null);
    };
  }, []);

  if (!mountTarget) return null;
  return <InterfaceKit enabled={enabled} mountTarget={mountTarget} />;
}

export function RootLayout({ children }: { children: ReactNode }) {
  return (
    <InterfaceKitPrefsProvider>
      {children}
      <InterfaceKitMount />
    </InterfaceKitPrefsProvider>
  );
}
