import { useState, useEffect } from 'react';

/**
 * Hook dla debounced search - opóźnia wykonanie wyszukiwania
 * @param value - wartość do debounce
 * @param delay - opóźnienie w ms (domyślnie 300ms)
 * @returns debounced wartość
 */
export const useDebounced = <T>(value: T, delay: number = 300): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};
