import { useRef, useEffect } from 'react';

/**
 * Hook do wykrywania zmian w cenie aktywów dla animacji
 * @param assets - lista aktywów do monitorowania
 * @returns Map z symbolami i kierunkiem zmiany ('up' | 'down' | null)
 */
export const usePriceChangeAnimation = (assets: any[]) => {
  const previousPricesRef = useRef<Map<string, number>>(new Map());
  const changesRef = useRef<Map<string, 'up' | 'down' | null>>(new Map());

  useEffect(() => {
    const currentPrices = new Map<string, number>();
    const newChanges = new Map<string, 'up' | 'down' | null>();

    assets.forEach(asset => {
      const currentPrice = asset.price;
      const previousPrice = previousPricesRef.current.get(asset.symbol);
      
      currentPrices.set(asset.symbol, currentPrice);

      if (previousPrice !== undefined && previousPrice !== currentPrice) {
        if (currentPrice > previousPrice) {
          newChanges.set(asset.symbol, 'up');
        } else if (currentPrice < previousPrice) {
          newChanges.set(asset.symbol, 'down');
        }
      }
    });

    // Update refs
    previousPricesRef.current = currentPrices;
    changesRef.current = newChanges;

    // Clear animations after 2 seconds
    if (newChanges.size > 0) {
      setTimeout(() => {
        changesRef.current.clear();
      }, 2000);
    }
  }, [assets]);

  return changesRef.current;
};
