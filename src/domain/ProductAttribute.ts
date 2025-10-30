import type { AttributeType } from '../types/Product';
import { ProductValue, type PrimitiveValue } from './ProductValue';
export type PrimitiveAttributeValue = PrimitiveValue;

export class ProductAttribute {
  readonly key: string;
  readonly label: string;
  readonly type: AttributeType;
  readonly unit?: string;
  readonly normalizedValue?: number;
  readonly sourcePath?: string;
  private readonly valueObject: ProductValue;

  constructor(params: {
    key: string;
    label: string;
    type: AttributeType;
    value: PrimitiveAttributeValue;
    unit?: string;
    normalizedValue?: number;
    sourcePath?: string;
  }) {
    this.key = params.key;
    this.label = params.label;
    this.type = params.type;
    this.unit = params.unit;
    this.normalizedValue = params.normalizedValue;
    this.sourcePath = params.sourcePath;
    this.valueObject = new ProductValue({
      raw: params.value,
      unit: params.unit,
      normalized: params.normalizedValue,
    });
  }

  get value(): PrimitiveAttributeValue {
    return this.valueObject.raw;
  }

  get hasValue(): boolean {
    return this.valueObject.hasValue;
  }

  get displayValue(): string {
    if (!this.valueObject.hasValue) return '';
    if (typeof this.valueObject.raw === 'boolean') {
      return this.valueObject.raw ? 'Yes' : 'No';
    }
    if (typeof this.valueObject.raw === 'number') {
      return this.unit ? `${this.valueObject.raw} ${this.unit}` : `${this.valueObject.raw}`;
    }
    return String(this.valueObject.raw);
  }

  asValue(): ProductValue {
    return this.valueObject;
  }
}
