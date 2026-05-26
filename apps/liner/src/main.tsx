import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { InterfaceKitRoot } from './interface-kit';
import { ToastProvider } from './toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import './index.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <InterfaceKitRoot>
    <StrictMode>
      <TooltipProvider delayDuration={300}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </TooltipProvider>
    </StrictMode>
  </InterfaceKitRoot>,
);
