import { Fragment, useCallback, useState } from 'react';
import { Truck, Plus, ArrowUpRight, ArrowDownLeft, LayoutGrid, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/useAuth';
import { getTransfers, sendTransfer, receiveTransfer, cancelTransfer } from '../../api/transferApi';
import StatusBadge from '../../components/common/StatusBadge';
import { CardSkeleton } from '../../components/common/SkeletonLoader';
import CreateTransferModal from '../../components/transfers/CreateTransferModal';
import BranchesOverview from '../../components/transfers/BranchesOverview';
import useAsync from '../../hooks/useAsync';
import { formatMoney, formatDate, formatDateTime } from '../../utils/format';

const STATUSES = ['draft', 'in_transit', 'received', 'cancelled'];
const STATUS_BADGE = { draft: 'draft', in_transit: 'pending', received: 'received', cancelled: 'cancelled' };

const btn = 'px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer disabled:opacity-50';

const Transfers = () => {
  const { t } = useTranslation('transfers');
  const { can, membershipRole } = useAuth();
  const canManage = can('transfer:manage');
  const isOwner = membershipRole === 'owner';
  const [tab, setTab] = useState(canManage ? 'outgoing' : 'overview');
  const [statusFilter, setStatusFilter] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const fetchTransfers = useCallback(async () => {
    if (tab === 'overview' || !canManage) return null;
    const params = { direction: tab };
    if (statusFilter) params.status = statusFilter;
    const data = await getTransfers(params);
    return data.transfers || [];
  }, [tab, statusFilter, canManage]);
  const { data, error: loadError, loading, reload: load } = useAsync(fetchTransfers);
  const transfers = data || [];
  const error = loadError ? loadError.response?.data?.message || t('errors.load') : '';

  const act = async (id, fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyId(id);
    try {
      await fn();
      await load();
    } catch (err) {
      alert(err.response?.data?.message || t('errors.action'));
    } finally {
      setBusyId(null);
    }
  };

  const tabs = [
    ...(canManage
      ? [
          { id: 'outgoing', label: t('tabs.outgoing'), icon: ArrowUpRight },
          { id: 'incoming', label: t('tabs.incoming'), icon: ArrowDownLeft },
        ]
      : []),
    ...(isOwner ? [{ id: 'overview', label: t('tabs.overview'), icon: LayoutGrid }] : []),
  ];

  const totalUnits = (tr) => tr.lines.reduce((s, l) => s + l.quantity, 0);
  const totalCost = (tr) => tr.lines.reduce((s, l) => s + l.quantity * (l.unitCost || 0), 0);

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            {t('badge')}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{t('title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('subtitle')}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> {t('newTransfer')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((tb) => {
          const Icon = tb.icon;
          return (
            <button
              key={tb.id}
              onClick={() => {
                setTab(tb.id);
                setExpanded(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                tab === tb.id
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white dark:bg-[#161c26] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {tb.label}
            </button>
          );
        })}
        {tab !== 'overview' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="ml-auto px-3 py-2 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200"
          >
            <option value="">{t('allStatuses')}</option>
            {STATUSES.filter((k) => !(tab === 'incoming' && k === 'draft')).map((k) => (
              <option key={k} value={k}>
                {t(`status.${k}`)}
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
            {tab === 'outgoing' ? t('empty.outgoing') : t('empty.incoming')}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {tab === 'outgoing' ? t('empty.outgoingHint') : t('empty.incomingHint')}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">{t('columns.number')}</th>
                <th className="text-left px-4 py-3">{tab === 'outgoing' ? t('columns.toBranch') : t('columns.fromBranch')}</th>
                <th className="text-right px-4 py-3">{t('columns.units')}</th>
                <th className="text-right px-4 py-3">{t('columns.value')}</th>
                <th className="text-left px-4 py-3">{t('columns.status')}</th>
                <th className="text-left px-4 py-3">{t('columns.date')}</th>
                <th className="text-right px-4 py-3">{t('common:labels.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {transfers.map((tr) => {
                const otherBranch = tab === 'outgoing' ? tr.toPharmacyId : tr.fromPharmacyId;
                const open = expanded === tr._id;
                const busy = busyId === tr._id;
                return (
                  <Fragment key={tr._id}>
                    <tr className="text-slate-700 dark:text-slate-300 hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpanded(open ? null : tr._id)}
                          className="inline-flex items-center gap-1 font-mono font-semibold text-slate-900 dark:text-white cursor-pointer"
                        >
                          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          {tr.number}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-semibold">{otherBranch?.name || '-'}</td>
                      <td className="px-4 py-3 text-right">{totalUnits(tr)}</td>
                      <td className="px-4 py-3 text-right font-mono">{formatMoney(totalCost(tr))}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={STATUS_BADGE[tr.status]} label={t(`status.${tr.status}`, { defaultValue: tr.status })} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-500">{formatDateTime(tr.sentAt || tr.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                          {tab === 'outgoing' && tr.status === 'draft' && (
                            <button
                              disabled={busy}
                              onClick={() => act(tr._id, () => sendTransfer(tr._id), t('confirm.send', { number: tr.number }))}
                              className={`${btn} text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60`}
                            >
                              {t('actions.send')}
                            </button>
                          )}
                          {tab === 'incoming' && tr.status === 'in_transit' && (
                            <button
                              disabled={busy}
                              onClick={() => act(tr._id, () => receiveTransfer(tr._id), t('confirm.receive', { number: tr.number }))}
                              className={`${btn} text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60`}
                            >
                              {t('actions.receive')}
                            </button>
                          )}
                          {(tr.status === 'in_transit' || (tab === 'outgoing' && tr.status === 'draft')) && (
                            <button
                              disabled={busy}
                              onClick={() => {
                                const reason = window.prompt(
                                  tab === 'incoming'
                                    ? t('confirm.reject', { number: tr.number })
                                    : tr.status === 'in_transit'
                                      ? t('confirm.cancelInTransit', { number: tr.number })
                                      : t('confirm.cancel', { number: tr.number })
                                );
                                if (reason === null) return;
                                act(tr._id, () => cancelTransfer(tr._id, reason));
                              }}
                              className={`${btn} text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60`}
                            >
                              {tab === 'incoming' ? t('actions.reject') : t('actions.cancel')}
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
                                <th className="text-left py-1">{t('lines.medicine')}</th>
                                <th className="text-left py-1">{t('lines.batch')}</th>
                                <th className="text-left py-1">{t('lines.expiry')}</th>
                                <th className="text-right py-1">{t('lines.qty')}</th>
                                <th className="text-right py-1">{t('lines.unitCost')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tr.lines.map((l) => (
                                <tr key={l._id} className="text-slate-700 dark:text-slate-300">
                                  <td className="py-1 font-semibold">{l.medicineName}</td>
                                  <td className="py-1 font-mono">{l.batchNo || (tr.status === 'draft' ? t('lines.auto') : '-')}</td>
                                  <td className="py-1">{l.expiryDate ? formatDate(l.expiryDate) : '-'}</td>
                                  <td className="py-1 text-right">{l.quantity}</td>
                                  <td className="py-1 text-right font-mono">{formatMoney(l.unitCost || 0)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                            <span>{t('details.from', { name: tr.fromPharmacyId?.name })}</span>
                            <span>{t('details.to', { name: tr.toPharmacyId?.name })}</span>
                            {tr.createdBy?.name && <span>{t('details.createdBy', { name: tr.createdBy.name })}</span>}
                            {tr.receivedAt && (
                              <span>
                                {tr.receivedBy?.name
                                  ? t('details.receivedBy', { date: formatDateTime(tr.receivedAt), name: tr.receivedBy.name })
                                  : t('details.received', { date: formatDateTime(tr.receivedAt) })}
                              </span>
                            )}
                            {tr.cancelledAt && (
                              <span>
                                {tr.cancelledBy?.name
                                  ? t('details.cancelledBy', { date: formatDateTime(tr.cancelledAt), name: tr.cancelledBy.name })
                                  : t('details.cancelled', { date: formatDateTime(tr.cancelledAt) })}
                              </span>
                            )}
                          </div>
                          {tr.notes && <p className="mt-2 text-[11px] text-slate-600 dark:text-slate-300 whitespace-pre-line">{tr.notes}</p>}
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
