import type { CSSProperties, ReactNode, FC } from 'react';
import { useRef, useEffect } from 'react';
import { usePreloader } from './PreloaderContext';
import type { PreloaderConfig } from './types';

// Storage API URL from environment
const STORAGE_API_URL = import.meta.env.VITE_STORAGE_API_URL || 'https://gsgbot.arkturian.com/storage-api';

interface PreloaderOverlayProps {
  config?: PreloaderConfig;
  logo?: ReactNode;
  message?: string;
  backgroundVideoStorageId?: number; // Optional background video from Storage API
  logoStorageId?: number; // Optional logo from Storage API
}

export const PreloaderOverlay: FC<PreloaderOverlayProps> = ({
  config = {},
  logo,
  message = 'Loading...',
  backgroundVideoStorageId = 6550, // Default: O'Neal background video
  logoStorageId, // Optional O'Neal logo
}) => {
  const { state } = usePreloader();
  const videoRef = useRef<HTMLVideoElement>(null);

  const shouldHide =
    !state.isLoading && (state.progress === 100 || (state.total ?? 0) === 0);

  // Build video URL from Storage API
  const videoUrl = backgroundVideoStorageId
    ? `${STORAGE_API_URL}/storage/media/${backgroundVideoStorageId}?format=mp4`
    : null;

  // Start video playback when loaded
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const handleLoadedData = () => {
      // Start video at 1 second instead of 0 (same as HeroVideoBackground)
      if (video.currentTime === 0) {
        video.currentTime = 1;
      }
    };

    video.addEventListener('loadeddata', handleLoadedData);
    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [videoUrl]);

  if (shouldHide) {
    return null;
  }

  const {
    showProgress = true,
    showCount = true,
    backgroundColor = '#000000',
    textColor = '#ffffff',
    blurBackdrop = true,
    logoUrl,
  } = config;

  // Calculate animated logo scale (100% at start -> 50% at end)
  const logoScale = 1 - (state.progress / 100) * 0.5; // 1.0 -> 0.5

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 999999,
    opacity: state.isLoading ? 1 : 0,
    transition: 'opacity 0.3s ease-out',
    pointerEvents: state.isLoading ? 'auto' : 'none',
  };

  // Loading dialog in lower third - smaller and compact
  const containerStyle: CSSProperties = {
    position: 'absolute',
    bottom: '10vh',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    padding: '24px 32px',
    maxWidth: '400px',
    width: 'auto',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  };

  const contentStyle: CSSProperties = {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  };

  const messageStyle: CSSProperties = {
    fontSize: '18px',
    fontWeight: 600,
    color: textColor,
    textAlign: 'center',
    margin: 0,
  };

  const progressContainerStyle: CSSProperties = {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  };

  const progressBarStyle: CSSProperties = {
    width: '100%',
    height: '4px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '2px',
    overflow: 'hidden',
  };

  const progressFillStyle: CSSProperties = {
    height: '100%',
    backgroundColor: textColor,
    borderRadius: '2px',
    transition: 'width 0.3s ease-out',
    width: `${state.progress}%`,
  };

  const statsStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    fontSize: '14px',
    color: textColor,
    opacity: 0.7,
  };

  const percentageStyle: CSSProperties = {
    fontWeight: 600,
    fontSize: '16px',
  };

  const countStyle: CSSProperties = {
    fontSize: '12px',
  };

  const videoStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    zIndex: -1,
    opacity: 0.6,
  };

  const videoOverlayStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: -1,
  };

  // Central large logo with blend mode and scale animation
  const centralLogoStyle: CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: `translate(-50%, -50%) scale(${logoScale})`,
    maxWidth: '600px',
    width: '50vw',
    height: 'auto',
    objectFit: 'contain',
    mixBlendMode: 'screen', // Cool blend mode
    opacity: 0.9,
    transition: 'transform 0.3s ease-out',
    filter: 'drop-shadow(0 0 40px rgba(255, 255, 255, 0.3))',
  };

  // Build logo URL from Storage API
  const onealLogoUrl = logoStorageId
    ? `${STORAGE_API_URL}/storage/media/${logoStorageId}?format=png&width=1200`
    : null;

  return (
    <div style={overlayStyle}>
      {/* Background Video */}
      {videoUrl && (
        <>
          <video
            ref={videoRef}
            style={videoStyle}
            src={videoUrl}
            autoPlay
            loop
            muted
            playsInline
          />
          <div style={videoOverlayStyle} />
        </>
      )}

      {/* Central Large Animated Logo */}
      {onealLogoUrl && (
        <img
          src={onealLogoUrl}
          alt="O'Neal Logo"
          style={centralLogoStyle}
        />
      )}

      {/* Loading Dialog - Lower Third */}
      <div style={containerStyle}>
        {/* Thumbnail Row - Smaller */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {state.recentAssets?.slice(-3).map(asset => (
            <div
              key={asset.id}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '6px',
                overflow: 'hidden',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                flexShrink: 0,
              }}
            >
              {asset.type === 'image' && (
                <img
                  src={asset.src}
                  alt=""
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              )}
            </div>
          ))}

          {state.currentAsset && (
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '6px',
                overflow: 'hidden',
                border: '2px solid rgba(255, 255, 255, 0.5)',
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              {state.currentAsset.type === 'image' && (
                <>
                  <img
                    src={state.currentAsset.src}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      opacity: 0.3,
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        border: `2px solid ${textColor}`,
                        borderTopColor: 'transparent',
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div style={contentStyle}>
          <div style={progressContainerStyle}>
            <div style={progressBarStyle}>
              <div style={progressFillStyle} />
            </div>

            <div style={statsStyle}>
              {showProgress && <span style={percentageStyle}>{state.progress}%</span>}
              {showCount && (
                <span style={countStyle}>
                  {state.loaded} / {state.total}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

