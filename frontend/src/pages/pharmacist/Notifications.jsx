import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCircle2,
  RefreshCw,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  runNotificationChecks,
} from '../../api/notificationApi';
import { formatDateTime } from '../../utils/format';

const SEVERITY_STYLES = {
  critical: { icon: AlertOctagon, color: 'text-rose-500 bg-rose-50 dark:bg-rose-950/40' },
  warning: { icon: AlertTriangle, color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/40' },
  success: { icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40' },
  info: { icon: Info, color: 'text-sky-500 bg-sky-50 dark:bg-sky-950/40' },
};

const TYPES = ['expired', 'expiring_soon', 'low_stock', 'po_overdue', 'pharmacy_suspended', 'daily_summary', 'system'];

const selectClass =
  'px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition cursor-pointer';

const PAGE_SIZE = 20;

const Notifications = () => {
  const { t } = useTranslation('notifications');
  const { can } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { page, limit: PAGE_SIZE };
      if (onlyUnread) params.unread = 'true';
      if (type) params.type = type;
      if (severity) params.severity = severity;
      const data = await getNotifications(params);
      setItems(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (err) {
      setError(err.response?.data?.message || t('errors.load'));
    } finally {
      setLoading(false);
    }
  }, [page, onlyUnread, type, severity, t]);

  useEffect(() => {
    load();
  }, [load]);

  const changeFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const handleOpen = async (n) => {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
      markNotificationRead(n._id).catch(() => {});
    }
    if (n.link) navigate(n.link);
  };

  const handleMarkRead = async (n) => {
    try {
      await markNotificationRead(n._id);
      setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead();
      load();
    } catch (err) {
      setError(err.response?.data?.message || t('errors.markAll'));
    }
  };

  const handleRunChecks = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const data = await runNotificationChecks();
      setRunResult(data.stats || {});
      setPage(1);
      load();
    } catch (err) {
      setError(err.response?.data?.message || t('errors.runChecks'));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            {t('badge')}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            {t('title')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('subtitle', { count: unreadCount })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can('settings:manage') && (
            <button
              type="button"
              onClick={handleRunChecks}
              disabled={running}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-[#161c26] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold rounded-xl transition cursor-pointer disabled:opacity-50"
            >
              <PlayCircle className={`w-4 h-4 ${running ? 'animate-pulse' : ''}`} />
              {running ? t('runningChecks') : t('runChecks')}
            </button>
          )}
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={!unreadCount}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50"
          >
            <CheckCheck className="w-4 h-4" />
            {t('markAllRead')}
          </button>
        </div>
      </div>

      {runResult && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs text-emerald-800 dark:text-emerald-300">
          {t('checksComplete', {
            expired: runResult.expired || 0,
            expiring: runResult.expiringNotified || 0,
            lowStock: runResult.lowStock || 0,
            overdue: runResult.overduePOs || 0,
          })}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium self-start">
          {[
            [false, t('filters.all')],
            [true, t('filters.unread')],
          ].map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => changeFilter(setOnlyUnread)(value)}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer text-[11px] ${
                onlyUnread === value
                  ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={type} onChange={(e) => changeFilter(setType)(e.target.value)} className={selectClass} aria-label={t('filters.type')}>
            <option value="">{t('filters.allTypes')}</option>
            {TYPES.map((value) => (
              <option key={value} value={value}>
                {t(`types.${value}`)}
              </option>
            ))}
          </select>
          <select
            value={severity}
            onChange={(e) => changeFilter(setSeverity)(e.target.value)}
            className={selectClass}
            aria-label={t('filters.severity')}
          >
            <option value="">{t('filters.allSeverities')}</option>
            {Object.keys(SEVERITY_STYLES).map((value) => (
              <option key={value} value={value}>
                {t(`severity.${value}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={load}
            title={t('common:buttons.refresh')}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs">
          {error}
        </div>
      )}

      {/* List */}
      <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
        {loading && !items.length ? (
          <div className="p-10 flex justify-center">
            <span className="w-6 h-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          </div>
        ) : !items.length ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-center">
              <Bell className="w-6 h-6 text-slate-300 dark:text-slate-600" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-3">{t('empty.title')}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {onlyUnread || type || severity ? t('empty.filtered') : t('empty.caughtUp')}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {items.map((n) => {
              const style = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info;
              const Icon = style.icon;
              return (
                <li
                  key={n._id}
                  className={`flex gap-3 sm:gap-4 px-4 sm:px-5 py-4 ${n.read ? '' : 'bg-emerald-50/30 dark:bg-emerald-950/10'}`}
                >
                  <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${style.color}`}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-sm text-slate-900 dark:text-white ${n.read ? 'font-medium' : 'font-bold'}`}>{n.title}</p>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                        {t(`types.${n.type}`, { defaultValue: n.type })}
                      </span>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-emerald-500" aria-label={t('filters.unread')} />}
                    </div>
                    {n.message && <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 break-words">{n.message}</p>}
                    <p className="text-[11px] text-slate-400 mt-1.5">{formatDateTime(n.createdAt)}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-end sm:items-start gap-1.5 shrink-0">
                    {n.link && (
                      <button
                        type="button"
                        onClick={() => handleOpen(n)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg transition cursor-pointer"
                      >
                        {t('open')}
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                    {!n.read && (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(n)}
                        className="px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition cursor-pointer"
                      >
                        {t('markRead')}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {t('pagination', { page, pages, total })}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                aria-label={t('previousPage')}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                disabled={page >= pages}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                aria-label={t('nextPage')}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
