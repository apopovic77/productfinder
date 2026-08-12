export type Rect = { x: number; y: number; width: number; height: number };

export const VISIBLE_IMAGE_PRIORITY_MIN = 10;
export const VISIBLE_IMAGE_PRIORITY_MAX = 49;

/**
 * Map a visible node to the foreground-priority band. The result is based on
 * normalized viewport distance, so it stays stable across phone/desktop sizes
 * and always remains ahead of variants (100+) and LOD upgrades (1000+).
 */
export function calculateVisibleImagePriority(node: Rect, viewport: Rect): number {
  const viewportCenterX = viewport.x + viewport.width / 2;
  const viewportCenterY = viewport.y + viewport.height / 2;
  const nodeCenterX = node.x + node.width / 2;
  const nodeCenterY = node.y + node.height / 2;
  const distance = Math.hypot(nodeCenterX - viewportCenterX, nodeCenterY - viewportCenterY);
  const maxDistance = Math.max(1, Math.hypot(viewport.width / 2, viewport.height / 2));
  const normalized = Math.min(1, distance / maxDistance);
  const band = VISIBLE_IMAGE_PRIORITY_MAX - VISIBLE_IMAGE_PRIORITY_MIN;
  return VISIBLE_IMAGE_PRIORITY_MIN + Math.round(normalized * band);
}
