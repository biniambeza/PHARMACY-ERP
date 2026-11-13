import { Construction } from 'lucide-react';

// Shared placeholder used by scaffolded pages until their owner builds them.
const ComingSoon = ({ title, description = 'This module is being built and will be available soon.', icon: Icon = Construction }) => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">{title}</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
      </div>
      <div className="bg-white dark:bg-[#161c26] border border-slate-100/90 dark:border-slate-800/80 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] py-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3 border border-emerald-100 dark:border-emerald-900/50">
          <Icon className="w-6 h-6" />
        </div>
        <p className="text-sm font-bold text-slate-900 dark:text-white">Coming soon</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">{title} is not available yet.</p>
      </div>
    </div>
  );
};

export default ComingSoon;
