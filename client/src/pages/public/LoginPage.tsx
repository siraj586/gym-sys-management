import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../../features/auth/AuthContext';
import { LoginForm } from '../../features/auth/LoginForm';
import { RegisterForm } from '../../features/auth/RegisterForm';
import { homePathFor } from '../../routes/guards';

type Tab = 'login' | 'register';

export function LoginPage() {
  const { t } = useTranslation();
  const { state } = useAuth();
  const location = useLocation();
  const [tab, setTab] = useState<Tab>('login');

  // Already signed in (or just signed in): go to the page they came for, or their home.
  if (state.status === 'authenticated') {
    const home = homePathFor(state.user.role);
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from?.startsWith(home) ? from : home} replace />;
  }

  const tabClass = (name: Tab) =>
    `min-h-11 px-5 text-sm font-semibold ${tab === name ? 'bg-lime text-ink' : 'text-fg'}`;

  return (
    <div className="grid gap-10 md:grid-cols-2">
      <section className="flex flex-col gap-4">
        <h1 className="font-display text-5xl font-bold uppercase leading-none">
          {t('auth.pitchTitle')}
        </h1>
        <p className="text-muted">{t('auth.pitchText')}</p>
        <p className="rounded-lg border border-line p-4 text-sm text-soft">{t('auth.newHere')}</p>
      </section>

      <section className="flex max-w-md flex-col gap-6">
        <div
          role="tablist"
          className="flex self-start overflow-hidden rounded-lg border border-line"
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
        {tab === 'login' ? <LoginForm /> : <RegisterForm />}
      </section>
    </div>
  );
}
