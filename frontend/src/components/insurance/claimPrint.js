// Print-friendly claim document (opens a new window and prints it). Owner: Insurance agent.
import { escapeHtml } from './insuranceUi';
import { formatMoney, formatDate } from '../../utils/format';

export const printClaim = ({ claim, pharmacy, t }) => {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return false;
  const e = escapeHtml;
  const payer = claim.scheme?.payer || {};
  const rows = (claim.sales || [])
    .map(
      (l, i) => `<tr>
        <td>${i + 1}</td><td>${e(formatDate(l.saleDate))}</td><td>${e(l.invoiceNumber)}</td>
        <td>${e(l.memberNo)}</td><td>${e(l.memberName)}</td>
        <td class="r">${e(formatMoney(l.saleTotal))}</td><td class="r">${e(formatMoney(l.insurerAmount))}</td>
        <td class="r">${l.returnedAmount > 0 ? e(formatMoney(l.returnedAmount)) : '-'}</td><td class="r b">${e(formatMoney(l.amount))}</td>
      </tr>`
    )
    .join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${e(claim.claimNumber)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#111;margin:24px}
    h1{font-size:18px;margin:0}h2{font-size:14px;margin:16px 0 6px}
    .muted{color:#555}.grid{display:flex;justify-content:space-between;gap:24px;margin-top:12px}
    table{width:100%;border-collapse:collapse;margin-top:12px}
    th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f1f1f1}
    .r{text-align:right}.b{font-weight:bold}tfoot td{font-weight:bold}
    .sign{display:flex;justify-content:space-between;margin-top:48px}
    .sign div{border-top:1px solid #333;width:40%;padding-top:4px;text-align:center}
    @media print{body{margin:8mm}}
  </style></head><body>
  <h1>${e(pharmacy?.name || '')}</h1>
  <div class="muted">${e(pharmacy?.address || '')} ${pharmacy?.phone ? `· ${e(pharmacy.phone)}` : ''}</div>
  <h2>${e(t('print.title'))} ${e(claim.claimNumber)}</h2>
  <div class="grid">
    <div>
      <div><b>${e(t('fields.scheme'))}:</b> ${e(claim.scheme?.name || claim.schemeName)}</div>
      <div><b>${e(t('print.payer'))}:</b> ${e(payer.name || '')}</div>
      <div class="muted">${e(payer.contactPerson || '')} ${e(payer.phone || '')} ${e(payer.email || '')}</div>
    </div>
    <div>
      <div><b>${e(t('fields.period'))}:</b> ${e(formatDate(claim.periodFrom))} – ${e(formatDate(claim.periodTo))}</div>
      <div><b>${e(t('fields.status'))}:</b> ${e(t(`claimStatus.${claim.status}`))}</div>
      ${claim.submittedAt ? `<div><b>${e(t('fields.submittedAt'))}:</b> ${e(formatDate(claim.submittedAt))}</div>` : ''}
    </div>
  </div>
  <table><thead><tr>
    <th>#</th><th>${e(t('fields.date'))}</th><th>${e(t('fields.invoice'))}</th><th>${e(t('fields.memberNo'))}</th>
    <th>${e(t('fields.name'))}</th><th class="r">${e(t('fields.saleTotal'))}</th><th class="r">${e(t('fields.insurerShare'))}</th>
    <th class="r">${e(t('fields.returned'))}</th><th class="r">${e(t('fields.claimed'))}</th>
  </tr></thead><tbody>${rows}</tbody>
  <tfoot><tr><td colspan="8" class="r">${e(t('fields.total'))}</td><td class="r">${e(formatMoney(claim.totalAmount))}</td></tr>
  ${claim.paidAmount > 0 ? `<tr><td colspan="8" class="r">${e(t('fields.paid'))}</td><td class="r">${e(formatMoney(claim.paidAmount))}</td></tr>
  <tr><td colspan="8" class="r">${e(t('fields.outstanding'))}</td><td class="r">${e(formatMoney(claim.outstanding))}</td></tr>` : ''}
  </tfoot></table>
  <div class="sign"><div>${e(t('print.preparedBy'))}</div><div>${e(t('print.receivedBy'))}</div></div>
  <script>window.onload=function(){window.print();}</script>
  </body></html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
};
