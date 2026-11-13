import { useEffect, useState } from 'react';
import { X, LifeBuoy, Loader2, Lock } from 'lucide-react';
import { getSupportOverview } from '../../api/adminApi';
import { formatMoney, formatDate, formatDateTime } from '../../utils/format';
import ResetPasswordModal from './ResetPasswordModal';

const section = 'bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-700/60 p-4';
const title = 'text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2';

const Stat = ({ label, value }) => (
  <div className={section}>
    <p className="text-[10px] uppercase font-bold text-slate-400">{label}</p>
    <p className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">{value}</p>
  </div>
);

// Read-only support view of one pharmacy (#24). Every open is audited
// server-side (support.view). The parent mounts it with a `key` per pharmacy.
const SupportView = ({ pharmacy, onClose }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [resetUser, setResetUser] = useState(null);

  useEffect(() => {
    if (!pharmacy) return undefined;
    let cancelled = false;
    getSupportOverview(pharmacy._id)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.response?.data?.message || 'Failed to load the support view'));
    return () => {
      cancelled = true;
    };
  }, [pharmacy]);

  if (!pharmacy) return null;
  const s = data?.summary;
  const sub = data?.pharmacy?.subscription || {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100 dark:border-slate-800 shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <LifeBuoy className="w-4.5 h-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {pharmacy.name}
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60">
                  <Lock className="w-3 h-3" /> Support view, read-only
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Your access to this pharmacy's data is recorded in its audit log.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {error ? (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300">{error}</div>
          ) : !data ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Status" value={data.pharmacy.status} />
                <Stat label="Plan / billing" value={`${sub.plan || '-'} / ${(sub.status || '-').replace('_', ' ')}`} />
                <Stat label="Period ends" value={sub.currentPeriodEnd ? formatDate(sub.currentPeriodEnd) : 'No expiry'} />
                <Stat label="Sales (30 days)" value={`${formatMoney(s.sales30Days)} (${s.salesCount30Days})`} />
                <Stat label="Medicines" value={s.medicines} />
                <Stat label="Active batches" value={`${s.activeBatches} (${s.expiredBatches} expired)`} />
                <Stat label="Stock units" value={s.stockUnits} />
                <Stat label="Stock value (cost)" value={formatMoney(s.stockValue)} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={section}>
                  <p className={title}>Staff ({data.staff.length})</p>
                  <ul className="space-y-1">
                    {data.staff.map((u) => (
                      <li key={u._id} className="flex justify-between gap-2 text-slate-700 dark:text-slate-300">
                        <span className="truncate">
                          {u.name} <span className="text-slate-400">{u.email}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span className={`capitalize ${u.active ? '' : 'line-through text-slate-400'}`}>{u.role}</span>
                          <button
                            onClick={() => setResetUser(u)}
                            title="Reset this user's password"
                            className="px-2 py-0.5 text-[10px] font-semibold rounded-md border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 cursor-pointer"
                          >
                            Reset password
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={section}>
                  <p className={title}>Recent sales</p>
                  {data.recentSales.length === 0 ? (
                    <p className="text-slate-400">No sales.</p>
                  ) : (
                    <ul className="space-y-1">
                      {data.recentSales.map((sale) => (
                        <li key={sale._id} className="flex justify-between gap-2 text-slate-700 dark:text-slate-300">
                          <span className="font-mono">{sale.invoiceNumber}</span>
                          <span className="text-slate-400">{formatDateTime(sale.createdAt)}</span>
                          <span className={`font-mono ${sale.voided ? 'line-through text-slate-400' : ''}`}>{formatMoney(sale.grandTotal)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className={section}>
                  <p className={title}>Low / out of stock</p>
                  {data.lowStock.length === 0 ? (
                    <p className="text-slate-400">Nothing below minimum level.</p>
                  ) : (
                    <ul className="space-y-1">
                      {data.lowStock.map((m) => (
                        <li key={m._id} className="flex justify-between text-slate-700 dark:text-slate-300">
                          <span>{m.name}</span>
                          <span className={m.qty === 0 ? 'text-rose-500 font-semibold' : 'text-amber-600'}>
                            {m.qty} / min {m.minStockLevel}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className={section}>
                  <p className={title}>Recent stock movements</p>
                  {data.movements.length === 0 ? (
                    <p className="text-slate-400">No movements.</p>
                  ) : (
                    <ul className="space-y-1">
                      {data.movements.map((m) => (
                        <li key={m._id} className="flex justify-between gap-2 text-slate-700 dark:text-slate-300">
                          <span className="truncate">
                            {m.medicineId?.name || '-'} <span className="text-slate-400">{m.type}</span>
                          </span>
                          <span className={m.quantityChange < 0 ? 'text-rose-500' : 'text-emerald-600'}>
                            {m.quantityChange > 0 ? '+' : ''}
                            {m.quantityChange}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className={section}>
                  <p className={title}>Audit log</p>
                  {data.auditLogs.length === 0 ? (
                    <p className="text-slate-400">No entries.</p>
                  ) : (
                    <ul className="space-y-1">
                      {data.auditLogs.map((l) => (
                        <li key={l._id} className="flex justify-between gap-2 text-slate-700 dark:text-slate-300">
                          <span className="font-mono">{l.action}</span>
                          <span className="truncate text-slate-400">
                            {l.userName || '-'} | {formatDateTime(l.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className={section}>
                  <p className={title}>Branch transfers</p>
                  {data.transfers.length === 0 ? (
                    <p className="text-slate-400">No transfers.</p>
                  ) : (
                    <ul className="space-y-1">
                      {data.transfers.map((t) => (
                        <li key={t._id} className="flex justify-between gap-2 text-slate-700 dark:text-slate-300">
                          <span className="font-mono">{t.number}</span>
                          <span className="truncate text-slate-400">
                            {t.fromPharmacyId?.name} to {t.toPharmacyId?.name}
                          </span>
                          <span>{t.status.replace('_', ' ')}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {resetUser && <ResetPasswordModal key={resetUser._id} user={resetUser} onClose={() => setResetUser(null)} />}
    </div>
  );
};

export default SupportView;
