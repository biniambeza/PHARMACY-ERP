import { useEffect } from 'react';
import { X } from 'lucide-react';

// Simple modal shell used by the POS / Shifts screens. Esc closes it.
const PosModal = ({ open, title, icon: Icon, onClose, children, footer, wide = false }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm" data-pos-modal="true">
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] flex flex-col bg-white dark:bg-[#161c26] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl`}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto custom-scrollbar">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
};

export const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
export const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl transition cursor-pointer disabled:opacity-50';

export default PosModal;
