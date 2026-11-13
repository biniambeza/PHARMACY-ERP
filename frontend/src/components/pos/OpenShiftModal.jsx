import { useState } from 'react';
import { Clock, AlertCircle } from 'lucide-react';
import { openShift } from '../../api/shiftApi';
import PosModal, { primaryBtn, secondaryBtn } from './PosModal';
import { inputCls, errMsg } from './posUtils';

// Opens a cash-drawer shift with an opening float. Props: { open, onClose, onOpened(shift), required }
const OpenShiftModal = ({ open, onClose, onOpened, required = false }) => {
  const [openingFloat, setOpeningFloat] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e?.preventDefault();
    const value = Number(openingFloat || 0);
    if (!Number.isFinite(value) || value < 0) {
      setError('Opening float must be zero or more');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await openShift({ openingFloat: value, notes });
      setOpeningFloat('');
      setNotes('');
      onOpened?.(res.shift);
    } catch (err) {
      setError(errMsg(err, 'Could not open the shift'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PosModal
      open={open}
      title="Open shift"
      icon={Clock}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={secondaryBtn} onClick={onClose}>
            {required ? 'Not now' : 'Sell without a shift'}
          </button>
          <button type="button" className={primaryBtn} onClick={submit} disabled={saving}>
            {saving ? 'Opening…' : 'Open shift'}
          </button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {required
            ? 'This pharmacy requires an open shift before selling. Count the cash in the drawer and enter it as the opening float.'
            : 'Open a shift to track your cash drawer. Count the cash in the drawer and enter it as the opening float.'}
        </p>
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Opening float (cash in drawer)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            autoFocus
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
            placeholder="0.00"
            className={`${inputCls} font-mono`}
          />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Notes (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} className={inputCls} />
        </div>
        {error && (
          <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}
      </form>
    </PosModal>
  );
};

export default OpenShiftModal;
