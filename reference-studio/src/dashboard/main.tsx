import React from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardApp } from './DashboardApp';
import '../popup/index.css';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <DashboardApp />
    </React.StrictMode>
  );
}
