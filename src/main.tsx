import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

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
  // In dev mode, register so testing offline or install prompt works
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(<App />);
