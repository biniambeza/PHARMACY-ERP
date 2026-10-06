import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getMedicines } from '../../api/medicineApi';
import { getStockBatches } from '../../api/stockApi';
import { createSale } from '../../api/salesApi';
import InvoiceReceiptModal from './InvoiceReceiptModal';

const POS = () => {
  const [medicines, setMedicines] = useState([]);
  const [stockBatches, setStockBatches] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ name: 'Walk-in Customer', phone: '' });
  const [discount, setDiscount] = useState('');
  const [tax, setTax] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');

  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState('');

  // Receipt Modal state
  const [completedSale, setCompletedSale] = useState(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [medRes, batchRes] = await Promise.all([
        getMedicines(),
        getStockBatches({ status: 'active' }),
      ]);
      setMedicines(medRes.medicines || []);
      setStockBatches(batchRes.batches || []);
    } catch (err) {
      console.error('Failed to load POS data:', err);
      setError('Failed to load products and inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute live available stock for a medicine from active batches
  const getAvailableStock = (medicineId) => {
    return stockBatches
      .filter((b) => (b.medicineId?._id || b.medicineId) === medicineId && b.quantity > 0)
      .reduce((sum, b) => sum + b.quantity, 0);
  };

  const handleAddToCart = (med) => {
    setError('');
    const available = getAvailableStock(med._id);
    if (available <= 0) {
      setError(`"${med.name}" is currently out of stock`);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.medicineId === med._id);
      if (existing) {
        if (existing.quantity + 1 > available) {
          setError(`Cannot add more than available stock (${available} units)`);
          return prev;
        }
        return prev.map((item) =>
          item.medicineId === med._id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          medicineId: med._id,
          name: med.name,
          price: med.price,
          dosageForm: med.dosageForm,
          strength: med.strength,
          quantity: 1,
          maxAvailable: available,
        },
      ];
    });
  };

  const handleUpdateQty = (medicineId, newQty) => {
    const qty = Number(newQty);
    if (isNaN(qty) || qty <= 0) return;

    setCart((prev) =>
      prev.map((item) => {
        if (item.medicineId === medicineId) {
          const clamped = Math.min(qty, item.maxAvailable);
          return { ...item, quantity: clamped };
        }
        return item;
      })
    );
  };

  const handleRemoveItem = (medicineId) => {
    setCart((prev) => prev.filter((item) => item.medicineId !== medicineId));
  };

  const handleClearCart = () => {
    setCart([]);
    setError('');
    setDiscount('');
    setTax('');
  };

  // Calculations
  const subtotal = cart.reduce((acc, it) => acc + it.price * it.quantity, 0);
  const discountVal = Number(discount) || 0;
  const taxVal = Number(tax) || 0;
  const grandTotal = Math.max(0, subtotal - discountVal + taxVal);

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (cart.length === 0) {
      setError('Please add at least one medicine to the cart');
      return;
    }

    setCheckoutLoading(true);
    setError('');

    try {
      const payload = {
        items: cart.map((it) => ({
          medicineId: it.medicineId,
          quantity: it.quantity,
        })),
        customer: {
          name: customer.name || 'Walk-in Customer',
          phone: customer.phone || '',
        },
        discount: discountVal,
        tax: taxVal,
        paymentMethod,
      };

      const res = await createSale(payload);
      setCompletedSale(res.sale);
      setIsReceiptOpen(true);
      handleClearCart();
      await loadData(); // Reload stock batches after deduction
    } catch (err) {
      setError(err.response?.data?.message || 'Checkout failed');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const categories = [...new Set(medicines.map((m) => m.category).filter(Boolean))];

  const filteredMedicines = medicines.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.genericName && m.genericName.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory ? m.category === selectedCategory : true;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-6 selection:bg-emerald-500 selection:text-white">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Link
                to="/pharmacy"
                className="text-xs text-slate-400 hover:text-emerald-400 transition"
              >
                ← Dashboard
              </Link>
              <span className="text-slate-600">•</span>
              <Link
                to="/pharmacy/sales"
                className="text-xs text-slate-400 hover:text-emerald-400 transition"
              >
                Sales History
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight mt-1">Cashier Point of Sale (POS)</h1>
            <p className="text-xs text-slate-400">
              Fast medicine checkout with automatic First-Expired First-Out (FEFO) stock batch deduction
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              POS Terminal Active
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError('')} className="text-rose-400 hover:text-white font-bold ml-2">
              ✕
            </button>
          </div>
        )}

        {/* POS Grid: Catalog on Left, Checkout Cart on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Product Selection (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Search & Category Filter */}
            <div className="bg-slate-800 border border-slate-700/80 rounded-xl p-3.5 flex flex-col sm:flex-row gap-3 items-center">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search brand or generic name..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full sm:w-48 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Medicines List / Grid */}
            <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-4 min-h-[500px] max-h-[680px] overflow-y-auto">
              {loading ? (
                <div className="p-12 text-center text-xs text-slate-400">Loading catalog medicines...</div>
              ) : filteredMedicines.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-sm font-semibold text-slate-300 mb-1">No medicines found</p>
                  <p className="text-xs text-slate-500">Try adjusting your search query or add items in catalog.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredMedicines.map((med) => {
                    const available = getAvailableStock(med._id);
                    const isOutOfStock = available <= 0;

                    return (
                      <div
                        key={med._id}
                        onClick={() => !isOutOfStock && handleAddToCart(med)}
                        className={`p-3.5 rounded-xl border transition flex flex-col justify-between ${
                          isOutOfStock
                            ? 'bg-slate-900/50 border-slate-800 opacity-60 cursor-not-allowed'
                            : 'bg-slate-800 border-slate-700/80 hover:border-emerald-500/60 hover:bg-slate-750 cursor-pointer shadow-sm'
                        }`}
                      >
                        <div>
                          <div className="flex justify-between items-start gap-1">
                            <h3 className="text-sm font-bold text-white leading-snug">{med.name}</h3>
                            <span className="text-sm font-extrabold text-emerald-400 font-mono">
                              ${med.price.toFixed(2)}
                            </span>
                          </div>
                          {med.genericName && (
                            <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{med.genericName}</p>
                          )}
                          <div className="flex items-center gap-1.5 mt-2">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">
                              {med.dosageForm} {med.strength ? `• ${med.strength}` : ''}
                            </span>
                            {med.requiresPrescription && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-bold border border-amber-500/20">
                                Rx
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-700/50 flex items-center justify-between text-xs">
                          <span
                            className={`font-mono text-[11px] font-semibold ${
                              isOutOfStock ? 'text-rose-400' : 'text-slate-400'
                            }`}
                          >
                            {isOutOfStock ? 'Out of Stock' : `${available} in stock`}
                          </span>
                          <button
                            type="button"
                            disabled={isOutOfStock}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition ${
                              isOutOfStock
                                ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
                            }`}
                          >
                            + Add
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Order Checkout Cart (5 cols) */}
          <div className="lg:col-span-5 bg-slate-800/90 border border-slate-700 rounded-2xl p-5 flex flex-col justify-between shadow-xl">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-700 mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white">Current Order</h2>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-400">
                    {cart.reduce((sum, it) => sum + it.quantity, 0)} items
                  </span>
                </div>
                {cart.length > 0 && (
                  <button
                    onClick={handleClearCart}
                    className="text-xs text-rose-400 hover:text-rose-300 transition cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Cart Items List */}
              <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1 mb-4">
                {cart.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Cart is empty. Select medicines from the left to start billing.
                  </div>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.medicineId}
                      className="p-2.5 bg-slate-900/80 border border-slate-700/60 rounded-xl flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs font-semibold text-white truncate">{item.name}</h4>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ${item.price.toFixed(2)} × {item.quantity} = ${(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>

                      {/* Stepper */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleUpdateQty(item.medicineId, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs disabled:opacity-30 transition cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          value={item.quantity}
                          min={1}
                          max={item.maxAvailable}
                          onChange={(e) => handleUpdateQty(item.medicineId, e.target.value)}
                          className="w-10 text-center bg-slate-950 border border-slate-700 rounded py-0.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          onClick={() => handleUpdateQty(item.medicineId, item.quantity + 1)}
                          disabled={item.quantity >= item.maxAvailable}
                          className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs disabled:opacity-30 transition cursor-pointer"
                        >
                          +
                        </button>
                        <button
                          onClick={() => handleRemoveItem(item.medicineId)}
                          className="text-slate-500 hover:text-rose-400 text-xs p-1 ml-1 cursor-pointer transition"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Customer Details Form */}
              <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-3 mb-4 space-y-2">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Customer Information
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={customer.name}
                    onChange={(e) => setCustomer((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Customer Name"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="text"
                    value={customer.phone}
                    onChange={(e) => setCustomer((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="Phone (optional)"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Billing Summary & Payment */}
            <div className="border-t border-slate-700 pt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Discount ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 block mb-1">Tax ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={tax}
                    onChange={(e) => setTax(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">Payment Method</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {['cash', 'card', 'mobile_money'].map((pm) => (
                    <button
                      key={pm}
                      type="button"
                      onClick={() => setPaymentMethod(pm)}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold uppercase tracking-wider transition cursor-pointer border ${
                        paymentMethod === pm
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow'
                          : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
                      }`}
                    >
                      {pm.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Total Calculation */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal:</span>
                  <span className="font-mono text-white">${subtotal.toFixed(2)}</span>
                </div>
                {discountVal > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Discount:</span>
                    <span className="font-mono">-${discountVal.toFixed(2)}</span>
                  </div>
                )}
                {taxVal > 0 && (
                  <div className="flex justify-between text-slate-400">
                    <span>Tax:</span>
                    <span className="font-mono">+${taxVal.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-base font-bold">
                  <span className="text-white">Grand Total:</span>
                  <span className="text-emerald-400 font-mono text-lg font-extrabold">
                    ${grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCheckout}
                disabled={checkoutLoading || cart.length === 0}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg transition cursor-pointer flex items-center justify-center gap-2"
              >
                {checkoutLoading ? (
                  'Processing Sale...'
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
                    </svg>
                    Complete Checkout (${grandTotal.toFixed(2)})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Receipt Modal */}
      <InvoiceReceiptModal
        isOpen={isReceiptOpen}
        onClose={() => {
          setIsReceiptOpen(false);
          setCompletedSale(null);
        }}
        sale={completedSale}
      />
    </div>
  );
};

export default POS;
