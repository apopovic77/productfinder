import React, { useEffect, useRef, useState } from 'react';
import './HeroVideoBackground.css';
import { STORAGE_API_BASE } from '../config/apiConfig';
import { searchLifestyleMedia, LIFESTYLE_MIN_SIMILARITY } from '../services/ProductMediaService';
import { focalBackgroundPosition, type BannerFocal } from '../utils/bannerFocal';
import { DIALOG_MORPH_EASE, DIALOG_MORPH_SECONDS, expandedDialogGeometry, usesHalfScreenDialog } from '../utils/expandedDialog';

// Storage API URL from environment
const STORAGE_API_URL = STORAGE_API_BASE;

interface HeroVideoBackgroundProps {
  /** Fallback video when no product-related backdrop image is found. */
  storageId: number;
  /** Semantic query for a product-related backdrop (top lifestyle hit). */
  imageQuery?: string;
  /** Marke des Produkts: Treffer dieser Marke haben Vorrang (Kini zeigt Kini). */
  imageBrand?: string;
  /** Streut zwischen den besten Treffern, damit nicht jedes Produkt einer
   *  Kategorie dasselbe Bild bekommt (z. B. die Produkt-id). */
  imageSeed?: number;
  /**
   * Kategorie-Banner als Bild links vom Detaildialog (Sonja Goldmann
   * 2026-10-21). Gesetzt hat es Vorrang vor der Bildsuche.
   */
  bannerStorageId?: number;
  /**
   * Bild oder Video hinter dem Dialog. Aus: nur die dunkle Abdeckung, der
   * aufgeklappte Dialog liegt zentriert darueber (owner 2026-10-21).
   */
  showMedia?: boolean;
  /** Opacity of the optional lifestyle backdrop; zero keeps the product canvas visible. */
  backdropOpacity?: number;
  onClose: () => void;
  /**
   * Sichtbar und klickbar. Die Komponente wird schon mit der Produktkarte
   * unsichtbar eingehaengt, damit Suche und Bild fertig geladen sind, wenn der
   * Detaildialog aufgeht; dann blenden Bild und Dialog im selben Takt ein
   * (owner 2026-10-20, Video 131627).
   */
  active?: boolean;
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
  imageBrand,
  imageSeed = 0,
  bannerStorageId,
  showMedia = true,
  backdropOpacity = 1,
  onClose,
  active = true,
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
  // Focal-aware crop: storage-api's face detector (GET /media/{id}/focal,
  // AI-cost-free, cached server-side). Helmeted riders usually yield no
  // face -> keep the 78% heuristic; a real focal steers the crop so the
  // subject stays visible in the strip left of the detail dialog.
  const [bgFocal, setBgFocal] = useState<BannerFocal | null>(null);
  // Das Hintergrundbild fuellt nur die Flaeche links vom Detaildialog. Vorher
  // lag es unter dem ganzen Bildschirm und wurde per "78% center" verschoben;
  // auf breiten Bildschirmen schneidet cover aber nur oben/unten, die
  // Verschiebung wirkte nicht, und der Fahrer sass hinter dem Dialog
  // (owner 2026-10-20, media 131623).
  const [dialogInset, setDialogInset] = useState(() => (usesHalfScreenDialog() ? expandedDialogGeometry().width : 0));
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [bgResolved, setBgResolved] = useState(!imageQuery && !bannerStorageId);

  useEffect(() => {
    let cancelled = false;
    setIsLoaded(false);
    setBgImageUrl(null);
    setBgFocal(null);
    const showImage = (storageId: number) => {
      setBgImageUrl(`${STORAGE_API_URL}/storage/media/${storageId}?width=1920&format=webp&quality=82`);
      fetch(`${STORAGE_API_URL}/storage/media/${storageId}/focal`)
        .then(r => (r.ok ? r.json() : null))
        .then(focal => {
          if (cancelled || !focal?.focal_point) return;
          const width = focal.image_width;
          const height = focal.image_height;
          setBgFocal({
            xPct: focal.focal_point.x_pct,
            yPct: focal.focal_point.y_pct,
            imageAspect: width && height ? width / height : 1.5,
          });
        })
        .catch(() => {});
    };
    if (bannerStorageId) {
      showImage(bannerStorageId);
      setBgResolved(true);
      return () => {
        cancelled = true;
      };
    }
    if (!imageQuery) {
      setBgResolved(true);
      return;
    }
    setBgResolved(false);
    searchLifestyleMedia(imageQuery, 8)
      .then((hits) => {
        if (cancelled) return;
        // Vorher immer Treffer 1 einer Anfrage ohne Marke und Produkttyp:
        // ueberall dasselbe O'Neal-Foto, auch bei Kini (owner 2026-10-20,
        // media 131629). Jetzt Marke zuerst, dann unter den besten drei je
        // Produkt gestreut.
        const good = hits.filter(h => h.similarity >= LIFESTYLE_MIN_SIMILARITY);
        const brandKey = (imageBrand ?? '').toLowerCase();
        const sameBrand = brandKey ? good.filter(h => (h.brand ?? '').toLowerCase() === brandKey) : [];
        const pool = (sameBrand.length > 0 ? sameBrand : good).slice(0, 3);
        const hit = pool.length > 0 ? pool[Math.abs(imageSeed) % pool.length] : undefined;
        if (hit && hit.similarity >= LIFESTYLE_MIN_SIMILARITY) {
          showImage(hit.storage_id);
        }
        setBgResolved(true);
      })
      .catch(() => {
        if (!cancelled) setBgResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [imageQuery, imageBrand, imageSeed, bannerStorageId]);

  // Freie Flaeche links vom aufgeklappten Dialog: dieselbe Geometrie wie der
  // Dialog selbst (utils/expandedDialog), ab dem ersten Bild an ihrem Platz.
  // Vorher wurde die Dialogkante waehrend seiner Animation nachgemessen, das
  // Bild sprang hinterher (owner 2026-10-20, media 131626).
  useEffect(() => {
    const update = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      setDialogInset(usesHalfScreenDialog() ? expandedDialogGeometry().width : 0);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const freeWidth = Math.max(1, viewport.w - dialogInset);
  const bgPosition = bgFocal
    ? focalBackgroundPosition(bgFocal, freeWidth / Math.max(1, viewport.h))
    : 'center';

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
      if (!active) return;
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, active]);

  const fade = `opacity ${DIALOG_MORPH_SECONDS}s cubic-bezier(${DIALOG_MORPH_EASE.join(',')})`;

  return (
    <div
      className="hero-video-background"
      style={{
        cursor: 'pointer',
        opacity: active ? 1 : 0,
        pointerEvents: active ? 'auto' : 'none',
        transition: fade,
      }}
      aria-hidden={!active}
      onClick={onClose}
    >
      {/* Product-related backdrop image (Ken-Burns), sport video as fallback */}
      {!showMedia ? null : bgImageUrl ? (
        <div
          className={`hero-bg-image ${isLoaded && !isClosing ? 'loaded' : ''}`}
          style={{
            backgroundImage: `url(${bgImageUrl})`,
            backgroundPosition: bgPosition,
            right: dialogInset,
            // Im Takt des Dialogs einblenden statt mit eigener 1-s-Blende
            transition: fade,
            opacity: isLoaded && !isClosing ? backdropOpacity : 0,
          }}
        />
      ) : bgResolved && active ? (
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
          transition: fade
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
