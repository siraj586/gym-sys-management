import { createBrowserRouter } from 'react-router';
import { SiteLayout } from '../components/layout/SiteLayout';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { HomePage } from '../pages/public/HomePage';
import { LoginPage } from '../pages/public/LoginPage';
import { RequireRole } from './guards';

/**
 * Three areas live in one app: the public site, /admin for the owner and
 * /portal for clients. RequireRole keeps each area to its own role.
 */
export const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/login', element: <LoginPage /> },
      {
        element: <RequireRole role="OWNER" />,
        children: [{ path: '/admin/*', element: <PlaceholderPage titleKey="admin.title" /> }],
      },
      {
        element: <RequireRole role="CLIENT" />,
        children: [{ path: '/portal/*', element: <PlaceholderPage titleKey="portal.title" /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
