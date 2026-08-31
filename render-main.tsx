import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ProductionApp } from './app/production-app';
import './app/globals.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Elemento root non trovato');
}

createRoot(root).render(
  <StrictMode>
    <ProductionApp />
  </StrictMode>,
);
