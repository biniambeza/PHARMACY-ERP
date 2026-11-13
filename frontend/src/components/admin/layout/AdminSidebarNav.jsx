import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { adminNavItems } from './adminNav';
import AdminQuickActions from './AdminQuickActions';

// Scrollable sidebar body: navigation links followed by quick actions.
const AdminSidebarNav = ({ collapsed, onCloseMobile, onProvision, onSyncStats }) => {
  const { t } = useTranslation('admin');
  return (
    <div className={`flex-1 overflow-y-auto ${collapsed ? 'px-2.5 py-3 space-y-3' : 'px-3.5 py-4 space-y-4'} custom-scrollbar`}>
      <div className="space-y-1">
        {adminNavItems.map((item) => {
          const IconComponent = item.icon;
          const itemName = t(item.nameKey);
          const itemBadge = item.badgeKey ? t(item.badgeKey) : null;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onCloseMobile}
              title={collapsed ? itemName : undefined}
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
                      <span className="flex-1 truncate">{itemName}</span>
                      {itemBadge && (
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            isActive
                              ? 'bg-emerald-100/90 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {itemBadge}
                        </span>
                      )}
                    </>
                  ) : (
                    /* Tooltip for collapsed mode */
                    <div className="hidden lg:flex absolute left-full ml-3 px-2.5 py-1.5 bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none whitespace-nowrap z-50 items-center gap-2 border border-slate-700/60">
                      <span>{itemName}</span>
                      {itemBadge && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 font-mono">
                          {itemBadge}
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

      <AdminQuickActions collapsed={collapsed} onProvision={onProvision} onSyncStats={onSyncStats} />
    </div>
  );
};

export default AdminSidebarNav;
