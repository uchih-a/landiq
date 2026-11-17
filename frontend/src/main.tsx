import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css'; // Tailwind base/components/utilities + design tokens
import './lib/i18n'; // initialize i18next before app renders
import App from './app/App';
import { QueryProvider } from './app/QueryProvider';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root was not found in the DOM');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryProvider>
        <App />
      </QueryProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
