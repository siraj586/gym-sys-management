import { createBrowserRouter } from 'react-router';
import { AdminLayout } from '../components/layout/AdminLayout';
import { SiteLayout } from '../components/layout/SiteLayout';
import { AdminHomePage } from '../pages/admin/AdminHomePage';
import { AttendancePage } from '../pages/admin/AttendancePage';
import { ExercisesPage } from '../pages/admin/ExercisesPage';
import { ProgramEditorPage } from '../pages/admin/ProgramEditorPage';
import { ProgramPage } from '../pages/admin/ProgramPage';
import { ProgramsPage } from '../pages/admin/ProgramsPage';
import { ProgressPage } from '../pages/admin/ProgressPage';
import { MemberFormPage } from '../pages/admin/MemberFormPage';
import { MemberPage } from '../pages/admin/MemberPage';
import { MembersPage } from '../pages/admin/MembersPage';
import { PaymentsPage } from '../pages/admin/PaymentsPage';
import { PlansPage } from '../pages/admin/PlansPage';
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
        children: [
          {
            path: '/admin',
            element: <AdminLayout />,
            children: [
              { index: true, element: <AdminHomePage /> },
              { path: 'attendance', element: <AttendancePage /> },
              { path: 'members', element: <MembersPage /> },
              { path: 'members/new', element: <MemberFormPage /> },
              { path: 'members/:id', element: <MemberPage /> },
              { path: 'members/:id/edit', element: <MemberFormPage /> },
              { path: 'members/:id/progress', element: <ProgressPage /> },
              { path: 'plans', element: <PlansPage /> },
              { path: 'programs', element: <ProgramsPage /> },
              { path: 'programs/new', element: <ProgramEditorPage /> },
              { path: 'programs/:id', element: <ProgramPage /> },
              { path: 'programs/:id/edit', element: <ProgramEditorPage /> },
              { path: 'exercises', element: <ExercisesPage /> },
              { path: 'payments', element: <PaymentsPage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
      {
        element: <RequireRole role="CLIENT" />,
        children: [{ path: '/portal/*', element: <PlaceholderPage titleKey="portal.title" /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
