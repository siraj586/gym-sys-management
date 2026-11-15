import { createBrowserRouter } from 'react-router';
import { AdminLayout } from '../components/layout/AdminLayout';
import { PortalLayout } from '../components/layout/PortalLayout';
import { AdminHomePage } from '../pages/admin/AdminHomePage';
import { AttendancePage } from '../pages/admin/AttendancePage';
import { ExercisesPage } from '../pages/admin/ExercisesPage';
import { MemberFormPage } from '../pages/admin/MemberFormPage';
import { MemberPage } from '../pages/admin/MemberPage';
import { MembersPage } from '../pages/admin/MembersPage';
import { PaymentsPage } from '../pages/admin/PaymentsPage';
import { PlansPage } from '../pages/admin/PlansPage';
import { ProgramEditorPage } from '../pages/admin/ProgramEditorPage';
import { ProgramsPage } from '../pages/admin/ProgramsPage';
import { ProgressIndexPage } from '../pages/admin/ProgressIndexPage';
import { ProgressPage } from '../pages/admin/ProgressPage';
import { SettingsPage } from '../pages/admin/SettingsPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import {
  PortalAttendancePage,
  PortalHomePage,
  PortalProfilePage,
  PortalProgramPage,
  PortalProgressPage,
} from '../pages/portal/PortalPages';
import { HomePage } from '../pages/public/HomePage';
import { LoginPage } from '../pages/public/LoginPage';
import { RequireRole } from './guards';

/**
 * Three areas live in one app, each with its own layout: the public site,
 * /admin for the coach (sidebar) and /portal for clients (top or bottom bar).
 * RequireRole keeps each private area to its own role.
 */
export const router = createBrowserRouter([
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
          { path: 'members', element: <MembersPage /> },
          { path: 'members/new', element: <MemberFormPage /> },
          { path: 'members/:id', element: <MemberPage /> },
          { path: 'members/:id/edit', element: <MemberFormPage /> },
          { path: 'members/:id/progress', element: <ProgressPage /> },
          { path: 'attendance', element: <AttendancePage /> },
          { path: 'payments', element: <PaymentsPage /> },
          { path: 'programs', element: <ProgramsPage /> },
          { path: 'programs/new', element: <ProgramEditorPage /> },
          { path: 'programs/:id', element: <ProgramsPage /> },
          { path: 'programs/:id/edit', element: <ProgramEditorPage /> },
          { path: 'exercises', element: <ExercisesPage /> },
          { path: 'progress', element: <ProgressIndexPage /> },
          { path: 'plans', element: <PlansPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
  {
    element: <RequireRole role="CLIENT" />,
    children: [
      {
        path: '/portal',
        element: <PortalLayout />,
        children: [
          { index: true, element: <PortalHomePage /> },
          { path: 'program', element: <PortalProgramPage /> },
          { path: 'attendance', element: <PortalAttendancePage /> },
          { path: 'progress', element: <PortalProgressPage /> },
          { path: 'profile', element: <PortalProfilePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
]);
