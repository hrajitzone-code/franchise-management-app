import os
import io
import datetime
import requests
from werkzeug.utils import secure_filename

def is_supabase_configured():
    url = os.environ.get('SUPABASE_URL', '').rstrip('/')
    key = os.environ.get('SUPABASE_KEY', '')
    return bool(url and key)

def get_supabase_url():
    return os.environ.get('SUPABASE_URL', '').rstrip('/')

def get_supabase_key():
    return os.environ.get('SUPABASE_KEY', '')

def get_supabase_bucket():
    return os.environ.get('SUPABASE_BUCKET', 'uploads')

def upload_file(file_obj, filename=None):
    """
    Uploads file to Supabase Storage (if configured) or local uploads folder.
    Returns stored file reference path or URL.
    """
    if hasattr(file_obj, 'filename') and file_obj.filename:
        raw_name = file_obj.filename
        file_bytes = file_obj.read()
        file_obj.seek(0)
    elif isinstance(file_obj, bytes):
        raw_name = filename or 'document'
        file_bytes = file_obj
    elif hasattr(file_obj, 'read'):
        raw_name = filename or 'document'
        file_bytes = file_obj.read()
    else:
        raise ValueError("Invalid file object provided to storage_service")

    orig_filename = secure_filename(raw_name) if raw_name else 'file'
    timestamp_str = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    saved_filename = f"{timestamp_str}_{orig_filename}"

    if is_supabase_configured():
        sup_url = get_supabase_url()
        sup_key = get_supabase_key()
        sup_bucket = get_supabase_bucket()
        try:
            upload_target_url = f"{sup_url}/storage/v1/object/{sup_bucket}/{saved_filename}"
            headers = {
                "Authorization": f"Bearer {sup_key}",
                "apiKey": sup_key,
                "Content-Type": "application/octet-stream",
                "x-upsert": "true"
            }
            resp = requests.post(upload_target_url, headers=headers, data=file_bytes, timeout=10)
            if resp.status_code in [200, 201]:
                return f"supabase:{saved_filename}"
            else:
                print(f"Supabase storage upload failed ({resp.status_code}): {resp.text}")
        except Exception as e:
            print(f"Supabase upload exception: {e}")

    # Fallback: Local uploads directory or /tmp for serverless
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    upload_folder = os.path.join(base_dir, 'uploads')
    try:
        os.makedirs(upload_folder, exist_ok=True)
        local_path = os.path.join(upload_folder, saved_filename)
        with open(local_path, 'wb') as f:
            f.write(file_bytes)
        return f"/uploads/{saved_filename}"
    except (PermissionError, OSError):
        # Serverless fallback (/tmp)
        tmp_folder = '/tmp/uploads'
        os.makedirs(tmp_folder, exist_ok=True)
        tmp_path = os.path.join(tmp_folder, saved_filename)
        with open(tmp_path, 'wb') as f:
            f.write(file_bytes)
        return f"/uploads/{saved_filename}"

def get_file_url(file_path_or_key, expires_in=3600):
    """
    Generates access URL for viewing/downloading file.
    For Supabase private buckets, generates a secure signed URL.
    """
    if not file_path_or_key:
        return ''
    
    if file_path_or_key.startswith(('http://', 'https://')):
        return file_path_or_key

    if file_path_or_key.startswith('supabase:'):
        clean_key = file_path_or_key.replace('supabase:', '')
        if is_supabase_configured():
            sup_url = get_supabase_url()
            sup_key = get_supabase_key()
            sup_bucket = get_supabase_bucket()
            try:
                sign_url = f"{sup_url}/storage/v1/object/sign/{sup_bucket}/{clean_key}"
                headers = {
                    "Authorization": f"Bearer {sup_key}",
                    "apiKey": sup_key,
                    "Content-Type": "application/json"
                }
                resp = requests.post(sign_url, headers=headers, json={"expiresIn": expires_in}, timeout=5)
                if resp.status_code == 200:
                    data = resp.json()
                    signed_path = data.get('signedURL') or data.get('signedUrl')
                    if signed_path:
                        if signed_path.startswith('/'):
                            return f"{sup_url}/storage/v1{signed_path}"
                        return f"{sup_url}{signed_path}"
            except Exception as e:
                print(f"Error generating signed URL: {e}")
            return f"{sup_url}/storage/v1/object/public/{sup_bucket}/{clean_key}"

    return file_path_or_key
