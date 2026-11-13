// Shows the Ethiopian-calendar equivalent of a Gregorian <input type="date"> value, but only
// when the Ethiopian display calendar is active. Renders nothing otherwise.
//
//   <input type="date" value={expiry} ... aria-describedby="expiry-eth" />
//   <EthiopianDateHint value={expiry} id="expiry-eth" />
//
// useTranslation() makes it re-render when the language / calendar preference changes.
import { useTranslation } from 'react-i18next';
import { ethiopianDateHint } from '../../utils/format';

export default function EthiopianDateHint({ value, id, className = '' }) {
  useTranslation();
  const hint = value ? ethiopianDateHint(value) : '';
  if (!hint) return null;
  return (
    <span id={id} className={`mt-1 block text-xs text-gray-500 dark:text-gray-400 ${className}`.trim()}>
      {hint}
    </span>
  );
}
