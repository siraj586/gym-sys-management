import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../features/auth/AuthContext';
import { SettingsProvider, useSettings } from '../../features/settings/SettingsContext';
import { LanguageToggle } from '../ui/LanguageToggle';
import { Brand } from './Brand';

const ITEMS = [
  { to: '/admin', key: 'dashboard', end: true },
  { to: '/admin/members', key: 'members' },
  { to: '/admin/attendance', key: 'attendance' },
  { to: '/admin/payments', key: 'payments' },
  { to: '/admin/programs', key: 'programs' },
  { to: '/admin/progress', key: 'progress' },
  { to: '/admin/plans', key: 'plans' },
  { to: '/admin/settings', key: 'settings' },
] as const;

/** The coach dashboard: a sidebar beside every /admin page; a menu button on phones. */
export function AdminLayout() {
  return (
    <SettingsProvider>
      <AdminShell />
    </SettingsProvider>
  );
}

function AdminShell() {
  const { t } = useTranslation();
  const settings = useSettings();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // A link was followed: close the phone menu.
  const [shownPath, setShownPath] = useState(location.pathname);
  if (shownPath !== location.pathname) {
    setShownPath(location.pathname);
    setMenuOpen(false);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-ink md:flex-row">
      {/* Phone: a top bar with the menu button. */}
      <div className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2 md:hidden">
        <Brand {...settings} short className="text-xl" />
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="coach-nav"
          className="ms-auto min-h-11 rounded-md border border-line px-4 text-sm"
        >
          {t(menuOpen ? 'nav.closeMenu' : 'nav.menu')}
        </button>
      </div>

      <nav
        id="coach-nav"
        aria-label={t('admin.title')}
        className={`${menuOpen ? 'flex' : 'hidden'} flex-col gap-1.5 border-line bg-surface px-3.5 py-6 md:sticky md:top-0 md:flex md:h-dvh md:w-[220px] md:shrink-0 md:border-e`}
      >
        <div className="hidden px-2.5 pb-4 md:block">
          <Brand {...settings} short className="text-xl" />
        </div>
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={'end' in item}
            className={({ isActive }) =>
              `flex min-h-11 items-center rounded-md px-3 text-sm ${
                isActive ? 'bg-lime font-semibold text-ink' : 'text-soft hover:bg-surface-2 hover:text-fg'
              }`
            }
          >
            {t(`admin.nav.${item.key}`)}
          </NavLink>
        ))}
        <AccountFooter />
      </nav>

      <main className="min-w-0 flex-1 px-4 py-7 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}

function AccountFooter() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  return (
    <div className="mt-auto flex flex-col items-start gap-2.5 border-t border-line px-2.5 pt-3.5">
      <LanguageToggle />
      <span className="text-[13px] text-muted">{t('admin.signedInAs')}</span>
      <button
        type="button"
        onClick={() => void logout()}
        className="min-h-11 text-[13px] text-soft underline-offset-2 hover:text-fg hover:underline"
      >
        {t('nav.logout')}
      </button>
    </div>
  );
}
