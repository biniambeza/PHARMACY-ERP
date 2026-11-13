import { useEffect, useState } from 'react';
import { X, FileText, Download, Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPrescription, updatePrescription } from '../../api/clinicalApi';
import { useAuth } from '../../context/AuthContext';
import StatusBadge from '../common/StatusBadge';
import { formatDate } from '../../utils/format';
import { secondaryBtn, errMsg } from './ui';

// Turns a data URL into an object URL (PDFs do not render reliably from data: URLs).
const dataUrlToObjectUrl = (dataUrl) => {
  const [meta, b64] = dataUrl.split(',');
  const type = meta.slice(5, meta.indexOf(';'));
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type }));
};

/**
 * Shows a prescription with its items and scanned image/PDF.
 * Props: prescriptionId (string), onClose(), onChanged(prescription)? (after cancelling)
 */
const PrescriptionViewer = ({ prescriptionId, onClose, onChanged }) => {
  const { t } = useTranslation('patients');
  const { can } = useAuth();
  const [rx, setRx] = useState(null);
  const [fileUrl, setFileUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let url = '';
    let cancelled = false;
    getPrescription(prescriptionId)
      .then((data) => {
        if (cancelled) return;
        setRx(data.prescription);
        if (data.prescription.image) {
          url = dataUrlToObjectUrl(data.prescription.image);
          setFileUrl(url);
        }
      })
      .catch((err) => !cancelled && setError(errMsg(err, t('rx.errors.loadFailed'))));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [prescriptionId, t]);

  const cancelRx = async () => {
    if (!window.confirm(t('rx.confirmCancel'))) return;
    try {
      const res = await updatePrescription(rx._id, { status: 'cancelled' });
      setRx((r) => ({ ...r, status: res.prescription.status }));
      onChanged?.(res.prescription);
    } catch (err) {
      setError(errMsg(err, t('rx.errors.updateFailed')));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-[#161c26] border border-slate-200/90 dark:border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" /> {t('rx.viewerTitle', { number: rx?.number ?? '' })}
          </h2>
          <button type="button" onClick={onClose} aria-label={t('common:buttons.close')} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        {error && <p className="text-xs text-rose-600 mb-3">{error}</p>}
        {!rx && !error && <p className="text-xs text-slate-400">{t('common:labels.loading')}</p>}
        {rx && (
          <div className="space-y-4 text-xs text-slate-700 dark:text-slate-300">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div><span className="text-slate-400 block">{t('rx.patient')}</span>{rx.patientId?.name}</div>
              <div><span className="text-slate-400 block">{t('rx.prescriber')}</span>{rx.prescriberName} {rx.prescriberLicense && `(${rx.prescriberLicense})`}</div>
              <div><span className="text-slate-400 block">{t('rx.facility')}</span>{rx.facility || '—'}</div>
              <div><span className="text-slate-400 block">{t('rx.issued')}</span>{formatDate(rx.issueDate)}</div>
              <div><span className="text-slate-400 block">{t('rx.expires')}</span>{rx.expiryDate ? formatDate(rx.expiryDate) : '—'}</div>
              <div><span className="text-slate-400 block">{t('rx.status')}</span><StatusBadge status={rx.status} label={t(`rxStatus.${rx.status}`, { defaultValue: rx.status })} /></div>
              {rx.externalNumber && <div><span className="text-slate-400 block">{t('rx.paperNo')}</span>{rx.externalNumber}</div>}
            </div>

            <table className="w-full text-left">
              <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-2">{t('rx.medicine')}</th><th>{t('rx.dose')}</th><th>{t('rx.frequency')}</th><th>{t('rx.days')}</th>
                  <th>{t('rx.qtyPerFill')}</th><th>{t('rx.dispensed')}</th><th>{t('rx.refills')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rx.items.map((it) => (
                  <tr key={it._id}>
                    <td className="py-2 font-semibold text-slate-900 dark:text-white">{it.name}</td>
                    <td>{it.dose}</td><td>{it.frequency}</td><td>{it.durationDays || '—'}</td>
                    <td>{it.quantityPrescribed || '—'}</td><td>{it.quantityDispensed}</td>
                    <td>{it.refillsUsed}/{it.refillsAllowed}</td>
                  </tr>
                ))}
                {rx.items.length === 0 && (
                  <tr><td colSpan={7} className="py-3 text-slate-400 italic">{t('rx.noItems')}</td></tr>
                )}
              </tbody>
            </table>
            {rx.notes && <p><span className="text-slate-400">{t('rx.notesPrefix')} </span>{rx.notes}</p>}

            {fileUrl && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400">{t('rx.scanned')}</span>
                  <a href={fileUrl} download={rx.imageName || `${rx.number}`} className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                    <Download className="w-3.5 h-3.5" /> {t('common:buttons.download')}
                  </a>
                </div>
                {rx.imageType === 'application/pdf' ? (
                  <iframe title={t('rx.pdfTitle')} src={fileUrl} className="w-full h-[60vh] rounded-xl border border-slate-200 dark:border-slate-700" />
                ) : (
                  <img src={fileUrl} alt={t('rx.scanned')} className="max-h-[60vh] mx-auto rounded-xl border border-slate-200 dark:border-slate-700" />
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              {rx.status === 'active' && can('prescription:manage') && (
                <button type="button" onClick={cancelRx} className={`${secondaryBtn} text-rose-600 dark:text-rose-400`}>
                  <Ban className="w-3.5 h-3.5" /> {t('rx.cancelRx')}
                </button>
              )}
              <button type="button" onClick={onClose} className={secondaryBtn}>{t('common:buttons.close')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrescriptionViewer;
