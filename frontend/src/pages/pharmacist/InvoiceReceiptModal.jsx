import { Printer, X, Receipt } from 'lucide-react';

const InvoiceReceiptModal = ({ isOpen, onClose, sale }) => {
  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs print:p-0 print:bg-white">
      <div className="bg-white dark:bg-[#161c26] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto print:border-none print:shadow-none print:max-h-none print:w-full print:bg-white print:text-black">
        {/* Header - Screen only */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-200/80 dark:border-slate-800 mb-4 print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Receipt & Tax Invoice</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Official patient sales voucher</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Printable Receipt Paper Container */}
        <div className="bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/60 rounded-xl p-5 print:border-none print:bg-white print:p-0 print:text-black">
          {/* Pharmacy Branding */}
          <div className="text-center pb-4 border-b border-dashed border-slate-300 dark:border-slate-700 print:border-black">
            <div className="inline-block px-2.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 text-teal-700 dark:text-teal-400 font-bold text-[11px] mb-1.5 print:border-black print:text-black">
              Rx OFFICIAL RECEIPT
            </div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white print:text-black tracking-tight">
              Dispensary Point of Sale
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 print:text-gray-600">
              Tax Compliant Pharmaceutical Invoice
            </p>
          </div>

          {/* Invoice Meta */}
          <div className="py-3 border-b border-dashed border-slate-300 dark:border-slate-700 print:border-black text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 print:text-gray-600">Invoice No:</span>
              <span className="font-mono font-bold text-slate-900 dark:text-white print:text-black">
                {sale.invoiceNumber}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 print:text-gray-600">Date & Time:</span>
              <span className="text-slate-700 dark:text-slate-300 print:text-gray-800 font-mono">
                {new Date(sale.createdAt).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400 print:text-gray-600">Customer:</span>
              <span className="font-medium text-slate-900 dark:text-white print:text-black">
                {sale.customer?.name || 'Walk-in Customer'}{' '}
                {sale.customer?.phone ? `(${sale.customer.phone})` : ''}
              </span>
            </div>
            {sale.pharmacistId?.name && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400 print:text-gray-600">Cashier:</span>
                <span className="text-slate-700 dark:text-slate-300 print:text-gray-800">{sale.pharmacistId.name}</span>
              </div>
            )}
          </div>

          {/* Line Items Table */}
          <div className="py-3 border-b border-dashed border-slate-300 dark:border-slate-700 print:border-black">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 print:text-gray-600 border-b border-slate-200 dark:border-slate-800 print:border-gray-300">
                  <th className="pb-1.5 font-semibold">Item & Batch</th>
                  <th className="pb-1.5 font-semibold text-center">Qty</th>
                  <th className="pb-1.5 font-semibold text-right">Price</th>
                  <th className="pb-1.5 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/50 print:divide-gray-200">
                {sale.items?.map((item, idx) => (
                  <tr key={idx} className="text-slate-800 dark:text-slate-200 print:text-black">
                    <td className="py-2 pr-2">
                      <span className="font-semibold block text-slate-900 dark:text-white">{item.name}</span>
                      <span className="text-[10px] text-teal-600 dark:text-teal-400 font-mono print:text-gray-600">
                        Batch: {item.batchNo}
                      </span>
                    </td>
                    <td className="py-2 text-center font-mono">{item.quantity}</td>
                    <td className="py-2 text-right font-mono">${(Number(item.unitPrice) || 0).toFixed(2)}</td>
                    <td className="py-2 text-right font-mono font-bold">${(Number(item.subtotal) || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals Summary */}
          <div className="pt-3 text-xs space-y-1.5">
            <div className="flex justify-between text-slate-600 dark:text-slate-300 print:text-gray-700">
              <span>Subtotal:</span>
              <span className="font-mono">${(Number(sale.subtotal) || 0).toFixed(2)}</span>
            </div>
            {Number(sale.discount) > 0 && (
              <div className="flex justify-between text-teal-600 dark:text-teal-400 print:text-gray-700">
                <span>Discount:</span>
                <span className="font-mono">-${(Number(sale.discount) || 0).toFixed(2)}</span>
              </div>
            )}
            {Number(sale.tax) > 0 && (
              <div className="flex justify-between text-slate-600 dark:text-slate-300 print:text-gray-700">
                <span>Tax:</span>
                <span className="font-mono">+${(Number(sale.tax) || 0).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800 print:border-black text-sm">
              <span className="font-bold text-slate-900 dark:text-white print:text-black">Grand Total:</span>
              <span className="font-extrabold text-teal-600 dark:text-teal-400 print:text-black font-mono text-base">
                ${(Number(sale.grandTotal) || 0).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 text-[11px] text-slate-500 dark:text-slate-400 print:text-gray-600">
              <span>Payment Method:</span>
              <span className="uppercase font-semibold tracking-wider font-mono text-slate-700 dark:text-slate-300 print:text-black">
                {sale.paymentMethod?.replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Thank You Note */}
          <div className="text-center pt-5 text-[11px] text-slate-500 dark:text-slate-400 print:text-gray-500">
            <p>Thank you for choosing our dispensary!</p>
            <p className="text-[10px]">Please retain this receipt for your health records.</p>
          </div>
        </div>

        {/* Buttons - Screen only */}
        <div className="flex items-center justify-end gap-3 pt-5 mt-4 border-t border-slate-200/80 dark:border-slate-800 print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Receipt</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer"
          >
            Done / Next Sale
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceReceiptModal;
