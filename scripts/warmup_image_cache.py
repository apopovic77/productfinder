#!/usr/bin/env python3
"""
Warmup Image Cache - Preload all product images to cache them at Storage API

This script loads all product images in both sizes (130px and 1300px) to ensure
they are cached at the Storage API endpoint for faster initial page loads.
"""

import sys
import os
from collections import OrderedDict
from http.client import IncompleteRead
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Tuple

import argparse
import requests
import time

# API Configuration (prefer O'Neal specific env vars)
API_BASE = (
    os.getenv('ONEAL_API_BASE')
    or os.getenv('VITE_ONEAL_API_BASE')
    or 'https://oneal-api.arkturian.com/v1'
)
API_KEY = (
    os.getenv('ONEAL_API_KEY')
    or os.getenv('VITE_ONEAL_API_KEY')
    or os.getenv('API_KEY')
    or 'oneal_demo_token'
)

# Image size presets
BASE_SIZES = [130]  # always warm low-res for canvas/product grid
HIGH_RES_SIZE = 1300  # optional high-res (modal hero)

def fetch_products() -> List[Dict]:
    """Fetch all products from O'Neal API."""
    url = f"{API_BASE}/products"
    headers = {'X-API-Key': API_KEY}

    print(f"📡 Fetching products from: {url}")

    try:
        response = requests.get(url, headers=headers, params={'limit': 1000}, timeout=30)
        response.raise_for_status()
        data = response.json()
        products = data.get('results', [])
        return products
    except Exception as e:
        print(f"❌ Failed to fetch products: {e}")
        sys.exit(1)

def collect_media_entries(products: List[Dict]) -> Dict[int, Dict[str, str]]:
    """
    Collect unique storage-backed media entries.

    Returns:
        Ordered dict keyed by storage_id with product metadata.
    """
    media_map: Dict[int, Dict[str, str]] = OrderedDict()
    for product in products:
        product_id = product.get('id', 'unknown')
        for media_item in product.get('media') or []:
            storage_id = media_item.get('storage_id')
            if not storage_id or storage_id in media_map:
                continue
            media_map[storage_id] = {
                'product_id': product_id,
                'media_role': media_item.get('role', 'unknown'),
            }
            # Only warm primary image per product
            break
    return media_map

def warmup_image(product_id: str, storage_id: int, size: int, refresh: bool = False, trim: bool = False) -> Tuple[bool, str, int]:
    """
    Load a single image to cache it.

    Returns:
        (success, product_id, size)
    """
    base_url = f"https://share.arkturian.com/proxy.php"
    # Use quality matching production settings: 75 for low-res, 85 for high-res
    quality = 75 if size <= 130 else 85
    params = {
        'id': storage_id,
        'width': size,
        'height': size,  # Set both width and height to limit max dimension
        'format': 'webp',
        'quality': quality,
    }
    if refresh:
        params['refresh'] = 'true'
    if trim:
        params['trim'] = 'true'
    
    # Retry logic for transient errors
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = requests.get(base_url, params=params, timeout=60)  # Increased timeout
            response.raise_for_status()
            return (True, product_id, size)
        except requests.exceptions.HTTPError as e:
            if e.response.status_code in [502, 504] and attempt < max_retries - 1:
                # Retry on gateway errors
                continue
            print(f"❌ HTTP {e.response.status_code} for {product_id} (storage_id: {storage_id}, size: {size}px)")
            return (False, product_id, size)
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError,
                requests.exceptions.ChunkedEncodingError) as e:
            if attempt < max_retries - 1:
                time.sleep(1.0)
                continue
            print(f"⏱️  Timeout/connection issue for {product_id} (storage_id: {storage_id}, size: {size}px): {e}")
            return (False, product_id, size)
        except IncompleteRead as e:
            if attempt < max_retries - 1:
                time.sleep(1.0)
                continue
            print(f"❌ Incomplete read for {product_id} (storage_id: {storage_id}, size: {size}px): {e}")
            return (False, product_id, size)
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(1.0)
                continue
            print(f"❌ Failed to load {product_id} (storage_id: {storage_id}, size: {size}px): {e}")
            return (False, product_id, size)

    return (False, product_id, size)

def main():
    parser = argparse.ArgumentParser(description="Warm up O'Neal product images on the Storage API.")
    parser.add_argument(
        "--no-highres",
        action="store_true",
        help="Skip high-resolution (1300px) variants (only warm 130px).",
    )
    parser.add_argument(
        "--no-refresh",
        action="store_true",
        help="Do not force cache invalidation (skip refresh=true).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=3,
        help="Number of parallel download workers (default: 3).",
    )
    parser.add_argument(
        "--trim",
        action="store_true",
        help="Request trimmed/cropped images with transparent background (trim=true parameter).",
    )
    args = parser.parse_args()

    print("🔥 O'Neal Image Cache Warmup Script\n")

    # Fetch products from API
    products = fetch_products()
    print(f"✅ Loaded {len(products)} products")

    media_entries = collect_media_entries(products)
    if not media_entries:
        print("⚠️  No storage-backed media found. Nothing to warm up.")
        return

    sizes = list(BASE_SIZES)
    if not args.no_highres:
        sizes.append(HIGH_RES_SIZE)

    # Collect all image tasks (first size triggers refresh)
    tasks = []
    for storage_id, meta in media_entries.items():
        product_id = meta['product_id']
        for index, size in enumerate(sizes):
            tasks.append((product_id, storage_id, size, index == 0))

    print(f"\n🔥 Warming up cache for {len(tasks)} requests "
          f"({len(media_entries)} media assets × {len(sizes)} sizes)")
    print(f"📊 Settings: {args.workers} parallel workers, 60s timeout, retry on transient errors")
    print(f"   • Refresh derivatives: {'yes' if not args.no_refresh else 'no'}")
    print(f"   • Trimmed images: {'yes' if args.trim else 'no'}")
    print(f"   • Sizes: {', '.join(f'{s}px' for s in sizes)}")
    print(f"📊 Progress:\n")

    success_count = 0
    failed_count = 0

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = [
            executor.submit(
                warmup_image,
                product_id,
                storage_id,
                size,
                refresh=(refresh and not args.no_refresh),
                trim=args.trim
            )
            for product_id, storage_id, size, refresh in tasks
        ]

        for i, future in enumerate(as_completed(futures), 1):
            success, product_id, size = future.result()
            if success:
                success_count += 1
            else:
                failed_count += 1

            if i % 10 == 0 or i == len(tasks):
                progress_pct = (i / len(tasks)) * 100
                print(f"\r✅ {success_count} / ❌ {failed_count} / 📦 {i}/{len(tasks)} ({progress_pct:.1f}%)", end='', flush=True)

    print(f"\n\n🎉 Cache warmup complete!")
    print(f"   ✅ Success: {success_count}")
    print(f"   ❌ Failed: {failed_count}")
    print(f"   📦 Total: {len(tasks)}")

if __name__ == '__main__':
    main()
