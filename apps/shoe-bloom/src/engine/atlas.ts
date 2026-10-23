/**
 * Bildatlas zur Laufzeit: freigestellte Produktbilder in ein Raster quadratischer Kacheln
 * (Canvas → Textur), dazu die UV-Kachel je Bild im Format von aUVOffset der Engine.
 * Rand je Kachel (`pad`), damit die Bewegungsunschärfe im Shader Platz innerhalb der Kachel hat.
 */

import * as THREE from 'three';

export interface ImageAtlas {
  texture: THREE.Texture;
  cols: number;
  /** aUVOffset (offsetU, offsetV, scaleU, scaleV) für Bild i. */
  uv(index: number): [number, number, number, number];
  /** Seitenverhältnis (Breite/Höhe) des Bilds i. */
  aspect: number[];
}

function load(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Richtung eines freigestellten Seitenbilds: Die Spitze steht dort, wo die Sohle (unterstes Fünftel der
 * deckenden Pixel) weiter über die Mitte des Objekts hinausreicht. -1 = links, 1 = rechts.
 */
export function toeDirection(img: HTMLImageElement): -1 | 1 {
  const w = 96, h = Math.max(1, Math.round((96 * img.height) / img.width));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const a = ctx.getImageData(0, 0, w, h).data;
  let minX = w, maxX = 0, top = h, bottom = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a[(y * w + x) * 4 + 3] > 40) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  const band = bottom - (bottom - top) * 0.2;
  let sum = 0, n = 0;
  for (let y = Math.floor(band); y <= bottom; y++) for (let x = 0; x < w; x++) if (a[(y * w + x) * 4 + 3] > 40) { sum += x; n++; }
  const mid = (minX + maxX) / 2;
  return n && sum / n > mid ? 1 : -1;
}

export interface AtlasOptions {
  tile?: number;
  pad?: number;
  /** Alle Bilder in diese Richtung drehen (Spiegeln, wenn toeDirection abweicht). */
  face?: -1 | 1;
}

export async function buildImageAtlas(urls: string[], opts: AtlasOptions = {}): Promise<ImageAtlas> {
  const tile = opts.tile ?? 512, pad = opts.pad ?? 0.14;
  const cols = Math.max(1, Math.ceil(Math.sqrt(urls.length)));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = cols * tile;
  const ctx = canvas.getContext('2d')!;
  const images = await Promise.all(urls.map(load));
  const aspect: number[] = [];
  images.forEach((img, i) => {
    const x0 = (i % cols) * tile, y0 = Math.floor(i / cols) * tile;
    if (!img) { aspect.push(1); return; }
    const box = tile * (1 - 2 * pad);
    const s = Math.min(box / img.width, box / img.height);
    const w = img.width * s, h = img.height * s;
    const dx = x0 + (tile - w) / 2, dy = y0 + (tile - h) / 2;
    if (opts.face && toeDirection(img) !== opts.face) {
      ctx.save();
      ctx.translate(dx + w, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    } else ctx.drawImage(img, dx, dy, w, h);
    aspect.push(img.width / img.height);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  const su = 1 / cols;
  return {
    texture, cols, aspect,
    uv: (i) => [(i % cols) * su, 1 - (Math.floor(i / cols) + 1) * su, su, su],
  };
}
