import { loginSchema, type LoginInput } from '@calisthenics/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from './AuthContext';
import { errorMessage } from './errorMessage';

export function LoginForm() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (input) => {
    setFormError(null);
    try {
      await login(input); // the login page redirects once the user is signed in
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <TextField
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        error={errors.email?.message && t(errors.email.message)}
        {...register('email')}
      />
      <TextField
        label={t('auth.password')}
        type="password"
        autoComplete="current-password"
        error={errors.password?.message && t(errors.password.message)}
        {...register('password')}
      />
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {t('auth.submitLogin')}
      </Button>
    </form>
  );
}
