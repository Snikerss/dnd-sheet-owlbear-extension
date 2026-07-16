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

if (isOwlbear()) {
  OBR.onReady(() => {
    const isModal = new URLSearchParams(window.location.search).get('mode') === 'modal';
    if (!isModal) {
      console.log("Popover detected. Launching modal and closing popover...");
      
      // Render loading screen in the popover so it's not blank
      root.render(
        <React.StrictMode>
          <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center text-[var(--color-text-base)]">
            <div className="flex flex-col items-center space-y-4">
              <div className="w-10 h-10 border-4 border-[var(--color-accent-primary)] border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-semibold tracking-wide">Открытие в плавающем окне...</p>
            </div>
          </div>
        </React.StrictMode>
      );

      const modalUrl = window.location.origin + '/index.html?mode=modal';
      OBR.modal.open({
        id: 'com.antigravity.dnd-sheet/modal',
        url: modalUrl,
        width: 1000,
        height: 800,
        hideBackdrop: true,
      }).then(() => {
        // Wait a short moment for modal loading before closing the popover
        setTimeout(() => {
          OBR.action.close();
        }, 100);
      }).catch((err) => {
        console.error("Failed to launch modal from popover:", err);
        // Fallback to rendering the full app in the popover if modal launch fails
        renderApp();
      });
    } else {
      renderApp();
    }
  });
} else {
  renderApp();
}
