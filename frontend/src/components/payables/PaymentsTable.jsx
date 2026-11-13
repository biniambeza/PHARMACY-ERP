import { useTranslation } from 'react-i18next';
import { formatMoney, formatDate } from '../../utils/format';
import { thCls, theadCls, tbodyCls } from './payablesUtils';

const PaymentsTable = ({ payments }) => {
  const { t } = useTranslation('payables');

  if (payments.length === 0) {
    return <p className="py-16 text-center text-xs text-slate-500">{t('empty.payments')}</p>;
  }

  return (
    <table className="w-full text-left text-xs">
      <thead className={theadCls}>
        <tr>
          <th className={thCls}>{t('columns.payment')}</th>
          <th className={thCls}>{t('columns.date')}</th>
          <th className={thCls}>{t('columns.supplier')}</th>
          <th className={thCls}>{t('columns.method')}</th>
          <th className={thCls}>{t('columns.appliedTo')}</th>
          <th className={`${thCls} text-right`}>{t('columns.amount')}</th>
        </tr>
      </thead>
      <tbody className={tbodyCls}>
        {payments.map((p) => (
          <tr key={p._id}>
            <td className="py-3 px-4 font-mono">
              {p.paymentNo}
              {p.reference && <span className="block text-[10px] text-slate-400">{p.reference}</span>}
            </td>
            <td className="py-3 px-4">{formatDate(p.date)}</td>
            <td className="py-3 px-4">{p.supplierId?.name}</td>
            <td className="py-3 px-4 capitalize">
              {t(`methods.${p.method}`, { defaultValue: String(p.method).replace('_', ' ') })}
            </td>
            <td className="py-3 px-4 text-[11px] text-slate-500">
              {p.allocations.map((a) => `${a.invoiceNo} (${formatMoney(a.amount)})`).join(', ')}
            </td>
            <td className="py-3 px-4 text-right font-bold">{formatMoney(p.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default PaymentsTable;
