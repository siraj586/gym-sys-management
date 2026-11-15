import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { SettingsProvider } from '../../features/settings/SettingsContext';

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center border-b-2 px-3 text-sm font-semibold ${isActive ? 'border-lime text-fg' : 'border-transparent text-muted hover:text-fg'}`;

/** The coach dashboard: its own section tabs above every /admin page. */
export function AdminLayout() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-8">
      <nav
        aria-label={t('admin.title')}
        className="-mt-6 flex gap-1 overflow-x-auto border-b border-line"
      >
        <NavLink to="/admin" end className={tab}>
          {t('admin.nav.overview')}
        </NavLink>
        <NavLink to="/admin/attendance" className={tab}>
          {t('admin.nav.attendance')}
        </NavLink>
        <NavLink to="/admin/members" className={tab}>
          {t('admin.nav.members')}
        </NavLink>
        <NavLink to="/admin/payments" className={tab}>
          {t('admin.nav.payments')}
        </NavLink>
        <NavLink to="/admin/plans" className={tab}>
          {t('admin.nav.plans')}
        </NavLink>
      </nav>
      <SettingsProvider>
        <Outlet />
      </SettingsProvider>
    </div>
  );
}
