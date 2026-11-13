import { Trans, useTranslation } from 'react-i18next';
import { Percent, Receipt, Bell, Globe, SlidersHorizontal } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import { CardHeader, Toggle, OptionButtons } from './SettingsUi';
import { inputCls, cardCls, labelCls, hintCls } from './settingsStyles';

const CURRENCIES = ['ETB', 'USD', 'EUR', 'KES', 'GBP'];
const RECEIPT_WIDTHS = ['58mm', '80mm', 'A4'];

// Every section receives the settings `form` and a `setField(key)(value)` updater.

export const TaxSection = ({ form, setField }) => {
  const { t } = useTranslation('settings');
  // Example of how the tax applies to a 100.00 line
  const previewRate = Number(form.taxRate) / 100 || 0;
  const previewTax = form.taxInclusive ? 100 - 100 / (1 + previewRate) : 100 * previewRate;

  return (
    <div className={cardCls}>
      <CardHeader icon={Percent} color="indigo" title={t('tax.title')} subtitle={t('tax.subtitle')} />
      <Toggle checked={form.taxEnabled} onChange={setField('taxEnabled')} label={t('tax.enable')} hint={t('tax.enableHint')} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{t('tax.name')}</label>
          <input type="text" maxLength={30} value={form.taxName} onChange={(e) => setField('taxName')(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('tax.rate')}</label>
          <input type="number" min={0} max={100} step="0.01" value={form.taxRate} onChange={(e) => setField('taxRate')(e.target.value)} className={`${inputCls} font-mono`} />
        </div>
      </div>
      <div>
        <label className={labelCls}>{t('tax.pricing')}</label>
        <OptionButtons
          options={[
            { value: false, label: t('tax.exclusive') },
            { value: true, label: t('tax.inclusive') },
          ]}
          value={form.taxInclusive}
          onChange={setField('taxInclusive')}
        />
      </div>
      <div>
        <label className={labelCls}>{t('tax.registrationNo')}</label>
        <input
          type="text"
          maxLength={50}
          value={form.taxRegistrationNo}
          onChange={(e) => setField('taxRegistrationNo')(e.target.value)}
          className={`${inputCls} font-mono`}
          placeholder={t('tax.registrationPlaceholder')}
        />
      </div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl p-3">
        <Trans
          t={t}
          i18nKey={form.taxInclusive ? 'tax.exampleContains' : 'tax.exampleAdds'}
          values={{ amount: form.taxEnabled ? previewTax.toFixed(2) : '0.00', name: form.taxName || t('tax.defaultName') }}
          components={{ b: <span className="font-mono font-bold" /> }}
        />
      </p>
    </div>
  );
};

export const ReceiptsSection = ({ form, setField }) => {
  const { t } = useTranslation('settings');
  return (
    <div className={cardCls}>
      <CardHeader icon={Receipt} color="emerald" title={t('receipts.title')} subtitle={t('receipts.subtitle')} />
      <div>
        <label className={labelCls}>{t('receipts.paperWidth')}</label>
        <OptionButtons
          options={RECEIPT_WIDTHS.map((w) => ({ value: w, label: w }))}
          value={form.receiptWidth}
          onChange={setField('receiptWidth')}
          extraCls="font-mono"
        />
        <span className={hintCls}>{t('receipts.paperHint')}</span>
      </div>
      <div>
        <label className={labelCls}>{t('receipts.footer')}</label>
        <textarea
          rows={3}
          maxLength={500}
          value={form.receiptFooter}
          onChange={(e) => setField('receiptFooter')(e.target.value)}
          className={inputCls}
          placeholder={t('receipts.footerPlaceholder')}
        />
      </div>
    </div>
  );
};

export const LocaleSection = ({ form, setField }) => {
  const { t } = useTranslation('settings');
  return (
    <div className={cardCls}>
      <CardHeader icon={Globe} color="cyan" title={t('locale.title')} subtitle={t('locale.subtitle')} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{t('locale.currency')}</label>
          <input
            list="currency-options"
            maxLength={3}
            value={form.currency}
            onChange={(e) => setField('currency')(e.target.value.toUpperCase())}
            className={`${inputCls} font-mono uppercase`}
          />
          <datalist id="currency-options">
            {CURRENCIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <label className={labelCls}>{t('locale.language')}</label>
          <select value={form.locale} onChange={(e) => setField('locale')(e.target.value)} className={inputCls}>
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
};

export const AlertsSection = ({ form, setField }) => {
  const { t } = useTranslation('settings');
  return (
    <div className={cardCls}>
      <CardHeader icon={Bell} color="amber" title={t('alerts.title')} subtitle={t('alerts.subtitle')} />
      <div>
        <label className={labelCls}>{t('alerts.expiryDays')}</label>
        <input
          type="text"
          value={form.expiryAlertDays}
          onChange={(e) => setField('expiryAlertDays')(e.target.value)}
          className={`${inputCls} font-mono`}
          placeholder="30, 60, 90"
        />
        <span className={hintCls}>{t('alerts.expiryHint')}</span>
      </div>
      <div className="space-y-2">
        <Toggle checked={form.notifyEmail} onChange={setField('notifyEmail')} label={t('alerts.email')} />
        <Toggle checked={form.notifySms} onChange={setField('notifySms')} label={t('alerts.sms')} />
        <Toggle checked={form.notifyDailySummary} onChange={setField('notifyDailySummary')} label={t('alerts.daily')} hint={t('alerts.dailyHint')} />
        <Toggle checked={form.requireShift} onChange={setField('requireShift')} label={t('alerts.requireShift')} hint={t('alerts.requireShiftHint')} />
      </div>
      <div>
        <label className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium mb-1">
          <SlidersHorizontal className="w-3.5 h-3.5" /> {t('alerts.maxDiscount')}
        </label>
        <input
          type="number"
          min={0}
          max={100}
          step="0.5"
          value={form.maxDiscountPercent}
          onChange={(e) => setField('maxDiscountPercent')(e.target.value)}
          className={`${inputCls} font-mono`}
        />
        <span className={hintCls}>{t('alerts.maxDiscountHint')}</span>
      </div>
    </div>
  );
};
