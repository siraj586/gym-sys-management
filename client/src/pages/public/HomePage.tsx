import { contactInputSchema, type PublicSite } from '@calisthenics/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { Brand } from '../../components/layout/Brand';
import { Button } from '../../components/ui/Button';
import { LanguageToggle } from '../../components/ui/LanguageToggle';
import { TextAreaField } from '../../components/ui/TextAreaField';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../features/auth/AuthContext';
import { errorMessage } from '../../features/auth/errorMessage';
import { formatMoney } from '../../lib/format';
import { homePathFor } from '../../routes/guards';

const SKILLS = ['pullUps', 'pushUps', 'dips', 'muscleUp', 'frontLever', 'handstand'] as const;

const sectionTitle = 'font-display text-[40px] font-bold uppercase leading-none';
const band = 'border-y border-line bg-surface';
const inner = 'mx-auto max-w-[1120px] px-6';

/**
 * The public website: hero, the coach, how training works, the plans on sale,
 * the gallery and the contact form. Sections without content stay hidden, so
 * visitors never see an empty block.
 */
export function HomePage() {
  const { t } = useTranslation();
  const { data: site } = useApi<PublicSite>('/public/site');

  const hasAbout = Boolean(site?.coachBio);
  const hasPlans = Boolean(site && site.plans.length > 0);
  const hasGallery = Boolean(site && site.gallery.length > 0);
  const links = [
    { href: '#top', key: 'home' },
    hasAbout && { href: '#about', key: 'about' },
    { href: '#programs', key: 'programs' },
    hasPlans && { href: '#plans', key: 'plans' },
    hasGallery && { href: '#gallery', key: 'gallery' },
    { href: '#contact', key: 'contact' },
  ].filter(Boolean) as { href: string; key: string }[];

  return (
    <div className="min-h-dvh bg-ink text-[15px] leading-normal">
      <SiteHeader site={site ?? null} links={links} />

      <section id="top" className="scroll-mt-20">
        <div className={`${inner} flex flex-wrap items-center gap-12 py-16 sm:py-[72px]`}>
          <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-5">
            <p className="text-xs uppercase tracking-[0.14em] text-lime">
              {site ? t('site.eyebrow', { gym: site.businessName }) : t('site.eyebrowShort')}
            </p>
            <h1 className="font-display text-6xl font-bold uppercase leading-[0.95] sm:text-[84px]">
              {t('home.title')}
            </h1>
            <p className="max-w-[480px] text-lg text-muted">{t('home.subtitle')}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/login?tab=register"
                className="rounded-md bg-lime px-[26px] py-3.5 font-semibold text-ink hover:brightness-110"
              >
                {t('site.join')}
              </Link>
              {hasPlans && (
                <a
                  href="#plans"
                  className="rounded-md border border-fg px-[26px] py-3.5 font-semibold hover:border-lime hover:text-lime"
                >
                  {t('site.seePlans')}
                </a>
              )}
            </div>
          </div>
          {site?.gallery[0] && (
            <img
              src={site.gallery[0].url}
              alt={site.gallery[0].caption ?? ''}
              className="h-[440px] min-w-0 flex-[1_1_380px] rounded-lg border border-line object-cover"
            />
          )}
        </div>
      </section>

      {hasAbout && site && (
        <section id="about" className={`${band} scroll-mt-20`}>
          <div className={`${inner} flex flex-col gap-3 py-14`}>
            <h2 className={sectionTitle}>{t('site.aboutTitle')}</h2>
            {site.coachName && <p className="text-lg font-semibold">{site.coachName}</p>}
            <p className="max-w-[620px] whitespace-pre-wrap text-muted">{site.coachBio}</p>
          </div>
        </section>
      )}

      <section id="programs" className="scroll-mt-20">
        <div className={`${inner} flex flex-col gap-7 py-16`}>
          <h2 className={sectionTitle}>{t('site.programsTitle')}</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5">
            <article className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-7">
              <p className="text-xs uppercase tracking-[0.14em] text-lime">
                {t('site.openEyebrow')}
              </p>
              <h3 className="text-[22px] font-semibold">{t('site.openTitle')}</h3>
              <p className="text-muted">
                {t('site.openText')}
                {site?.openingHours && ` ${t('site.openingHours', { hours: site.openingHours })}`}
              </p>
              {hasPlans && (
                <a href="#plans" className="mt-auto font-semibold text-lime">
                  {t('site.seeMembership')}
                </a>
              )}
            </article>
            <article className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-7">
              <p className="text-xs uppercase tracking-[0.14em] text-lime">
                {t('site.ownEyebrow')}
              </p>
              <h3 className="text-[22px] font-semibold">{t('site.ownTitle')}</h3>
              <p className="text-muted">{t('site.ownText')}</p>
              <Link to="/login?tab=register" className="mt-auto font-semibold text-lime">
                {t('site.createAccount')}
              </Link>
            </article>
          </div>
          <ul className="flex flex-wrap gap-2.5" aria-label={t('site.skills')}>
            {SKILLS.map((s) => (
              <li
                key={s}
                className="rounded-full border border-line px-4 py-2 text-[13px] text-soft"
              >
                {t(`site.skill.${s}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {hasPlans && site && <Plans site={site} />}

      {hasGallery && site && (
        <section id="gallery" className="scroll-mt-20">
          <div className={`${inner} flex flex-col gap-7 py-16`}>
            <h2 className={sectionTitle}>{t('site.galleryTitle')}</h2>
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              {site.gallery.map((img) => (
                <li key={img.id} className="flex flex-col gap-2">
                  <img
                    src={img.url}
                    alt={img.caption ?? ''}
                    loading="lazy"
                    className="h-[220px] w-full rounded-lg border border-line object-cover"
                  />
                  {img.caption && <span className="text-sm text-muted">{img.caption}</span>}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <Contact site={site ?? null} />
    </div>
  );
}

function SiteHeader({
  site,
  links,
}: {
  site: PublicSite | null;
  links: { href: string; key: string }[];
}) {
  const { t } = useTranslation();
  const { state } = useAuth();
  const user = state.status === 'authenticated' ? state.user : null;

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ink/95 backdrop-blur">
      <div className={`${inner} flex flex-wrap items-center gap-x-6 gap-y-2 py-[18px]`}>
        <a href="#top">
          <Brand
            coachName={site?.coachName ?? null}
            businessName={site?.businessName ?? t('app.name')}
          />
        </a>
        <nav
          aria-label={t('site.sections')}
          className="order-last flex w-full flex-wrap gap-x-5 gap-y-1 text-sm md:order-none md:ms-auto md:w-auto"
        >
          {links.map((l) => (
            <a key={l.key} href={l.href} className="flex min-h-11 items-center hover:text-lime">
              {t(`site.nav.${l.key}`)}
            </a>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-3 md:ms-0">
          <LanguageToggle />
          <Link
            to={user ? homePathFor(user.role) : '/login'}
            className="flex min-h-11 items-center rounded-md bg-lime px-5 text-sm font-semibold text-ink hover:brightness-110"
          >
            {t(user ? 'site.myAccount' : 'nav.login')}
          </Link>
        </div>
      </div>
    </header>
  );
}

function Plans({ site }: { site: PublicSite }) {
  const { t, i18n } = useTranslation();
  return (
    <section id="plans" className={`${band} scroll-mt-20`}>
      <div className={`${inner} flex flex-col gap-7 py-16`}>
        <div className="flex flex-col gap-2">
          <h2 className={sectionTitle}>{t('site.plansTitle')}</h2>
          <p className="text-muted">{t('site.plansNote')}</p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),440px))] gap-5">
          {site.plans.map((p) => (
            <article
              key={p.id}
              className="flex flex-col gap-2.5 rounded-lg border border-line bg-ink p-6"
            >
              <p className="text-xs uppercase tracking-[0.14em] text-muted">
                {t('site.membershipFor', { count: p.durationMonths })}
              </p>
              <h3 className="text-xl font-semibold">{p.name}</h3>
              <p className="font-display text-[40px] font-bold leading-none text-lime">
                {formatMoney(p.priceCents, site.currency, i18n.language)}
                <span className="ms-2 text-xl text-soft">
                  {t('site.perMonths', { count: p.durationMonths })}
                </span>
              </p>
              <p className="text-sm text-muted">{p.description ?? t('site.planDetail')}</p>
              <Link
                to="/login?tab=register"
                className="mt-2 rounded-md border border-fg px-[18px] py-3 text-center font-semibold hover:border-lime hover:text-lime"
              >
                {t('site.join')}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact({ site }: { site: PublicSite | null }) {
  const { t } = useTranslation();
  const [values, setValues] = useState({ name: '', contact: '', message: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setStatus(null);
    const parsed = contactInputSchema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= t(issue.message);
      setErrors(next);
      return;
    }
    setErrors({});
    setSending(true);
    try {
      await apiFetch('/public/contact', { method: 'POST', body: parsed.data });
      setValues({ name: '', contact: '', message: '' });
      setStatus({ ok: true, text: t('site.messageSent') });
    } catch (err) {
      setStatus({ ok: false, text: errorMessage(err, t) });
    } finally {
      setSending(false);
    }
  };

  const instagram = site?.instagram?.replace(/^@/, '');
  return (
    <section id="contact" className="scroll-mt-20 border-t border-line bg-surface">
      <div className={`${inner} flex flex-wrap gap-12 py-16`}>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 text-muted">
          <h2 className={`${sectionTitle} text-fg`}>{t('site.contactTitle')}</h2>
          {site?.address && <p className="whitespace-pre-wrap">{site.address}</p>}
          {site?.phone && (
            <a
              href={`tel:${site.phone.replace(/\s/g, '')}`}
              dir="ltr"
              className="self-start hover:text-lime"
            >
              {site.phone}
            </a>
          )}
          {instagram && (
            <a
              href={`https://instagram.com/${encodeURIComponent(instagram)}`}
              target="_blank"
              rel="noreferrer"
              dir="ltr"
              className="self-start hover:text-lime"
            >
              @{instagram}
            </a>
          )}
          {site?.openingHours && <p>{t('site.openingHours', { hours: site.openingHours })}</p>}
        </div>
        <form
          onSubmit={(e) => void submit(e)}
          noValidate
          className="flex min-w-0 flex-[1_1_420px] flex-col gap-3.5"
        >
          <TextField
            label={t('site.name')}
            autoComplete="name"
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
            error={errors.name}
            className="!bg-ink"
          />
          <TextField
            label={t('site.emailOrPhone')}
            value={values.contact}
            onChange={(e) => setValues({ ...values, contact: e.target.value })}
            error={errors.contact}
            className="!bg-ink"
          />
          <TextAreaField
            label={t('site.message')}
            rows={4}
            value={values.message}
            onChange={(e) => setValues({ ...values, message: e.target.value })}
            error={errors.message}
            className="!bg-ink"
          />
          {status && (
            <p role="status" className={`text-sm ${status.ok ? 'text-lime' : 'text-danger'}`}>
              {status.text}
            </p>
          )}
          <Button
            type="submit"
            disabled={sending}
            className="self-start !px-[26px] !py-3.5 !text-[15px]"
          >
            {t('site.send')}
          </Button>
        </form>
      </div>
      <div className="border-t border-line">
        <p className={`${inner} py-5 text-[13px] text-muted`}>
          {site
            ? [site.coachName && `${site.coachName} ${t('brand.suffix')}`, site.businessName]
                .filter(Boolean)
                .join(' · ')
            : t('app.name')}
        </p>
      </div>
    </section>
  );
}
