/**
 * Partikel vom Add-to-Cart-Knopf zum Warenkorb im Kopf (owner 2026-10-21,
 * media 131915). Reines DOM/Web-Animations, ohne Zustand in React; am Ende
 * hueft der Warenkorb kurz.
 */
export function flyToCart(from: { x: number; y: number }, count = 1): void {
  if (typeof document === 'undefined') return;
  const cart = document.querySelector('.pf-header-cart-btn, .pf-mobile-cart-btn') as HTMLElement | null;
  if (!cart) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const to = cart.getBoundingClientRect();
  const tx = to.left + to.width / 2;
  const ty = to.top + to.height / 2;
  const n = reduce ? 0 : Math.min(14, 6 + count * 2);
  let landed = 0;
  const bump = () => {
    cart.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
      { duration: 360, easing: 'cubic-bezier(.3,1.6,.5,1)' },
    );
  };
  if (n === 0) { bump(); return; }
  for (let i = 0; i < n; i++) {
    const dot = document.createElement('span');
    const size = 6 + Math.random() * 6;
    Object.assign(dot.style, {
      position: 'fixed', left: '0px', top: '0px', width: `${size}px`, height: `${size}px`,
      borderRadius: '50%', background: i % 3 === 0 ? '#ffb27a' : '#ff5a1f', pointerEvents: 'none',
      zIndex: '20000', boxShadow: '0 0 10px rgba(255,90,31,0.8)',
    } as CSSStyleDeclaration);
    document.body.appendChild(dot);
    const sx = from.x + (Math.random() - 0.5) * 60;
    const sy = from.y + (Math.random() - 0.5) * 16;
    // Bogen: Kontrollpunkt ueber der Strecke, leicht gestreut
    const mx = (sx + tx) / 2 + (Math.random() - 0.5) * 160;
    const my = Math.min(sy, ty) - 120 - Math.random() * 120;
    const frames: Keyframe[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const x = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * tx;
      const y = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ty;
      frames.push({ transform: `translate(${x - size / 2}px, ${y - size / 2}px) scale(${1 - t * 0.6})`, opacity: t > 0.9 ? 0.3 : 1 });
    }
    const anim = dot.animate(frames, { duration: 650 + Math.random() * 250, delay: i * 30, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' });
    anim.onfinish = () => {
      dot.remove();
      landed += 1;
      if (landed === 1) bump();
    };
  }
}
