import { Users, Edit3, Trash2, Wallet, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Can from '../common/Can';
import { useAuth } from '../../context/useAuth';
import { CardSkeleton } from '../common/SkeletonLoader';
import { formatMoney } from '../../utils/format';
import { cardCls, limitLabel } from './customerUi';

const iconBtn =
  'p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-emerald-400 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer';

const CustomersTable = ({ customers, loading, filtered, onPay, onStatement, onEdit, onDelete }) => {
  const { t } = useTranslation('customers');
  const { can } = useAuth();
  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8">
            <CardSkeleton height="h-64" />
          </div>
        ) : customers.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
            <p className="text-sm font-bold text-slate-900 dark:text-white">
              {filtered ? t('empty.noMatch') : t('empty.none')}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('empty.hint')}</p>
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[11px]">
              <tr>
                <th className="py-3.5 px-5">{t('table.customer')}</th>
                <th className="py-3.5 px-4">{t('fields.phone')}</th>
                <th className="py-3.5 px-4 text-right">{t('fields.creditLimit')}</th>
                <th className="py-3.5 px-4 text-right">{t('table.balance')}</th>
                <th className="py-3.5 px-4">{t('table.status')}</th>
                <th className="py-3.5 px-5 text-right">{t('common:labels.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 font-medium">
              {customers.map((c) => {
                const over = c.creditLimit !== null && c.creditLimit > 0 && c.balance > c.creditLimit;
                return (
                  <tr key={c._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-5">
                      <span className="font-bold text-slate-900 dark:text-white block">{c.name}</span>
                      {c.email && <span className="text-[10px] text-slate-400">{c.email}</span>}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">{c.phone || '-'}</td>
                    <td className="py-3.5 px-4 text-right text-slate-600 dark:text-slate-400">{limitLabel(c.creditLimit, t)}</td>
                    <td
                      className={`py-3.5 px-4 text-right font-bold ${
                        c.balance > 0
                          ? over
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {formatMoney(c.balance)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full border ${
                          c.active
                            ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800'
                            : 'text-slate-500 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:border-slate-700'
                        }`}
                      >
                        {c.active ? t('common:status.active') : t('common:status.inactive')}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {can('customer:manage') && c.balance > 0 && (
                          <button onClick={() => onPay(c)} title={t('actions.recordPayment')} className={iconBtn}>
                            <Wallet className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => onStatement(c)} title={t('actions.statement')} className={iconBtn}>
                          <FileText className="w-4 h-4" />
                        </button>
                        <Can perm="customer:manage">
                          <button onClick={() => onEdit(c)} title={t('common:buttons.edit')} className={iconBtn}>
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDelete(c)}
                            title={t('actions.remove')}
                            className="p-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-950/30 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </Can>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default CustomersTable;
