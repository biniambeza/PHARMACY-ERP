import { useTranslation } from 'react-i18next';
import { formatMoney } from '../../utils/format';
import { panelCls } from './panel';

const toPoints = (series, key, maxVal) =>
  series.map((p, idx) => ({
    x: (idx / Math.max(series.length - 1, 1)) * 500,
    y: 145 - (p[key] / maxVal) * 125,
  }));

/** Sales & procurement dual-line SVG chart. */
const SalesTrendChart = ({ revenueVsExpenses, grossProfit }) => {
  const { t } = useTranslation('dashboard');

  const maxChartVal = Math.max(...revenueVsExpenses.flatMap((d) => [d.revenue, d.expenses]), 100);

  const renderLines = () => {
    const pts = toPoints(revenueVsExpenses, 'revenue', maxChartVal);
    const expPts = toPoints(revenueVsExpenses, 'expenses', maxChartVal);
    const join = (list) => list.map((pt) => `${pt.x},${pt.y}`).join(' L ');
    const lineRev = `M ${join(pts)}`;
    const areaRev = `M 0,160 L ${join(pts)} L 500,160 Z`;
    const lineExp = `M ${join(expPts)}`;
    const areaExp = `M 0,160 L ${join(expPts)} L 500,160 Z`;

    return (
      <>
        {/* Area fills */}
        <path d={areaRev} fill="url(#tealLineGrad)" />
        <path d={areaExp} fill="url(#indigoLineGrad)" />

        {/* Revenue Line */}
        <path d={lineRev} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {/* Expenses Line */}
        <path
          d={lineExp}
          fill="none"
          stroke="#6366f1"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="5 3"
        />

        {/* Nodes */}
        {pts.map((pt, i) => (
          <circle key={i} cx={pt.x} cy={pt.y} r="4" className="fill-white dark:fill-[#161c26] stroke-emerald-600 stroke-[2.5]" />
        ))}
      </>
    );
  };

  return (
    <div className={`lg:col-span-6 ${panelCls}`}>
      <div>
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800/80">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t('chart.title')}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('chart.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> {t('chart.revenue')}
            </span>
            <span className="flex items-center gap-1.5 text-indigo-500 dark:text-indigo-400">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> {t('chart.procurement')}
            </span>
          </div>
        </div>

        {/* Custom SVG Dual-Line Visualization */}
        <div className="relative h-52 w-full pt-2">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 500 160" preserveAspectRatio="none">
            <defs>
              <linearGradient id="tealLineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="indigoLineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Subtle horizontal grid lines */}
            {[0.25, 0.5, 0.75, 1].map((pct, idx) => (
              <line
                key={idx}
                x1="0"
                y1={160 - pct * 140}
                x2="500"
                y2={160 - pct * 140}
                stroke="currentColor"
                strokeWidth="1"
                className="text-slate-100 dark:text-slate-800/80"
                strokeDasharray="4 4"
              />
            ))}

            {revenueVsExpenses.length > 0 && renderLines()}
          </svg>
        </div>

        {/* X-Axis Labels */}
        <div className="flex justify-between text-[11px] font-medium text-slate-400 mt-2 px-1">
          {revenueVsExpenses.map((p, idx) => (
            <span key={idx}>{p.label || p.date}</span>
          ))}
        </div>
      </div>

      <div className="pt-3 mt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
        <span>{t('chart.footer')}</span>
        <span className="text-emerald-600 dark:text-emerald-400 font-bold">{t('chart.grossProfit', { amount: formatMoney(grossProfit) })}</span>
      </div>
    </div>
  );
};

export default SalesTrendChart;
