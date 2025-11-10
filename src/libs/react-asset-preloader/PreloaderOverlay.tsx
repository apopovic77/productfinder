import type { CSSProperties, ReactNode, FC } from 'react';
import { usePreloader } from './PreloaderContext';
import type { PreloaderConfig } from './types';

interface PreloaderOverlayProps {
  config?: PreloaderConfig;
  logo?: ReactNode;
  message?: string;
}

export const PreloaderOverlay: FC<PreloaderOverlayProps> = ({
  config = {},
  logo,
  message = 'Loading...',
}) => {
  const { state } = usePreloader();

  const shouldHide =
    !state.isLoading && (state.progress === 100 || (state.total ?? 0) === 0);

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

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: blurBackdrop ? 'rgba(0, 0, 0, 0.4)' : backgroundColor,
    backdropFilter: blurBackdrop ? 'blur(10px) saturate(180%)' : undefined,
    WebkitBackdropFilter: blurBackdrop ? 'blur(10px) saturate(180%)' : undefined,
    zIndex: 999999,
    opacity: state.isLoading ? 1 : 0,
    transition: 'opacity 0.3s ease-out',
    pointerEvents: state.isLoading ? 'auto' : 'none',
  };

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '32px',
    padding: '40px',
    maxWidth: '500px',
    width: '100%',
    backgroundColor: blurBackdrop ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
    borderRadius: '24px',
    border: blurBackdrop ? '1px solid rgba(255, 255, 255, 0.1)' : undefined,
    boxShadow: blurBackdrop ? '0 8px 32px 0 rgba(0, 0, 0, 0.37)' : undefined,
    backdropFilter: blurBackdrop ? 'blur(20px)' : undefined,
    WebkitBackdropFilter: blurBackdrop ? 'blur(20px)' : undefined,
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

  return (
    <div style={overlayStyle}>
      <div style={containerStyle}>
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {state.recentAssets?.map(asset => (
            <div
              key={asset.id}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '8px',
                overflow: 'hidden',
                border: '2px solid rgba(255, 255, 255, 0.2)',
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
                width: '80px',
                height: '80px',
                borderRadius: '8px',
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
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        border: `3px solid ${textColor}`,
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
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Preloader logo"
              style={{
                width: '120px',
                height: '120px',
                objectFit: 'contain',
              }}
            />
          ) : (
            logo
          )}

          <h2 style={messageStyle}>{message}</h2>

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

