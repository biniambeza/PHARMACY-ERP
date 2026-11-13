import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../utils/format';
import { panelCls } from './panel';

/** Top suppliers by spend. */
const TopSuppliersCard = ({ topSuppliers }) => {
  const { t } = useTranslation('dashboard');

  return (
    <div className={panelCls}>
      <div>
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800/80">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('suppliers.title')}</h3>
          <Link to="/pharmacy/suppliers" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline">
            {t('suppliers.directory')}
          </Link>
        </div>

        <div className="space-y-3">
          {topSuppliers.length === 0 ? (
            <div className="py-6 text-center">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-2 text-slate-400">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <p className="text-xs text-slate-400">{t('suppliers.empty')}</p>
            </div>
          ) : (
            topSuppliers.slice(0, 4).map((sup) => (
              <div
                key={sup.id}
                className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 dark:border-slate-800/50 last:border-none"
              >
                <div className="min-w-0 pr-2">
                  <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{sup.name}</p>
                  <span className="text-[10px] text-slate-400 block truncate">{t('suppliers.ordersFulfilled', { count: sup.orders })}</span>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-extrabold text-slate-900 dark:text-white">{formatMoney(sup.spend)}</span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                    {t('suppliers.rating', { rating: '4.8' })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
        <Link
          to="/pharmacy/procurement"
          className="w-full block text-center py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition"
        >
          {t('suppliers.issuePo')}
        </Link>
      </div>
    </div>
  );
};

export default TopSuppliersCard;
