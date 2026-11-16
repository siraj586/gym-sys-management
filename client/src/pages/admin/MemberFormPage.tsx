import { memberInputSchema, type MemberDetail } from '@calisthenics/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { apiFetch } from '../../api/http';
import { useApi } from '../../api/useApi';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { TextAreaField } from '../../components/ui/TextAreaField';
import { TextField } from '../../components/ui/TextField';
import { errorMessage } from '../../features/auth/errorMessage';

type FormValues = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  emergencyContact: string;
  healthNotes: string;
  coachNotes: string;
};

const EMPTY: FormValues = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  dateOfBirth: '',
  emergencyContact: '',
  healthNotes: '',
  coachNotes: '',
};

function toFormValues(member: MemberDetail): FormValues {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    phone: member.phone,
    email: member.email ?? '',
    dateOfBirth: member.dateOfBirth ?? '',
    emergencyContact: member.emergencyContact ?? '',
    healthNotes: member.healthNotes ?? '',
    coachNotes: member.coachNotes ?? '',
  };
}

/** /admin/members/new and /admin/members/:id/edit */
export function MemberFormPage() {
  const { id } = useParams();

  if (!id) return <MemberForm initial={EMPTY} />;
  return <EditMember id={id} />;
}

function EditMember({ id }: { id: string }) {
  const { t } = useTranslation();
  const { data, error } = useApi<MemberDetail>(`/members/${id}`);

  if (error) return <p className="text-danger">{errorMessage(error, t)}</p>;
  if (!data) return <p className="text-muted">{t('common.loading')}</p>;
  return <MemberForm id={id} initial={toFormValues(data)} />;
}

function MemberForm({ id, initial }: { id?: string; initial: FormValues }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    // The shared schema: the form checks exactly what the server will check.
    resolver: zodResolver(memberInputSchema),
    defaultValues: initial,
  });

  const fieldError = (name: keyof FormValues) => {
    const message = errors[name]?.message;
    return message && t(message);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const saved = await apiFetch<MemberDetail>(id ? `/members/${id}` : '/members', {
        method: id ? 'PUT' : 'POST',
        body: values,
      });
      void navigate(`/admin/members/${saved.id}`);
    } catch (error) {
      setFormError(errorMessage(error, t));
    }
  });

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <h1 className="font-display text-4xl font-bold uppercase">
        {t(id ? 'members.editTitle' : 'members.newTitle')}
      </h1>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t('auth.firstName')}
            error={fieldError('firstName')}
            {...register('firstName')}
          />
          <TextField
            label={t('auth.lastName')}
            error={fieldError('lastName')}
            {...register('lastName')}
          />
          <TextField
            label={t('auth.phone')}
            type="tel"
            dir="ltr"
            error={fieldError('phone')}
            {...register('phone')}
          />
          <TextField
            label={t('members.emailOptional')}
            type="email"
            dir="ltr"
            error={fieldError('email')}
            {...register('email')}
          />
          <TextField
            label={t('members.dateOfBirth')}
            type="date"
            error={fieldError('dateOfBirth')}
            {...register('dateOfBirth')}
          />
          <TextField
            label={t('members.emergencyContact')}
            hint={t('members.emergencyContactHint')}
            error={fieldError('emergencyContact')}
            {...register('emergencyContact')}
          />
        </div>
        <TextAreaField
          label={t('members.healthNotes')}
          hint={t('members.coachOnly')}
          error={fieldError('healthNotes')}
          {...register('healthNotes')}
        />
        <TextAreaField
          label={t('members.coachNotes')}
          hint={t('members.coachOnly')}
          error={fieldError('coachNotes')}
          {...register('coachNotes')}
        />
        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {t('common.save')}
          </Button>
          <ButtonLink variant="outline" to={id ? `/admin/members/${id}` : '/admin/members'}>
            {t('common.cancel')}
          </ButtonLink>
        </div>
      </form>
    </section>
  );
}
