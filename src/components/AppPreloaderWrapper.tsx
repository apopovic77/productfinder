import React, { useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useProductPreloader } from '../hooks/useProductPreloader';
import { STORAGE_API_BASE } from '../config/apiConfig';

const STORAGE_API_URL = STORAGE_API_BASE;
const VIDEO_STORAGE_ID = 6617;
const LOGO_STORAGE_ID = 6615;

/**
 * Preloads product thumbnails into IndexedDB with the original video overlay.
 * Logo scales down as progress increases, glassmorphism dialog in lower third.
 */
export const AppPreloaderWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const state = useProductPreloader();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoaded = () => { if (video.currentTime === 0) video.currentTime = 1; };
    video.addEventListener('loadeddata', onLoaded);
    return () => video.removeEventListener('loadeddata', onLoaded);
  }, []);

  if (state.progress >= 100 && !state.isLoading) {
    return <>{children}</>;
  }

  const videoUrl = `${STORAGE_API_URL}/storage/media/${VIDEO_STORAGE_ID}?format=mp4`;
  const logoUrl = `${STORAGE_API_URL}/storage/media/${LOGO_STORAGE_ID}?format=png&width=1200`;
  const logoScale = 1 - (state.progress / 100) * 0.5;

  const overlayStyle: CSSProperties = {
    position: 'fixed', inset: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 999999,
  };

  const centralLogoStyle: CSSProperties = {
    position: 'absolute', top: '50%', left: '50%',
    transform: `translate(-50%, -50%) scale(${logoScale})`,
    maxWidth: '600px', width: '50vw', height: 'auto',
    objectFit: 'contain',
    mixBlendMode: 'screen',
    opacity: 0.9,
    transition: 'transform 0.3s ease-out',
    filter: 'drop-shadow(0 0 40px rgba(255, 255, 255, 0.3))',
  };

  const containerStyle: CSSProperties = {
    position: 'absolute', bottom: '10vh', left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: '16px', padding: '24px 32px',
    maxWidth: '400px', width: 'auto',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  };

  return (
    <div style={overlayStyle}>
      {/* Background Video */}
      <video
        ref={videoRef}
        style={{
          position: 'fixed', top: 0, left: 0,
          width: '100%', height: '100%',
          objectFit: 'cover', zIndex: -1, opacity: 0.6,
        }}
        src={videoUrl}
        autoPlay loop muted playsInline
      />
      <div style={{
        position: 'fixed', top: 0, left: 0,
        width: '100%', height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.4)', zIndex: -1,
      }} />

      {/* Central Animated Logo */}
      <img
        src={logoUrl}
        alt="O'Neal Logo"
        style={centralLogoStyle}
        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />

      {/* Loading Dialog — Lower Third */}
      <div style={containerStyle}>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Progress Bar */}
          <div style={{
            width: '100%', height: '4px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '2px', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', backgroundColor: '#fff',
              borderRadius: '2px', transition: 'width 0.3s ease-out',
              width: `${state.progress}%`,
            }} />
          </div>

          {/* Stats */}
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            width: '100%', fontSize: '14px', color: '#fff', opacity: 0.7,
          }}>
            <span style={{ fontWeight: 600, fontSize: '16px' }}>{state.progress}%</span>
            <span style={{ fontSize: '12px' }}>{state.loaded} / {state.total}</span>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
