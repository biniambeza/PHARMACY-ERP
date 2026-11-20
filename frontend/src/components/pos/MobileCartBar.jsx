import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShoppingCart, ChevronDown } from 'lucide-react';

// Phones / tablets (< lg): the cart sits below the product list, so a floating bar shows the
// running total and jumps to the cart. Hidden while the cart panel itself is on screen.
const MobileCartBar = ({ count, total, targetId }) => {
  const { t } = useTranslation('pos');
  const [panelVisible, setPanelVisible] = useState(false);

  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setPanelVisible(entry.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [targetId]);

  if (count === 0 || panelVisible) return null;

  const goToCart = () => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none">
      <button
        type="button"
        onClick={goToCart}
        className="pointer-events-auto w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-900/20 transition cursor-pointer"
      >
        <span className="flex items-center gap-2 min-w-0">
          <ShoppingCart className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span className="text-sm font-semibold truncate">{t('cart.lines', { count })}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-sm font-bold font-mono">{total}</span>
          <span className="text-xs font-semibold opacity-90">{t('cart.goToCheckout')}</span>
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
};

export default MobileCartBar;
