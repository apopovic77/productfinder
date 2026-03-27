#!/usr/bin/env python3
"""
Texture Atlas Generator for O'Neal Products

Generates static texture atlas PNG files from product images.
Three tiers: 64×64, 128×128, 256×256 per tile.

Output:
  atlas/64/atlas_0.png    — 64×64 tiles, max 4096×4096 (64×64 = 4096 tiles per atlas)
  atlas/128/atlas_0.png   — 128×128 tiles, max 4096×4096 (32×32 = 1024 tiles per atlas)
  atlas/256/atlas_0.png   — 256×256 tiles, max 4096×4096 (16×16 = 256 tiles per atlas)
  atlas/manifest.json     — { productId → { storageId, atlasIndex, tier → { page, col, row } } }

Usage:
  python3 scripts/generate_atlas.py [--tier 128] [--output atlas/]
"""
import os
import sys
import json
import argparse
import io
import math
from pathlib import Path

import psycopg2
import requests
from PIL import Image

# Config
STORAGE_API = os.getenv('STORAGE_API_URL', 'http://127.0.0.1:8001')
MAX_ATLAS_SIZE = 4096  # max pixels per atlas dimension

TIERS = {
    64:  { 'quality': 60, 'cols': 64, 'rows': 64, 'tiles_per_page': 4096 },
    128: { 'quality': 75, 'cols': 32, 'rows': 32, 'tiles_per_page': 1024 },
    256: { 'quality': 85, 'cols': 16, 'rows': 16, 'tiles_per_page': 256 },
}

def get_products():
    """Get all products with storage_ids from PostgreSQL."""
    conn = psycopg2.connect(
        host='localhost', database='oneal_products',
        user='oneal_api', password='oneal_api_2024'
    )
    cur = conn.cursor()
    cur.execute("""
        SELECT id, COALESCE(name_en, short_name, design_name, 'Product'), storage_id
        FROM products
        WHERE storage_id IS NOT NULL
        ORDER BY id
    """)
    products = [{'id': r[0], 'name': r[1], 'storage_id': r[2]} for r in cur.fetchall()]
    conn.close()
    return products


def load_image(storage_id, size, quality):
    """Load image from Storage API."""
    url = f"{STORAGE_API}/storage/media/{storage_id}?width={size}&format=webp&quality={quality}&trim=true"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code == 200 and len(r.content) > 100:
            img = Image.open(io.BytesIO(r.content)).convert('RGBA')
            return img
    except Exception as e:
        print(f"  Failed {storage_id}: {e}")
    return None


def generate_tier(products, tile_size, output_dir):
    """Generate atlas pages for a specific tier."""
    tier_config = TIERS[tile_size]
    cols = tier_config['cols']
    rows = tier_config['rows']
    tiles_per_page = tier_config['tiles_per_page']
    quality = tier_config['quality']

    num_pages = math.ceil(len(products) / tiles_per_page)
    tier_dir = output_dir / str(tile_size)
    tier_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"Tier {tile_size}px: {len(products)} products, {num_pages} pages ({cols}×{rows} = {tiles_per_page} tiles/page)")
    print(f"{'='*60}")

    manifest_entries = {}
    total_loaded = 0

    for page_idx in range(num_pages):
        start = page_idx * tiles_per_page
        end = min(start + tiles_per_page, len(products))
        page_products = products[start:end]

        # Create atlas canvas
        atlas = Image.new('RGBA', (cols * tile_size, rows * tile_size), (26, 26, 46, 255))

        loaded_count = 0
        for i, product in enumerate(page_products):
            col = i % cols
            row = i // cols
            x = col * tile_size
            y = row * tile_size

            img = load_image(product['storage_id'], tile_size, quality)
            if img:
                # Resize to exact tile size (cover mode)
                img = img.resize((tile_size, tile_size), Image.LANCZOS)
                atlas.paste(img, (x, y), img)  # Use alpha mask
                loaded_count += 1

            # Manifest entry
            global_index = start + i
            pid = str(product['id'])
            if pid not in manifest_entries:
                manifest_entries[pid] = {
                    'storageId': product['storage_id'],
                    'name': product['name'],
                    'globalIndex': global_index,
                }
            manifest_entries[pid][f't{tile_size}'] = {
                'page': page_idx,
                'col': col,
                'row': row,
            }

            if (i + 1) % 100 == 0:
                print(f"  Page {page_idx}: {i+1}/{len(page_products)} tiles ({loaded_count} loaded)")

        # Save atlas page as PNG
        atlas_path = tier_dir / f"atlas_{page_idx}.png"
        atlas.save(str(atlas_path), 'PNG', optimize=True)
        file_size = atlas_path.stat().st_size / (1024 * 1024)
        total_loaded += loaded_count

        print(f"  Page {page_idx}: {loaded_count}/{len(page_products)} loaded → {atlas_path.name} ({file_size:.1f} MB)")

    print(f"  Total: {total_loaded}/{len(products)} tiles loaded across {num_pages} pages")
    return manifest_entries


def main():
    parser = argparse.ArgumentParser(description='Generate texture atlases for O\'Neal products')
    parser.add_argument('--tier', type=int, choices=[64, 128, 256], help='Generate only one tier')
    parser.add_argument('--output', type=str, default='atlas/', help='Output directory')
    parser.add_argument('--limit', type=int, default=0, help='Limit number of products (0=all)')
    args = parser.parse_args()

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Get products
    products = get_products()
    if args.limit > 0:
        products = products[:args.limit]
    print(f"Found {len(products)} products with images")

    # Generate tiers
    tiers_to_generate = [args.tier] if args.tier else [64, 128, 256]
    all_manifest = {}

    for tier in tiers_to_generate:
        entries = generate_tier(products, tier, output_dir)
        # Merge into manifest
        for pid, data in entries.items():
            if pid not in all_manifest:
                all_manifest[pid] = data
            else:
                all_manifest[pid].update(data)

    # Save manifest
    manifest_path = output_dir / 'manifest.json'
    with open(manifest_path, 'w') as f:
        json.dump({
            'productCount': len(products),
            'tiers': {str(t): TIERS[t] for t in tiers_to_generate},
            'products': all_manifest,
        }, f, indent=2)

    print(f"\nManifest saved to {manifest_path}")
    print(f"Total: {len(all_manifest)} products in atlas")


if __name__ == '__main__':
    main()
