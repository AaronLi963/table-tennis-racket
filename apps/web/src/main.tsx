import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './App.tsx';
import { MeasurePage } from './pages/MeasurePage.tsx';
import { CalibrationPage } from './pages/CalibrationPage.tsx';
import { ComparePage } from './pages/ComparePage.tsx';
import './styles.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <MeasurePage /> },
      { path: 'calibration', element: <CalibrationPage /> },
      { path: 'compare', element: <ComparePage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
