import type { GymSettings } from '@calisthenics/shared';
import { createContext, useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useApi } from '../../api/useApi';
import { errorMessage } from '../auth/errorMessage';

const SettingsContext = createContext<GymSettings | null>(null);

/** Loads the gym settings once for a signed-in area; children render when they are ready. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { data, error } = useApi<GymSettings>('/settings');

  if (error) return <p className="text-danger">{errorMessage(error, t)}</p>;
  if (!data) return <p className="text-muted">{t('common.loading')}</p>;
  return <SettingsContext value={data}>{children}</SettingsContext>;
}

export function useSettings(): GymSettings {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error('useSettings must be used inside SettingsProvider');
  return settings;
}
