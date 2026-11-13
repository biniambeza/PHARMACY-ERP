import { Bell } from 'lucide-react';

// Placeholder owned by the Notify agent (#5): replace with the unread count
// badge + dropdown backed by /api/notifications.
const NotificationBell = () => {
  return (
    <button
      type="button"
      title="Notifications"
      aria-label="Notifications"
      className="relative p-2 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition cursor-pointer"
    >
      <Bell className="w-5 h-5" />
    </button>
  );
};

export default NotificationBell;
