import type { TFunction } from 'i18next';
import { apiFetch } from '../../api/http';

/**
 * Deletes a member for good after the coach types their first name, so a
 * slip of the mouse cannot erase someone's whole history and payments.
 * Returns true when the member was deleted.
 */
export async function deleteMemberForGood(
  t: TFunction,
  member: { id: string; firstName: string; lastName: string },
): Promise<boolean> {
  const typed = window.prompt(
    t('members.confirmDelete', {
      name: `${member.firstName} ${member.lastName}`,
      first: member.firstName,
    }),
  );
  if (typed === null) return false;
  if (typed.trim().toLowerCase() !== member.firstName.trim().toLowerCase()) {
    window.alert(t('members.deleteNameMismatch'));
    return false;
  }
  await apiFetch(`/members/${member.id}`, { method: 'DELETE' });
  return true;
}
