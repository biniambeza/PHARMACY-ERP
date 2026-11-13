import { useEffect, useState } from 'react';

/** Returns `value` once it has stopped changing for `delay` ms (for search-as-you-type). */
export default function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
