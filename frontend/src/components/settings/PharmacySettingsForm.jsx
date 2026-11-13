import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { updateMyPharmacy } from '../../api/pharmacyApi';
import { applyPharmacySettings } from '../../i18n';
import { invalidateReceiptPharmacy } from '../../pages/pharmacist/InvoiceReceiptModal';
import { Alert } from './SettingsUi';
import { TaxSection, ReceiptsSection, LocaleSection, AlertsSection } from './PharmacySettingsSections';

const toForm = (settings = {}) => ({
  taxEnabled: Boolean(settings.tax?.enabled),
  taxName: settings.tax?.name || 'VAT',
  taxRate: settings.tax?.rate ?? 15,
  taxInclusive: Boolean(settings.tax?.inclusive),
  taxRegistrationNo: settings.tax?.registrationNo || '',
  currency: settings.currency || 'ETB',
  locale: settings.locale || 'en',
  receiptFooter: settings.receiptFooter || '',
  receiptWidth: settings.receiptWidth || '80mm',
  expiryAlertDays: (settings.expiryAlertDays || [30, 60, 90]).join(', '),
  notifyEmail: Boolean(settings.notify?.email),
  notifySms: Boolean(settings.notify?.sms),
  notifyDailySummary: Boolean(settings.notify?.dailySummary),
  maxDiscountPercent: settings.maxDiscountPercent ?? 100,
  // POS (#7): missing = required in the POS UI; saving persists it for server-side enforcement
  requireShift: settings.requireShift !== false,
});

/** Owner-only pharmacy settings: tax, receipts, locale, alerts & POS limits. */
const PharmacySettingsForm = ({ pharmacy, onPharmacyChange }) => {
  const { t } = useTranslation('settings');
  const [form, setForm] = useState(() => toForm(pharmacy?.settings));
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const setField = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess('');
    setError('');

    const days = form.expiryAlertDays
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number);
    if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 730)) {
      setError(t('validation.expiryDays'));
      return;
    }
    const rate = Number(form.taxRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setError(t('validation.taxRate'));
      return;
    }
    const maxDiscount = Number(form.maxDiscountPercent);
    if (!Number.isFinite(maxDiscount) || maxDiscount < 0 || maxDiscount > 100) {
      setError(t('validation.maxDiscount'));
      return;
    }

    setSaving(true);
    try {
      const res = await updateMyPharmacy({
        settings: {
          tax: {
            enabled: form.taxEnabled,
            name: form.taxName.trim() || 'VAT',
            rate,
            inclusive: form.taxInclusive,
            registrationNo: form.taxRegistrationNo,
          },
          currency: form.currency,
          locale: form.locale,
          receiptFooter: form.receiptFooter,
          receiptWidth: form.receiptWidth,
          expiryAlertDays: days,
          notify: { email: form.notifyEmail, sms: form.notifySms, dailySummary: form.notifyDailySummary },
          maxDiscountPercent: maxDiscount,
          requireShift: form.requireShift,
        },
      });
      onPharmacyChange(res.pharmacy);
      setForm(toForm(res.pharmacy.settings));
      applyPharmacySettings(res.pharmacy.settings);
      invalidateReceiptPharmacy();
      setSuccess(t('pharmacySettings.saved'));
    } catch (err) {
      setError(err.response?.data?.message || t('pharmacySettings.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-xs">
      {success && <Alert type="success">{success}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TaxSection form={form} setField={setField} />
        <ReceiptsSection form={form} setField={setField} />
        <LocaleSection form={form} setField={setField} />
        <AlertsSection form={form} setField={setField} />
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? t('saving') : t('pharmacySettings.save')}</span>
        </button>
      </div>
    </form>
  );
};

export default PharmacySettingsForm;
