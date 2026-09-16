import datetime
import json
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Franchise(db.Model):
    __tablename__ = 'franchises'
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), unique=True, nullable=False)
    name = db.Column(db.String(150), nullable=False)
    owner_name = db.Column(db.String(150), nullable=False)
    owner_mobile = db.Column(db.String(20), nullable=False)
    owner_email = db.Column(db.String(120), nullable=True)
    city = db.Column(db.String(100), nullable=False)
    state = db.Column(db.String(100), nullable=True)
    assigned_person = db.Column(db.String(100), nullable=False)
    status = db.Column(db.String(50), default='Lead') # Lead, Interested, Agreement, Active, Inactive
    plan_name = db.Column(db.String(100), default='Standard Plan')
    agreed_amount = db.Column(db.Float, default=0.0)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'code': self.code,
            'name': self.name,
            'owner_name': self.owner_name,
            'owner_mobile': self.owner_mobile,
            'owner_email': self.owner_email or '',
            'city': self.city,
            'state': self.state or '',
            'assigned_person': self.assigned_person,
            'status': self.status,
            'plan_name': self.plan_name,
            'agreed_amount': self.agreed_amount,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class Lead(db.Model):
    __tablename__ = 'leads'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=True)
    customer_name = db.Column(db.String(150), nullable=False)
    mobile = db.Column(db.String(20), nullable=False)
    email = db.Column(db.String(120), nullable=True)
    city = db.Column(db.String(100), nullable=True)
    source = db.Column(db.String(100), default='Direct Call')
    status = db.Column(db.String(50), default='New Lead')
    assigned_person = db.Column(db.String(100), nullable=False)
    remarks = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'customer_name': self.customer_name,
            'mobile': self.mobile,
            'email': self.email or '',
            'city': self.city or '',
            'source': self.source,
            'status': self.status,
            'assigned_person': self.assigned_person,
            'remarks': self.remarks or '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class CallHistory(db.Model):
    __tablename__ = 'call_history'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    caller_person = db.Column(db.String(100), nullable=False)
    call_date = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    discussion = db.Column(db.Text, nullable=False)
    requirement = db.Column(db.Text, nullable=True)
    plan_discussed = db.Column(db.String(100), nullable=True)
    objection = db.Column(db.Text, nullable=True)
    next_followup_date = db.Column(db.String(50), nullable=True)
    status = db.Column(db.String(50), default='Completed')
    remarks = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'caller_person': self.caller_person,
            'call_date': self.call_date.strftime('%Y-%m-%d %H:%M:%S') if self.call_date else '',
            'discussion': self.discussion,
            'requirement': self.requirement or '',
            'plan_discussed': self.plan_discussed or '',
            'objection': self.objection or '',
            'next_followup_date': self.next_followup_date or '',
            'status': self.status,
            'remarks': self.remarks or ''
        }

class FollowUp(db.Model):
    __tablename__ = 'follow_ups'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    person = db.Column(db.String(100), nullable=False)
    followup_date = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    discussion = db.Column(db.Text, nullable=False)
    outcome = db.Column(db.Text, nullable=True)
    next_date = db.Column(db.String(50), nullable=True)
    status = db.Column(db.String(50), default='Scheduled')
    remarks = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'person': self.person,
            'followup_date': self.followup_date.strftime('%Y-%m-%d %H:%M:%S') if self.followup_date else '',
            'discussion': self.discussion,
            'outcome': self.outcome or '',
            'next_date': self.next_date or '',
            'status': self.status,
            'remarks': self.remarks or ''
        }

class TokenRecord(db.Model):
    __tablename__ = 'token_records'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    token_amount = db.Column(db.Float, nullable=False)
    payment_date = db.Column(db.String(50), nullable=False)
    payment_mode = db.Column(db.String(50), default='Bank Transfer')
    reference_no = db.Column(db.String(100), nullable=True)
    status = db.Column(db.String(50), default='Received')
    document_path = db.Column(db.String(255), nullable=True)
    remarks = db.Column(db.Text, nullable=True)
    person = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'token_amount': self.token_amount,
            'payment_date': self.payment_date,
            'payment_mode': self.payment_mode,
            'reference_no': self.reference_no or '',
            'status': self.status,
            'document_path': self.document_path or '',
            'remarks': self.remarks or '',
            'person': self.person,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class SurveyVersion(db.Model):
    __tablename__ = 'survey_versions'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    version_number = db.Column(db.Integer, default=1)
    surveyor_name = db.Column(db.String(100), nullable=False)
    survey_date = db.Column(db.String(50), nullable=False)
    area_sqft = db.Column(db.Float, default=0.0)
    frontage_ft = db.Column(db.Float, default=0.0)
    daily_footfall = db.Column(db.Integer, default=0)
    monthly_rent = db.Column(db.Float, default=0.0)
    rating_score = db.Column(db.Float, default=0.0)
    extracted_json = db.Column(db.Text, nullable=True)
    pdf_filename = db.Column(db.String(255), nullable=True)
    pdf_filepath = db.Column(db.String(255), nullable=True)
    remarks = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(50), default='Approved')
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'version_number': self.version_number,
            'surveyor_name': self.surveyor_name,
            'survey_date': self.survey_date,
            'area_sqft': self.area_sqft,
            'frontage_ft': self.frontage_ft,
            'daily_footfall': self.daily_footfall,
            'monthly_rent': self.monthly_rent,
            'rating_score': self.rating_score,
            'extracted_json': self.extracted_json or '{}',
            'pdf_filename': self.pdf_filename or '',
            'pdf_filepath': self.pdf_filepath or '',
            'remarks': self.remarks or '',
            'status': self.status,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class Payment(db.Model):
    __tablename__ = 'payments'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    payment_date = db.Column(db.String(50), nullable=False)
    payment_type = db.Column(db.String(50), default='Franchise Fee')
    payment_mode = db.Column(db.String(50), default='Bank Transfer')
    reference_no = db.Column(db.String(100), nullable=True)
    status = db.Column(db.String(50), default='Received')
    document_path = db.Column(db.String(255), nullable=True)
    remarks = db.Column(db.Text, nullable=True)
    person = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'amount': self.amount,
            'payment_date': self.payment_date,
            'payment_type': self.payment_type,
            'payment_mode': self.payment_mode,
            'reference_no': self.reference_no or '',
            'status': self.status,
            'document_path': self.document_path or '',
            'remarks': self.remarks or '',
            'person': self.person,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class BrandingSetup(db.Model):
    __tablename__ = 'branding_setup'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    signage_cost = db.Column(db.Float, default=0.0)
    vinyl_cost = db.Column(db.Float, default=0.0)
    glowsign_cost = db.Column(db.Float, default=0.0)
    installation_date = db.Column(db.String(50), nullable=True)
    status = db.Column(db.String(50), default='Completed')
    remarks = db.Column(db.Text, nullable=True)
    person = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'signage_cost': self.signage_cost,
            'vinyl_cost': self.vinyl_cost,
            'glowsign_cost': self.glowsign_cost,
            'total_branding_cost': (self.signage_cost or 0) + (self.vinyl_cost or 0) + (self.glowsign_cost or 0),
            'installation_date': self.installation_date or '',
            'status': self.status,
            'remarks': self.remarks or '',
            'person': self.person,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class MarketingCampaign(db.Model):
    __tablename__ = 'marketing_campaigns'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    campaign_name = db.Column(db.String(150), nullable=False)
    channel = db.Column(db.String(100), default='Digital Ads')
    cost = db.Column(db.Float, default=0.0)
    start_date = db.Column(db.String(50), nullable=True)
    end_date = db.Column(db.String(50), nullable=True)
    leads_generated = db.Column(db.Integer, default=0)
    status = db.Column(db.String(50), default='Active')
    remarks = db.Column(db.Text, nullable=True)
    person = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'campaign_name': self.campaign_name,
            'channel': self.channel,
            'cost': self.cost,
            'start_date': self.start_date or '',
            'end_date': self.end_date or '',
            'leads_generated': self.leads_generated,
            'status': self.status,
            'remarks': self.remarks or '',
            'person': self.person,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class TrainingRecord(db.Model):
    __tablename__ = 'training_records'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    batch_name = db.Column(db.String(150), nullable=False)
    staff_count = db.Column(db.Integer, default=0)
    trainer_name = db.Column(db.String(100), nullable=False)
    training_date = db.Column(db.String(50), nullable=False)
    modules_completed = db.Column(db.String(255), default='POS, Customer Care, Inventory')
    pass_rate_percent = db.Column(db.Float, default=100.0)
    status = db.Column(db.String(50), default='Completed')
    remarks = db.Column(db.Text, nullable=True)
    person = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'batch_name': self.batch_name,
            'staff_count': self.staff_count,
            'trainer_name': self.trainer_name,
            'training_date': self.training_date,
            'modules_completed': self.modules_completed,
            'pass_rate_percent': self.pass_rate_percent,
            'status': self.status,
            'remarks': self.remarks or '',
            'person': self.person,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class StoreOperations(db.Model):
    __tablename__ = 'store_operations'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    checklist_score = db.Column(db.Float, default=100.0)
    pos_status = db.Column(db.String(50), default='Operational')
    opening_date = db.Column(db.String(50), nullable=True)
    auditor_name = db.Column(db.String(100), nullable=False)
    audit_date = db.Column(db.String(50), nullable=True)
    status = db.Column(db.String(50), default='Compliant')
    remarks = db.Column(db.Text, nullable=True)
    person = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'checklist_score': self.checklist_score,
            'pos_status': self.pos_status,
            'opening_date': self.opening_date or '',
            'auditor_name': self.auditor_name,
            'audit_date': self.audit_date or '',
            'status': self.status,
            'remarks': self.remarks or '',
            'person': self.person,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class MaterialAsset(db.Model):
    __tablename__ = 'material_assets'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    item_name = db.Column(db.String(150), nullable=False)
    category = db.Column(db.String(100), default='Equipment')
    quantity_given = db.Column(db.Integer, default=0)
    quantity_returned = db.Column(db.Integer, default=0)
    unit_cost = db.Column(db.Float, default=0.0)
    date_given = db.Column(db.String(50), nullable=True)
    date_returned = db.Column(db.String(50), nullable=True)
    status = db.Column(db.String(50), default='Active')
    remarks = db.Column(db.Text, nullable=True)
    person = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'item_name': self.item_name,
            'category': self.category,
            'quantity_given': self.quantity_given,
            'quantity_returned': self.quantity_returned,
            'current_balance': self.quantity_given - self.quantity_returned,
            'unit_cost': self.unit_cost,
            'total_value': (self.quantity_given - self.quantity_returned) * self.unit_cost,
            'date_given': self.date_given or '',
            'date_returned': self.date_returned or '',
            'status': self.status,
            'remarks': self.remarks or '',
            'person': self.person,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class Purchase(db.Model):
    __tablename__ = 'purchases'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    invoice_no = db.Column(db.String(100), nullable=False)
    purchase_date = db.Column(db.String(50), nullable=False)
    item_details = db.Column(db.Text, nullable=False)
    amount = db.Column(db.Float, nullable=False)
    payment_status = db.Column(db.String(50), default='Paid')
    document_path = db.Column(db.String(255), nullable=True)
    remarks = db.Column(db.Text, nullable=True)
    person = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'invoice_no': self.invoice_no,
            'purchase_date': self.purchase_date,
            'item_details': self.item_details,
            'amount': self.amount,
            'payment_status': self.payment_status,
            'document_path': self.document_path or '',
            'remarks': self.remarks or '',
            'person': self.person,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class GRReturn(db.Model):
    __tablename__ = 'gr_returns'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    gr_number = db.Column(db.String(100), nullable=False)
    return_date = db.Column(db.String(50), nullable=False)
    item_details = db.Column(db.Text, nullable=False)
    return_amount = db.Column(db.Float, nullable=False)
    reason = db.Column(db.String(255), nullable=True)
    document_path = db.Column(db.String(255), nullable=True)
    remarks = db.Column(db.Text, nullable=True)
    person = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'gr_number': self.gr_number,
            'return_date': self.return_date,
            'item_details': self.item_details,
            'return_amount': self.return_amount,
            'reason': self.reason or '',
            'document_path': self.document_path or '',
            'remarks': self.remarks or '',
            'person': self.person,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class ExpenseCategory(db.Model):
    __tablename__ = 'expense_categories'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)
    description = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description or '',
            'is_active': self.is_active,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class Expense(db.Model):
    __tablename__ = 'expenses'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    expense_date = db.Column(db.String(50), nullable=False)
    expense_time = db.Column(db.String(50), nullable=True)
    category_id = db.Column(db.Integer, db.ForeignKey('expense_categories.id'), nullable=True)
    category_name = db.Column(db.String(100), nullable=False, default='Miscellaneous')
    sub_category = db.Column(db.String(100), nullable=True)
    description = db.Column(db.Text, nullable=False)
    amount = db.Column(db.Float, nullable=False)
    payment_mode = db.Column(db.String(50), default='Cash') # Cash, Bank Transfer, UPI, Corporate Card, Cheque
    paid_by = db.Column(db.String(100), default='Store') # Store, Franchisee, Company, Field Executive
    person = db.Column(db.String(100), nullable=False) # Responsible Person
    vendor_party = db.Column(db.String(150), nullable=True) # Vendor/Party Name
    bill_invoice_no = db.Column(db.String(100), nullable=True)
    location = db.Column(db.String(100), nullable=True)
    status = db.Column(db.String(50), default='Paid') # Paid, Approved, Pending Approval, Rejected
    document_path = db.Column(db.String(255), nullable=True)
    remarks = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'expense_date': self.expense_date,
            'expense_time': self.expense_time or '',
            'category_id': self.category_id,
            'category_name': self.category_name,
            'sub_category': self.sub_category or '',
            'description': self.description,
            'amount': self.amount,
            'payment_mode': self.payment_mode,
            'paid_by': self.paid_by,
            'person': self.person,
            'vendor_party': self.vendor_party or '',
            'bill_invoice_no': self.bill_invoice_no or '',
            'location': self.location or '',
            'status': self.status,
            'document_path': self.document_path or '',
            'remarks': self.remarks or '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class CompanySupport(db.Model):
    __tablename__ = 'company_support'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    interior_support = db.Column(db.Float, default=0.0)
    training_support = db.Column(db.Float, default=0.0)
    influencer_support = db.Column(db.Float, default=0.0)
    branding_support = db.Column(db.Float, default=0.0)
    marketing_support = db.Column(db.Float, default=0.0)
    material_support = db.Column(db.Float, default=0.0)
    samples_support = db.Column(db.Float, default=0.0)
    travel_support = db.Column(db.Float, default=0.0)
    other_support = db.Column(db.Float, default=0.0)
    date_provided = db.Column(db.String(50), nullable=True)
    status = db.Column(db.String(50), default='Provided')
    remarks = db.Column(db.Text, nullable=True)
    person = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    @property
    def total_investment(self):
        return (
            (self.interior_support or 0.0) +
            (self.training_support or 0.0) +
            (self.influencer_support or 0.0) +
            (self.branding_support or 0.0) +
            (self.marketing_support or 0.0) +
            (self.material_support or 0.0) +
            (self.samples_support or 0.0) +
            (self.travel_support or 0.0) +
            (self.other_support or 0.0)
        )

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'interior_support': self.interior_support or 0.0,
            'training_support': self.training_support or 0.0,
            'influencer_support': self.influencer_support or 0.0,
            'branding_support': self.branding_support or 0.0,
            'marketing_support': self.marketing_support or 0.0,
            'material_support': self.material_support or 0.0,
            'samples_support': self.samples_support or 0.0,
            'travel_support': self.travel_support or 0.0,
            'other_support': self.other_support or 0.0,
            'total_investment': self.total_investment,
            'date_provided': self.date_provided or '',
            'status': self.status,
            'remarks': self.remarks or '',
            'person': self.person,
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class Document(db.Model):
    __tablename__ = 'documents'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    stage_name = db.Column(db.String(100), nullable=False)
    doc_title = db.Column(db.String(150), nullable=False)
    doc_type = db.Column(db.String(50), default='PDF')
    file_name = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(255), nullable=False)
    file_size = db.Column(db.Integer, default=0)
    uploaded_by = db.Column(db.String(100), nullable=False)
    remarks = db.Column(db.Text, nullable=True)
    uploaded_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'stage_name': self.stage_name,
            'doc_title': self.doc_title,
            'doc_type': self.doc_type,
            'file_name': self.file_name,
            'file_path': self.file_path,
            'file_size': self.file_size,
            'uploaded_by': self.uploaded_by,
            'remarks': self.remarks or '',
            'uploaded_at': self.uploaded_at.strftime('%Y-%m-%d %H:%M:%S') if self.uploaded_at else ''
        }

class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=True)
    stage_name = db.Column(db.String(100), nullable=False)
    action = db.Column(db.String(100), nullable=False)
    field_changed = db.Column(db.String(100), nullable=True)
    old_value = db.Column(db.Text, nullable=True)
    new_value = db.Column(db.Text, nullable=True)
    performed_by = db.Column(db.String(100), nullable=False)
    remarks = db.Column(db.Text, nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'stage_name': self.stage_name,
            'action': self.action,
            'field_changed': self.field_changed or '-',
            'old_value': self.old_value or '-',
            'new_value': self.new_value or '-',
            'performed_by': self.performed_by,
            'remarks': self.remarks or '',
            'timestamp': self.timestamp.strftime('%Y-%m-%d %H:%M:%S') if self.timestamp else ''
        }

class ImportHistory(db.Model):
    __tablename__ = 'import_history'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=True)
    module_name = db.Column(db.String(100), nullable=False)
    file_name = db.Column(db.String(255), nullable=False)
    file_path = db.Column(db.String(255), nullable=False)
    file_hash = db.Column(db.String(64), nullable=True)
    file_type = db.Column(db.String(50), default='Excel')
    records_count = db.Column(db.Integer, default=0)
    extracted_data_json = db.Column(db.Text, nullable=True)
    uploaded_by = db.Column(db.String(100), default='System Admin')
    uploaded_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    status = db.Column(db.String(50), default='Completed')
    remarks = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'module_name': self.module_name,
            'file_name': self.file_name,
            'file_path': self.file_path,
            'file_hash': self.file_hash or '',
            'file_type': self.file_type,
            'records_count': self.records_count,
            'extracted_data_json': self.extracted_data_json or '[]',
            'uploaded_by': self.uploaded_by,
            'uploaded_at': self.uploaded_at.strftime('%Y-%m-%d %H:%M:%S') if self.uploaded_at else '',
            'status': self.status,
            'remarks': self.remarks or ''
        }

class VisitExpense(db.Model):
    __tablename__ = 'visit_expenses'
    id = db.Column(db.Integer, primary_key=True)
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=False)
    visit_date = db.Column(db.String(50), nullable=False)
    visit_location = db.Column(db.String(150), nullable=True)
    visiting_person = db.Column(db.String(100), nullable=False)
    purpose = db.Column(db.Text, nullable=True)
    travel_expense = db.Column(db.Float, default=0.0)
    food_expense = db.Column(db.Float, default=0.0)
    hotel_stay_expense = db.Column(db.Float, default=0.0)
    other_expense = db.Column(db.Float, default=0.0)
    payment_mode = db.Column(db.String(50), default='Cash') # Cash, Bank Transfer, UPI, Card
    paid_by = db.Column(db.String(100), default='Company') # Company, Employee, Franchisee
    document_path = db.Column(db.String(255), nullable=True)
    remarks = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    @property
    def total_expense(self):
        return (
            (self.travel_expense or 0.0) +
            (self.food_expense or 0.0) +
            (self.hotel_stay_expense or 0.0) +
            (self.other_expense or 0.0)
        )

    def to_dict(self):
        return {
            'id': self.id,
            'franchise_id': self.franchise_id,
            'visit_date': self.visit_date,
            'visit_location': self.visit_location or '',
            'visiting_person': self.visiting_person,
            'purpose': self.purpose or '',
            'travel_expense': self.travel_expense or 0.0,
            'food_expense': self.food_expense or 0.0,
            'hotel_stay_expense': self.hotel_stay_expense or 0.0,
            'other_expense': self.other_expense or 0.0,
            'total_expense': self.total_expense,
            'payment_mode': self.payment_mode,
            'paid_by': self.paid_by,
            'document_path': self.document_path or '',
            'remarks': self.remarks or '',
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(150), nullable=False)
    username = db.Column(db.String(120), unique=True, nullable=False) # Email / Username
    mobile = db.Column(db.String(20), nullable=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(50), nullable=False, default='Manager') # Admin, Manager, Field Executive, Accountant, Franchisee
    franchise_id = db.Column(db.Integer, db.ForeignKey('franchises.id'), nullable=True)
    department = db.Column(db.String(100), nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    last_login = db.Column(db.DateTime, nullable=True)
    permissions_json = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    franchise = db.relationship('Franchise', backref=db.backref('assigned_users', lazy=True))

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def get_permissions(self):
        if self.permissions_json:
            try:
                return json.loads(self.permissions_json)
            except Exception:
                pass
        return self.get_default_permissions(self.role)

    @staticmethod
    def get_default_permissions(role):
        all_modules = [
            'leads', 'calling', 'followup', 'survey', 'visit', 'payments', 
            'expenses', 'purchase', 'gr', 'training', 'interior', 'marketing', 
            'reports', 'settings', 'user_management'
        ]
        
        if role == 'Admin':
            return {
                m: {'view': True, 'add': True, 'edit': True, 'delete': True, 'approve': True, 'export': True}
                for m in all_modules
            }
        elif role == 'Manager':
            return {
                m: {'view': True, 'add': True, 'edit': True, 'delete': False, 'approve': True, 'export': True}
                for m in all_modules
            }
        elif role == 'Field Executive':
            fe_modules = ['leads', 'calling', 'followup', 'survey', 'visit', 'training', 'interior']
            return {
                m: {'view': m in fe_modules, 'add': m in fe_modules, 'edit': m in fe_modules, 'delete': False, 'approve': False, 'export': False}
                for m in all_modules
            }
        elif role == 'Accountant':
            acc_modules = ['payments', 'expenses', 'purchase', 'gr', 'reports']
            return {
                m: {'view': m in acc_modules, 'add': m in acc_modules, 'edit': m in acc_modules, 'delete': False, 'approve': True, 'export': True}
                for m in all_modules
            }
        elif role == 'Franchisee':
            fr_modules = ['survey', 'payments', 'expenses', 'purchase', 'gr', 'training', 'interior', 'marketing']
            return {
                m: {'view': m in fr_modules, 'add': m in fr_modules, 'edit': False, 'delete': False, 'approve': False, 'export': False}
                for m in all_modules
            }
        return {
            m: {'view': True, 'add': False, 'edit': False, 'delete': False, 'approve': False, 'export': False}
            for m in all_modules
        }

    def has_permission(self, module, action):
        if self.role == 'Admin':
            return True
        perms = self.get_permissions()
        mod_perms = perms.get(module, {})
        return bool(mod_perms.get(action, False))

    def to_dict(self):
        return {
            'id': self.id,
            'full_name': self.full_name,
            'username': self.username,
            'mobile': self.mobile or '',
            'role': self.role,
            'franchise_id': self.franchise_id,
            'franchise_name': self.franchise.name if self.franchise else 'All Franchises',
            'department': self.department or '',
            'is_active': self.is_active,
            'last_login': self.last_login.strftime('%Y-%m-%d %H:%M:%S') if self.last_login else 'Never',
            'permissions': self.get_permissions(),
            'created_at': self.created_at.strftime('%Y-%m-%d %H:%M:%S') if self.created_at else ''
        }


