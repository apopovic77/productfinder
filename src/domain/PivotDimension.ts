import type { AttributeType } from '../types/Product';

export type PivotDimensionKind = 'category' | 'class' | 'variation' | 'metadata';

export type PivotDimensionSource =
  | { type: 'category'; level: number }
  | { type: 'attribute'; key: string; level?: number }
  | { type: 'property'; key: string };

export type PivotNumericBucket = {
  label: string;
  min: number;
  max: number;
  inclusiveMax: boolean;
};

export type PivotNumericSummary = {
  min: number;
  max: number;
  mean: number;
  unit?: string;
  sampleCount: number;
  buckets: PivotNumericBucket[];
};

export class PivotDimension {
  readonly key: string;
  readonly label: string;
  readonly role: PivotDimensionKind;
  readonly priority: number;
  readonly type: AttributeType;
  readonly source: PivotDimensionSource;
  readonly coverage: number;
  readonly cardinality: number;
  readonly entropy: number;
  readonly parentKey?: string;
  readonly numeric?: PivotNumericSummary;
  readonly attributeKey?: string;

  constructor(params: {
    key: string;
    label: string;
    role: PivotDimensionKind;
    priority: number;
    type: AttributeType;
    source: PivotDimensionSource;
    coverage: number;
    cardinality: number;
    entropy: number;
    parentKey?: string;
    attributeKey?: string;
    numeric?: PivotNumericSummary;
  }) {
    this.key = params.key;
    this.label = params.label;
    this.role = params.role;
    this.priority = params.priority;
    this.type = params.type;
    this.source = params.source;
    this.coverage = params.coverage;
    this.cardinality = params.cardinality;
    this.entropy = params.entropy;
    this.parentKey = params.parentKey;
    this.numeric = params.numeric;
    this.attributeKey = params.attributeKey;
  }

  get isNumeric(): boolean {
    return !!this.numeric;
  }

  get buckets(): PivotNumericBucket[] {
    return this.numeric?.buckets ?? [];
  }
}
