import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { setupAudioUnlock } from './utils/audio';
import { initTheme } from './utils/theme';

initTheme();
setupAudioUnlock();

// Register PWA Service Worker
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('Aiya Service Worker terpasang:', reg.scope);
      })
      .catch((err) => {
        console.error('Gagal memasang Service Worker:', err);
      });
  });
} else if ('serviceWorker' in navigator) {
  // Dev mode: no service worker. Its cache would serve stale source files,
  // so code changes would not show up. Remove any worker/cache left from earlier runs.
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}

createRoot(document.getElementById('root')!).render(<App />);
