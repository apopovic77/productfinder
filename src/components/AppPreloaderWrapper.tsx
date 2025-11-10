import React from 'react';
import { useProductPreloader } from '../hooks/useProductPreloader';

/**
 * Wrapper component that triggers product image preloading
 *
 * This functional component uses the useProductPreloader hook to register
 * and preload all product images when the app starts.
 *
 * IMPORTANT: The app children are NOT rendered until preloading is complete.
 * This ensures all images are loaded before the app initializes.
 */
export const AppPreloaderWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const preloaderState = useProductPreloader();

  // Log progress for debugging
  React.useEffect(() => {
    if (preloaderState.isLoading) {
      console.log(`[Preloader] Loading: ${preloaderState.loaded}/${preloaderState.total} (${preloaderState.progress}%)`);
    } else if (preloaderState.progress === 100) {
      console.log('[Preloader] Complete! Initializing app...');
    }
  }, [preloaderState.isLoading, preloaderState.progress, preloaderState.loaded, preloaderState.total]);

  // Don't render the app until preloading is complete
  if (preloaderState.isLoading || preloaderState.progress < 100) {
    return null;
  }

  return <>{children}</>;
};
