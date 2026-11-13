import { useTranslation } from 'react-i18next';
import { Users, UserX, UserCheck } from 'lucide-react';
import { MEMBERSHIP_ROLES } from '../../config/permissions';
import StatusBadge from '../common/StatusBadge';
import { CardSkeleton } from '../common/SkeletonLoader';
import { cardCls } from './staffUi';

// Team members table: role picker and activate/deactivate per member.
const StaffTable = ({ staff, loading, userId, busyId, roleLabel, onRoleChange, onToggleActive }) => {
  const { t } = useTranslation(['staff', 'common']);
  const activeCount = staff.filter((s) => s.active).length;

  return (
    <div className={`${cardCls} overflow-hidden`}>
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
        <Users className="w-4 h-4 text-slate-500" />
        <span className="text-xs font-bold text-slate-900 dark:text-white">{t('teamMembers')}</span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {t('activeOf', { active: activeCount, total: staff.length })}
        </span>
      </div>
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-8">
            <CardSkeleton height="h-48" />
          </div>
        ) : staff.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-500 dark:text-slate-400">{t('noStaff')}</div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 dark:border-slate-800 text-[11px]">
              <tr>
                <th className="py-3.5 px-5">{t('columns.name')}</th>
                <th className="py-3.5 px-4">{t('columns.email')}</th>
                <th className="py-3.5 px-4">{t('columns.role')}</th>
                <th className="py-3.5 px-4">{t('columns.status')}</th>
                <th className="py-3.5 px-4 text-right">{t('common:labels.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {staff.map((member) => {
                const isSelf = String(member._id) === String(userId);
                const busy = busyId === member._id;
                return (
                  <tr key={member._id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-emerald-400 text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {member.name?.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {member.name}
                          {isSelf && <span className="ml-1.5 text-[10px] text-slate-400 font-medium">{t('you')}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">{member.email}</td>
                    <td className="py-3 px-4">
                      <select
                        value={member.role}
                        disabled={busy}
                        onChange={(e) => onRoleChange(member, e.target.value)}
                        className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 cursor-pointer disabled:opacity-50"
                      >
                        {MEMBERSHIP_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={member.active ? 'active' : 'suspended'} label={member.active ? t('common:status.active') : t('deactivated')} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onToggleActive(member)}
                        disabled={busy}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer disabled:opacity-50 ${
                          member.active
                            ? 'text-rose-600 border-rose-200 hover:bg-rose-50 dark:text-rose-400 dark:border-rose-900/60 dark:hover:bg-rose-500/10'
                            : 'text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-900/60 dark:hover:bg-emerald-500/10'
                        }`}
                      >
                        {member.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        {member.active ? t('deactivate') : t('reactivate')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default StaffTable;
