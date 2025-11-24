import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProductData } from '../../src/types/Product';

export class ProductRepository {
  private readonly dataPath: string;

  constructor(outputPath?: string) {
    const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
    const defaultPath = path.join(root, '..', 'oneal-api', 'app', 'data', 'products.json');
    const envPath = process.env.SHOPIFY_OUTPUT_PATH;
    this.dataPath = outputPath ?? envPath ?? defaultPath;
  }

  async save(products: ProductData[]): Promise<void> {
    const tempPath = `${this.dataPath}.tmp`;
    const backupPath = `${this.dataPath}.bak`;

    // 1. Write to temp file
    const json = JSON.stringify(products, null, 2);
    await fs.promises.writeFile(tempPath, json, 'utf-8');

    // 2. Backup existing file if present
    if (fs.existsSync(this.dataPath)) {
      await fs.promises.copyFile(this.dataPath, backupPath);
    }

    // 3. Atomic rename temp -> target
    await fs.promises.rename(tempPath, this.dataPath);
  }

  async load(): Promise<ProductData[]> {
    if (!fs.existsSync(this.dataPath)) {
      return [];
    }
    const content = await fs.promises.readFile(this.dataPath, 'utf-8');
    return JSON.parse(content) as ProductData[];
  }
}

