import { useState, useCallback, useRef } from 'react';

/**
 * Hook for throttling state updates to prevent excessive re-renders
 * Useful for high-frequency data like WebSocket ticker updates
 */
export function useThrottledState<T>(
  initialValue: T,
  delay: number = 100
): [T, (value: T) => void] {
  const [state, setState] = useState<T>(initialValue);
  const timeoutRef = useRef<number | null>(null);
  const latestValueRef = useRef<T>(initialValue);

  const setThrottledState = useCallback((value: T) => {
    latestValueRef.current = value;

    if (timeoutRef.current) {
      return; // Update already scheduled
    }

    timeoutRef.current = window.setTimeout(() => {
      setState(latestValueRef.current);
      timeoutRef.current = null;
    }, delay);
  }, [delay]);

  return [state, setThrottledState];
}
