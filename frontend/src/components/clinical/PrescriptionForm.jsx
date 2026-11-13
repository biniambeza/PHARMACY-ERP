import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Upload, FileText, AlertCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createPrescription, MAX_RX_IMAGE_BYTES, RX_IMAGE_TYPES } from '../../api/clinicalApi';
import { getMedicines } from '../../api/medicineApi';
import { inputCls, labelCls, primaryBtn, secondaryBtn, errMsg, readFileAsDataUrl } from './ui';

const today = () => new Date().toISOString().slice(0, 10);
const emptyItem = () => ({
  medicineId: '', name: '', dose: '', frequency: '', durationDays: '', quantityPrescribed: '', refillsAllowed: '0',
});

// Medicine name input with catalog suggestions; free text is allowed.
const MedicineInput = ({ value, onSelect, onText }) => {
  const { t } = useTranslation('patients');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open || !value || value.length < 2) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await getMedicines({ search: value, page: 1, limit: 8 });
        if (!cancelled) setResults(data.medicines || []);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, open]);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={boxRef}>
      <input
        className={inputCls}
        value={value}
        placeholder={t('rx.medicine')}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onText(e.target.value);
          setOpen(true);
        }}
      />
      {open && value && value.length >= 2 && results.length > 0 && (
        <div className="absolute z-40 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-[#1b2230] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl">
          {results.map((m) => (
            <button
              type="button"
              key={m._id}
              onClick={() => {
                onSelect(m);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer text-slate-800 dark:text-slate-100"
            >
              {m.name} {m.strength && <span className="text-slate-400">{m.strength}</span>}
              {m.isControlled && <span className="ml-1 text-[10px] font-bold text-rose-600">{t('rx.controlledTag')}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Create a prescription for a patient (with optional scanned image/PDF, max 700KB).
 * Props:
 *   patientId: string (required) — the patient the prescription belongs to
 *   onCreated(prescription): called after a successful save (prescription has no image field; hasImage flag)
 *   onCancel(): optional; shows a Cancel button when provided
 *   initialItems: optional [{ medicineId, name, quantityPrescribed }] to prefill (e.g. from the POS cart)
 * Needs the `prescription:manage` permission.
 */
const PrescriptionForm = ({ patientId, onCreated, onCancel, initialItems }) => {
  const { t } = useTranslation('patients');
  const [form, setForm] = useState({
    externalNumber: '', prescriberName: '', prescriberLicense: '', facility: '',
    issueDate: today(), expiryDate: '', notes: '',
  });
  const [items, setItems] = useState(() =>
    initialItems?.length
      ? initialItems.map((it) => ({ ...emptyItem(), ...it, quantityPrescribed: String(it.quantityPrescribed ?? '') }))
      : [emptyItem()]
  );
  const [file, setFile] = useState(null); // { dataUrl, name, type }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  const setItem = (i, patch) => setItems((list) => list.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const handleFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError('');
    if (!RX_IMAGE_TYPES.includes(f.type)) return setError(t('rx.errors.fileType'));
    if (f.size > MAX_RX_IMAGE_BYTES) return setError(t('rx.errors.fileTooLarge'));
    try {
      setFile({ dataUrl: await readFileAsDataUrl(f), name: f.name, type: f.type });
    } catch {
      setError(t('rx.errors.fileRead'));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!patientId) return setError(t('rx.errors.noPatient'));
    if (!form.prescriberName.trim()) return setError(t('rx.errors.prescriberRequired'));
    const cleanItems = items
      .filter((it) => it.medicineId || it.name.trim())
      .map((it) => ({
        medicineId: it.medicineId || undefined,
        name: it.name,
        dose: it.dose,
        frequency: it.frequency,
        durationDays: Number(it.durationDays) || 0,
        quantityPrescribed: Number(it.quantityPrescribed) || 0,
        refillsAllowed: Number(it.refillsAllowed) || 0,
      }));
    setSaving(true);
    try {
      const res = await createPrescription({
        ...form,
        patientId,
        expiryDate: form.expiryDate || null,
        items: cleanItems,
        ...(file ? { image: file.dataUrl, imageName: file.name } : {}),
      });
      onCreated?.(res.prescription);
    } catch (err) {
      setError(errMsg(err, t('rx.errors.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs border border-rose-200 dark:border-rose-900/50">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>{t('rx.prescriberName')} *</label>
          <input className={inputCls} value={form.prescriberName} onChange={set('prescriberName')} />
        </div>
        <div>
          <label className={labelCls}>{t('rx.prescriberLicense')}</label>
          <input className={inputCls} value={form.prescriberLicense} onChange={set('prescriberLicense')} />
        </div>
        <div>
          <label className={labelCls}>{t('rx.facility')}</label>
          <input className={inputCls} value={form.facility} onChange={set('facility')} />
        </div>
        <div>
          <label className={labelCls}>{t('rx.paperNumber')}</label>
          <input className={inputCls} value={form.externalNumber} onChange={set('externalNumber')} />
        </div>
        <div>
          <label className={labelCls}>{t('rx.issueDate')} *</label>
          <input type="date" className={inputCls} value={form.issueDate} onChange={set('issueDate')} />
        </div>
        <div>
          <label className={labelCls}>{t('rx.expiryDate')}</label>
          <input type="date" className={inputCls} value={form.expiryDate} onChange={set('expiryDate')} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={`${labelCls} mb-0`}>{t('rx.items')}</label>
          <button
            type="button"
            onClick={() => setItems((l) => [...l, emptyItem()])}
            className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> {t('rx.addItem')}
          </button>
        </div>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-center p-2 rounded-xl bg-slate-50/60 dark:bg-slate-800/30">
              <div className="col-span-2 sm:col-span-4">
                <MedicineInput
                  value={it.name}
                  onText={(name) => setItem(i, { name, medicineId: '' })}
                  onSelect={(m) => setItem(i, { name: m.name, medicineId: m._id })}
                />
              </div>
              <input className={`${inputCls} sm:col-span-2`} placeholder={t('rx.dose')} value={it.dose} onChange={(e) => setItem(i, { dose: e.target.value })} />
              <input className={`${inputCls} sm:col-span-2`} placeholder={t('rx.frequency')} value={it.frequency} onChange={(e) => setItem(i, { frequency: e.target.value })} />
              <input type="number" min="0" className={`${inputCls} sm:col-span-1`} placeholder={t('rx.days')} title={t('rx.durationTitle')} value={it.durationDays} onChange={(e) => setItem(i, { durationDays: e.target.value })} />
              <input type="number" min="0" className={`${inputCls} sm:col-span-1`} placeholder={t('rx.qty')} title={t('rx.qtyTitle')} value={it.quantityPrescribed} onChange={(e) => setItem(i, { quantityPrescribed: e.target.value })} />
              <input type="number" min="0" className={`${inputCls} sm:col-span-1`} placeholder={t('rx.refills')} title={t('rx.refillsTitle')} value={it.refillsAllowed} onChange={(e) => setItem(i, { refillsAllowed: e.target.value })} />
              <button
                type="button"
                onClick={() => setItems((l) => (l.length > 1 ? l.filter((_, idx) => idx !== i) : [emptyItem()]))}
                className="sm:col-span-1 p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer justify-self-end"
                title={t('rx.removeItem')}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{t('rx.scanLabel')}</label>
          {file ? (
            <div className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
              {file.type === 'application/pdf' ? (
                <FileText className="w-8 h-8 text-slate-400" />
              ) : (
                <img src={file.dataUrl} alt={t('rx.previewAlt')} className="w-10 h-10 object-cover rounded-lg" />
              )}
              <span className="text-xs text-slate-700 dark:text-slate-200 truncate flex-1">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} aria-label={t('rx.removeFile')} className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-xs text-slate-500 hover:border-emerald-500 hover:text-emerald-600 cursor-pointer">
              <Upload className="w-4 h-4" /> {t('rx.uploadScan')}
              <input type="file" accept={RX_IMAGE_TYPES.join(',')} className="hidden" onChange={handleFile} />
            </label>
          )}
        </div>
        <div>
          <label className={labelCls}>{t('fields.notes')}</label>
          <textarea rows={2} className={inputCls} value={form.notes} onChange={set('notes')} />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && <button type="button" onClick={onCancel} className={secondaryBtn}>{t('common:buttons.cancel')}</button>}
        <button type="submit" disabled={saving} className={primaryBtn}>{saving ? t('saving') : t('rx.save')}</button>
      </div>
    </form>
  );
};

export default PrescriptionForm;
