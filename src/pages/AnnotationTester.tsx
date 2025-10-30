import React, { useEffect, useMemo, useRef, useState } from 'react';

type Annotation = {
  label: string;
  type?: string;
  anchor: { x: number; y: number };
  box?: [number, number, number, number];
  confidence?: number;
  source?: string;
};

type AnnotationsResponse = {
  object_id: number;
  annotations: Annotation[];
  imageSpace?: 'relative';
  vision_mode?: string | null;
  updated_at?: string | null;
};

const STORAGE_API_BASE = import.meta.env.VITE_STORAGE_API_URL || 'https://api-storage.arkturian.com';
const DEFAULT_API_KEY = import.meta.env.VITE_STORAGE_API_KEY || '';

export default function AnnotationTester(): JSX.Element {
  const [objectId, setObjectId] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>(DEFAULT_API_KEY);
  const [visionMode, setVisionMode] = useState<'auto' | 'product' | 'generic'>('product');
  const [contextRole, setContextRole] = useState<'product' | 'lifestyle' | 'doc' | 'other'>('product');
  const [aiMetadata, setAiMetadata] = useState<string>('');
  const [imgUrl, setImgUrl] = useState<string>('');
  const SAMPLE_PLACEHOLDER = "{\"brand\":\"O'Neal\",\"features\":[\"knee protector\",\"zipper\"]}";
  const [loading, setLoading] = useState<boolean>(false);
  const [taskId, setTaskId] = useState<string>('');
  const [taskStatus, setTaskStatus] = useState<any>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const pollRef = useRef<number | null>(null);

  const headers = useMemo(() => ({ 'X-API-Key': apiKey }), [apiKey]);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const resolveImageUrl = (id: string) => `${STORAGE_API_BASE}/storage/media/${id}?width=900&format=webp&quality=85`;

  const handleLoadImage = () => {
    if (!objectId) return;
    setImgUrl(resolveImageUrl(objectId));
  };

  const startAnalysis = async () => {
    if (!objectId) return;
    setLoading(true);
    setAnnotations([]);
    setTaskId('');
    setTaskStatus(null);

    const params = new URLSearchParams({
      mode: 'quality',
      ai_tasks: 'vision,embedding,kg',
      ai_vision_mode: visionMode,
      ai_context_role: contextRole,
    });
    if (aiMetadata.trim()) {
      params.set('ai_metadata', aiMetadata.trim());
    }

    const url = `${STORAGE_API_BASE}/storage/analyze-async/${objectId}?${params.toString()}`;
    const res = await fetch(url, { method: 'POST', headers });
    if (!res.ok) {
      setLoading(false);
      alert(`Analyze start failed: ${res.status} ${res.statusText}`);
      return;
    }
    const json = await res.json();
    setTaskId(json.task_id);
    // Begin polling
    pollRef.current = window.setInterval(async () => {
      const s = await fetch(`${STORAGE_API_BASE}/storage/tasks/${json.task_id}`, { headers });
      if (s.ok) {
        const st = await s.json();
        setTaskStatus(st);
        if (st.status === 'completed' || st.status === 'failed') {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setLoading(false);
          if (st.status === 'completed') {
            await fetchAnnotations();
          }
        }
      }
    }, 1500);
  };

  const fetchAnnotations = async () => {
    if (!objectId) return;
    const res = await fetch(`${STORAGE_API_BASE}/storage/objects/${objectId}/annotations`, { headers });
    if (!res.ok) {
      alert(`Fetch annotations failed: ${res.status}`);
      return;
    }
    const data: AnnotationsResponse = await res.json();
    setAnnotations(data.annotations || []);
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell', padding: 16, color: '#0b1a33' }}>
      <h2 style={{ margin: '0 0 12px' }}>Annotation Tester</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 8, alignItems: 'center', maxWidth: 980 }}>
        <label>Storage Object ID</label>
        <input value={objectId} onChange={e => setObjectId(e.target.value)} placeholder="12345" style={{ padding: 8 }} />

        <label>API Key</label>
        <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="X-API-Key" style={{ padding: 8 }} />

        <label>Vision Mode</label>
        <select value={visionMode} onChange={e => setVisionMode(e.target.value as any)} style={{ padding: 8 }}>
          <option value="auto">auto</option>
          <option value="product">product</option>
          <option value="generic">generic</option>
        </select>

        <label>Context Role</label>
        <select value={contextRole} onChange={e => setContextRole(e.target.value as any)} style={{ padding: 8 }}>
          <option value="product">product</option>
          <option value="lifestyle">lifestyle</option>
          <option value="doc">doc</option>
          <option value="other">other</option>
        </select>

        <label>AI Metadata (JSON)</label>
        <textarea value={aiMetadata} onChange={e => setAiMetadata(e.target.value)} rows={4} placeholder={SAMPLE_PLACEHOLDER} style={{ padding: 8 }} />
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={handleLoadImage} disabled={!objectId} style={{ padding: '8px 12px' }}>Load Image</button>
        <button onClick={startAnalysis} disabled={!objectId || !apiKey || loading} style={{ padding: '8px 12px' }}>
          {loading ? 'Analyzing…' : 'Start Analysis'}
        </button>
        <button onClick={fetchAnnotations} disabled={!objectId} style={{ padding: '8px 12px' }}>Fetch Annotations</button>
      </div>

      {taskId && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
          Task: {taskId} {taskStatus ? `(${taskStatus.status})` : ''}
        </div>
      )}

      <div style={{ marginTop: 16, position: 'relative', display: 'inline-block' }}>
        {imgUrl && (
          <ImageWithOverlay src={imgUrl} annotations={annotations} />
        )}
      </div>
    </div>
  );
}

function ImageWithOverlay({ src, annotations }: { src: string; annotations: Annotation[] }) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const onLoad = () => setDims({ w: img.clientWidth, h: img.clientHeight });
    img.addEventListener('load', onLoad);
    const ro = new ResizeObserver(() => onLoad());
    ro.observe(img);
    return () => {
      img.removeEventListener('load', onLoad);
      ro.disconnect();
    };
  }, [src]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <img ref={imgRef} src={src} alt="preview" style={{ display: 'block', maxWidth: '100%', borderRadius: 8 }} />
      {annotations.map((a, i) => {
        const left = a.anchor?.x * dims.w;
        const top = a.anchor?.y * dims.h;
        const box = a.box ? [a.box[0] * dims.w, a.box[1] * dims.h, a.box[2] * dims.w, a.box[3] * dims.h] : null;
        return (
          <React.Fragment key={i}>
            <div style={{ position: 'absolute', left: left - 6, top: top - 6, width: 12, height: 12, borderRadius: 12, background: '#10b981', border: '2px solid #064e3b', boxShadow: '0 0 0 2px rgba(16,185,129,0.2)' }} title={`${a.label} (${a.type || 'feature'})`} />
            <div style={{ position: 'absolute', left: left + 10, top }}>
              <div style={{ background: 'rgba(15,23,42,0.8)', color: 'white', padding: '6px 8px', fontSize: 12, borderRadius: 6, backdropFilter: 'blur(4px)' }}>
                <div style={{ fontWeight: 600 }}>{a.label}</div>
                <div style={{ opacity: 0.8 }}>{a.type || 'feature'}{typeof a.confidence === 'number' ? ` • ${(a.confidence * 100).toFixed(0)}%` : ''}</div>
              </div>
            </div>
            {box && (
              <div style={{ position: 'absolute', left: box[0], top: box[1], width: Math.max(0, box[2] - box[0]), height: Math.max(0, box[3] - box[1]), border: '2px dashed rgba(59,130,246,0.9)', borderRadius: 6 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}


