import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../lib/errors';

interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
}

/**
 * Minimal data-fetching hook: re-runs when `deps` change, keeps the previous
 * data visible while reloading (no table flicker), clears stale errors on each
 * run and ignores responses from superseded requests.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, loading: true, error: null });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef
      .current()
      .then((data) => active && setState({ data, loading: false, error: null }))
      .catch((err) => active && setState((s) => ({ ...s, loading: false, error: getErrorMessage(err) })));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
