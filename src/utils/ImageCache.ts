export class ImageCache {
  private cache: Map<string, HTMLImageElement> = new Map();

  async load(url: string): Promise<HTMLImageElement> {
    if (this.cache.has(url)) return this.cache.get(url)!;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    await new Promise((res) => {
      img.onload = () => res(null);
      img.onerror = () => res(null);
    });
    this.cache.set(url, img);
    return img;
  }
}




