import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/ui.css';
import './styles/shell.css';
import './styles/review.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AuthGate from './components/AuthGate.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(<AuthGate>{auth => <App {...auth} />}</AuthGate>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
