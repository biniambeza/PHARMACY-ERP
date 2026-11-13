import { useState } from 'react';
import { PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PosModal, { primaryBtn, secondaryBtn } from './PosModal';
import { formatMoney, formatDateTime } from '../../utils/format';
import { inputCls } from './posUtils';

// Hold the current cart under a label. Props: { open, onClose, onHold(label), suggestion }
export const HoldSaleModal = ({ open, onClose, onHold, suggestion }) => {
  const { t } = useTranslation('pos');
  const [label, setLabel] = useState('');
  const submit = (e) => {
    e?.preventDefault();
    onHold((label || suggestion || '').trim() || t('held.defaultLabel'));
    setLabel('');
  };
  return (
    <PosModal
      open={open}
      title={t('held.holdTitle')}
      icon={PauseCircle}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={secondaryBtn} onClick={onClose}>{t('common:buttons.cancel')}</button>
          <button type="button" className={primaryBtn} onClick={submit}>{t('held.hold')}</button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-2">
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('held.holdHint')}</p>
        <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder={suggestion || t('held.labelPlaceholder')} maxLength={60} className={inputCls} />
      </form>
    </PosModal>
  );
};

// List of held sales. Props: { open, onClose, held: [{ id, label, createdAt, cart, total }], onResume(entry), onDelete(id) }
const HeldSalesModal = ({ open, onClose, held, onResume, onDelete }) => {
  const { t } = useTranslation('pos');
  return (
  <PosModal open={open} title={t('held.listTitle', { count: held.length })} icon={PlayCircle} onClose={onClose}>
    {held.length === 0 ? (
      <p className="text-xs text-slate-500 text-center py-6">{t('held.empty')}</p>
    ) : (
      <ul className="space-y-2">
        {held.map((h) => (
          <li key={h.id} className="flex items-center gap-2 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{h.label}</div>
              <div className="text-[11px] text-slate-500">
                {t('held.summary', { count: h.cart.length, total: formatMoney(h.total || 0), time: formatDateTime(h.createdAt) })}
              </div>
            </div>
            <button type="button" onClick={() => onResume(h)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold cursor-pointer">
              <PlayCircle className="w-3 h-3" /> {t('held.resume')}
            </button>
            <button type="button" onClick={() => onDelete(h.id)} className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer" title={t('held.discard')}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>
    )}
  </PosModal>
  );
};

export default HeldSalesModal;
