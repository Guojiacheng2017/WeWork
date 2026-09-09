import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import './styles/design-system.css';
import './components/ui/ui.css';

const UIKitPage = lazy(() => import('./components/ui/UIKitPage'));
const showUIKit = import.meta.env.DEV && new URLSearchParams(window.location.search).has('ui-kit');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<div role="status">正在加载…</div>}>{showUIKit ? <UIKitPage /> : <App />}</Suspense>
  </React.StrictMode>
);
