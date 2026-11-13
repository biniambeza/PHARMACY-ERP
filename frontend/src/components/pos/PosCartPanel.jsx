import { useTranslation } from 'react-i18next';
import CartHeader from './CartHeader';
import CartLines from './CartLines';
import CustomerSection from './CustomerSection';
import ClinicalSection from './ClinicalSection';
import PaymentPanel from './PaymentPanel';
import CheckoutFooter, { ClinicalAck } from './CheckoutFooter';
import { cardCls } from './posUtils';

// Right-hand column of the POS: cart lines, customer/clinical sections, payment and checkout.
const PosCartPanel = ({
  sale, online, canCredit, needsRx, hasControlled, severeWarnings, warningKey,
  totals, payStatus, allowedMethods, providers, insuranceLines, maxQtyOf, registerQtyInput,
  blockers, checkoutLoading, onCheckout, onHold, onClear,
}) => {
  const { t } = useTranslation('pos');
  const { cart } = sale;

  return (
    <div className={`lg:col-span-5 ${cardCls} p-4 space-y-3`}>
      <CartHeader count={cart.length} onHold={onHold} onClear={onClear} />

      <div className="max-h-[280px] overflow-y-auto pr-1 custom-scrollbar">
        <CartLines
          cart={cart}
          selectedKey={sale.selectedKey}
          onSelect={sale.setSelectedKey}
          onQty={sale.setQty}
          onUnit={sale.setUnit}
          onRemove={sale.removeLine}
          maxQtyOf={maxQtyOf}
          registerQtyInput={registerQtyInput}
        />
      </div>

      {cart.length > 0 && (
        <>
          <CustomerSection
            customer={sale.customer}
            onChange={sale.changeCustomer}
            walkIn={sale.walkIn}
            onWalkIn={sale.setWalkIn}
            online={online}
          />

          <ClinicalSection
            cart={cart}
            online={online}
            patient={sale.patient}
            onPatient={sale.setPatient}
            prescription={sale.prescription}
            onPrescription={sale.setPrescription}
            legacyRx={sale.legacyRx}
            onLegacyRx={sale.setLegacyRx}
            onWarnings={sale.setWarnings}
            needsRx={needsRx}
            hasControlled={hasControlled}
          />

          {severeWarnings && (
            <ClinicalAck
              warnings={sale.warnings}
              checked={sale.ackKey === warningKey}
              onChange={(checked) => sale.setAckKey(checked ? warningKey : '')}
            />
          )}

          {canCredit && !sale.customer && online && (
            <p className="text-[11px] text-slate-400">{t('creditHint')}</p>
          )}

          <PaymentPanel
            totals={totals}
            discount={sale.discount}
            onDiscount={sale.setDiscount}
            payments={sale.payments}
            onPayments={sale.setPayments}
            status={payStatus}
            allowedMethods={allowedMethods}
            providers={providers.providers}
            defaultProvider={providers.default}
            insuranceLines={insuranceLines}
          />
        </>
      )}

      <CheckoutFooter
        blockers={blockers}
        online={online}
        loading={checkoutLoading}
        disabled={checkoutLoading || cart.length === 0}
        total={totals.grandTotal}
        onCheckout={onCheckout}
      />
    </div>
  );
};

export default PosCartPanel;
