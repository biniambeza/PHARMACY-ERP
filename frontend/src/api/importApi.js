import api, { LONG_REQUEST_TIMEOUT_MS } from './axios';

// Server-side .xlsx parsing: { fileName, data: base64 } -> { headers, rows }
export const parseImportFile = async (body) => (await api.post('/import/parse', body, { timeout: LONG_REQUEST_TIMEOUT_MS })).data;

// kind: 'medicines' | 'opening-stock'; rows (max 500 per call); dryRun
// A 400 with `results` (rows with errors on commit) is returned as data, not thrown.
export const importRows = async (kind, rows, dryRun) => {
  try {
    return (await api.post(`/import/${kind}`, { rows, dryRun }, { timeout: LONG_REQUEST_TIMEOUT_MS })).data;
  } catch (err) {
    if (err.response?.status === 400 && err.response.data?.results) return err.response.data;
    throw err;
  }
};
