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

// Detect if we are running in a hidden background iframe
// Background scripts are loaded with a size of 0x0 or 1x1 by OBR
const isHiddenIframe = typeof window !== 'undefined' && (window.innerWidth <= 10 || window.innerHeight <= 10);

if (isHiddenIframe) {
  console.log("[DND Sheet] Hidden iframe detected. Halting UI rendering to prevent automatic window opening.");
} else if (isOwlbear()) {
  OBR.onReady(() => {
    console.log("[DND Sheet] OBR is ready. Rendering extension inside native popover.");
    renderApp();
  });
} else {
  renderApp();
}
