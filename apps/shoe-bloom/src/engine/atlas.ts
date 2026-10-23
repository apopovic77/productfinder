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

export interface AtlasOptions {
  tile?: number;
  pad?: number;
  /** Bilder, die gespiegelt in den Atlas kommen (Index), z. B. Ansicht „right side“ neben „left side“. */
  mirror?: Set<number>;
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
    if (opts.mirror?.has(i)) {
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
