import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router';
import { useAuth } from '../../features/auth/AuthContext';
import { homePathFor } from '../../routes/guards';
import { Button } from '../ui/Button';
import { LanguageToggle } from '../ui/LanguageToggle';

const navLink = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center px-3 text-sm ${isActive ? 'text-lime' : 'text-soft hover:text-fg'}`;

/**
 * Header + page area shared by every route for now. The coach dashboard and
 * the client portal get their own layouts when those phases are built.
 */
export function SiteLayout() {
  const { t } = useTranslation();
  const { state, logout } = useAuth();
  const user = state.status === 'authenticated' ? state.user : null;

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/" className="font-display text-2xl font-bold uppercase tracking-wide">
            {t('app.name')}
          </Link>
          {/* ms-auto = margin at the "start" side, so it flips correctly in RTL. */}
          <nav className="ms-auto flex flex-wrap items-center gap-2">
            <NavLink to="/" end className={navLink}>
              {t('nav.home')}
            </NavLink>
            {user && (
              <NavLink to={homePathFor(user.role)} className={navLink}>
                {t(user.role === 'OWNER' ? 'admin.title' : 'portal.title')}
              </NavLink>
            )}
            <LanguageToggle />
            {user ? (
              <Button variant="outline" onClick={() => void logout()}>
                {t('nav.logout')}
              </Button>
            ) : (
              state.status === 'anonymous' && (
                <Link
                  to="/login"
                  className="flex min-h-11 items-center rounded-md bg-lime px-4 text-sm font-semibold text-ink"
                >
                  {t('nav.login')}
                </Link>
              )
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-12">
        <Outlet />
      </main>
    </div>
  );
}
