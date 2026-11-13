import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollText, Search, ChevronDown, ChevronRight, ChevronLeft, RefreshCw, Download, AlertTriangle, Filter } from 'lucide-react';
import { getAuditLogs, getAuditFacets } from '../../api/auditApi';
import { formatDateTime } from '../../utils/format';
import { exportCSV } from '../../utils/export';

// Audit log viewer (#19). Read-only; owner (audit:view) only.

const inputCls =
  'px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition';

const IGNORED_KEYS = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'password', 'tokenVersion']);

// Flattens nested objects into { 'a.b.c': value } (arrays of primitives kept as one value).
const flatten = (obj, prefix = '', out = {}) => {
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== 'object' || obj instanceof Date) {
    out[prefix || 'value'] = obj;
    return out;
  }
  if (Array.isArray(obj)) {
    if (obj.every((v) => v === null || typeof v !== 'object')) {
      out[prefix || 'value'] = obj;
      return out;
    }
    obj.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
    return out;
  }
  Object.entries(obj).forEach(([k, v]) => {
    if (!prefix && IGNORED_KEYS.has(k)) return;
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) flatten(v, key, out);
    else out[key] = v;
  });
  return out;
};

const show = (v) => {
  if (v === undefined) return '—';
  if (v === null) return 'null';
  if (Array.isArray(v)) return `[${v.join(', ')}]`;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
};

const buildDiff = (before, after) => {
  const a = flatten(before);
  const b = flatten(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.map((key) => {
    const changed = JSON.stringify(a[key]) !== JSON.stringify(b[key]);
    return { key, before: a[key], after: b[key], changed };
  });
};

const actionTone = (action = '') => {
  if (/delete|void|deactivate|archive|remove|cancel/.test(action)) return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60';
  if (/create|add|receive|reactivate/.test(action)) return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60';
  if (/login|auth|password/.test(action)) return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/60';
  return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60';
};

const DiffView = ({ log }) => {
  const { t } = useTranslation('audit');
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => buildDiff(log.before, log.after), [log]);
  const visible = showAll ? rows : rows.filter((r) => r.changed);
  const hasDiff = log.before || log.after;

  return (
    <div className="space-y-3 text-xs">
      {hasDiff ? (
        <>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              {t('diff.changedFields', { count: rows.filter((r) => r.changed).length })}
            </span>
            <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 cursor-pointer">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="accent-emerald-600" />
              {t('diff.showUnchanged')}
            </label>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-[11px] uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2">{t('columns.field')}</th>
                  <th className="px-3 py-2">{t('columns.before')}</th>
                  <th className="px-3 py-2">{t('columns.after')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-3 text-center text-slate-400">{t('diff.noFieldChanges')}</td>
                  </tr>
                )}
                {visible.map((r) => (
                  <tr key={r.key} className={r.changed ? '' : 'opacity-60'}>
                    <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">{r.key}</td>
                    <td className={`px-3 py-1.5 break-all ${r.changed ? 'bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300' : 'text-slate-500'}`}>
                      {show(r.before)}
                    </td>
                    <td className={`px-3 py-1.5 break-all ${r.changed ? 'bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300' : 'text-slate-500'}`}>
                      {show(r.after)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-slate-400">{t('diff.noSnapshot')}</p>
      )}
      {log.meta && (
        <div>
          <span className="font-semibold text-slate-700 dark:text-slate-300">{t('diff.details')}</span>
          <pre className="mt-1 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 text-[11px] text-slate-600 dark:text-slate-300 overflow-x-auto">
            {JSON.stringify(log.meta, null, 2)}
          </pre>
        </div>
      )}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-400">
        {log.entityId && <span>{t('diff.entityId')} <span className="font-mono">{log.entityId}</span></span>}
        {log.ip && <span>{t('diff.ip')} <span className="font-mono">{log.ip}</span></span>}
        {log.userAgent && <span className="truncate max-w-md" title={log.userAgent}>{t('diff.device', { device: log.userAgent })}</span>}
      </div>
    </div>
  );
};

const EMPTY_FILTERS = { search: '', userId: '', action: '', entity: '', from: '', to: '' };

const AuditLog = () => {
  const { t } = useTranslation(['audit', 'common']);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ logs: [], pagination: { page: 1, pages: 1, total: 0 } });
  const [facets, setFacets] = useState({ actions: [], entities: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getAuditLogs({ ...applied, page, limit: 25 });
      setData({ logs: res.logs || [], pagination: res.pagination || { page: 1, pages: 1, total: 0 } });
    } catch (err) {
      setError(err.response?.data?.message || t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [applied, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getAuditFacets()
      .then((res) => setFacets({ actions: res.actions || [], entities: res.entities || [], users: res.users || [] }))
      .catch(() => {});
  }, []);

  const setField = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  const applyFilters = (e) => {
    e?.preventDefault();
    setPage(1);
    setExpanded(null);
    setApplied(filters);
  };

  const resetFilters = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  const handleExport = () => {
    exportCSV(
      data.logs,
      [
        { key: 'createdAt', header: t('columns.time'), format: (v) => formatDateTime(v) },
        { key: 'userName', header: t('columns.user') },
        { key: 'userRole', header: t('columns.role') },
        { key: 'action', header: t('columns.action') },
        { key: 'entity', header: t('columns.entity') },
        { key: 'entityId', header: t('columns.entityId') },
        { key: 'ip', header: t('columns.ip') },
        { key: 'before', header: t('columns.before'), format: (v) => (v ? JSON.stringify(v) : '') },
        { key: 'after', header: t('columns.after'), format: (v) => (v ? JSON.stringify(v) : '') },
      ],
      `audit-log-page-${page}`
    );
  };

  const { logs, pagination } = data;

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            {t('badge')}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1 flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> {t('title')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-xs font-semibold rounded-xl transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {t('common:buttons.refresh')}
          </button>
          <button
            onClick={handleExport}
            disabled={!logs.length}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 disabled:opacity-50 text-xs font-semibold rounded-xl transition cursor-pointer"
          >
            <Download className="w-4 h-4" /> {t('csv')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <form
        onSubmit={applyFilters}
        className="bg-white dark:bg-[#161c26] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3"
      >
        <div className="relative lg:col-span-2">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input value={filters.search} onChange={setField('search')} placeholder={t('searchPlaceholder')} className={`${inputCls} w-full pl-9`} />
        </div>
        <select value={filters.userId} onChange={setField('userId')} className={inputCls} aria-label={t('columns.user')}>
          <option value="">{t('allUsers')}</option>
          {facets.users.map((u) => (
            <option key={u._id} value={u._id}>
              {u.name}
              {u.role ? ` (${u.role})` : ''}
            </option>
          ))}
        </select>
        <select value={filters.action} onChange={setField('action')} className={inputCls} aria-label={t('columns.action')}>
          <option value="">{t('allActions')}</option>
          {[...new Set(facets.actions.map((a) => a.split('.')[0]))].map((mod) => (
            <option key={`${mod}.*`} value={`${mod}.*`}>{t('moduleAll', { module: mod })}</option>
          ))}
          {facets.actions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select value={filters.entity} onChange={setField('entity')} className={inputCls} aria-label={t('columns.entity')}>
          <option value="">{t('allEntities')}</option>
          {facets.entities.map((en) => (
            <option key={en} value={en}>{en}</option>
          ))}
        </select>
        <input type="date" value={filters.from} onChange={setField('from')} className={inputCls} aria-label={t('from')} />
        <input type="date" value={filters.to} onChange={setField('to')} className={inputCls} aria-label={t('to')} />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-7 justify-end">
          <button type="button" onClick={resetFilters} className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer">
            {t('common:buttons.reset')}
          </button>
          <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition cursor-pointer">
            <Filter className="w-3.5 h-3.5" /> {t('applyFilters')}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-[#161c26] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 dark:bg-slate-800/40 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              <tr>
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3">{t('columns.time')}</th>
                <th className="px-4 py-3">{t('columns.user')}</th>
                <th className="px-4 py-3">{t('columns.action')}</th>
                <th className="px-4 py-3">{t('columns.entity')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {loading && logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">{t('loadingEntries')}</td>
                </tr>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">{t('noEntries')}</td>
                </tr>
              )}
              {logs.map((log) => {
                const open = expanded === log._id;
                return (
                  <Fragment key={log._id}>
                    <tr
                      onClick={() => setExpanded(open ? null : log._id)}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer transition"
                    >
                      <td className="px-4 py-3 text-slate-400">
                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">{formatDateTime(log.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-900 dark:text-white">{log.userName || t('system')}</span>
                        {log.userRole && <span className="ml-1.5 text-[10px] uppercase text-slate-400">{log.userRole}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-md border font-mono text-[11px] ${actionTone(log.action)}`}>{log.action}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {log.entity || '—'}
                        {log.entityId && <span className="ml-1.5 font-mono text-[10px] text-slate-400">#{String(log.entityId).slice(-6)}</span>}
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50/50 dark:bg-slate-900/40">
                        <td />
                        <td colSpan={4} className="px-4 py-4">
                          <DiffView log={log} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
          <span>
            {t('entries', { count: pagination.total })} · {t('pageOf', { page: pagination.page, pages: pagination.pages })}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              aria-label={t('previousPage')}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
              disabled={page >= pagination.pages || loading}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              aria-label={t('nextPage')}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditLog;
