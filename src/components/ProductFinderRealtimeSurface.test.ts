import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('./ProductFinderRealtimeSurface.tsx', import.meta.url),
  'utf8',
);
const mainSource = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8');
const configSource = readFileSync(new URL('../config/apiConfig.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const deployWorkflowSource = readFileSync(
  new URL('../../.github/workflows/deploy-gsg.yml', import.meta.url),
  'utf8',
);

describe('ProductFinderRealtimeSurface contract', () => {
  it('mounts the shared controller only behind the productfinder BFF', () => {
    expect(source).toContain('new ProductFinderRealtimeBffClient()');
    expect(source).toContain('new ProductFinderRealtimeController({');
    expect(source).not.toContain('/ai/realtime/');
    expect(source).not.toMatch(/VITE_.*(?:KEY|SECRET|TOKEN)/);
  });

  it('opens from an explicit user action and always disposes the session', () => {
    expect(source).toContain('onClick={start}');
    expect(source).toContain('runtime.controller.open(context)');
    expect(source).toContain('runtime.controller.dispose()');
    expect(source).toContain("window.addEventListener('pagehide', endOnPageHide)");
    expect(source).toContain("window.removeEventListener('pagehide', endOnPageHide)");
    expect(source).toContain('runtime.controller.setProductContext(focusedProductId, selectedVariantContext)');
    expect(appSource).toContain('focusedProductId={selectedProduct');
    expect(appSource).toContain('selectedVariant={this.getRealtimeSelectedVariant()}');
    expect(source).not.toContain('server.updateProductContext(numericId');
    expect(appSource).toContain('onSelectionProjected={this.handleRealtimeSelectionProjected}');
  });

  it('keeps vertical UI interaction separate from push-to-talk pointer state', () => {
    expect(source).toContain('onPointerDown');
    expect(source).toContain('onPointerUp');
    expect(source).toContain('onPointerCancel');
    expect(source).toContain('aria-pressed={snapshot.isMicActive}');
  });

  it('is absent from public routes unless both the build flag and internal path match', () => {
    expect(configSource).toContain("VITE_PRODUCTFINDER_REALTIME_ENABLED === 'true'");
    expect(mainSource).toContain("normalizedPath === '/internal/realtime-demo'");
    expect(mainSource).toContain('realtimeDemoEnabled={realtimeDemoEnabled}');
    expect(mainSource).toContain('realtimeDemoAvailable={REALTIME_DEMO_ENABLED}');
    expect(deployWorkflowSource).toContain('VITE_PRODUCTFINDER_REALTIME_ENABLED=true');
  });

  it('can be toggled on a regular Finder page with the owner shortcut', () => {
    expect(appSource).toContain('handleRealtimeDemoHotkey');
    expect(appSource).toContain("event.key.toLowerCase() !== 'v'");
    expect(appSource).toContain('!event.ctrlKey');
    expect(appSource).toContain('!event.shiftKey');
    expect(appSource).toContain('realtimeShortcutEnabled: !prev.realtimeShortcutEnabled');
  });

  it('does not depend on a controller loading notification emitted before App subscribes', () => {
    expect(appSource).toContain('this.state.realtimeShortcutEnabled && (');
    expect(appSource).not.toContain(
      '(this.props.realtimeDemoEnabled || this.state.realtimeShortcutEnabled)',
    );
    expect(appSource).not.toContain('this.props.realtimeDemoEnabled && !loading');
  });
});
