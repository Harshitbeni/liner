import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { RootLayout } from './layout';
import { ToastProvider } from './toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import './index.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootLayout>
      <TooltipProvider delayDuration={300}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </TooltipProvider>
    </RootLayout>
  </StrictMode>,
);
