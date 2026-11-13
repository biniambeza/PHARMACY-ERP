import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StatusBadge from '../common/StatusBadge';
import { formatMoney, formatDate } from '../../utils/format';
import { panelCls } from './panel';

const SaleStatus = ({ sale }) => {
  const { t } = useTranslation(['dashboard', 'common']);
  if (sale.voided) return <StatusBadge status="critical" label={t('recentSales.voided')} size="sm" />;
  if (sale.returnStatus && sale.returnStatus !== 'none') {
    return (
      <StatusBadge
        status="warning"
        label={sale.returnStatus === 'full' ? t('recentSales.returned') : t('recentSales.partReturned')}
        size="sm"
      />
    );
  }
  if (Number(sale.balanceDue) > 0) return <StatusBadge status="warning" label={t('recentSales.credit')} size="sm" />;
  return <StatusBadge status="paid" label={t('common:status.paid')} size="sm" />;
};

/** Recent transactions table with receipt buttons. */
const RecentSalesCard = ({ recentSales, onOpenReceipt }) => {
  const { t } = useTranslation(['dashboard', 'common']);
  const navigate = useNavigate();

  return (
    <div className={`lg:col-span-6 ${panelCls}`}>
      <div>
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800/80">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('recentSales.title')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('recentSales.subtitle')}</p>
          </div>
          <Link to="/pharmacy/sales" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
            {t('recentSales.viewLedger')}
          </Link>
        </div>

        {recentSales.length === 0 ? (
          <div className="py-10 text-center">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2 text-slate-400">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <p className="text-xs text-slate-400">{t('recentSales.empty')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-[11px] font-semibold uppercase">
                  <th className="pb-2.5">{t('recentSales.invoiceNo')}</th>
                  <th className="pb-2.5">{t('recentSales.customer')}</th>
                  <th className="pb-2.5">{t('common:labels.amount')}</th>
                  <th className="pb-2.5">{t('recentSales.status')}</th>
                  <th className="pb-2.5 text-right">{t('recentSales.receipt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 dark:divide-slate-800/60 font-medium">
                {recentSales.map((sale) => (
                  <tr key={sale._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition">
                    <td className="py-3 font-mono font-bold text-slate-900 dark:text-white">#{sale.invoiceNumber}</td>
                    <td className="py-3 text-slate-600 dark:text-slate-300">
                      <span className="block truncate max-w-[120px]">{sale.customer?.name || t('recentSales.walkInPatient')}</span>
                      <span className="text-[10px] text-slate-400">
                        {formatDate(sale.createdAt, { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="py-3 font-bold text-slate-900 dark:text-white">{formatMoney(sale.grandTotal)}</td>
                    <td className="py-3">
                      <SaleStatus sale={sale} />
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => onOpenReceipt(sale)}
                        className="px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 rounded-lg transition cursor-pointer"
                      >
                        {t('recentSales.printReceipt')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
        <span>{t('recentSales.terminal')}</span>
        <button onClick={() => navigate('/pharmacy/pos')} className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline">
          {t('recentSales.openPos')}
        </button>
      </div>
    </div>
  );
};

export default RecentSalesCard;
