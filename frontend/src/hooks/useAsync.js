import { useCallback, useEffect, useState } from 'react';

/**
 * Runs `fetcher` (a memoised async function, e.g. from useCallback) on mount,
 * whenever its identity changes (i.e. its inputs changed) and on `reload()`.
 *
 * `loading` is derived — the stored result remembers which request produced it —
 * so the effect never has to set state synchronously (no cascading renders), and
 * a response from an outdated request is ignored.
 *
 * Returns `{ data, error, loading, reload }`. `data` keeps the last successful value
 * (or `initialData`) while a new request is in flight or after it fails. `error` is
 * the raw error thrown by the last request (null while loading or on success).
 */
export default function useAsync(fetcher, initialData = null) {
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState({ fetcher: null, nonce: -1, data: initialData, error: null });

  useEffect(() => {
    let active = true;
    fetcher().then(
      (data) => {
        if (active) setResult({ fetcher, nonce, data, error: null });
      },
      (error) => {
        if (active) setResult((prev) => ({ fetcher, nonce, data: prev.data, error }));
      }
    );
    return () => {
      active = false;
    };
  }, [fetcher, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const loading = result.fetcher !== fetcher || result.nonce !== nonce;

  return { data: result.data, error: loading ? null : result.error, loading, reload };
}
