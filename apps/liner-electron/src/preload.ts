import { contextBridge } from 'electron';

function apiBaseFromArgv(): string {
  const arg = process.argv.find((a) => a.startsWith('--liner-api-base='));
  if (arg) return decodeURIComponent(arg.slice('--liner-api-base='.length));
  const port = process.env.LINER_API_PORT ?? '9240';
  return `http://127.0.0.1:${port}/api`;
}

contextBridge.exposeInMainWorld('liner', {
  platform: process.platform,
  apiBase: apiBaseFromArgv(),
});
