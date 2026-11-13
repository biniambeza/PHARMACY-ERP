// Translation helpers for frontend/src/config/navigation.js (that file stays untranslated
// English so it remains the single source of structure; labels are looked up here).
//
// Key scheme (namespace `nav`):
//   items.<last path segment of item.to>   '/pharmacy' -> items.overview, '/pharmacy/stock-take' -> items.stock-take
//   groups.<lower-case group label>         'Inventory' -> groups.inventory
//   quickActions.<slug of item.name>        'New Sale (POS)' -> quickActions.new-sale-pos
// Every helper falls back to the English name, so missing keys never show raw keys.

const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const navItemKey = (item) => {
  const parts = String(item?.to || '').split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last || last === 'pharmacy') return 'overview';
  return last;
};

/** Sidebar item label. Usage: const { t } = useTranslation(); tNav(t, item) */
export const tNav = (t, item) => t(`nav:items.${navItemKey(item)}`, { defaultValue: item?.name ?? '' });

/** Sidebar group heading (label may be null for the ungrouped first section). */
export const tNavGroup = (t, label) => (label ? t(`nav:groups.${slug(label)}`, { defaultValue: label }) : label);

/** Dashboard quick action label. */
export const tQuickAction = (t, item) => t(`nav:quickActions.${slug(item?.name)}`, { defaultValue: item?.name ?? '' });
