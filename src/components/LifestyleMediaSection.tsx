import React, { useEffect, useState } from 'react';
import { searchLifestyleMedia, type LifestyleMediaHit } from '../services/ProductMediaService';
import { STORAGE_API_BASE } from '../config/apiConfig';

// Below this similarity the semantic hits stop being visually related to
// the product — better to show nothing than an unrelated mood shot.
const MIN_SIMILARITY = 40;
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
        setHits(results.filter((h) => h.similarity >= MIN_SIMILARITY));
      })
      .catch(() => {
        // Search unavailable → section stays hidden, modal works without it.
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (hits.length === 0) return null;

  const gridUrl = (storageId: number) =>
    `${STORAGE_API_BASE}/storage/media/${storageId}?width=520&format=webp&quality=80`;
  const largeUrl = (storageId: number) =>
    `${STORAGE_API_BASE}/storage/media/${storageId}?width=1400&format=webp&quality=85`;

  return (
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
      {expandedId !== null && (
        <div
          onClick={() => setExpandedId(null)}
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
            src={largeUrl(expandedId)}
            alt="O'Neal lifestyle"
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              borderRadius: '12px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            }}
          />
        </div>
      )}
    </div>
  );
};
