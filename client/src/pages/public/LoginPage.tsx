import type { PublicSite } from '@calisthenics/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';
import { useApi } from '../../api/useApi';
import { Brand } from '../../components/layout/Brand';
import { LanguageToggle } from '../../components/ui/LanguageToggle';
import { useAuth } from '../../features/auth/AuthContext';
import { LoginForm } from '../../features/auth/LoginForm';
import { RegisterForm } from '../../features/auth/RegisterForm';
import { homePathFor } from '../../routes/guards';

type Tab = 'login' | 'register';

export function LoginPage() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'register' ? 'register' : 'login');
  const { data: site } = useApi<PublicSite>('/public/site');

  // Already signed in (or just signed in): go to the page they came for, or their home.
  if (state.status === 'authenticated') {
    const home = homePathFor(state.user.role);
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from?.startsWith(home) ? from : home} replace />;
  }

  const tabClass = (name: Tab) =>
    `min-h-11 px-[22px] text-sm font-semibold ${tab === name ? 'bg-lime text-ink' : 'text-fg hover:bg-surface-2'}`;

  return (
    <div className="flex min-h-dvh flex-wrap bg-ink text-[15px]">
      <section className="flex min-w-0 flex-[1_1_420px] flex-col justify-center gap-5 border-line bg-surface px-6 py-12 sm:px-12 md:border-e">
        <Link to="/" className="self-start">
          <Brand
            coachName={site?.coachName ?? null}
            businessName={site?.businessName ?? t('app.name')}
          />
        </Link>
        <h1 className="font-display text-5xl font-bold uppercase leading-[0.95] sm:text-[64px]">
          {t('auth.pitchTitle')}
        </h1>
        <p className="max-w-[420px] text-muted">{t('auth.pitchText')}</p>
        <p className="max-w-[420px] rounded-lg border border-line p-4 text-sm text-soft">
          {t('auth.newHere')}
        </p>
      </section>

      <section className="flex min-w-0 flex-[1_1_420px] flex-col justify-center gap-8 px-6 py-12 sm:px-12">
        <div className="flex max-w-[440px] items-center gap-3">
          <div
            role="tablist"
            aria-label={t('auth.account')}
            className="flex overflow-hidden rounded-lg border border-line"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'login'}
              className={tabClass('login')}
              onClick={() => setTab('login')}
            >
              {t('auth.tabLogin')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'register'}
              className={tabClass('register')}
              onClick={() => setTab('register')}
            >
              {t('auth.tabRegister')}
            </button>
          </div>
          <LanguageToggle className="ms-auto" />
        </div>
        <div className="max-w-[440px]">{tab === 'login' ? <LoginForm /> : <RegisterForm />}</div>
        <Link to="/" className="self-start text-sm text-muted hover:text-fg">
          {t('auth.backToSite')}
        </Link>
      </section>
    </div>
  );
}
