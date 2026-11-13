import api, { LONG_REQUEST_TIMEOUT_MS } from './axios';
import { downloadBlob } from '../utils/export';

export const EXPORT_ENTITIES = ['medicines', 'stock', 'sales', 'purchase-orders', 'customers'];

const filenameFrom = (res, fallback) => {
  const header = res.headers?.['content-disposition'] || '';
  const match = /filename="?([^";]+)"?/i.exec(header);
  return match ? match[1] : fallback;
};

// Downloads GET /api/export/:entity as xlsx (default) or csv.
// params: { format, range, from, to }
export const downloadExport = async (entity, params = {}) => {
  const format = params.format || 'xlsx';
  const res = await api.get(`/export/${entity}`, { params: { ...params, format }, responseType: 'blob', timeout: LONG_REQUEST_TIMEOUT_MS });
  downloadBlob(res.data, filenameFrom(res, `${entity}-${new Date().toISOString().slice(0, 10)}.${format}`));
};
