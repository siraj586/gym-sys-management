import { registerSchema } from '@calisthenics/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { ApiError } from '../../api/http';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from './AuthContext';
import { errorMessage } from './errorMessage';

// Same rules as the server, plus the confirmation field that only the form needs.
const formSchema = registerSchema
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'validation.passwordMismatch',
  });
type FormValues = z.infer<typeof formSchema>;

export function RegisterForm() {
  const { t } = useTranslation();
  const { register: createAccount } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema) });

  const fieldError = (name: keyof FormValues) => {
    const message = errors[name]?.message;
    return message && t(message);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      // Parsing with the shared schema drops confirmPassword: the API never needs it.
      await createAccount(registerSchema.parse(values));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_TAKEN') {
        setError('email', { message: 'errors.EMAIL_TAKEN' });
      } else {
        setFormError(errorMessage(error, t));
      }
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('auth.firstName')}
          autoComplete="given-name"
          error={fieldError('firstName')}
          {...register('firstName')}
        />
        <TextField
          label={t('auth.lastName')}
          autoComplete="family-name"
          error={fieldError('lastName')}
          {...register('lastName')}
        />
      </div>
      <TextField
        label={t('auth.phone')}
        type="tel"
        autoComplete="tel"
        dir="ltr"
        error={fieldError('phone')}
        {...register('phone')}
      />
      <TextField
        label={t('auth.email')}
        type="email"
        autoComplete="email"
        error={fieldError('email')}
        {...register('email')}
      />
      <TextField
        label={t('auth.password')}
        type="password"
        autoComplete="new-password"
        hint={t('auth.passwordHint')}
        error={fieldError('password')}
        {...register('password')}
      />
      <TextField
        label={t('auth.confirmPassword')}
        type="password"
        autoComplete="new-password"
        error={fieldError('confirmPassword')}
        {...register('confirmPassword')}
      />
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={isSubmitting}>
        {t('auth.submitRegister')}
      </Button>
    </form>
  );
}
