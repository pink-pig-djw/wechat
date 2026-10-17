import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { applyColorScheme } from './lib/prefs.js';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/chat.css';
import './styles/pages.css';
import './styles/moments.css';

applyColorScheme();

/**
 * Track the *visual* viewport so the layout shrinks when the on-screen keyboard opens.
 * Android resizes the layout viewport itself (interactive-widget=resizes-content), but iOS Safari
 * only shrinks the visual viewport and scrolls the page, which would hide the message box.
 */
const vv = window.visualViewport;
if (vv) {
  const root = document.documentElement;
  const sync = () => {
    root.style.setProperty('--app-height', `${Math.round(vv.height)}px`);
    root.style.setProperty('--app-top', `${Math.round(vv.offsetTop)}px`);
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
