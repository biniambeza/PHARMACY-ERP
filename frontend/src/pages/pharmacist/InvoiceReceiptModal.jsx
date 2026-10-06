const InvoiceReceiptModal = ({ isOpen, onClose, sale }) => {
  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm print:p-0 print:bg-white">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto print:border-none print:shadow-none print:max-h-none print:w-full print:bg-white print:text-black">
        {/* Header - Screen only */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-700 mb-4 print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
            <h2 className="text-base font-bold text-white">Receipt & Invoice</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Printable Receipt Paper Container */}
        <div className="bg-slate-900 border border-slate-700/60 rounded-xl p-5 print:border-none print:bg-white print:p-0 print:text-black">
          {/* Pharmacy Branding */}
          <div className="text-center pb-4 border-b border-dashed border-slate-700 print:border-black">
            <div className="inline-block p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs mb-1 print:border-black print:text-black">
              Rx PHARMACY RECEIPT
            </div>
            <h3 className="text-lg font-extrabold text-white print:text-black tracking-tight">
              Pharmacy Point of Sale
            </h3>
            <p className="text-xs text-slate-400 print:text-gray-600">Official Sales & Tax Receipt</p>
          </div>

          {/* Invoice Meta */}
          <div className="py-3 border-b border-dashed border-slate-700 print:border-black text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400 print:text-gray-600">Invoice No:</span>
              <span className="font-mono font-bold text-white print:text-black">{sale.invoiceNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 print:text-gray-600">Date & Time:</span>
              <span className="text-slate-300 print:text-gray-800 font-mono">
                {new Date(sale.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400 print:text-gray-600">Customer:</span>
              <span className="font-medium text-white print:text-black">
                {sale.customer?.name || 'Walk-in Customer'}{' '}
                {sale.customer?.phone ? `(${sale.customer.phone})` : ''}
              </span>
            </div>
            {sale.pharmacistId?.name && (
              <div className="flex justify-between">
                <span className="text-slate-400 print:text-gray-600">Cashier:</span>
                <span className="text-slate-300 print:text-gray-800">{sale.pharmacistId.name}</span>
              </div>
            )}
          </div>

          {/* Line Items Table */}
          <div className="py-3 border-b border-dashed border-slate-700 print:border-black">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-slate-400 print:text-gray-600 border-b border-slate-800 print:border-gray-300">
                  <th className="pb-1.5 font-semibold">Item & Batch</th>
                  <th className="pb-1.5 font-semibold text-center">Qty</th>
                  <th className="pb-1.5 font-semibold text-right">Price</th>
                  <th className="pb-1.5 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 print:divide-gray-200">
                {sale.items?.map((item, idx) => (
                  <tr key={idx} className="text-slate-200 print:text-black">
                    <td className="py-2 pr-2">
                      <span className="font-semibold block">{item.name}</span>
                      <span className="text-[10px] text-emerald-400 font-mono print:text-gray-600">
                        Batch: {item.batchNo}
                      </span>
                    </td>
                    <td className="py-2 text-center font-mono">{item.quantity}</td>
                    <td className="py-2 text-right font-mono">${item.unitPrice.toFixed(2)}</td>
                    <td className="py-2 text-right font-mono font-bold">${item.subtotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Summary */}
          <div className="pt-3 text-xs space-y-1.5">
            <div className="flex justify-between text-slate-300 print:text-gray-700">
              <span>Subtotal:</span>
              <span className="font-mono">${sale.subtotal.toFixed(2)}</span>
            </div>
            {sale.discount > 0 && (
              <div className="flex justify-between text-emerald-400 print:text-gray-700">
                <span>Discount:</span>
                <span className="font-mono">-${sale.discount.toFixed(2)}</span>
              </div>
            )}
            {sale.tax > 0 && (
              <div className="flex justify-between text-slate-400 print:text-gray-700">
                <span>Tax:</span>
                <span className="font-mono">+${sale.tax.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-slate-800 print:border-black text-sm">
              <span className="font-bold text-white print:text-black">Grand Total:</span>
              <span className="font-bold text-emerald-400 print:text-black font-mono text-base">
                ${sale.grandTotal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 text-[11px] text-slate-400 print:text-gray-600">
              <span>Payment Method:</span>
              <span className="uppercase font-semibold tracking-wider font-mono text-slate-300 print:text-black">
                {sale.paymentMethod}
              </span>
            </div>
          </div>

          {/* Thank You Note */}
          <div className="text-center pt-5 text-[11px] text-slate-400 print:text-gray-500">
            <p>Thank you for choosing our pharmacy!</p>
            <p className="text-[10px]">Please retain this receipt for your health records.</p>
          </div>
        </div>

        {/* Buttons - Screen only */}
        <div className="flex items-center justify-end gap-3 pt-5 mt-4 border-t border-slate-700 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-lg transition cursor-pointer flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Receipt
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-md transition cursor-pointer"
          >
            Done / Next Sale
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceReceiptModal;
