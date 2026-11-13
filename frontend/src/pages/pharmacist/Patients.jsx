import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HeartPulse, Plus, Search, Edit3, Archive, FileText, History, User, AlertTriangle, Bell, Paperclip, X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getPatients, getPatientHistory, archivePatient, getRefillsDue,
} from '../../api/clinicalApi';
import { useAuth } from '../../context/useAuth';
import Can from '../../components/common/Can';
import StatusBadge from '../../components/common/StatusBadge';
import { CardSkeleton } from '../../components/common/SkeletonLoader';
import PatientFormModal from '../../components/clinical/PatientFormModal';
import PrescriptionForm from '../../components/clinical/PrescriptionForm';
import PrescriptionViewer from '../../components/clinical/PrescriptionViewer';
import { cardCls, inputCls, primaryBtn, iconBtn, severityCls, patientAge, errMsg } from '../../components/clinical/ui';
import { formatDate, formatDateTime } from '../../utils/format';

const TABS = [
  { id: 'overview', label: 'tabs.overview', icon: User },
  { id: 'prescriptions', label: 'tabs.prescriptions', icon: FileText },
  { id: 'history', label: 'tabs.history', icon: History },
];

const Patients = () => {
  const { t } = useTranslation('patients');
  const { can } = useAuth();
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null); // { patient, medications, prescriptions }
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState('overview');
  const [modal, setModal] = useState(null); // { patient } | null
  const [showRxForm, setShowRxForm] = useState(false);
  const [viewRxId, setViewRxId] = useState(null);
  const [refills, setRefills] = useState([]);
  const [error, setError] = useState('');
  // Id of the latest detail request: responses of older requests (another patient clicked
  // meanwhile) are ignored so the panel never shows the wrong patient.
  const detailRequest = useRef(0);

  const loadPatients = useCallback(async () => {
    try {
      const data = await getPatients({ search: search || undefined, limit: 100 });
      setPatients(data.patients || []);
      setError('');
    } catch (err) {
      setError(errMsg(err, t('page.errors.loadList')));
    } finally {
      setLoading(false);
    }
  }, [search, t]);

  useEffect(() => {
    const timer = setTimeout(loadPatients, 250);
    return () => clearTimeout(timer);
  }, [loadPatients]);

  useEffect(() => {
    getRefillsDue(7).then((d) => setRefills(d.refills || [])).catch(() => setRefills([]));
  }, []);

  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    detailRequest.current += 1;
    const requestId = detailRequest.current;
    setDetailLoading(true);
    try {
      const data = await getPatientHistory(id);
      if (requestId !== detailRequest.current) return;
      setDetail(data);
      setError('');
    } catch (err) {
      if (requestId === detailRequest.current) setError(errMsg(err, t('page.errors.loadOne')));
    } finally {
      if (requestId === detailRequest.current) setDetailLoading(false);
    }
  }, [t]);

  const selectPatient = (id) => {
    // Don't keep showing the previous patient while the new one loads
    if (id !== selectedId) setDetail(null);
    setSelectedId(id);
    setShowRxForm(false);
    setTab('overview');
    loadDetail(id);
  };

  const handleArchive = async (p) => {
    if (!window.confirm(t('page.confirmArchive', { name: p.name }))) return;
    try {
      await archivePatient(p._id);
      detailRequest.current += 1; // drop any detail request still in flight
      setDetailLoading(false);
      setSelectedId(null);
      setDetail(null);
      loadPatients();
    } catch (err) {
      setError(errMsg(err, t('page.errors.archive')));
    }
  };

  const patient = detail?.patient;
  const age = patientAge(patient);

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase tracking-wider">
            {t('page.badge')}
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">{t('page.title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('page.subtitle')}</p>
        </div>
        <Can perm="patient:manage">
          <button onClick={() => setModal({ patient: null })} className={`${primaryBtn} self-start sm:self-auto`}>
            <Plus className="w-4 h-4" /> {t('page.newPatient')}
          </button>
        </Can>
      </div>

      {error && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs border border-rose-200 dark:border-rose-900/50">
          {error}
          <button onClick={() => setError('')} aria-label={t('common:buttons.close')} className="cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
      )}

      {refills.length > 0 && (
        <div className={`${cardCls} p-4`}>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3">
            <Bell className="w-4 h-4 text-amber-500" /> {t('refills.title', { count: refills.length })}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <tr><th className="py-2">{t('rx.patient')}</th><th>{t('fields.phone')}</th><th>{t('rx.medicine')}</th><th>{t('refills.lastDispensed')}</th><th>{t('refills.due')}</th><th>{t('refills.rx')}</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {refills.slice(0, 20).map((r) => (
                  <tr key={`${r.prescriptionId}-${r.itemId}`}>
                    <td className="py-2">
                      <button className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer" onClick={() => r.patient && selectPatient(r.patient._id)}>
                        {r.patient?.name}
                      </button>
                    </td>
                    <td>{r.patient?.phone}</td>
                    <td>{r.name}</td>
                    <td>{formatDate(r.lastDispensedAt)}</td>
                    <td className={r.overdue ? 'text-rose-600 font-semibold' : ''}>
                      {formatDate(r.nextDue)} {r.overdue ? t('refills.overdue') : ''}
                    </td>
                    <td className="font-mono">{r.prescriptionNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Patient list */}
        <div className={`${cardCls} p-4 lg:col-span-1`}>
          <div className="relative mb-3">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('page.searchPlaceholder')} className={`${inputCls} pl-9`} />
          </div>
          {loading ? (
            <CardSkeleton height="h-64" />
          ) : patients.length === 0 ? (
            <div className="py-12 text-center">
              <HeartPulse className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-xs text-slate-500">{search ? t('page.noMatch') : t('page.none')}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {patients.map((p) => (
                <li key={p._id}>
                  <button
                    onClick={() => selectPatient(p._id)}
                    className={`w-full text-left px-2 py-2.5 rounded-lg transition cursor-pointer ${
                      selectedId === p._id ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">{p.name}</span>
                      {p.allergies?.length > 0 && <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" title={t('page.hasAllergies')} />}
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">{p.phone || t('page.noPhone')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Patient detail */}
        <div className={`${cardCls} p-5 lg:col-span-2 min-h-[300px]`}>
          {!selectedId ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16">
              <User className="w-10 h-10 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-xs text-slate-500">{t('page.selectPrompt')}</p>
            </div>
          ) : detailLoading && !patient ? (
            <CardSkeleton height="h-64" />
          ) : patient ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{patient.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {[age !== null && age !== undefined ? t('page.ageYears', { age }) : null, patient.sex !== 'unknown' ? t(`sex.${patient.sex}`, { defaultValue: patient.sex }) : null, patient.phone]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Can perm="patient:manage">
                  <div className="flex gap-1">
                    <button onClick={() => setModal({ patient })} className={iconBtn} title={t('page.editPatient')}><Edit3 className="w-4 h-4" /></button>
                    <button onClick={() => handleArchive(patient)} className={iconBtn} title={t('page.archivePatient')}><Archive className="w-4 h-4" /></button>
                  </div>
                </Can>
              </div>

              <div className="flex gap-1 p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl w-fit">
                {TABS.map((tb) => (
                  <button
                    key={tb.id}
                    onClick={() => setTab(tb.id)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] inline-flex items-center gap-1 cursor-pointer ${
                      tab === tb.id
                        ? 'bg-white dark:bg-[#161c26] text-emerald-600 dark:text-emerald-400 font-bold shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <tb.icon className="w-3.5 h-3.5" /> {t(tb.label)}
                  </button>
                ))}
              </div>

              {tab === 'overview' && (
                <div className="space-y-4 text-xs text-slate-700 dark:text-slate-300">
                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{t('fields.allergies')}</h3>
                    {patient.allergies?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {patient.allergies.map((a) => (
                          <span key={a._id} className={`px-2 py-1 rounded-lg border ${severityCls(a.severity)}`}>
                            <strong>{a.substance}</strong>
                            {a.reaction && ` — ${a.reaction}`} <span className="uppercase text-[10px]">({t(`allergySeverity.${a.severity}`, { defaultValue: a.severity })})</span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="italic text-slate-400">{t('page.noAllergies')}</p>
                    )}
                  </div>
                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">{t('fields.conditions')}</h3>
                    <p>{patient.conditions?.length ? patient.conditions.join(', ') : <span className="italic text-slate-400">{t('page.noneRecorded')}</span>}</p>
                  </div>
                  {patient.dateOfBirth && <p><span className="text-slate-400">{t('page.dobPrefix')} </span>{formatDate(patient.dateOfBirth)}</p>}
                  {patient.notes && <p><span className="text-slate-400">{t('rx.notesPrefix')} </span>{patient.notes}</p>}
                  <p className="text-slate-400">
                    {t('page.rxCount', { count: detail.prescriptions.length })} · {t('page.lineCount', { count: detail.medications.length })}
                  </p>
                </div>
              )}

              {tab === 'prescriptions' && (
                <div className="space-y-3">
                  {can('prescription:manage') && !showRxForm && (
                    <button onClick={() => setShowRxForm(true)} className={primaryBtn}><Plus className="w-4 h-4" /> {t('page.newRx')}</button>
                  )}
                  {showRxForm && (
                    <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50">
                      <PrescriptionForm
                        patientId={patient._id}
                        onCancel={() => setShowRxForm(false)}
                        onCreated={() => {
                          setShowRxForm(false);
                          loadDetail(patient._id);
                        }}
                      />
                    </div>
                  )}
                  {detail.prescriptions.length === 0 ? (
                    <p className="text-xs italic text-slate-400">{t('page.noRx')}</p>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                        <tr><th className="py-2">{t('page.cols.number')}</th><th>{t('rx.issued')}</th><th>{t('rx.prescriber')}</th><th>{t('page.cols.items')}</th><th>{t('rx.status')}</th><th /></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                        {detail.prescriptions.map((rx) => (
                          <tr key={rx._id}>
                            <td className="py-2 font-mono">
                              {rx.number}
                              {rx.imageType && <Paperclip className="inline w-3 h-3 ml-1 text-slate-400" />}
                            </td>
                            <td>{formatDate(rx.issueDate)}</td>
                            <td>{rx.prescriberName}</td>
                            <td className="max-w-[200px] truncate">{rx.items.map((i) => i.name).join(', ')}</td>
                            <td><StatusBadge status={rx.status} label={t(`rxStatus.${rx.status}`, { defaultValue: rx.status })} /></td>
                            <td className="text-right">
                              <button onClick={() => setViewRxId(rx._id)} className="text-emerald-600 font-semibold cursor-pointer">{t('common:buttons.view')}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {tab === 'history' && (
                detail.medications.length === 0 ? (
                  <p className="text-xs italic text-slate-400">{t('page.noHistory')}</p>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="text-[11px] uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">
                      <tr><th className="py-2">{t('common:labels.date')}</th><th>{t('rx.medicine')}</th><th>{t('page.cols.qty')}</th><th>{t('page.cols.batch')}</th><th>{t('page.cols.invoice')}</th><th>{t('refills.rx')}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {detail.medications.map((m, i) => (
                        <tr key={`${m.saleId}-${i}`} className={m.voided ? 'line-through opacity-50' : ''}>
                          <td className="py-2">{formatDateTime(m.date)}</td>
                          <td className="font-semibold">{m.name}</td>
                          <td>{m.quantity}</td>
                          <td className="font-mono">{m.batchNo}</td>
                          <td className="font-mono">{m.invoiceNumber}</td>
                          <td className="font-mono">{m.prescriptionNumber || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              )}
            </div>
          ) : null}
        </div>
      </div>

      {modal && (
        <PatientFormModal
          key={modal.patient?._id || 'new'}
          isOpen
          patient={modal.patient}
          onClose={() => setModal(null)}
          onSaved={(p) => {
            loadPatients();
            selectPatient(p._id);
          }}
        />
      )}
      {viewRxId && (
        <PrescriptionViewer
          prescriptionId={viewRxId}
          onClose={() => setViewRxId(null)}
          onChanged={() => patient && loadDetail(patient._id)}
        />
      )}
    </div>
  );
};

export default Patients;
