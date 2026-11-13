import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import CatalogModal from './CatalogModal';
import { getPriceHistory } from '../../api/medicineApi';
import { formatMoney, formatDateTime } from '../../utils/format';
import { theadCls, thCls, errorBox } from './styles';

const FIELD_LABELS = { price: 'Selling price', costPrice: 'Cost price', packPrice: 'Pack price' };

const PriceHistoryModal = ({ medicine, onClose }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getPriceHistory(medicine._id)
      .then((res) => active && setHistory(res.history || []))
      .catch((err) => active && setError(err.response?.data?.message || 'Failed to load price history'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [medicine._id]);

  return (
    <CatalogModal title="Price History" subtitle={medicine.name} icon={History} onClose={onClose}>
      {error && <div className={`${errorBox} mb-4`}>{error}</div>}
      {loading ? (
        <p className="text-xs text-slate-500">Loading...</p>
      ) : history.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">No price changes recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className={theadCls}>
              <tr>
                <th className={thCls}>Date</th>
                <th className={thCls}>Field</th>
                <th className={thCls}>Old</th>
                <th className={thCls}>New</th>
                <th className={thCls}>By</th>
                <th className={thCls}>Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {history.map((h) => (
                <tr key={h._id}>
                  <td className="py-2 px-4 whitespace-nowrap">{formatDateTime(h.createdAt)}</td>
                  <td className="py-2 px-4">
                    {FIELD_LABELS[h.field] || h.field}
                    {h.unitName ? ` (${h.unitName})` : ''}
                    {h.source !== 'edit' && (
                      <span className="ml-1 text-[10px] uppercase text-slate-400">{h.source}</span>
                    )}
                  </td>
                  <td className="py-2 px-4 font-mono">{h.old === null ? '-' : formatMoney(h.old)}</td>
                  <td className="py-2 px-4 font-mono font-semibold">{h.new === null ? '-' : formatMoney(h.new)}</td>
                  <td className="py-2 px-4">{h.changedBy?.name || '-'}</td>
                  <td className="py-2 px-4 text-slate-500">{h.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CatalogModal>
  );
};

export default PriceHistoryModal;
