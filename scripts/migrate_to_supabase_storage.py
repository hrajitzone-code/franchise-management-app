import os
import sys
import argparse
import requests
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.storage_service import (
    is_supabase_configured,
    get_supabase_url,
    get_supabase_key,
    get_supabase_bucket
)

def run_storage_migration(verify_only=False):
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    uploads_dir = os.path.join(base_dir, 'uploads')

    print("==================================================")
    print("LOCAL UPLOADS TO SUPABASE STORAGE MIGRATION TOOL")
    print("==================================================")
    print(f"Source Folder: {uploads_dir}")
    print(f"Supabase Configured: {is_supabase_configured()}")
    if is_supabase_configured():
        print(f"Supabase URL: {get_supabase_url()}")
        print(f"Target Bucket: {get_supabase_bucket()}")
    print(f"Execution Mode: {'DRY RUN / VERIFY ONLY' if verify_only else 'EXECUTE UPLOAD'}")
    print("==================================================\n")

    if not os.path.exists(uploads_dir):
        print(f"[ERROR] Source uploads folder does not exist at {uploads_dir}")
        return False

    files = [f for f in os.listdir(uploads_dir) if os.path.isfile(os.path.join(uploads_dir, f)) and f != '.gitkeep']
    print(f"Found {len(files)} files to verify/upload in local storage:\n")

    for f in files:
        f_path = os.path.join(uploads_dir, f)
        f_size = os.path.getsize(f_path)
        print(f"  * File: '{f}' ({f_size} bytes)")

    if not is_supabase_configured():
        print("\n[NOTICE] Supabase Storage environment variables (SUPABASE_URL, SUPABASE_KEY) are not configured.")
        print("[DRY RUN RESULT] All local uploaded files are safely preserved in local filesystem storage.")
        return True

    sup_url = get_supabase_url()
    sup_key = get_supabase_key()
    sup_bucket = get_supabase_bucket()

    if verify_only:
        print("\n--- DRY RUN VERIFICATION WITH SUPABASE BUCKET ---")
        try:
            list_url = f"{sup_url}/storage/v1/object/list/{sup_bucket}"
            headers = {
                "Authorization": f"Bearer {sup_key}",
                "apiKey": sup_key
            }
            res = requests.post(list_url, headers=headers, json={"limit": 100}, timeout=5)
            if res.status_code == 200:
                remote_files = [item['name'] for item in res.json() if 'name' in item]
                print(f"[SUCCESS] Connected to Supabase Storage. Bucket '{sup_bucket}' contains {len(remote_files)} remote files.")
                pending = [f for f in files if f not in remote_files]
                print(f"Pending Files to Migrate: {len(pending)}")
            else:
                print(f"[WARNING] Bucket query status {res.status_code}: {res.text}")
        except Exception as e:
            print(f"[WARNING] Could not list bucket objects: {e}")
        return True

    # EXECUTE UPLOADS
    print("\n--- EXECUTING UPLOADS TO SUPABASE STORAGE ---")
    uploaded_count = 0
    failed_count = 0

    for f in files:
        f_path = os.path.join(uploads_dir, f)
        with open(f_path, 'rb') as f_obj:
            file_bytes = f_obj.read()

        upload_target_url = f"{sup_url}/storage/v1/object/{sup_bucket}/{f}"
        headers = {
            "Authorization": f"Bearer {sup_key}",
            "apiKey": sup_key,
            "Content-Type": "application/octet-stream",
            "x-upsert": "true"
        }

        try:
            resp = requests.post(upload_target_url, headers=headers, data=file_bytes, timeout=10)
            if resp.status_code in [200, 201]:
                print(f"  [UPLOAD SUCCESS] '{f}' -> supabase:{f}")
                uploaded_count += 1
            else:
                print(f"  [UPLOAD FAILED] '{f}' ({resp.status_code}): {resp.text}")
                failed_count += 1
        except Exception as e:
            print(f"  [UPLOAD EXCEPTION] '{f}': {e}")
            failed_count += 1

    print(f"\n[STORAGE MIGRATION SUMMARY] Uploaded: {uploaded_count}, Failed: {failed_count}")
    return failed_count == 0

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate local files to Supabase Storage")
    parser.add_argument("--verify-only", action="store_true", help="Run dry run verification without uploading")
    args = parser.parse_args()

    run_storage_migration(verify_only=args.verify_only)
