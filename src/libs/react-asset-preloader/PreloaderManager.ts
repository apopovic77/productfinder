import type { PreloadAsset, PreloaderConfig, PreloaderState } from './types';

export class PreloaderManager {
  private assets: PreloadAsset[] = [];
  private loadedAssets: Set<string> = new Set();
  private recentAssets: PreloadAsset[] = [];
  private config: PreloaderConfig;
  private state: PreloaderState = {
    isLoading: false,
    progress: 0,
    loaded: 0,
    total: 0,
    recentAssets: [],
  };
  private listeners: Set<(state: PreloaderState) => void> = new Set();

  constructor(config: PreloaderConfig = {}) {
    this.config = {
      minDisplayTime: 1000,
      showProgress: true,
      showCount: true,
      blurBackdrop: true,
      animationDuration: 300,
      ...config,
    };
  }

  registerAssets(assets: PreloadAsset[]): void {
    const sorted = [...assets].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    this.assets.push(...sorted);
  }

  registerAsset(asset: PreloadAsset): void {
    this.registerAssets([asset]);
  }

  subscribe(listener: (state: PreloaderState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): PreloaderState {
    return { ...this.state };
  }

  async load(): Promise<void> {
    if (this.state.isLoading) {
      console.warn('Preloader already loading');
      return;
    }

    const startTime = Date.now();

    this.updateState({
      isLoading: true,
      progress: 0,
      loaded: 0,
      total: this.assets.length,
      error: undefined,
    });

    this.config.onStart?.();

    try {
      for (let i = 0; i < this.assets.length; i += 1) {
        const asset = this.assets[i];

        this.updateState({
          currentAsset: asset,
        });

        try {
          await this.loadAsset(asset);
          this.loadedAssets.add(asset.id);

          this.recentAssets.push(asset);
          if (this.recentAssets.length > 3) {
            this.recentAssets.shift();
          }

          const loaded = i + 1;
          const progress = Math.round((loaded / this.assets.length) * 100);

          this.updateState({
            loaded,
            progress,
            recentAssets: [...this.recentAssets],
          });

          this.config.onProgress?.(progress, loaded, this.assets.length);
        } catch (error) {
          console.error(`Failed to load asset ${asset.id}:`, error);
          this.config.onError?.(error as Error, asset);
        }
      }

      const elapsed = Date.now() - startTime;
      const minTime = this.config.minDisplayTime || 0;
      if (elapsed < minTime) {
        await new Promise(resolve => setTimeout(resolve, minTime - elapsed));
      }

      this.updateState({
        isLoading: false,
        progress: 100,
        currentAsset: undefined,
      });

      this.config.onComplete?.();
    } catch (error) {
      this.updateState({
        isLoading: false,
        error: error as Error,
      });
      this.config.onError?.(error as Error);
      throw error;
    }
  }

  private async loadAsset(asset: PreloadAsset): Promise<void> {
    if (asset.loader) {
      await asset.loader(asset);
      return;
    }

    switch (asset.type) {
      case 'image':
        await this.loadImage(asset.src);
        return;
      case 'video':
        await this.loadVideo(asset.src);
        return;
      case 'audio':
        await this.loadAudio(asset.src);
        return;
      case 'font':
        await this.loadFont(asset.src);
        return;
      case 'data':
        await this.loadData(asset.src);
        return;
      default:
        await this.loadData(asset.src);
    }
  }

  private loadImage(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  private loadVideo(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error(`Failed to load video: ${src}`));
      video.src = src;
      video.load();
    });
  }

  private loadAudio(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      audio.onloadeddata = () => resolve();
      audio.onerror = () => reject(new Error(`Failed to load audio: ${src}`));
      audio.src = src;
      audio.load();
    });
  }

  private async loadFont(src: string): Promise<void> {
    const fontFamily = src.split('/').pop()?.split('.')[0] || 'CustomFont';

    const font = new FontFace(fontFamily, `url(${src})`);
    await font.load();
    document.fonts.add(font);
  }

  private async loadData(src: string): Promise<void> {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`Failed to load data: ${src}`);
    }
    await response.blob();
  }

  private updateState(updates: Partial<PreloaderState>): void {
    this.state = { ...this.state, ...updates };
    this.listeners.forEach(listener => listener(this.state));
  }

  reset(): void {
    this.assets = [];
    this.loadedAssets.clear();
    this.state = {
      isLoading: false,
      progress: 0,
      loaded: 0,
      total: 0,
    };
    this.updateState(this.state);
  }

  isAssetLoaded(assetId: string): boolean {
    return this.loadedAssets.has(assetId);
  }
}

