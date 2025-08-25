import { useRef, useCallback } from 'react';

/**
 * Custom hook for throttling state updates in high-frequency scenarios
 * Uses requestAnimationFrame for smooth performance and passive event optimization
 */
export function useThrottledCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number = 16 // ~60fps, optimized for scroll performance
): T {
  const timeoutRef = useRef<number | null>(null);
  const lastCallRef = useRef<number>(0);
  const argsRef = useRef<Parameters<T> | null>(null);

  const throttledCallback = useCallback((...args: Parameters<T>) => {
    argsRef.current = args;
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
        if (argsRef.current) {
          lastCallRef.current = performance.now();
          callback(...argsRef.current);
          timeoutRef.current = null;
          argsRef.current = null;
        }
      });
    }
  }, [callback, delay]) as T;

  // Cleanup on unmount
  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      cancelAnimationFrame(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Expose cleanup for manual use if needed
  (throttledCallback as any).cleanup = cleanup;

  return throttledCallback;
}
