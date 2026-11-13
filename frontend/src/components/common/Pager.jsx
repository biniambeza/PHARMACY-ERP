// Previous / next pager for server-paged lists. Renders nothing for a single page.
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const btnCls =
  'p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer';

export default function Pager({ page, pages, total, shown, onChange, disabled = false }) {
  const { t } = useTranslation('common');
  if (!pages || pages <= 1) return null;
  return (
    <nav aria-label={t('pager.label')} className="flex items-center justify-end gap-2 text-xs text-slate-500 dark:text-slate-400">
      {typeof total === 'number' && typeof shown === 'number' && (
        <span className="mr-auto">{t('pager.showing', { shown, total })}</span>
      )}
      <span>{t('pager.pageOf', { page, pages })}</span>
      <button type="button" onClick={() => onChange(Math.max(1, page - 1))} disabled={disabled || page <= 1} aria-label={t('buttons.previous')} className={btnCls}>
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button type="button" onClick={() => onChange(Math.min(pages, page + 1))} disabled={disabled || page >= pages} aria-label={t('buttons.next')} className={btnCls}>
        <ChevronRight className="w-4 h-4" />
      </button>
    </nav>
  );
}
