import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Keeps list filters in the URL so views are shareable/bookmarkable and links
 * like "/products?stock=low" open pre-filtered.
 */
export function useUrlState<K extends string>(defaults: Record<K, string>) {
  const [params, setParams] = useSearchParams();

  const values = Object.fromEntries(
    (Object.keys(defaults) as K[]).map((k) => [k, params.get(k) ?? defaults[k]]),
  ) as Record<K, string>;

  const set = useCallback(
    (patch: Partial<Record<K, string>>, opts: { resetPage?: boolean } = { resetPage: true }) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch) as [K, string][]) {
            if (!v || v === defaults[k]) next.delete(k);
            else next.set(k, v);
          }
          if (opts.resetPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams],
  );

  return [values, set, params, setParams] as const;
}
