#!/usr/bin/env python3
"""
Warmup Image Cache - Preload all product images to cache them at Storage API

This script loads all product images in both sizes (150px and 1300px) to ensure
they are cached at the Storage API endpoint for faster initial page loads.
"""

import sys
import os
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Tuple

# API Configuration
API_BASE = os.getenv('API_BASE', 'https://oneal-api.arkturian.com/v1')
API_KEY = os.getenv('API_KEY', 'oneal_demo_token')

# Image sizes to cache
SIZES = [150, 1300]

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

def get_storage_id(product: Dict) -> int | None:
    """Extract storage_id from product."""
    media = product.get('media', [])
    if not media:
        return None

    primary_image = media[0]
    return primary_image.get('storage_id')

def warmup_image(product_id: str, storage_id: int, size: int) -> Tuple[bool, str, int]:
    """
    Load a single image to cache it.

    Returns:
        (success, product_id, size)
    """
    url = f"https://api-storage.arkturian.com/storage/media/{storage_id}?width={size}&format=webp&quality=85"

    # Retry logic for 502/504 errors
    max_retries = 2
    for attempt in range(max_retries):
        try:
            response = requests.get(url, timeout=60)  # Increased timeout
            response.raise_for_status()
            return (True, product_id, size)
        except requests.exceptions.HTTPError as e:
            if e.response.status_code in [502, 504] and attempt < max_retries - 1:
                # Retry on gateway errors
                continue
            print(f"❌ HTTP {e.response.status_code} for {product_id} (storage_id: {storage_id}, size: {size}px)")
            return (False, product_id, size)
        except requests.exceptions.Timeout:
            print(f"⏱️  Timeout for {product_id} (storage_id: {storage_id}, size: {size}px)")
            return (False, product_id, size)
        except Exception as e:
            print(f"❌ Failed to load {product_id} (storage_id: {storage_id}, size: {size}px): {e}")
            return (False, product_id, size)

    return (False, product_id, size)

def main():
    print("🔥 O'Neal Image Cache Warmup Script\n")

    # Fetch products from API
    products = fetch_products()
    print(f"✅ Loaded {len(products)} products")

    # Collect all image tasks
    tasks = []
    for product in products:
        storage_id = get_storage_id(product)
        if storage_id:
            product_id = product.get('id', 'unknown')
            for size in SIZES:
                tasks.append((product_id, storage_id, size))
        else:
            print(f"⚠️  Product {product.get('id', 'unknown')} has no storage_id, skipping")

    print(f"\n🔥 Warming up cache for {len(tasks)} images ({len(products)} products × {len(SIZES)} sizes)")
    print(f"📊 Settings: 3 parallel workers, 60s timeout, retry on 502/504 errors")
    print(f"📊 Progress:\n")

    # Use ThreadPoolExecutor for parallel requests (low parallelism to avoid overload)
    success_count = 0
    failed_count = 0

    with ThreadPoolExecutor(max_workers=3) as executor:
        # Submit all tasks
        futures = [
            executor.submit(warmup_image, product_id, storage_id, size)
            for product_id, storage_id, size in tasks
        ]

        # Process results as they complete
        for i, future in enumerate(as_completed(futures), 1):
            success, product_id, size = future.result()

            if success:
                success_count += 1
            else:
                failed_count += 1

            # Progress indicator
            if i % 10 == 0 or i == len(tasks):
                progress_pct = (i / len(tasks)) * 100
                print(f"\r✅ {success_count} / ❌ {failed_count} / 📦 {i}/{len(tasks)} ({progress_pct:.1f}%)", end='', flush=True)

    print(f"\n\n🎉 Cache warmup complete!")
    print(f"   ✅ Success: {success_count}")
    print(f"   ❌ Failed: {failed_count}")
    print(f"   📦 Total: {len(tasks)}")

if __name__ == '__main__':
    main()
