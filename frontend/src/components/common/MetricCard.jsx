import React from 'react';

/**
 * MetricCard - Modern enterprise KPI card with mini sparkline, change indicator, and custom styling
 */
const MetricCard = ({
  title,
  value,
  subValue,
  change,
  changeType = 'positive', // 'positive' | 'negative' | 'neutral'
  badgeText,
  badgeVariant = 'teal', // 'teal' | 'emerald' | 'amber' | 'rose' | 'indigo' | 'blue'
  icon,
  sparklineData = [12, 19, 15, 27, 22, 34, 30, 42],
  sparklineColor = '#0d9488', // teal-600
  sparklineId = 'sparkline-grad',
  className = '',
}) => {
  // Generate SVG path for sparkline
  const generateSparkline = (data) => {
    if (!data || data.length === 0) return { path: '', area: '' };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min === 0 ? 1 : max - min;
    const width = 100;
    const height = 28;
    const padding = 2;

    const points = data.map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - padding - ((val - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const path = `M ${points.join(' L ')}`;
    const area = `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`;

    return { path, area };
  };

  const { path, area } = generateSparkline(sparklineData);

  const badgeStyles = {
    teal: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/60',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
    rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60',
    blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
  };

  const changeTextStyles = {
    positive: 'text-emerald-600 dark:text-emerald-400',
    negative: 'text-rose-600 dark:text-rose-400',
    neutral: 'text-slate-500 dark:text-slate-400',
  };

  const renderIcon = () => {
    if (!icon) return null;
    if (React.isValidElement(icon)) return icon;
    if (typeof icon === 'function') {
      const IconComponent = icon;
      return <IconComponent className="w-4.5 h-4.5 text-teal-600 dark:text-teal-400" />;
    }
    return null;
  };

  return (
    <div
      className={`bg-white dark:bg-[#161c26] rounded-2xl border border-slate-100/90 dark:border-slate-800/80 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-md hover:border-slate-200 dark:hover:border-slate-700 ${className}`}
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {icon && (
            <div className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700/60 flex items-center justify-center text-slate-700 dark:text-slate-200 shrink-0 shadow-2xs">
              {renderIcon()}
            </div>
          )}
          <div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              {title}
            </span>
          </div>
        </div>

        {(badgeText || change) && (
          <span
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
              badgeStyles[badgeVariant] || badgeStyles.teal
            }`}
          >
            {badgeText || change}
          </span>
        )}
      </div>

      {/* Main Metric Value */}
      <div className="mt-3.5 mb-2">
        <div className="text-2xl sm:text-[28px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">
          {value}
        </div>
        {subValue && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1.5">
            {change && (
              <span className={`font-semibold ${changeTextStyles[changeType]}`}>
                {change}
              </span>
            )}
            <span>{subValue}</span>
          </p>
        )}
      </div>

      {/* Mini SVG Sparkline */}
      {sparklineData && sparklineData.length > 1 && (
        <div className="mt-2 pt-2 border-t border-slate-100/70 dark:border-slate-800/60">
          <div className="h-7 w-full overflow-hidden">
            <svg
              viewBox="0 0 100 28"
              preserveAspectRatio="none"
              className="w-full h-full overflow-visible"
            >
              <defs>
                <linearGradient id={sparklineId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={sparklineColor} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={sparklineColor} stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path d={area} fill={`url(#${sparklineId})`} />
              <path
                d={path}
                fill="none"
                stroke={sparklineColor}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      )}
    </div>
  );
};

export default MetricCard;
