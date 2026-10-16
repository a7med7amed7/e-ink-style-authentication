import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import type { AuthController } from './auth/auth-controller.js';
import { ProtectedRoute } from './auth/protected-route.js';
import { SigninPage } from './pages/signin.js';
import { SignupPage } from './pages/signup.js';
import { WelcomePage } from './pages/welcome.js';

export function createAppRoutes(controller: AuthController): RouteObject[] {
  const revalidateBeforeRender = () => controller.revalidate('navigation');
  return [
    { path: '/signin', element: <SigninPage /> },
    { path: '/signup', element: <SignupPage /> },
    { path: '/app', loader: revalidateBeforeRender, element: <ProtectedRoute><WelcomePage /></ProtectedRoute> },
    { path: '/', loader: revalidateBeforeRender, element: <ProtectedRoute><WelcomePage /></ProtectedRoute> },
    { path: '*', element: <Navigate to="/signup" replace /> }
  ];
}

export function createAppRouter(controller: AuthController) {
  return createBrowserRouter(createAppRoutes(controller));
}
