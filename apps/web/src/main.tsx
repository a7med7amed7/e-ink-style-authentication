import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { FetchAuthApi } from './api/auth-api.js';
import { AuthController } from './auth/auth-controller.js';
import { AuthProvider } from './auth/auth-context.js';
import { appRouter } from './router.js';

const rootElement = document.getElementById('root');
if (rootElement === null) throw new Error('The application root element is missing.');

const controller = new AuthController(new FetchAuthApi());
createRoot(rootElement).render(
  <StrictMode>
    <AuthProvider controller={controller}>
      <RouterProvider router={appRouter} />
    </AuthProvider>
  </StrictMode>
);
