import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { MemberPicker } from '../../features/members/MemberPicker';

/** The "Progress" menu item: choose a member, open their results, body and notes. */
export function ProgressIndexPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader title={t('progress.open')} />
      <Card title={t('progress.chooseMember')} subtitle={t('progress.chooseMemberNote')}>
        <MemberPicker
          label={t('progress.chooseMember')}
          hideLabel
          placeholder={t('attendance.searchPlaceholder')}
          selected={null}
          autoFocus
          onSelect={(m) => m && void navigate(`/admin/members/${m.id}/progress`)}
        />
      </Card>
    </div>
  );
}
