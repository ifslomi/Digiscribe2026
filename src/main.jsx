import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './styles/index.css'
import App from './App.jsx'

// When deployed to static hosting (e.g. Supreme Center), redirect all /api/
// calls to the Render backend instead of the same origin.
const API_BASE = import.meta.env.VITE_API_BASE || '';
const USE_API_BASE = API_BASE && !import.meta.env.DEV && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(\/|$)/i.test(API_BASE);
if (USE_API_BASE) {
  const _fetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      input = API_BASE + input;
    }
    return _fetch(input, init);
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
