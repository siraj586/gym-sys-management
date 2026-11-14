import { createBrowserRouter } from 'react-router';
import { SiteLayout } from '../components/layout/SiteLayout';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { HomePage } from '../pages/public/HomePage';

/**
 * Three areas live in one app: the public site, /admin for the coach and
 * /portal for clients. Role guards on /admin and /portal arrive with auth.
 */
export const router = createBrowserRouter([
  {
    element: <SiteLayout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/login', element: <PlaceholderPage titleKey="login.title" /> },
      { path: '/admin/*', element: <PlaceholderPage titleKey="admin.title" /> },
      { path: '/portal/*', element: <PlaceholderPage titleKey="portal.title" /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
