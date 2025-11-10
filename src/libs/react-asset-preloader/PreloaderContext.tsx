import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
  type FC,
} from 'react';
import { PreloaderManager } from './PreloaderManager';
import type { PreloadAsset, PreloaderConfig, PreloaderState } from './types';

interface PreloaderContextValue {
  manager: PreloaderManager;
  state: PreloaderState;
  registerAssets: (assets: PreloadAsset[]) => void;
  registerAsset: (asset: PreloadAsset) => void;
  startLoading: () => Promise<void>;
}

const PreloaderContext = createContext<PreloaderContextValue | null>(null);

interface PreloaderProviderProps {
  children: ReactNode;
  config?: PreloaderConfig;
  autoStart?: boolean;
}

export const PreloaderProvider: FC<PreloaderProviderProps> = ({
  children,
  config = {},
  autoStart = false,
}) => {
  const managerRef = useRef<PreloaderManager | null>(null);
  const [state, setState] = useState<PreloaderState>({
    isLoading: false,
    progress: 0,
    loaded: 0,
    total: 0,
  });

  if (!managerRef.current) {
    managerRef.current = new PreloaderManager(config);
  }

  const manager = managerRef.current;
  if (!manager) {
    throw new Error('PreloaderManager failed to initialise');
  }

  useEffect(() => {
    const unsubscribe = manager.subscribe(nextState => setState(nextState));
    return unsubscribe;
  }, [manager]);

  useEffect(() => {
    if (autoStart && !state.isLoading && state.total > 0) {
      manager.load().catch(error => {
        console.error('Auto-start preload failed:', error);
      });
    }
  }, [autoStart, manager, state.isLoading, state.total]);

  const value: PreloaderContextValue = {
    manager,
    state,
    registerAssets: assets => manager.registerAssets(assets),
    registerAsset: asset => manager.registerAsset(asset),
    startLoading: () => manager.load(),
  };

  return (
    <PreloaderContext.Provider value={value}>
      {children}
    </PreloaderContext.Provider>
  );
};

export const usePreloader = (): PreloaderContextValue => {
  const context = useContext(PreloaderContext);
  if (!context) {
    throw new Error('usePreloader must be used within PreloaderProvider');
  }
  return context;
};

