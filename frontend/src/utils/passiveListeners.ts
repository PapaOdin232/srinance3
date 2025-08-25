/**
 * Utility functions for passive event listeners to improve scroll performance
 * 
 * Based on Chrome DevTools recommendations and Lighthouse best practices
 * for scroll performance optimization
 */

// Feature detection for passive event listeners support
let supportsPassive = false;
try {
  const opts = Object.defineProperty({}, 'passive', {
    get() {
      supportsPassive = true;
      return false;
    },
  });
  window.addEventListener('testPassive', null as any, opts);
  window.removeEventListener('testPassive', null as any, opts);
} catch (e) {
  supportsPassive = false;
}

/**
 * Add event listener with passive option for scroll-related events
 */
export function addPassiveEventListener(
  target: EventTarget,
  type: string,
  listener: EventListener,
  options?: AddEventListenerOptions
): void {
  const scrollEvents = ['touchstart', 'touchmove', 'wheel', 'mousewheel', 'scroll'];
  
  if (scrollEvents.includes(type) && supportsPassive) {
    const passiveOptions = {
      ...(options || {}),
      passive: true,
    };
    target.addEventListener(type, listener, passiveOptions);
  } else {
    target.addEventListener(type, listener, options);
  }
}

/**
 * Remove event listener with same options used for adding
 */
export function removePassiveEventListener(
  target: EventTarget,
  type: string,
  listener: EventListener,
  options?: AddEventListenerOptions
): void {
  const scrollEvents = ['touchstart', 'touchmove', 'wheel', 'mousewheel', 'scroll'];
  
  if (scrollEvents.includes(type) && supportsPassive) {
    const passiveOptions = {
      ...(options || {}),
      passive: true,
    };
    target.removeEventListener(type, listener, passiveOptions);
  } else {
    target.removeEventListener(type, listener, options);
  }
}

/**
 * Setup passive listeners for commonly problematic events globally
 * Call this once in your app initialization
 */
export function setupGlobalPassiveListeners(): void {
  if (!supportsPassive) return;

  // Override default addEventListener for scroll-related events on document
  const originalAddEventListener = document.addEventListener;

  document.addEventListener = function(
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions
  ) {
    const scrollEvents = ['touchstart', 'touchmove', 'wheel', 'mousewheel'];
    
    if (scrollEvents.includes(type)) {
      const opts = typeof options === 'boolean' 
        ? { capture: options, passive: true }
        : { ...(options || {}), passive: true };
      
      return originalAddEventListener.call(this, type, listener, opts);
    }
    
    return originalAddEventListener.call(this, type, listener, options);
  };

  console.log('[PassiveListeners] Global passive listeners setup completed');
}

/**
 * Debounce function for high-frequency events
 */
export function debounce<T extends (...args: any[]) => void>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: number | undefined;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => func(...args), delay);
  };
}

/**
 * Throttle function with requestAnimationFrame for smooth performance
 */
export function throttleWithRAF<T extends (...args: any[]) => void>(
  func: T
): (...args: Parameters<T>) => void {
  let isScheduled = false;

  return (...args: Parameters<T>) => {
    if (isScheduled) return;
    
    isScheduled = true;
    requestAnimationFrame(() => {
      func(...args);
      isScheduled = false;
    });
  };
}
