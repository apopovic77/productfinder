import React, { useEffect, useRef, useState } from 'react';
import './HeroVideoBackground.css';

// Storage proxy URL from environment
const STORAGE_PROXY_URL = import.meta.env.VITE_STORAGE_PROXY_URL || 'https://share.arkturian.com/proxy.php';

interface HeroVideoBackgroundProps {
  storageId: number;
  onClose: () => void;
  children?: React.ReactNode;
}

/**
 * Fullscreen Video Background for Hero Mode
 *
 * Plays a video from Storage API in fullscreen with overlay content
 */
export const HeroVideoBackground: React.FC<HeroVideoBackgroundProps> = ({
  storageId,
  onClose,
  children
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [dialogOpacity, setDialogOpacity] = useState(1);
  const [overlayOpacity, setOverlayOpacity] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Build video URL from Storage API
  const videoUrl = `${STORAGE_PROXY_URL}?id=${storageId}&format=mp4`;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedData = () => {
      // Start video at 1 second instead of 0
      if (video.currentTime === 0) {
        video.currentTime = 1;
      }
      setIsLoaded(true);
      setError(null);
    };

    const handleError = () => {
      setError('Failed to load video');
      console.error('[HeroVideoBackground] Failed to load video:', storageId);
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
    };
  }, [storageId]);

  // Handle close with fade-out animation
  const handleClose = () => {
    setIsClosing(true);
    setDialogOpacity(0); // Fade out dialog
    setOverlayOpacity(0); // Fade out video overlay

    // Call onClose after 50ms to trigger canvas animations (alternative products return)
    // This allows canvas animation to run simultaneously with video fadeout
    setTimeout(() => {
      onClose();
    }, 50);
  };

  // ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="hero-video-background">
      {/* Fullscreen Video */}
      <video
        ref={videoRef}
        className={`hero-video ${isLoaded && !isClosing ? 'loaded' : ''}`}
        src={videoUrl}
        autoPlay
        loop
        muted
        playsInline
      />

      {/* Dark Overlay for better text readability */}
      <div
        className="hero-video-overlay"
        style={{
          opacity: overlayOpacity,
          transition: 'opacity 1s ease-in-out'
        }}
      />

      {/* Error Message */}
      {error && (
        <div className="hero-video-error">
          <p>{error}</p>
          <button onClick={handleClose}>Close</button>
        </div>
      )}

      {/* Overlay Content (Dialog) */}
      <div
        className="hero-video-content"
        style={{
          opacity: dialogOpacity,
          transition: 'opacity 1s ease-in-out'
        }}
      >
        {React.Children.map(children, child => {
          if (React.isValidElement(child)) {
            // Override child's onClose to use our handleClose with fade-out
            return React.cloneElement(child, { onClose: handleClose } as any);
          }
          return child;
        })}
      </div>

      {/* Close Button (Top Right) */}
      <button
        className="hero-video-close"
        onClick={handleClose}
        aria-label="Close"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
};
