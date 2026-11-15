import { useTranslation } from 'react-i18next';

/**
 * "[COACH NAME] Calisthenics" with the second word in the accent. Without a
 * coach name in the settings, the gym's name stands alone.
 */
export function Brand({
  coachName,
  businessName,
  short = false,
  className = 'text-2xl',
}: {
  coachName: string | null;
  businessName: string;
  /** "Cali" instead of "Calisthenics", for the narrow sidebar and portal header. */
  short?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span className={`font-display font-bold uppercase tracking-wide ${className}`}>
      {coachName ? (
        <>
          {coachName}{' '}
          <span className="text-lime">{t(short ? 'brand.short' : 'brand.suffix')}</span>
        </>
      ) : (
        businessName
      )}
    </span>
  );
}
