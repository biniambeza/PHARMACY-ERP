import { useEffect, useState } from 'react';
import { Megaphone, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { getActiveAnnouncements } from '../../api/announcementApi';
import { useAuth } from '../../context/AuthContext';

// Platform announcements shown at the top of the pharmacy layout (#24).
// Dismissals are stored per browser in localStorage (keyed by id + last update,
// so an edited announcement shows again).
const STORAGE_KEY = 'dismissedAnnouncements';
const REFRESH_MS = 10 * 60 * 1000;

const readDismissed = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const dismissKey = (a) => `${a._id}:${a.updatedAt || ''}`;

const STYLES = {
  info: {
    box: 'bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/40 dark:border-sky-800/60 dark:text-sky-100',
    icon: Info,
    iconClass: 'text-sky-600 dark:text-sky-400',
  },
  success: {
    box: 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800/60 dark:text-emerald-100',
    icon: CheckCircle2,
    iconClass: 'text-emerald-600 dark:text-emerald-400',
  },
  warning: {
    box: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800/60 dark:text-amber-100',
    icon: AlertTriangle,
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  critical: {
    box: 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800/60 dark:text-rose-100',
    icon: Megaphone,
    iconClass: 'text-rose-600 dark:text-rose-400',
  },
};

const AnnouncementBanner = () => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [dismissed, setDismissed] = useState(readDismissed);
  const isTenant = user?.role === 'pharmacist';

  useEffect(() => {
    if (!isTenant) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getActiveAnnouncements();
        if (!cancelled) setAnnouncements(data.announcements || []);
      } catch {
        // Announcements are optional; never break the layout
      }
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isTenant]);

  const dismiss = (a) => {
    const activeKeys = new Set(announcements.map(dismissKey));
    // Keep only keys of announcements that are still active, plus this one
    const next = [...dismissed.filter((k) => activeKeys.has(k)), dismissKey(a)];
    setDismissed(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

  const visible = announcements.filter((a) => !dismissed.includes(dismissKey(a)));
  if (!isTenant || visible.length === 0) return null;

  return (
    <div className="space-y-2 mb-4" role="region" aria-label="Announcements">
      {visible.map((a) => {
        const style = STYLES[a.severity] || STYLES.info;
        const Icon = style.icon;
        return (
          <div
            key={a._id}
            role={a.severity === 'critical' ? 'alert' : 'status'}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-xs shadow-2xs ${style.box}`}
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.iconClass}`} />
            <div className="flex-1 min-w-0">
              <p className="font-bold">{a.title}</p>
              <p className="mt-0.5 whitespace-pre-line opacity-90">{a.message}</p>
            </div>
            <button
              type="button"
              onClick={() => dismiss(a)}
              title="Dismiss"
              aria-label="Dismiss announcement"
              className="p-1 rounded-lg opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default AnnouncementBanner;
