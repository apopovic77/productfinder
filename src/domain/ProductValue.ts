export type PrimitiveValue = string | number | boolean | null;

export class ProductValue {
  readonly raw: PrimitiveValue;
  readonly unit?: string;
  readonly normalized?: number;

  constructor(params: { raw: PrimitiveValue; unit?: string; normalized?: number }) {
    this.raw = params.raw;
    this.unit = params.unit;
    this.normalized = params.normalized;
  }

  asNumber(): number | undefined {
    if (typeof this.raw === 'number') return this.raw;
    if (typeof this.raw === 'string') {
      const parsed = Number(this.raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  asString(): string | undefined {
    if (this.raw === null || this.raw === undefined) return undefined;
    return String(this.raw);
  }

  asBoolean(): boolean | undefined {
    if (typeof this.raw === 'boolean') return this.raw;
    if (typeof this.raw === 'string') {
      const normalized = this.raw.trim().toLowerCase();
      if (['true', 'yes', '1'].includes(normalized)) return true;
      if (['false', 'no', '0'].includes(normalized)) return false;
    }
    return undefined;
  }

  get hasValue(): boolean {
    return this.raw !== null && this.raw !== undefined && this.raw !== '';
  }
}
