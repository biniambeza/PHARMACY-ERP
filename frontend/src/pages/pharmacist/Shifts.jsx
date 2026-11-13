import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Clock, PlayCircle, StopCircle, FileBarChart2, AlertCircle, RotateCw, ChevronLeft, ChevronRight, ShoppingCart,
} from 'lucide-react';
import { getCurrentShift, getShifts, closeShift } from '../../api/shiftApi';
import { useAuth } from '../../context/useAuth';
import { formatMoney, formatDateTime } from '../../utils/format';
import OpenShiftModal from '../../components/pos/OpenShiftModal';
import ZReportModal from '../../components/pos/ZReportModal';
import PosModal, { primaryBtn, secondaryBtn } from '../../components/pos/PosModal';
import { cardCls, inputCls, round2, errMsg } from '../../components/pos/posUtils';

const LIMIT = 20;
const COUNTED = ['cash', 'card', 'mobile_money'];

const varianceCls = (v) =>
  Math.abs(v) < 0.005 ? 'text-emerald-600 dark:text-emerald-400' : v < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400';
const signed = (v) => `${v > 0 ? '+' : ''}${formatMoney(v)}`;

// Close a shift: counted amounts against expected, live variance (#7).
const CloseShiftModal = ({ shift, open, onClose, onClosed }) => {
  const { t } = useTranslation('shifts');
  const [counted, setCounted] = useState({ cash: '', card: '', mobile_money: '' });
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const expected = shift?.expected || {};

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const body = { counted: Object.fromEntries(COUNTED.map((key) => [key, Number(counted[key] || 0)])), notes };
      const res = await closeShift(shift._id, body);
      onClosed?.(res);
    } catch (err) {
      setError(errMsg(err, t('close.errors.failed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PosModal
      open={open}
      title={t('close.title', { number: shift?.shiftNumber || '' })}
      icon={StopCircle}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={secondaryBtn} onClick={onClose}>{t('common:buttons.cancel')}</button>
          <button type="button" className={primaryBtn} onClick={submit} disabled={saving}>
            {saving ? t('close.closing') : t('close.submit')}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t('close.instructions')}
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[11px] text-slate-500">
              <th className="text-left font-semibold pb-1">{t('close.method')}</th>
              <th className="text-right font-semibold pb-1">{t('close.expected')}</th>
              <th className="text-right font-semibold pb-1">{t('close.counted')}</th>
              <th className="text-right font-semibold pb-1">{t('close.variance')}</th>
            </tr>
          </thead>
          <tbody>
            {COUNTED.map((key) => {
              const exp = Number(expected[key]) || 0;
              const variance = round2((Number(counted[key]) || 0) - exp);
              return (
                <tr key={key}>
                  <td className="py-1 text-slate-700 dark:text-slate-200">{t(`close.labels.${key}`)}</td>
                  <td className="py-1 text-right font-mono">{formatMoney(exp)}</td>
                  <td className="py-1 pl-2 w-32">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={counted[key]}
                      onChange={(e) => setCounted((c) => ({ ...c, [key]: e.target.value }))}
                      placeholder="0.00"
                      className={`${inputCls} text-right font-mono`}
                    />
                  </td>
                  <td className={`py-1 text-right font-mono font-semibold ${varianceCls(variance)}`}>{signed(variance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('close.notesPlaceholder')} maxLength={500} className={inputCls} />
        {error && (
          <div className="flex items-center gap-2 text-xs text-rose-600"><AlertCircle className="w-4 h-4" />{error}</div>
        )}
      </div>
    </PosModal>
  );
};

const Shifts = () => {
  const { t } = useTranslation('shifts');
  const { activePharmacy } = useAuth();
  const [current, setCurrent] = useState(null);
  const [requireShift, setRequireShift] = useState(false);
  const [shifts, setShifts] = useState([]);
  const [total, setTotal] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [report, setReport] = useState(null); // { shiftId, initial? }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cur, list] = await Promise.all([
        getCurrentShift(),
        getShifts({ page, limit: LIMIT, ...(status ? { status } : {}) }),
      ]);
      setCurrent(cur.shift || null);
      setRequireShift(Boolean(cur.requireShift));
      setShifts(list.shifts || []);
      setTotal(list.total || 0);
      setCanManage(Boolean(list.canManage));
    } catch (err) {
      setError(errMsg(err, t('errors.load')));
    } finally {
      setLoading(false);
    }
  }, [page, status, t]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const live = current?.live;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            {t('page.badge')}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{t('page.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('page.subtitle')}
            {requireShift ? ` ${t('page.requireShift')}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={load} className={secondaryBtn}>
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('common:buttons.refresh')}
          </button>
          <Link to="/pharmacy/pos" className={primaryBtn}>
            <ShoppingCart className="w-3.5 h-3.5" /> {t('page.pos')}
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-2xl flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Current shift */}
      <div className={`${cardCls} p-5`}>
        {current ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {current.shiftNumber} <span className="ml-1 text-[11px] font-semibold text-emerald-600">{t('open')}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {t('current.since', { date: formatDateTime(current.openedAt), amount: formatMoney(current.openingFloat) })}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className={secondaryBtn} onClick={() => setReport({ shiftId: current._id })}>
                  <FileBarChart2 className="w-3.5 h-3.5" /> {t('xReport')}
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl cursor-pointer"
                  onClick={() => setCloseModal(true)}
                >
                  <StopCircle className="w-3.5 h-3.5" /> {t('current.closeShift')}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                ['sales', t('current.sales'), live ? `${live.sales.count} · ${formatMoney(live.sales.total)}` : '-'],
                ['cash', t('current.expectedCash'), formatMoney(current.expected?.cash)],
                ['card', t('methods.card'), formatMoney(current.expected?.card)],
                ['mobile_money', t('methods.mobile_money'), formatMoney(current.expected?.mobile_money)],
                ['credit', t('methods.credit'), formatMoney(current.expected?.credit)],
              ].map(([id, label, value]) => (
                <div key={id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800">
                  <div className="text-[11px] text-slate-500">{label}</div>
                  <div className="text-sm font-bold font-mono text-slate-900 dark:text-white">{value}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-slate-600 dark:text-slate-300">{t('current.none')}</div>
            <button type="button" className={primaryBtn} onClick={() => setOpenModal(true)}>
              <PlayCircle className="w-3.5 h-3.5" /> {t('current.openShift')}
            </button>
          </div>
        )}
      </div>

      {/* History */}
      <div className={`${cardCls} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 border-b border-slate-200/80 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">{canManage ? t('history.allStaff') : t('history.mine')}</h2>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className={`${inputCls} w-36 cursor-pointer`}
          >
            <option value="">{t('history.all')}</option>
            <option value="open">{t('history.open')}</option>
            <option value="closed">{t('history.closed')}</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/60 text-[11px] text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-2.5">{t('history.shift')}</th>
                {canManage && <th className="text-left px-4 py-2.5">{t('history.cashier')}</th>}
                <th className="text-left px-4 py-2.5">{t('history.opened')}</th>
                <th className="text-left px-4 py-2.5">{t('history.closed')}</th>
                <th className="text-right px-4 py-2.5">{t('history.float')}</th>
                <th className="text-right px-4 py-2.5">{t('current.expectedCash')}</th>
                <th className="text-right px-4 py-2.5">{t('history.countedCash')}</th>
                <th className="text-right px-4 py-2.5">{t('close.variance')}</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {shifts.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 9 : 8} className="px-4 py-10 text-center text-slate-400">
                    {loading ? t('history.loading') : t('history.empty')}
                  </td>
                </tr>
              ) : (
                shifts.map((s) => (
                  <tr key={s._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-900 dark:text-white">
                      {s.shiftNumber}
                      {s.status === 'open' && <span className="ml-1.5 text-[10px] text-emerald-600 font-bold">{t('open')}</span>}
                    </td>
                    {canManage && <td className="px-4 py-2.5">{s.userId?.name || '-'}</td>}
                    <td className="px-4 py-2.5">{formatDateTime(s.openedAt)}</td>
                    <td className="px-4 py-2.5">{s.closedAt ? formatDateTime(s.closedAt) : '-'}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{formatMoney(s.openingFloat)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{s.status === 'closed' ? formatMoney(s.expected?.cash) : '-'}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{s.status === 'closed' ? formatMoney(s.counted?.cash) : '-'}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold ${s.status === 'closed' ? varianceCls(s.variance?.cash || 0) : ''}`}>
                      {s.status === 'closed' ? signed(s.variance?.cash || 0) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setReport({ shiftId: s._id })}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-500 cursor-pointer"
                      >
                        <FileBarChart2 className="w-3.5 h-3.5" /> {s.status === 'closed' ? t('zReport') : t('xReport')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 p-3 border-t border-slate-200/80 dark:border-slate-800 text-xs">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={secondaryBtn}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span>
              {page} / {pages}
            </span>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className={secondaryBtn}>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      <OpenShiftModal
        open={openModal}
        required={requireShift}
        onClose={() => setOpenModal(false)}
        onOpened={() => {
          setOpenModal(false);
          load();
        }}
      />
      {current && (
        <CloseShiftModal
          key={current._id}
          shift={current}
          open={closeModal}
          onClose={() => setCloseModal(false)}
          onClosed={(res) => {
            setCloseModal(false);
            setReport({ shiftId: res.shift._id, initial: res.zReport });
            load();
          }}
        />
      )}
      <ZReportModal
        key={report?.shiftId || 'none'}
        open={Boolean(report)}
        shiftId={report?.shiftId}
        initial={report?.initial}
        pharmacyName={activePharmacy?.name}
        onClose={() => setReport(null)}
      />
    </div>
  );
};

export default Shifts;
