import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { tNav, tNavGroup, tQuickAction } from '../../i18n/nav';

// Pharmacy sidebar navigation: permission-filtered nav groups plus quick action shortcuts.
const SidebarNav = ({ visibleGroups, quickActions, collapsed, onNavigate }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className={`flex-1 overflow-y-auto ${collapsed ? 'px-2.5 py-3 space-y-3' : 'px-3.5 py-4 space-y-4'} custom-scrollbar`}>
      {visibleGroups.map((group, groupIndex) => (
        <div key={group.label || 'main'} className="space-y-1">
          {group.label &&
            (collapsed ? (
              groupIndex > 0 && <div className="mx-2 my-1 border-t border-slate-100 dark:border-slate-800/80" />
            ) : (
              <div className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {tNavGroup(t, group.label)}
              </div>
            ))}
          {group.items.map((item) => {
              const IconComponent = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  title={collapsed ? tNav(t, item) : undefined}
                  className={({ isActive }) =>
                    `group relative flex items-center ${
                      collapsed
                        ? 'justify-center p-2.5 rounded-xl'
                        : 'gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-[13px]'
                    } transition-all duration-150 ${
                      isActive
                        ? 'bg-emerald-50/90 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 font-semibold shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/70 dark:hover:bg-slate-800/60 font-medium'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <span className={`${collapsed ? 'w-8 h-8' : 'w-7 h-7'} rounded-lg bg-emerald-600 dark:bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-2xs shadow-emerald-500/20`}>
                          <IconComponent className="w-4 h-4" />
                        </span>
                      ) : (
                        <span className={`${collapsed ? 'w-8 h-8' : 'w-7 h-7'} flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors`}>
                          <IconComponent className="w-4.5 h-4.5" />
                        </span>
                      )}

                      {!collapsed ? (
                        <>
                          <span className="flex-1 truncate">{tNav(t, item)}</span>
                          {item.badge && (
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                isActive
                                  ? 'bg-emerald-100/90 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </>
                      ) : (
                        /* Tooltip for collapsed mode */
                        <div className="hidden lg:flex absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none whitespace-nowrap z-50 items-center gap-2 border border-slate-700/60">
                          <span>{tNav(t, item)}</span>
                          {item.badge && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                              {item.badge}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </NavLink>
              );
          })}
        </div>
      ))}

      {/* Quick Actions Shortcuts */}
      {quickActions.length > 0 && (
      <div className={`pt-3 pb-1 border-t border-slate-100 dark:border-slate-800/80 ${collapsed ? 'flex flex-col items-center' : ''}`}>
        {!collapsed ? (
          <>
            <div className="px-3 pb-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 tracking-tight">
              Quick Actions
            </div>
            <div className="space-y-1.5">
              {quickActions.map((action) => {
                const ActionIcon = action.icon;
                return (
                  <button
                    key={action.name}
                    onClick={() => {
                      navigate(action.to);
                      onNavigate();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 dark:text-slate-300 dark:bg-[#1a2230]/70 dark:hover:bg-[#222c3e] dark:hover:text-white dark:border-slate-800 rounded-xl transition shadow-2xs cursor-pointer text-left group"
                  >
                    <span className="w-6 h-6 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 transition">
                      <ActionIcon className="w-3.5 h-3.5" />
                    </span>
                    <span className="truncate">{tQuickAction(t, action)}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="space-y-1.5 w-full flex flex-col items-center">
            {quickActions.map((action) => {
              const ActionIcon = action.icon;
              return (
                <button
                  key={action.name}
                  onClick={() => {
                    navigate(action.to);
                    onNavigate();
                  }}
                  title={tQuickAction(t, action)}
                  className="group relative w-10 h-10 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-[#1a2230]/70 dark:hover:bg-[#222c3e] border border-slate-200/70 dark:border-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition cursor-pointer shadow-2xs"
                >
                  <ActionIcon className="w-4 h-4" />
                  {/* Tooltip */}
                  <div className="hidden lg:flex absolute left-full ml-3 px-2.5 py-1 bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none whitespace-nowrap z-50 border border-slate-700/60">
                    {tQuickAction(t, action)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export default SidebarNav;
