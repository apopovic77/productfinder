/**
 * SlidePanel — macOS Desktop-style horizontal slide-in
 *
 * The main view (children) stays in place but its parent wrapper
 * gets translated left when the panel opens — same effect as
 * 4-finger swipe between desktops on macOS.
 *
 * Usage:
 *   <SlidePanel open={cartOpen} onClose={() => setCartOpen(false)}>
 *     <CartView ... />
 *   </SlidePanel>
 *
 *   And wrap your main content in:
 *   <SlidePanelMainShifter open={cartOpen}>
 *     <App />
 *   </SlidePanelMainShifter>
 */
import React from 'react';

interface SlidePanelProps {
  open: boolean;
  width?: number | string;       // panel width, default 60vw
  side?: 'right' | 'left';        // which side to slide from, default right
  duration?: number;              // animation duration in ms, default 400
  shiftMain?: boolean;            // also shift main content (macOS-style), default true
  children: React.ReactNode;
}

export function SlidePanel({
  open,
  width = '60vw',
  side = 'right',
  duration = 400,
  children,
}: SlidePanelProps) {
  const transform = open
    ? 'translateX(0)'
    : side === 'right' ? 'translateX(100%)' : 'translateX(-100%)';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        bottom: 0,
        [side]: 0,
        width,
        zIndex: 10500,
        transform,
        transition: `transform ${duration}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        boxShadow: open
          ? `${side === 'right' ? '-' : ''}24px 0 64px rgba(0, 0, 0, 0.5)`
          : 'none',
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  );
}

interface SlidePanelMainShifterProps {
  open: boolean;
  panelWidth?: number | string;   // must match SlidePanel width
  side?: 'right' | 'left';
  duration?: number;
  shiftAmount?: number;            // 0 = no shift, 1 = full panel width
  children: React.ReactNode;
}

/**
 * Wrap your main app content in this to get the macOS-style
 * push effect — main content slides aside as the panel comes in.
 */
export function SlidePanelMainShifter({
  open,
  panelWidth = '60vw',
  side = 'right',
  duration = 400,
  shiftAmount = 0.3,
  children,
}: SlidePanelMainShifterProps) {
  // Compute shift offset
  const shiftOffset = typeof panelWidth === 'number'
    ? `${panelWidth * shiftAmount}px`
    : `calc(${panelWidth} * ${shiftAmount})`;

  const transform = open
    ? side === 'right' ? `translateX(-${shiftOffset})` : `translateX(${shiftOffset})`
    : 'translateX(0)';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform,
        transition: `transform ${duration}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  );
}

interface SlidePanelBackdropProps {
  open: boolean;
  onClick?: () => void;
  duration?: number;
}

export function SlidePanelBackdrop({ open, onClick, duration = 400 }: SlidePanelBackdropProps) {
  return (
    <div
      onClick={onClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        zIndex: 10499,
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: `opacity ${duration}ms`,
      }}
    />
  );
}
