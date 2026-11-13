import { useEffect, useState } from 'react';
import { Stethoscope, FilePlus2, FileText, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PatientPicker from '../clinical/PatientPicker';
import ClinicalWarnings from '../clinical/ClinicalWarnings';
import PrescriptionForm from '../clinical/PrescriptionForm';
import { getPrescriptions } from '../../api/clinicalApi';
import { useAuth } from '../../context/useAuth';
import PosModal from './PosModal';
import { inputCls, sectionCls, labelCls } from './posUtils';

/**
 * Patient, clinical warnings (#18) and prescription (#16/#17) for the current cart.
 * Props:
 *   cart, online
 *   patient, onPatient(p|null)
 *   prescription (record), onPrescription(rx|null)
 *   legacyRx { number, prescriber, notes }, onLegacyRx(next)  (free-text Rx for Rx-only, non-controlled items)
 *   onWarnings({ key, status, interactions, allergyHits })  (see ClinicalWarnings; the check also
 *     runs when the section itself is hidden, so the POS always knows its result)
 *   needsRx, hasControlled
 */
const ClinicalSection = ({
  cart, online, patient, onPatient, prescription, onPrescription, legacyRx, onLegacyRx, onWarnings, needsRx, hasControlled,
}) => {
  const { t } = useTranslation('pos');
  const { can } = useAuth();
  const [rxList, setRxList] = useState([]);
  const [creatingRx, setCreatingRx] = useState(false);
  const patientId = patient?._id || null;
  const medicineIds = cart.map((l) => l.medicineId);
  const canPatients = can('patient:view');

  useEffect(() => {
    if (!patientId || !online) return undefined;
    let cancelled = false;
    getPrescriptions({ patientId, status: 'active', limit: 20 })
      .then((data) => {
        if (!cancelled) setRxList(data.prescriptions || []);
      })
      .catch(() => {
        if (!cancelled) setRxList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, online]);

  const warningsEl =
    medicineIds.length > 0 && online ? (
      <ClinicalWarnings patientId={patientId} medicineIds={medicineIds} onResult={onWarnings} compact />
    ) : null;

  if (!canPatients && !needsRx) return warningsEl;

  const rxItems = cart
    .filter((l) => l.medicine.requiresPrescription || l.medicine.isControlled)
    .map((l) => ({ medicineId: l.medicineId, name: l.name, quantityPrescribed: l.quantity * l.unit.factor }));

  return (
    <div className={`${sectionCls} ${hasControlled ? 'border-rose-300/80 dark:border-rose-800/60' : needsRx ? 'border-amber-300/80 dark:border-amber-700/50' : ''}`}>
      <div className="flex items-center justify-between">
        <span className={`${labelCls} inline-flex items-center gap-1`}>
          <Stethoscope className="w-3 h-3" /> {t('clinical.title')}
        </span>
        {hasControlled ? (
          <span className="text-[10px] font-bold text-rose-600 inline-flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" /> {t('clinical.controlledRequired')}
          </span>
        ) : needsRx ? (
          <span className="text-[10px] font-bold text-amber-600">{t('clinical.rxRequired')}</span>
        ) : (
          <span className="text-[10px] text-slate-400">{t('clinical.optional')}</span>
        )}
      </div>

      {canPatients && online && (
        <PatientPicker
          value={patient}
          onChange={(p) => {
            onPatient(p);
            onPrescription(null);
            if (!p) setRxList([]);
          }}
          placeholder={t('clinical.patientPlaceholder')}
        />
      )}

      {warningsEl}

      {patient && (needsRx || hasControlled || rxList.length > 0) && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={prescription?._id || ''}
              onChange={(e) => onPrescription(rxList.find((r) => r._id === e.target.value) || null)}
              className={`${inputCls} cursor-pointer`}
            >
              <option value="">{rxList.length ? t('clinical.selectRx') : t('clinical.noActiveRx')}</option>
              {rxList.map((rx) => (
                <option key={rx._id} value={rx._id}>
                  {rx.number} · {rx.prescriberName} · {(rx.items || []).map((i) => i.name).join(', ').slice(0, 40)}
                </option>
              ))}
            </select>
            {can('prescription:manage') && (
              <button
                type="button"
                onClick={() => setCreatingRx(true)}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-500 cursor-pointer"
              >
                <FilePlus2 className="w-3.5 h-3.5" /> {t('clinical.new')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Free-text prescription for Rx-only (non-controlled) items when no record is selected */}
      {needsRx && !hasControlled && !prescription && (
        <div className="grid grid-cols-2 gap-2">
          <input
            value={legacyRx.number}
            onChange={(e) => onLegacyRx({ ...legacyRx, number: e.target.value })}
            placeholder={t('clinical.rxNo')}
            className={`${inputCls} font-mono`}
          />
          <input
            value={legacyRx.prescriber}
            onChange={(e) => onLegacyRx({ ...legacyRx, prescriber: e.target.value })}
            placeholder={t('clinical.prescriber')}
            className={inputCls}
          />
        </div>
      )}

      <PosModal open={creatingRx} title={t('clinical.newRx')} icon={FilePlus2} onClose={() => setCreatingRx(false)} wide>
        {patient && (
          <PrescriptionForm
            patientId={patient._id}
            initialItems={rxItems}
            onCancel={() => setCreatingRx(false)}
            onCreated={(rx) => {
              setRxList((list) => [rx, ...list]);
              onPrescription(rx);
              setCreatingRx(false);
            }}
          />
        )}
      </PosModal>
    </div>
  );
};

export default ClinicalSection;
