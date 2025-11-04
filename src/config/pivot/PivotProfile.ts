export type PresentationCategory = string;

export type DerivePresentationCategoryArgs = {
  primaryCategory?: string | null;
  secondaryCategory?: string | null;
  productName: string;
  productUrl?: string | null;
  taxonomy?: {
    sport?: string | null;
    product_family?: string | null;
    path?: string[];
  };
};

export type NormalizeProductFamilyArgs = {
  presentationCategory?: PresentationCategory;
  rawFamily?: string | null;
  taxonomyPath?: string[];
  productName: string;
};

export interface PivotProfile {
  readonly name: string;
  readonly presentationCategoryOrder: readonly PresentationCategory[];
  readonly productFamilyOrder?: readonly string[];
  readonly heroThreshold: number;
  readonly priceRefineThreshold: number;

  derivePresentationCategory(args: DerivePresentationCategoryArgs): PresentationCategory;
  normalizeProductFamily(args: NormalizeProductFamilyArgs): string | undefined;

  formatTokenLabel(token?: string | null): string | undefined;
  formatTokenPath(tokens?: string[]): string | undefined;

  isClothingContext(text: string): boolean;
  isProtectorContext(text: string): boolean;

  /**
   * Allow a profile to force the next drill-down dimension given the current parent selection.
   * Return the desired dimension key (must exist in the hierarchy) or undefined to keep default behaviour.
   */
  getPreferredChildDimension?(parentDimension: string, parentValue: string): string | undefined;
}
