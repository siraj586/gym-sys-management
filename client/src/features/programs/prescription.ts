import type { ExerciseUnit } from '@calisthenics/shared';
import type { TFunction } from 'i18next';

/** "3 × 10 reps", "3 × 30 s", "4 × 20 kg" — in the interface language. */
export function prescription(
  t: TFunction,
  e: { sets: number; target: number; unit: ExerciseUnit },
): string {
  return t('programs.prescription', {
    sets: e.sets,
    target: t(`programs.unitValue.${e.unit}`, { count: e.target }),
  });
}

/** "90 s rest", or nothing when no rest is set. */
export function restText(t: TFunction, restSeconds: number | null): string | null {
  return restSeconds === null ? null : t('programs.rest', { count: restSeconds });
}
