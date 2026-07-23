import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'
import { GlobalDialog } from './components/GlobalDialog.tsx'
import { I18nProvider } from './contexts/I18nContext.tsx'
import { polyfill } from "mobile-drag-drop";
import { scrollBehaviourDragImageTranslateOverride } from "mobile-drag-drop/scroll-behaviour";
import "mobile-drag-drop/default.css";

polyfill({
    dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride
});

const originalConsoleWarn = console.warn;
console.warn = function(...args) {
  if (args.length > 0 && typeof args[0] === 'string' && args[0].includes('Unable to load glyph range')) {
    return;
  }
  originalConsoleWarn.apply(console, args);
};

window.addEventListener('touchmove', function() {}, {passive: false});
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
      <GlobalDialog />
    </I18nProvider>
  </StrictMode>,
)
