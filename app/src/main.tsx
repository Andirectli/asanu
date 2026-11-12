import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { isMac, isTauri } from './platform';

// overlay title bar: leave room for the traffic lights
try {
  if (localStorage.getItem('asanu-nav-collapsed')) document.documentElement.classList.add('nav-collapsed');
} catch {
  /* ignore */
}
if (isTauri && isMac) document.documentElement.classList.add('mac-overlay');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
