import React, { useEffect, useState } from 'react';
import { fetchProductMedia, type ProductMediaItem } from '../services/ProductMediaService';

type Props = {
  /** O'Neal product code (SKU prefix), e.g. "0289". */
  productCode: string;
};

/**
 * Structured product media from the media index: size charts, manuals and
 * (rarely) product videos, matched via SKU prefix. Renders nothing when the
 * product has no such media — only ~160 of ~2600 products do.
 */
export const ProductDocumentsSection: React.FC<Props> = ({ productCode }) => {
  const [items, setItems] = useState<ProductMediaItem[]>([]);
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [playingVideoId, setPlayingVideoId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setExpandedUrl(null);
    setPlayingVideoId(null);
    fetchProductMedia(productCode, ['sizecharts', 'manuals'])
      .then((media) => {
        if (!cancelled) setItems(media);
      })
      .catch(() => {
        // Endpoint unavailable → section stays hidden.
      });
    return () => {
      cancelled = true;
    };
  }, [productCode]);

  if (items.length === 0) return null;

  const sizecharts = items.filter((m) => m.doc_type === 'sizecharts' && !m.is_video);
  const manuals = items.filter((m) => m.doc_type === 'manuals' && !m.is_video);
  const videos = items.filter((m) => m.is_video);

  const sectionHeading: React.CSSProperties = {
    fontSize: '24px',
    fontWeight: '700',
    marginBottom: '12px',
    color: '#1a1a1a',
  };
  const subHeading: React.CSSProperties = {
    fontSize: '15px',
    fontWeight: '600',
    margin: '18px 0 10px',
    color: '#1a1a1a',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  };

  return (
    <div
      style={{
        marginTop: '32px',
        paddingTop: '40px',
        borderTop: '1px solid rgba(0, 0, 0, 0.1)',
        width: '100%',
      }}
    >
      <h3 style={sectionHeading}>DOCUMENTS &amp; SIZING</h3>

      {videos.length > 0 && (
        <>
          <div style={subHeading}>Video</div>
          {videos.map((v) =>
            playingVideoId === v.storage_id ? (
              <video
                key={v.storage_id}
                controls
                autoPlay
                playsInline
                // full_url carries format=jpg for videos (poster frame); the
                // raw stream lives behind the same asset without transform
                src={v.full_url.replace(/([&?])format=jpg/, '$1')}
                poster={v.full_url}
                style={{ width: '100%', maxWidth: '720px', borderRadius: '16px', background: '#000' }}
              />
            ) : (
              <button
                key={v.storage_id}
                type="button"
                onClick={() => setPlayingVideoId(v.storage_id)}
                aria-label="Play product video"
                style={{
                  border: 'none',
                  padding: 0,
                  width: '100%',
                  maxWidth: '720px',
                  minHeight: '240px',
                  borderRadius: '16px',
                  backgroundImage: `url(${v.full_url})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '999px',
                    background: 'rgba(17, 24, 39, 0.9)',
                    color: 'white',
                    fontSize: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ▶
                </span>
              </button>
            ),
          )}
        </>
      )}

      {sizecharts.length > 0 && (
        <>
          <div style={subHeading}>Size chart</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {sizecharts.map((m) => (
              <img
                key={m.storage_id}
                src={m.thumb_url}
                alt={m.title || 'Size chart'}
                title={m.title}
                loading="lazy"
                onClick={() => setExpandedUrl(m.full_url)}
                style={{
                  height: '110px',
                  borderRadius: '10px',
                  cursor: 'zoom-in',
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.10)',
                  background: 'white',
                }}
              />
            ))}
          </div>
        </>
      )}

      {manuals.length > 0 && (
        <>
          <div style={subHeading}>Manuals</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {manuals.map((m) => (
              <a
                key={m.storage_id}
                href={m.full_url}
                target="_blank"
                rel="noopener noreferrer"
                title={m.title}
                style={{ position: 'relative', display: 'inline-block' }}
              >
                <img
                  src={m.thumb_url}
                  alt={m.title || 'Manual'}
                  loading="lazy"
                  style={{
                    height: '110px',
                    borderRadius: '10px',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.10)',
                    background: 'white',
                  }}
                />
                {/* PDF transforms render page 1 only — the icon marks these as documents */}
                <span
                  style={{
                    position: 'absolute',
                    right: '6px',
                    bottom: '6px',
                    background: 'rgba(17, 24, 39, 0.85)',
                    color: 'white',
                    borderRadius: '6px',
                    fontSize: '11px',
                    padding: '2px 6px',
                  }}
                >
                  📄
                </span>
              </a>
            ))}
          </div>
        </>
      )}

      {expandedUrl !== null && (
        <div
          onClick={() => setExpandedUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.82)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
            padding: '4vh 4vw',
          }}
        >
          <img
            src={expandedUrl}
            alt="Document"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              borderRadius: '12px',
              background: 'white',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            }}
          />
        </div>
      )}
    </div>
  );
};
