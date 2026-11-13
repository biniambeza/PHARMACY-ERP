import { useTranslation } from 'react-i18next';
import { Moon, Sun, LogOut } from 'lucide-react';
import { translateRoleLabel } from './roleLabel';

// Pharmacy sidebar footer: theme toggle and signed-in user chip with sign out.
const SidebarFooter = ({ user, roleLabel: roleProp, collapsed, isDark, onToggleTheme, onLogout }) => {
  const { t } = useTranslation('ui');
  const roleLabel = translateRoleLabel(t, roleProp);
  const userName = user?.name || t('layout.defaultUser');
  const switchLabel = isDark ? t('layout.switchToLight') : t('layout.switchToDark');
  return (
    <div className={`p-3 border-t border-slate-200/80 dark:border-[#262e3f] bg-white dark:bg-[#161c26] shrink-0 space-y-2 ${collapsed ? 'flex flex-col items-center' : ''}`}>
      {/* Light / Dark Mode Toggle Button */}
      {!collapsed ? (
        <button
          onClick={onToggleTheme}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-slate-700 dark:bg-[#1f2635] dark:border-[#2b3548] dark:text-slate-200 transition cursor-pointer shadow-2xs"
        >
          <div className="flex items-center gap-2">
            {isDark ? (
              <Moon className="w-4 h-4 text-emerald-400" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
            <span>{isDark ? t('layout.darkMode') : t('layout.lightMode')}</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white dark:bg-[#161c26] text-slate-500 dark:text-slate-400 font-mono border border-slate-200/60 dark:border-slate-700/60">
            {t('layout.toggle')}
          </span>
        </button>
      ) : (
        <button
          onClick={onToggleTheme}
          title={switchLabel}
          aria-label={switchLabel}
          className="group relative w-10 h-10 rounded-xl flex items-center justify-center bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-slate-700 dark:bg-[#1f2635] dark:border-[#2b3548] dark:text-slate-200 transition cursor-pointer shadow-2xs"
        >
          {isDark ? (
            <Moon className="w-4.5 h-4.5 text-emerald-400" />
          ) : (
            <Sun className="w-4.5 h-4.5 text-amber-500" />
          )}
          {/* Tooltip */}
          <div className="hidden lg:flex absolute left-full ml-3 px-2.5 py-1 bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none whitespace-nowrap z-50 border border-slate-700/60">
            {switchLabel}
          </div>
        </button>
      )}

      {/* User Profile Info Chip */}
      {!collapsed ? (
        <div className="flex items-center justify-between px-1.5 py-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-emerald-600 to-emerald-400 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'P'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                {userName}
              </p>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold capitalize truncate">
                {roleLabel}
              </p>
            </div>
          </div>
          <button
            onClick={onLogout}
            title={t('layout.signOut')}
            aria-label={t('layout.signOut')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 pt-1">
          <div
            title={`${userName} (${roleLabel})`}
            className="w-9 h-9 rounded-full bg-gradient-to-tr from-emerald-600 to-emerald-400 text-white font-bold text-xs flex items-center justify-center shadow-xs cursor-default"
          >
            {user?.name ? user.name.charAt(0).toUpperCase() : 'P'}
          </div>
          <button
            onClick={onLogout}
            title={t('layout.signOut')}
            aria-label={t('layout.signOut')}
            className="group relative p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 transition cursor-pointer"
          >
            <LogOut className="w-4.5 h-4.5" />
            <div className="hidden lg:flex absolute left-full ml-3 px-2.5 py-1 bg-slate-900 dark:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none whitespace-nowrap z-50 border border-slate-700/60">
              {t('layout.signOut')}
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

export default SidebarFooter;
