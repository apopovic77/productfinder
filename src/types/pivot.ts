/**
 * Pivot grouping types.
 *
 * Extracted from the retired PivotDrillDownService (replaced by
 * gpane/GpanePivotService) — these types are the only part that
 * remained in use across App/Controller/LayoutService/DeveloperOverlay.
 */

export type GroupDimension = string;

export type PriceBucketMode = 'static' | 'equal-width' | 'quantile' | 'kmeans';

export type PriceBucketConfig = {
  mode: PriceBucketMode;
  bucketCount: number;
};
