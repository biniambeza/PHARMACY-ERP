import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck, AlertTriangle, AlertOctagon, Info, CheckCircle2, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../api/notificationApi';

const POLL_MS = 60 * 1000;

const SEVERITY_STYLES = {
  critical: { icon: AlertOctagon, color: 'text-rose-500 bg-rose-50 dark:bg-rose-950/40' },
  warning: { icon: AlertTriangle, color: 'text-amber-500 bg-amber-50 dark:bg-amber-950/40' },
  success: { icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/40' },
  info: { icon: Info, color: 'text-sky-500 bg-sky-50 dark:bg-sky-950/40' },
};

const timeAgo = (t, d) => {
  const diff = Math.max(0, Date.now() - new Date(d).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('notificationBell.justNow');
  if (m < 60) return t('notificationBell.minutesAgo', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('notificationBell.hoursAgo', { n: h });
  const days = Math.floor(h / 24);
  return t('notificationBell.daysAgo', { n: days });
};

const NotificationBell = () => {
  const { t } = useTranslation('ui');
  const { can } = useAuth();
  const allowed = can('notifications:view');
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);

  const refreshCount = useCallback(async () => {
    try {
      const data = await getUnreadCount();
      setUnread(data.unreadCount || 0);
    } catch {
      // Network errors are ignored; the next poll retries.
    }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotifications({ limit: 10 });
      setItems(data.notifications || []);
      setUnread(data.unreadCount || 0);
    } catch {
      // keep previous list
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll the unread count every 60s while the tab is visible.
  useEffect(() => {
    if (!allowed) return undefined;
    let timer = null;
    const start = () => {
      if (timer) return;
      refreshCount();
      timer = setInterval(refreshCount, POLL_MS);
    };
    const stop = () => {
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [allowed, refreshCount]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!allowed) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  };

  const handleItemClick = async (n) => {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      markNotificationRead(n._id).catch(() => {});
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  };

  const handleMarkAll = async () => {
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((x) => ({ ...x, read: true })));
      setUnread(0);
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={toggle}
        title={t('notificationBell.title')}
        aria-label={unread ? t('notificationBell.ariaUnread', { n: unread }) : t('notificationBell.title')}
        aria-haspopup="true"
        aria-expanded={open}
        className="relative p-2 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-[#161c26]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[340px] max-w-[calc(100vw-2rem)] bg-white dark:bg-[#161c26] border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xl shadow-slate-900/10 dark:shadow-black/40 z-50 overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{t('notificationBell.title')}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('notificationBell.unread', { n: unread })}</p>
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                {t('notificationBell.markAllRead')}
              </button>
            )}
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {loading && !items.length ? (
              <div className="p-6 flex justify-center">
                <span className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
              </div>
            ) : !items.length ? (
              <div className="p-8 text-center">
                <Bell className="w-6 h-6 mx-auto text-slate-300 dark:text-slate-600" />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t('notificationBell.allCaughtUp')}</p>
              </div>
            ) : (
              items.map((n) => {
                const style = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info;
                const Icon = style.icon;
                return (
                  <button
                    key={n._id}
                    type="button"
                    onClick={() => handleItemClick(n)}
                    className={`w-full text-left flex gap-3 px-4 py-3 border-b border-slate-50 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer ${
                      n.read ? 'opacity-70' : ''
                    }`}
                  >
                    <span className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center ${style.color}`}>
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-start gap-2">
                        <span className={`flex-1 text-xs text-slate-900 dark:text-white ${n.read ? 'font-medium' : 'font-bold'}`}>
                          {n.title}
                        </span>
                        {!n.read && <span className="w-2 h-2 mt-1 rounded-full bg-emerald-500 shrink-0" />}
                      </span>
                      {n.message && (
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                          {n.message}
                        </span>
                      )}
                      <span className="block text-[10px] text-slate-400 mt-1">{timeAgo(t, n.createdAt)}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/pharmacy/notifications');
            }}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer"
          >
            {t('notificationBell.viewAll')}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
