import os
import json
import datetime
import traceback
from models import db, GoogleSheetsConfig, GoogleSheetsSyncLog, User, Lead, Franchise, FollowUp, CallHistory, TokenRecord, Payment, Expense, VisitExpense, Purchase, GRReturn, TrainingRecord, InteriorSetup, BrandingSetup, MarketingCampaign, CompanySupport, MaterialAsset, Complaint

# Try importing gspread & google.oauth2
try:
    import gspread
    from google.oauth2.service_account import Credentials
    GSPREAD_AVAILABLE = True
except ImportError:
    GSPREAD_AVAILABLE = False

SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

# Module name to Google Sheet Tab Name mapping
MODULE_TAB_MAPPING = {
    'leads': 'Leads',
    'calling': 'Calling History',
    'followup': 'Follow Ups',
    'franchises': 'Franchises',
    'token': 'Tokens',
    'payments': 'Payments',
    'purchases': 'Purchase',
    'gr': 'GR/Returns',
    'expenses': 'Expenses',
    'visit_expenses': 'Visit Expenses',
    'training': 'Training',
    'interior': 'Interior',
    'branding': 'Branding',
    'marketing': 'Marketing',
    'support': 'Company Support',
    'materials': 'Material/Assets',
    'complaints': 'Complaints'
}

# Whitelist fields to explicitly exclude sensitive security fields (passwords, hashes, tokens)
EXCLUDED_FIELDS = {'password_hash', 'password', 'permissions_json', 'secret_key', 'token_hash'}

def get_service_account_info():
    """
    Retrieves Google Service Account credentials strictly from server-side environment or config file.
    NEVER reads credentials from database tables.
    """
    raw_env_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if raw_env_json:
        try:
            return json.loads(raw_env_json)
        except Exception as e:
            print(f"[GOOGLE SHEETS] Error parsing GOOGLE_SERVICE_ACCOUNT_JSON env: {e}")

    env_file_path = os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE')
    if env_file_path and os.path.exists(env_file_path):
        try:
            with open(env_file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[GOOGLE SHEETS] Error reading GOOGLE_SERVICE_ACCOUNT_FILE: {e}")

    # Allow local file fallback ONLY when NOT running on Vercel / Production
    if not os.environ.get('VERCEL'):
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        local_config_file = os.path.join(base_dir, 'config', 'google_service_account.json')
        if os.path.exists(local_config_file):
            try:
                with open(local_config_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"[GOOGLE SHEETS] Error reading local config file: {e}")

    return None

def get_active_google_sheets_config():
    """
    Centralized configuration resolver.
    Retrieves the latest configuration record with a non-empty, non-null spreadsheet_id.
    Fallback to the latest configuration record by ID if no populated record exists.
    """
    try:
        cfg = GoogleSheetsConfig.query.filter(
            GoogleSheetsConfig.spreadsheet_id != None,
            GoogleSheetsConfig.spreadsheet_id != ''
        ).order_by(GoogleSheetsConfig.id.desc()).first()

        if not cfg:
            cfg = GoogleSheetsConfig.query.order_by(GoogleSheetsConfig.id.desc()).first()

        return cfg
    except Exception as e:
        print(f"[GOOGLE SHEETS CONFIG RESOLVER ERROR] {e}")
        return None

def is_google_sheets_configured():
    """Checks if Spreadsheet ID and Service Account Credentials are both present."""
    if not GSPREAD_AVAILABLE:
        return False, "gspread or google-auth package not installed"

    cfg = get_active_google_sheets_config()
    spreadsheet_id = (cfg.spreadsheet_id or '').strip() if cfg and cfg.spreadsheet_id else (os.environ.get('GOOGLE_SPREADSHEET_ID') or '').strip()
    if not spreadsheet_id:
        return False, "Spreadsheet ID not configured"

    sa_info = get_service_account_info()
    if not sa_info:
        return False, "Google Service Account credentials JSON not found in environment or server config"

    return True, "Configured"

def get_gspread_client():
    """Builds authenticated gspread client."""
    sa_info = get_service_account_info()
    if not sa_info:
        raise ValueError("Google Service Account credentials JSON not found.")
    creds = Credentials.from_service_account_info(sa_info, scopes=SCOPES)
    return gspread.authorize(creds)

def sanitize_record_payload(record_dict):
    """
    Safely sanitizes a model payload dictionary:
    - Excludes sensitive fields (passwords, hashes, tokens)
    - Formats dates/datetimes as clean strings
    - Converts booleans and None values safely
    """
    sanitized = {}
    for k, v in record_dict.items():
        if k in EXCLUDED_FIELDS:
            continue
        if isinstance(v, (datetime.datetime, datetime.date)):
            sanitized[k] = v.strftime('%Y-%m-%d %H:%M:%S') if isinstance(v, datetime.datetime) else v.strftime('%Y-%m-%d')
        elif v is None:
            sanitized[k] = ''
        elif isinstance(v, (dict, list)):
            sanitized[k] = json.dumps(v)
        else:
            sanitized[k] = str(v)
    return sanitized

def sync_record_to_sheet(module_key, record_dict, action='SYNC'):
    """
    Synchronizes a single model record dictionary to the Google Spreadsheet.
    - Resolves Tab Name
    - Creates Tab if missing
    - Dynamic Header Management (adds missing new columns to Row 1 without deleting old columns)
    - Upserts Row by unique Record ID (Composite ID: MODULE:ID)
    """
    is_ok, msg = is_google_sheets_configured()
    record_id = record_dict.get('id')
    module_key = (module_key or '').lower()
    tab_name = MODULE_TAB_MAPPING.get(module_key, module_key.capitalize())
    composite_id = f"{module_key.upper()}:{record_id}"

    if not is_ok:
        log_sync_status(module_key, record_id, composite_id, action, 'FAILED', f"Configuration incomplete: {msg}")
        return False, f"Configuration incomplete: {msg}"

    cfg = get_active_google_sheets_config()
    spreadsheet_id = (cfg.spreadsheet_id or '').strip() if cfg and cfg.spreadsheet_id else (os.environ.get('GOOGLE_SPREADSHEET_ID') or '').strip()

    try:
        gc = get_gspread_client()
        sh = gc.open_by_key(spreadsheet_id)

        # 1. Get or Create Tab
        try:
            ws = sh.worksheet(tab_name)
        except gspread.WorksheetNotFound:
            ws = sh.add_worksheet(title=tab_name, rows="100", cols="30")

        # 2. Sanitize payload
        clean_payload = sanitize_record_payload(record_dict)

        # Ensure Record ID & Composite ID are included
        clean_payload['Record ID'] = str(record_id)
        clean_payload['Composite ID'] = composite_id

        # 3. Dynamic Header Management
        headers = ws.row_values(1)
        if not headers:
            # First initialization of sheet header
            headers = ['Record ID', 'Composite ID'] + [k for k in clean_payload.keys() if k not in ['Record ID', 'Composite ID']]
            ws.update(range_name='A1', values=[headers])
        else:
            # Check for any new fields not present in existing header
            missing_headers = [k for k in clean_payload.keys() if k not in headers]
            if missing_headers:
                headers = headers + missing_headers
                ws.update(range_name='A1', values=[headers])

        # 4. Search existing row by Record ID or Composite ID
        col1_values = ws.col_values(1)  # Record ID column
        target_row_idx = None

        for idx, val in enumerate(col1_values[1:], start=2):
            if str(val).strip() == str(record_id):
                target_row_idx = idx
                break

        # Build row vector matching headers order
        row_vector = [str(clean_payload.get(h, '')) for h in headers]

        if target_row_idx:
            # Update existing row (prevents duplicate rows)
            ws.update(range_name=f"A{target_row_idx}", values=[row_vector])
            log_sync_status(module_key, record_id, composite_id, 'UPDATE', 'SUCCESS', f"Updated row {target_row_idx} in tab '{tab_name}'")
        else:
            # Append new row
            ws.append_row(row_vector)
            log_sync_status(module_key, record_id, composite_id, 'CREATE', 'SUCCESS', f"Appended new row to tab '{tab_name}'")

        # Update last sync timestamp in config
        if cfg:
            cfg.last_sync_at = datetime.datetime.utcnow()
            cfg.last_status = 'Connected'
            cfg.error_message = None
            db.session.commit()

        return True, "Sync successful"
    except Exception as e:
        err_msg = str(e)
        print(f"[GOOGLE SHEETS SYNC ERROR] {module_key}:{record_id} -> {err_msg}\n{traceback.format_exc()}")
        log_sync_status(module_key, record_id, composite_id, action, 'FAILED', err_msg, json.dumps(record_dict))
        if cfg:
            cfg.last_status = 'Error'
            cfg.error_message = err_msg
            db.session.commit()
        return False, err_msg

def log_sync_status(module_name, record_id, composite_id, action, status, error_message=None, payload_json=None):
    """Writes log entry to GoogleSheetsSyncLog table."""
    try:
        log_entry = GoogleSheetsSyncLog(
            module_name=module_name,
            record_id=record_id or 0,
            composite_id=composite_id,
            action=action,
            status=status,
            error_message=error_message,
            payload_json=payload_json
        )
        db.session.add(log_entry)
        db.session.commit()
    except Exception as ex:
        db.session.rollback()
        print(f"[GOOGLE SHEETS LOGGING ERROR] {ex}")

def sync_all_modules():
    """
    Super Admin Action: Iterates through all dynamic database records across all modules
    and synchronizes them into the Google Spreadsheet.
    """
    is_ok, msg = is_google_sheets_configured()
    if not is_ok:
        return False, f"Cannot sync: {msg}", 0

    model_map = [
        ('leads', Lead),
        ('franchises', Franchise),
        ('followup', FollowUp),
        ('calling', CallHistory),
        ('token', TokenRecord),
        ('payments', Payment),
        ('expenses', Expense),
        ('visit_expenses', VisitExpense),
        ('purchases', Purchase),
        ('gr', GRReturn),
        ('training', TrainingRecord),
        ('interior', InteriorSetup),
        ('branding', BrandingSetup),
        ('marketing', MarketingCampaign),
        ('support', CompanySupport),
        ('materials', MaterialAsset),
        ('complaints', Complaint)
    ]

    total_synced = 0
    errors = 0

    for mod_key, model_cls in model_map:
        try:
            records = model_cls.query.all()
            for rec in records:
                if hasattr(rec, 'to_dict'):
                    rec_dict = rec.to_dict()
                    success, _ = sync_record_to_sheet(mod_key, rec_dict, action='SYNC_ALL')
                    if success:
                        total_synced += 1
                    else:
                        errors += 1
        except Exception as e:
            print(f"[GOOGLE SHEETS SYNC ALL ERROR] Module '{mod_key}': {e}")
            errors += 1

    return True, f"Successfully synced {total_synced} records across modules ({errors} errors).", total_synced

def retry_failed_syncs():
    """
    Retries failed items in GoogleSheetsSyncLog queue.
    """
    failed_logs = GoogleSheetsSyncLog.query.filter_by(status='FAILED').limit(50).all()
    if not failed_logs:
        return True, "No failed sync items in queue.", 0

    retried_count = 0
    for log in failed_logs:
        try:
            payload = json.loads(log.payload_json) if log.payload_json else {'id': log.record_id}
            success, _ = sync_record_to_sheet(log.module_name, payload, action='RETRY')
            if success:
                log.status = 'SUCCESS'
                log.error_message = 'Resolved on retry'
                retried_count += 1
            else:
                log.attempts += 1
            db.session.commit()
        except Exception as e:
            log.attempts += 1
            log.error_message = str(e)
            db.session.commit()

    return True, f"Retried {len(failed_logs)} items ({retried_count} succeeded).", retried_count
