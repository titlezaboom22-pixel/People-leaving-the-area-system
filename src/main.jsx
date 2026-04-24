import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import InstallPrompt from './InstallPrompt';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <InstallPrompt />
  </React.StrictMode>
);
