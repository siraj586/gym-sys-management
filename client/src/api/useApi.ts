import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './http';

interface ApiState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  /** Fetches the same path again, e.g. after a change on the server. */
  reload: () => void;
}

/**
 * GET `path` and keep the result. Changing `path` fetches again; a response
 * for an older path that arrives late is ignored.
 */
export function useApi<T>(path: string): ApiState<T> {
  const [result, setResult] = useState<{ path: string; data: T | null; error: unknown }>({
    path: '',
    data: null,
    error: null,
  });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    apiFetch<T>(path).then(
      (data) => current && setResult({ path, data, error: null }),
      (error: unknown) => current && setResult({ path, data: null, error }),
    );
    return () => {
      current = false;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const fresh = result.path === path;

  return {
    // Keep showing the previous data while the next page or filter loads.
    data: result.data,
    error: fresh ? result.error : null,
    loading: !fresh,
    reload,
  };
}
