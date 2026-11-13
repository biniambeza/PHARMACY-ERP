import api from './axios';

// Returns { pharmacy } incl. pharmacy.settings (tax, currency, locale, receipt...). Any staff member.
export const getMyPharmacy = async () => {
  const res = await api.get('/pharmacy/my-pharmacy');
  return res.data;
};

// Owner only (settings:manage). Body: { phone?, address?, settings?: { tax, currency, locale,
// receiptFooter, receiptWidth, expiryAlertDays, notify, maxDiscountPercent } }
export const updateMyPharmacy = async (pharmacyData) => {
  const res = await api.put('/pharmacy/my-pharmacy', pharmacyData);
  return res.data;
};

export const updateProfile = async (profileData) => {
  const res = await api.put('/pharmacy/profile', profileData);
  return res.data;
};
