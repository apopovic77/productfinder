import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { searchLifestyleMedia, LIFESTYLE_MIN_SIMILARITY, type LifestyleMediaHit } from '../services/ProductMediaService';
import { STORAGE_API_BASE } from '../config/apiConfig';

const MAX_HITS = 6;

type Props = {
  /** Semantic query, e.g. "MX Helm rot Action" — built from product taxonomy. */
  query: string;
};

/**
 * Product-related lifestyle / action imagery from the O'Neal media library,
 * found via knowledge-graph semantic search. Renders nothing while loading,
 * on error, or when no sufficiently similar images exist — the section only
 * appears when there is real content to show.
 */
export const LifestyleMediaSection: React.FC<Props> = ({ query }) => {
  const [hits, setHits] = useState<LifestyleMediaHit[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHits([]);
    setExpandedId(null);
    searchLifestyleMedia(query, MAX_HITS)
      .then((results) => {
        if (cancelled) return;
        setHits(results.filter((h) => h.similarity >= LIFESTYLE_MIN_SIMILARITY));
      })
      .catch(() => {
        // Search unavailable → section stays hidden, modal works without it.
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    if (expandedId === null) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpandedId(null);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [expandedId]);

  if (hits.length === 0) return null;

  const gridUrl = (storageId: number) =>
    `${STORAGE_API_BASE}/storage/media/${storageId}?width=520&format=webp&quality=80`;
  const largeUrl = (storageId: number) =>
    `${STORAGE_API_BASE}/storage/media/${storageId}?width=1400&format=webp&quality=85`;

  const lightbox = expandedId !== null
    ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="O'Neal lifestyle image"
          onClick={() => setExpandedId(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.86)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
            padding: 'clamp(20px, 4vh, 48px) clamp(20px, 4vw, 64px)',
            boxSizing: 'border-box',
          }}
        >
          <button
            type="button"
            aria-label="Close image"
            onClick={(event) => {
              event.stopPropagation();
              setExpandedId(null);
            }}
            style={{
              position: 'absolute',
              top: 'max(16px, env(safe-area-inset-top))',
              right: 'max(16px, env(safe-area-inset-right))',
              width: '44px',
              height: '44px',
              minWidth: '44px',
              minHeight: '44px',
              padding: 0,
              boxSizing: 'border-box',
              border: '1px solid rgba(255,255,255,0.72)',
              borderRadius: '50%',
              background: 'rgba(16,16,16,0.82)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: '0 8px 28px rgba(0,0,0,0.38)',
              color: '#fff',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              zIndex: 1,
            }}
          >
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M4 4l12 12M16 4L4 16" />
            </svg>
          </button>
          <img
            src={largeUrl(expandedId)}
            alt="O'Neal lifestyle"
            onClick={(event) => event.stopPropagation()}
            style={{
              display: 'block',
              maxWidth: 'min(1400px, 92vw)',
              maxHeight: '88vh',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              borderRadius: '12px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              cursor: 'default',
            }}
          />
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div
        style={{
          marginTop: '32px',
          paddingTop: '40px',
          borderTop: '1px solid rgba(0, 0, 0, 0.1)',
          width: '100%',
        }}
      >
        <h3 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '12px', color: '#1a1a1a' }}>
          LIFESTYLE &amp; ACTION
        </h3>
        <p style={{ fontSize: '14px', color: 'rgba(0, 0, 0, 0.6)', marginBottom: '16px' }}>
          Matching impressions from the O&apos;Neal media library.
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '12px',
          }}
        >
          {hits.map((hit) => (
            <img
              key={hit.storage_id}
              src={gridUrl(hit.storage_id)}
              alt={hit.source_description?.slice(0, 120) || 'O’Neal lifestyle'}
              loading="lazy"
              onClick={() => setExpandedId(hit.storage_id)}
              style={{
                width: '100%',
                aspectRatio: '4 / 3',
                objectFit: 'cover',
                borderRadius: '14px',
                cursor: 'zoom-in',
                boxShadow: '0 6px 18px rgba(0, 0, 0, 0.10)',
              }}
            />
          ))}
        </div>
      </div>
      {lightbox}
    </>
  );
};
