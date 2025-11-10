export type AssetType = 'image' | 'video' | 'audio' | 'font' | 'data' | 'custom';

export interface PreloadAsset {
  id: string;
  type: AssetType;
  src: string;
  priority?: number;
  loader?: (asset: PreloadAsset) => Promise<void>;
  metadata?: Record<string, unknown>;
}

export interface PreloaderConfig {
  minDisplayTime?: number;
  showProgress?: boolean;
  showCount?: boolean;
  logoUrl?: string;
  backgroundColor?: string;
  textColor?: string;
  blurBackdrop?: boolean;
  animationDuration?: number;
  onStart?: () => void;
  onProgress?: (progress: number, loaded: number, total: number) => void;
  onComplete?: () => void;
  onError?: (error: Error, asset?: PreloadAsset) => void;
}

export interface PreloaderState {
  isLoading: boolean;
  progress: number;
  loaded: number;
  total: number;
  currentAsset?: PreloadAsset;
  recentAssets?: PreloadAsset[];
  error?: Error;
}

