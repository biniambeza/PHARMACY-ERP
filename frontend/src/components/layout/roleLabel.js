import { ROLE_LABELS } from '../../config/permissions';

// Translated membership role label for the pharmacy chrome (sidebar footer, top bar).
// Accepts a role key ('owner') or, for callers that still pass it, the English label from
// ROLE_LABELS ('Owner' / the 'Staff' fallback) and maps it back to its key first.
export const translateRoleLabel = (t, roleOrLabel) => {
  if (!roleOrLabel) return t('ui:layout.staffRole');
  const key = ROLE_LABELS[roleOrLabel]
    ? roleOrLabel
    : Object.keys(ROLE_LABELS).find((k) => ROLE_LABELS[k] === roleOrLabel);
  if (key) return t(`staff:roles.${key}`, { defaultValue: ROLE_LABELS[key] });
  if (roleOrLabel === 'Staff') return t('ui:layout.staffRole');
  return roleOrLabel;
};
