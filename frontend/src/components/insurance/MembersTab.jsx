import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getMembers, getSchemes, deleteMember } from '../../api/insuranceApi';
import { formatDate } from '../../utils/format';
import MemberFormModal from './MemberFormModal';
import { cardCls, inputCls, btnPrimary, errMsg, pillCls, thCls, tdCls } from './insuranceUi';
import { logApiError } from '../../api/logApiError';

const PAGE_SIZE = 50;

const MembersTab = () => {
  const { t } = useTranslation('insurance');
  const [schemes, setSchemes] = useState([]);
  const [schemeId, setSchemeId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ members: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    getSchemes()
      .then((res) => {
        if (!cancelled) setSchemes(res.schemes || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const params = { page, limit: PAGE_SIZE };
      if (schemeId) params.schemeId = schemeId;
      if (search.trim()) params.search = search.trim();
      const res = await getMembers(params);
      setData({ members: res.members || [], total: res.total || 0 });
    } catch (err) {
      logApiError('Failed to load members', err);
    } finally {
      setLoading(false);
    }
  }, [page, schemeId, search]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const remove = async (m) => {
    if (!window.confirm(t('members.confirmDelete', { name: m.name }))) return;
    try {
      await deleteMember(m._id);
      load();
    } catch (err) {
      alert(errMsg(err, t('errors.generic')));
    }
  };

  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className={`${cardCls} p-4 flex flex-col md:flex-row gap-3 md:items-center`}>
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder={t('members.searchPlaceholder')} className={`${inputCls} pl-9`} />
        </div>
        <select value={schemeId} onChange={(e) => { setSchemeId(e.target.value); setPage(1); }} className={`${inputCls} md:w-56 cursor-pointer`}>
          <option value="">{t('members.allSchemes')}</option>
          {schemes.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        <button onClick={() => setEditing(null)} disabled={schemes.length === 0} className={btnPrimary} title={schemes.length === 0 ? t('members.needScheme') : undefined}>
          <Plus className="w-4 h-4" /> {t('members.new')}
        </button>
      </div>

      <div className={`${cardCls} overflow-x-auto`}>
        <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
          <thead>
            <tr>
              <th className={thCls}>{t('fields.memberNo')}</th>
              <th className={thCls}>{t('fields.name')}</th>
              <th className={thCls}>{t('fields.scheme')}</th>
              <th className={thCls}>{t('fields.phone')}</th>
              <th className={thCls}>{t('fields.validity')}</th>
              <th className={thCls}>{t('fields.status')}</th>
              <th className={thCls} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr><td colSpan={7} className={`${tdCls} text-center py-8`}>{t('loading')}</td></tr>
            ) : data.members.length === 0 ? (
              <tr><td colSpan={7} className={`${tdCls} text-center py-8 text-slate-400`}>{t('members.empty')}</td></tr>
            ) : (
              data.members.map((m) => (
                <tr key={m._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                  <td className={`${tdCls} font-mono`}>{m.memberNo}</td>
                  <td className={tdCls}>
                    <div className="font-semibold text-slate-900 dark:text-white">{m.name}</div>
                    {m.group && <div className="text-[10px] text-slate-400">{m.group}</div>}
                  </td>
                  <td className={tdCls}>{m.schemeId?.name || '-'}</td>
                  <td className={tdCls}>{m.phone || '-'}</td>
                  <td className={tdCls}>
                    {m.validFrom ? formatDate(m.validFrom) : '…'} – {m.validTo ? formatDate(m.validTo) : '…'}
                  </td>
                  <td className={tdCls}>
                    <span className={`${pillCls} ${m.valid ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60' : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'}`}>
                      {m.valid ? t('members.valid') : t(`members.invalid.${m.invalidReason || 'inactive'}`)}
                    </span>
                  </td>
                  <td className={`${tdCls} text-right whitespace-nowrap`}>
                    <button onClick={() => setEditing(m)} aria-label={t('edit')} className="p-1.5 text-slate-400 hover:text-emerald-600 cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(m)} aria-label={t('remove')} className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex justify-end items-center gap-2 text-xs">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer">{t('common:buttons.previous')}</button>
          <span className="text-slate-500">{page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer">{t('common:buttons.next')}</button>
        </div>
      )}
      {editing !== undefined && (
        <MemberFormModal member={editing} schemes={schemes} defaultSchemeId={schemeId} onClose={() => setEditing(undefined)} onSaved={load} />
      )}
    </div>
  );
};

export default MembersTab;
