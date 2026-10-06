import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  User,
  Phone,
  CreditCard,
  Banknote,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  DollarSign,
  Package,
} from 'lucide-react';
import { getMedicines } from '../../api/medicineApi';
import { getStockBatches } from '../../api/stockApi';
import { createSale } from '../../api/salesApi';
import InvoiceReceiptModal from './InvoiceReceiptModal';

const POS = () => {
  const [medicines, setMedicines] = useState([]);
  const [stockBatches, setStockBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filtering
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  // Cart & Customer State
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState({ name: '', phone: '' });
  const [paymentMethod, setPaymentMethod] = useState('cash'); // 'cash' | 'card' | 'mobile_money'
  const [discount, setDiscount] = useState('');
  const [tax, setTax] = useState('');

  // Checkout Status & Receipts
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState('');
  const [completedSale, setCompletedSale] = useState(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);

  // Load Catalog & Stock Batches on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [medsRes, stockRes] = await Promise.all([
          getMedicines({ limit: 100 }),
          getStockBatches({ limit: 500 }),
        ]);
        setMedicines(medsRes.medicines || []);
        setStockBatches(stockRes.batches || []);
      } catch (err) {
        console.error('Failed to load POS data:', err);
        setError('Failed to load products or inventory stock batches');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Compute available quantity per medicine (sum of non-expired/active batches)
  const getAvailableStock = (medicineId) => {
    return stockBatches
      .filter((b) => {
        const match = b.medicineId?._id === medicineId || b.medicineId === medicineId;
        const notExpired = !b.expiryDate || new Date(b.expiryDate) > new Date();
        return match && b.status === 'in_stock' && notExpired;
      })
      .reduce((sum, b) => sum + (b.quantity || 0), 0);
  };

  // Add Item to Cart
  const handleAddToCart = (med) => {
    const available = getAvailableStock(med._id);
    if (available <= 0) {
      alert(`Cannot add: "${med.name}" is out of stock in current batches.`);
      return;
    }

    setCart((prevCart) => {
      const existing = prevCart.find((it) => it.medicineId === med._id);
      if (existing) {
        if (existing.quantity >= available) {
          alert(`Cannot add more: Max available batch stock is ${available}.`);
          return prevCart;
        }
        return prevCart.map((it) =>
          it.medicineId === med._id ? { ...it, quantity: it.quantity + 1 } : it
        );
      } else {
        return [
          ...prevCart,
          {
            medicineId: med._id,
            name: med.name,
            price: Number(med.price),
            quantity: 1,
            maxAvailable: available,
            dosageForm: med.dosageForm,
            requiresPrescription: med.requiresPrescription,
          },
        ];
      }
    });
  };

  // Modify Item Quantity in Cart
  const handleUpdateQty = (medicineId, newQty) => {
    const qty = parseInt(newQty, 10);
    if (isNaN(qty) || qty <= 0) return;

    setCart((prevCart) =>
      prevCart.map((it) => {
        if (it.medicineId === medicineId) {
          const clamped = Math.min(qty, it.maxAvailable);
          return { ...it, quantity: clamped };
        }
        return it;
      })
    );
  };

  // Remove Item from Cart
  const handleRemoveItem = (medicineId) => {
    setCart((prevCart) => prevCart.filter((it) => it.medicineId !== medicineId));
  };

  // Clear entire Cart
  const handleClearCart = () => {
    if (cart.length > 0 && window.confirm('Clear all items in the current transaction?')) {
      setCart([]);
      setCustomer({ name: '', phone: '' });
      setDiscount('');
      setTax('');
    }
  };

  // Cart Totals Calculations
  const subtotal = cart.reduce((sum, it) => sum + it.price * it.quantity, 0);
  const discountVal = parseFloat(discount) || 0;
  const taxVal = parseFloat(tax) || 0;
  const grandTotal = Math.max(0, subtotal - discountVal + taxVal);

  // Handle Checkout Execution
  const handleCheckout = async () => {
    if (cart.length === 0) return;

    setError('');
    setCheckoutLoading(true);

    try {
      const payload = {
        items: cart.map((it) => ({
          medicineId: it.medicineId,
          quantity: it.quantity,
        })),
        customer: {
          name: customer.name.trim() || undefined,
          phone: customer.phone.trim() || undefined,
        },
        paymentMethod,
        discount: discountVal,
        tax: taxVal,
      };

      const res = await createSale(payload);

      if (res.sale) {
        setCompletedSale(res.sale);
        setIsReceiptOpen(true);
        // Clear Cart
        setCart([]);
        setCustomer({ name: '', phone: '' });
        setDiscount('');
        setTax('');

        // Refresh stock batches so subsequent clicks reflect accurate batch levels
        const stockRes = await getStockBatches({ limit: 500 });
        setStockBatches(stockRes.batches || []);
      }
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
    <div className="space-y-6 sm:space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/50 px-2.5 py-0.5 rounded-full border border-teal-200 dark:border-teal-800/60 uppercase tracking-wider">
              Dispensary Terminal
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight mt-1">
            Cashier Point of Sale (POS)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Rapid medicine checkout with automatic First-Expired First-Out (FEFO) stock batch deduction
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/pharmacy/sales"
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-xs font-semibold rounded-xl shadow-2xs transition"
          >
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            <span>Sales History</span>
          </Link>

          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Terminal Active
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-xs flex justify-between items-center shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError('')}
            className="p-1 text-rose-500 hover:text-rose-700 dark:hover:text-white rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* POS Grid: Catalog on Left, Checkout Cart on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Selection (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Search & Category Filter Toolbar */}
          <div className="bg-white dark:bg-[#161c26] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search brand or generic name..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full sm:w-52 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer transition"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Medicines Catalog Grid */}
          <div className="bg-white dark:bg-[#161c26] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4 min-h-[500px] max-h-[700px] overflow-y-auto custom-scrollbar shadow-xs">
            {loading ? (
              <div className="p-12 text-center text-xs text-slate-400">Loading catalog medicines...</div>
            ) : filteredMedicines.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
                  <Package className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">No medicines found</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Try adjusting your search query or add items in catalog.
                </p>
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
                      className={`p-3.5 rounded-2xl border transition-all duration-150 flex flex-col justify-between ${
                        isOutOfStock
                          ? 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60 cursor-not-allowed'
                          : 'bg-slate-50/70 hover:bg-white dark:bg-[#1c222f] border-slate-200/80 dark:border-[#262e3f] hover:border-teal-500/60 dark:hover:border-teal-500/60 hover:shadow-md cursor-pointer'
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-start gap-1">
                          <h3 className="text-xs font-bold text-slate-900 dark:text-white leading-snug line-clamp-1">
                            {med.name}
                          </h3>
                          <span className="text-xs font-extrabold text-teal-600 dark:text-teal-400 font-mono shrink-0">
                            ${med.price.toFixed(2)}
                          </span>
                        </div>
                        {med.genericName && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                            {med.genericName}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 font-medium">
                            {med.dosageForm} {med.strength ? `• ${med.strength}` : ''}
                          </span>
                          {med.requiresPrescription && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-bold border border-amber-200 dark:border-amber-800/50">
                              Rx
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between text-xs">
                        <span
                          className={`font-mono text-[11px] font-semibold ${
                            isOutOfStock
                              ? 'text-rose-500 dark:text-rose-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {isOutOfStock ? 'Out of Stock' : `${available} in stock`}
                        </span>
                        <button
                          type="button"
                          disabled={isOutOfStock}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                            isOutOfStock
                              ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                              : 'bg-teal-600 hover:bg-teal-500 text-white shadow-xs'
                          }`}
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add</span>
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
        <div className="lg:col-span-5 bg-white dark:bg-[#161c26] border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/80 dark:border-slate-800 mb-4">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Current Order</h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60">
                  {cart.reduce((sum, it) => sum + it.quantity, 0)} items
                </span>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={handleClearCart}
                  className="text-xs text-rose-500 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 font-semibold transition cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Cart Items List */}
            <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1 mb-4 custom-scrollbar">
              {cart.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  Cart is empty. Select medicines from the catalog to start billing.
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.medicineId}
                    className="p-2.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800/80 rounded-xl flex items-center justify-between gap-2 shadow-2xs"
                  >
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {item.name}
                      </h4>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        ${item.price.toFixed(2)} × {item.quantity} = ${(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>

                    {/* Stepper */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleUpdateQty(item.medicineId, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                        className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs disabled:opacity-30 transition cursor-pointer flex items-center justify-center"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        value={item.quantity}
                        min={1}
                        max={item.maxAvailable}
                        onChange={(e) => handleUpdateQty(item.medicineId, e.target.value)}
                        className="w-10 text-center bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg py-0.5 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-teal-500"
                      />
                      <button
                        onClick={() => handleUpdateQty(item.medicineId, item.quantity + 1)}
                        disabled={item.quantity >= item.maxAvailable}
                        className="w-6 h-6 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs disabled:opacity-30 transition cursor-pointer flex items-center justify-center"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleRemoveItem(item.medicineId)}
                        className="text-slate-400 hover:text-rose-500 p-1 ml-1 cursor-pointer transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Customer Details Form */}
            <div className="bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60 rounded-xl p-3.5 mb-4 space-y-2">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Customer Information
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={customer.name}
                    onChange={(e) => setCustomer((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Customer Name"
                    className="w-full pl-8 pr-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
                  />
                </div>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={customer.phone}
                    onChange={(e) => setCustomer((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="Phone (optional)"
                    className="w-full pl-8 pr-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 font-mono transition"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Billing Summary & Payment */}
          <div className="border-t border-slate-200/80 dark:border-slate-800 pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                  Discount ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1">
                  Tax ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={tax}
                  onChange={(e) => setTax(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition"
                />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div>
              <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400 block mb-1.5">
                Payment Method
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'cash', label: 'Cash', icon: Banknote },
                  { id: 'card', label: 'Card', icon: CreditCard },
                  { id: 'mobile_money', label: 'Mobile', icon: Smartphone },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPaymentMethod(id)}
                    className={`py-2 px-2 rounded-xl text-[11px] font-semibold uppercase tracking-wider transition cursor-pointer border flex items-center justify-center gap-1.5 ${
                      paymentMethod === id
                        ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700/80 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Total Breakdown Calculation */}
            <div className="bg-slate-50/90 dark:bg-slate-900/80 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Subtotal:</span>
                <span className="font-mono text-slate-900 dark:text-white font-semibold">
                  ${subtotal.toFixed(2)}
                </span>
              </div>
              {discountVal > 0 && (
                <div className="flex justify-between text-teal-600 dark:text-teal-400 font-semibold">
                  <span>Discount:</span>
                  <span className="font-mono">-${discountVal.toFixed(2)}</span>
                </div>
              )}
              {taxVal > 0 && (
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Tax:</span>
                  <span className="font-mono">+${taxVal.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-slate-200/80 dark:border-slate-800 text-sm font-bold">
                <span className="text-slate-900 dark:text-white">Grand Total:</span>
                <span className="text-teal-600 dark:text-teal-400 font-mono text-xl font-extrabold">
                  ${grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCheckout}
              disabled={checkoutLoading || cart.length === 0}
              className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer flex items-center justify-center gap-2"
            >
              {checkoutLoading ? (
                'Processing Sale...'
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Complete Checkout (${grandTotal.toFixed(2)})</span>
                </>
              )}
            </button>
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
