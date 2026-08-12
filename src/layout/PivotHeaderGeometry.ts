import { BUCKET_BUTTON_CONFIG } from '../config/BucketButtonConfig';

export type PivotHeaderOrientation = 'rows' | 'columns';

export const DESKTOP_ROW_HEADER_HEIGHT = 48;

/**
 * Resolve the bucket header height without pulling renderer or animation
 * dependencies into the responsive geometry contract.
 */
export function resolvePivotHeaderHeight(
  viewWidth: number,
  orientation: PivotHeaderOrientation,
): number {
  if (viewWidth < 768) {
    return Math.round(BUCKET_BUTTON_CONFIG.height * 0.3);
  }
  return orientation === 'rows'
    ? Math.min(DESKTOP_ROW_HEADER_HEIGHT, BUCKET_BUTTON_CONFIG.height)
    : BUCKET_BUTTON_CONFIG.height;
}
