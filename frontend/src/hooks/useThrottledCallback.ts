import { useRef, useCallback } from 'react';

/**
 * Custom hook for throttling state updates in high-frequency scenarios
 * Uses requestAnimationFrame for smooth performance
 */
export function useThrottledCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number = 16 // ~60fps
): T {
  const timeoutRef = useRef<number | null>(null);
  const lastCallRef = useRef<number>(0);

  const throttledCallback = useCallback((...args: Parameters<T>) => {
    const now = performance.now();
    
    if (now - lastCallRef.current >= delay) {
      // Call immediately if enough time has passed
      lastCallRef.current = now;
      callback(...args);
    } else {
      // Schedule for later if called too frequently
      if (timeoutRef.current) {
        cancelAnimationFrame(timeoutRef.current);
      }
      
      timeoutRef.current = requestAnimationFrame(() => {
        lastCallRef.current = performance.now();
        callback(...args);
        timeoutRef.current = null;
      });
    }
  }, [callback, delay]) as T;

  return throttledCallback;
}
