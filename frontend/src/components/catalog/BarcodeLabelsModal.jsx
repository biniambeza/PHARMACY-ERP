import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Barcode, Printer, Wand2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CatalogModal from './CatalogModal';
import { generateBarcode } from '../../api/medicineApi';
import { useAuth } from '../../context/AuthContext';
import { formatMoney } from '../../utils/format';
import { inputCls, primaryBtn, secondaryBtn, errorBox } from './styles';

// One CODE128 barcode rendered as SVG.
const BarcodeSvg = ({ value }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        width: 1.4,
        height: 34,
        fontSize: 11,
        margin: 0,
        displayValue: true,
      });
    } catch {
      // invalid value: leave empty
    }
  }, [value]);
  return <svg ref={ref} />;
};

const PAGE_CSS = `
  @page { margin: 8mm; }
  body { font-family: Arial, sans-serif; margin: 0; }
`;

const LABEL_CSS = `
  .bc-sheet { display: flex; flex-wrap: wrap; gap: 3mm; }
  .bc-label { width: 62mm; height: 32mm; border: 1px dashed #bbb; padding: 2mm; box-sizing: border-box;
           display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden;
           page-break-inside: avoid; color: #000; background: #fff; }
  .bc-label .bc-name { font-size: 10pt; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  .bc-label .bc-meta { font-size: 8pt; display: flex; gap: 4mm; }
  .bc-label svg { max-width: 100%; height: auto; }
`;

// Printable label sheet for the selected medicines: name, strength, price and a CODE128 barcode.
const BarcodeLabelsModal = ({ medicines, onClose, onChanged }) => {
  const { t } = useTranslation('medicines');
  const { can } = useAuth();
  const [items, setItems] = useState(() => medicines.map((m) => ({ medicine: m, copies: 1 })));
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const sheetRef = useRef(null);

  const setCopies = (id, copies) =>
    setItems((prev) => prev.map((i) => (i.medicine._id === id ? { ...i, copies } : i)));

  const handleGenerate = async (id) => {
    setBusyId(id);
    setError('');
    try {
      const res = await generateBarcode(id);
      setItems((prev) => prev.map((i) => (i.medicine._id === id ? { ...i, medicine: res.medicine } : i)));
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || t('labelsModal.errGenerate'));
    } finally {
      setBusyId(null);
    }
  };

  const printable = items.filter((i) => i.medicine.barcode && Number(i.copies) > 0);

  const handlePrint = () => {
    if (!sheetRef.current) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
      setError(t('labelsModal.allowPopups'));
      return;
    }
    win.document.write(
      `<!doctype html><html><head><title>${t('labelsModal.docTitle')}</title><style>${PAGE_CSS}</style></head><body>${sheetRef.current.innerHTML}</body></html>`
    );
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 250);
  };

  return (
    <CatalogModal
      title={t('labelsModal.title')}
      subtitle={t('labelsModal.subtitle')}
      icon={Barcode}
      onClose={onClose}
      maxWidth="max-w-4xl"
    >
      {error && <div className={`${errorBox} mb-4`}>{error}</div>}
      <div className="space-y-2 mb-5">
        {items.map(({ medicine, copies }) => (
          <div
            key={medicine._id}
            className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800"
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{medicine.name}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {medicine.barcode || t('labelsModal.noBarcode')}
              </p>
            </div>
            {!medicine.barcode && can('medicine:manage') && (
              <button
                type="button"
                className={secondaryBtn}
                disabled={busyId === medicine._id}
                onClick={() => handleGenerate(medicine._id)}
              >
                <Wand2 className="w-4 h-4" /> {t('labelsModal.generate')}
              </button>
            )}
            <label className="text-[11px] text-slate-500 flex items-center gap-1.5">
              {t('labelsModal.copies')}
              <input
                type="number"
                min="0"
                max="200"
                className={`${inputCls} w-20 font-mono`}
                value={copies}
                disabled={!medicine.barcode}
                onChange={(e) => setCopies(medicine._id, Math.max(0, Math.min(200, parseInt(e.target.value, 10) || 0)))}
              />
            </label>
          </div>
        ))}
      </div>

      <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-white max-h-80 overflow-y-auto">
        {printable.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6">{t('labelsModal.nothing')}</p>
        ) : (
          <div ref={sheetRef}>
            <style>{LABEL_CSS}</style>
            <div className="bc-sheet">
              {printable.flatMap(({ medicine, copies }) =>
                Array.from({ length: copies }, (_, n) => (
                  <div className="bc-label" key={`${medicine._id}-${n}`}>
                    <div className="bc-name">{medicine.name}</div>
                    <div className="bc-meta">
                      {medicine.strength && <span>{medicine.strength}</span>}
                      <strong>{formatMoney(medicine.price)}</strong>
                    </div>
                    <BarcodeSvg value={medicine.barcode} />
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 mt-5 border-t border-slate-100 dark:border-slate-800/80">
        <button type="button" className={secondaryBtn} onClick={onClose}>{t('common:buttons.close')}</button>
        <button type="button" className={primaryBtn} disabled={!printable.length} onClick={handlePrint}>
          <Printer className="w-4 h-4" /> {t('labelsModal.print', { count: printable.reduce((s, i) => s + Number(i.copies), 0) })}
        </button>
      </div>
    </CatalogModal>
  );
};

export default BarcodeLabelsModal;
