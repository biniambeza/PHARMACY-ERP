import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Plus, Trash2, Edit3, Search, Lock, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getInteractionRules, createInteractionRule, updateInteractionRule, deleteInteractionRule,
} from '../../api/clinicalApi';
import { CardSkeleton } from '../../components/common/SkeletonLoader';
import { cardCls, inputCls, labelCls, primaryBtn, secondaryBtn, iconBtn, severityCls, errMsg } from '../../components/clinical/ui';

const SEVERITIES = ['minor', 'moderate', 'major', 'contraindicated'];
const emptyForm = { substanceA: '', substanceB: '', severity: 'moderate', description: '' };

const Interactions = () => {
  const { t } = useTranslation('interactions');
  const [rules, setRules] = useState({ global: [], custom: [], notice: '' });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await getInteractionRules();
      setRules({ global: data.global || [], custom: data.custom || [], notice: data.notice || '' });
    } catch (err) {
      setError(errMsg(err, t('errors.load')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const filter = useCallback(
    (list) => {
      const q = search.trim().toLowerCase();
      if (!q) return list;
      return list.filter((r) => `${r.substanceA} ${r.substanceB} ${r.description}`.toLowerCase().includes(q));
    },
    [search]
  );
  const custom = useMemo(() => filter(rules.custom), [rules.custom, filter]);
  const global = useMemo(() => filter(rules.global), [rules.global, filter]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.substanceA.trim() || !form.substanceB.trim()) return setError(t('errors.bothSubstances'));
    setSaving(true);
    try {
      if (editingId) await updateInteractionRule(editingId, form);
      else await createInteractionRule(form);
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (err) {
      setError(errMsg(err, t('errors.save')));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r) => {
    if (!window.confirm(t('confirmDelete', { a: r.substanceA, b: r.substanceB }))) return;
    try {
      await deleteInteractionRule(r._id);
      load();
    } catch (err) {
      setError(errMsg(err, t('errors.delete')));
    }
  };

  const renderRow = (r, readOnly) => (
    <tr key={r._id}>
      <td className="py-2.5 px-5 font-semibold text-slate-900 dark:text-white capitalize">{r.substanceA}</td>
      <td className="font-semibold text-slate-900 dark:text-white capitalize">{r.substanceB}</td>
      <td>
        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-md border ${severityCls(r.severity)}`}>{t(`severity.${r.severity}`, { defaultValue: r.severity })}</span>
      </td>
      <td className="text-slate-600 dark:text-slate-400 max-w-md">{r.description}</td>
      <td className="px-5 text-right whitespace-nowrap">
        {readOnly ? (
          <Lock className="w-3.5 h-3.5 inline text-slate-400" title={t('builtInTitle')} />
        ) : (
          <>
            <button
              className={iconBtn}
              title={t('editRule')}
              onClick={() => {
                setEditingId(r._id);
                setForm({ substanceA: r.substanceA, substanceB: r.substanceB, severity: r.severity, description: r.description || '' });
              }}
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button className={iconBtn} title={t('deleteRule')} onClick={() => handleDelete(r)}><Trash2 className="w-4 h-4" /></button>
          </>
        )}
      </td>
    </tr>
  );

  const table = (list, readOnly) => (
    <table className="w-full text-left text-xs">
      <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
        <tr><th className="py-2 px-5">{t('fields.substanceA')}</th><th>{t('fields.substanceB')}</th><th>{t('fields.severity')}</th><th>{t('fields.description')}</th><th className="px-5" /></tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {list.map((r) => renderRow(r, readOnly))}
        {list.length === 0 && <tr><td colSpan={5} className="py-4 px-5 italic text-slate-400">{t('noRules')}</td></tr>}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
          {t('badge')}
        </span>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{t('title')}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {t('subtitle')}
        </p>
      </div>

      {rules.notice && (
        <div className="flex gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-200">
          <Info className="w-4 h-4 shrink-0" /> {rules.notice}
        </div>
      )}
      {error && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs border border-rose-200 dark:border-rose-900/50">
          {error}
          <button onClick={() => setError('')} aria-label={t('common:buttons.close')} className="cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      <form onSubmit={handleSubmit} className={`${cardCls} p-4 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end`}>
        <div className="sm:col-span-2">
          <label className={labelCls}>{t('fields.substanceA')}</label>
          <input className={inputCls} value={form.substanceA} onChange={(e) => setForm({ ...form, substanceA: e.target.value })} placeholder={t('placeholders.substanceA')} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>{t('fields.substanceB')}</label>
          <input className={inputCls} value={form.substanceB} onChange={(e) => setForm({ ...form, substanceB: e.target.value })} placeholder={t('placeholders.substanceB')} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>{t('fields.severity')}</label>
          <select className={inputCls} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
            {SEVERITIES.map((s) => <option key={s} value={s}>{t(`severity.${s}`)}</option>)}
          </select>
        </div>
        <div className="sm:col-span-4">
          <label className={labelCls}>{t('fields.description')}</label>
          <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="sm:col-span-2 flex gap-2">
          <button type="submit" disabled={saving} className={`${primaryBtn} flex-1`}>
            <Plus className="w-4 h-4" /> {editingId ? t('common:buttons.update') : t('common:buttons.add')}
          </button>
          {editingId && (
            <button type="button" className={secondaryBtn} onClick={() => { setEditingId(null); setForm(emptyForm); }}>{t('common:buttons.cancel')}</button>
          )}
        </div>
      </form>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('filterPlaceholder')} className={`${inputCls} pl-9`} />
      </div>

      {loading ? (
        <CardSkeleton height="h-64" />
      ) : (
        <>
          <div className={`${cardCls} overflow-hidden`}>
            <h2 className="px-5 py-3 text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800">
              <Activity className="w-4 h-4 text-emerald-600" /> {t('customTitle', { count: rules.custom.length })}
            </h2>
            <div className="overflow-x-auto">{table(custom, false)}</div>
          </div>
          <div className={`${cardCls} overflow-hidden`}>
            <h2 className="px-5 py-3 text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 border-b border-slate-100 dark:border-slate-800">
              <Lock className="w-4 h-4 text-slate-400" /> {t('globalTitle', { count: rules.global.length })}
            </h2>
            <div className="overflow-x-auto">{table(global, true)}</div>
          </div>
        </>
      )}
    </div>
  );
};

export default Interactions;
