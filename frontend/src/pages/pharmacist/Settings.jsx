import { useState, useEffect } from 'react';
import {
  Building2,
  ShieldCheck,
  Lock,
  KeyRound,
  Mail,
  Phone,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Save,
  Server,
  User,
  Percent,
  Receipt,
  Bell,
  Globe,
  SlidersHorizontal,
} from 'lucide-react';
import { getMyPharmacy, updateMyPharmacy, updateProfile } from '../../api/pharmacyApi';
import { useAuth } from '../../context/AuthContext';
import { SUPPORTED_LANGUAGES, applyPharmacySettings } from '../../i18n';
import { invalidateReceiptPharmacy } from './InvoiceReceiptModal';

const inputCls =
  'w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';
const disabledCls =
  'w-full px-3 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-500 dark:text-slate-400 cursor-not-allowed';
const cardCls = 'bg-white dark:bg-[#161c26] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-6 shadow-xs space-y-4';

const CURRENCIES = ['ETB', 'USD', 'EUR', 'KES', 'GBP'];

const Alert = ({ type, children }) =>
  type === 'success' ? (
    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
      <CheckCircle2 className="w-4 h-4 shrink-0" />
      <span>{children}</span>
    </div>
  ) : (
    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
      <AlertCircle className="w-4 h-4 shrink-0" />
      <span>{children}</span>
    </div>
  );

const CardHeader = ({ icon: Icon, color = 'emerald', title, subtitle }) => {
  const colors = {
    emerald: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400',
    cyan: 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400',
    indigo: 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400',
    amber: 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400',
  };
  return (
    <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${colors[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
};

const Toggle = ({ checked, onChange, label, hint }) => (
  <label className="flex items-start gap-3 cursor-pointer select-none">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
    <span>
      <span className="block font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {hint && <span className="block text-[10px] text-slate-400">{hint}</span>}
    </span>
  </label>
);

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
});

const Settings = () => {
  const { user, updateSession, can } = useAuth();
  const canManage = can('settings:manage');

  const [pharmacy, setPharmacy] = useState(null);
  const [loading, setLoading] = useState(true);

  // Pharmacy contact form
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [pharmacyLoading, setPharmacyLoading] = useState(false);
  const [pharmacySuccess, setPharmacySuccess] = useState('');
  const [pharmacyError, setPharmacyError] = useState('');

  // Pharmacy settings form (owner only)
  const [form, setForm] = useState(toForm());
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState('');
  const [settingsError, setSettingsError] = useState('');

  // User profile form
  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  useEffect(() => {
    const fetchPharmacy = async () => {
      try {
        const res = await getMyPharmacy();
        setPharmacy(res.pharmacy);
        setPhone(res.pharmacy.phone || '');
        setAddress(res.pharmacy.address || '');
        setForm(toForm(res.pharmacy.settings));
      } catch (err) {
        console.error('Failed to load pharmacy profile:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPharmacy();
  }, []);

  const setField = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const handleUpdatePharmacy = async (e) => {
    e.preventDefault();
    setPharmacySuccess('');
    setPharmacyError('');
    setPharmacyLoading(true);
    try {
      const res = await updateMyPharmacy({ phone, address });
      setPharmacy(res.pharmacy);
      invalidateReceiptPharmacy();
      setPharmacySuccess('Pharmacy contact details updated successfully.');
    } catch (err) {
      setPharmacyError(err.response?.data?.message || 'Failed to update pharmacy details');
    } finally {
      setPharmacyLoading(false);
    }
  };

  const handleUpdateSettings = async (e) => {
    e.preventDefault();
    setSettingsSuccess('');
    setSettingsError('');

    const days = form.expiryAlertDays
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number);
    if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 730)) {
      setSettingsError('Expiry alert days must be whole numbers between 1 and 730, separated by commas.');
      return;
    }
    const rate = Number(form.taxRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setSettingsError('Tax rate must be between 0 and 100.');
      return;
    }
    const maxDiscount = Number(form.maxDiscountPercent);
    if (!Number.isFinite(maxDiscount) || maxDiscount < 0 || maxDiscount > 100) {
      setSettingsError('Max discount must be between 0 and 100.');
      return;
    }

    setSettingsLoading(true);
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
        },
      });
      setPharmacy(res.pharmacy);
      setForm(toForm(res.pharmacy.settings));
      applyPharmacySettings(res.pharmacy.settings);
      invalidateReceiptPharmacy();
      setSettingsSuccess('Pharmacy settings saved.');
    } catch (err) {
      setSettingsError(err.response?.data?.message || 'Failed to save pharmacy settings');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileSuccess('');
    setProfileError('');

    if (newPassword && newPassword !== confirmPassword) {
      setProfileError('New passwords do not match');
      return;
    }
    if (newPassword && newPassword.length < 8) {
      setProfileError('New password must be at least 8 characters long');
      return;
    }

    setProfileLoading(true);
    try {
      const payload = { name };
      if (newPassword) {
        payload.currentPassword = currentPassword;
        payload.newPassword = newPassword;
      }
      const res = await updateProfile(payload);
      // A password change revokes old tokens; the response carries a new one.
      updateSession({ token: res.token, user: res.user });
      setProfileSuccess('Profile credentials updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setProfileError(err.response?.data?.message || 'Failed to update personal credentials');
    } finally {
      setProfileLoading(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading settings...</div>;
  }

  // Example of how the tax applies to a 100.00 line
  const previewRate = Number(form.taxRate) / 100 || 0;
  const previewTax = form.taxInclusive ? 100 - 100 / (1 + previewRate) : 100 * previewRate;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
              Administration & Profile
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            Pharmacy & Account Settings
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {canManage
              ? 'Manage your pharmacy profile, tax, receipts, alerts and your personal credentials'
              : 'Update your personal profile and password'}
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 self-start sm:self-auto">
          <Server className="w-3.5 h-3.5" />
          <span>Tenant ID: <span className="font-mono">{pharmacy?._id?.slice(-6)}</span></span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pharmacy Profile Information */}
        <div className={cardCls}>
          <CardHeader icon={Building2} title="Pharmacy Business Info" subtitle="Public details displayed on receipts and invoices" />
          {pharmacySuccess && <Alert type="success">{pharmacySuccess}</Alert>}
          {pharmacyError && <Alert type="error">{pharmacyError}</Alert>}

          <form onSubmit={handleUpdatePharmacy} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Pharmacy Name</label>
              <input type="text" disabled value={pharmacy?.name || ''} className={`${disabledCls} font-medium`} />
              <span className="text-[10px] text-slate-400 mt-1 block">Provisioned by System Admin</span>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Official License #</label>
              <input type="text" disabled value={pharmacy?.licenseNo || ''} className={`${disabledCls} font-mono`} />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Contact Phone Number *</label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  disabled={!canManage}
                  placeholder="+251 911 000 000"
                  className={`${canManage ? inputCls : disabledCls} pl-9 font-mono`}
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Physical Location / Address *</label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <textarea
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                  disabled={!canManage}
                  placeholder="Street address, City, Country"
                  className={`${canManage ? inputCls : disabledCls} pl-9`}
                />
              </div>
            </div>

            {canManage ? (
              <button
                type="submit"
                disabled={pharmacyLoading}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>{pharmacyLoading ? 'Saving...' : 'Save Business Info'}</span>
              </button>
            ) : (
              <p className="text-[11px] text-slate-400">Only the pharmacy owner can change these details.</p>
            )}
          </form>
        </div>

        {/* Personal Profile & Security (every role) */}
        <div className={cardCls}>
          <CardHeader icon={User} color="cyan" title="Your Account & Credentials" subtitle="Update your name or change your login password" />
          {profileSuccess && <Alert type="success">{profileSuccess}</Alert>}
          {profileError && <Alert type="error">{profileError}</Alert>}

          <form onSubmit={handleUpdateProfile} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Your Full Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Email (Username)</label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input type="email" disabled value={user?.email || ''} className={`${disabledCls} pl-9 font-medium`} />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <span className="font-semibold text-slate-800 dark:text-slate-200 block">Change Password (Optional)</span>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Current Password</label>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">New Password</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={8}
                    placeholder="At least 8 characters"
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">Confirm New Password</label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputCls} pl-9`}
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={profileLoading}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{profileLoading ? 'Updating...' : 'Update Account & Password'}</span>
            </button>
          </form>
        </div>
      </div>

      {/* Pharmacy settings: owner only */}
      {canManage && (
        <form onSubmit={handleUpdateSettings} className="space-y-6 text-xs">
          {settingsSuccess && <Alert type="success">{settingsSuccess}</Alert>}
          {settingsError && <Alert type="error">{settingsError}</Alert>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tax */}
            <div className={cardCls}>
              <CardHeader icon={Percent} color="indigo" title="Tax / VAT" subtitle="Calculated automatically at the POS" />
              <Toggle checked={form.taxEnabled} onChange={setField('taxEnabled')} label="Charge tax on sales" hint="Medicines marked tax-exempt are never taxed" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Tax name</label>
                  <input type="text" maxLength={30} value={form.taxName} onChange={(e) => setField('taxName')(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Rate (%)</label>
                  <input type="number" min={0} max={100} step="0.01" value={form.taxRate} onChange={(e) => setField('taxRate')(e.target.value)} className={`${inputCls} font-mono`} />
                </div>
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Pricing</label>
                <div className="flex gap-2">
                  {[
                    { v: false, l: 'Exclusive (added on top)' },
                    { v: true, l: 'Inclusive (in the price)' },
                  ].map((o) => (
                    <button
                      key={String(o.v)}
                      type="button"
                      onClick={() => setField('taxInclusive')(o.v)}
                      className={`flex-1 px-3 py-2 rounded-xl border transition cursor-pointer ${
                        form.taxInclusive === o.v
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Tax registration no. (TIN / VAT no.)</label>
                <input type="text" maxLength={50} value={form.taxRegistrationNo} onChange={(e) => setField('taxRegistrationNo')(e.target.value)} className={`${inputCls} font-mono`} placeholder="Printed on receipts" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3">
                Example: a line of 100.00 {form.taxInclusive ? 'contains' : 'adds'}{' '}
                <span className="font-mono font-bold">{form.taxEnabled ? previewTax.toFixed(2) : '0.00'}</span> {form.taxName || 'tax'}.
              </p>
            </div>

            {/* Receipts */}
            <div className={cardCls}>
              <CardHeader icon={Receipt} color="emerald" title="Receipts" subtitle="Printed receipt layout and footer" />
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Paper width</label>
                <div className="flex gap-2">
                  {['58mm', '80mm', 'A4'].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setField('receiptWidth')(w)}
                      className={`flex-1 px-3 py-2 rounded-xl border transition cursor-pointer font-mono ${
                        form.receiptWidth === w
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">58mm / 80mm for thermal printers, A4 for office printers</span>
              </div>
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Receipt footer</label>
                <textarea rows={3} maxLength={500} value={form.receiptFooter} onChange={(e) => setField('receiptFooter')(e.target.value)} className={inputCls} placeholder="e.g. Thank you! Medicines sold are not returnable after 7 days." />
              </div>
            </div>

            {/* Locale */}
            <div className={cardCls}>
              <CardHeader icon={Globe} color="cyan" title="Currency & Language" subtitle="Defaults for this pharmacy" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Currency</label>
                  <input
                    list="currency-options"
                    maxLength={3}
                    value={form.currency}
                    onChange={(e) => setField('currency')(e.target.value.toUpperCase())}
                    className={`${inputCls} font-mono uppercase`}
                  />
                  <datalist id="currency-options">
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Default language</label>
                  <select value={form.locale} onChange={(e) => setField('locale')(e.target.value)} className={inputCls}>
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* POS & alerts */}
            <div className={cardCls}>
              <CardHeader icon={Bell} color="amber" title="Alerts & POS Limits" subtitle="Expiry alerts, notifications and discounts" />
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">Expiry alert days</label>
                <input type="text" value={form.expiryAlertDays} onChange={(e) => setField('expiryAlertDays')(e.target.value)} className={`${inputCls} font-mono`} placeholder="30, 60, 90" />
                <span className="text-[10px] text-slate-400 mt-1 block">Warn this many days before a batch expires (comma separated)</span>
              </div>
              <div className="space-y-2">
                <Toggle checked={form.notifyEmail} onChange={setField('notifyEmail')} label="Email notifications" />
                <Toggle checked={form.notifySms} onChange={setField('notifySms')} label="SMS notifications" />
                <Toggle checked={form.notifyDailySummary} onChange={setField('notifyDailySummary')} label="Daily summary" hint="Sales, low stock and expiry digest" />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium mb-1">
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Max discount at POS (%)
                </label>
                <input type="number" min={0} max={100} step="0.5" value={form.maxDiscountPercent} onChange={(e) => setField('maxDiscountPercent')(e.target.value)} className={`${inputCls} font-mono`} />
                <span className="text-[10px] text-slate-400 mt-1 block">100 = no limit</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={settingsLoading}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{settingsLoading ? 'Saving...' : 'Save Pharmacy Settings'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Multi-Tenant Compliance Card */}
      <div className="bg-white dark:bg-[#161c26] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-xs text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="font-bold text-slate-900 dark:text-white mb-0.5">Multi-Tenant Architecture Active</h4>
          <p>
            Your database records are strictly partitioned under tenant scope:{' '}
            <code className="text-emerald-600 dark:text-emerald-400 font-mono font-semibold">{pharmacy?._id}</code>.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 text-xs font-semibold whitespace-nowrap">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Data Isolation Enforced</span>
        </div>
      </div>
    </div>
  );
};

export default Settings;
