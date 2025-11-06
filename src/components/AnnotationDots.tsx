import React, { useState } from 'react';
import type { Annotation } from '../services/StorageAnnotationService';
import './AnnotationDots.css';

interface AnnotationDotsProps {
  annotations: Annotation[];
  imageWidth: number;
  imageHeight: number;
  offsetX?: number;
  offsetY?: number;
}

export function AnnotationDots({
  annotations,
  imageWidth,
  imageHeight,
  offsetX = 0,
  offsetY = 0,
}: AnnotationDotsProps) {
  const [hoveredAnnotation, setHoveredAnnotation] = useState<Annotation | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  if (annotations.length === 0 || imageWidth === 0 || imageHeight === 0) {
    return null;
  }

  return (
    <div className="annotation-dots-container">
      {/* Render dots */}
      {annotations.map((annotation, index) => {
        const dotX = offsetX + annotation.anchor.x * imageWidth;
        const dotY = offsetY + annotation.anchor.y * imageHeight;

        return (
          <div
            key={index}
            className="annotation-dot"
            style={{
              left: `${dotX}px`,
              top: `${dotY}px`,
            }}
            onMouseEnter={(e) => {
              setHoveredAnnotation(annotation);
              setMousePos({ x: e.clientX, y: e.clientY });
            }}
            onMouseMove={(e) => {
              setMousePos({ x: e.clientX, y: e.clientY });
            }}
            onMouseLeave={() => {
              setHoveredAnnotation(null);
              setMousePos(null);
            }}
          >
            <div className="annotation-dot-pulse" />
          </div>
        );
      })}

      {/* Render box for hovered annotation */}
      {hoveredAnnotation?.box && (
        <div
          className="annotation-box"
          style={{
            left: `${offsetX + hoveredAnnotation.box.x1 * imageWidth}px`,
            top: `${offsetY + hoveredAnnotation.box.y1 * imageHeight}px`,
            width: `${(hoveredAnnotation.box.x2 - hoveredAnnotation.box.x1) * imageWidth}px`,
            height: `${(hoveredAnnotation.box.y2 - hoveredAnnotation.box.y1) * imageHeight}px`,
          }}
        />
      )}

      {/* Render tooltip */}
      {hoveredAnnotation && mousePos && (
        <div
          className="annotation-tooltip"
          style={{
            left: `${mousePos.x + 15}px`,
            top: `${mousePos.y + 15}px`,
          }}
        >
          <div className="annotation-tooltip-label">{hoveredAnnotation.label}</div>
          <div className="annotation-tooltip-type">{hoveredAnnotation.type}</div>
          {hoveredAnnotation.confidence && (
            <div className="annotation-tooltip-confidence">
              {Math.round(hoveredAnnotation.confidence * 100)}% confidence
            </div>
          )}
        </div>
      )}
    </div>
  );
}
