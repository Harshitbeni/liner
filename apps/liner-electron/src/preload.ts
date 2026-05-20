import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('liner', {
  platform: process.platform,
  apiBase: 'http://127.0.0.1:9240/api',
});
