import React from 'react';

/**
 * SkeletonLoader - Enterprise shimmer placeholders for metric cards and tables
 */
export const MetricCardSkeleton = () => (
  <div className="bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/80 dark:border-slate-800/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] animate-pulse space-y-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800" />
        <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
      </div>
      <div className="h-4 w-12 bg-slate-200 dark:bg-slate-800 rounded-full" />
    </div>
    <div className="space-y-2">
      <div className="h-8 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
      <div className="h-3 w-40 bg-slate-100 dark:bg-slate-800/60 rounded" />
    </div>
    <div className="h-6 w-full bg-slate-100 dark:bg-slate-800/40 rounded mt-2" />
  </div>
);

export const TableSkeleton = ({ rows = 5, cols = 5 }) => (
  <div className="w-full animate-pulse space-y-3">
    <div className="h-10 bg-slate-100 dark:bg-slate-800/60 rounded-xl" />
    {Array.from({ length: rows }).map((_, rIdx) => (
      <div
        key={rIdx}
        className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 dark:border-slate-800/60"
      >
        {Array.from({ length: cols }).map((_, cIdx) => (
          <div
            key={cIdx}
            className="h-4 bg-slate-100 dark:bg-slate-800 rounded"
            style={{ width: `${Math.max(15, 90 / cols)}%` }}
          />
        ))}
      </div>
    ))}
  </div>
);

export const CardSkeleton = ({ height = 'h-64' }) => (
  <div
    className={`bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/80 dark:border-slate-800/80 p-5 shadow-[0_2px_12px_rgba(0,0,0,0.04)] animate-pulse ${height} flex flex-col justify-between`}
  >
    <div className="flex justify-between items-center">
      <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded" />
      <div className="h-4 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
    </div>
    <div className="h-32 bg-slate-100 dark:bg-slate-800/40 rounded-xl flex items-center justify-center" />
    <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
  </div>
);

export default { MetricCardSkeleton, TableSkeleton, CardSkeleton };
