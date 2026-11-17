import { categoriesApi, suppliersApi } from '../api/resources';
import { useAsync } from './useAsync';

/** Categories + suppliers for filters and form dropdowns. */
export function useReferenceData() {
  const { data, reload } = useAsync(
    () => Promise.all([categoriesApi.list(), suppliersApi.list()]).then(([c, s]) => ({ categories: c.data.data, suppliers: s.data.data })),
    [],
  );
  return { categories: data?.categories ?? [], suppliers: data?.suppliers ?? [], reload };
}
