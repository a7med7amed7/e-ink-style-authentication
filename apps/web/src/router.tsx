import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './auth/protected-route.js';
import { SigninPage } from './pages/signin.js';
import { SignupPage } from './pages/signup.js';
import { WelcomePage } from './pages/welcome.js';

export const appRouter = createBrowserRouter([
  { path: '/signin', element: <SigninPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/app', element: <ProtectedRoute><WelcomePage /></ProtectedRoute> },
  { path: '/', element: <ProtectedRoute><WelcomePage /></ProtectedRoute> },
  { path: '*', element: <Navigate to="/signup" replace /> }
]);
