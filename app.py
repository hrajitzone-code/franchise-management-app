import os
import json
import datetime
import hashlib
import re
import csv
import openpyxl
from pypdf import PdfReader
from werkzeug.utils import secure_filename
from flask import Flask, render_template, request, jsonify, send_file, Response, redirect
from dotenv import load_dotenv

# Load environment variables from .env if present
load_dotenv()

from models import (
    db, Franchise, Lead, CallHistory, FollowUp, TokenRecord, SurveyVersion, Payment,
    BrandingSetup, MarketingCampaign, TrainingRecord, StoreOperations, MaterialAsset,
    Purchase, GRReturn, ExpenseCategory, Expense, CompanySupport, Document, AuditLog,
    ImportHistory, VisitExpense
)
from services.report_service import generate_pdf_report, generate_excel_report, generate_word_report
from services.storage_service import upload_file, get_file_url, is_supabase_configured

app = Flask(__name__)
BASE_DIR = os.path.abspath(os.path.dirname(__file__))

db_url = os.environ.get('DATABASE_URL')
if db_url:
    if db_url.startswith('postgres://'):
        db_url = db_url.replace('postgres://', 'postgresql://', 1)
    app.config['SQLALCHEMY_DATABASE_URI'] = db_url
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
    }
else:
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
    app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{db_path}"

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

with app.app_context():
    try:
        db.create_all()
        seed_default_expense_categories()
    except Exception as e:
        print(f"Postponed app context initialization: {e}")

@app.errorhandler(500)
def handle_500_error(e):
    import traceback
    tb = traceback.format_exc()
    return f"<h1>500 Internal Server Error</h1><pre>{tb}</pre>", 500

@app.errorhandler(Exception)
def handle_general_exception(e):
    import traceback
    tb = traceback.format_exc()
    return f"<h1>Unhandled Server Exception</h1><pre>{tb}</pre>", 500

def log_audit(franchise_id, stage_name, action, performed_by, field_changed='-', old_value='-', new_value='-', remarks=''):
    try:
        audit = AuditLog(
            franchise_id=franchise_id,
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
    active_franchises = sum(1 for f in franchises if f.status in ['Active', 'Franchise Opening'])
    total_leads = Lead.query.count()

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
    for f in franchises:
        f_purchases = sum(p.amount for p in Purchase.query.filter_by(franchise_id=f.id).all())
        f_gr = sum(gr.return_amount for gr in GRReturn.query.filter_by(franchise_id=f.id).all())
        f_net = f_purchases - f_gr
        f_gr_pct = (f_gr / f_purchases * 100) if f_purchases > 0 else 0.0
        
        f_token_rec = sum(t.token_amount for t in TokenRecord.query.filter_by(franchise_id=f.id, status='Received').all())
        f_fee_rec = sum(p.amount for p in Payment.query.filter_by(franchise_id=f.id, status='Received').all())
        f_tot_rec = f_token_rec + f_fee_rec
        f_outstanding = f.agreed_amount - f_tot_rec

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

        cards_data.append({
            'franchise': f.to_dict(),
            'total_purchase': f_purchases,
            'total_gr': f_gr,
            'net_purchase': f_net,
            'gr_percent': round(f_gr_pct, 2),
            'received': f_tot_rec,
            'outstanding': max(0.0, f_outstanding),
            'records_count': records_count or 12
        })

    return jsonify({
        'total_franchises': total_franchises,
        'active_franchises': active_franchises,
        'total_leads': total_leads,
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

        franchise = Franchise(
            code=code, name=name, owner_name=owner_name, owner_mobile=owner_mobile,
            owner_email=owner_email, city=city, state=state, assigned_person=assigned_person,
            plan_name=plan_name, status=status, agreed_amount=agreed_amount
        )
        db.session.add(franchise)
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
        'documents': [d.to_dict() for d in documents],
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
        f_id = int(data.get('franchise_id', 1))
        lead = Lead(
            franchise_id=f_id,
            customer_name=data.get('customer_name', 'New Customer'),
            mobile=data.get('mobile', ''),
            email=data.get('email', ''),
            city=data.get('city', ''),
            source=data.get('source', 'Direct Call'),
            status=data.get('status', 'New Lead'),
            assigned_person=data.get('assigned_person', 'Executive'),
            remarks=data.get('remarks', '')
        )
        db.session.add(lead)
        db.session.commit()
        log_audit(f_id, 'Leads', 'CREATE', lead.assigned_person, 'Lead Entry', None, lead.customer_name, f"Created Lead: {lead.customer_name}")
        return jsonify({'status': 'success', 'lead': lead.to_dict()})
    
    leads = Lead.query.order_by(Lead.created_at.desc()).all()
    return jsonify([l.to_dict() for l in leads])

@app.route('/api/leads/<int:l_id>', methods=['PUT', 'DELETE'])
def update_delete_lead(l_id):
    lead = Lead.query.get_or_404(l_id)
    if request.method == 'DELETE':
        db.session.delete(lead)
        db.session.commit()
        log_audit(lead.franchise_id, 'Leads', 'DELETE', 'Admin', 'Lead Record', lead.customer_name, 'Deleted', f"Deleted Lead #{l_id}")
        return jsonify({'status': 'success', 'message': f"Lead #{l_id} deleted."})
    
    data = request.json
    lead.customer_name = data.get('customer_name', lead.customer_name)
    lead.mobile = data.get('mobile', lead.mobile)
    lead.email = data.get('email', lead.email)
    lead.city = data.get('city', lead.city)
    lead.source = data.get('source', lead.source)
    lead.status = data.get('status', lead.status)
    lead.assigned_person = data.get('assigned_person', lead.assigned_person)
    lead.remarks = data.get('remarks', lead.remarks)
    db.session.commit()
    log_audit(lead.franchise_id, 'Leads', 'UPDATE', lead.assigned_person, 'Lead Record', None, lead.customer_name, f"Updated Lead #{l_id}")
    return jsonify({'status': 'success', 'lead': lead.to_dict()})

@app.route('/api/followups', methods=['GET', 'POST'])
def manage_followups():
    if request.method == 'POST':
        data = request.json or request.form
        f_id = int(data.get('franchise_id', 1))
        follow = FollowUp(
            franchise_id=f_id,
            person=data.get('person', 'Executive'),
            discussion=data.get('discussion', ''),
            outcome=data.get('outcome', ''),
            next_date=data.get('next_date', ''),
            status=data.get('status', 'Scheduled'),
            remarks=data.get('remarks', '')
        )
        db.session.add(follow)
        db.session.commit()
        log_audit(f_id, 'Follow-ups', 'CREATE', follow.person, 'Followup Entry', None, follow.discussion[:30], 'Created Followup Log')
        return jsonify({'status': 'success', 'followup': follow.to_dict()})
    
    followups = FollowUp.query.order_by(FollowUp.followup_date.desc()).all()
    return jsonify([f.to_dict() for f in followups])

@app.route('/api/followups/<int:f_id>', methods=['PUT', 'DELETE'])
def update_delete_followup(f_id):
    f = FollowUp.query.get_or_404(f_id)
    if request.method == 'DELETE':
        db.session.delete(f)
        db.session.commit()
        log_audit(f.franchise_id, 'Follow-ups', 'DELETE', 'Admin', 'Followup Record', f.discussion[:30], 'Deleted', f"Deleted Followup #{f_id}")
        return jsonify({'status': 'success', 'message': f"Followup #{f_id} deleted."})
    
    data = request.json
    f.person = data.get('person', f.person)
    f.discussion = data.get('discussion', f.discussion)
    f.outcome = data.get('outcome', f.outcome)
    f.next_date = data.get('next_date', f.next_date)
    f.status = data.get('status', f.status)
    f.remarks = data.get('remarks', f.remarks)
    db.session.commit()
    log_audit(f.franchise_id, 'Follow-ups', 'UPDATE', f.person, 'Followup Record', None, f.discussion[:30], f"Updated Followup #{f_id}")
    return jsonify({'status': 'success', 'followup': f.to_dict()})

# --- TOKEN & PAYMENTS ---

@app.route('/api/tokens', methods=['GET', 'POST'])
def manage_tokens():
    if request.method == 'POST':
        data = request.json or request.form
        t = TokenRecord(
            franchise_id=int(data.get('franchise_id', 1)),
            token_amount=float(data.get('token_amount', 0.0)),
            payment_date=data.get('payment_date', datetime.date.today().strftime('%Y-%m-%d')),
            payment_mode=data.get('payment_mode', 'Bank Transfer'),
            reference_no=data.get('reference_no', ''),
            status=data.get('status', 'Received'),
            remarks=data.get('remarks', ''),
            person=data.get('person', 'Executive')
        )
        db.session.add(t)
        db.session.commit()
        log_audit(t.franchise_id, 'Token Advance', 'CREATE', t.person, 'Token Record', None, f"Rs.{t.token_amount}", 'Recorded Token Payment')
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
        p = Payment(
            franchise_id=int(data.get('franchise_id', 1)),
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
        log_audit(p.franchise_id, 'Payment', 'CREATE', p.person, 'Payment Receipt', None, f"Rs.{p.amount}", f"Received {p.payment_type}")
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

# --- CALL HISTORY & SURVEY ---

@app.route('/api/calls/<int:c_id>', methods=['PUT', 'DELETE'])
def update_delete_call(c_id):
    c = CallHistory.query.get_or_404(c_id)
    if request.method == 'DELETE':
        db.session.delete(c)
        db.session.commit()
        log_audit(c.franchise_id, 'Calling History', 'DELETE', 'Admin', 'Call Log', c.discussion[:30], 'Deleted', f"Deleted Call #{c_id}")
        return jsonify({'status': 'success', 'message': f"Call #{c_id} deleted."})
    
    data = request.json
    c.caller_person = data.get('caller_person', c.caller_person)
    c.discussion = data.get('discussion', c.discussion)
    c.requirement = data.get('requirement', c.requirement)
    c.plan_discussed = data.get('plan_discussed', c.plan_discussed)
    c.objection = data.get('objection', c.objection)
    c.next_followup_date = data.get('next_followup_date', c.next_followup_date)
    c.status = data.get('status', c.status)
    c.remarks = data.get('remarks', c.remarks)
    db.session.commit()
    log_audit(c.franchise_id, 'Calling History', 'UPDATE', c.caller_person, 'Call Log', None, c.discussion[:30], f"Updated Call #{c_id}")
    return jsonify({'status': 'success', 'call': c.to_dict()})

@app.route('/api/surveys', methods=['GET'])
def get_surveys():
    surveys = SurveyVersion.query.order_by(SurveyVersion.created_at.desc()).all()
    return jsonify([s.to_dict() for s in surveys])

@app.route('/api/surveys/<int:s_id>', methods=['PUT', 'DELETE'])
def update_delete_survey(s_id):
    s = SurveyVersion.query.get_or_404(s_id)
    if request.method == 'DELETE':
        db.session.delete(s)
        db.session.commit()
        log_audit(s.franchise_id, 'Survey/Visit', 'DELETE', 'Admin', 'Survey Version', f"V{s.version_number}", 'Deleted', f"Deleted Survey #{s_id}")
        return jsonify({'status': 'success', 'message': f"Survey #{s_id} deleted."})

    data = request.json
    s.surveyor_name = data.get('surveyor_name', s.surveyor_name)
    s.survey_date = data.get('survey_date', s.survey_date)
    s.area_sqft = float(data.get('area_sqft', s.area_sqft))
    s.frontage_ft = float(data.get('frontage_ft', s.frontage_ft))
    s.daily_footfall = int(data.get('daily_footfall', s.daily_footfall))
    s.monthly_rent = float(data.get('monthly_rent', s.monthly_rent))
    s.rating_score = float(data.get('rating_score', s.rating_score))
    s.status = data.get('status', s.status)
    s.remarks = data.get('remarks', s.remarks)
    db.session.commit()
    log_audit(s.franchise_id, 'Survey/Visit', 'UPDATE', s.surveyor_name, 'Survey Version', None, f"V{s.version_number}", f"Updated Survey #{s_id}")
    return jsonify({'status': 'success', 'survey': s.to_dict()})

# --- PURCHASES, GR, MATERIALS, COMPANY SUPPORT ---

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
    return jsonify({'status': 'success', 'material': m.to_dict()})

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

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5050, debug=True)
