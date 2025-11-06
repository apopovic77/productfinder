import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type QuickSearchCommandPaletteProps = {
  isOpen: boolean;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  isLoading: boolean;
  errorMessage?: string | null;
  lastResultCount?: number | null;
  position?: { x: number; y: number };
  onAutoPosition?: (position: { x: number; y: number }) => void;
  onDrag?: (position: { x: number; y: number }) => void;
};

export function QuickSearchCommandPalette({
  isOpen,
  prompt,
  onPromptChange,
  onSubmit,
  onClose,
  isLoading,
  errorMessage,
  lastResultCount,
  position,
  onAutoPosition,
  onDrag,
}: QuickSearchCommandPaletteProps): React.ReactElement | null {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dragState = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const node = document.createElement('div');
    node.className = 'quicksearch-root-container';
    document.body.appendChild(node);
    setPortalNode(node);
    return () => {
      document.body.removeChild(node);
      setPortalNode(null);
    };
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || position || !onAutoPosition) return;
    if (!dialogRef.current) return;
    const rect = dialogRef.current.getBoundingClientRect();
    const next = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    const clamped = clampPosition(next, rect);
    onAutoPosition(clamped);
  }, [isOpen, position, onAutoPosition]);

  if (!isOpen || !portalNode) return null;

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSubmit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const startDrag = (event: React.PointerEvent) => {
    if (!dialogRef.current || !onDrag) return;
    const rect = dialogRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    dragState.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - centerX,
      offsetY: event.clientY - centerY,
    };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handleDrag = (event: React.PointerEvent) => {
    if (!dragState.current || !dialogRef.current || !onDrag) return;
    const { offsetX, offsetY } = dragState.current;
    const rect = dialogRef.current.getBoundingClientRect();
    const target = {
      x: event.clientX - offsetX,
      y: event.clientY - offsetY,
    };
    const clamped = clampPosition(target, rect);
    onDrag(clamped);
  };

  const endDrag = (event: React.PointerEvent) => {
    if (dragState.current && (event.target as HTMLElement).hasPointerCapture(event.pointerId)) {
      (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    }
    dragState.current = null;
  };

  const dialogStyle = position ? { left: `${position.x}px`, top: `${position.y}px` } : undefined;

  const content = (
    <div className="quicksearch-wrapper" style={dialogStyle}>
      <div className="quicksearch-dialog" ref={dialogRef} role="dialog">
        <button type="button" className="quicksearch-close" onClick={onClose} aria-label="Schließen">
          ×
        </button>
        <div className="quicksearch-content">
          <header
            className="quicksearch-header"
            onPointerDown={startDrag}
            onPointerMove={handleDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <h2>KI-Schnellsuche</h2>
            <p>Die KI nutzt produktive MCP-Datenquellen und liefert passende Produkt-IDs.</p>
          </header>
          <div className="quicksearch-body">
            <label htmlFor="quicksearch-input" className="quicksearch-label">
              Prompt
            </label>
            <input
              id="quicksearch-input"
              ref={inputRef}
              className="quicksearch-input"
              placeholder="z.B. alle Kinder-Knieprotektoren für Downhill"
              value={prompt}
              onChange={event => onPromptChange(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <div className="quicksearch-hint">
              <span>F3</span> erneut drücken oder <span>Esc</span> zum Schließen.
            </div>
            {errorMessage ? <div className="quicksearch-error">{errorMessage}</div> : null}
            {lastResultCount !== null && lastResultCount !== undefined && !errorMessage ? (
              <div className="quicksearch-success">{lastResultCount} Produkte gefunden.</div>
            ) : null}
          </div>
          <footer className="quicksearch-footer">
            <button type="button" className="quicksearch-secondary" onClick={onClose} disabled={isLoading}>
              Abbrechen
            </button>
            <button type="button" className="quicksearch-primary" onClick={onSubmit} disabled={isLoading || !prompt.trim()}>
              {isLoading ? 'Analysiere…' : 'Suchen'}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );

  return createPortal(content, portalNode);
}

function clampPosition(position: { x: number; y: number }, rect: DOMRect): { x: number; y: number } {
  const halfWidth = rect.width / 2;
  const halfHeight = rect.height / 2;
  const minX = halfWidth + 16;
  const maxX = window.innerWidth - halfWidth - 16;
  const minY = halfHeight + 16;
  const maxY = window.innerHeight - halfHeight - 16;
  return {
    x: Math.min(maxX, Math.max(minX, position.x)),
    y: Math.min(maxY, Math.max(minY, position.y)),
  };
}

export default QuickSearchCommandPalette;

