import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Phone, MapPin, Save } from 'lucide-react';
import { updateMyPharmacy } from '../../api/pharmacyApi';
import { invalidateReceiptPharmacy } from '../../pages/pharmacist/InvoiceReceiptModal';
import { Alert, CardHeader } from './SettingsUi';
import { inputCls, disabledCls, cardCls, labelCls, mutedLabelCls, hintCls } from './settingsStyles';

/** Pharmacy name / license (read-only) and contact details (owner editable). */
const BusinessInfoCard = ({ pharmacy, onPharmacyChange, canManage }) => {
  const { t } = useTranslation('settings');
  const [phone, setPhone] = useState(pharmacy?.phone || '');
  const [address, setAddress] = useState(pharmacy?.address || '');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess('');
    setError('');
    setSaving(true);
    try {
      const res = await updateMyPharmacy({ phone, address });
      onPharmacyChange(res.pharmacy);
      invalidateReceiptPharmacy();
      setSuccess(t('business.updated'));
    } catch (err) {
      setError(err.response?.data?.message || t('business.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  const editableCls = canManage ? inputCls : disabledCls;

  return (
    <div className={cardCls}>
      <CardHeader icon={Building2} title={t('business.title')} subtitle={t('business.subtitle')} />
      {success && <Alert type="success">{success}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div>
          <label className={mutedLabelCls}>{t('business.name')}</label>
          <input type="text" disabled value={pharmacy?.name || ''} className={`${disabledCls} font-medium`} />
          <span className={hintCls}>{t('business.provisioned')}</span>
        </div>

        <div>
          <label className={mutedLabelCls}>{t('business.license')}</label>
          <input type="text" disabled value={pharmacy?.licenseNo || ''} className={`${disabledCls} font-mono`} />
        </div>

        <div>
          <label className={labelCls}>{t('business.phone')}</label>
          <div className="relative">
            <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              disabled={!canManage}
              placeholder="+251 911 000 000"
              className={`${editableCls} pl-9 font-mono`}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>{t('business.address')}</label>
          <div className="relative">
            <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <textarea
              rows={3}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              disabled={!canManage}
              placeholder={t('business.addressPlaceholder')}
              className={`${editableCls} pl-9`}
            />
          </div>
        </div>

        {canManage ? (
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? t('saving') : t('business.save')}</span>
          </button>
        ) : (
          <p className="text-[11px] text-slate-400">{t('business.ownerOnly')}</p>
        )}
      </form>
    </div>
  );
};

export default BusinessInfoCard;
