export {};

declare global {
  interface Window {
    liner?: {
      platform: string;
      apiBase: string;
    };
  }
}
