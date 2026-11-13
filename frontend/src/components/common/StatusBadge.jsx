import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * StatusBadge - Reusable enterprise status indicator pill with dot
 */
const StatusBadge = ({ status = 'active', label, dot = true, size = 'md' }) => {
  const { t } = useTranslation('ui');
  const normStatus = String(status || '').toLowerCase().trim();

  const config = {
    active: {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
      dotBg: 'bg-emerald-500',
      defaultLabel: t('statusBadge.active'),
      pulse: true,
    },
    operational: {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
      dotBg: 'bg-emerald-500',
      defaultLabel: t('statusBadge.operational'),
      pulse: true,
    },
    completed: {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
      dotBg: 'bg-emerald-500',
      defaultLabel: t('statusBadge.completed'),
    },
    paid: {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
      dotBg: 'bg-emerald-500',
      defaultLabel: t('statusBadge.paid'),
    },
    received: {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
      dotBg: 'bg-emerald-500',
      defaultLabel: t('statusBadge.received'),
    },
    healthy: {
      bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
      dotBg: 'bg-emerald-500',
      defaultLabel: t('statusBadge.healthy'),
    },
    suspended: {
      bg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
      dotBg: 'bg-rose-500',
      defaultLabel: t('statusBadge.suspended'),
    },
    cancelled: {
      bg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
      dotBg: 'bg-rose-500',
      defaultLabel: t('statusBadge.cancelled'),
    },
    out_of_stock: {
      bg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
      dotBg: 'bg-rose-500',
      defaultLabel: t('statusBadge.out_of_stock'),
    },
    critical: {
      bg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
      dotBg: 'bg-rose-500',
      defaultLabel: t('statusBadge.critical'),
    },
    pending: {
      bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
      dotBg: 'bg-amber-500',
      defaultLabel: t('statusBadge.pending'),
    },
    ordered: {
      bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
      dotBg: 'bg-amber-500',
      defaultLabel: t('statusBadge.ordered'),
    },
    low_stock: {
      bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
      dotBg: 'bg-amber-500',
      defaultLabel: t('statusBadge.low_stock'),
    },
    warning: {
      bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
      dotBg: 'bg-amber-500',
      defaultLabel: t('statusBadge.warning'),
    },
    draft: {
      bg: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      dotBg: 'bg-slate-400',
      defaultLabel: t('statusBadge.draft'),
    },
    depleted: {
      bg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
      dotBg: 'bg-blue-500',
      defaultLabel: t('statusBadge.depleted'),
    },
  };

  const current = config[normStatus] || {
    bg: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    dotBg: 'bg-slate-400',
    defaultLabel: normStatus || t('statusBadge.status'),
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-[11px]',
    lg: 'px-3 py-1.5 text-xs',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border shadow-2xs ${
        sizeClasses[size] || sizeClasses.md
      } ${current.bg}`}
    >
      {dot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${current.dotBg} ${
            current.pulse ? 'animate-pulse' : ''
          }`}
        />
      )}
      <span className="capitalize">{label || current.defaultLabel}</span>
    </span>
  );
};

export default StatusBadge;
