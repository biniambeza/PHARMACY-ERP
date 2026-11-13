import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, Plus, Edit3, Trash2, Loader2 } from 'lucide-react';
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
} from '../../api/announcementApi';
import useAsync from '../../hooks/useAsync';
import { formatDateTime } from '../../utils/format';

const SEVERITY_STYLES = {
  info: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/60',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
  warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
  critical: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
};

const inputClass =
  'w-full mt-1 px-3 py-2 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500';

// datetime-local value in local time
const toLocalInput = (d) => {
  if (!d) return '';
  const date = new Date(d);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const EMPTY = { title: '', message: '', severity: 'info', audience: 'all', pharmacyIds: [], startsAt: '', endsAt: '' };

const stateOf = (a) => {
  const now = Date.now();
  if (a.startsAt && new Date(a.startsAt).getTime() > now) return 'scheduled';
  if (a.endsAt && new Date(a.endsAt).getTime() <= now) return 'ended';
  return 'live';
};

// Platform announcements management (#24)
const AnnouncementsManager = ({ pharmacies = [] }) => {
  const { t } = useTranslation('admin');
  const [form, setForm] = useState(null); // null = closed
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setError] = useState('');

  const fetchAnnouncements = useCallback(async () => (await getAnnouncements()).announcements || [], []);
  const { data: items, error: loadError, loading, reload: load } = useAsync(fetchAnnouncements, []);
  const error = formError || (loadError ? loadError.response?.data?.message || t('announcements.loadFailed') : '');

  const openCreate = () => {
    setEditingId(null);
    setError('');
    setForm({ ...EMPTY });
  };

  const openEdit = (a) => {
    setEditingId(a._id);
    setError('');
    setForm({
      title: a.title,
      message: a.message,
      severity: a.severity,
      audience: a.audience,
      pharmacyIds: (a.pharmacyIds || []).map((p) => p._id || p),
      startsAt: toLocalInput(a.startsAt),
      endsAt: toLocalInput(a.endsAt),
    });
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: form.title,
        message: form.message,
        severity: form.severity,
        audience: form.audience === 'all' ? 'all' : form.pharmacyIds,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      };
      if (editingId) await updateAnnouncement(editingId, payload);
      else await createAnnouncement(payload);
      setForm(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || t('announcements.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a) => {
    if (!window.confirm(t('announcements.deleteConfirm', { title: a.title }))) return;
    try {
      await deleteAnnouncement(a._id);
      await load();
    } catch (err) {
      alert(err.response?.data?.message || t('announcements.deleteFailed'));
    }
  };

  const togglePharmacy = (id) =>
    setForm((f) => ({
      ...f,
      pharmacyIds: f.pharmacyIds.includes(id) ? f.pharmacyIds.filter((x) => x !== id) : [...f.pharmacyIds, id],
    }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t('announcements.intro')}
        </p>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" /> {t('announcements.newAnnouncement')}
        </button>
      </div>

      {form && (
        <form onSubmit={save} className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <label className="block sm:col-span-2">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{t('announcements.title')}</span>
              <input required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{t('announcements.severity')}</span>
              <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className={inputClass}>
                <option value="info">{t('announcements.severities.info')}</option>
                <option value="success">{t('announcements.severities.success')}</option>
                <option value="warning">{t('announcements.severities.warning')}</option>
                <option value="critical">{t('announcements.severities.critical')}</option>
              </select>
            </label>
            <label className="block sm:col-span-3">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{t('announcements.message')}</span>
              <textarea
                required
                rows={3}
                maxLength={4000}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{t('announcements.starts')}</span>
              <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{t('announcements.endsOptional')}</span>
              <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className={inputClass} />
            </label>
            <label className="block">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{t('announcements.audience')}</span>
              <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className={inputClass}>
                <option value="all">{t('announcements.allPharmacies')}</option>
                <option value="pharmacies">{t('announcements.selectedPharmacies')}</option>
              </select>
            </label>
          </div>
          {form.audience === 'pharmacies' && (
            <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
              {pharmacies.map((p) => (
                <label key={p._id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 px-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
                  <input type="checkbox" checked={form.pharmacyIds.includes(p._id)} onChange={() => togglePharmacy(p._id)} />
                  <span className="truncate">{p.name}</span>
                </label>
              ))}
            </div>
          )}
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setForm(null)} className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer">
              {t('buttons.cancel', { ns: 'common' })}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {editingId ? t('announcements.saveChanges') : t('announcements.publish')}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> {t('labels.loading', { ns: 'common' })}
        </div>
      ) : items.length === 0 ? (
        <div className="p-10 text-center bg-white dark:bg-[#161c26] rounded-2xl border border-slate-200/80 dark:border-slate-800">
          <Megaphone className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-xs text-slate-500">{t('announcements.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a._id} className="flex items-start gap-3 p-4 bg-white dark:bg-[#161c26] rounded-2xl border border-slate-200/80 dark:border-slate-800">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${SEVERITY_STYLES[a.severity] || SEVERITY_STYLES.info}`}>
                {t(`announcements.severities.${a.severity}`, { defaultValue: a.severity })}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{a.title}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-line mt-0.5">{a.message}</p>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {t(`announcements.state.${stateOf(a)}`)} | {formatDateTime(a.startsAt)}
                  {a.endsAt ? t('announcements.until', { date: formatDateTime(a.endsAt) }) : t('announcements.noEnd')} |{' '}
                  {a.audience === 'all' ? t('announcements.allPharmacies') : (a.pharmacyIds || []).map((p) => p.name || p).join(', ')}
                </p>
              </div>
              <button onClick={() => openEdit(a)} title={t('buttons.edit', { ns: 'common' })} className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 cursor-pointer">
                <Edit3 className="w-4 h-4" />
              </button>
              <button onClick={() => remove(a)} title={t('buttons.delete', { ns: 'common' })} className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AnnouncementsManager;
