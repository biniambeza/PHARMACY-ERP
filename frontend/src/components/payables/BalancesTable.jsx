import { Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Can from '../common/Can';
import { formatMoney, formatDate } from '../../utils/format';
import { thCls, theadCls, tbodyCls, payBtnCls } from './payablesUtils';

const BalancesTable = ({ balances, onPay }) => {
  const { t } = useTranslation('payables');

  if (balances.length === 0) {
    return <p className="py-16 text-center text-xs text-slate-500">{t('empty.balances')}</p>;
  }

  return (
    <table className="w-full text-left text-xs">
      <thead className={theadCls}>
        <tr>
          <th className={thCls}>{t('columns.supplier')}</th>
          <th className={thCls}>{t('columns.terms')}</th>
          <th className={`${thCls} text-right`}>{t('columns.openInvoices')}</th>
          <th className={thCls}>{t('columns.nextDue')}</th>
          <th className={`${thCls} text-right`}>{t('columns.overdue')}</th>
          <th className={`${thCls} text-right`}>{t('columns.outstanding')}</th>
          <th className={`${thCls} text-right`}>{t('common:labels.actions')}</th>
        </tr>
      </thead>
      <tbody className={tbodyCls}>
        {balances.map((b) => (
          <tr key={b.supplierId}>
            <td className="py-3 px-4">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <Building2 className="w-4 h-4 text-emerald-600" /> {b.name}
              </div>
            </td>
            <td className="py-3 px-4">{t('days', { count: b.paymentTermsDays ?? 30 })}</td>
            <td className="py-3 px-4 text-right">{b.openInvoices}</td>
            <td className="py-3 px-4">{formatDate(b.nextDue)}</td>
            <td className={`py-3 px-4 text-right ${b.overdue > 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''}`}>
              {formatMoney(b.overdue)}
            </td>
            <td className="py-3 px-4 text-right font-bold">{formatMoney(b.outstanding)}</td>
            <td className="py-3 px-4 text-right">
              <Can perm="supplier:pay">
                <button
                  onClick={() => onPay({ supplierId: b.supplierId, supplierName: b.name, outstanding: b.outstanding })}
                  className={payBtnCls}
                >
                  {t('pay')}
                </button>
              </Can>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default BalancesTable;
