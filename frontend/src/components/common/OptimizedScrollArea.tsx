import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import { ScrollArea } from '@mantine/core';

/**
 * Zoptymalizowany wrapper dla Mantine ScrollArea z passive event listeners
 * i poprawioną wydajnością przewijania
 */
interface OptimizedScrollAreaProps extends ComponentPropsWithoutRef<typeof ScrollArea> {
  /** Czy włączyć dodatkowe optymalizacje dla długich list */
  optimizeForLongLists?: boolean;
  /** Czy dodać optimizacje dla częstych aktualizacji */
  optimizeForFrequentUpdates?: boolean;
}

export const OptimizedScrollArea = forwardRef<
  HTMLDivElement,
  OptimizedScrollAreaProps
>(({ 
  children, 
  optimizeForLongLists = false,
  optimizeForFrequentUpdates = false,
  className = '',
  ...props 
}, ref) => {
  const optimizedClassName = [
    className,
    optimizeForLongLists ? 'virtualized-list' : '',
    optimizeForFrequentUpdates ? 'frequent-updates' : '',
  ].filter(Boolean).join(' ');

  return (
    <ScrollArea
      ref={ref}
      className={optimizedClassName}
      {...props}
      // Dodaj właściwości optymalizujące scroll
      style={{
        ...props.style,
        // Hardware acceleration
        transform: 'translateZ(0)',
        willChange: 'scroll-position',
        // Ograniczenie overscroll
        overscrollBehavior: 'contain',
        // Touch scrolling na mobile
        WebkitOverflowScrolling: 'touch',
        // Containment API dla lepszej wydajności
        contain: 'layout style paint',
      }}
    >
      {children}
    </ScrollArea>
  );
});

OptimizedScrollArea.displayName = 'OptimizedScrollArea';
