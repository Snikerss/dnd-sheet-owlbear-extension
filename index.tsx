import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import OBR from '@owlbear-rodeo/sdk';
import { isOwlbear } from './utils/storage';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

const renderApp = () => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

// Check if we are running in the background script context
const isBackground = typeof window !== 'undefined' && window.location.pathname.endsWith('background.html');

if (isBackground) {
  console.log("[DND Sheet] Background context detected. Halting UI initialization.");
} else if (isOwlbear()) {
  OBR.onReady(() => {
    const isFloating = new URLSearchParams(window.location.search).get('mode') === 'floating';
    if (!isFloating) {
      console.log("[DND Sheet] Popover detected. Launching draggable floating window and closing popover...");
      
      // Render loading screen in the initial anchored popover
      root.render(
        <React.StrictMode>
          <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center text-[var(--color-text-base)]">
            <div className="flex flex-col items-center space-y-4">
              <div className="w-10 h-10 border-4 border-[var(--color-accent-primary)] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-semibold tracking-wide">Открытие плавающего листа персонажа...</p>
            </div>
          </div>
        </React.StrictMode>
      );

      const popoverUrl = window.location.origin + '/index.html?mode=floating';
      OBR.popover.open({
        id: 'com.antigravity.dnd-sheet/popover',
        url: popoverUrl,
        width: 1000,
        height: 800,
        anchorPosition: { left: 100, top: 100 },
        disableClickAway: true,
      }).then(() => {
        // Wait a brief moment to allow the popover window to initialize before closing action popover
        setTimeout(() => {
          OBR.action.close();
        }, 150);
      }).catch((err) => {
        console.error("[DND Sheet] Failed to launch draggable popover:", err);
        // Fallback to rendering the sheet directly in the popover if floating mode fails
        renderApp();
      });
    } else {
      renderApp();
    }
  });
} else {
  renderApp();
}
