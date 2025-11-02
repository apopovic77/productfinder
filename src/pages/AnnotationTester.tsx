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
// Fallback to well-known demo key if env not provided
const DEFAULT_API_KEY = import.meta.env.VITE_STORAGE_API_KEY || 'oneal_demo_token';

export default function AnnotationTester(): React.JSX.Element {
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
  const [objectDetailsJson, setObjectDetailsJson] = useState<string>('');
  const [promptText, setPromptText] = useState<string>('');
  const [responseText, setResponseText] = useState<string>('');
  const [annotationsJson, setAnnotationsJson] = useState<string>('');
  const [taskStatusJson, setTaskStatusJson] = useState<string>('');
  const [showCanvasDebug, setShowCanvasDebug] = useState<boolean>(false);
  const pollRef = useRef<number | null>(null);

  const headers = useMemo(() => ({ 'X-API-KEY': apiKey }), [apiKey]);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const resolveImageUrl = (id: string) => `${STORAGE_API_BASE}/storage/media/${id}?width=900&format=webp&quality=85`;

  const stringifySafe = (value: any): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch (err) {
      console.warn('Failed to stringify value', err);
      return String(value);
    }
  };

  const applyObjectDetails = (obj: any) => {
    if (!obj) return;
    setObjectDetailsJson(stringifySafe(obj));

    const ctx = obj.ai_context_metadata || {};
    setPromptText(stringifySafe(ctx.prompt));
    setResponseText(stringifySafe(ctx.response));

    const embedInfo = ctx.embedding_info || {};
    const embedMeta = embedInfo.metadata || {};
    const metaAnnotations = embedMeta.annotations || [];
    if (Array.isArray(metaAnnotations)) {
      setAnnotationsJson(stringifySafe(metaAnnotations));
    } else {
      setAnnotationsJson('');
    }
  };

  const loadObjectDetails = async (id: string, { silent }: { silent?: boolean } = {}) => {
    try {
      const res = await fetch(`${STORAGE_API_BASE}/storage/objects/${id}`, { headers });
      if (res.ok) {
        const obj = await res.json();
        applyObjectDetails(obj);
        return obj;
      }
      if (!silent) {
        alert(`Load object failed: ${res.status} ${res.statusText}`);
      }
    } catch (err) {
      console.warn('Failed to load object metadata', err);
      if (!silent) {
        alert('Failed to load object metadata, see console for details.');
      }
    }
    return null;
  };

  const handleLoadImage = async () => {
    if (!objectId) return;
    const obj = await loadObjectDetails(objectId, { silent: true });
    if (obj) {
      const preferredUrl = obj.webview_url || obj.file_url || resolveImageUrl(objectId);
      setImgUrl(preferredUrl);
    } else {
      setImgUrl(resolveImageUrl(objectId));
    }
  };

  const startAnalysis = async () => {
    if (!objectId) return;
    setLoading(true);
    setAnnotations([]);
    setAnnotationsJson('');
    setTaskId('');
    setTaskStatus(null);
    setTaskStatusJson('');
    setPromptText('');
    setResponseText('');

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
      let detail = '';
      try { detail = await res.text(); } catch {}
      alert(`Analyze start failed: ${res.status} ${res.statusText}${detail ? `\n${detail}` : ''}`);
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
        setTaskStatusJson(stringifySafe(st));
        if (st.status === 'completed' || st.status === 'failed') {
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = null;
          setLoading(false);
          if (st.status === 'completed') {
            await loadObjectDetails(objectId, { silent: true });
            await fetchAnnotations();
          }
        }
      } else {
        let t = '';
        try { t = await s.text(); } catch {}
        console.warn('Task status error', s.status, t);
      }
    }, 1500);
  };

  const fetchAnnotations = async ({ silent }: { silent?: boolean } = {}) => {
    if (!objectId) return;
    const res = await fetch(`${STORAGE_API_BASE}/storage/objects/${objectId}/annotations`, { headers });
    if (!res.ok) {
      if (!silent) {
        alert(`Fetch annotations failed: ${res.status}`);
      }
      return;
    }
    const data: AnnotationsResponse = await res.json();
    setAnnotations(data.annotations || []);
    setAnnotationsJson(stringifySafe(data.annotations || []));
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell', padding: 16, color: '#0b1a33' }}>
      <h2 style={{ margin: '0 0 12px' }}>Annotation Tester</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 8, alignItems: 'center', maxWidth: 980 }}>
        <label htmlFor="storage-object-id">Storage Object ID</label>
        <input
          id="storage-object-id"
          value={objectId}
          onChange={e => setObjectId(e.target.value)}
          placeholder="12345"
          style={{ padding: 8 }}
        />

        <label htmlFor="api-key-input">API Key</label>
        <input
          id="api-key-input"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="X-API-Key"
          style={{ padding: 8 }}
        />
        <div style={{ gridColumn: '2 / span 1', fontSize: 12, opacity: 0.7, marginTop: -6, marginBottom: 6 }}>
          Using: {DEFAULT_API_KEY ? 'default key from env or demo' : 'set manually'}
        </div>

        <label htmlFor="vision-mode-select">Vision Mode</label>
        <select
          id="vision-mode-select"
          value={visionMode}
          onChange={e => setVisionMode(e.target.value as any)}
          style={{ padding: 8 }}
        >
          <option value="auto">auto</option>
          <option value="product">product</option>
          <option value="generic">generic</option>
        </select>

        <label htmlFor="context-role-select">Context Role</label>
        <select
          id="context-role-select"
          value={contextRole}
          onChange={e => setContextRole(e.target.value as any)}
          style={{ padding: 8 }}
        >
          <option value="product">product</option>
          <option value="lifestyle">lifestyle</option>
          <option value="doc">doc</option>
          <option value="other">other</option>
        </select>

        <label htmlFor="ai-metadata-textarea">AI Metadata (JSON)</label>
        <textarea
          id="ai-metadata-textarea"
          value={aiMetadata}
          onChange={e => setAiMetadata(e.target.value)}
          rows={4}
          placeholder={SAMPLE_PLACEHOLDER}
          style={{ padding: 8 }}
        />
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button type="button" onClick={handleLoadImage} disabled={!objectId} style={{ padding: '10px 14px', background: '#ffffff', color: '#0b1a33', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8, cursor: !objectId ? 'not-allowed' : 'pointer' }}>Load Image</button>
        <button type="button" onClick={startAnalysis} disabled={!objectId || !apiKey || loading} style={{ padding: '10px 14px', background: '#ffffff', color: '#0b1a33', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8, cursor: (!objectId || !apiKey || loading) ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Analyzing…' : 'Start Analysis'}
        </button>
        <button
          type="button"
          onClick={() => fetchAnnotations({ silent: false })}
          disabled={!objectId}
          style={{ padding: '10px 14px', background: '#ffffff', color: '#0b1a33', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8, cursor: !objectId ? 'not-allowed' : 'pointer' }}
        >
          Fetch Annotations
        </button>
        <button
          type="button"
          onClick={() => setShowCanvasDebug(prev => !prev)}
          disabled={!imgUrl}
          style={{ padding: '10px 14px', background: showCanvasDebug ? '#0b1a33' : '#ffffff', color: showCanvasDebug ? '#ffffff' : '#0b1a33', border: '1px solid rgba(0,0,0,0.15)', borderRadius: 8, cursor: !imgUrl ? 'not-allowed' : 'pointer' }}
        >
          {showCanvasDebug ? 'Hide Canvas Debug' : 'Show Canvas Debug'}
        </button>
      </div>

      {taskId && (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
          Task: {taskId} {taskStatus ? `(${taskStatus.status})` : ''}
        </div>
      )}

      <div style={{ marginTop: 16, position: 'relative', display: 'inline-block' }}>
        {imgUrl && (
          <ImageWithOverlay objectId={objectId} src={imgUrl} annotations={annotations} />
        )}
      </div>

      {showCanvasDebug && imgUrl && (
        <div style={{ marginTop: 24 }}>
          <CanvasAnnotationDebug objectId={objectId} src={imgUrl} annotations={annotations} />
        </div>
      )}

      <div style={{ marginTop: 24, display: 'grid', gap: 16, maxWidth: 980 }}>
        <DataSection title="Task Status" content={taskStatusJson} />
        <DataSection title="Prompt" content={promptText} />
        <DataSection title="AI Response" content={responseText} />
        <DataSection title="Annotations (raw)" content={annotationsJson} />
        <DataSection title="Object Metadata" content={objectDetailsJson} />
      </div>
    </div>
  );
}

function ImageWithOverlay({ objectId, src, annotations }: { objectId: string; src: string; annotations: Annotation[] }) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const update = () => {
      const width = img.clientWidth;
      const height = img.clientHeight;
      setDims({ w: width, h: height });
    };

    update();

    img.addEventListener('load', update);
    const ro = new ResizeObserver(update);
    ro.observe(img);
    window.addEventListener('resize', update);

    return () => {
      img.removeEventListener('load', update);
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [src]);

  const clamp = (value: number) => Math.min(1, Math.max(0, value));

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', lineHeight: 0 }}>
      <img
        ref={imgRef}
        src={src}
        alt="preview"
        style={{ display: 'block', maxWidth: '100%', borderRadius: 8 }}
      />
      {dims.w > 0 && dims.h > 0 && annotations.map((a, i) => {
        const anchorX = clamp(a.anchor?.x ?? 0);
        const anchorY = clamp(a.anchor?.y ?? 0);
        const left = anchorX * dims.w;
        const top = anchorY * dims.h;

        const side: 'left' | 'right' = anchorX > 0.55 ? 'left' : 'right';
        const calloutShift = side === 'right' ? 180 : -180;
        const calloutX = clamp((left + calloutShift) / dims.w) * dims.w;
        const calloutY = top;
        const connectorLength = Math.max(30, Math.abs(calloutX - left) - 20);

        const rawBox = a.box ?? null;
        let box: { left: number; top: number; width: number; height: number } | null = null;
        if (rawBox && rawBox.length === 4) {
          const bx0 = clamp(rawBox[0]);
          const by0 = clamp(rawBox[1]);
          const bx2 = clamp(rawBox[2]);
          const by2 = clamp(rawBox[3]);

          const treatAsWidthHeight = bx2 <= bx0 || by2 <= by0;
          const widthNorm = treatAsWidthHeight
            ? Math.max(0, bx2)
            : Math.max(0, bx2 - bx0);
          const heightNorm = treatAsWidthHeight
            ? Math.max(0, by2)
            : Math.max(0, by2 - by0);

          const actualWidth = Math.max(0, widthNorm * dims.w);
          const actualHeight = Math.max(0, heightNorm * dims.h);

          const maxDim = Math.max(dims.w, dims.h);
          const tolerance = maxDim > 0 ? 0.01 : 0;

          const normalizedWidth = actualWidth / dims.w;
          const normalizedHeight = actualHeight / dims.h;

          const shouldExtend = normalizedWidth < tolerance || normalizedHeight < tolerance;

          box = {
            left: bx0 * dims.w,
            top: by0 * dims.h,
            width: shouldExtend ? dims.w : actualWidth,
            height: shouldExtend ? dims.h : actualHeight,
            extendToEdges: shouldExtend,
          };
        }

        return (
          <React.Fragment key={`${a.label}-${i}`}>
            <div
              style={{
                position: 'absolute',
                left,
                top,
                width: 12,
                height: 12,
                borderRadius: '999px',
                background: '#10b981',
                border: '2px solid #064e3b',
                boxShadow: '0 0 0 2px rgba(16,185,129,0.2)',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none',
              }}
              title={`${a.label} (${a.type || 'feature'})`}
            />
            {/* Connector line */}
            <svg
              style={{
                position: 'absolute',
                left: Math.min(left, calloutX),
                top: Math.min(top, calloutY),
                width: Math.abs(calloutX - left) || 1,
                height: Math.abs(calloutY - top) || 1,
                pointerEvents: 'none',
                overflow: 'visible',
              }}
            >
              <line
                x1={left >= calloutX ? Math.abs(calloutX - left) : 0}
                y1={top >= calloutY ? Math.abs(calloutY - top) : 0}
                x2={left >= calloutX ? 0 : Math.abs(calloutX - left)}
                y2={top >= calloutY ? 0 : Math.abs(calloutY - top)}
                stroke="rgba(15,23,42,0.25)"
                strokeWidth={2}
                strokeDasharray="0"
              />
            </svg>
            {/* Callout */}
            <div
              style={{
                position: 'absolute',
                left: calloutX,
                top: calloutY,
                transform: 'translate(' + (side === 'right' ? '0, -50%' : '-100%, -50%') + ')',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  minWidth: 160,
                  maxWidth: 220,
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: 'rgba(15,23,42,0.9)',
                  color: '#ecf2ff',
                  backdropFilter: 'blur(6px)',
                  boxShadow: '0 12px 24px -12px rgba(15,23,42,0.65)',
                  border: '1px solid rgba(59,130,246,0.25)',
                  fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2, marginBottom: 4 }}>{a.label}</div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>
                  {(a.type ?? 'feature').replace(/\b\w/g, ch => ch.toUpperCase())}
                  {typeof a.confidence === 'number' ? ` · ${(a.confidence * 100).toFixed(0)}%` : ''}
                </div>
                {a.source && (
                  <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>via {a.source}</div>
                )}
              </div>
            </div>
            {box && box.width > 0 && box.height > 0 && (
              <div
                style={{
                  position: 'absolute',
                  left: box.extendToEdges ? 0 : box.left,
                  top: box.extendToEdges ? 0 : box.top,
                  width: box.width,
                  height: box.height,
                  border: '2px dashed rgba(59,130,246,0.85)',
                  borderRadius: 8,
                  pointerEvents: 'none',
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function CanvasAnnotationDebug({ objectId, src, annotations }: { objectId: string; src: string; annotations: Annotation[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const debugSrc = objectId
      ? `${STORAGE_API_BASE}/storage/media/${objectId}?width=1600&format=webp&quality=90`
      : src;
    img.onload = () => {
      if (cancelled) return;
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      canvas.width = width;
      canvas.height = height;

      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const clamp = (value: number) => Math.min(1, Math.max(0, value));

      annotations.forEach((annotation) => {
        const anchorX = clamp(annotation.anchor?.x ?? 0) * width;
        const anchorY = clamp(annotation.anchor?.y ?? 0) * height;

        ctx.fillStyle = '#12b981';
        ctx.strokeStyle = '#064e3b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(anchorX, anchorY, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        const box = annotation.box;
        if (box && box.length === 4) {
          const bx0 = clamp(box[0]);
          const by0 = clamp(box[1]);
          const bx2 = clamp(box[2]);
          const by2 = clamp(box[3]);

          const treatAsWidthHeight = bx2 <= bx0 || by2 <= by0;
          const widthNorm = treatAsWidthHeight ? Math.max(0, bx2) : Math.max(0, bx2 - bx0);
          const heightNorm = treatAsWidthHeight ? Math.max(0, by2) : Math.max(0, by2 - by0);

          const rectWidth = widthNorm * width;
          const rectHeight = heightNorm * height;
          const rectLeft = bx0 * width;
          const rectTop = by0 * height;

          if (rectWidth > 0 && rectHeight > 0) {
            ctx.strokeStyle = 'rgba(59,130,246,0.95)';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            ctx.strokeRect(rectLeft, rectTop, rectWidth, rectHeight);
            ctx.setLineDash([]);
          }
        }

        ctx.fillStyle = 'rgba(15,23,42,0.85)';
        ctx.fillRect(anchorX + 12, anchorY - 22, 180, 44);
        ctx.fillStyle = '#ecf2ff';
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.fillText(annotation.label, anchorX + 16, anchorY);
        const metaLine = `${annotation.type ?? 'feature'}${typeof annotation.confidence === 'number' ? ` · ${(annotation.confidence * 100).toFixed(0)}%` : ''}`;
        ctx.fillText(metaLine, anchorX + 16, anchorY + 16);
      });

      setReady(true);
    };
    img.onerror = () => {
      if (!cancelled) {
        setReady(false);
      }
    };
    img.src = debugSrc;

    return () => {
      cancelled = true;
    };
  }, [src, annotations]);

  return (
    <div style={{ border: '1px solid rgba(15,23,42,0.12)', borderRadius: 12, padding: 12, background: '#f8fafc' }}>
      <div style={{ marginBottom: 8, fontSize: 12, color: '#0f172a' }}>
        Canvas Debug (natural pixel space){ready ? '' : ' — loading...'}
      </div>
      <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto', borderRadius: 8, display: 'block' }} />
    </div>
  );
}

function DataSection({ title, content }: { title: string; content: string }) {
  if (!content) return null;
  return (
    <section>
      <h3 style={{ margin: '0 0 6px', fontSize: 16 }}>{title}</h3>
      <pre style={{ background: 'rgba(15,23,42,0.05)', borderRadius: 8, padding: 12, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 260, overflow: 'auto' }}>{content}</pre>
    </section>
  );
}


