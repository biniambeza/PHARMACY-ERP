import { useEffect, useRef, useState } from 'react';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getSchemes, lookupMembers, previewInsurance } from '../../api/insuranceApi';
import { formatMoney } from '../../utils/format';
import { inputCls, errMsg } from './posUtils';

/**
 * Insurance payment row: scheme + member lookup and the coverage preview (insurer pays X,
 * patient pays Y). The row amount is set to the insurer share from the server preview; the
 * server recomputes it when the sale is saved. Online only (the POS hides the method offline).
 * Props: row, lines ([{ medicineId, amount }] from lineGrossAmounts), onPatch(changes)
 */
const InsurancePaymentFields = ({ row, lines, onPatch }) => {
  const { t } = useTranslation('pos');
  const [schemes, setSchemes] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const patchRef = useRef(onPatch);
  useEffect(() => {
    patchRef.current = onPatch;
  }, [onPatch]);

  useEffect(() => {
    let cancelled = false;
    getSchemes({ active: 'true' })
      .then((res) => {
        if (cancelled) return;
        const list = res.schemes || [];
        setSchemes(list);
        if (list.length === 1 && !row.schemeId) patchRef.current({ schemeId: list[0]._id });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Load once per row
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Member lookup (by member number, name or phone)
  useEffect(() => {
    const q = query.trim();
    if (!row.schemeId || row.member) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (q.length < 2) {
        if (!cancelled) setResults([]);
        return;
      }
      setSearching(true);
      try {
        const res = await lookupMembers(row.schemeId, q);
        if (!cancelled) setResults(res.members || []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, row.schemeId, row.member]);

  // Coverage preview whenever the scheme, member or cart changes
  const linesKey = JSON.stringify(lines);
  const memberId = row.member?._id || '';
  useEffect(() => {
    if (!row.schemeId || !memberId || lines.length === 0) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await previewInsurance({ schemeId: row.schemeId, memberId, lines });
        if (!cancelled) patchRef.current({ preview: res, amount: String(res.insurerAmount), error: '' });
      } catch (err) {
        if (!cancelled) patchRef.current({ preview: null, amount: '', error: errMsg(err, t('insurance.previewFailed')) });
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // linesKey stands for `lines`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.schemeId, memberId, linesKey, t]);

  const pickMember = (m) => {
    if (!m.valid) return;
    setQuery('');
    setResults([]);
    onPatch({ member: m, preview: null, amount: '', error: '' });
  };

  const preview = row.preview;
  const excluded = preview ? preview.lines.filter((l) => !l.covered) : [];

  return (
    <div className="col-span-full space-y-1.5 rounded-xl border border-sky-200/80 dark:border-sky-900/50 bg-sky-50/50 dark:bg-sky-950/20 p-2">
      <select
        value={row.schemeId}
        onChange={(e) => {
          setQuery('');
          setResults([]);
          onPatch({ schemeId: e.target.value, member: null, preview: null, amount: '', error: '' });
        }}
        className={`${inputCls} cursor-pointer`}
      >
        <option value="">{t('insurance.selectScheme')}</option>
        {schemes.map((s) => (
          <option key={s._id} value={s._id}>{s.name} · {s.coveragePercent}%</option>
        ))}
      </select>

      {row.schemeId && !row.member && (
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('insurance.memberSearch')}
            className={`${inputCls} font-mono`}
          />
          {searching && <Loader2 className="w-3 h-3 animate-spin absolute right-2 top-2 text-slate-400" />}
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-44 overflow-y-auto">
              {results.map((m) => (
                <button
                  type="button"
                  key={m._id}
                  disabled={!m.valid}
                  onClick={() => pickMember(m)}
                  className="block w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  <span className="font-mono font-semibold">{m.memberNo}</span> · {m.name}
                  {!m.valid && <span className="ml-1 text-rose-600">({t(`insurance.invalid.${m.invalidReason || 'inactive'}`)})</span>}
                </button>
              ))}
            </div>
          )}
          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <p className="text-[10px] text-slate-400 mt-0.5">{t('insurance.noMember')}</p>
          )}
        </div>
      )}

      {row.member && (
        <div className="flex items-center justify-between text-[11px] text-slate-700 dark:text-slate-200">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
            <span className="font-mono font-semibold">{row.member.memberNo}</span> · {row.member.name}
          </span>
          <button
            type="button"
            onClick={() => onPatch({ member: null, preview: null, amount: '', error: '' })}
            aria-label={t('insurance.changeMember')}
            className="p-0.5 text-slate-400 hover:text-rose-500 cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {previewing && (
        <p className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Loader2 className="w-3 h-3 animate-spin" /> {t('insurance.calculating')}</p>
      )}
      {preview && !previewing && (
        <div className="text-[11px] space-y-0.5">
          <div className="flex justify-between text-sky-700 dark:text-sky-300 font-semibold">
            <span>{t('insurance.insurerPays')}</span><span className="font-mono">{formatMoney(preview.insurerAmount)}</span>
          </div>
          <div className="flex justify-between text-slate-700 dark:text-slate-200 font-semibold">
            <span>{t('insurance.patientPays')}</span><span className="font-mono">{formatMoney(preview.patientAmount)}</span>
          </div>
          {preview.copayAmount > 0 && (
            <div className="flex justify-between text-slate-500"><span>{t('insurance.copay')}</span><span className="font-mono">{formatMoney(preview.copayAmount)}</span></div>
          )}
          {excluded.length > 0 && (
            <p className="text-amber-600">{t('insurance.notCovered', { names: excluded.map((l) => l.name).join(', ') })}</p>
          )}
        </div>
      )}
      {row.error && <p className="text-[11px] text-rose-600">{row.error}</p>}
    </div>
  );
};

export default InsurancePaymentFields;
