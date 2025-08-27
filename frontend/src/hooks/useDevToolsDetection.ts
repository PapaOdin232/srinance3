import { useState, useEffect } from 'react';

/**
 * Custom hook to detect if DevTools are open (docked to side or bottom)
 * 
 * Detection methods:
 * - Compare window.outerWidth with window.innerWidth
 * - Monitor viewport changes with ResizeObserver
 * - Threshold-based detection for reliable DevTools presence
 * 
 * @returns boolean indicating if DevTools are likely open
 */
export function useDevToolsDetection() {
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);

  useEffect(() => {
    const detectDevTools = () => {
      // Method 1: Compare outer and inner window dimensions
      const widthThreshold = 160; // DevTools typically take at least 160px
      const heightThreshold = 160;
      
      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      
      // Method 2: Check if screen space is significantly reduced
      const viewportWidth = document.documentElement.clientWidth;
      const windowWidth = window.innerWidth;
      const viewportDiff = Math.abs(viewportWidth - windowWidth);
      
      // DevTools are likely open if:
      // - Significant width difference (side-docked)
      // - Significant height difference (bottom-docked) 
      // - Or viewport differs significantly from window inner dimensions
      const isLikelyOpen = 
        widthDiff > widthThreshold || 
        heightDiff > heightThreshold ||
        viewportDiff > 100;
      
      setIsDevToolsOpen(isLikelyOpen);
    };

    // Initial detection
    detectDevTools();

    // Monitor window resize events
    const handleResize = () => {
      // Debounce to avoid excessive calls
      setTimeout(detectDevTools, 100);
    };

    window.addEventListener('resize', handleResize);
    
    // Also monitor when the window gains/loses focus
    // DevTools opening/closing can trigger focus changes
    const handleFocusChange = () => {
      setTimeout(detectDevTools, 100);
    };
    
    window.addEventListener('focus', handleFocusChange);
    window.addEventListener('blur', handleFocusChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('focus', handleFocusChange);
      window.removeEventListener('blur', handleFocusChange);
    };
  }, []);

  return isDevToolsOpen;
}

export default useDevToolsDetection;
