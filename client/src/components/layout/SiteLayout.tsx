import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router';
import { LanguageToggle } from '../ui/LanguageToggle';

/**
 * Header + page area shared by every route for now. The coach dashboard and
 * the client portal get their own layouts when those phases are built.
 */
export function SiteLayout() {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/" className="font-display text-2xl font-bold uppercase tracking-wide">
            {t('app.name')}
          </Link>
          {/* ms-auto = margin at the "start" side, so it flips correctly in RTL. */}
          <nav className="ms-auto flex items-center gap-2">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex min-h-11 items-center px-3 text-sm ${isActive ? 'text-lime' : 'text-soft hover:text-fg'}`
              }
            >
              {t('nav.home')}
            </NavLink>
            <LanguageToggle />
            <Link
              to="/login"
              className="flex min-h-11 items-center rounded-md bg-lime px-4 text-sm font-semibold text-ink"
            >
              {t('nav.login')}
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-12">
        <Outlet />
      </main>
    </div>
  );
}
