import type { TFunction } from 'i18next';
import { ApiError } from '../../api/http';

/** Turns any thrown error into a translated sentence the user can act on. */
export function errorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ApiError) {
    return t(`errors.${error.code}`, { defaultValue: t('errors.UNKNOWN') });
  }
  // fetch() itself failed: no connection or the server is down.
  return t('errors.NETWORK');
}
