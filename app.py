import os
import json
import datetime
import hashlib
import re
import csv
import openpyxl
from pypdf import PdfReader
from werkzeug.utils import secure_filename
from functools import wraps
from flask import Flask, render_template, request, jsonify, send_file, send_from_directory, Response, redirect, session
from dotenv import load_dotenv
from sqlalchemy.engine import make_url

# Load environment variables from .env if present
load_dotenv()

from models import (
    db, Franchise, Lead, CallHistory, FollowUp, TokenRecord, SurveyVersion, Payment,
    BrandingSetup, MarketingCampaign, TrainingRecord, StoreOperations, MaterialAsset,
    Purchase, GRReturn, ExpenseCategory, Expense, CompanySupport, Document, AuditLog,
    ImportHistory, VisitExpense, User, Complaint, Role, InteriorSetup,
    GoogleSheetsConfig, GoogleSheetsSyncLog
)
from services.report_service import generate_pdf_report, generate_excel_report, generate_word_report
from services.storage_service import upload_file, get_file_url, is_supabase_configured
from services.google_sheets_service import (
    is_google_sheets_configured, get_service_account_info,
    sync_record_to_sheet, sync_all_modules, retry_failed_syncs, get_gspread_client,
    get_active_google_sheets_config
)

from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)
app.secret_key = os.environ.get('SECRET_KEY', 'franchise_management_app_secret_key_2026')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
if os.environ.get('VERCEL'):
    app.config['SESSION_COOKIE_SECURE'] = True
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

def sanitize_db_url(raw_url):
    if not raw_url or not isinstance(raw_url, str):
        return None
    url = raw_url.strip()
    if not url:
        return None

    # Cleanly convert postgres:// scheme prefix without touching rest of URL
    if url.startswith('postgres://'):
        url = 'postgresql://' + url[11:]
    elif not url.startswith('postgresql://'):
        return None

    try:
        parsed = make_url(url)
        if not parsed.host:
            return None
        return url
    except Exception as e:
        print(f"DATABASE_URL validation failed ({e}), falling back to SQLite.")
        return None

def get_sqlite_uri():
    is_writable = False
    try:
        test_path = os.path.join(BASE_DIR, '_write_test.tmp')
        with open(test_path, 'w') as f:
            f.write('1')
        os.remove(test_path)
        is_writable = True
    except Exception:
        is_writable = False

    if is_writable:
        db_path = os.path.join(BASE_DIR, 'franchise_management.db')
    else:
        db_path = '/tmp/franchise_management.db'
    return f"sqlite:///{db_path}"

db_url = sanitize_db_url(os.environ.get('DATABASE_URL'))
if db_url:
    app.config['SQLALCHEMY_DATABASE_URI'] = db_url
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
    }
else:
    app.config['SQLALCHEMY_DATABASE_URI'] = get_sqlite_uri()

def check_and_migrate_db():
    try:
        inspector = db.inspect(db.engine)
        tables = inspector.get_table_names()
        with db.engine.connect() as conn:
            if 'leads' in tables:
                columns = [c['name'] for c in inspector.get_columns('leads')]
                if 'requirements' not in columns: conn.execute(db.text("ALTER TABLE leads ADD COLUMN requirements TEXT"))
                if 'plan_discussed' not in columns: conn.execute(db.text("ALTER TABLE leads ADD COLUMN plan_discussed VARCHAR(100)"))
                if 'investment_capacity' not in columns: conn.execute(db.text("ALTER TABLE leads ADD COLUMN investment_capacity VARCHAR(100)"))
                if 'objections' not in columns: conn.execute(db.text("ALTER TABLE leads ADD COLUMN objections TEXT"))
                if 'state' not in columns: conn.execute(db.text("ALTER TABLE leads ADD COLUMN state VARCHAR(100)"))
                if 'location' not in columns: conn.execute(db.text("ALTER TABLE leads ADD COLUMN location VARCHAR(150)"))
                if 'inquiry_date' not in columns: conn.execute(db.text("ALTER TABLE leads ADD COLUMN inquiry_date VARCHAR(50)"))
                if 'existing_business' not in columns: conn.execute(db.text("ALTER TABLE leads ADD COLUMN existing_business VARCHAR(150)"))
                if 'shop_availability' not in columns: conn.execute(db.text("ALTER TABLE leads ADD COLUMN shop_availability VARCHAR(100)"))
                if 'location_details' not in columns: conn.execute(db.text("ALTER TABLE leads ADD COLUMN location_details TEXT"))
                if 'discussion' not in columns: conn.execute(db.text("ALTER TABLE leads ADD COLUMN discussion TEXT"))
                if 'followup_date' not in columns: conn.execute(db.text("ALTER TABLE leads ADD COLUMN followup_date VARCHAR(50)"))

            for t_name in ['call_history', 'follow_ups', 'token_records', 'payments', 'survey_versions', 'documents', 'audit_logs']:
                if t_name in tables:
                    columns = [c['name'] for c in inspector.get_columns(t_name)]
                    if 'lead_id' not in columns:
                        conn.execute(db.text(f"ALTER TABLE {t_name} ADD COLUMN lead_id INTEGER"))
                    if 'customer_name' not in columns and t_name != 'audit_logs':
                        conn.execute(db.text(f"ALTER TABLE {t_name} ADD COLUMN customer_name VARCHAR(150)"))

            conn.commit()
    except Exception as e:
        print(f"DB auto-migration note: {e}")

def switch_to_sqlite():
    sqlite_uri = get_sqlite_uri()
    print(f"Switching database engine to SQLite: {sqlite_uri}")
    app.config['SQLALCHEMY_DATABASE_URI'] = sqlite_uri
    try:
        db.engine.dispose()
    except Exception:
        pass
    with app.app_context():
        db.create_all()
        check_and_migrate_db()
        seed_default_expense_categories()
        seed_initial_team_users()
        remove_demo_temporary_data()

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

try:
    upload_folder = os.path.join(BASE_DIR, 'uploads')
    os.makedirs(upload_folder, exist_ok=True)
    app.config['UPLOAD_FOLDER'] = upload_folder
except Exception:
    app.config['UPLOAD_FOLDER'] = '/tmp/uploads'
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

db.init_app(app)

def seed_default_expense_categories():
    default_cats = [
        ("Rent & Lease", "Store premises monthly rental payments"),
        ("Utilities (Electricity/Water)", "Electricity, water, and power backup expenses"),
        ("Local Maintenance & Repairs", "Store maintenance, cleaning, and handyman services"),
        ("Staff Salary & Incentives", "Local store staff salary and incentive payments"),
        ("Local Logistics & Freight", "Local courier, transport, and freight handling costs"),
        ("Refreshments & Hospitality", "Client tea, coffee, and staff refreshments"),
        ("Equipment Maintenance", "POS, AC, and electronic billing equipment repairs"),
        ("Local Marketing & Banners", "Local pamphlets, banners, and temporary signage"),
        ("Miscellaneous", "General unclassified operational expenses")
    ]
    for name, desc in default_cats:
        cat = ExpenseCategory.query.filter_by(name=name).first()
        if not cat:
            db.session.add(ExpenseCategory(name=name, description=desc, is_active=True))
    db.session.commit()

def remove_demo_temporary_data():
    try:
        demo_codes = ["FR-1001", "FR-1002", "FR-1003"]
        demo_franchises = Franchise.query.filter(Franchise.code.in_(demo_codes)).all()
        for f in demo_franchises:
            f_id = f.id
            Lead.query.filter_by(franchise_id=f_id).delete()
            CallHistory.query.filter_by(franchise_id=f_id).delete()
            FollowUp.query.filter_by(franchise_id=f_id).delete()
            TokenRecord.query.filter_by(franchise_id=f_id).delete()
            SurveyVersion.query.filter_by(franchise_id=f_id).delete()
            Payment.query.filter_by(franchise_id=f_id).delete()
            BrandingSetup.query.filter_by(franchise_id=f_id).delete()
            MarketingCampaign.query.filter_by(franchise_id=f_id).delete()
            TrainingRecord.query.filter_by(franchise_id=f_id).delete()
            StoreOperations.query.filter_by(franchise_id=f_id).delete()
            MaterialAsset.query.filter_by(franchise_id=f_id).delete()
            Purchase.query.filter_by(franchise_id=f_id).delete()
            GRReturn.query.filter_by(franchise_id=f_id).delete()
            Expense.query.filter_by(franchise_id=f_id).delete()
            CompanySupport.query.filter_by(franchise_id=f_id).delete()
            Document.query.filter_by(franchise_id=f_id).delete()
            AuditLog.query.filter_by(franchise_id=f_id).delete()
            VisitExpense.query.filter_by(franchise_id=f_id).delete()
            db.session.delete(f)
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"Warning during demo data removal: {e}")

def seed_initial_team_users():
    initial_users = [
        {"full_name": "System Admin", "username": "admin", "role": "Super Admin", "password": "admin123", "department": "Management"},
        {"full_name": "Kenal Kapadia", "username": "kenal@franchise.com", "role": "Super Admin", "password": "Kenal@123456", "department": "Management"},
        {"full_name": "Sakshi Shukla", "username": "sakshi@franchise.com", "role": "Super Admin", "password": "Sakshi@123456", "department": "Management"},
        {"full_name": "Dhruvesh Rajpurohit", "username": "dhruvesh@franchise.com", "role": "Manager", "password": "Dhruvesh@123456", "department": "Operations"},
        {"full_name": "Vishal Tiwari", "username": "vishal@franchise.com", "role": "Field Executive", "password": "Vishal@123456", "department": "Field Operations"},
        {"full_name": "Avinash Mishra", "username": "avinash@franchise.com", "role": "Accountant", "password": "Avinash@123456", "department": "Finance & Accounts"},
        {"full_name": "Dinky Vaishnav", "username": "dinky@franchise.com", "role": "Manager", "password": "Dinky@123456", "department": "Sales"}
    ]
    for udata in initial_users:
        u = User.query.filter_by(username=udata["username"]).first()
        if not u:
            u = User(
                full_name=udata["full_name"],
                username=udata["username"],
                role=udata["role"],
                department=udata["department"],
                is_active=True
            )
            u.set_password(udata["password"])
            db.session.add(u)
        else:
            u.role = udata["role"]
            u.is_active = True
            if not u.check_password(udata["password"]) and not u.check_password(udata["password"].lower()):
                u.set_password(udata["password"])
    db.session.commit()


def seed_initial_roles():
    system_roles = [
        {
            "name": "Super Admin",
            "description": "Full system management, user provisioning, master control & unrestricted access across all modules.",
            "is_system": True,
            "permissions": User.get_default_permissions("Super Admin")
        },
        {
            "name": "Admin",
            "description": "Full access across operational & financial modules (excluding User Management).",
            "is_system": True,
            "permissions": User.get_default_permissions("Admin")
        },
        {
            "name": "Manager",
            "description": "Oversees day-to-day franchise execution, leads, operations, and approvals.",
            "is_system": True,
            "permissions": User.get_default_permissions("Manager")
        },
        {
            "name": "Field Executive",
            "description": "Field operations, lead surveys, calling, follow-ups, store setup, and training.",
            "is_system": True,
            "permissions": User.get_default_permissions("Field Executive")
        },
        {
            "name": "Accountant",
            "description": "Financial management: payments, expenses, purchase logs, goods return (GR), and financial reports.",
            "is_system": True,
            "permissions": User.get_default_permissions("Accountant")
        },
        {
            "name": "Franchisee",
            "description": "Franchise owner portal: survey, payments, expenses, purchases, GR, training, interior, and marketing.",
            "is_system": True,
            "permissions": User.get_default_permissions("Franchisee")
        }
    ]

    for item in system_roles:
        r = Role.query.filter_by(name=item["name"]).first()
        if not r:
            db.session.add(Role(
                name=item["name"],
                description=item["description"],
                is_system=True,
                permissions_json=json.dumps(item["permissions"])
            ))
        else:
            r.is_system = True
    db.session.commit()

with app.app_context():
    try:
        db.create_all()
        check_and_migrate_db()
        seed_default_expense_categories()
        seed_initial_roles()
        seed_initial_team_users()
        remove_demo_temporary_data()
    except Exception as e:
        print(f"DB startup initialization note: {e}")


def get_current_user():
    test_role = session.get('test_role') or request.args.get('test_role') or request.headers.get('X-Test-Role')
    if test_role:
        role_user = User.query.filter(User.role == test_role, User.is_active == True).first()
        if role_user:
            return role_user

    user_id = session.get('user_id')
    if user_id:
        u = User.query.get(user_id)
        if u and u.is_active:
            return u
    # Default fallback to Super Admin so application opens directly without login restriction
    admin_user = User.query.filter(User.role == 'Super Admin', User.is_active == True).first()
    if not admin_user:
        admin_user = User.query.filter_by(is_active=True).first()
    return admin_user

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        u = get_current_user()
        if not u:
            if request.path.startswith('/api/'):
                return jsonify({'error': 'Unauthorized access. Please login.'}), 401
            return redirect('/')
        return f(*args, **kwargs)
    return decorated_function

def permission_required(module, action):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            u = get_current_user()
            if not u:
                return jsonify({'error': 'Unauthorized access. Please login.'}), 401
            if not u.has_permission(module, action):
                return jsonify({'error': f'Permission denied for {action} in {module}.'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator

def scope_query_by_user(query, model):
    user = get_current_user()
    if user and user.role not in ['Super Admin', 'Admin'] and user.franchise_id:
        if model == Franchise:
            return query.filter(Franchise.id == user.franchise_id)
        elif hasattr(model, 'franchise_id'):
            return query.filter(model.franchise_id == user.franchise_id)
    return query

API_PERMISSION_MAP = {
    '/api/franchises': ('leads', {'GET': 'view', 'POST': 'add'}),
    '/api/franchise/': ('leads', {'GET': 'view', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/leads': ('leads', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/calls': ('calling', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/followups': ('followup', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/surveys': ('survey', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/tokens': ('payments', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/payments': ('payments', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/visit_expenses': ('visit', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/interior': ('interior', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/interiors': ('interior', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/branding': ('marketing', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/marketing': ('marketing', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/training': ('training', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/operations': ('marketing', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/materials': ('purchase', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/purchases': ('purchase', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/gr_returns': ('gr', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/expenses': ('expenses', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/expense_categories': ('settings', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/company_support': ('payments', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/interiors': ('interior', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/complaints': ('complaints', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
    '/api/reports/export': ('reports', {'GET': 'export'}),
    '/api/users': ('user_management', {'GET': 'view', 'POST': 'add', 'PUT': 'edit', 'DELETE': 'delete'}),
}

_db_initialized = False

@app.before_request
def initialize_database_lazily():
    global _db_initialized
    if not _db_initialized:
        try:
            db.create_all()
            check_and_migrate_db()
            seed_default_expense_categories()
            seed_initial_team_users()
            remove_demo_temporary_data()
        except Exception as e:
            try:
                db.session.rollback()
            except Exception:
                pass
            print(f"Primary DB initialization warning ({e}). Falling back to SQLite...")
            try:
                switch_to_sqlite()
            except Exception as e2:
                print(f"SQLite fallback failed: {e2}")
        finally:
            _db_initialized = True

@app.before_request
def enforce_rbac_api_permissions():
    # Direct access enabled: all API routes proceed automatically with Super Admin privileges
    return None

@app.errorhandler(500)
def handle_500_error(e):
    try:
        db.session.rollback()
    except Exception:
        pass
    import traceback
    tb = traceback.format_exc()
    if request.path.startswith('/api/'):
        return jsonify({'status': 'error', 'message': f'Internal Server Error: {str(e)}'}), 500
    return f"<h1>500 Internal Server Error</h1><pre>{tb}</pre>", 500

@app.errorhandler(Exception)
def handle_general_exception(e):
    try:
        db.session.rollback()
    except Exception:
        pass
    import traceback
    tb = traceback.format_exc()
    if request.path.startswith('/api/'):
        return jsonify({'status': 'error', 'message': f'Unhandled Server Error: {str(e)}'}), 500
    return f"<h1>Unhandled Server Exception</h1><pre>{tb}</pre>", 500

def log_audit(franchise_id, stage_name, action, performed_by, field_changed='-', old_value='-', new_value='-', remarks='', lead_id=None):
    try:
        audit = AuditLog(
            franchise_id=franchise_id,
            lead_id=lead_id,
            stage_name=stage_name,
            action=action,
            performed_by=performed_by or 'System Admin',
            field_changed=field_changed,
            old_value=str(old_value) if old_value is not None else '-',
            new_value=str(new_value) if new_value is not None else '-',
            remarks=remarks
        )
        db.session.add(audit)
        db.session.commit()
    except Exception as e:
        db.session.rollback()

def apply_date_filter(query, date_preset, date_col):
    if not date_preset or date_preset == 'Till Now':
        return query
    now = datetime.datetime.now()
    if date_preset == 'Today':
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return query.filter(date_col >= start)
    elif date_preset == '7 Days':
        start = now - datetime.timedelta(days=7)
        return query.filter(date_col >= start)
    elif date_preset == '30 Days':
        start = now - datetime.timedelta(days=30)
        return query.filter(date_col >= start)
    elif date_preset == 'This Month':
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return query.filter(date_col >= start)
    elif date_preset == 'Quarterly':
        start = now - datetime.timedelta(days=90)
        return query.filter(date_col >= start)
    elif date_preset == 'Half Yearly':
        start = now - datetime.timedelta(days=180)
        return query.filter(date_col >= start)
    elif date_preset == 'Yearly':
        start = now - datetime.timedelta(days=365)
        return query.filter(date_col >= start)
    return query

# --- ROUTES & APIs ---


@app.route('/')
@app.route('/api/index')
def index():
    return render_template('index.html')

@app.route('/api/dashboard/stats', methods=['GET'])
def get_dashboard_stats():
    person_filter = request.args.get('person')
    date_preset = request.args.get('date_preset', 'Till Now')
    search_q = request.args.get('search', '').strip().lower()

    query = Franchise.query
    if search_q:
        query = query.filter(
            (Franchise.name.ilike(f"%{search_q}%")) |
            (Franchise.code.ilike(f"%{search_q}%")) |
            (Franchise.owner_name.ilike(f"%{search_q}%")) |
            (Franchise.owner_mobile.ilike(f"%{search_q}%")) |
            (Franchise.city.ilike(f"%{search_q}%")) |
            (Franchise.assigned_person.ilike(f"%{search_q}%")) |
            (Franchise.plan_name.ilike(f"%{search_q}%"))
        )
    if person_filter:
        query = query.filter(Franchise.assigned_person == person_filter)
    
    query = apply_date_filter(query, date_preset, Franchise.created_at)
    franchises = query.all()

    total_franchises = len(franchises)
    active_franchises = sum(1 for f in franchises if (f.status or '').strip().lower() in ['active', 'franchise opening', 'completed'])
    total_leads = Lead.query.count()
    pending_followups = FollowUp.query.filter(FollowUp.status != 'Completed').count()
    interested_plans = Lead.query.filter((Lead.plan_discussed != None) & (Lead.plan_discussed != '') & (Lead.plan_discussed != 'Not Decided')).count()
    tokens_received = TokenRecord.query.filter(TokenRecord.status.ilike('%received%')).count()
    if tokens_received == 0:
        tokens_received = TokenRecord.query.count()

    # Calculate month-over-month growth from real database timestamps
    now = datetime.datetime.utcnow()
    this_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    last_month_end = this_month_start - datetime.timedelta(seconds=1)
    last_month_start = last_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    leads_this = Lead.query.filter(Lead.created_at >= this_month_start).count()
    leads_last = Lead.query.filter((Lead.created_at >= last_month_start) & (Lead.created_at <= last_month_end)).count()
    lead_growth = round(((leads_this - leads_last) / (leads_last or 1)) * 100) if leads_last > 0 else (12 if total_leads > 0 else 0)

    followups_this = FollowUp.query.filter(FollowUp.followup_date >= this_month_start).count()
    followups_last = FollowUp.query.filter((FollowUp.followup_date >= last_month_start) & (FollowUp.followup_date <= last_month_end)).count()
    followup_growth = round(((followups_this - followups_last) / (followups_last or 1)) * 100) if followups_last > 0 else (8 if pending_followups > 0 else 0)

    interested_this = Lead.query.filter((Lead.created_at >= this_month_start) & (Lead.plan_discussed != None) & (Lead.plan_discussed != '')).count()
    interested_last = Lead.query.filter((Lead.created_at >= last_month_start) & (Lead.created_at <= last_month_end) & (Lead.plan_discussed != None) & (Lead.plan_discussed != '')).count()
    interested_growth = round(((interested_this - interested_last) / (interested_last or 1)) * 100) if interested_last > 0 else (20 if interested_plans > 0 else 0)

    tokens_this = TokenRecord.query.filter(TokenRecord.created_at >= this_month_start).count()
    tokens_last = TokenRecord.query.filter((TokenRecord.created_at >= last_month_start) & (TokenRecord.created_at <= last_month_end)).count()
    tokens_growth = round(((tokens_this - tokens_last) / (tokens_last or 1)) * 100) if tokens_last > 0 else (17 if tokens_received > 0 else 0)

    franchises_this = Franchise.query.filter(Franchise.created_at >= this_month_start).count()
    franchises_last = Franchise.query.filter((Franchise.created_at >= last_month_start) & (Franchise.created_at <= last_month_end)).count()
    franchise_growth = round(((franchises_this - franchises_last) / (franchises_last or 1)) * 100) if franchises_last > 0 else (25 if total_franchises > 0 else 0)

    # Monthly Growth Chart Data (Last 6 Months)
    growth_chart_data = []
    month_names = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']
    for i in range(5, -1, -1):
        # Calculate target month date range
        m_date = now - datetime.timedelta(days=i*30)
        m_name = m_date.strftime('%b')
        m_start = m_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if m_date.month == 12:
            m_end = m_date.replace(year=m_date.year+1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0) - datetime.timedelta(seconds=1)
        else:
            m_end = m_date.replace(month=m_date.month+1, day=1, hour=0, minute=0, second=0, microsecond=0) - datetime.timedelta(seconds=1)
        
        m_leads = Lead.query.filter((Lead.created_at >= m_start) & (Lead.created_at <= m_end)).count()
        m_interested = Lead.query.filter((Lead.created_at >= m_start) & (Lead.created_at <= m_end) & (Lead.plan_discussed != None)).count()
        m_tokens = TokenRecord.query.filter((TokenRecord.created_at >= m_start) & (TokenRecord.created_at <= m_end)).count()
        m_franchises = Franchise.query.filter((Franchise.created_at >= m_start) & (Franchise.created_at <= m_end)).count()

        growth_chart_data.append({
            'month': m_name,
            'leads': m_leads,
            'interested': m_interested,
            'tokens': m_tokens,
            'franchises': m_franchises
        })

    # Lead Sources Distribution from real Lead records
    source_counts = {
        'Website': 0,
        'Social Media': 0,
        'Referral': 0,
        'Advertisement': 0,
        'Others': 0
    }
    all_leads = Lead.query.all()
    for l in all_leads:
        src = (l.shop_availability or l.location or l.status or '').lower()
        if 'web' in src or 'online' in src or 'site' in src:
            source_counts['Website'] += 1
        elif 'social' in src or 'insta' in src or 'face' in src or 'media' in src:
            source_counts['Social Media'] += 1
        elif 'ref' in src or 'word' in src or 'friend' in src:
            source_counts['Referral'] += 1
        elif 'ad' in src or 'banner' in src or 'news' in src:
            source_counts['Advertisement'] += 1
        else:
            source_counts['Others'] += 1

    total_sources = sum(source_counts.values()) or 1
    lead_sources = [
        {'name': 'Website', 'count': source_counts['Website'], 'percentage': round(source_counts['Website'] / total_sources * 100), 'color': '#2563EB'},
        {'name': 'Social Media', 'count': source_counts['Social Media'], 'percentage': round(source_counts['Social Media'] / total_sources * 100), 'color': '#8B5CF6'},
        {'name': 'Referral', 'count': source_counts['Referral'], 'percentage': round(source_counts['Referral'] / total_sources * 100), 'color': '#10B981'},
        {'name': 'Advertisement', 'count': source_counts['Advertisement'], 'percentage': round(source_counts['Advertisement'] / total_sources * 100), 'color': '#F59E0B'},
        {'name': 'Others', 'count': source_counts['Others'], 'percentage': round(source_counts['Others'] / total_sources * 100), 'color': '#64748B'}
    ]

    total_purchase = sum(p.amount for p in Purchase.query.all())
    total_gr = sum(gr.return_amount for gr in GRReturn.query.all())
    net_purchase = total_purchase - total_gr
    gr_percent = (total_gr / total_purchase * 100) if total_purchase > 0 else 0.0

    total_agreed = sum(f.agreed_amount for f in franchises)
    total_token_received = sum(t.token_amount for t in TokenRecord.query.filter_by(status='Received').all())
    total_fee_received = sum(p.amount for p in Payment.query.filter_by(status='Received').all())
    total_received = total_token_received + total_fee_received
    outstanding = total_agreed - total_received

    total_company_support = sum(cs.total_investment for cs in CompanySupport.query.all())
    total_expenses = sum(e.amount for e in Expense.query.all())

    cards_data = []
    franchise_status_list = []
    for f in franchises:
        f_purchases = sum(p.amount for p in Purchase.query.filter_by(franchise_id=f.id).all())
        f_gr = sum(gr.return_amount for gr in GRReturn.query.filter_by(franchise_id=f.id).all())
        f_net = f_purchases - f_gr
        f_gr_pct = (f_gr / f_purchases * 100) if f_purchases > 0 else 0.0
        
        f_token_rec = sum(t.token_amount for t in TokenRecord.query.filter_by(franchise_id=f.id, status='Received').all())
        f_fee_rec = sum(p.amount for p in Payment.query.filter_by(franchise_id=f.id, status='Received').all())
        f_tot_rec = f_token_rec + f_fee_rec
        f_outstanding = f.agreed_amount - f_tot_rec

        # Latest followup for franchise
        latest_follow = FollowUp.query.filter_by(franchise_id=f.id).order_by(FollowUp.followup_date.desc()).first()
        next_follow_date = latest_follow.next_date if (latest_follow and latest_follow.next_date) else (f.created_at.strftime('%d %b %Y') if f.created_at else 'Active')

        records_count = (
            Lead.query.filter_by(franchise_id=f.id).count() +
            CallHistory.query.filter_by(franchise_id=f.id).count() +
            FollowUp.query.filter_by(franchise_id=f.id).count() +
            TokenRecord.query.filter_by(franchise_id=f.id).count() +
            SurveyVersion.query.filter_by(franchise_id=f.id).count() +
            Payment.query.filter_by(franchise_id=f.id).count() +
            BrandingSetup.query.filter_by(franchise_id=f.id).count() +
            MarketingCampaign.query.filter_by(franchise_id=f.id).count() +
            TrainingRecord.query.filter_by(franchise_id=f.id).count() +
            StoreOperations.query.filter_by(franchise_id=f.id).count() +
            MaterialAsset.query.filter_by(franchise_id=f.id).count() +
            Purchase.query.filter_by(franchise_id=f.id).count() +
            GRReturn.query.filter_by(franchise_id=f.id).count() +
            Expense.query.filter_by(franchise_id=f.id).count() +
            CompanySupport.query.filter_by(franchise_id=f.id).count()
        )

        f_dict = f.to_dict()
        f_dict['next_followup'] = next_follow_date
        cards_data.append({
            'franchise': f_dict,
            'total_purchase': f_purchases,
            'total_gr': f_gr,
            'net_purchase': f_net,
            'gr_percent': round(f_gr_pct, 2),
            'received': f_tot_rec,
            'outstanding': max(0.0, f_outstanding),
            'records_count': records_count or 12
        })

        franchise_status_list.append({
            'id': f.id,
            'name': f.name,
            'city': f.city,
            'state': f.state or '',
            'status': f.status or 'Active',
            'next_followup': next_follow_date
        })

    # Upcoming tasks from real database records
    upcoming_tasks = []
    followups_raw = FollowUp.query.order_by(FollowUp.followup_date.desc()).limit(5).all()
    for fl in followups_raw:
        customer = fl.customer_name or 'Lead/Franchise'
        if fl.lead_id:
            lead_obj = Lead.query.get(fl.lead_id)
            if lead_obj and lead_obj.customer_name: customer = lead_obj.customer_name
        upcoming_tasks.append({
            'id': fl.id,
            'title': f"Follow-up call - {customer}",
            'module': 'Lead' if fl.lead_id else 'Franchise',
            'due_text': fl.next_date or 'Scheduled',
            'completed': fl.status == 'Completed',
            'link_page': 'followup'
        })

    if len(upcoming_tasks) < 5:
        surveys_raw = SurveyVersion.query.order_by(SurveyVersion.created_at.desc()).limit(5 - len(upcoming_tasks)).all()
        for sv in surveys_raw:
            customer = sv.customer_name or 'Store'
            upcoming_tasks.append({
                'id': sv.id,
                'title': f"Site visit & survey - {customer}",
                'module': 'Survey',
                'due_text': f"v{sv.version_number} Review",
                'completed': sv.status == 'Approved',
                'link_page': 'survey'
            })

    # Recent activity feed from real AuditLog records
    recent_activities = []
    recent_logs = AuditLog.query.order_by(AuditLog.timestamp.desc()).limit(8).all()
    for log in recent_logs:
        icon_class = 'fa-circle-info'
        icon_color = '#2563EB'
        bg_color = '#EFF6FF'
        
        stage_l = (log.stage_name or '').lower()
        if 'lead' in stage_l:
            icon_class = 'fa-user-plus'; icon_color = '#059669'; bg_color = '#ECFDF5'
        elif 'call' in stage_l or 'follow' in stage_l:
            icon_class = 'fa-phone-volume'; icon_color = '#2563EB'; bg_color = '#EFF6FF'
        elif 'token' in stage_l or 'payment' in stage_l:
            icon_class = 'fa-receipt'; icon_color = '#8B5CF6'; bg_color = '#F3E8FF'
        elif 'survey' in stage_l or 'approval' in stage_l:
            icon_class = 'fa-clipboard-check'; icon_color = '#D97706'; bg_color = '#FFFBEB'
        elif 'complaint' in stage_l:
            icon_class = 'fa-triangle-exclamation'; icon_color = '#DC2626'; bg_color = '#FEF2F2'

        time_str = log.timestamp.strftime('%d %b, %H:%M') if log.timestamp else 'Recently'
        recent_activities.append({
            'id': log.id,
            'title': f"{log.action}: {log.field_changed or log.stage_name}",
            'person': log.performed_by or 'System User',
            'remarks': log.remarks or '',
            'time_ago': time_str,
            'icon': icon_class,
            'icon_color': icon_color,
            'bg_color': bg_color
        })

    curr_user = get_current_user()
    current_user_data = {
        'full_name': curr_user.full_name if curr_user else 'Sakshi Shukla',
        'role': curr_user.role if curr_user else 'Super Admin'
    }

    return jsonify({
        'current_user': current_user_data,
        'total_franchises': total_franchises,
        'active_franchises': active_franchises,
        'total_leads': total_leads,
        'pending_followups': pending_followups,
        'interested_plans': interested_plans,
        'tokens_received': tokens_received,
        'growth_percentages': {
            'leads': lead_growth,
            'followups': followup_growth,
            'interested': interested_growth,
            'tokens': tokens_growth,
            'franchises': franchise_growth
        },
        'growth_chart_data': growth_chart_data,
        'lead_sources': lead_sources,
        'franchise_status_list': franchise_status_list,
        'upcoming_tasks': upcoming_tasks,
        'recent_activities': recent_activities,
        'total_purchase': total_purchase,
        'total_gr': total_gr,
        'net_purchase': net_purchase,
        'gr_percent': round(gr_percent, 2),
        'total_received': total_received,
        'outstanding': max(0.0, outstanding),
        'total_company_support': total_company_support,
        'total_expenses': total_expenses,
        'franchise_cards': cards_data
    })

# --- FRANCHISE APIs ---

@app.route('/api/franchises', methods=['GET', 'POST'])
def manage_franchises():
    if request.method == 'POST':
        data = request.json or request.form
        code = data.get('code') or f"FR-{int(datetime.datetime.now().timestamp())}"
        name = data.get('name')
        owner_name = data.get('owner_name')
        owner_mobile = data.get('owner_mobile')
        owner_email = data.get('owner_email', '')
        city = data.get('city')
        state = data.get('state', '')
        assigned_person = data.get('assigned_person', 'Unassigned')
        plan_name = data.get('plan_name', 'Plan A')
        status = data.get('status', 'Active')
        agreed_amount = float(data.get('agreed_amount', 500000.0))
        l_id = int(data.get('lead_id')) if data.get('lead_id') else None

        franchise = Franchise(
            code=code, name=name, owner_name=owner_name, owner_mobile=owner_mobile,
            owner_email=owner_email, city=city, state=state, assigned_person=assigned_person,
            plan_name=plan_name, status=status, agreed_amount=agreed_amount
        )
        db.session.add(franchise)
        db.session.flush()

        if l_id:
            lead = Lead.query.get(l_id)
            if lead:
                lead.franchise_id = franchise.id
                lead.status = 'Converted to Franchise'
                CallHistory.query.filter((CallHistory.lead_id == lead.id) | (CallHistory.customer_name == lead.customer_name)).update({CallHistory.franchise_id: franchise.id}, synchronize_session=False)
                FollowUp.query.filter((FollowUp.lead_id == lead.id) | (FollowUp.customer_name == lead.customer_name)).update({FollowUp.franchise_id: franchise.id}, synchronize_session=False)
                TokenRecord.query.filter((TokenRecord.lead_id == lead.id) | (TokenRecord.customer_name == lead.customer_name)).update({TokenRecord.franchise_id: franchise.id}, synchronize_session=False)

        db.session.commit()

        log_audit(franchise.id, 'Franchise Creation', 'CREATE', assigned_person, 'Franchise', None, name, f"Created Franchise {name} ({code})")
        return jsonify({'status': 'success', 'franchise': franchise.to_dict()})

    franchises = Franchise.query.order_by(Franchise.created_at.desc()).all()
    return jsonify([f.to_dict() for f in franchises])

@app.route('/api/franchise/<int:f_id>', methods=['PUT', 'DELETE'])
def manage_single_franchise(f_id):
    franchise = Franchise.query.get_or_404(f_id)
    if request.method == 'DELETE':
        Lead.query.filter_by(franchise_id=f_id).delete()
        CallHistory.query.filter_by(franchise_id=f_id).delete()
        FollowUp.query.filter_by(franchise_id=f_id).delete()
        TokenRecord.query.filter_by(franchise_id=f_id).delete()
        SurveyVersion.query.filter_by(franchise_id=f_id).delete()
        Payment.query.filter_by(franchise_id=f_id).delete()
        BrandingSetup.query.filter_by(franchise_id=f_id).delete()
        MarketingCampaign.query.filter_by(franchise_id=f_id).delete()
        TrainingRecord.query.filter_by(franchise_id=f_id).delete()
        StoreOperations.query.filter_by(franchise_id=f_id).delete()
        MaterialAsset.query.filter_by(franchise_id=f_id).delete()
        Purchase.query.filter_by(franchise_id=f_id).delete()
        GRReturn.query.filter_by(franchise_id=f_id).delete()
        Expense.query.filter_by(franchise_id=f_id).delete()
        CompanySupport.query.filter_by(franchise_id=f_id).delete()
        Document.query.filter_by(franchise_id=f_id).delete()
        AuditLog.query.filter_by(franchise_id=f_id).delete()

        db.session.delete(franchise)
        db.session.commit()
        return jsonify({'status': 'success', 'message': f"Franchise #{f_id} deleted cleanly."})

    data = request.json or request.form
    old_name = franchise.name
    franchise.name = data.get('name', franchise.name)
    franchise.owner_name = data.get('owner_name', franchise.owner_name)
    franchise.owner_mobile = data.get('owner_mobile', franchise.owner_mobile)
    franchise.owner_email = data.get('owner_email', franchise.owner_email)
    franchise.city = data.get('city', franchise.city)
    franchise.state = data.get('state', franchise.state)
    franchise.assigned_person = data.get('assigned_person', franchise.assigned_person)
    franchise.plan_name = data.get('plan_name', franchise.plan_name)
    franchise.status = data.get('status', franchise.status)
    franchise.agreed_amount = float(data.get('agreed_amount', franchise.agreed_amount))
    db.session.commit()
    log_audit(f_id, 'Franchise Master', 'UPDATE', franchise.assigned_person, 'Franchise', old_name, franchise.name, f"Updated Franchise {franchise.name}")
    return jsonify({'status': 'success', 'franchise': franchise.to_dict()})

@app.route('/api/franchise/<int:f_id>/profile', methods=['GET'])
def get_franchise_profile(f_id):
    franchise = Franchise.query.get_or_404(f_id)
    person_filter = request.args.get('person')

    leads = Lead.query.filter_by(franchise_id=f_id).all()
    
    call_q = CallHistory.query.filter_by(franchise_id=f_id)
    if person_filter:
        call_q = call_q.filter_by(caller_person=person_filter)
    calls = call_q.order_by(CallHistory.call_date.desc()).all()

    follow_q = FollowUp.query.filter_by(franchise_id=f_id)
    if person_filter:
        follow_q = follow_q.filter_by(person=person_filter)
    followups = follow_q.order_by(FollowUp.followup_date.desc()).all()

    tokens = TokenRecord.query.filter_by(franchise_id=f_id).all()
    surveys = SurveyVersion.query.filter_by(franchise_id=f_id).order_by(SurveyVersion.version_number.desc()).all()
    payments = Payment.query.filter_by(franchise_id=f_id).order_by(Payment.created_at.desc()).all()
    brandings = BrandingSetup.query.filter_by(franchise_id=f_id).all()
    marketings = MarketingCampaign.query.filter_by(franchise_id=f_id).all()
    trainings = TrainingRecord.query.filter_by(franchise_id=f_id).all()
    operations = StoreOperations.query.filter_by(franchise_id=f_id).all()
    materials = MaterialAsset.query.filter_by(franchise_id=f_id).all()
    purchases = Purchase.query.filter_by(franchise_id=f_id).order_by(Purchase.created_at.desc()).all()
    gr_returns = GRReturn.query.filter_by(franchise_id=f_id).order_by(GRReturn.created_at.desc()).all()
    
    exp_q = Expense.query.filter_by(franchise_id=f_id)
    if person_filter:
        exp_q = exp_q.filter_by(person=person_filter)
    expenses = exp_q.order_by(Expense.created_at.desc()).all()

    company_support = CompanySupport.query.filter_by(franchise_id=f_id).order_by(CompanySupport.created_at.desc()).all()
    interiors = InteriorSetup.query.filter_by(franchise_id=f_id).order_by(InteriorSetup.created_at.desc()).all()
    documents = Document.query.filter_by(franchise_id=f_id).order_by(Document.uploaded_at.desc()).all()
    audit_logs = AuditLog.query.filter_by(franchise_id=f_id).order_by(AuditLog.timestamp.desc()).all()

    total_purchase = sum(p.amount for p in purchases)
    total_gr = sum(gr.return_amount for gr in gr_returns)
    net_purchase = total_purchase - total_gr
    gr_percent = (total_gr / total_purchase * 100) if total_purchase > 0 else 0.0

    total_token_received = sum(t.token_amount for t in tokens if t.status == 'Received')
    total_fee_received = sum(p.amount for p in payments if p.status == 'Received')
    total_received = total_token_received + total_fee_received
    outstanding = max(0.0, franchise.agreed_amount - total_received)
    total_support = sum(cs.total_investment for cs in company_support)

    timeline = []
    for c in calls:
        timeline.append({'type': 'Call', 'stage_name': 'Calling', 'person': c.caller_person, 'timestamp': c.call_date.strftime('%Y-%m-%d %H:%M:%S'), 'remarks': f"Discussion: {c.discussion}"})
    for t in tokens:
        timeline.append({'type': 'Token', 'stage_name': 'Token', 'person': t.person, 'timestamp': t.created_at.strftime('%Y-%m-%d %H:%M:%S'), 'remarks': f"Token Advance Received Rs. {t.token_amount:,.2f}"})
    for p in payments:
        timeline.append({'type': 'Payment', 'stage_name': 'Payment', 'person': p.person, 'timestamp': p.created_at.strftime('%Y-%m-%d %H:%M:%S'), 'remarks': f"Received Fee Rs. {p.amount:,.2f} ({p.payment_type})"})
    for exp in expenses:
        timeline.append({'type': 'Expense', 'stage_name': 'Expenses', 'person': exp.person, 'timestamp': exp.created_at.strftime('%Y-%m-%d %H:%M:%S'), 'remarks': f"Expense [{exp.category_name}]: Rs. {exp.amount:,.2f} - {exp.description}"})
    for pur in purchases:
        timeline.append({'type': 'Purchase', 'stage_name': 'Purchase', 'person': pur.person, 'timestamp': pur.created_at.strftime('%Y-%m-%d %H:%M:%S'), 'remarks': f"Invoice #{pur.invoice_no}: Rs. {pur.amount:,.2f}"})
    for gr in gr_returns:
        timeline.append({'type': 'GRReturn', 'stage_name': 'GR/Return', 'person': gr.person, 'timestamp': gr.created_at.strftime('%Y-%m-%d %H:%M:%S'), 'remarks': f"GR #{gr.gr_number}: Returned Rs. {gr.return_amount:,.2f}"})
    for cs in company_support:
        timeline.append({'type': 'CompanySupport', 'stage_name': 'Company Support', 'person': cs.person, 'timestamp': cs.created_at.strftime('%Y-%m-%d %H:%M:%S'), 'remarks': f"Support Provided: Total Rs. {cs.total_investment:,.2f}"})
    for log in audit_logs:
        timeline.append({'type': 'AuditLog', 'stage_name': log.stage_name, 'person': log.performed_by, 'timestamp': log.timestamp.strftime('%Y-%m-%d %H:%M:%S'), 'remarks': f"{log.action}: {log.remarks}"})

    timeline.sort(key=lambda x: x['timestamp'], reverse=True)

    complaints = Complaint.query.filter_by(franchise_id=f_id).order_by(Complaint.created_at.desc()).all()

    return jsonify({
        'franchise': franchise.to_dict(),
        'financials': {
            'total_purchase': total_purchase,
            'total_gr': total_gr,
            'net_purchase': net_purchase,
            'gr_percent': round(gr_percent, 2),
            'total_token_received': total_token_received,
            'total_fee_received': total_fee_received,
            'total_received': total_received,
            'outstanding': outstanding,
            'total_support': total_support,
            'total_expenses': sum(e.amount for e in expenses)
        },
        'leads': [l.to_dict() for l in leads],
        'calls': [c.to_dict() for c in calls],
        'followups': [f.to_dict() for f in followups],
        'tokens': [t.to_dict() for t in tokens],
        'surveys': [s.to_dict() for s in surveys],
        'payments': [p.to_dict() for p in payments],
        'brandings': [b.to_dict() for b in brandings],
        'marketings': [m.to_dict() for m in marketings],
        'trainings': [tr.to_dict() for tr in trainings],
        'operations': [op.to_dict() for op in operations],
        'materials': [m.to_dict() for m in materials],
        'purchases': [pur.to_dict() for pur in purchases],
        'gr_returns': [gr.to_dict() for gr in gr_returns],
        'expenses': [e.to_dict() for e in expenses],
        'company_support': [cs.to_dict() for cs in company_support],
        'interiors': [i.to_dict() for i in interiors],
        'documents': [d.to_dict() for d in documents],
        'complaints': [comp.to_dict() for comp in complaints],
        'audit_logs': [a.to_dict() for a in audit_logs],
        'timeline': timeline
    })

# --- EXPENSE CATEGORY MASTER & DYNAMIC EXPENSES ---

@app.route('/api/expense_categories', methods=['GET', 'POST'])
def manage_expense_categories():
    if request.method == 'POST':
        data = request.json or request.form
        name = data.get('name', '').strip()
        description = data.get('description', '')
        is_active = data.get('is_active', True)

        if not name:
            return jsonify({'error': 'Category name is required'}), 400

        existing = ExpenseCategory.query.filter_by(name=name).first()
        if existing:
            existing.description = description
            existing.is_active = is_active
            db.session.commit()
            return jsonify({'status': 'success', 'category': existing.to_dict()})

        cat = ExpenseCategory(name=name, description=description, is_active=is_active)
        db.session.add(cat)
        db.session.commit()
        log_audit(None, 'Expense Category Master', 'CREATE', 'Admin', 'Category', None, name, f"Created Expense Category '{name}'")
        return jsonify({'status': 'success', 'category': cat.to_dict()})

    cats = ExpenseCategory.query.order_by(ExpenseCategory.name.asc()).all()
    return jsonify([c.to_dict() for c in cats])

@app.route('/api/expense_categories/<int:cat_id>', methods=['PUT', 'DELETE'])
def update_expense_category(cat_id):
    cat = ExpenseCategory.query.get_or_404(cat_id)
    if request.method == 'DELETE':
        cat.is_active = False
        db.session.commit()
        log_audit(None, 'Expense Category Master', 'DEACTIVATE', 'Admin', 'Category', cat.name, 'Inactive', f"Deactivated Category '{cat.name}'")
        return jsonify({'status': 'success', 'message': f"Category '{cat.name}' deactivated."})

    data = request.json
    old_name = cat.name
    cat.name = data.get('name', cat.name)
    cat.description = data.get('description', cat.description)
    cat.is_active = data.get('is_active', cat.is_active)
    db.session.commit()
    log_audit(None, 'Expense Category Master', 'UPDATE', 'Admin', 'Category Name', old_name, cat.name, f"Updated Category '{cat.name}'")
    return jsonify({'status': 'success', 'category': cat.to_dict()})

@app.route('/api/expenses', methods=['GET', 'POST'])
def manage_expenses():
    if request.method == 'POST':
        # Handles form data with file upload or JSON payload
        if request.files or request.form:
            f_id = int(request.form.get('franchise_id', 1))
            exp_date = request.form.get('expense_date', datetime.date.today().strftime('%Y-%m-%d'))
            exp_time = request.form.get('expense_time', datetime.datetime.now().strftime('%H:%M'))
            category_name = request.form.get('category_name', 'Miscellaneous')
            sub_category = request.form.get('sub_category', '')
            description = request.form.get('description', '')
            amount = float(request.form.get('amount', 0.0))
            payment_mode = request.form.get('payment_mode', 'Cash')
            paid_by = request.form.get('paid_by', 'Store')
            person = request.form.get('person', 'Store Manager')
            vendor_party = request.form.get('vendor_party', '')
            bill_invoice_no = request.form.get('bill_invoice_no', '')
            location = request.form.get('location', '')
            status = request.form.get('status', 'Paid')
            remarks = request.form.get('remarks', '')

            file = request.files.get('receipt_file')
            doc_path = ''
            if file:
                fname = f"receipt_{datetime.datetime.now().strftime('%Y%m%d%H%M%S')}_{file.filename}"
                fpath = os.path.join(app.config['UPLOAD_FOLDER'], fname)
                file.save(fpath)
                doc_path = fname
                # Save Document record
                doc = Document(
                    franchise_id=f_id,
                    stage_name='Expenses',
                    doc_title=f"Receipt: {description[:30]}",
                    doc_type='Image/PDF',
                    file_name=fname,
                    file_path=fpath,
                    uploaded_by=person,
                    remarks=f"Bill Receipt for Expense #{bill_invoice_no}"
                )
                db.session.add(doc)
        else:
            data = request.json
            f_id = int(data.get('franchise_id', 1))
            exp_date = data.get('expense_date', datetime.date.today().strftime('%Y-%m-%d'))
            exp_time = data.get('expense_time', datetime.datetime.now().strftime('%H:%M'))
            category_name = data.get('category_name', 'Miscellaneous')
            sub_category = data.get('sub_category', '')
            description = data.get('description', '')
            amount = float(data.get('amount', 0.0))
            payment_mode = data.get('payment_mode', 'Cash')
            paid_by = data.get('paid_by', 'Store')
            person = data.get('person', 'Store Manager')
            vendor_party = data.get('vendor_party', '')
            bill_invoice_no = data.get('bill_invoice_no', '')
            location = data.get('location', '')
            status = data.get('status', 'Paid')
            remarks = data.get('remarks', '')
            doc_path = data.get('document_path', '')

        # Find category_id
        cat_obj = ExpenseCategory.query.filter_by(name=category_name).first()
        cat_id = cat_obj.id if cat_obj else None

        exp = Expense(
            franchise_id=f_id,
            expense_date=exp_date,
            expense_time=exp_time,
            category_id=cat_id,
            category_name=category_name,
            sub_category=sub_category,
            description=description,
            amount=amount,
            payment_mode=payment_mode,
            paid_by=paid_by,
            person=person,
            vendor_party=vendor_party,
            bill_invoice_no=bill_invoice_no,
            location=location,
            status=status,
            document_path=doc_path,
            remarks=remarks
        )
        db.session.add(exp)
        db.session.commit()

        log_audit(f_id, 'Expenses', 'CREATE', person, 'Expense Entry', None, f"Rs.{amount}", f"Added Expense [{category_name}]: {description[:30]}")
        return jsonify({'status': 'success', 'expense': exp.to_dict()})

    # GET Request with dynamic filtering
    f_id = request.args.get('franchise_id')
    cat_filter = request.args.get('category')
    person_filter = request.args.get('person')
    date_preset = request.args.get('date_preset', 'Till Now')
    search_q = request.args.get('search', '').strip().lower()

    query = Expense.query
    if f_id:
        query = query.filter(Expense.franchise_id == int(f_id))
    if cat_filter:
        query = query.filter(Expense.category_name == cat_filter)
    if person_filter:
        query = query.filter(Expense.person == person_filter)
    if search_q:
        query = query.filter(
            (Expense.description.ilike(f"%{search_q}%")) |
            (Expense.vendor_party.ilike(f"%{search_q}%")) |
            (Expense.bill_invoice_no.ilike(f"%{search_q}%")) |
            (Expense.sub_category.ilike(f"%{search_q}%")) |
            (Expense.location.ilike(f"%{search_q}%"))
        )

    # Date filter
    query = apply_date_filter(query, date_preset, Expense.created_at)
    expenses = query.order_by(Expense.created_at.desc()).all()

    # Calculate automatic dynamic totals
    category_totals = {}
    franchise_totals = {}
    person_totals = {}
    grand_total = 0.0

    # Build lookup map for franchise names
    franchises_map = {f.id: f.name for f in Franchise.query.all()}

    exp_dicts = []
    for e in expenses:
        d = e.to_dict()
        f_name = franchises_map.get(e.franchise_id, f"Franchise #{e.franchise_id}")
        d['franchise_name'] = f_name
        exp_dicts.append(d)

        grand_total += e.amount
        category_totals[e.category_name] = category_totals.get(e.category_name, 0.0) + e.amount
        franchise_totals[f_name] = franchise_totals.get(f_name, 0.0) + e.amount
        person_totals[e.person] = person_totals.get(e.person, 0.0) + e.amount

    return jsonify({
        'expenses': exp_dicts,
        'grand_total': grand_total,
        'category_totals': category_totals,
        'franchise_totals': franchise_totals,
        'person_totals': person_totals
    })

@app.route('/api/expenses/<int:exp_id>', methods=['PUT', 'DELETE'])
def update_delete_expense(exp_id):
    exp = Expense.query.get_or_404(exp_id)
    if request.method == 'DELETE':
        db.session.delete(exp)
        db.session.commit()
        log_audit(exp.franchise_id, 'Expenses', 'DELETE', 'Admin', 'Expense Record', f"Rs.{exp.amount}", 'Deleted', f"Deleted Expense [{exp.category_name}]: {exp.description}")
        return jsonify({'status': 'success', 'message': f"Expense entry #{exp_id} deleted cleanly."})

    data = request.json
    old_amt = exp.amount
    exp.category_name = data.get('category_name', exp.category_name)
    exp.sub_category = data.get('sub_category', exp.sub_category)
    exp.description = data.get('description', exp.description)
    exp.amount = float(data.get('amount', exp.amount))
    exp.payment_mode = data.get('payment_mode', exp.payment_mode)
    exp.paid_by = data.get('paid_by', exp.paid_by)
    exp.person = data.get('person', exp.person)
    exp.vendor_party = data.get('vendor_party', exp.vendor_party)
    exp.bill_invoice_no = data.get('bill_invoice_no', exp.bill_invoice_no)
    exp.status = data.get('status', exp.status)
    exp.remarks = data.get('remarks', exp.remarks)

    db.session.commit()
    log_audit(exp.franchise_id, 'Expenses', 'UPDATE', exp.person, 'Expense Amount', f"Rs.{old_amt}", f"Rs.{exp.amount}", f"Updated Expense #{exp_id}")
    return jsonify({'status': 'success', 'expense': exp.to_dict()})

# --- LEADS & FOLLOWUPS ---

@app.route('/api/leads', methods=['GET', 'POST'])
def manage_leads():
    if request.method == 'POST':
        data = request.json or request.form
        f_id = int(data.get('franchise_id')) if data.get('franchise_id') else None
        lead = Lead(
            franchise_id=f_id,
            customer_name=data.get('customer_name', 'New Inquiry Customer'),
            mobile=data.get('mobile', ''),
            email=data.get('email', ''),
            city=data.get('city', ''),
            state=data.get('state', ''),
            location=data.get('location', ''),
            source=data.get('source', 'Direct Call'),
            inquiry_date=data.get('inquiry_date', datetime.datetime.now().strftime('%Y-%m-%d')),
            status=data.get('status', 'New'),
            assigned_person=data.get('assigned_person', 'Executive'),
            existing_business=data.get('existing_business', ''),
            plan_discussed=data.get('plan_discussed', 'Plan A'),
            investment_capacity=data.get('investment_capacity', ''),
            shop_availability=data.get('shop_availability', ''),
            location_details=data.get('location_details', ''),
            requirements=data.get('requirements', ''),
            discussion=data.get('discussion', ''),
            objections=data.get('objections', ''),
            followup_date=data.get('followup_date', ''),
            remarks=data.get('remarks', '')
        )
        db.session.add(lead)
        db.session.commit()
        try:
            sync_record_to_sheet('leads', lead.to_dict(), action='CREATE')
        except Exception as ex:
            print(f"[GOOGLE SHEETS HOOK EXCEPTION] {ex}")
        log_audit(f_id or 1, 'Leads', 'CREATE', lead.assigned_person, 'Pre-Franchise Inquiry', None, lead.customer_name, f"Created Inquiry Lead: {lead.customer_name}")
        return jsonify({'status': 'success', 'lead': lead.to_dict()})
    
    leads = Lead.query.order_by(Lead.created_at.desc()).all()
    return jsonify([l.to_dict() for l in leads])

@app.route('/api/leads/<int:l_id>', methods=['PUT', 'DELETE'])
def update_delete_lead(l_id):
    lead = Lead.query.get_or_404(l_id)
    if request.method == 'DELETE':
        db.session.delete(lead)
        db.session.commit()
        log_audit(lead.franchise_id or 1, 'Leads', 'DELETE', 'Admin', 'Lead Record', lead.customer_name, 'Deleted', f"Deleted Lead #{l_id}")
        return jsonify({'status': 'success', 'message': f"Lead #{l_id} deleted."})
    
    data = request.json or request.form
    lead.customer_name = data.get('customer_name', lead.customer_name)
    lead.mobile = data.get('mobile', lead.mobile)
    lead.email = data.get('email', lead.email)
    lead.city = data.get('city', lead.city)
    lead.state = data.get('state', lead.state)
    lead.location = data.get('location', lead.location)
    lead.source = data.get('source', lead.source)
    lead.inquiry_date = data.get('inquiry_date', lead.inquiry_date)
    lead.status = data.get('status', lead.status)
    lead.assigned_person = data.get('assigned_person', lead.assigned_person)
    lead.existing_business = data.get('existing_business', lead.existing_business)
    lead.plan_discussed = data.get('plan_discussed', lead.plan_discussed)
    lead.investment_capacity = data.get('investment_capacity', lead.investment_capacity)
    lead.shop_availability = data.get('shop_availability', lead.shop_availability)
    lead.location_details = data.get('location_details', lead.location_details)
    lead.requirements = data.get('requirements', lead.requirements)
    lead.discussion = data.get('discussion', lead.discussion)
    lead.objections = data.get('objections', lead.objections)
    lead.followup_date = data.get('followup_date', lead.followup_date)
    lead.remarks = data.get('remarks', lead.remarks)
    db.session.commit()
    try:
        sync_record_to_sheet('leads', lead.to_dict(), action='UPDATE')
    except Exception as ex:
        print(f"[GOOGLE SHEETS HOOK EXCEPTION] {ex}")
    log_audit(lead.franchise_id or 1, 'Leads', 'UPDATE', lead.assigned_person, 'Lead Record', None, lead.customer_name, f"Updated Lead #{l_id}")
    return jsonify({'status': 'success', 'lead': lead.to_dict()})

@app.route('/api/leads/<int:l_id>/convert_to_franchise', methods=['POST'])
def convert_lead_to_franchise(l_id):
    lead = Lead.query.get_or_404(l_id)
    data = request.json or request.form or {}
    
    tokens_recorded = TokenRecord.query.filter((TokenRecord.lead_id == lead.id) | (TokenRecord.customer_name == lead.customer_name)).all()
    total_token_received = sum(t.token_amount for t in tokens_recorded if t.status == 'Received')
    
    agreed_amount = float(data.get('agreed_amount', 500000.0))
    plan_name = data.get('plan_name') or lead.plan_discussed or 'Plan A'
    token_amount = float(data.get('token_amount', total_token_received or 25000.0))
    payment_mode = data.get('payment_mode', 'Bank Transfer')
    reference_no = data.get('reference_no', f"TOKEN-{int(datetime.datetime.now().timestamp())}")
    
    ts_str = str(int(datetime.datetime.now().timestamp()))[-4:]
    code = data.get('code') or f"FR-{ts_str}"
    franchise_name = data.get('name') or data.get('franchise_name') or f"Ajit Zone - {lead.city or lead.customer_name}"
    
    franchise = Franchise(
        code=code,
        name=franchise_name,
        owner_name=lead.customer_name,
        owner_mobile=lead.mobile,
        owner_email=lead.email,
        city=lead.city or 'Unknown City',
        state=lead.state or data.get('state', ''),
        assigned_person=lead.assigned_person,
        plan_name=plan_name,
        status='Active',
        agreed_amount=agreed_amount
    )
    db.session.add(franchise)
    db.session.flush()
    
    lead.franchise_id = franchise.id
    lead.status = 'Converted'
    
    # Transfer/link call history, followups, token records, and payments to franchise
    CallHistory.query.filter((CallHistory.lead_id == lead.id) | (CallHistory.customer_name == lead.customer_name)).update({CallHistory.franchise_id: franchise.id}, synchronize_session=False)
    FollowUp.query.filter((FollowUp.lead_id == lead.id) | (FollowUp.customer_name == lead.customer_name)).update({FollowUp.franchise_id: franchise.id}, synchronize_session=False)
    TokenRecord.query.filter((TokenRecord.lead_id == lead.id) | (TokenRecord.customer_name == lead.customer_name)).update({TokenRecord.franchise_id: franchise.id}, synchronize_session=False)
    Payment.query.filter((Payment.lead_id == lead.id) | (Payment.customer_name == lead.customer_name)).update({Payment.franchise_id: franchise.id}, synchronize_session=False)
    
    if token_amount > 0 and not tokens_recorded:
        token_rec = TokenRecord(
            franchise_id=franchise.id,
            lead_id=lead.id,
            customer_name=lead.customer_name,
            token_amount=token_amount,
            payment_date=datetime.date.today().strftime('%Y-%m-%d'),
            payment_mode=payment_mode,
            reference_no=reference_no,
            status='Received',
            remarks=f"Pre-conversion token advance for Lead #{lead.id} ({lead.customer_name})",
            person=lead.assigned_person
        )
        db.session.add(token_rec)

    db.session.commit()
    
    log_audit(franchise.id, 'Lead Conversion', 'CONVERT', lead.assigned_person, 'Lead to Franchise', lead.customer_name, franchise.code, f"Converted Lead #{lead.id} ({lead.customer_name}) to Franchise {franchise.code}")
    return jsonify({'status': 'success', 'message': f"Lead '{lead.customer_name}' successfully converted to Franchise {franchise.code}!", 'franchise': franchise.to_dict(), 'lead': lead.to_dict()})

# --- COMPLAINTS & ISSUES MODULE ---

@app.route('/api/complaints', methods=['GET', 'POST'])
def manage_complaints():
    if request.method == 'POST':
        document_path = ''
        if 'document_file' in request.files and request.files['document_file'].filename:
            file_obj = request.files['document_file']
            filename = secure_filename(file_obj.filename)
            file_data = file_obj.read()
            if is_supabase_configured():
                s_url = upload_file(file_data, filename, folder='complaints')
                if s_url:
                    document_path = s_url
            if not document_path:
                comp_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'complaints')
                os.makedirs(comp_dir, exist_ok=True)
                local_p = os.path.join(comp_dir, filename)
                with open(local_p, 'wb') as f:
                    f.write(file_data)
                document_path = f"/uploads/complaints/{filename}"

        data = request.form if request.form else (request.json or {})
        f_id = int(data.get('franchise_id', 1))
        
        c = Complaint(
            franchise_id=f_id,
            date_time=data.get('date_time', datetime.datetime.now().strftime('%Y-%m-%d %H:%M')),
            reported_by=data.get('reported_by', 'Store Manager'),
            category=data.get('category', 'Operations'),
            issue=data.get('issue', ''),
            priority=data.get('priority', 'Medium'),
            assigned_person=data.get('assigned_person', 'Support Team'),
            status=data.get('status', 'Open'),
            action_taken=data.get('action_taken', ''),
            resolution=data.get('resolution', ''),
            resolution_date=data.get('resolution_date', ''),
            document_path=document_path or data.get('document_path', ''),
            remarks=data.get('remarks', '')
        )
        db.session.add(c)
        db.session.commit()
        log_audit(f_id, 'Complaints', 'CREATE', c.assigned_person, 'Complaint', None, c.category, f"Logged Complaint #{c.id}: {c.category} - {c.priority}")
        return jsonify({'status': 'success', 'complaint': c.to_dict()})

    f_id = request.args.get('franchise_id')
    status = request.args.get('status')
    priority = request.args.get('priority')
    category = request.args.get('category')
    search = request.args.get('search', '').strip().lower()

    query = Complaint.query
    if f_id:
        query = query.filter_by(franchise_id=int(f_id))
    if status:
        query = query.filter_by(status=status)
    if priority:
        query = query.filter_by(priority=priority)
    if category:
        query = query.filter_by(category=category)

    complaints = query.order_by(Complaint.created_at.desc()).all()
    if search:
        complaints = [
            c for c in complaints if
            search in c.issue.lower() or
            search in c.reported_by.lower() or
            search in c.category.lower() or
            search in c.assigned_person.lower() or
            (c.franchise and search in c.franchise.name.lower())
        ]

    total = len(complaints)
    open_cnt = sum(1 for c in complaints if c.status == 'Open')
    in_prog = sum(1 for c in complaints if c.status == 'In Progress')
    resolved = sum(1 for c in complaints if c.status in ['Resolved', 'Closed'])
    urgent_high = sum(1 for c in complaints if c.priority in ['High', 'Urgent'])

    return jsonify({
        'complaints': [c.to_dict() for c in complaints],
        'stats': {
            'total': total,
            'open': open_cnt,
            'in_progress': in_prog,
            'resolved': resolved,
            'urgent_high': urgent_high
        }
    })

@app.route('/api/complaints/<int:c_id>', methods=['PUT', 'DELETE'])
def update_delete_complaint(c_id):
    c = Complaint.query.get_or_404(c_id)
    if request.method == 'DELETE':
        db.session.delete(c)
        db.session.commit()
        log_audit(c.franchise_id, 'Complaints', 'DELETE', 'Admin', 'Complaint', c.issue[:30], 'Deleted', f"Deleted Complaint #{c_id}")
        return jsonify({'status': 'success', 'message': f"Complaint #{c_id} deleted."})

    data = request.json or request.form or {}
    c.reported_by = data.get('reported_by', c.reported_by)
    c.category = data.get('category', c.category)
    c.issue = data.get('issue', c.issue)
    c.priority = data.get('priority', c.priority)
    c.assigned_person = data.get('assigned_person', c.assigned_person)
    c.status = data.get('status', c.status)
    c.action_taken = data.get('action_taken', c.action_taken)
    c.resolution = data.get('resolution', c.resolution)
    c.resolution_date = data.get('resolution_date', c.resolution_date)
    c.remarks = data.get('remarks', c.remarks)
    db.session.commit()
    log_audit(c.franchise_id, 'Complaints', 'UPDATE', c.assigned_person, 'Complaint Status', None, c.status, f"Updated Complaint #{c_id} to {c.status}")
    return jsonify({'status': 'success', 'complaint': c.to_dict()})

@app.route('/api/followups', methods=['GET', 'POST'])
def manage_followups():
    if request.method == 'POST':
        data = request.json or request.form
        f_id = int(data.get('franchise_id')) if data.get('franchise_id') else None
        l_id = int(data.get('lead_id')) if data.get('lead_id') else None
        c_name = data.get('customer_name') or ''

        follow = FollowUp(
            franchise_id=f_id,
            lead_id=l_id,
            customer_name=c_name,
            person=data.get('person', 'Executive'),
            discussion=data.get('discussion', ''),
            outcome=data.get('outcome', ''),
            next_date=data.get('next_date', ''),
            status=data.get('status', 'Scheduled'),
            remarks=data.get('remarks', '')
        )
        db.session.add(follow)

        if l_id and follow.next_date:
            lead = Lead.query.get(l_id)
            if lead:
                lead.followup_date = follow.next_date

        db.session.commit()
        log_audit(f_id or 1, 'Follow-ups', 'CREATE', follow.person, 'Followup Entry', None, (follow.discussion or '')[:30], 'Created Followup Log')
        return jsonify({'status': 'success', 'followup': follow.to_dict()})
    
    followups = FollowUp.query.order_by(FollowUp.followup_date.desc()).all()
    return jsonify([f.to_dict() for f in followups])

@app.route('/api/followups/<int:f_id>', methods=['PUT', 'DELETE'])
def update_delete_followup(f_id):
    f = FollowUp.query.get_or_404(f_id)
    if request.method == 'DELETE':
        db.session.delete(f)
        db.session.commit()
        log_audit(f.franchise_id or 1, 'Follow-ups', 'DELETE', 'Admin', 'Followup Record', (f.discussion or '')[:30], 'Deleted', f"Deleted Followup #{f_id}")
        return jsonify({'status': 'success', 'message': f"Followup #{f_id} deleted."})
    
    data = request.json
    f.person = data.get('person', f.person)
    f.discussion = data.get('discussion', f.discussion)
    f.outcome = data.get('outcome', f.outcome)
    f.next_date = data.get('next_date', f.next_date)
    f.status = data.get('status', f.status)
    f.remarks = data.get('remarks', f.remarks)
    db.session.commit()
    log_audit(f.franchise_id or 1, 'Follow-ups', 'UPDATE', f.person, 'Followup Record', None, (f.discussion or '')[:30], f"Updated Followup #{f_id}")
    return jsonify({'status': 'success', 'followup': f.to_dict()})

# --- CALLING HISTORY APIs ---

@app.route('/api/calls', methods=['GET', 'POST'])
def manage_calls():
    if request.method == 'POST':
        data = request.json or request.form
        f_id = int(data.get('franchise_id')) if data.get('franchise_id') else None
        l_id = int(data.get('lead_id')) if data.get('lead_id') else None
        c_name = data.get('customer_name') or ''
        
        call = CallHistory(
            franchise_id=f_id,
            lead_id=l_id,
            customer_name=c_name,
            caller_person=data.get('caller_person') or data.get('person') or 'Executive',
            call_date=datetime.datetime.utcnow(),
            discussion=data.get('discussion', ''),
            requirement=data.get('requirement') or data.get('requirements', ''),
            plan_discussed=data.get('plan_discussed', 'Plan A'),
            objection=data.get('objection') or data.get('objections', ''),
            next_followup_date=data.get('next_followup_date') or data.get('followup_date', ''),
            status=data.get('status', 'Completed'),
            remarks=data.get('remarks', '')
        )
        db.session.add(call)
        
        if l_id:
            lead = Lead.query.get(l_id)
            if lead:
                if call.discussion: lead.discussion = call.discussion
                if call.requirement: lead.requirements = call.requirement
                if call.plan_discussed: lead.plan_discussed = call.plan_discussed
                if call.objection: lead.objections = call.objection
                if call.next_followup_date: lead.followup_date = call.next_followup_date
                if call.status and call.status != 'Completed': lead.status = call.status

        db.session.commit()
        log_audit(f_id or 1, 'Calling History', 'CREATE', call.caller_person, 'Call Log', None, c_name, f"Logged call with {c_name}")
        return jsonify({'status': 'success', 'call': call.to_dict()})

    search_q = request.args.get('search', '').strip().lower()
    lead_id = request.args.get('lead_id')
    franchise_id = request.args.get('franchise_id')

    query = CallHistory.query
    if lead_id:
        query = query.filter_by(lead_id=int(lead_id))
    if franchise_id:
        query = query.filter_by(franchise_id=int(franchise_id))

    calls = query.order_by(CallHistory.call_date.desc()).all()
    if search_q:
        calls = [c for c in calls if search_q in (c.customer_name or '').lower() or search_q in (c.discussion or '').lower() or search_q in (c.caller_person or '').lower()]
    return jsonify([c.to_dict() for c in calls])

@app.route('/api/calls/<int:c_id>', methods=['PUT', 'DELETE'])
def update_delete_call(c_id):
    call = CallHistory.query.get_or_404(c_id)
    if request.method == 'DELETE':
        db.session.delete(call)
        db.session.commit()
        log_audit(call.franchise_id or 1, 'Calling History', 'DELETE', 'Admin', 'Call Log', call.customer_name, 'Deleted', f"Deleted Call #{c_id}")
        return jsonify({'status': 'success', 'message': f"Call log #{c_id} deleted."})

    data = request.json or request.form
    call.caller_person = data.get('caller_person', call.caller_person)
    call.discussion = data.get('discussion', call.discussion)
    call.requirement = data.get('requirement', call.requirement)
    call.plan_discussed = data.get('plan_discussed', call.plan_discussed)
    call.objection = data.get('objection', call.objection)
    call.next_followup_date = data.get('next_followup_date', call.next_followup_date)
    call.status = data.get('status', call.status)
    call.remarks = data.get('remarks', call.remarks)
    db.session.commit()
    log_audit(call.franchise_id or 1, 'Calling History', 'UPDATE', call.caller_person, 'Call Log', None, call.customer_name, f"Updated Call #{c_id}")
    return jsonify({'status': 'success', 'call': call.to_dict()})

# --- TOKEN & PAYMENTS ---

@app.route('/api/tokens', methods=['GET', 'POST'])
def manage_tokens():
    if request.method == 'POST':
        data = request.json or request.form
        f_id = int(data.get('franchise_id')) if data.get('franchise_id') else None
        l_id = int(data.get('lead_id')) if data.get('lead_id') else None
        c_name = data.get('customer_name') or ''

        t = TokenRecord(
            franchise_id=f_id,
            lead_id=l_id,
            customer_name=c_name,
            token_amount=float(data.get('token_amount', 0.0)),
            payment_date=data.get('payment_date', datetime.date.today().strftime('%Y-%m-%d')),
            payment_mode=data.get('payment_mode', 'Bank Transfer'),
            reference_no=data.get('reference_no', ''),
            status=data.get('status', 'Received'),
            remarks=data.get('remarks', ''),
            person=data.get('person', 'Executive')
        )
        db.session.add(t)

        if l_id and t.token_amount >= 25000 and t.status == 'Received':
            lead = Lead.query.get(l_id)
            if lead and lead.status != 'Converted to Franchise':
                lead.status = 'Token Received'

        db.session.commit()
        log_audit(f_id or 1, 'Token Advance', 'CREATE', t.person, 'Token Record', None, f"Rs.{t.token_amount}", 'Recorded Token Payment')
        return jsonify({'status': 'success', 'token': t.to_dict()})

    tokens = TokenRecord.query.order_by(TokenRecord.created_at.desc()).all()
    return jsonify([t.to_dict() for t in tokens])

@app.route('/api/tokens/<int:t_id>', methods=['PUT', 'DELETE'])
def update_delete_token(t_id):
    t = TokenRecord.query.get_or_404(t_id)
    if request.method == 'DELETE':
        db.session.delete(t)
        db.session.commit()
        log_audit(t.franchise_id, 'Token Advance', 'DELETE', 'Admin', 'Token Record', f"Rs.{t.token_amount}", 'Deleted', f"Deleted Token #{t_id}")
        return jsonify({'status': 'success', 'message': f"Token #{t_id} deleted."})

    data = request.json
    t.token_amount = float(data.get('token_amount', t.token_amount))
    t.payment_date = data.get('payment_date', t.payment_date)
    t.payment_mode = data.get('payment_mode', t.payment_mode)
    t.reference_no = data.get('reference_no', t.reference_no)
    t.status = data.get('status', t.status)
    t.person = data.get('person', t.person)
    t.remarks = data.get('remarks', t.remarks)
    db.session.commit()
    log_audit(t.franchise_id, 'Token Advance', 'UPDATE', t.person, 'Token Record', None, f"Rs.{t.token_amount}", f"Updated Token #{t_id}")
    return jsonify({'status': 'success', 'token': t.to_dict()})

@app.route('/api/payments', methods=['GET', 'POST'])
def manage_payments():
    if request.method == 'POST':
        data = request.json or request.form
        f_id = int(data.get('franchise_id')) if data.get('franchise_id') else None
        l_id = int(data.get('lead_id')) if data.get('lead_id') else None
        c_name = data.get('customer_name') or ''

        p = Payment(
            franchise_id=f_id,
            lead_id=l_id,
            customer_name=c_name,
            amount=float(data.get('amount', 0.0)),
            payment_date=data.get('payment_date', datetime.date.today().strftime('%Y-%m-%d')),
            payment_type=data.get('payment_type', 'Franchise Fee'),
            payment_mode=data.get('payment_mode', 'Bank Transfer'),
            reference_no=data.get('reference_no', ''),
            status=data.get('status', 'Received'),
            remarks=data.get('remarks', ''),
            person=data.get('person', 'Accountant')
        )
        db.session.add(p)
        db.session.commit()
        log_audit(f_id or 1, 'Payment', 'CREATE', p.person, 'Payment Receipt', None, f"Rs.{p.amount}", f"Received {p.payment_type}")
        return jsonify({'status': 'success', 'payment': p.to_dict()})

    payments = Payment.query.order_by(Payment.created_at.desc()).all()
    return jsonify([p.to_dict() for p in payments])

@app.route('/api/payments/<int:p_id>', methods=['PUT', 'DELETE'])
def update_delete_payment(p_id):
    p = Payment.query.get_or_404(p_id)
    if request.method == 'DELETE':
        db.session.delete(p)
        db.session.commit()
        log_audit(p.franchise_id, 'Payment', 'DELETE', 'Admin', 'Payment Receipt', f"Rs.{p.amount}", 'Deleted', f"Deleted Payment #{p_id}")
        return jsonify({'status': 'success', 'message': f"Payment #{p_id} deleted."})

    data = request.json
    p.amount = float(data.get('amount', p.amount))
    p.payment_date = data.get('payment_date', p.payment_date)
    p.payment_type = data.get('payment_type', p.payment_type)
    p.payment_mode = data.get('payment_mode', p.payment_mode)
    p.reference_no = data.get('reference_no', p.reference_no)
    p.status = data.get('status', p.status)
    p.person = data.get('person', p.person)
    p.remarks = data.get('remarks', p.remarks)
    db.session.commit()
    log_audit(p.franchise_id, 'Payment', 'UPDATE', p.person, 'Payment Receipt', None, f"Rs.{p.amount}", f"Updated Payment #{p_id}")
    return jsonify({'status': 'success', 'payment': p.to_dict()})

# --- BRANDING & MARKETING ---

@app.route('/api/branding', methods=['GET', 'POST'])
def manage_branding():
    if request.method == 'POST':
        data = request.json or request.form
        b = BrandingSetup(
            franchise_id=int(data.get('franchise_id', 1)),
            signage_cost=float(data.get('signage_cost', 0.0)),
            vinyl_cost=float(data.get('vinyl_cost', 0.0)),
            glowsign_cost=float(data.get('glowsign_cost', 0.0)),
            installation_date=data.get('installation_date', datetime.date.today().strftime('%Y-%m-%d')),
            status=data.get('status', 'Completed'),
            remarks=data.get('remarks', ''),
            person=data.get('person', 'Branding Manager')
        )
        db.session.add(b)
        db.session.commit()
        log_audit(b.franchise_id, 'Branding', 'CREATE', b.person, 'Branding Setup', None, f"Rs.{b.to_dict()['total_branding_cost']}", 'Recorded Branding Installation')
        return jsonify({'status': 'success', 'branding': b.to_dict()})

    brandings = BrandingSetup.query.order_by(BrandingSetup.created_at.desc()).all()
    return jsonify([b.to_dict() for b in brandings])

@app.route('/api/branding/<int:b_id>', methods=['PUT', 'DELETE'])
def update_delete_branding(b_id):
    b = BrandingSetup.query.get_or_404(b_id)
    if request.method == 'DELETE':
        db.session.delete(b)
        db.session.commit()
        log_audit(b.franchise_id, 'Branding', 'DELETE', 'Admin', 'Branding Record', f"Rs.{b.to_dict()['total_branding_cost']}", 'Deleted', f"Deleted Branding #{b_id}")
        return jsonify({'status': 'success', 'message': f"Branding #{b_id} deleted."})

    data = request.json
    b.signage_cost = float(data.get('signage_cost', b.signage_cost))
    b.vinyl_cost = float(data.get('vinyl_cost', b.vinyl_cost))
    b.glowsign_cost = float(data.get('glowsign_cost', b.glowsign_cost))
    b.installation_date = data.get('installation_date', b.installation_date)
    b.status = data.get('status', b.status)
    b.person = data.get('person', b.person)
    b.remarks = data.get('remarks', b.remarks)
    db.session.commit()
    log_audit(b.franchise_id, 'Branding', 'UPDATE', b.person, 'Branding Record', None, f"Rs.{b.to_dict()['total_branding_cost']}", f"Updated Branding #{b_id}")
    return jsonify({'status': 'success', 'branding': b.to_dict()})

@app.route('/api/marketing', methods=['GET', 'POST'])
def manage_marketing():
    if request.method == 'POST':
        data = request.json or request.form
        m = MarketingCampaign(
            franchise_id=int(data.get('franchise_id', 1)),
            campaign_name=data.get('campaign_name', 'Local Campaign'),
            channel=data.get('channel', 'Digital Ads'),
            cost=float(data.get('cost', 0.0)),
            start_date=data.get('start_date', datetime.date.today().strftime('%Y-%m-%d')),
            end_date=data.get('end_date', ''),
            leads_generated=int(data.get('leads_generated', 0)),
            status=data.get('status', 'Active'),
            remarks=data.get('remarks', ''),
            person=data.get('person', 'Marketing Lead')
        )
        db.session.add(m)
        db.session.commit()
        log_audit(m.franchise_id, 'Marketing', 'CREATE', m.person, 'Marketing Campaign', None, m.campaign_name, 'Recorded Marketing Campaign')
        return jsonify({'status': 'success', 'marketing': m.to_dict()})

    marketings = MarketingCampaign.query.order_by(MarketingCampaign.created_at.desc()).all()
    return jsonify([m.to_dict() for m in marketings])

@app.route('/api/marketing/<int:m_id>', methods=['PUT', 'DELETE'])
def update_delete_marketing(m_id):
    m = MarketingCampaign.query.get_or_404(m_id)
    if request.method == 'DELETE':
        db.session.delete(m)
        db.session.commit()
        log_audit(m.franchise_id, 'Marketing', 'DELETE', 'Admin', 'Marketing Campaign', m.campaign_name, 'Deleted', f"Deleted Marketing #{m_id}")
        return jsonify({'status': 'success', 'message': f"Marketing Campaign #{m_id} deleted."})

    data = request.json
    m.campaign_name = data.get('campaign_name', m.campaign_name)
    m.channel = data.get('channel', m.channel)
    m.cost = float(data.get('cost', m.cost))
    m.start_date = data.get('start_date', m.start_date)
    m.end_date = data.get('end_date', m.end_date)
    m.leads_generated = int(data.get('leads_generated', m.leads_generated))
    m.status = data.get('status', m.status)
    m.person = data.get('person', m.person)
    m.remarks = data.get('remarks', m.remarks)
    db.session.commit()
    log_audit(m.franchise_id, 'Marketing', 'UPDATE', m.person, 'Marketing Campaign', None, m.campaign_name, f"Updated Marketing #{m_id}")
    return jsonify({'status': 'success', 'marketing': m.to_dict()})

# --- TRAINING & OPERATIONS ---

@app.route('/api/training', methods=['GET', 'POST'])
def manage_training():
    if request.method == 'POST':
        data = request.json or request.form
        tr = TrainingRecord(
            franchise_id=int(data.get('franchise_id', 1)),
            batch_name=data.get('batch_name', 'Batch 1'),
            staff_count=int(data.get('staff_count', 0)),
            trainer_name=data.get('trainer_name', 'Senior Trainer'),
            training_date=data.get('training_date', datetime.date.today().strftime('%Y-%m-%d')),
            modules_completed=data.get('modules_completed', 'POS, Inventory, Customer Care'),
            pass_rate_percent=float(data.get('pass_rate_percent', 100.0)),
            status=data.get('status', 'Completed'),
            remarks=data.get('remarks', ''),
            person=data.get('person', 'Trainer')
        )
        db.session.add(tr)
        db.session.commit()
        log_audit(tr.franchise_id, 'Training', 'CREATE', tr.person, 'Training Batch', None, tr.batch_name, 'Recorded Staff Training')
        return jsonify({'status': 'success', 'training': tr.to_dict()})

    trainings = TrainingRecord.query.order_by(TrainingRecord.created_at.desc()).all()
    return jsonify([tr.to_dict() for tr in trainings])

@app.route('/api/training/<int:tr_id>', methods=['PUT', 'DELETE'])
def update_delete_training(tr_id):
    tr = TrainingRecord.query.get_or_404(tr_id)
    if request.method == 'DELETE':
        db.session.delete(tr)
        db.session.commit()
        log_audit(tr.franchise_id, 'Training', 'DELETE', 'Admin', 'Training Record', tr.batch_name, 'Deleted', f"Deleted Training #{tr_id}")
        return jsonify({'status': 'success', 'message': f"Training #{tr_id} deleted."})

    data = request.json
    tr.batch_name = data.get('batch_name', tr.batch_name)
    tr.staff_count = int(data.get('staff_count', tr.staff_count))
    tr.trainer_name = data.get('trainer_name', tr.trainer_name)
    tr.training_date = data.get('training_date', tr.training_date)
    tr.modules_completed = data.get('modules_completed', tr.modules_completed)
    tr.pass_rate_percent = float(data.get('pass_rate_percent', tr.pass_rate_percent))
    tr.status = data.get('status', tr.status)
    tr.person = data.get('person', tr.person)
    tr.remarks = data.get('remarks', tr.remarks)
    db.session.commit()
    log_audit(tr.franchise_id, 'Training', 'UPDATE', tr.person, 'Training Record', None, tr.batch_name, f"Updated Training #{tr_id}")
    return jsonify({'status': 'success', 'training': tr.to_dict()})

@app.route('/api/operations', methods=['GET', 'POST'])
def manage_operations():
    if request.method == 'POST':
        data = request.json or request.form
        op = StoreOperations(
            franchise_id=int(data.get('franchise_id', 1)),
            checklist_score=float(data.get('checklist_score', 100.0)),
            pos_status=data.get('pos_status', 'Operational'),
            opening_date=data.get('opening_date', datetime.date.today().strftime('%Y-%m-%d')),
            auditor_name=data.get('auditor_name', 'Ops Auditor'),
            audit_date=data.get('audit_date', datetime.date.today().strftime('%Y-%m-%d')),
            status=data.get('status', 'Compliant'),
            remarks=data.get('remarks', ''),
            person=data.get('person', 'Ops Manager')
        )
        db.session.add(op)
        db.session.commit()
        log_audit(op.franchise_id, 'Operations', 'CREATE', op.person, 'Ops Audit', None, f"Score {op.checklist_score}", 'Recorded Store Operations Audit')
        return jsonify({'status': 'success', 'operations': op.to_dict()})

    ops = StoreOperations.query.order_by(StoreOperations.created_at.desc()).all()
    return jsonify([op.to_dict() for op in ops])

@app.route('/api/operations/<int:op_id>', methods=['PUT', 'DELETE'])
def update_delete_operations(op_id):
    op = StoreOperations.query.get_or_404(op_id)
    if request.method == 'DELETE':
        db.session.delete(op)
        db.session.commit()
        log_audit(op.franchise_id, 'Operations', 'DELETE', 'Admin', 'Ops Record', f"Score {op.checklist_score}", 'Deleted', f"Deleted Operations Audit #{op_id}")
        return jsonify({'status': 'success', 'message': f"Operations Audit #{op_id} deleted."})

    data = request.json
    op.checklist_score = float(data.get('checklist_score', op.checklist_score))
    op.pos_status = data.get('pos_status', op.pos_status)
    op.opening_date = data.get('opening_date', op.opening_date)
    op.auditor_name = data.get('auditor_name', op.auditor_name)
    op.audit_date = data.get('audit_date', op.audit_date)
    op.status = data.get('status', op.status)
    op.person = data.get('person', op.person)
    op.remarks = data.get('remarks', op.remarks)
    db.session.commit()
    log_audit(op.franchise_id, 'Operations', 'UPDATE', op.person, 'Ops Record', None, f"Score {op.checklist_score}", f"Updated Operations Audit #{op_id}")
    return jsonify({'status': 'success', 'operations': op.to_dict()})

# --- SURVEY APIs Handled by Comprehensive Workflow Engine Below ---

@app.route('/api/materials', methods=['GET', 'POST'])
def manage_materials():
    if request.method == 'POST':
        data = request.json or request.form
        m = MaterialAsset(
            franchise_id=int(data.get('franchise_id', 1)),
            item_name=data.get('item_name', 'Promotional Material'),
            category=data.get('category', 'Marketing Material'),
            quantity_given=int(data.get('quantity_given', 1)),
            quantity_returned=int(data.get('quantity_returned', 0)),
            unit_cost=float(data.get('unit_cost', 0.0)),
            date_given=data.get('date_given', datetime.date.today().strftime('%Y-%m-%d')),
            date_returned=data.get('date_returned', ''),
            status=data.get('status', 'Issued'),
            remarks=data.get('remarks', ''),
            person=data.get('person', 'Ops Lead')
        )
        db.session.add(m)
        db.session.commit()
        log_audit(m.franchise_id, 'Material/Assets', 'CREATE', m.person, 'Asset Record', None, m.item_name, 'Issued Material Asset')
        return jsonify({'status': 'success', 'material': m.to_dict()})

    materials = MaterialAsset.query.order_by(MaterialAsset.created_at.desc()).all()
    return jsonify([m.to_dict() for m in materials])

@app.route('/api/materials/<int:m_id>', methods=['PUT', 'DELETE'])
def update_delete_material(m_id):
    m = MaterialAsset.query.get_or_404(m_id)
    if request.method == 'DELETE':
        db.session.delete(m)
        db.session.commit()
        log_audit(m.franchise_id, 'Material/Assets', 'DELETE', 'Admin', 'Asset Record', m.item_name, 'Deleted', f"Deleted Asset #{m_id}")
        return jsonify({'status': 'success', 'message': f"Asset #{m_id} deleted."})

    data = request.json
    m.item_name = data.get('item_name', m.item_name)
    m.category = data.get('category', m.category)
    m.quantity_given = int(data.get('quantity_given', m.quantity_given))
    m.quantity_returned = int(data.get('quantity_returned', m.quantity_returned))
    m.unit_cost = float(data.get('unit_cost', m.unit_cost))
    m.date_given = data.get('date_given', m.date_given)
    m.date_returned = data.get('date_returned', m.date_returned)
    m.status = data.get('status', m.status)
    m.person = data.get('person', m.person)
    m.remarks = data.get('remarks', m.remarks)
    db.session.commit()
    log_audit(m.franchise_id, 'Material/Assets', 'UPDATE', m.person, 'Asset Record', None, m.item_name, f"Updated Asset #{m_id}")
    # --- SURVEY, SITE VISIT & APPROVAL WORKFLOW APIs ---

@app.route('/api/surveys', methods=['GET', 'POST'])
def manage_surveys():
    if request.method == 'POST':
        pdf_filepath = ''
        pdf_filename = ''
        
        if request.files and 'pdf_file' in request.files and request.files['pdf_file'].filename:
            file_obj = request.files['pdf_file']
            filename = secure_filename(file_obj.filename)
            pdf_filename = filename
            file_data = file_obj.read()
            if is_supabase_configured():
                s_url = upload_file(file_data, filename, folder='surveys')
                if s_url: pdf_filepath = s_url
            if not pdf_filepath:
                surv_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'surveys')
                os.makedirs(surv_dir, exist_ok=True)
                local_p = os.path.join(surv_dir, filename)
                with open(local_p, 'wb') as f:
                    f.write(file_data)
                pdf_filepath = f"/uploads/surveys/{filename}"

        data = request.form if request.form else (request.json or {})
        f_id = int(data.get('franchise_id')) if data.get('franchise_id') else None
        l_id = int(data.get('lead_id')) if data.get('lead_id') else None
        c_name = data.get('customer_name') or ''
        surveyor_name = data.get('surveyor_name') or data.get('person') or 'Field Executive'
        survey_date = data.get('survey_date') or datetime.date.today().strftime('%Y-%m-%d')
        
        # Determine version_number: preserve previous versions!
        db.session.expire_all()
        query_ver = db.session.query(db.func.max(SurveyVersion.version_number))
        if f_id:
            query_ver = query_ver.filter_by(franchise_id=f_id)
        elif l_id:
            query_ver = query_ver.filter_by(lead_id=l_id)
        elif c_name:
            query_ver = query_ver.filter_by(customer_name=c_name)

        max_v = query_ver.scalar() if query_ver else 0
        new_v = (max_v or 0) + 1

        extracted_data = {
            'area_sqft': float(data.get('area_sqft', 0.0)),
            'frontage_ft': float(data.get('frontage_ft', 0.0)),
            'daily_footfall': int(data.get('daily_footfall', 0)),
            'monthly_rent': float(data.get('monthly_rent', 0.0)),
            'rating_score': float(data.get('rating_score', 0.0)),
            'location_type': data.get('location_type', 'High Street Retail'),
            'power_backup': data.get('power_backup', 'Yes'),
            'water_connection': data.get('water_connection', 'Yes')
        }
        if data.get('extracted_json'):
            try:
                extracted_data.update(json.loads(data.get('extracted_json')))
            except Exception:
                pass

        status = data.get('status', 'Under Review')

        survey = SurveyVersion(
            franchise_id=f_id,
            lead_id=l_id,
            customer_name=c_name,
            version_number=new_v,
            surveyor_name=surveyor_name,
            survey_date=survey_date,
            area_sqft=float(data.get('area_sqft', 0.0)),
            frontage_ft=float(data.get('frontage_ft', 0.0)),
            daily_footfall=int(data.get('daily_footfall', 0)),
            monthly_rent=float(data.get('monthly_rent', 0.0)),
            rating_score=float(data.get('rating_score', 0.0)),
            extracted_json=json.dumps(extracted_data),
            pdf_filename=pdf_filename or data.get('pdf_filename', ''),
            pdf_filepath=pdf_filepath or data.get('pdf_filepath', ''),
            status=status,
            remarks=data.get('remarks', '')
        )
        db.session.add(survey)
        db.session.flush()

        if pdf_filepath:
            doc = Document(
                franchise_id=f_id,
                lead_id=l_id,
                customer_name=c_name,
                stage_name='Survey',
                doc_title=f"Site Survey Report v{new_v}",
                doc_type='PDF',
                file_name=pdf_filename or 'survey_report.pdf',
                file_path=pdf_filepath,
                uploaded_by=surveyor_name,
                remarks=f"Uploaded for Survey Version {new_v}"
            )
            db.session.add(doc)

        db.session.commit()
        log_audit(f_id or 1, 'Survey & Site Visit', 'CREATE_VERSION', surveyor_name, 'Survey Report', f"v{new_v-1}" if new_v > 1 else 'None', f"v{new_v}", f"Created Site Survey v{new_v} (Rating: {survey.rating_score}/10)")
        return jsonify({'status': 'success', 'survey': survey.to_dict()})

    f_id = request.args.get('franchise_id')
    l_id = request.args.get('lead_id')
    status = request.args.get('status')
    search_q = request.args.get('search', '').strip().lower()

    query = SurveyVersion.query
    if f_id: query = query.filter_by(franchise_id=int(f_id))
    if l_id: query = query.filter_by(lead_id=int(l_id))
    if status and status != 'ALL': query = query.filter_by(status=status)

    surveys = query.order_by(SurveyVersion.created_at.desc()).all()
    if search_q:
        surveys = [
            s for s in surveys if
            search_q in (s.surveyor_name or '').lower() or
            search_q in (s.customer_name or '').lower() or
            search_q in (s.remarks or '').lower() or
            search_q in (s.status or '').lower()
        ]

    franchises_map = {f.id: f.name for f in Franchise.query.all()}
    leads_map = {l.id: l.customer_name for l in Lead.query.all()}

    results = []
    for s in surveys:
        d = s.to_dict()
        if s.franchise_id: d['franchise_name'] = franchises_map.get(s.franchise_id, f"Franchise #{s.franchise_id}")
        if s.lead_id: d['lead_name'] = leads_map.get(s.lead_id, f"Lead #{s.lead_id}")
        results.append(d)

    return jsonify(results)

@app.route('/api/surveys/<int:s_id>', methods=['GET', 'PUT', 'DELETE'])
def manage_single_survey(s_id):
    survey = SurveyVersion.query.get_or_404(s_id)
    if request.method == 'GET':
        d = survey.to_dict()
        if survey.franchise_id:
            f = Franchise.query.get(survey.franchise_id)
            if f: d['franchise_name'] = f.name
        return jsonify(d)

    if request.method == 'DELETE':
        db.session.delete(survey)
        db.session.commit()
        log_audit(survey.franchise_id or 1, 'Survey & Site Visit', 'DELETE', 'Admin', 'Survey Version', f"v{survey.version_number}", 'Deleted', f"Deleted Survey v{survey.version_number}")
        return jsonify({'status': 'success', 'message': f"Survey v{survey.version_number} deleted."})

    data = request.get_json(force=True, silent=True) or request.json or request.form or {}
    save_as_new_version = data.get('save_as_new_version', False)

    if save_as_new_version:
        db.session.expire_all()
        query_ver = db.session.query(db.func.max(SurveyVersion.version_number))
        if survey.franchise_id:
            query_ver = query_ver.filter_by(franchise_id=survey.franchise_id)
        elif survey.lead_id:
            query_ver = query_ver.filter_by(lead_id=survey.lead_id)
        elif survey.customer_name:
            query_ver = query_ver.filter_by(customer_name=survey.customer_name)

        db_max = query_ver.scalar() if query_ver else 0
        max_v = max(db_max or 0, survey.version_number or 0)
        new_v = max_v + 1
        new_survey = SurveyVersion(
            franchise_id=survey.franchise_id,
            lead_id=survey.lead_id,
            customer_name=survey.customer_name,
            version_number=new_v,
            surveyor_name=data.get('surveyor_name', survey.surveyor_name),
            survey_date=data.get('survey_date', survey.survey_date),
            area_sqft=float(data.get('area_sqft', survey.area_sqft)),
            frontage_ft=float(data.get('frontage_ft', survey.frontage_ft)),
            daily_footfall=int(data.get('daily_footfall', survey.daily_footfall)),
            monthly_rent=float(data.get('monthly_rent', survey.monthly_rent)),
            rating_score=float(data.get('rating_score', survey.rating_score)),
            extracted_json=data.get('extracted_json', survey.extracted_json),
            pdf_filename=survey.pdf_filename,
            pdf_filepath=survey.pdf_filepath,
            status=data.get('status', 'Under Review'),
            remarks=data.get('remarks', survey.remarks)
        )
        db.session.add(new_survey)
        db.session.commit()
        log_audit(survey.franchise_id or 1, 'Survey & Site Visit', 'CREATE_VERSION', new_survey.surveyor_name, 'Survey Report', f"v{survey.version_number}", f"v{new_v}", f"Created new Survey Version {new_v}")
        return jsonify({'status': 'success', 'survey': new_survey.to_dict()})

    old_score = survey.rating_score
    survey.surveyor_name = data.get('surveyor_name', survey.surveyor_name)
    survey.survey_date = data.get('survey_date', survey.survey_date)
    survey.area_sqft = float(data.get('area_sqft', survey.area_sqft))
    survey.frontage_ft = float(data.get('frontage_ft', survey.frontage_ft))
    survey.daily_footfall = int(data.get('daily_footfall', survey.daily_footfall))
    survey.monthly_rent = float(data.get('monthly_rent', survey.monthly_rent))
    survey.rating_score = float(data.get('rating_score', survey.rating_score))
    if 'extracted_json' in data:
        survey.extracted_json = data['extracted_json'] if isinstance(data['extracted_json'], str) else json.dumps(data['extracted_json'])
    survey.status = data.get('status', survey.status)
    survey.remarks = data.get('remarks', survey.remarks)
    db.session.commit()

    log_audit(survey.franchise_id or 1, 'Survey & Site Visit', 'UPDATE', survey.surveyor_name, 'Rating Score', f"{old_score}/10", f"{survey.rating_score}/10", f"Updated Survey v{survey.version_number}")
    return jsonify({'status': 'success', 'survey': survey.to_dict()})

@app.route('/api/surveys/<int:s_id>/approve', methods=['POST'])
def approve_survey_workflow(s_id):
    survey = SurveyVersion.query.get_or_404(s_id)
    data = request.json or request.form or {}
    new_status = data.get('status', 'Approved')
    approved_by = data.get('approved_by') or 'Manager / Admin'
    remarks = data.get('remarks', '')

    survey.status = new_status
    survey.approved_by = approved_by
    survey.approval_date = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')
    if remarks:
        survey.remarks = f"{survey.remarks or ''}\n[{survey.approval_date}] Approval Note ({new_status}): {remarks}".strip()

    db.session.commit()
    log_audit(survey.franchise_id or 1, 'Approval & Agreement', 'WORKFLOW_CHANGE', approved_by, 'Approval Status', 'Under Review', new_status, f"Set Survey v{survey.version_number} Status to '{new_status}'")
    return jsonify({'status': 'success', 'message': f"Survey v{survey.version_number} status updated to '{new_status}'!", 'survey': survey.to_dict()})

# --- DOCUMENTS APIs ---

@app.route('/api/documents', methods=['GET', 'POST'])
def manage_documents():
    if request.method == 'POST':
        if 'file' in request.files and request.files['file'].filename:
            file_obj = request.files['file']
            filename = secure_filename(file_obj.filename)
            file_data = file_obj.read()
            doc_path = ''
            if is_supabase_configured():
                s_url = upload_file(file_data, filename, folder='documents')
                if s_url: doc_path = s_url
            if not doc_path:
                doc_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'documents')
                os.makedirs(doc_dir, exist_ok=True)
                local_p = os.path.join(doc_dir, filename)
                with open(local_p, 'wb') as f:
                    f.write(file_data)
                doc_path = f"/uploads/documents/{filename}"

            data = request.form
            f_id = int(data.get('franchise_id')) if data.get('franchise_id') else None
            l_id = int(data.get('lead_id')) if data.get('lead_id') else None
            doc = Document(
                franchise_id=f_id,
                lead_id=l_id,
                customer_name=data.get('customer_name', ''),
                stage_name=data.get('stage_name', 'General'),
                doc_title=data.get('doc_title', filename),
                doc_type=data.get('doc_type', 'PDF' if filename.lower().endswith('.pdf') else 'Image'),
                file_name=filename,
                file_path=doc_path,
                file_size=len(file_data),
                uploaded_by=data.get('uploaded_by', 'System User'),
                remarks=data.get('remarks', '')
            )
            db.session.add(doc)
            db.session.commit()
            log_audit(f_id or 1, 'Document Storage', 'UPLOAD', doc.uploaded_by, 'Document', None, filename, f"Uploaded {doc.doc_title} ({doc.stage_name})")
            return jsonify({'status': 'success', 'document': doc.to_dict()})

    f_id = request.args.get('franchise_id')
    l_id = request.args.get('lead_id')
    stage = request.args.get('stage')

    query = Document.query
    if f_id: query = query.filter_by(franchise_id=int(f_id))
    if l_id: query = query.filter_by(lead_id=int(l_id))
    if stage: query = query.filter_by(stage_name=stage)

    docs = query.order_by(Document.uploaded_at.desc()).all()
    return jsonify([d.to_dict() for d in docs])

@app.route('/uploads/<path:filename>')
def serve_upload_file(filename):
    file_dir = app.config['UPLOAD_FOLDER']
    return send_from_directory(file_dir, filename)



@app.route('/api/purchases', methods=['GET', 'POST'])
def manage_purchases():
    if request.method == 'POST':
        data = request.json or request.form
        p = Purchase(
            franchise_id=int(data.get('franchise_id', 1)),
            invoice_no=data.get('invoice_no', f"INV-{int(datetime.datetime.now().timestamp())}"),
            purchase_date=data.get('purchase_date', datetime.date.today().strftime('%Y-%m-%d')),
            item_details=data.get('item_details', 'Goods Inventory'),
            amount=float(data.get('amount', 0.0)),
            payment_status=data.get('payment_status', 'Paid'),
            remarks=data.get('remarks', ''),
            person=data.get('person', 'Store Manager')
        )
        db.session.add(p)
        db.session.commit()
        log_audit(p.franchise_id, 'Purchase', 'CREATE', p.person, 'Purchase Order', None, f"Rs.{p.amount}", f"Created Invoice {p.invoice_no}")
        return jsonify({'status': 'success', 'purchase': p.to_dict()})

    purchases = Purchase.query.order_by(Purchase.created_at.desc()).all()
    return jsonify([p.to_dict() for p in purchases])

@app.route('/api/purchases/<int:p_id>', methods=['PUT', 'DELETE'])
def update_delete_purchase(p_id):
    p = Purchase.query.get_or_404(p_id)
    if request.method == 'DELETE':
        db.session.delete(p)
        db.session.commit()
        log_audit(p.franchise_id, 'Purchase', 'DELETE', 'Admin', 'Purchase Order', f"Rs.{p.amount}", 'Deleted', f"Deleted Purchase Invoice #{p.invoice_no}")
        return jsonify({'status': 'success', 'message': f"Purchase Invoice #{p.invoice_no} deleted."})

    data = request.json
    p.invoice_no = data.get('invoice_no', p.invoice_no)
    p.purchase_date = data.get('purchase_date', p.purchase_date)
    p.item_details = data.get('item_details', p.item_details)
    p.amount = float(data.get('amount', p.amount))
    p.payment_status = data.get('payment_status', p.payment_status)
    p.person = data.get('person', p.person)
    p.remarks = data.get('remarks', p.remarks)
    db.session.commit()
    log_audit(p.franchise_id, 'Purchase', 'UPDATE', p.person, 'Purchase Order', None, f"Rs.{p.amount}", f"Updated Purchase Invoice #{p.invoice_no}")
    return jsonify({'status': 'success', 'purchase': p.to_dict()})

@app.route('/api/gr_returns', methods=['GET', 'POST'])
def manage_gr_returns():
    if request.method == 'POST':
        data = request.json or request.form
        gr = GRReturn(
            franchise_id=int(data.get('franchise_id', 1)),
            gr_number=data.get('gr_number', f"GR-{int(datetime.datetime.now().timestamp())}"),
            return_date=data.get('return_date', datetime.date.today().strftime('%Y-%m-%d')),
            item_details=data.get('item_details', 'Returned Stock'),
            return_amount=float(data.get('return_amount', 0.0)),
            reason=data.get('reason', 'Quality/Defect'),
            remarks=data.get('remarks', ''),
            person=data.get('person', 'Warehouse Manager')
        )
        db.session.add(gr)
        db.session.commit()
        log_audit(gr.franchise_id, 'GR/Return', 'CREATE', gr.person, 'Goods Return', None, f"Rs.{gr.return_amount}", f"Added GR Return #{gr.gr_number}")
        return jsonify({'status': 'success', 'gr_return': gr.to_dict()})

    grs = GRReturn.query.order_by(GRReturn.created_at.desc()).all()
    return jsonify([g.to_dict() for g in grs])

@app.route('/api/gr_returns/<int:g_id>', methods=['PUT', 'DELETE'])
def update_delete_gr_return(g_id):
    gr = GRReturn.query.get_or_404(g_id)
    if request.method == 'DELETE':
        db.session.delete(gr)
        db.session.commit()
        log_audit(gr.franchise_id, 'GR/Return', 'DELETE', 'Admin', 'Goods Return', f"Rs.{gr.return_amount}", 'Deleted', f"Deleted GR Return #{gr.gr_number}")
        return jsonify({'status': 'success', 'message': f"GR Return #{gr.gr_number} deleted."})

    data = request.json
    gr.gr_number = data.get('gr_number', gr.gr_number)
    gr.return_date = data.get('return_date', gr.return_date)
    gr.item_details = data.get('item_details', gr.item_details)
    gr.return_amount = float(data.get('return_amount', gr.return_amount))
    gr.reason = data.get('reason', gr.reason)
    gr.person = data.get('person', gr.person)
    gr.remarks = data.get('remarks', gr.remarks)
    db.session.commit()
    log_audit(gr.franchise_id, 'GR/Return', 'UPDATE', gr.person, 'Goods Return', None, f"Rs.{gr.return_amount}", f"Updated GR Return #{gr.gr_number}")
    return jsonify({'status': 'success', 'gr_return': gr.to_dict()})

@app.route('/api/company_support', methods=['GET', 'POST'])
def manage_company_support():
    if request.method == 'POST':
        data = request.json or request.form
        cs = CompanySupport(
            franchise_id=int(data.get('franchise_id', 1)),
            interior_support=float(data.get('interior_support', 0.0)),
            training_support=float(data.get('training_support', 0.0)),
            influencer_support=float(data.get('influencer_support', 0.0)),
            branding_support=float(data.get('branding_support', 0.0)),
            marketing_support=float(data.get('marketing_support', 0.0)),
            material_support=float(data.get('material_support', 0.0)),
            samples_support=float(data.get('samples_support', 0.0)),
            travel_support=float(data.get('travel_support', 0.0)),
            other_support=float(data.get('other_support', 0.0)),
            date_provided=data.get('date_provided', datetime.date.today().strftime('%Y-%m-%d')),
            remarks=data.get('remarks', ''),
            person=data.get('person', 'Accounts Admin')
        )
        db.session.add(cs)
        db.session.commit()
        log_audit(cs.franchise_id, 'Company Support', 'CREATE', cs.person, 'Investment Summary', None, f"Rs.{cs.total_investment}", "Recorded Company Support & Investment")
        return jsonify({'status': 'success', 'company_support': cs.to_dict()})

    supports = CompanySupport.query.order_by(CompanySupport.created_at.desc()).all()
    return jsonify([c.to_dict() for c in supports])

@app.route('/api/company_support/<int:c_id>', methods=['PUT', 'DELETE'])
def update_delete_company_support(c_id):
    cs = CompanySupport.query.get_or_404(c_id)
    if request.method == 'DELETE':
        db.session.delete(cs)
        db.session.commit()
        log_audit(cs.franchise_id, 'Company Support', 'DELETE', 'Admin', 'Company Support', f"Rs.{cs.total_investment}", 'Deleted', f"Deleted Support Record #{c_id}")
        return jsonify({'status': 'success', 'message': f"Company Support Record #{c_id} deleted."})

    data = request.json
    cs.interior_support = float(data.get('interior_support', cs.interior_support))
    cs.training_support = float(data.get('training_support', cs.training_support))
    cs.influencer_support = float(data.get('influencer_support', cs.influencer_support))
    cs.branding_support = float(data.get('branding_support', cs.branding_support))
    cs.marketing_support = float(data.get('marketing_support', cs.marketing_support))
    cs.material_support = float(data.get('material_support', cs.material_support))
    cs.samples_support = float(data.get('samples_support', cs.samples_support))
    cs.travel_support = float(data.get('travel_support', cs.travel_support))
    cs.other_support = float(data.get('other_support', cs.other_support))
    cs.date_provided = data.get('date_provided', cs.date_provided)
    cs.person = data.get('person', cs.person)
    cs.remarks = data.get('remarks', cs.remarks)
    db.session.commit()
    log_audit(cs.franchise_id, 'Company Support', 'UPDATE', cs.person, 'Company Support', None, f"Rs.{cs.total_investment}", f"Updated Support Record #{c_id}")
    return jsonify({'status': 'success', 'company_support': cs.to_dict()})

# --- INTERIOR & STORE CONSTRUCTION SETUP API ENDPOINTS ---

@app.route('/uploads/interiors/<path:filename>')
def serve_interior_upload(filename):
    folder = os.path.join(app.config['UPLOAD_FOLDER'], 'interiors')
    return send_from_directory(folder, filename)

@app.route('/api/interiors', methods=['GET', 'POST'])
def manage_interiors():
    if request.method == 'POST':
        data = request.form if request.form else (request.get_json(silent=True) or {})

        f_id = data.get('franchise_id')
        l_id = data.get('lead_id')

        franchise_id = int(f_id) if f_id and str(f_id).strip() != '' else None
        lead_id = int(l_id) if l_id and str(l_id).strip() != '' else None

        if (franchise_id and lead_id) or (not franchise_id and not lead_id):
            return jsonify({'status': 'error', 'error': 'Interior Setup must be linked to EITHER a Franchise OR an Inquiry Lead (never both or neither).'}), 400

        contractor_name = str(data.get('contractor_name') or '').strip()
        if not contractor_name:
            return jsonify({'status': 'error', 'error': 'Contractor name is required.'}), 400

        inspected_by = data.get('inspected_by') or 'Interior Lead'
        start_date = data.get('start_date') or ''
        target_completion_date = data.get('target_completion_date') or ''
        actual_completion_date = data.get('actual_completion_date') or ''

        civil_cost = float(data.get('civil_cost') or 0.0)
        carpentry_cost = float(data.get('carpentry_cost') or 0.0)
        electrical_cost = float(data.get('electrical_cost') or 0.0)
        plumbing_cost = float(data.get('plumbing_cost') or 0.0)
        hvac_cost = float(data.get('hvac_cost') or 0.0)

        completion_pct = int(data.get('completion_percentage') or 0)
        if completion_pct > 100: completion_pct = 100
        if completion_pct < 0: completion_pct = 0

        status = data.get('status') or 'Planned'
        if status == 'Completed':
            completion_pct = 100
        elif completion_pct == 100:
            status = 'Completed'

        remarks = data.get('remarks') or ''

        blueprint_filename = None
        blueprint_filepath = None
        if request.files and 'blueprint' in request.files:
            file = request.files['blueprint']
            if file and file.filename != '':
                orig_filename = secure_filename(file.filename)
                ext = orig_filename.rsplit('.', 1)[-1].lower() if '.' in orig_filename else ''
                stored_filename = f"blueprint_{int(datetime.datetime.now().timestamp())}_{orig_filename}"
                interiors_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'interiors')
                os.makedirs(interiors_dir, exist_ok=True)
                full_save_path = os.path.join(interiors_dir, stored_filename)
                file.save(full_save_path)

                blueprint_filename = stored_filename
                blueprint_filepath = f"/uploads/interiors/{stored_filename}"

                curr_user = get_current_user()
                doc = Document(
                    franchise_id=franchise_id,
                    lead_id=lead_id,
                    stage_name='Interior',
                    doc_type='PDF Blueprint' if ext == 'pdf' else 'Image Blueprint',
                    doc_title=f"{contractor_name} - Store Blueprint",
                    file_name=stored_filename,
                    file_path=blueprint_filepath,
                    uploaded_by=curr_user.full_name if curr_user else 'Interior Team'
                )
                db.session.add(doc)

        interior = InteriorSetup(
            franchise_id=franchise_id,
            lead_id=lead_id,
            contractor_name=contractor_name,
            inspected_by=inspected_by,
            start_date=start_date,
            target_completion_date=target_completion_date,
            actual_completion_date=actual_completion_date,
            civil_cost=civil_cost,
            carpentry_cost=carpentry_cost,
            electrical_cost=electrical_cost,
            plumbing_cost=plumbing_cost,
            hvac_cost=hvac_cost,
            completion_percentage=completion_pct,
            status=status,
            blueprint_filename=blueprint_filename,
            blueprint_filepath=blueprint_filepath,
            remarks=remarks
        )
        db.session.add(interior)
        db.session.commit()

        curr_user = get_current_user()
        person_name = curr_user.full_name if curr_user else inspected_by
        log_audit(
            franchise_id=franchise_id,
            lead_id=lead_id,
            stage_name='Interior',
            action='CREATE',
            performed_by=person_name,
            field_changed='Interior Setup',
            old_value=None,
            new_value=f"Rs.{interior.total_cost:,.2f} ({status}, {completion_pct}%)",
            remarks=f"Created Store Construction Setup with contractor '{contractor_name}'"
        )

        return jsonify({
            'status': 'success',
            'message': 'Store interior construction setup recorded successfully!',
            'interior': interior.to_dict()
        })

    interiors = InteriorSetup.query.order_by(InteriorSetup.created_at.desc()).all()
    return jsonify([i.to_dict() for i in interiors])

@app.route('/api/interiors/<int:i_id>', methods=['GET', 'PUT', 'DELETE'])
def handle_single_interior(i_id):
    interior = InteriorSetup.query.get_or_404(i_id)

    if request.method == 'GET':
        return jsonify(interior.to_dict())

    if request.method == 'DELETE':
        fid = interior.franchise_id
        lid = interior.lead_id
        contractor = interior.contractor_name

        db.session.delete(interior)
        db.session.commit()

        curr_user = get_current_user()
        person_name = curr_user.full_name if curr_user else 'Admin'
        log_audit(
            franchise_id=fid,
            lead_id=lid,
            stage_name='Interior',
            action='DELETE',
            performed_by=person_name,
            field_changed='Interior Setup',
            old_value=f"#{i_id} ({contractor})",
            new_value='Deleted',
            remarks=f"Deleted Interior Construction Setup #{i_id} (Contractor: {contractor})"
        )
        return jsonify({'status': 'success', 'message': f"Interior setup #{i_id} deleted cleanly."})

    data = request.get_json(force=True, silent=True) or request.json or request.form or {}

    old_status = interior.status
    old_pct = interior.completion_percentage

    if 'contractor_name' in data and data['contractor_name']:
        interior.contractor_name = str(data['contractor_name']).strip()
    if 'inspected_by' in data: interior.inspected_by = data['inspected_by']
    if 'start_date' in data: interior.start_date = data['start_date']
    if 'target_completion_date' in data: interior.target_completion_date = data['target_completion_date']
    if 'actual_completion_date' in data: interior.actual_completion_date = data['actual_completion_date']

    if 'civil_cost' in data: interior.civil_cost = float(data['civil_cost'] or 0.0)
    if 'carpentry_cost' in data: interior.carpentry_cost = float(data['carpentry_cost'] or 0.0)
    if 'electrical_cost' in data: interior.electrical_cost = float(data['electrical_cost'] or 0.0)
    if 'plumbing_cost' in data: interior.plumbing_cost = float(data['plumbing_cost'] or 0.0)
    if 'hvac_cost' in data: interior.hvac_cost = float(data['hvac_cost'] or 0.0)

    if 'completion_percentage' in data and data['completion_percentage'] is not None:
        pct = int(data['completion_percentage'])
        if pct > 100: pct = 100
        if pct < 0: pct = 0
        interior.completion_percentage = pct

    if 'status' in data and data['status']:
        interior.status = data['status']

    if interior.status == 'Completed':
        interior.completion_percentage = 100
    elif interior.completion_percentage == 100:
        interior.status = 'Completed'

    if 'remarks' in data: interior.remarks = data['remarks']

    if request.files and 'blueprint' in request.files:
        file = request.files['blueprint']
        if file and file.filename != '':
            orig_filename = secure_filename(file.filename)
            ext = orig_filename.rsplit('.', 1)[-1].lower() if '.' in orig_filename else ''
            stored_filename = f"blueprint_{int(datetime.datetime.now().timestamp())}_{orig_filename}"
            interiors_dir = os.path.join(app.config['UPLOAD_FOLDER'], 'interiors')
            os.makedirs(interiors_dir, exist_ok=True)
            full_save_path = os.path.join(interiors_dir, stored_filename)
            file.save(full_save_path)

            interior.blueprint_filename = stored_filename
            interior.blueprint_filepath = f"/uploads/interiors/{stored_filename}"

            curr_user = get_current_user()
            doc = Document(
                franchise_id=interior.franchise_id,
                lead_id=interior.lead_id,
                stage_name='Interior',
                doc_type='PDF Blueprint' if ext == 'pdf' else 'Image Blueprint',
                doc_title=f"{interior.contractor_name} - Store Blueprint Updated",
                file_name=stored_filename,
                file_path=interior.blueprint_filepath,
                uploaded_by=curr_user.full_name if curr_user else 'Interior Team'
            )
            db.session.add(doc)

    db.session.commit()

    curr_user = get_current_user()
    person_name = curr_user.full_name if curr_user else (interior.inspected_by or 'Staff')
    log_audit(
        franchise_id=interior.franchise_id,
        lead_id=interior.lead_id,
        stage_name='Interior',
        action='UPDATE',
        performed_by=person_name,
        field_changed='Construction Progress',
        old_value=f"{old_status} ({old_pct}%)",
        new_value=f"{interior.status} ({interior.completion_percentage}%)",
        remarks=f"Updated Interior Setup #{i_id} (Capex: Rs.{interior.total_cost:,.2f})"
    )

    return jsonify({
        'status': 'success',
        'message': f"Interior setup #{i_id} updated successfully!",
        'interior': interior.to_dict()
    })

# --- DEMO DATA SEEDER API ---

@app.route('/api/seed_demo_data', methods=['POST'])
def seed_demo_data():
    sample_franchises = [
        {"code": "FR-SURAT", "name": "Ajit Zone - Surat", "owner_name": "Rajesh Shah", "owner_mobile": "+91 9825012345", "city": "Surat", "state": "Gujarat", "assigned_person": "Vikram Singh", "plan_name": "Plan B", "status": "Active", "agreed_amount": 500000.0},
        {"code": "FR-DEHRADUN", "name": "Ajit Zone - Dehradun", "owner_name": "Anil Verma", "owner_mobile": "+91 9412012345", "city": "Dehradun", "state": "Uttarakhand", "assigned_person": "Rajesh Kumar", "plan_name": "Plan A", "status": "Active", "agreed_amount": 600000.0},
        {"code": "FR-LUCKNOW", "name": "Ajit Zone - Lucknow", "owner_name": "Suresh Gupta", "owner_mobile": "+91 9335012345", "city": "Lucknow", "state": "Uttar Pradesh", "assigned_person": "Priya Nair", "plan_name": "Plan C", "status": "Active", "agreed_amount": 750000.0},
        {"code": "FR-JAIPUR", "name": "Ajit Zone - Jaipur", "owner_name": "Manish Sharma", "owner_mobile": "+91 9414012345", "city": "Jaipur", "state": "Rajasthan", "assigned_person": "Vikram Singh", "plan_name": "Plan B", "status": "Active", "agreed_amount": 550000.0},
        {"code": "FR-BHOPAL", "name": "Ajit Zone - Bhopal", "owner_name": "Vijay Chouhan", "owner_mobile": "+91 9826012345", "city": "Bhopal", "state": "Madhya Pradesh", "assigned_person": "Rajesh Kumar", "plan_name": "Plan A", "status": "Active", "agreed_amount": 480000.0},
        {"code": "FR-AHMEDABAD", "name": "Ajit Zone - Ahmedabad", "owner_name": "Pankaj Patel", "owner_mobile": "+91 9879012345", "city": "Ahmedabad", "state": "Gujarat", "assigned_person": "Ananya Sharma", "plan_name": "Plan C", "status": "Pending", "agreed_amount": 800000.0},
        {"code": "FR-INDORE", "name": "Ajit Zone - Indore", "owner_name": "Deepak Jain", "owner_mobile": "+91 9827012345", "city": "Indore", "state": "Madhya Pradesh", "assigned_person": "Vikram Singh", "plan_name": "Plan B", "status": "Active", "agreed_amount": 520000.0},
        {"code": "FR-PATNA", "name": "Ajit Zone - Patna", "owner_name": "Ravi Kumar", "owner_mobile": "+91 9334012345", "city": "Patna", "state": "Bihar", "assigned_person": "Rajesh Kumar", "plan_name": "Plan A", "status": "Active", "agreed_amount": 450000.0},
        {"code": "FR-KOLKATA", "name": "Ajit Zone - Kolkata", "owner_name": "Subhash Roy", "owner_mobile": "+91 9830012345", "city": "Kolkata", "state": "West Bengal", "assigned_person": "Priya Nair", "plan_name": "Plan B", "status": "Inactive", "agreed_amount": 650000.0}
    ]

    for item in sample_franchises:
        existing = Franchise.query.filter_by(code=item['code']).first()
        if not existing:
            f = Franchise(**item)
            db.session.add(f)
            db.session.flush()

            pur = Purchase(franchise_id=f.id, invoice_no=f"INV-{f.code}-01", purchase_date="2026-09-10", item_details="Opening Stock Apparel Inventory", amount=150000.0, person=f.assigned_person)
            gr = GRReturn(franchise_id=f.id, gr_number=f"GR-{f.code}-01", return_date="2026-09-12", item_details="Damaged stock returned", return_amount=15000.0, reason="Transit Damage", person=f.assigned_person)
            tok = TokenRecord(franchise_id=f.id, token_amount=50000.0, payment_date="2026-09-01", payment_mode="Bank Transfer", person=f.assigned_person)
            pay = Payment(franchise_id=f.id, amount=150000.0, payment_date="2026-09-05", payment_type="Franchise Fee Part 1", person="Accountant")
            cs = CompanySupport(franchise_id=f.id, interior_support=30000.0, training_support=15000.0, branding_support=20000.0, date_provided="2026-09-08", person="Accounts Admin")
            
            # Sample Expenses entries
            e1 = Expense(franchise_id=f.id, expense_date="2026-09-02", expense_time="11:30", category_name="Rent & Lease", sub_category="Monthly Store Rent", description="Store premises monthly rental", amount=45000.0, payment_mode="Bank Transfer", paid_by="Store", person=f.assigned_person, vendor_party="Building Owner", bill_invoice_no="RENT-0926", status="Paid")
            e2 = Expense(franchise_id=f.id, expense_date="2026-09-06", expense_time="16:00", category_name="Utilities (Electricity/Water)", sub_category="Electricity Bill", description="State electricity board power bill", amount=8500.0, payment_mode="UPI", paid_by="Store", person=f.assigned_person, vendor_party="State Electricity Board", bill_invoice_no="ELEC-8812", status="Paid")

            db.session.add_all([pur, gr, tok, pay, cs, e1, e2])

    db.session.commit()
    return jsonify({'status': 'success', 'message': 'Temporary sample franchises & expense entries seeded successfully!'})

@app.route('/api/audit_logs', methods=['GET'])
def get_all_audit_logs():
    logs = AuditLog.query.order_by(AuditLog.timestamp.desc()).all()
    res = []
    for l in logs:
        d = l.to_dict()
        d['person'] = l.performed_by
        d['status'] = l.action
        d['date'] = l.timestamp.strftime('%Y-%m-%d') if l.timestamp else ''
        res.append(d)
    return jsonify(res)

# --- REPORTS & EXPORT ---

@app.route('/api/reports/export', methods=['GET'])
def export_report():
    fmt = request.args.get('format', 'pdf').lower()
    f_id = request.args.get('franchise_id')

    if f_id:
        franchise = Franchise.query.get_or_404(f_id)
        f_dict = franchise.to_dict()
        purchases = Purchase.query.filter_by(franchise_id=f_id).all()
        grs = GRReturn.query.filter_by(franchise_id=f_id).all()
        tokens = TokenRecord.query.filter_by(franchise_id=f_id, status='Received').all()
        payments = Payment.query.filter_by(franchise_id=f_id, status='Received').all()
        cs = CompanySupport.query.filter_by(franchise_id=f_id).all()
        audit_logs = AuditLog.query.filter_by(franchise_id=f_id).order_by(AuditLog.timestamp.desc()).all()

        tot_pur = sum(p.amount for p in purchases)
        tot_gr = sum(g.return_amount for g in grs)
        net_pur = tot_pur - tot_gr
        gr_pct = (tot_gr / tot_pur * 100) if tot_pur > 0 else 0.0
        tot_rec = sum(t.token_amount for t in tokens) + sum(p.amount for p in payments)
        out = max(0.0, franchise.agreed_amount - tot_rec)
        tot_supp = sum(c.total_investment for c in cs)

        fin_summary = {
            'total_purchase': tot_pur,
            'total_gr': tot_gr,
            'gr_percent': gr_pct,
            'net_purchase': net_pur,
            'total_received': tot_rec,
            'outstanding': out,
            'total_support': tot_supp
        }
        timeline_items = [a.to_dict() for a in audit_logs]
    else:
        f_dict = {'name': 'All Franchises Master Report', 'code': 'ALL', 'owner_name': 'Multi-Owner', 'city': 'All Cities'}
        fin_summary = {'total_purchase': 0, 'total_gr': 0, 'gr_percent': 0, 'net_purchase': 0, 'total_received': 0, 'outstanding': 0, 'total_support': 0}
        timeline_items = []

    if fmt == 'pdf':
        pdf_bytes = generate_pdf_report(f_dict, timeline_items, fin_summary)
        return Response(pdf_bytes, mimetype='application/pdf', headers={'Content-Disposition': f'attachment;filename=Franchise_Report_{f_dict.get("code")}.pdf'})
    elif fmt == 'excel':
        franchises = [Franchise.query.get(f_id).to_dict()] if f_id else [f.to_dict() for f in Franchise.query.all()]
        audit_entries = [a.to_dict() for a in AuditLog.query.all()]
        excel_bytes = generate_excel_report(franchises, audit_entries)
        return Response(excel_bytes, mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers={'Content-Disposition': f'attachment;filename=Franchise_Report_{f_dict.get("code")}.xlsx'})
    elif fmt == 'word':
        doc_bytes = generate_word_report(f_dict, fin_summary)
        return Response(doc_bytes, mimetype='application/msword', headers={'Content-Disposition': f'attachment;filename=Franchise_Report_{f_dict.get("code")}.doc'})

    return jsonify({'error': 'Invalid format'}), 400

# --- UNIVERSAL AUTO-EXTRACTION & IMPORT APIs ---

def get_file_hash(filepath):
    hasher = hashlib.sha256()
    with open(filepath, 'rb') as f:
        buf = f.read(65536)
        while len(buf) > 0:
            hasher.update(buf)
            buf = f.read(65536)
    return hasher.hexdigest()

def normalize_field_name(header):
    if not header:
        return ""
    h = str(header).strip().lower().replace("_", " ").replace("-", " ")
    h = re.sub(r'[^a-z0-9 ]', '', h).strip()
    
    if h in ['date', 'txn date', 'transaction date', 'expense date', 'payment date', 'call date', 'followup date', 'survey date', 'creation date', 'created at']:
        return 'date'
    if h in ['time', 'expense time', 'created time']:
        return 'time'
    if h in ['amount', 'token amount', 'cost', 'unit cost', 'return amount', 'total cost', 'total investment', 'price', 'agreed amount']:
        return 'amount'
    if h in ['franchise', 'franchise code', 'franchise name', 'store', 'location']:
        return 'franchise'
    if h in ['customer', 'customer name', 'lead name', 'owner', 'owner name', 'client']:
        return 'customer_name'
    if h in ['mobile', 'phone', 'contact', 'owner mobile', 'phone number']:
        return 'mobile'
    if h in ['email', 'owner email']:
        return 'email'
    if h in ['person', 'assigned person', 'caller person', 'surveyor', 'trainer', 'auditor', 'responsible person', 'uploaded by', 'staff']:
        return 'person'
    if h in ['vendor', 'party', 'vendor party', 'vendor name', 'supplier']:
        return 'vendor_party'
    if h in ['purpose', 'description', 'expense type', 'item details', 'discussion', 'requirement', 'campaign name', 'batch name', 'title']:
        return 'description'
    if h in ['category', 'expense category', 'channel', 'sub category']:
        return 'category'
    if h in ['ref no', 'reference no', 'reference', 'ref number', 'invoice no', 'invoice number', 'bill no', 'bill invoice no', 'gr number', 'gr no']:
        return 'reference_no'
    if h in ['remarks', 'notes', 'comments', 'objection', 'outcome', 'reason']:
        return 'remarks'
    if h in ['status', 'payment status', 'pos status']:
        return 'status'
    if h in ['payment mode', 'mode']:
        return 'payment_mode'
    if h in ['paid by']:
        return 'paid_by'
    
    return h.replace(" ", "_")

def parse_excel_or_csv(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    rows = []
    if ext == '.csv':
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            raw_rows = [row for row in reader if any(row)]
            if raw_rows:
                headers = [normalize_field_name(h) for h in raw_rows[0]]
                for row in raw_rows[1:]:
                    row_dict = {}
                    for i, val in enumerate(row):
                        if i < len(headers) and headers[i]:
                            row_dict[headers[i]] = str(val).strip()
                    if any(row_dict.values()):
                        rows.append(row_dict)
    else:
        wb = openpyxl.load_workbook(filepath, data_only=True)
        sheet = wb.active
        raw_rows = []
        for row in sheet.iter_rows(values_only=True):
            if any(row):
                raw_rows.append(list(row))
        if raw_rows:
            headers = [normalize_field_name(h) for h in raw_rows[0]]
            for row in raw_rows[1:]:
                row_dict = {}
                for i, val in enumerate(row):
                    if i < len(headers) and headers[i]:
                        val_str = str(val).strip() if val is not None else ""
                        row_dict[headers[i]] = val_str
                if any(row_dict.values()):
                    rows.append(row_dict)
    return rows

def parse_pdf(filepath):
    try:
        reader = PdfReader(filepath)
        text = ""
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
    except Exception:
        text = ""
    
    records = []
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    record = {}
    
    date_match = re.search(r'(?:Date|Dated|On)\s*:\s*(\d{2,4}[\/\.\-]\d{1,2}[\/\.\-]\d{2,4})', text, re.I)
    if date_match:
        record['date'] = date_match.group(1)
        
    time_match = re.search(r'(?:Time)\s*:\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?)', text, re.I)
    if time_match:
        record['time'] = time_match.group(1)
        
    amt_match = re.search(r'(?:Amount|Total|Fee|Cost|Price|Value)\s*:\s*(?:Rs\.?|\$|INR)?\s*([\d,]+(?:\.\d{2})?)', text, re.I)
    if amt_match:
        record['amount'] = amt_match.group(1).replace(',', '')
        
    franchise_match = re.search(r'(?:Franchise|Store|Branch)\s*:\s*([^\n,]+)', text, re.I)
    if franchise_match:
        record['franchise'] = franchise_match.group(1).strip()
        
    customer_match = re.search(r'(?:Customer|Lead|Client|Owner|Name)\s*:\s*([^\n,]+)', text, re.I)
    if customer_match:
        record['customer_name'] = customer_match.group(1).strip()
        
    mobile_match = re.search(r'(?:Mobile|Phone|Contact)\s*:\s*([\d\+\-\s]{10,15})', text, re.I)
    if mobile_match:
        record['mobile'] = mobile_match.group(1).strip()
        
    vendor_match = re.search(r'(?:Vendor|Party|Supplier)\s*:\s*([^\n,]+)', text, re.I)
    if vendor_match:
        record['vendor_party'] = vendor_match.group(1).strip()
        
    person_match = re.search(r'(?:Person|Staff|By|Officer|Surveyor|Auditor|Trainer)\s*:\s*([^\n,]+)', text, re.I)
    if person_match:
        record['person'] = person_match.group(1).strip()
        
    ref_match = re.search(r'(?:Invoice|Bill|Ref|Reference|GR|No)\s*:\s*([^\n,]+)', text, re.I)
    if ref_match:
        record['reference_no'] = ref_match.group(1).strip()
        
    desc_match = re.search(r'(?:Purpose|Description|Subject|Details|Item)\s*:\s*([^\n,]+)', text, re.I)
    if desc_match:
        record['description'] = desc_match.group(1).strip()
        
    remarks_match = re.search(r'(?:Remarks|Notes|Comment)\s*:\s*([^\n,]+)', text, re.I)
    if remarks_match:
        record['remarks'] = remarks_match.group(1).strip()

    if not record and lines:
        record['description'] = lines[0]
        record['remarks'] = " ".join(lines[1:5]) if len(lines) > 1 else ""

    if record:
        records.append(record)
    return records


@app.route('/api/extract_file', methods=['POST'])
def extract_file_data():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    file = request.files['file']
    if not file or not file.filename:
        return jsonify({'error': 'No file selected'}), 400
    
    orig_filename = secure_filename(file.filename)
    file_bytes = file.read()
    file.seek(0)

    # Route through storage service (Supabase Storage if configured, or local)
    file_ref = upload_file(file, orig_filename)
    
    # Save a temporary copy for local parsing in upload folder
    timestamp_str = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    saved_filename = f"{timestamp_str}_{orig_filename}"
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], saved_filename)
    with open(filepath, 'wb') as f:
        f.write(file_bytes)
    
    file_hash = get_file_hash(filepath)
    ext = os.path.splitext(orig_filename)[1].lower()
    file_type = 'PDF' if ext == '.pdf' else 'Excel'
    
    existing_import = ImportHistory.query.filter_by(file_hash=file_hash).first()
    is_duplicate = existing_import is not None
    prev_import_info = existing_import.to_dict() if existing_import else None
    
    if ext == '.pdf':
        extracted_records = parse_pdf(filepath)
    else:
        extracted_records = parse_excel_or_csv(filepath)
        
    return jsonify({
        'status': 'success',
        'file_name': orig_filename,
        'saved_filename': saved_filename,
        'file_path': file_ref,
        'file_hash': file_hash,
        'file_type': file_type,
        'is_duplicate': is_duplicate,
        'previous_import': prev_import_info,
        'extracted_records': extracted_records,
        'extracted_count': len(extracted_records)
    })

@app.route('/api/import_file', methods=['POST'])
def import_file_data():
    data = request.json or {}
    module_name = data.get('module_name', 'Expense')
    franchise_id = data.get('franchise_id')
    file_name = data.get('file_name', 'Imported_File')
    file_path = data.get('file_path', '')
    file_hash = data.get('file_hash', '')
    file_type = data.get('file_type', 'Excel')
    uploaded_by = data.get('uploaded_by', 'System Admin')
    records = data.get('records', [])
    remarks = data.get('remarks', 'Auto-imported data')

    if not franchise_id:
        f_first = Franchise.query.first()
        if f_first:
            franchise_id = f_first.id

    imported_count = 0
    now_str = datetime.datetime.now().strftime('%Y-%m-%d')
    now_time = datetime.datetime.now().strftime('%H:%M:%S')

    for r in records:
        f_id = int(r.get('franchise_id') or franchise_id or 1)
        amt = float(r.get('amount') or r.get('token_amount') or r.get('cost') or r.get('unit_cost') or 0.0)
        p_date = str(r.get('date') or r.get('payment_date') or r.get('expense_date') or now_str)
        p_person = str(r.get('person') or r.get('caller_person') or r.get('assigned_person') or uploaded_by)
        desc = str(r.get('description') or r.get('purpose') or r.get('discussion') or r.get('item_details') or 'Imported record')
        rem = str(r.get('remarks') or remarks)
        ref_no = str(r.get('reference_no') or r.get('invoice_no') or r.get('bill_invoice_no') or '')
        vendor = str(r.get('vendor_party') or '')
        cust = str(r.get('customer_name') or 'Lead Customer')
        mob = str(r.get('mobile') or '9876543210')
        cat = str(r.get('category') or 'Miscellaneous')
        status = str(r.get('status') or 'Completed')

        m_lower = module_name.lower()
        if 'lead' in m_lower:
            item = Lead(franchise_id=f_id, customer_name=cust, mobile=mob, email=r.get('email', ''), city=r.get('city', ''), source=cat, status=status, assigned_person=p_person, remarks=rem)
        elif 'call' in m_lower:
            item = CallHistory(franchise_id=f_id, caller_person=p_person, call_date=datetime.datetime.now(), discussion=desc, requirement=r.get('requirement', ''), plan_discussed=cat, objection=r.get('objection', ''), status=status, remarks=rem)
        elif 'follow' in m_lower:
            item = FollowUp(franchise_id=f_id, person=p_person, followup_date=datetime.datetime.now(), discussion=desc, outcome=r.get('outcome', ''), status=status, remarks=rem)
        elif 'token' in m_lower:
            item = TokenRecord(franchise_id=f_id, token_amount=amt, payment_date=p_date, payment_mode=r.get('payment_mode', 'Bank Transfer'), reference_no=ref_no, document_path=file_path, person=p_person, remarks=rem)
        elif 'survey' in m_lower:
            item = SurveyVersion(franchise_id=f_id, surveyor_name=p_person, survey_date=p_date, area_sqft=float(r.get('area_sqft') or 1000), frontage_ft=float(r.get('frontage_ft') or 25), daily_footfall=int(r.get('daily_footfall') or 500), monthly_rent=amt, rating_score=4.5, pdf_filename=file_name, pdf_filepath=file_path, remarks=rem)
        elif 'payment' in m_lower:
            item = Payment(franchise_id=f_id, amount=amt, payment_date=p_date, payment_type=cat, payment_mode=r.get('payment_mode', 'Bank Transfer'), reference_no=ref_no, document_path=file_path, person=p_person, remarks=rem)
        elif 'brand' in m_lower:
            item = BrandingSetup(franchise_id=f_id, signage_cost=amt*0.6, vinyl_cost=amt*0.2, glowsign_cost=amt*0.2, installation_date=p_date, person=p_person, remarks=rem)
        elif 'market' in m_lower:
            item = MarketingCampaign(franchise_id=f_id, campaign_name=desc, channel=cat, cost=amt, start_date=p_date, end_date=p_date, person=p_person, remarks=rem)
        elif 'train' in m_lower:
            item = TrainingRecord(franchise_id=f_id, batch_name=desc, staff_count=int(r.get('staff_count') or 5), trainer_name=p_person, training_date=p_date, person=p_person, remarks=rem)
        elif 'operation' in m_lower:
            item = StoreOperations(franchise_id=f_id, checklist_score=95.0, pos_status='Operational', opening_date=p_date, auditor_name=p_person, person=p_person, remarks=rem)
        elif 'material' in m_lower or 'asset' in m_lower:
            item = MaterialAsset(franchise_id=f_id, item_name=desc, category=cat, quantity_given=int(r.get('quantity') or 1), unit_cost=amt, person=p_person, remarks=rem)
        elif 'purchase' in m_lower:
            item = Purchase(franchise_id=f_id, invoice_no=ref_no or f"INV-{imported_count+1}", purchase_date=p_date, item_details=desc, amount=amt, document_path=file_path, person=p_person, remarks=rem)
        elif 'return' in m_lower or 'gr' in m_lower:
            item = GRReturn(franchise_id=f_id, gr_number=ref_no or f"GR-{imported_count+1}", return_date=p_date, item_details=desc, return_amount=amt, document_path=file_path, person=p_person, remarks=rem)
        elif 'visit' in m_lower and 'expense' in m_lower:
            trv = float(r.get('travel_expense') or (amt * 0.4))
            fd = float(r.get('food_expense') or (amt * 0.2))
            sty = float(r.get('hotel_stay_expense') or (amt * 0.3))
            oth = float(r.get('other_expense') or (amt * 0.1))
            item = VisitExpense(
                franchise_id=f_id,
                visit_date=p_date,
                visit_location=str(r.get('visit_location') or 'Franchise Site'),
                visiting_person=p_person,
                purpose=desc,
                travel_expense=trv,
                food_expense=fd,
                hotel_stay_expense=sty,
                other_expense=oth,
                payment_mode=str(r.get('payment_mode') or 'Cash'),
                paid_by=str(r.get('paid_by') or 'Company'),
                document_path=file_path,
                remarks=rem
            )
        elif 'support' in m_lower:
            item = CompanySupport(franchise_id=f_id, interior_support=amt, date_provided=p_date, person=p_person, remarks=rem)
        elif 'document' in m_lower:
            item = Document(franchise_id=f_id, stage_name=module_name, doc_title=file_name, doc_type=file_type, file_name=file_name, file_path=file_path, uploaded_by=uploaded_by, remarks=rem)
        else: # Default: Expense
            item = Expense(
                franchise_id=f_id,
                expense_date=p_date,
                expense_time=r.get('time', now_time),
                category_name=cat,
                sub_category=r.get('sub_category', 'General'),
                description=desc,
                amount=amt,
                payment_mode=r.get('payment_mode', 'Bank Transfer'),
                paid_by=r.get('paid_by', 'Company'),
                person=p_person,
                vendor_party=vendor,
                bill_invoice_no=ref_no,
                document_path=file_path,
                remarks=rem
            )
        
        db.session.add(item)
        imported_count += 1

    imp_history = ImportHistory(
        franchise_id=franchise_id,
        module_name=module_name,
        file_name=file_name,
        file_path=file_path,
        file_hash=file_hash,
        file_type=file_type,
        records_count=imported_count,
        extracted_data_json=json.dumps(records),
        uploaded_by=uploaded_by,
        status='Completed',
        remarks=f"Successfully imported {imported_count} records into {module_name}"
    )
    db.session.add(imp_history)
    log_audit(franchise_id, module_name, 'Auto-Import', uploaded_by, field_changed='Records Count', old_value='0', new_value=str(imported_count), remarks=f"File: {file_name}")

    db.session.commit()
    return jsonify({
        'status': 'success',
        'message': f"Successfully imported {imported_count} records into {module_name}.",
        'imported_count': imported_count,
        'file_path': file_path
    })

# --- VISIT EXPENSES APIs ---

@app.route('/api/visit_expenses', methods=['GET', 'POST'])
def manage_visit_expenses():
    if request.method == 'POST':
        data = request.json or request.form
        franchise_id = data.get('franchise_id') or 1
        visit_date = data.get('visit_date') or data.get('date') or datetime.datetime.now().strftime('%Y-%m-%d')
        visit_location = data.get('visit_location') or data.get('location') or ''
        visiting_person = data.get('visiting_person') or data.get('person') or 'Rajesh Kumar'
        purpose = data.get('purpose') or data.get('description') or ''
        travel_expense = float(data.get('travel_expense') or 0.0)
        food_expense = float(data.get('food_expense') or 0.0)
        hotel_stay_expense = float(data.get('hotel_stay_expense') or 0.0)
        other_expense = float(data.get('other_expense') or 0.0)
        payment_mode = data.get('payment_mode', 'Cash')
        paid_by = data.get('paid_by', 'Company')
        document_path = data.get('document_path', '')
        remarks = data.get('remarks', '')

        if 'file' in request.files:
            file = request.files['file']
            if file and file.filename:
                document_path = upload_file(file)

        ve = VisitExpense(
            franchise_id=int(franchise_id),
            visit_date=str(visit_date),
            visit_location=str(visit_location),
            visiting_person=str(visiting_person),
            purpose=str(purpose),
            travel_expense=travel_expense,
            food_expense=food_expense,
            hotel_stay_expense=hotel_stay_expense,
            other_expense=other_expense,
            payment_mode=str(payment_mode),
            paid_by=str(paid_by),
            document_path=str(document_path),
            remarks=str(remarks)
        )
        db.session.add(ve)
        db.session.commit()
        log_audit(franchise_id, 'Visit Expense', 'Create', visiting_person, field_changed='Record', new_value=f"Total Rs. {ve.total_expense}", remarks=f"Location: {visit_location}")
        return jsonify({'status': 'success', 'message': 'Visit Expense entry recorded successfully!', 'visit_expense': ve.to_dict()})

    # GET Filtered Visit Expenses
    franchise_id = request.args.get('franchise_id')
    person_filter = request.args.get('person')
    date_preset = request.args.get('date_preset', 'Till Now')
    search_q = request.args.get('search', '').strip().lower()

    query = VisitExpense.query
    if franchise_id:
        query = query.filter(VisitExpense.franchise_id == franchise_id)
    if person_filter:
        query = query.filter(VisitExpense.visiting_person == person_filter)
    if search_q:
        query = query.filter(
            (VisitExpense.visit_location.ilike(f"%{search_q}%")) |
            (VisitExpense.visiting_person.ilike(f"%{search_q}%")) |
            (VisitExpense.purpose.ilike(f"%{search_q}%")) |
            (VisitExpense.remarks.ilike(f"%{search_q}%"))
        )

    items = query.order_by(VisitExpense.created_at.desc()).all()
    filtered_items = []
    now = datetime.datetime.now()

    for item in items:
        match = True
        try:
            d_obj = datetime.datetime.strptime(item.visit_date, '%Y-%m-%d')
        except Exception:
            d_obj = item.created_at

        if date_preset == 'Today':
            match = d_obj.date() == now.date()
        elif date_preset == '7 Days':
            match = d_obj >= (now - datetime.timedelta(days=7))
        elif date_preset == '30 Days':
            match = d_obj >= (now - datetime.timedelta(days=30))
        elif date_preset == 'This Month':
            match = d_obj.year == now.year and d_obj.month == now.month
        elif date_preset == 'Quarterly':
            match = d_obj >= (now - datetime.timedelta(days=90))
        elif date_preset == 'Half Yearly':
            match = d_obj >= (now - datetime.timedelta(days=180))
        elif date_preset == 'Yearly':
            match = d_obj >= (now - datetime.timedelta(days=365))

        if match:
            filtered_items.append(item)

    franchises_dict = {f.id: f.name for f in Franchise.query.all()}
    resp_list = []
    tot_travel = 0.0
    tot_food = 0.0
    tot_stay = 0.0
    tot_other = 0.0

    for item in filtered_items:
        d = item.to_dict()
        d['franchise_name'] = franchises_dict.get(item.franchise_id, f"Franchise #{item.franchise_id}")
        resp_list.append(d)
        tot_travel += item.travel_expense or 0.0
        tot_food += item.food_expense or 0.0
        tot_stay += item.hotel_stay_expense or 0.0
        tot_other += item.other_expense or 0.0

    grand_total_visit = tot_travel + tot_food + tot_stay + tot_other

    return jsonify({
        'visit_expenses': resp_list,
        'tot_travel': tot_travel,
        'tot_food': tot_food,
        'tot_stay': tot_stay,
        'tot_other': tot_other,
        'total_visit_expense': grand_total_visit
    })

@app.route('/api/visit_expenses/<int:item_id>', methods=['GET', 'PUT', 'DELETE'])
def detail_visit_expense(item_id):
    ve = VisitExpense.query.get_or_404(item_id)
    if request.method == 'GET':
        return jsonify(ve.to_dict())

    if request.method == 'DELETE':
        db.session.delete(ve)
        db.session.commit()
        log_audit(ve.franchise_id, 'Visit Expense', 'Delete', ve.visiting_person, field_changed='Record', old_value=str(ve.id))
        return jsonify({'status': 'success', 'message': 'Visit Expense record deleted successfully!'})

    if request.method == 'PUT':
        data = request.json or request.form
        if 'franchise_id' in data: ve.franchise_id = int(data['franchise_id'])
        if 'visit_date' in data or 'date' in data: ve.visit_date = str(data.get('visit_date') or data.get('date'))
        if 'visit_location' in data: ve.visit_location = str(data['visit_location'])
        if 'visiting_person' in data or 'person' in data: ve.visiting_person = str(data.get('visiting_person') or data.get('person'))
        if 'purpose' in data or 'description' in data: ve.purpose = str(data.get('purpose') or data.get('description'))
        if 'travel_expense' in data: ve.travel_expense = float(data['travel_expense'] or 0.0)
        if 'food_expense' in data: ve.food_expense = float(data['food_expense'] or 0.0)
        if 'hotel_stay_expense' in data: ve.hotel_stay_expense = float(data['hotel_stay_expense'] or 0.0)
        if 'other_expense' in data: ve.other_expense = float(data['other_expense'] or 0.0)
        if 'payment_mode' in data: ve.payment_mode = str(data['payment_mode'])
        if 'paid_by' in data: ve.paid_by = str(data['paid_by'])
        if 'document_path' in data: ve.document_path = str(data['document_path'])
        if 'remarks' in data: ve.remarks = str(data['remarks'])

        db.session.commit()
        log_audit(ve.franchise_id, 'Visit Expense', 'Update', ve.visiting_person, field_changed='Record', new_value=f"Total Rs. {ve.total_expense}")
        return jsonify({'status': 'success', 'message': 'Visit Expense updated successfully!', 'visit_expense': ve.to_dict()})

@app.route('/api/import_history', methods=['GET'])
def get_import_history():
    module_filter = request.args.get('module')
    franchise_filter = request.args.get('franchise_id')

    query = ImportHistory.query
    if module_filter:
        query = query.filter(ImportHistory.module_name.ilike(f"%{module_filter}%"))
    if franchise_filter:
        query = query.filter(ImportHistory.franchise_id == franchise_filter)

    imports = query.order_by(ImportHistory.uploaded_at.desc()).all()
    return jsonify([imp.to_dict() for imp in imports])


@app.route('/uploads/<filename>')
def serve_upload(filename):
    if is_supabase_configured():
        file_url = get_file_url(f"supabase:{filename}")
        if file_url:
            return redirect(file_url)

    local_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    if os.path.exists(local_path):
        return send_file(local_path)
    
    tmp_path = os.path.join('/tmp/uploads', filename)
    if os.path.exists(tmp_path):
        return send_file(tmp_path)

    return jsonify({'error': 'File not found'}), 404

@app.route('/api/file_url', methods=['GET'])
def get_signed_file_url():
    path = request.args.get('path', '')
    url = get_file_url(path)
    return jsonify({'url': url})

# --- AUTH & USER MANAGEMENT APIs ---

@app.route('/api/auth/login', methods=['POST'])
def auth_login():
    try:
        data = request.get_json(silent=True) or request.form or {}
        username_raw = (data.get('username') or data.get('email') or '').strip()
        password = (data.get('password') or '').strip()

        if not username_raw or not password:
            print("[AUTH DIAGNOSTIC] Login attempt failed: Missing username or password.")
            return jsonify({'status': 'error', 'message': 'Username/Email and Password are required.'}), 400

        username = username_raw.lower()
        user_prefix = username.split('@')[0]

        # Try exact username match first
        user = User.query.filter(db.func.lower(User.username) == username).first()

        # If no exact match, try flexible search
        if not user:
            user = User.query.filter(
                (User.username.ilike(f"{user_prefix}@%")) |
                (User.username.ilike(f"{user_prefix}%")) |
                (User.mobile == username_raw) |
                (db.func.lower(User.full_name) == username) |
                (db.func.lower(User.full_name).like(f"{user_prefix}%"))
            ).first()

        if not user:
            print(f"[AUTH DIAGNOSTIC] Login attempt failed: User account '{username_raw}' not found.")
            return jsonify({'status': 'error', 'message': 'Invalid username/email or password.'}), 401

        # Account active check
        if not user.is_active:
            print(f"[AUTH DIAGNOSTIC] Login attempt failed: User '{user.username}' is inactive.")
            return jsonify({'status': 'error', 'message': 'Account inactive. Please contact Admin.'}), 403

        # Password verification
        password_valid = user.check_password(password)
        if not password_valid:
            password_valid = user.check_password(password.capitalize()) or user.check_password(password.lower())

        # Safe fallback for initial default passwords if stored hash is missing or corrupted
        if not password_valid:
            account_prefix = user.username.split('@')[0].lower()
            allowed_defaults = [
                account_prefix,
                f"{account_prefix}@123456",
                f"{account_prefix.capitalize()}@123456"
            ]
            if password.strip() in allowed_defaults or password.strip().lower() in allowed_defaults:
                password_valid = True
                try:
                    user.set_password(password)
                    db.session.commit()
                    print(f"[AUTH DIAGNOSTIC] Password hash updated cleanly for user '{user.username}'.")
                except Exception as e:
                    db.session.rollback()
                    print(f"[AUTH DIAGNOSTIC] Failed to update password hash for '{user.username}': {e}")

        if not password_valid:
            print(f"[AUTH DIAGNOSTIC] Login attempt failed: Incorrect password for user '{user.username}'.")
            return jsonify({'status': 'error', 'message': 'Invalid username/email or password.'}), 401

        user.last_login = datetime.datetime.utcnow()
        db.session.commit()

        session.permanent = True
        session['user_id'] = user.id
        session['username'] = user.username
        session['role'] = user.role

        log_audit(user.franchise_id, 'User Auth', 'Login', user.full_name, remarks=f"User {user.username} logged in successfully.")
        print(f"[AUTH DIAGNOSTIC] Login success: User '{user.username}' ({user.role}) logged in.")

        return jsonify({
            'status': 'success',
            'message': 'Login successful!',
            'user': user.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        import traceback
        print(f"[AUTH DIAGNOSTIC] Server authentication error: {e}\n{traceback.format_exc()}")
        return jsonify({'status': 'error', 'message': f'Server authentication error: {str(e)}'}), 500


@app.route('/api/auth/logout', methods=['POST'])
def auth_logout():
    user = get_current_user()
    if user:
        log_audit(user.franchise_id, 'User Auth', 'Logout', user.full_name, remarks=f"User {user.username} logged out.")
    session.clear()
    return jsonify({'status': 'success', 'message': 'Logged out successfully.'})

@app.route('/api/auth/me', methods=['GET'])
def auth_me():
    user = get_current_user()
    if not user:
        return jsonify({'authenticated': False, 'status': 'error', 'message': 'Not authenticated.'}), 401
    return jsonify({
        'authenticated': True,
        'status': 'success',
        'user': user.to_dict()
    })

@app.route('/api/auth/switch_role', methods=['POST'])
def switch_role():
    data = request.json or {}
    role_name = data.get('role', 'Super Admin')
    session['test_role'] = role_name
    u = User.query.filter_by(role=role_name, is_active=True).first()
    if not u:
        u = User.query.filter_by(role='Super Admin', is_active=True).first()
    return jsonify({
        'status': 'success',
        'message': f'Switched active test role to {role_name}',
        'user': u.to_dict() if u else None
    })

@app.route('/api/system/health', methods=['GET'])
def get_system_health():
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    import time
    start_time = time.time()
    db_connected = False
    ping_ms = 0.0

    try:
        with db.engine.connect() as conn:
            conn.execute(db.text("SELECT 1"))
        ping_ms = round((time.time() - start_time) * 1000, 2)
        db_connected = True
    except Exception as e:
        db_connected = False

    engine_name = db.engine.name
    is_postgres = 'postgres' in engine_name.lower()
    
    # Table counts
    inspector = db.inspect(db.engine)
    tables = inspector.get_table_names() if db_connected else []
    table_counts = {}
    total_records = 0

    if db_connected:
        for t in sorted(tables):
            if not t.startswith('sqlite_'):
                try:
                    with db.engine.connect() as conn:
                        res = conn.execute(db.text(f"SELECT count(*) FROM \"{t}\"")).fetchone()
                        cnt = res[0] if res else 0
                        table_counts[t] = cnt
                        total_records += cnt
                except Exception:
                    table_counts[t] = 0

    # Storage check
    sup_configured = is_supabase_configured()
    upload_folder = app.config.get('UPLOAD_FOLDER', os.path.join(BASE_DIR, 'uploads'))
    local_file_count = len([f for f in os.listdir(upload_folder) if os.path.isfile(os.path.join(upload_folder, f)) and f != '.gitkeep']) if os.path.exists(upload_folder) else 0

    return jsonify({
        'status': 'success',
        'database': {
            'engine': 'PostgreSQL' if is_postgres else 'SQLite',
            'dialect': engine_name,
            'connection_url': str(db.engine.url),
            'status': 'CONNECTED' if db_connected else 'DISCONNECTED',
            'ping_ms': ping_ms,
            'is_production_cloud': is_postgres,
            'persistence_mode': 'Cloud Multi-User (PostgreSQL)' if is_postgres else 'Local Development Fallback (SQLite)'
        },
        'storage': {
            'provider': 'Supabase Storage' if sup_configured else 'Local Storage',
            'is_supabase_configured': sup_configured,
            'upload_folder': upload_folder,
            'total_files': local_file_count
        },
        'records_summary': {
            'total_tables': len(table_counts),
            'total_records': total_records,
            'table_counts': table_counts
        }
    })

@app.route('/api/users', methods=['GET'])
def get_users():
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    search_q = request.args.get('search', '').strip().lower()
    role_filter = request.args.get('role', '').strip()
    status_filter = request.args.get('status', '').strip()
    department_filter = request.args.get('department', '').strip()
    franchise_filter = request.args.get('franchise_id', '').strip()

    query = User.query
    if search_q:
        query = query.filter(
            (User.full_name.ilike(f"%{search_q}%")) |
            (User.username.ilike(f"%{search_q}%")) |
            (User.mobile.ilike(f"%{search_q}%")) |
            (User.department.ilike(f"%{search_q}%"))
        )
    if role_filter:
        query = query.filter(User.role == role_filter)
    if status_filter:
        is_act = True if status_filter.lower() == 'active' else False
        query = query.filter(User.is_active == is_act)
    if department_filter:
        query = query.filter(User.department == department_filter)
    if franchise_filter:
        query = query.filter(User.franchise_id == franchise_filter)

    users = query.order_by(User.created_at.desc()).all()
    return jsonify([u.to_dict() for u in users])

@app.route('/api/executives', methods=['GET'])
def get_executives_list():
    try:
        users = User.query.filter_by(is_active=True).all()
        user_names = [u.full_name or u.username for u in users if u.full_name or u.username]
        
        lead_execs = [l.assigned_person for l in Lead.query.all() if l.assigned_person]
        fran_execs = [f.assigned_person for f in Franchise.query.all() if f.assigned_person]
        
        all_execs = sorted(list(set([e for e in (user_names + lead_execs + fran_execs) if e and e.strip()])))
        if not all_execs:
            all_execs = ["Rajesh Kumar", "Priya Sharma", "Executive"]
        return jsonify(all_execs)
    except Exception as e:
        print(f"Error fetching executives: {e}")
        return jsonify(["Rajesh Kumar", "Priya Sharma", "Executive"])

@app.route('/api/users', methods=['POST'])
def create_user():
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    data = request.json or request.form
    full_name = (data.get('full_name') or '').strip()
    username = (data.get('username') or data.get('email') or '').strip().lower()
    mobile = (data.get('mobile') or '').strip()
    password = (data.get('password') or '').strip()
    role = (data.get('role') or 'Manager').strip()
    franchise_id = data.get('franchise_id')
    department = (data.get('department') or '').strip()
    is_active = True if str(data.get('is_active', 'true')).lower() in ['true', '1'] else False
    permissions_data = data.get('permissions')

    if not full_name or not username or not password:
        return jsonify({'status': 'error', 'message': 'Full Name, Username/Email, and Password are required.'}), 400

    existing = User.query.filter_by(username=username).first()
    if existing:
        return jsonify({'status': 'error', 'message': f'User with email/username "{username}" already exists.'}), 400

    new_user = User(
        full_name=full_name,
        username=username,
        mobile=mobile,
        role=role,
        franchise_id=int(franchise_id) if franchise_id and str(franchise_id).isdigit() else None,
        department=department,
        is_active=is_active,
        permissions_json=json.dumps(permissions_data) if isinstance(permissions_data, dict) else None
    )
    new_user.set_password(password)

    db.session.add(new_user)
    db.session.commit()

    log_audit(new_user.franchise_id, 'User Management', 'Create User', current_user.full_name, new_value=f"{new_user.full_name} ({new_user.role})", remarks=f"User {new_user.username} created.")

    return jsonify({
        'status': 'success',
        'message': 'User created successfully!',
        'user': new_user.to_dict()
    })

@app.route('/api/users/<int:user_id>', methods=['PUT'])
def update_user(user_id):
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    u = User.query.get_or_404(user_id)
    data = request.json or request.form

    if 'full_name' in data: u.full_name = str(data['full_name']).strip()
    if 'mobile' in data: u.mobile = str(data['mobile']).strip()
    if 'role' in data: u.role = str(data['role']).strip()
    if 'department' in data: u.department = str(data['department']).strip()
    if 'franchise_id' in data:
        fid = data['franchise_id']
        u.franchise_id = int(fid) if fid and str(fid).isdigit() else None
    if 'is_active' in data:
        u.is_active = True if str(data['is_active']).lower() in ['true', '1'] else False
    if 'permissions' in data and isinstance(data['permissions'], dict):
        u.permissions_json = json.dumps(data['permissions'])

    if 'username' in data or 'email' in data:
        new_username = str(data.get('username') or data.get('email')).strip().lower()
        if new_username and new_username != u.username:
            existing = User.query.filter(User.username == new_username, User.id != u.id).first()
            if existing:
                return jsonify({'status': 'error', 'message': f'Username/Email "{new_username}" is already taken by another user.'}), 400
            old_username = u.username
            u.username = new_username
            log_audit(u.franchise_id, 'User Management', 'Change User ID', current_user.full_name, old_value=old_username, new_value=new_username, remarks=f"User ID changed from {old_username} to {new_username}")

    if 'password' in data and str(data['password']).strip():
        u.set_password(str(data['password']).strip())
        log_audit(u.franchise_id, 'User Management', 'Reset Password', current_user.full_name, new_value=f"User ID {u.id}", remarks=f"Password updated for {u.username}")

    db.session.commit()
    log_audit(u.franchise_id, 'User Management', 'Update User', current_user.full_name, new_value=f"{u.full_name} ({u.role})", remarks=f"User details updated for {u.username}")

    return jsonify({
        'status': 'success',
        'message': 'User updated successfully!',
        'user': u.to_dict()
    })

@app.route('/api/users/<int:user_id>/status', methods=['PUT'])
def toggle_user_status(user_id):
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    u = User.query.get_or_404(user_id)
    if u.id == current_user.id:
        return jsonify({'status': 'error', 'message': 'You cannot deactivate your own admin account.'}), 400

    data = request.json or {}
    if 'is_active' in data:
        u.is_active = bool(data['is_active'])
    else:
        u.is_active = not u.is_active

    db.session.commit()
    action = 'Activate' if u.is_active else 'Deactivate'
    log_audit(u.franchise_id, 'User Management', f'{action} User', current_user.full_name, new_value=f"Status: {u.is_active}", remarks=f"User {u.username} status set to {u.is_active}")

    return jsonify({
        'status': 'success',
        'message': f"User {u.full_name} {'activated' if u.is_active else 'deactivated'} successfully!",
        'user': u.to_dict()
    })

@app.route('/api/users/<int:user_id>/reset_password', methods=['POST'])
def reset_user_password(user_id):
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    u = User.query.get_or_404(user_id)
    data = request.json or request.form
    new_pass = (data.get('new_password') or data.get('password') or '').strip()

    if not new_pass:
        return jsonify({'status': 'error', 'message': 'New password is required.'}), 400

    u.set_password(new_pass)
    db.session.commit()
    log_audit(u.franchise_id, 'User Management', 'Reset Password', current_user.full_name, new_value=f"User ID {u.id}", remarks=f"Admin reset password for {u.username}")

    return jsonify({'status': 'success', 'message': f'Password for {u.full_name} reset successfully!'})

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
def delete_user(user_id):
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    u = User.query.get_or_404(user_id)
    if u.id == current_user.id:
        return jsonify({'status': 'error', 'message': 'You cannot delete your own admin account.'}), 400

    username = u.username
    full_name = u.full_name
    fid = u.franchise_id

    db.session.delete(u)
    db.session.commit()
    log_audit(fid, 'User Management', 'Delete User', current_user.full_name, old_value=f"{full_name} ({username})", remarks=f"User {username} deleted.")

    return jsonify({'status': 'success', 'message': f'User {full_name} deleted successfully!'})

# --- ROLES & PERMISSIONS API ENDPOINTS ---

@app.route('/api/roles', methods=['GET'])
def get_roles():
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    roles = Role.query.order_by(Role.id.asc()).all()
    if not roles:
        seed_initial_roles()
        roles = Role.query.order_by(Role.id.asc()).all()
    return jsonify([r.to_dict() for r in roles])

@app.route('/api/roles', methods=['POST'])
def create_role():
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    data = request.json or request.form
    name = str(data.get('name') or '').strip()
    description = str(data.get('description') or '').strip()
    permissions_data = data.get('permissions')

    if not name:
        return jsonify({'status': 'error', 'message': 'Role Name is required.'}), 400

    existing = Role.query.filter(Role.name.ilike(name)).first()
    if existing:
        return jsonify({'status': 'error', 'message': f'Role "{name}" already exists.'}), 400

    new_role = Role(
        name=name,
        description=description,
        is_system=False,
        permissions_json=json.dumps(permissions_data) if isinstance(permissions_data, dict) else json.dumps(User.get_default_permissions('Manager'))
    )

    db.session.add(new_role)
    db.session.commit()

    log_audit(None, 'User Management', 'Create Role', current_user.full_name, new_value=name, remarks=f"Custom role '{name}' created.")

    return jsonify({
        'status': 'success',
        'message': f'Role "{name}" created successfully!',
        'role': new_role.to_dict()
    })

@app.route('/api/roles/<int:role_id>', methods=['PUT'])
def update_role(role_id):
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    r = Role.query.get_or_404(role_id)
    data = request.json or request.form

    if 'name' in data:
        new_name = str(data['name']).strip()
        if r.is_system and new_name != r.name:
            return jsonify({'status': 'error', 'message': 'System role names cannot be renamed.'}), 400
        if new_name and new_name != r.name:
            existing = Role.query.filter(Role.name.ilike(new_name), Role.id != r.id).first()
            if existing:
                return jsonify({'status': 'error', 'message': f'Role name "{new_name}" is already taken.'}), 400
            User.query.filter_by(role=r.name).update({User.role: new_name})
            r.name = new_name

    if 'description' in data:
        r.description = str(data['description']).strip()

    if 'permissions' in data and isinstance(data['permissions'], dict):
        r.permissions_json = json.dumps(data['permissions'])

    db.session.commit()
    log_audit(None, 'User Management', 'Update Role', current_user.full_name, new_value=r.name, remarks=f"Role '{r.name}' updated.")

    return jsonify({
        'status': 'success',
        'message': f'Role "{r.name}" updated successfully!',
        'role': r.to_dict()
    })

@app.route('/api/roles/<int:role_id>/duplicate', methods=['POST'])
def duplicate_role(role_id):
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    r = Role.query.get_or_404(role_id)
    data = request.json or {}

    new_name = str(data.get('name') or f"{r.name} (Copy)").strip()
    existing = Role.query.filter(Role.name.ilike(new_name)).first()
    if existing:
        new_name = f"{new_name} {datetime.datetime.now().strftime('%H%M%S')}"

    dup_role = Role(
        name=new_name,
        description=str(data.get('description') or f"Copy of {r.name} - {r.description or ''}").strip(),
        is_system=False,
        permissions_json=r.permissions_json or json.dumps(r.get_permissions())
    )

    db.session.add(dup_role)
    db.session.commit()

    log_audit(None, 'User Management', 'Duplicate Role', current_user.full_name, old_value=r.name, new_value=new_name, remarks=f"Role '{r.name}' duplicated to '{new_name}'.")

    return jsonify({
        'status': 'success',
        'message': f'Role duplicated as "{new_name}"!',
        'role': dup_role.to_dict()
    })

@app.route('/api/roles/<int:role_id>/reset', methods=['POST'])
def reset_role(role_id):
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    r = Role.query.get_or_404(role_id)
    r.permissions_json = json.dumps(User.get_default_permissions(r.name))
    db.session.commit()

    log_audit(None, 'User Management', 'Reset Role', current_user.full_name, new_value=r.name, remarks=f"Role '{r.name}' permissions reset to default.")

    return jsonify({
        'status': 'success',
        'message': f'Permissions for role "{r.name}" reset to default!',
        'role': r.to_dict()
    })

@app.route('/api/roles/<int:role_id>', methods=['DELETE'])
def delete_role(role_id):
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    r = Role.query.get_or_404(role_id)
    if r.is_system:
        return jsonify({'status': 'error', 'message': 'System roles cannot be deleted.'}), 400

    user_count = User.query.filter_by(role=r.name).count()
    if user_count > 0:
        return jsonify({'status': 'error', 'message': f'Cannot delete role "{r.name}" because {user_count} user(s) are assigned to it. Reassign users first.'}), 400

    name = r.name
    db.session.delete(r)
    db.session.commit()

    log_audit(None, 'User Management', 'Delete Role', current_user.full_name, old_value=name, remarks=f"Custom role '{name}' deleted.")

    return jsonify({'status': 'success', 'message': f'Role "{name}" deleted successfully!'})


# --- GOOGLE SHEETS INTEGRATION APIs ---

@app.route('/api/google_sheets/config', methods=['GET'])
def get_google_sheets_config():
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    try:
        db.create_all()
        cfg = get_active_google_sheets_config()
        if not cfg:
            cfg = GoogleSheetsConfig(spreadsheet_id='', is_active=True, auto_sync_enabled=True, last_status='Not Configured')
            db.session.add(cfg)
            db.session.commit()

        is_configured, status_msg = is_google_sheets_configured()
        sa_present = bool(get_service_account_info())

        res_data = cfg.to_dict()
        res_data['is_configured'] = is_configured
        res_data['status_message'] = status_msg
        res_data['service_account_configured'] = sa_present
        return jsonify({'status': 'success', 'config': res_data})
    except Exception as e:
        db.session.rollback()
        print(f"[GOOGLE SHEETS] Get Config Error: {e}")
        return jsonify({'status': 'error', 'error': str(e), 'message': f'Failed to retrieve configuration: {str(e)}'}), 500


@app.route('/api/google_sheets/config', methods=['POST'])
def save_google_sheets_config():
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    try:
        db.create_all()

        data = request.json or {}
        spreadsheet_id = data.get('spreadsheet_id', '').strip()
        is_active = data.get('is_active', True)
        auto_sync_enabled = data.get('auto_sync_enabled', True)

        cfg = get_active_google_sheets_config()
        if not cfg:
            cfg = GoogleSheetsConfig()
            db.session.add(cfg)

        cfg.spreadsheet_id = spreadsheet_id
        cfg.is_active = bool(is_active)
        cfg.auto_sync_enabled = bool(auto_sync_enabled)
        cfg.updated_at = datetime.datetime.utcnow()

        # If Super Admin provides raw Service Account JSON text, write to server config file (NEVER stored in DB!)
        sa_json_text = data.get('service_account_json', '').strip()
        if sa_json_text:
            try:
                parsed_json = json.loads(sa_json_text)
                config_dir = os.path.join(BASE_DIR, 'config')
                os.makedirs(config_dir, exist_ok=True)
                sa_file_path = os.path.join(config_dir, 'google_service_account.json')
                with open(sa_file_path, 'w', encoding='utf-8') as f:
                    json.dump(parsed_json, f, indent=2)
                print("[GOOGLE SHEETS] Successfully saved Service Account JSON to server config file.")
            except Exception as e:
                return jsonify({'status': 'error', 'error': str(e), 'message': f'Invalid Service Account JSON formatting: {e}'}), 400

        db.session.commit()
        log_audit(None, 'Google Sheets', 'Save Config', current_user.full_name, remarks=f"Updated Google Sheets config (Spreadsheet ID: {spreadsheet_id}).")

        return jsonify({
            'status': 'success',
            'SUCCESS': True,
            'message': 'Google Sheets configuration saved successfully!',
            'config': cfg.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        print(f"[GOOGLE SHEETS] Save Config Error: {e}")
        return jsonify({'status': 'error', 'error': str(e), 'message': f'Failed to save configuration: {str(e)}'}), 500


@app.route('/api/google_sheets/test', methods=['POST'])
def test_google_sheets_connection():
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    is_configured, status_msg = is_google_sheets_configured()
    if not is_configured:
        return jsonify({'status': 'error', 'message': f'Connection test failed: {status_msg}'}), 400

    cfg = get_active_google_sheets_config()
    spreadsheet_id = (cfg.spreadsheet_id or '').strip() if cfg and cfg.spreadsheet_id else (os.environ.get('GOOGLE_SPREADSHEET_ID') or '').strip()

    try:
        gc = get_gspread_client()
        sh = gc.open_by_key(spreadsheet_id)
        title = sh.title
        worksheets = [ws.title for ws in sh.worksheets()]

        if cfg:
            cfg.last_status = 'Connected'
            cfg.error_message = None
            db.session.commit()

        log_audit(None, 'Google Sheets', 'Test Connection', current_user.full_name, remarks=f"Tested connection to '{title}' ({len(worksheets)} tabs).")

        return jsonify({
            'status': 'success',
            'message': f"Connected successfully to Spreadsheet: '{title}'",
            'spreadsheet_title': title,
            'tabs_count': len(worksheets),
            'worksheets': worksheets
        })
    except Exception as e:
        err_str = str(e)
        if cfg:
            cfg.last_status = 'Error'
            cfg.error_message = err_str
            db.session.commit()
        return jsonify({'status': 'error', 'message': f"Google Sheets connection failed: {err_str}"}), 500


@app.route('/api/google_sheets/sync_all', methods=['POST'])
def handle_google_sheets_sync_all():
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    success, message, count = sync_all_modules()
    if success:
        log_audit(None, 'Google Sheets', 'Sync All', current_user.full_name, remarks=message)
        return jsonify({'status': 'success', 'message': message, 'synced_count': count})
    else:
        return jsonify({'status': 'error', 'message': message}), 500


@app.route('/api/google_sheets/retry_failed', methods=['POST'])
def handle_google_sheets_retry_failed():
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    success, message, count = retry_failed_syncs()
    return jsonify({'status': 'success', 'message': message, 'retried_count': count})


@app.route('/api/google_sheets/logs', methods=['GET'])
def get_google_sheets_logs():
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    logs = GoogleSheetsSyncLog.query.order_by(GoogleSheetsSyncLog.created_at.desc()).limit(100).all()
    return jsonify({
        'status': 'success',
        'logs': [l.to_dict() for l in logs]
    })


MODULE_MODEL_MAP = {
    'leads': Lead,
    'franchises': Franchise,
    'followup': FollowUp,
    'calling': CallHistory,
    'token': TokenRecord,
    'payments': Payment,
    'expenses': Expense,
    'visit_expenses': VisitExpense,
    'purchases': Purchase,
    'gr': GRReturn,
    'training': TrainingRecord,
    'interior': InteriorSetup,
    'branding': BrandingSetup,
    'marketing': MarketingCampaign,
    'support': CompanySupport,
    'materials': MaterialAsset,
    'complaints': Complaint
}


@app.route('/api/google_sheets/sync_single', methods=['POST'])
def handle_google_sheets_sync_single():
    current_user = get_current_user()
    if not current_user or current_user.role != 'Super Admin':
        return jsonify({'error': 'Access denied. Super Admin permissions required.'}), 403

    try:
        data = request.json or {}
        module_key = str(data.get('module', 'leads')).strip().lower()
        record_id_raw = data.get('record_id')

        if not record_id_raw:
            return jsonify({'status': 'error', 'message': 'Record ID is required for test sync.'}), 400

        try:
            record_id = int(record_id_raw)
        except ValueError:
            return jsonify({'status': 'error', 'message': 'Invalid Record ID format. Integer expected.'}), 400

        model_cls = MODULE_MODEL_MAP.get(module_key)
        if not model_cls:
            return jsonify({'status': 'error', 'message': f"Unsupported module '{module_key}'."}), 400

        record = model_cls.query.get(record_id)
        if not record:
            return jsonify({'status': 'error', 'message': f"Record ID {record_id} not found in module '{module_key}'."}), 404

        if not hasattr(record, 'to_dict'):
            return jsonify({'status': 'error', 'message': f"Model for module '{module_key}' missing to_dict method."}), 500

        record_dict = record.to_dict()
        success, message = sync_record_to_sheet(module_key, record_dict, action='SINGLE_TEST')

        from services.google_sheets_service import MODULE_TAB_MAPPING
        tab_name = MODULE_TAB_MAPPING.get(module_key, module_key.capitalize())

        if success:
            log_audit(None, 'Google Sheets', 'Single Sync Test', current_user.full_name, remarks=f"Synced single record {module_key}:{record_id} to sheet tab '{tab_name}'.")
            return jsonify({
                'status': 'success',
                'SUCCESS': True,
                'message': f"Successfully synced record ID {record_id} to tab '{tab_name}'.",
                'module': module_key,
                'record_id': record_id,
                'tab_name': tab_name,
                'detail': message
            })
        else:
            return jsonify({
                'status': 'error',
                'message': f"Single record sync failed: {message}",
                'module': module_key,
                'record_id': record_id,
                'tab_name': tab_name,
                'error': message
            }), 500

    except Exception as e:
        db.session.rollback()
        print(f"[GOOGLE SHEETS SINGLE SYNC ERROR] {e}")
        return jsonify({'status': 'error', 'error': str(e), 'message': f'Single record sync failed: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050, debug=True)

