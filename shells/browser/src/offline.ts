// Registers the offline service worker (P2.3.2). Skipped on the desktop shell, which ships its
// files inside the app, and in gate mode so the golden run never depends on a cache.
export async function registerOffline(): Promise<void> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  if (new URLSearchParams(location.search).has('gate')) return;
  try { await navigator.serviceWorker.register('./sw.js'); } catch { /* the game still runs online */ }
}
