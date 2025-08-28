#!/usr/bin/env python3
"""
Clinical Trials Dashboard - Manifest Generator
Scans the data/ folder and creates a manifest.json file listing all JSON files.
Run this script whenever you add/remove JSON files from the data/ folder.
"""

import os
import json
from pathlib import Path

def generate_manifest():
    """Generate manifest.json file with list of all JSON files in data/ folder"""
    
    data_dir = Path("data")
    
    # Create data directory if it doesn't exist
    data_dir.mkdir(exist_ok=True)
    
    # Find all JSON files
    json_files = [f.name for f in data_dir.glob("*.json") if f.name != "manifest.json"]
    json_files.sort()  # Sort alphabetically for consistency
    
    # Create manifest
    manifest = {
        "files": json_files,
        "total_files": len(json_files),
        "generated_at": __import__("datetime").datetime.now().isoformat(),
        "note": "Auto-generated file list for Clinical Trials Dashboard"
    }
    
    # Write manifest file
    manifest_path = data_dir / "manifest.json"
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    
    # Print summary
    print("📋 Clinical Trials Dashboard - Manifest Generator")
    print("=" * 50)
    print(f"📂 Scanned directory: {data_dir.absolute()}")
    print(f"✅ Found {len(json_files)} JSON files:")
    
    for i, filename in enumerate(json_files, 1):
        print(f"   {i:2d}. {filename}")
    
    if len(json_files) == 0:
        print("⚠️  No JSON files found in data/ directory")
        print("   Please add your JSON files to the data/ folder and run this script again.")
    else:
        print(f"\n💾 Created: {manifest_path}")
        print("🚀 You can now start your dashboard server!")

def validate_json_files():
    """Validate that all JSON files are properly formatted"""
    data_dir = Path("data")
    json_files = [f for f in data_dir.glob("*.json") if f.name != "manifest.json"]
    
    invalid_files = []
    
    for json_file in json_files:
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                json.load(f)
        except json.JSONDecodeError as e:
            invalid_files.append((json_file.name, str(e)))
        except Exception as e:
            invalid_files.append((json_file.name, f"Error reading file: {e}"))
    
    if invalid_files:
        print("\n❌ Invalid JSON files found:")
        for filename, error in invalid_files:
            print(f"   - {filename}: {error}")
        return False
    else:
        print("✅ All JSON files are valid")
        return True

if __name__ == "__main__":
    print("🔍 Validating JSON files...")
    if validate_json_files():
        print("\n📝 Generating manifest...")
        generate_manifest()
        print("\n🎉 Done! Your dashboard is ready to use.")
    else:
        print("\n🛑 Please fix the invalid JSON files before continuing.")