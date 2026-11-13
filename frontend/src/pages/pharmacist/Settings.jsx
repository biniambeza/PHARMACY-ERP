import { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ShieldCheck, Server } from 'lucide-react';
import { getMyPharmacy } from '../../api/pharmacyApi';
import { useAuth } from '../../context/useAuth';
import BusinessInfoCard from '../../components/settings/BusinessInfoCard';
import AccountCard from '../../components/settings/AccountCard';
import SecurityCard from '../../components/settings/SecurityCard';
import PharmacySettingsForm from '../../components/settings/PharmacySettingsForm';
import { logApiError } from '../../api/logApiError';

const Settings = () => {
  const { t } = useTranslation('settings');
  const { can } = useAuth();
  const canManage = can('settings:manage');

  const [pharmacy, setPharmacy] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPharmacy = async () => {
      try {
        const res = await getMyPharmacy();
        setPharmacy(res.pharmacy);
      } catch (err) {
        logApiError('Failed to load pharmacy profile', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPharmacy();
  }, []);

  if (loading) {
    return <div className="p-12 text-center text-xs text-slate-400">{t('loading')}</div>;
  }

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
              {t('header.badge')}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{t('header.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {canManage ? t('header.subtitleOwner') : t('header.subtitleStaff')}
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 self-start sm:self-auto">
          <Server className="w-3.5 h-3.5" />
          <span>
            {t('header.tenantId')} <span className="font-mono">{pharmacy?._id?.slice(-6)}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <BusinessInfoCard pharmacy={pharmacy} onPharmacyChange={setPharmacy} canManage={canManage} />
        <AccountCard />
        {/* Two-factor login (every role; recommended for owners) */}
        <SecurityCard className="md:col-span-2" />
      </div>

      {/* Pharmacy settings: owner only */}
      {canManage && <PharmacySettingsForm pharmacy={pharmacy} onPharmacyChange={setPharmacy} />}

      {/* Multi-Tenant Compliance Card */}
      <div className="bg-white dark:bg-[#161c26] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 shadow-xs text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="font-bold text-slate-900 dark:text-white mb-0.5">{t('tenancy.title')}</h4>
          <p>
            <Trans
              t={t}
              i18nKey="tenancy.body"
              values={{ id: pharmacy?._id ?? '' }}
              components={{ code: <code className="text-emerald-600 dark:text-emerald-400 font-mono font-semibold" /> }}
            />
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 text-xs font-semibold whitespace-nowrap">
          <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{t('tenancy.enforced')}</span>
        </div>
      </div>
    </div>
  );
};

export default Settings;
