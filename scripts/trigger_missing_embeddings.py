#!/usr/bin/env python3
"""
Trigger Missing AI Embeddings - Find and process objects without full AI analysis

This script:
1. Fetches all O'Neal catalog objects from Storage API
2. Identifies objects missing full AI vision analysis
3. Triggers AI embedding generation for those objects
"""

import sys
import os
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Tuple

# API Configuration
STORAGE_API_BASE = os.getenv('STORAGE_API_BASE', 'https://api-storage.arkturian.com')
API_KEY = os.getenv('API_KEY', 'oneal_demo_token')

def fetch_object(object_id: int) -> Dict | None:
    """Fetch a single object by ID."""
    url = f"{STORAGE_API_BASE}/storage/objects/{object_id}"
    headers = {'X-API-Key': API_KEY}

    try:
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 404:
            return None  # Object doesn't exist
        raise
    except Exception:
        return None

def fetch_all_objects_by_range(start_id: int, end_id: int) -> List[Dict]:
    """Fetch all objects by trying ID range."""
    print(f"📡 Fetching objects from Storage API (ID range: {start_id}-{end_id})...")

    all_objects = []

    for object_id in range(start_id, end_id + 1):
        if object_id % 100 == 0:
            print(f"  Checked {object_id - start_id} IDs, found {len(all_objects)} objects...")

        obj = fetch_object(object_id)
        if obj:
            # Check if it's an oneal_catalog object
            if obj.get('collection_id') == 'oneal_catalog':
                all_objects.append(obj)

    print(f"✅ Fetched {len(all_objects)} total objects\n")
    return all_objects

def has_full_ai_analysis(obj: Dict) -> bool:
    """Check if object has full AI vision analysis."""
    metadata = obj.get('ai_context_metadata', {})

    # Check for presence of detailed analysis fields
    has_visual = 'visual_analysis' in metadata
    has_product = 'product_analysis' in metadata
    has_embedding = 'embedding_info' in metadata

    # Full analysis should have all three
    return has_visual and has_product and has_embedding

def trigger_embedding(object_id: int) -> Tuple[bool, int]:
    """
    Trigger AI embedding generation for an object.

    Returns:
        (success, object_id)
    """
    url = f"{STORAGE_API_BASE}/storage/kg/embed/{object_id}"
    headers = {'X-API-Key': API_KEY}

    try:
        response = requests.post(url, headers=headers, timeout=120)
        response.raise_for_status()
        return (True, object_id)
    except Exception as e:
        print(f"❌ Failed to embed object {object_id}: {e}")
        return (False, object_id)

def main():
    print("🔍 O'Neal AI Embedding Generation Script\n")

    # Fetch all objects from ID range (O'Neal objects are in 3800-5000 range)
    objects = fetch_all_objects_by_range(3800, 5000)

    if not objects:
        print("❌ No objects found!")
        sys.exit(1)

    # Analyze which objects are missing AI analysis
    missing_analysis = []
    has_analysis = []

    for obj in objects:
        obj_id = obj['id']
        if has_full_ai_analysis(obj):
            has_analysis.append(obj_id)
        else:
            missing_analysis.append(obj_id)

    print(f"📊 Analysis Results:")
    print(f"   ✅ Objects WITH full AI analysis: {len(has_analysis)}")
    print(f"   ❌ Objects MISSING AI analysis: {len(missing_analysis)}")

    if not missing_analysis:
        print("\n🎉 All objects already have full AI analysis!")
        return

    print(f"\n🔥 Triggering AI embeddings for {len(missing_analysis)} objects...")
    print(f"📊 Using {5} parallel workers\n")

    success_count = 0
    failed_count = 0

    with ThreadPoolExecutor(max_workers=5) as executor:
        # Submit all tasks
        futures = [
            executor.submit(trigger_embedding, obj_id)
            for obj_id in missing_analysis
        ]

        # Process results
        for i, future in enumerate(as_completed(futures), 1):
            success, obj_id = future.result()

            if success:
                success_count += 1
            else:
                failed_count += 1

            # Progress indicator
            if i % 10 == 0 or i == len(missing_analysis):
                progress_pct = (i / len(missing_analysis)) * 100
                print(f"\r✅ {success_count} / ❌ {failed_count} / 📦 {i}/{len(missing_analysis)} ({progress_pct:.1f}%)", end='', flush=True)

    print(f"\n\n🎉 AI Embedding Generation Complete!")
    print(f"   ✅ Success: {success_count}")
    print(f"   ❌ Failed: {failed_count}")
    print(f"   📦 Total: {len(missing_analysis)}")

if __name__ == '__main__':
    main()
