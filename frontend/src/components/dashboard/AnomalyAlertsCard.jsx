import { useTranslation } from 'react-i18next';
import { panelCls } from './panel';

/** Operational action items checklist (check state is owned by the page). */
const AnomalyAlertsCard = ({ operationalTasks, tasksState, onToggleTask }) => {
  const { t } = useTranslation('dashboard');

  return (
    <div className={panelCls}>
      <div>
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-slate-800/80">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('alerts.title')}</h3>
          <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">{t('alerts.actionRequired')}</span>
        </div>

        <div className="space-y-2.5">
          {operationalTasks.length === 0 ? (
            <div className="py-6 text-center">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-center mx-auto mb-2 text-emerald-600 dark:text-emerald-400">
                <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('alerts.allClear')}</p>
            </div>
          ) : (
            operationalTasks.map((task) => {
              const isChecked = tasksState[task.id] !== undefined ? tasksState[task.id] : task.checked;

              return (
                <div
                  key={task.id}
                  className="flex items-start justify-between gap-2.5 text-xs py-1.5 px-2 rounded-xl hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleTask(task.id)}
                      className="mt-0.5 w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                    />
                    <div className="min-w-0">
                      <p
                        className={`font-semibold text-slate-800 dark:text-slate-200 truncate ${
                          isChecked ? 'line-through text-slate-400 dark:text-slate-500' : ''
                        }`}
                      >
                        {task.title}
                      </p>
                      <span className="text-[10px] text-slate-400 block">
                        {task.dept} • {task.date}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                      task.priority === 'High'
                        ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50'
                        : 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50'
                    }`}
                  >
                    {t(`alerts.priority.${task.priority}`, { defaultValue: task.priority })}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
        <span>{t('alerts.footer')}</span>
        <span className="text-emerald-600 dark:text-emerald-400 font-bold">
          {t('alerts.open', { count: operationalTasks.filter((task) => !tasksState[task.id]).length })}
        </span>
      </div>
    </div>
  );
};

export default AnomalyAlertsCard;
