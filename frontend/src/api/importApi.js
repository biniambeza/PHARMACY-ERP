import api from './axios';

// Server-side .xlsx parsing: { fileName, data: base64 } -> { headers, rows }
export const parseImportFile = async (body) => (await api.post('/import/parse', body)).data;

// kind: 'medicines' | 'opening-stock'; rows (max 500 per call); dryRun
// A 400 with `results` (rows with errors on commit) is returned as data, not thrown.
export const importRows = async (kind, rows, dryRun) => {
  try {
    return (await api.post(`/import/${kind}`, { rows, dryRun })).data;
  } catch (err) {
    if (err.response?.status === 400 && err.response.data?.results) return err.response.data;
    throw err;
  }
};
