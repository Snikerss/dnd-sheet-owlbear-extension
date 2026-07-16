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
    renderApp();
  });
} else {
  renderApp();
}
