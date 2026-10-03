import React from 'react';
import { logger } from './utils/logger';
import ReactDOM from 'react-dom/client';
import App from './App';
import { RollPopup } from './components/RollPopup';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';
import OBR from '@owlbear-rodeo/sdk';
import { isOwlbear } from './utils/storage';
import { APP_VERSION } from './constants';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

const renderApp = () => {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
};

const renderRollPopup = () => {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <RollPopup />
      </ErrorBoundary>
    </React.StrictMode>
  );
};

// Check if this window is the roll popup
const isRollPopup = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mode') === 'roll-popup';

// Detect if we are running in a hidden background iframe
// Background scripts are loaded with a size of 0x0 or 1x1 by OBR
const isHiddenIframe = typeof window !== 'undefined' && (window.innerWidth <= 10 || window.innerHeight <= 10);

if (isHiddenIframe) {
  logger.debug("[DND Sheet] Hidden iframe detected. Halting UI rendering to prevent automatic window opening.");
} else if (isRollPopup) {
  OBR.onReady(() => {
    logger.debug("[DND Sheet] Rendering roll popup overlay.");
    renderRollPopup();
  });
} else if (isOwlbear()) {
  OBR.onReady(() => {
    logger.info(`[DND Sheet] OBR is ready. Version: ${APP_VERSION}. Rendering...`);
    renderApp();
  });
} else {
  logger.info(`[DND Sheet] Standalone mode. Version: ${APP_VERSION}.`);
  renderApp();
}
