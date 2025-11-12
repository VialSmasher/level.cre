import { useCallback, useEffect, useRef } from 'react';

/**
 * Lightweight debounced callback hook to avoid pulling in an extra dependency.
 * Returns debounced, flush, and cancel helpers for convenience.
 */
export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number
) {
  const callbackRef = useRef(callback);
  const timerRef = useRef<number | null>(null);
  const argsRef = useRef<Parameters<T>>();

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const debounced = useCallback(
    (...args: Parameters<T>) => {
      argsRef.current = args;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        callbackRef.current(...(argsRef.current ?? []));
        argsRef.current = undefined;
      }, delay);
    },
    [delay]
  );

  const flush = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    callbackRef.current(...(argsRef.current ?? []));
    argsRef.current = undefined;
  }, []);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    argsRef.current = undefined;
  }, []);

  return { debounced, flush, cancel };
}
