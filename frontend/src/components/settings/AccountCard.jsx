import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Mail, KeyRound, Lock, Save } from 'lucide-react';
import { updateProfile } from '../../api/pharmacyApi';
import { useAuth } from '../../context/AuthContext';
import { Alert, CardHeader } from './SettingsUi';
import { inputCls, disabledCls, cardCls, labelCls, mutedLabelCls } from './settingsStyles';

const PasswordField = ({ icon: Icon, label, value, onChange, ...rest }) => (
  <div>
    <label className={mutedLabelCls}>{label}</label>
    <div className="relative">
      <Icon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
      <input type="password" value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} pl-9`} {...rest} />
    </div>
  </div>
);

/** Personal profile & password (every role). */
const AccountCard = () => {
  const { t } = useTranslation('settings');
  const { user, updateSession } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess('');
    setError('');

    if (newPassword && newPassword !== confirmPassword) {
      setError(t('account.mismatch'));
      return;
    }
    if (newPassword && newPassword.length < 8) {
      setError(t('account.tooShort'));
      return;
    }

    setSaving(true);
    try {
      const payload = { name };
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }
      const res = await updateProfile(payload);
      // A password change revokes old tokens; the response carries a new one.
      updateSession({ token: res.token, user: res.user });
      setSuccess(t('account.updated'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.message || t('account.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cardCls}>
      <CardHeader icon={User} color="cyan" title={t('account.title')} subtitle={t('account.subtitle')} />
      {success && <Alert type="success">{success}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label className={labelCls}>{t('account.fullName')}</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} />
        </div>

        <div>
          <label className={mutedLabelCls}>{t('account.email')}</label>
          <div className="relative">
            <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input type="email" disabled value={user?.email || ''} className={`${disabledCls} pl-9 font-medium`} />
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <span className="font-semibold text-slate-800 dark:text-slate-200 block">{t('account.changePassword')}</span>

          <PasswordField
            icon={KeyRound}
            label={t('account.currentPassword')}
            value={currentPassword}
            onChange={setCurrentPassword}
            placeholder="••••••••"
          />
          <PasswordField
            icon={Lock}
            label={t('account.newPassword')}
            value={newPassword}
            onChange={setNewPassword}
            minLength={8}
            placeholder={t('account.newPasswordPlaceholder')}
          />
          <PasswordField
            icon={Lock}
            label={t('account.confirmPassword')}
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? t('updating') : t('account.submit')}</span>
        </button>
      </form>
    </div>
  );
};

export default AccountCard;
