import React, { useEffect, useRef, useState } from 'react';
import './HeroVideoBackground.css';
import { STORAGE_API_BASE } from '../config/apiConfig';
import { searchLifestyleMedia, LIFESTYLE_MIN_SIMILARITY } from '../services/ProductMediaService';

// Storage API URL from environment
const STORAGE_API_URL = STORAGE_API_BASE;

interface HeroVideoBackgroundProps {
  /** Fallback video when no product-related backdrop image is found. */
  storageId: number;
  /** Semantic query for a product-related backdrop (top lifestyle hit). */
  imageQuery?: string;
  /** Opacity of the optional lifestyle backdrop; zero keeps the product canvas visible. */
  backdropOpacity?: number;
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
  imageQuery,
  backdropOpacity = 1,
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
  const videoUrl = `${STORAGE_API_URL}/storage/media/${storageId}?format=mp4`;

  // Product-related backdrop: top semantic lifestyle hit. While the search
  // is pending nothing renders (background stays dark); on a miss or error
  // the sport video takes over as before.
  const [bgImageUrl, setBgImageUrl] = useState<string | null>(null);
  const [bgResolved, setBgResolved] = useState(!imageQuery);

  useEffect(() => {
    let cancelled = false;
    setIsLoaded(false);
    setBgImageUrl(null);
    if (!imageQuery) {
      setBgResolved(true);
      return;
    }
    setBgResolved(false);
    searchLifestyleMedia(imageQuery, 1)
      .then((hits) => {
        if (cancelled) return;
        const hit = hits[0];
        if (hit && hit.similarity >= LIFESTYLE_MIN_SIMILARITY) {
          setBgImageUrl(`${STORAGE_API_URL}/storage/media/${hit.storage_id}?width=1920&format=webp&quality=82`);
        }
        setBgResolved(true);
      })
      .catch(() => {
        if (!cancelled) setBgResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [imageQuery]);

  // Preload the backdrop image so the 1s fade-in starts fully decoded
  useEffect(() => {
    if (!bgImageUrl) return;
    const img = new Image();
    img.onload = () => setIsLoaded(true);
    img.src = bgImageUrl;
    return () => {
      img.onload = null;
    };
  }, [bgImageUrl]);

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
  }, [storageId, bgResolved, bgImageUrl]);

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
    <div
      className="hero-video-background"
      style={{ cursor: 'pointer' }}
      onClick={onClose}
    >
      {/* Product-related backdrop image (Ken-Burns), sport video as fallback */}
      {bgImageUrl ? (
        <div
          className={`hero-bg-image ${isLoaded && !isClosing ? 'loaded' : ''}`}
          style={{
            backgroundImage: `url(${bgImageUrl})`,
            opacity: isLoaded && !isClosing ? backdropOpacity : 0,
          }}
        />
      ) : bgResolved ? (
        <video
          ref={videoRef}
          className={`hero-video ${isLoaded && !isClosing ? 'loaded' : ''}`}
          style={{ opacity: isLoaded && !isClosing ? backdropOpacity : 0 }}
          src={videoUrl}
          autoPlay
          loop
          muted
          playsInline
        />
      ) : null}

      {/* Dark Overlay for better text readability */}
      <div
        className="hero-video-overlay"
        style={{
          opacity: overlayOpacity * backdropOpacity,
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
