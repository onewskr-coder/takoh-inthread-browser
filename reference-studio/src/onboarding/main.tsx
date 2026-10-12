import React from 'react';
import { createRoot } from 'react-dom/client';
import { OnboardingApp } from './OnboardingApp';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <OnboardingApp />
    </React.StrictMode>
  );
}
