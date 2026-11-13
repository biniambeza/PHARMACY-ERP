import { Fragment, useCallback, useEffect, useState } from 'react';
import { Truck, Plus, ArrowUpRight, ArrowDownLeft, LayoutGrid, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getTransfers, sendTransfer, receiveTransfer, cancelTransfer } from '../../api/transferApi';
import StatusBadge from '../../components/common/StatusBadge';
import { CardSkeleton } from '../../components/common/SkeletonLoader';
import CreateTransferModal from '../../components/transfers/CreateTransferModal';
import BranchesOverview from '../../components/transfers/BranchesOverview';
import { formatMoney, formatDate, formatDateTime } from '../../utils/format';

const STATUS_LABELS = { draft: 'Draft', in_transit: 'In transit', received: 'Received', cancelled: 'Cancelled' };
const STATUS_BADGE = { draft: 'draft', in_transit: 'pending', received: 'received', cancelled: 'cancelled' };

const btn = 'px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer disabled:opacity-50';

const Transfers = () => {
  const { can, membershipRole } = useAuth();
  const canManage = can('transfer:manage');
  const isOwner = membershipRole === 'owner';
  const [tab, setTab] = useState(canManage ? 'outgoing' : 'overview');
  const [statusFilter, setStatusFilter] = useState('');
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    if (tab === 'overview' || !canManage) return;
    setLoading(true);
    setError('');
    try {
      const params = { direction: tab };
      if (statusFilter) params.status = statusFilter;
      const data = await getTransfers(params);
      setTransfers(data.transfers || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load transfers');
    } finally {
      setLoading(false);
    }
  }, [tab, statusFilter, canManage]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id, fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(id);
    try {
      await fn();
      await load();
    } catch (err) {
      alert(err.response?.data?.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const tabs = [
    ...(canManage
      ? [
          { id: 'outgoing', label: 'Outgoing', icon: ArrowUpRight },
          { id: 'incoming', label: 'Incoming', icon: ArrowDownLeft },
        ]
      : []),
    ...(isOwner ? [{ id: 'overview', label: 'Branches overview', icon: LayoutGrid }] : []),
  ];

  const totalUnits = (t) => t.lines.reduce((s, l) => s + l.quantity, 0);
  const totalCost = (t) => t.lines.reduce((s, l) => s + l.quantity * (l.unitCost || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            Multi-branch
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">Branch Transfers</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Move stock between branches of your organization and compare branch performance
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> New Transfer
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setExpanded(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                tab === t.id
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white dark:bg-[#161c26] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
        {tab !== 'overview' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ml-auto px-3 py-2 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200"
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS)
              .filter(([k]) => !(tab === 'incoming' && k === 'draft'))
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        )}
      </div>

      {tab === 'overview' ? (
        <BranchesOverview />
      ) : loading ? (
        <CardSkeleton height="h-72" />
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      ) : transfers.length === 0 ? (
        <div className="p-10 text-center bg-white dark:bg-[#161c26] rounded-2xl border border-slate-200/80 dark:border-slate-800">
          <Truck className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            No {tab} transfers
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {tab === 'outgoing' ? 'Create a transfer to send stock to another branch.' : 'Transfers sent to this branch appear here.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Number</th>
                <th className="text-left px-4 py-3">{tab === 'outgoing' ? 'To branch' : 'From branch'}</th>
                <th className="text-right px-4 py-3">Units</th>
                <th className="text-right px-4 py-3">Value (cost)</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {transfers.map((t) => {
                const otherBranch = tab === 'outgoing' ? t.toPharmacyId : t.fromPharmacyId;
                const open = expanded === t._id;
                const busy = busyId === t._id;
                return (
                  <Fragment key={t._id}>
                    <tr className="text-slate-700 dark:text-slate-300 hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpanded(open ? null : t._id)}
                          className="inline-flex items-center gap-1 font-mono font-semibold text-slate-900 dark:text-white cursor-pointer"
                        >
                          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          {t.number}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-semibold">{otherBranch?.name || '-'}</td>
                      <td className="px-4 py-3 text-right">{totalUnits(t)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatMoney(totalCost(t))}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={STATUS_BADGE[t.status]} label={STATUS_LABELS[t.status]} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-500">{formatDateTime(t.sentAt || t.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                          {tab === 'outgoing' && t.status === 'draft' && (
                            <button
                              disabled={busy}
                              onClick={() => act(t._id, () => sendTransfer(t._id), `Send ${t.number}? Stock will be deducted from this branch.`)}
                              className={`${btn} text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60`}
                            >
                              Send
                            </button>
                          )}
                          {tab === 'incoming' && t.status === 'in_transit' && (
                            <button
                              disabled={busy}
                              onClick={() => act(t._id, () => receiveTransfer(t._id), `Receive ${t.number} into this branch?`)}
                              className={`${btn} text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60`}
                            >
                              Receive
                            </button>
                          )}
                          {(t.status === 'in_transit' || (tab === 'outgoing' && t.status === 'draft')) && (
                            <button
                              disabled={busy}
                              onClick={() => {
                                const reason = window.prompt(
                                  tab === 'incoming'
                                    ? `Reject ${t.number}? Stock goes back to the sending branch. Reason (optional):`
                                    : `Cancel ${t.number}?${t.status === 'in_transit' ? ' Stock returns to this branch.' : ''} Reason (optional):`
                                );
                                if (reason === null) return;
                                act(t._id, () => cancelTransfer(t._id, reason));
                              }}
                              className={`${btn} text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60`}
                            >
                              {tab === 'incoming' ? 'Reject' : 'Cancel'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50/60 dark:bg-slate-800/20">
                        <td colSpan={7} className="px-6 py-4">
                          <table className="w-full text-[11px]">
                            <thead className="text-slate-400 uppercase">
                              <tr>
                                <th className="text-left py-1">Medicine</th>
                                <th className="text-left py-1">Batch</th>
                                <th className="text-left py-1">Expiry</th>
                                <th className="text-right py-1">Qty</th>
                                <th className="text-right py-1">Unit cost</th>
                              </tr>
                            </thead>
                            <tbody>
                              {t.lines.map((l) => (
                                <tr key={l._id} className="text-slate-700 dark:text-slate-300">
                                  <td className="py-1 font-semibold">{l.medicineName}</td>
                                  <td className="py-1 font-mono">{l.batchNo || (t.status === 'draft' ? 'auto' : '-')}</td>
                                  <td className="py-1">{l.expiryDate ? formatDate(l.expiryDate) : '-'}</td>
                                  <td className="py-1 text-right">{l.quantity}</td>
                                  <td className="py-1 text-right font-mono">{formatMoney(l.unitCost || 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>From: {t.fromPharmacyId?.name}</span>
                            <span>To: {t.toPharmacyId?.name}</span>
                            {t.createdBy?.name && <span>Created by {t.createdBy.name}</span>}
                            {t.receivedAt && (
                              <span>
                                Received {formatDateTime(t.receivedAt)}
                                {t.receivedBy?.name ? ` by ${t.receivedBy.name}` : ''}
                              </span>
                            )}
                            {t.cancelledAt && (
                              <span>
                                Cancelled {formatDateTime(t.cancelledAt)}
                                {t.cancelledBy?.name ? ` by ${t.cancelledBy.name}` : ''}
                              </span>
                            )}
                          </div>
                          {t.notes && <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-line">{t.notes}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateTransferModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          if (tab !== 'outgoing') setTab('outgoing');
          else load();
        }}
      />
    </div>
  );
};

export default Transfers;
