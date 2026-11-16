import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { SettingsProvider, useSettings } from '../../features/settings/SettingsContext';
import { LanguageToggle } from '../ui/LanguageToggle';
import { Brand } from './Brand';

const TOP = [
  { to: '/portal', key: 'home', end: true },
  { to: '/portal/program', key: 'program' },
  { to: '/portal/attendance', key: 'attendance' },
  { to: '/portal/progress', key: 'progress' },
  { to: '/portal/profile', key: 'profile' },
] as const;

// The phone bar has room for four: attendance is on the home page there.
const BOTTOM = TOP.filter((item) => item.key !== 'attendance');

/** The client portal: a header with tabs; on phones, a bottom bar instead. */
export function PortalLayout() {
  return (
    <SettingsProvider>
      <PortalShell />
    </SettingsProvider>
  );
}

function PortalShell() {
  const { t } = useTranslation();
  const settings = useSettings();

  return (
    <div className="min-h-dvh bg-ink pb-16 md:pb-0">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-5 px-4 py-3 sm:px-6">
          <Brand {...settings} short className="text-xl" />
          <nav aria-label={t('portal.title')} className="ms-auto hidden flex-wrap gap-1 md:flex">
            {TOP.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={'end' in item}
                className={({ isActive }) =>
                  `flex min-h-11 items-center rounded-md px-3.5 text-sm ${
                    isActive ? 'bg-lime font-semibold text-ink' : 'text-soft hover:text-fg'
                  }`
                }
              >
                {t(`portal.nav.${item.key}`)}
              </NavLink>
            ))}
          </nav>
          <LanguageToggle className="ms-auto md:ms-0" />
        </div>
      </header>

      <main className="mx-auto flex max-w-[1120px] flex-col gap-5 px-4 py-7 sm:px-6">
        <Outlet />
      </main>

      <nav
        aria-label={t('portal.mainNav')}
        className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-line bg-surface md:hidden"
      >
        {BOTTOM.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={'end' in item}
            className={({ isActive }) =>
              `flex min-h-14 items-center justify-center border-t-2 text-sm ${
                isActive ? 'border-lime font-semibold text-lime' : 'border-transparent text-soft'
              }`
            }
          >
            {t(`portal.nav.${item.key}`)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
