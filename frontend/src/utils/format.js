// Simple formatting helpers. The Platform agent makes these locale/currency aware.

export const formatMoney = (amount, currency = 'ETB') => {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
};

export const formatDate = (d, options = { year: 'numeric', month: 'short', day: 'numeric' }) => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, options);
};

export const formatDateTime = (d) =>
  formatDate(d, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
