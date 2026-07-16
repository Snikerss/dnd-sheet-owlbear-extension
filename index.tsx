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
      OBR.modal.open({
        id: 'com.antigravity.dnd-sheet/modal',
        url: '/index.html?mode=modal',
        width: 1000,
        height: 800,
        hideBackdrop: true,
      }).then(() => {
        OBR.action.close();
      }).catch((err) => {
        console.error("Failed to launch modal from popover:", err);
        // Fallback to rendering in popover if modal fails
        renderApp();
      });
    } else {
      renderApp();
    }
  });
} else {
  renderApp();
}
