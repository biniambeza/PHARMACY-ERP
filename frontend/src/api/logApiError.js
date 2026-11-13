// Logs a failed request without the axios error object itself: its `config` carries the
// request headers (Authorization bearer token) and body, which must not end up in the console
// or in log collectors.
export const describeApiError = (err) => {
  if (!err) return 'Unknown error';
  const status = err.response?.status;
  const code = err.response?.data?.code || err.code;
  const message = err.response?.data?.message || err.message || String(err);
  return [status ? `HTTP ${status}` : null, code || null, message].filter(Boolean).join(' · ');
};

export const logApiError = (label, err) => {
  console.error(`${label}: ${describeApiError(err)}`);
};

export default logApiError;
