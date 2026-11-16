import type { Role } from '@calisthenics/shared';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../features/auth/AuthContext';

/** Where each role lands after signing in. */
export function homePathFor(role: Role): string {
  return role === 'OWNER' ? '/admin' : '/portal';
}

/**
 * Wraps a group of routes that only one role may open.
 * This is for navigation only: the API checks the role again on every request.
 */
export function RequireRole({ role }: { role: Role }) {
  const { state } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  if (state.status === 'loading') {
    return <p className="p-6 text-muted">{t('common.loading')}</p>;
  }
  if (state.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (state.user.role !== role) {
    return <Navigate to={homePathFor(state.user.role)} replace />;
  }
  return <Outlet />;
}
