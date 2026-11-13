// Whole days from now until `dateStr` (negative once past); null when there is no date.
export const getDaysUntilExpiry = (dateStr) => {
  if (!dateStr) return null;
  const now = new Date();
  const expiry = new Date(dateStr);
  return Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
};
