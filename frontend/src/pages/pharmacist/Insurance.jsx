// Insurance / credit-scheme billing: schemes, members, claims and insurer receivables. Owner: Insurance agent.
import { useState } from 'react';
import { ShieldCheck, Users, FileStack, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import SchemesTab from '../../components/insurance/SchemesTab';
import MembersTab from '../../components/insurance/MembersTab';
import ClaimsTab from '../../components/insurance/ClaimsTab';
import ReceivablesTab from '../../components/insurance/ReceivablesTab';

const TABS = [
  { key: 'schemes', icon: ShieldCheck, perm: 'insurance:manage', Component: SchemesTab },
  { key: 'members', icon: Users, perm: 'insurance:manage', Component: MembersTab },
  { key: 'claims', icon: FileStack, perm: 'claim:manage', Component: ClaimsTab },
  { key: 'receivables', icon: Wallet, perm: 'claim:manage', Component: ReceivablesTab },
];

const Insurance = () => {
  const { t } = useTranslation('insurance');
  const { can } = useAuth();
  const tabs = TABS.filter((tab) => can(tab.perm));
  const [active, setActive] = useState(() => tabs[0]?.key || 'schemes');
  const current = tabs.find((tab) => tab.key === active) || tabs[0];

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            {t('badge')}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{t('title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('subtitle')}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium w-fit">
        {tabs.map(({ key, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition cursor-pointer ${
              current?.key === key
                ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" /> {t(`tabs.${key}`)}
          </button>
        ))}
      </div>

      {current ? <current.Component key={current.key} /> : <p className="text-xs text-slate-500">{t('noAccess')}</p>}
    </div>
  );
};

export default Insurance;
