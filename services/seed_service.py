import datetime
from werkzeug.security import generate_password_hash
from models import (
    db, User, Role, Lead, CallHistory, FollowUp, TokenRecord, SurveyVersion,
    ApprovalAgreement, Franchise, BrandingSetup, MarketingCampaign, TrainingRecord,
    StoreOperations, MaterialAsset, Purchase, GRReturn, ExpenseCategory, Expense,
    CompanySupport, Document, AuditLog, VisitExpense, Complaint, Task, Notification
)

def run_seed_all():
    # 1. Seed Expense Categories
    categories = [
        ("Rent & Lease", "Store premises monthly rental payments"),
        ("Utilities (Electricity/Water)", "Electricity, water, and power backup expenses"),
        ("Local Maintenance & Repairs", "Store maintenance, cleaning, and handyman services"),
        ("Local Marketing & Banners", "Local flyers, newspaper ads, and neighborhood promotion"),
        ("Staff Welfare & Tea/Coffee", "Employee refreshments, tea/coffee, and office supplies"),
        ("Logistics & Freight", "Local transport and parcel delivery costs"),
        ("Travel & Hotel Stay", "Executive travel, hotel accommodation, and field visits"),
        ("Branding & Signage", "Store front glowsigns, vinyls, and display boards"),
        ("Interior & Fixtures", "Furniture, lighting, and civil modifications"),
        ("Miscellaneous", "Unclassified routine operational expenses")
    ]
    for name, desc in categories:
        if not ExpenseCategory.query.filter_by(name=name).first():
            db.session.add(ExpenseCategory(name=name, description=desc, is_active=True))

    # 2. Seed System Roles
    system_roles = ['Super Admin', 'Admin', 'Manager', 'Field Executive', 'Accountant', 'Franchisee']
    for r_name in system_roles:
        r = Role.query.filter_by(name=r_name).first()
        if not r:
            r = Role(
                name=r_name,
                description=f"System default role for {r_name}",
                is_system=True,
                permissions_json=db.session.get_bind().dialect.name # placeholder handled by model
            )
            db.session.add(r)

    # 3. Seed Standard Users with Demo Logins
    demo_users = [
        {
            "username": "admin@coralbios.com",
            "full_name": "Super Admin",
            "mobile": "+91 9876543210",
            "role": "Super Admin",
            "department": "Executive Management",
            "is_active": True,
            "password": "Admin@123"
        },
        {
            "username": "manager@coralbios.com",
            "full_name": "General Manager",
            "mobile": "+91 9876543211",
            "role": "Admin",
            "department": "Franchise Operations",
            "is_active": True,
            "password": "Admin@123"
        },
        {
            "username": "executive@coralbios.com",
            "full_name": "Rajesh Singh",
            "mobile": "+91 9876543212",
            "role": "Field Executive",
            "department": "Business Development",
            "is_active": True,
            "password": "Exec@123"
        },
        {
            "username": "accountant@coralbios.com",
            "full_name": "Priya Nair",
            "mobile": "+91 9876543213",
            "role": "Accountant",
            "department": "Finance & Audit",
            "is_active": True,
            "password": "Acc@123"
        },
        {
            "username": "franchisee@coralbios.com",
            "full_name": "Amit Singh (Mumbai Hub)",
            "mobile": "+91 9876543214",
            "role": "Franchisee",
            "department": "Store Owner",
            "is_active": True,
            "password": "Fran@123"
        },
        {
            "username": "ananya.sharma@coralbios.com",
            "full_name": "Ananya Sharma",
            "mobile": "+91 9876543215",
            "role": "Field Executive",
            "department": "Business Development",
            "is_active": True,
            "password": "Exec@123"
        },
        {
            "username": "vikram.singh@coralbios.com",
            "full_name": "Vikram Singh",
            "mobile": "+91 9876543216",
            "role": "Manager",
            "department": "Territory Manager",
            "is_active": True,
            "password": "Admin@123"
        },
        {
            "username": "pankaj.patel@coralbios.com",
            "full_name": "Pankaj Patel",
            "mobile": "+91 9876543217",
            "role": "Franchisee",
            "department": "Store Owner",
            "is_active": True,
            "password": "Fran@123"
        }
    ]

    for u_data in demo_users:
        usr = User.query.filter_by(username=u_data["username"]).first()
        if not usr:
            usr = User(
                username=u_data["username"],
                full_name=u_data["full_name"],
                mobile=u_data["mobile"],
                role=u_data["role"],
                department=u_data["department"],
                is_active=u_data["is_active"],
                last_login=datetime.datetime.utcnow()
            )
            usr.set_password(u_data["password"])
            db.session.add(usr)

    db.session.commit()

    # 4. Seed Franchises (8+ Core Franchises with "Coral Bios" Branding)
    sample_franchises = [
        {"code": "FR-MUMBAI", "name": "Coral Bios - Mumbai Hub", "owner_name": "Amit Singh", "owner_mobile": "+91 9820011223", "owner_email": "amit.mumbai@coralbios.com", "city": "Mumbai", "state": "Maharashtra", "assigned_person": "Vikram Singh", "plan_name": "Plan B (Standard)", "status": "Active", "agreed_amount": 500000.0},
        {"code": "FR-DELHI", "name": "Coral Bios - Delhi Central", "owner_name": "Vikram Yadav", "owner_mobile": "+91 9811022334", "owner_email": "vikram.delhi@coralbios.com", "city": "Delhi", "state": "NCR", "assigned_person": "Vikram Singh", "plan_name": "Plan C (Master)", "status": "Active", "agreed_amount": 1000000.0},
        {"code": "FR-BANGALORE", "name": "Coral Bios - Bengaluru South", "owner_name": "Kavita Shah", "owner_mobile": "+91 9845033445", "owner_email": "kavita.blr@coralbios.com", "city": "Bengaluru", "state": "Karnataka", "assigned_person": "Ananya Sharma", "plan_name": "Plan B (Standard)", "status": "Setup", "agreed_amount": 500000.0},
        {"code": "FR-SURAT", "name": "Coral Bios - Surat Prime", "owner_name": "Rajesh Shah", "owner_mobile": "+91 9825012345", "owner_email": "rajesh.surat@coralbios.com", "city": "Surat", "state": "Gujarat", "assigned_person": "Rajesh Singh", "plan_name": "Plan B (Standard)", "status": "Active", "agreed_amount": 500000.0},
        {"code": "FR-AHMEDABAD", "name": "Coral Bios - Ahmedabad West", "owner_name": "Pankaj Patel", "owner_mobile": "+91 9879012345", "owner_email": "pankaj.ahmedabad@coralbios.com", "city": "Ahmedabad", "state": "Gujarat", "assigned_person": "Ananya Sharma", "plan_name": "Plan C (Master)", "status": "Pending", "agreed_amount": 800000.0},
        {"code": "FR-PUNE", "name": "Coral Bios - Pune City", "owner_name": "Deepak Joshi", "owner_mobile": "+91 9822055667", "owner_email": "deepak.pune@coralbios.com", "city": "Pune", "state": "Maharashtra", "assigned_person": "Rajesh Singh", "plan_name": "Plan A (Express)", "status": "Active", "agreed_amount": 300000.0},
        {"code": "FR-JAIPUR", "name": "Coral Bios - Jaipur Station", "owner_name": "Manish Sharma", "owner_mobile": "+91 9414012345", "owner_email": "manish.jaipur@coralbios.com", "city": "Jaipur", "state": "Rajasthan", "assigned_person": "Vikram Singh", "plan_name": "Plan B (Standard)", "status": "Active", "agreed_amount": 550000.0},
        {"code": "FR-INDORE", "name": "Coral Bios - Indore Square", "owner_name": "Vijay Chouhan", "owner_mobile": "+91 9826012345", "owner_email": "vijay.indore@coralbios.com", "city": "Indore", "state": "Madhya Pradesh", "assigned_person": "Rajesh Singh", "plan_name": "Plan A (Express)", "status": "Active", "agreed_amount": 320000.0}
    ]

    fran_objs = {}
    for item in sample_franchises:
        existing = Franchise.query.filter_by(code=item['code']).first()
        if not existing:
            f = Franchise(**item)
            db.session.add(f)
            db.session.flush()
            fran_objs[f.code] = f
        else:
            fran_objs[existing.code] = existing

    db.session.commit()

    # 5. Seed Interconnected Leads (30+ Realistic Indian Leads)
    raw_leads = [
        {"customer_name": "Rohan Mehta", "mobile": "+91 9824098765", "email": "rohan.mehta@gmail.com", "city": "Surat", "state": "Gujarat", "location": "Ring Road Market", "source": "Website", "status": "Interested", "assigned_person": "Rajesh Singh", "plan_discussed": "Plan B (Standard)", "investment_capacity": "Rs. 5-7 Lakhs", "shop_availability": "Owned Property", "inquiry_date": "2026-09-01"},
        {"customer_name": "Neha Patel", "mobile": "+91 9879123456", "email": "neha.patel@yahoo.com", "city": "Ahmedabad", "state": "Gujarat", "location": "SG Highway", "source": "Social Media", "status": "Site Visit", "assigned_person": "Ananya Sharma", "plan_discussed": "Plan C (Master)", "investment_capacity": "Rs. 10 Lakhs+", "shop_availability": "Looking for Property", "inquiry_date": "2026-09-02"},
        {"customer_name": "Priya Sharma", "mobile": "+91 9820112233", "email": "priya.sharma@hotmail.com", "city": "Mumbai", "state": "Maharashtra", "location": "Andheri West", "source": "Referral", "status": "Token Received", "assigned_person": "Rajesh Singh", "plan_discussed": "Plan A (Express)", "investment_capacity": "Rs. 3-5 Lakhs", "shop_availability": "Rented", "inquiry_date": "2026-09-03"},
        {"customer_name": "Amit Singh", "mobile": "+91 9820011223", "email": "amit.mumbai@coralbios.com", "city": "Mumbai", "state": "Maharashtra", "location": "Bandra Kurla Complex", "source": "Website", "status": "Converted", "assigned_person": "Vikram Singh", "plan_discussed": "Plan B (Standard)", "investment_capacity": "Rs. 6 Lakhs", "shop_availability": "Owned Property", "inquiry_date": "2026-08-15", "franchise_id": fran_objs.get("FR-MUMBAI").id if "FR-MUMBAI" in fran_objs else None},
        {"customer_name": "Pooja Verma", "mobile": "+91 9827033445", "email": "pooja.verma@gmail.com", "city": "Indore", "state": "Madhya Pradesh", "location": "Vijay Nagar", "source": "Advertisement", "status": "Follow-up", "assigned_person": "Ananya Sharma", "plan_discussed": "Plan B (Standard)", "investment_capacity": "Rs. 5 Lakhs", "shop_availability": "Available", "inquiry_date": "2026-09-04"},
        {"customer_name": "Rahul Joshi", "mobile": "+91 9826044556", "email": "rahul.joshi@rediffmail.com", "city": "Bhopal", "state": "Madhya Pradesh", "location": "MP Nagar Zone 1", "source": "Exhibition", "status": "Negotiation", "assigned_person": "Rajesh Singh", "plan_discussed": "Plan A (Express)", "investment_capacity": "Rs. 4 Lakhs", "shop_availability": "Owned Property", "inquiry_date": "2026-09-05"},
        {"customer_name": "Anjali Gupta", "mobile": "+91 9414055667", "email": "anjali.gupta@gmail.com", "city": "Jaipur", "state": "Rajasthan", "location": "Malviya Nagar", "source": "Website", "status": "New", "assigned_person": "Ananya Sharma", "plan_discussed": "Plan C (Master)", "investment_capacity": "Rs. 8-10 Lakhs", "shop_availability": "Looking for Property", "inquiry_date": "2026-09-18"},
        {"customer_name": "Vikram Yadav", "mobile": "+91 9811022334", "email": "vikram.delhi@coralbios.com", "city": "Delhi", "state": "NCR", "location": "Connaught Place", "source": "Referral", "status": "Converted", "assigned_person": "Vikram Singh", "plan_discussed": "Plan C (Master)", "investment_capacity": "Rs. 12 Lakhs", "shop_availability": "Rented", "inquiry_date": "2026-08-10", "franchise_id": fran_objs.get("FR-DELHI").id if "FR-DELHI" in fran_objs else None},
        {"customer_name": "Suresh Kumar", "mobile": "+91 9849066778", "email": "suresh.kumar@yahoo.in", "city": "Hyderabad", "state": "Telangana", "location": "Banjara Hills", "source": "Social Media", "status": "Follow-up", "assigned_person": "Rajesh Singh", "plan_discussed": "Plan B (Standard)", "investment_capacity": "Rs. 5-6 Lakhs", "shop_availability": "Available", "inquiry_date": "2026-09-06"},
        {"customer_name": "Kavita Shah", "mobile": "+91 9845033445", "email": "kavita.blr@coralbios.com", "city": "Bengaluru", "state": "Karnataka", "location": "Indiranagar 100ft Road", "source": "Website", "status": "Converted", "assigned_person": "Ananya Sharma", "plan_discussed": "Plan B (Standard)", "investment_capacity": "Rs. 6 Lakhs", "shop_availability": "Owned Property", "inquiry_date": "2026-08-20", "franchise_id": fran_objs.get("FR-BANGALORE").id if "FR-BANGALORE" in fran_objs else None},
        {"customer_name": "Manish Sharma", "mobile": "+91 9414012345", "email": "manish.jaipur@coralbios.com", "city": "Jaipur", "state": "Rajasthan", "location": "MI Road Market", "source": "Existing Customer", "status": "Converted", "assigned_person": "Vikram Singh", "plan_discussed": "Plan B (Standard)", "investment_capacity": "Rs. 5.5 Lakhs", "shop_availability": "Owned Property", "inquiry_date": "2026-08-12", "franchise_id": fran_objs.get("FR-JAIPUR").id if "FR-JAIPUR" in fran_objs else None},
        {"customer_name": "Rajesh Shah", "mobile": "+91 9825012345", "email": "rajesh.surat@coralbios.com", "city": "Surat", "state": "Gujarat", "location": "Ghod Dod Road", "source": "Referral", "status": "Converted", "assigned_person": "Rajesh Singh", "plan_discussed": "Plan B (Standard)", "investment_capacity": "Rs. 5 Lakhs", "shop_availability": "Available", "inquiry_date": "2026-08-01", "franchise_id": fran_objs.get("FR-SURAT").id if "FR-SURAT" in fran_objs else None},
        {"customer_name": "Pankaj Patel", "mobile": "+91 9879012345", "email": "pankaj.ahmedabad@coralbios.com", "city": "Ahmedabad", "state": "Gujarat", "location": "C.G. Road", "source": "Exhibition", "status": "Converted", "assigned_person": "Ananya Sharma", "plan_discussed": "Plan C (Master)", "investment_capacity": "Rs. 8 Lakhs", "shop_availability": "Rented", "inquiry_date": "2026-08-05", "franchise_id": fran_objs.get("FR-AHMEDABAD").id if "FR-AHMEDABAD" in fran_objs else None},
        {"customer_name": "Deepak Joshi", "mobile": "+91 9822055667", "email": "deepak.pune@coralbios.com", "city": "Pune", "state": "Maharashtra", "location": "FC Road", "source": "Website", "status": "Converted", "assigned_person": "Rajesh Singh", "plan_discussed": "Plan A (Express)", "investment_capacity": "Rs. 3.5 Lakhs", "shop_availability": "Owned Property", "inquiry_date": "2026-08-08", "franchise_id": fran_objs.get("FR-PUNE").id if "FR-PUNE" in fran_objs else None},
        {"customer_name": "Vijay Chouhan", "mobile": "+91 9826012345", "email": "vijay.indore@coralbios.com", "city": "Indore", "state": "Madhya Pradesh", "location": "Sarafa Market", "source": "Advertisement", "status": "Converted", "assigned_person": "Rajesh Singh", "plan_discussed": "Plan A (Express)", "investment_capacity": "Rs. 3.2 Lakhs", "shop_availability": "Available", "inquiry_date": "2026-08-02", "franchise_id": fran_objs.get("FR-INDORE").id if "FR-INDORE" in fran_objs else None},
        # Additional Leads to exceed 30+
        {"customer_name": "Gaurav Malhotra", "mobile": "+91 9810077889", "email": "gaurav.m@gmail.com", "city": "Delhi", "state": "NCR", "location": "South Ext Part 2", "source": "Website", "status": "Contacted", "assigned_person": "Vikram Singh", "plan_discussed": "Plan B (Standard)", "investment_capacity": "Rs. 6 Lakhs", "shop_availability": "Looking for Property", "inquiry_date": "2026-09-10"},
        {"customer_name": "Sneha Roy", "mobile": "+91 9830088990", "email": "sneha.roy@gmail.com", "city": "Kolkata", "state": "West Bengal", "location": "Park Street", "source": "Social Media", "status": "New", "assigned_person": "Ananya Sharma", "plan_discussed": "Plan B (Standard)", "investment_capacity": "Rs. 5 Lakhs", "shop_availability": "Rented", "inquiry_date": "2026-09-12"},
        {"customer_name": "Alok Tiwari", "mobile": "+91 9335099001", "email": "alok.t@gmail.com", "city": "Lucknow", "state": "Uttar Pradesh", "location": "Hazratganj", "source": "Referral", "status": "Interested", "assigned_person": "Rajesh Singh", "plan_discussed": "Plan A (Express)", "investment_capacity": "Rs. 4 Lakhs", "shop_availability": "Owned Property", "inquiry_date": "2026-09-14"},
        {"customer_name": "Meera Pillai", "mobile": "+91 9847011223", "email": "meera.pillai@gmail.com", "city": "Kochi", "state": "Kerala", "location": "MG Road", "source": "Website", "status": "On Hold", "assigned_person": "Ananya Sharma", "plan_discussed": "Plan C (Master)", "investment_capacity": "Rs. 10 Lakhs", "shop_availability": "Available", "inquiry_date": "2026-09-08"},
        {"customer_name": "Bhavin Desai", "mobile": "+91 9825122334", "email": "bhavin.d@gmail.com", "city": "Vadodara", "state": "Gujarat", "location": "Alkapuri", "source": "Advertisement", "status": "Follow-up", "assigned_person": "Rajesh Singh", "plan_discussed": "Plan B (Standard)", "investment_capacity": "Rs. 5.5 Lakhs", "shop_availability": "Rented", "inquiry_date": "2026-09-11"},
        {"customer_name": "Karan Kapoor", "mobile": "+91 9814033445", "email": "karan.k@gmail.com", "city": "Chandigarh", "state": "Punjab", "location": "Sector 17", "source": "Exhibition", "status": "Token Received", "assigned_person": "Vikram Singh", "plan_discussed": "Plan B (Standard)", "investment_capacity": "Rs. 5 Lakhs", "shop_availability": "Owned Property", "inquiry_date": "2026-09-07"},
        {"customer_name": "Divya Nambiar", "mobile": "+91 9846044556", "email": "divya.n@gmail.com", "city": "Coimbatore", "state": "Tamil Nadu", "location": "Cross Cut Road", "source": "Social Media", "status": "Site Visit", "assigned_person": "Ananya Sharma", "plan_discussed": "Plan A (Express)", "investment_capacity": "Rs. 3.5 Lakhs", "shop_availability": "Available", "inquiry_date": "2026-09-09"},
        {"customer_name": "Harish Rao", "mobile": "+91 9886055667", "email": "harish.rao@gmail.com", "city": "Mysore", "state": "Karnataka", "location": "Devaraja Market", "source": "Referral", "status": "Negotiation", "assigned_person": "Rajesh Singh", "plan_discussed": "Plan A (Express)", "investment_capacity": "Rs. 4 Lakhs", "shop_availability": "Rented", "inquiry_date": "2026-09-13"},
        {"customer_name": "Siddharth Das", "mobile": "+91 9437066778", "email": "siddharth.d@gmail.com", "city": "Bhubaneswar", "state": "Odisha", "location": "Janpath", "source": "Website", "status": "New", "assigned_person": "Ananya Sharma", "plan_discussed": "Plan B (Standard)", "investment_capacity": "Rs. 5 Lakhs", "shop_availability": "Looking for Property", "inquiry_date": "2026-09-15"},
        {"customer_name": "Tarun Bansal", "mobile": "+91 9815077889", "email": "tarun.b@gmail.com", "city": "Ludhiana", "state": "Punjab", "location": "Ghumar Mandi", "source": "Existing Customer", "status": "Interested", "assigned_person": "Vikram Singh", "plan_discussed": "Plan C (Master)", "investment_capacity": "Rs. 9 Lakhs", "shop_availability": "Owned Property", "inquiry_date": "2026-09-16"},
        {"customer_name": "Urmila Saxena", "mobile": "+91 9415088990", "email": "urmila.s@gmail.com", "city": "Kanpur", "state": "Uttar Pradesh", "location": "Mall Road", "source": "Advertisement", "status": "Lost", "assigned_person": "Rajesh Singh", "plan_discussed": "Plan A (Express)", "investment_capacity": "Rs. 3 Lakhs", "shop_availability": "None", "inquiry_date": "2026-09-01"},
        {"customer_name": "Varun Sen", "mobile": "+91 9771099001", "email": "varun.sen@gmail.com", "city": "Ranchi", "state": "Jharkhand", "location": "Main Road", "source": "Website", "status": "Contacted", "assigned_person": "Ananya Sharma", "plan_discussed": "Plan B (Standard)", "investment_capacity": "Rs. 5 Lakhs", "shop_availability": "Available", "inquiry_date": "2026-09-17"},
        {"customer_name": "Yash Vardhan", "mobile": "+91 9425011223", "email": "yash.v@gmail.com", "city": "Gwalior", "state": "Madhya Pradesh", "location": "Lashkar Market", "source": "Referral", "status": "Follow-up", "assigned_person": "Rajesh Singh", "plan_discussed": "Plan A (Express)", "investment_capacity": "Rs. 3.5 Lakhs", "shop_availability": "Rented", "inquiry_date": "2026-09-14"},
        {"customer_name": "Zoya Khan", "mobile": "+91 9823022334", "email": "zoya.khan@gmail.com", "city": "Nagpur", "state": "Maharashtra", "location": "Dharampeth", "source": "Social Media", "status": "Site Visit", "assigned_person": "Ananya Sharma", "plan_discussed": "Plan B (Standard)", "investment_capacity": "Rs. 6 Lakhs", "shop_availability": "Owned Property", "inquiry_date": "2026-09-15"},
        {"customer_name": "Abhishek Jha", "mobile": "+91 9334033445", "email": "abhishek.jha@gmail.com", "city": "Patna", "state": "Bihar", "location": "Boring Road", "source": "Website", "status": "New", "assigned_person": "Rajesh Singh", "plan_discussed": "Plan A (Express)", "investment_capacity": "Rs. 4 Lakhs", "shop_availability": "Available", "inquiry_date": "2026-09-18"},
        {"customer_name": "Charu Sharma", "mobile": "+91 9413044556", "email": "charu.s@gmail.com", "city": "Udaipur", "state": "Rajasthan", "location": "Hiran Magri", "source": "Exhibition", "status": "Interested", "assigned_person": "Vikram Singh", "plan_discussed": "Plan B (Standard)", "investment_capacity": "Rs. 5 Lakhs", "shop_availability": "Looking for Property", "inquiry_date": "2026-09-17"},
        {"customer_name": "Dinesh Chawla", "mobile": "+91 9818055667", "email": "dinesh.c@gmail.com", "city": "Noida", "state": "NCR", "location": "Sector 18 Market", "source": "Referral", "status": "Token Received", "assigned_person": "Vikram Singh", "plan_discussed": "Plan C (Master)", "investment_capacity": "Rs. 10 Lakhs", "shop_availability": "Rented", "inquiry_date": "2026-09-05"}
    ]

    lead_objs = []
    for l_data in raw_leads:
        existing = Lead.query.filter_by(mobile=l_data["mobile"]).first()
        if not existing:
            ld = Lead(**l_data)
            db.session.add(ld)
            db.session.flush()
            lead_objs.append(ld)
        else:
            lead_objs.append(existing)

    db.session.commit()

    # 6. Seed Calling History (25+ Call Logs)
    call_samples = [
        {"lead_id": lead_objs[0].id if len(lead_objs)>0 else None, "customer_name": "Rohan Mehta", "caller_person": "Rajesh Singh", "discussion": "Introductory call regarding Coral Bios franchise options.", "requirement": "Looking for clothing retail format", "plan_discussed": "Plan B (Standard)", "objection": "Rental cost in Surat high", "next_followup_date": "2026-09-22", "status": "Interested"},
        {"lead_id": lead_objs[1].id if len(lead_objs)>1 else None, "customer_name": "Neha Patel", "caller_person": "Ananya Sharma", "discussion": "Detailed ROI analysis and site location survey planning.", "requirement": "Prime mall location", "plan_discussed": "Plan C (Master)", "objection": "Requires 60% company support", "next_followup_date": "2026-09-23", "status": "Site Visit Scheduled"},
        {"lead_id": lead_objs[2].id if len(lead_objs)>2 else None, "customer_name": "Priya Sharma", "caller_person": "Rajesh Singh", "discussion": "Token payment received. Discussed interior setup timeline.", "requirement": "Quick launch within 30 days", "plan_discussed": "Plan A (Express)", "objection": "None", "next_followup_date": "2026-09-25", "status": "Token Received"},
        {"lead_id": lead_objs[4].id if len(lead_objs)>4 else None, "customer_name": "Pooja Verma", "caller_person": "Ananya Sharma", "discussion": "Followup on store footprint requirements and layout.", "requirement": "500 sqft front facing store", "plan_discussed": "Plan B (Standard)", "objection": "Evaluating competitor brand", "next_followup_date": "2026-09-21", "status": "Follow-up Needed"},
        {"lead_id": lead_objs[5].id if len(lead_objs)>5 else None, "customer_name": "Rahul Joshi", "caller_person": "Rajesh Singh", "discussion": "Finalizing commercial terms and discount on initial stock.", "requirement": "Tier 2 city express model", "plan_discussed": "Plan A (Express)", "objection": "Wants extended credit limit", "next_followup_date": "2026-09-20", "status": "Negotiation"},
    ]
    # Add more generic calls across leads
    for idx, ld in enumerate(lead_objs[:20]):
        c = CallHistory(
            lead_id=ld.id,
            franchise_id=ld.franchise_id,
            customer_name=ld.customer_name,
            caller_person=ld.assigned_person or "Field Executive",
            call_date=datetime.datetime.utcnow() - datetime.timedelta(days=(20 - idx)),
            discussion=f"Telephonic discussion with {ld.customer_name} regarding franchise inquiry in {ld.city}.",
            requirement=f"Interest in {ld.plan_discussed or 'Standard Plan'}",
            plan_discussed=ld.plan_discussed or "Plan B",
            objection="None recorded",
            next_followup_date="2026-09-25",
            status="Completed",
            remarks="Positive interaction, sent presentation deck via WhatsApp."
        )
        db.session.add(c)

    # 7. Seed Follow-ups (18+ items)
    for idx, ld in enumerate(lead_objs[:18]):
        f_status = "Pending" if idx < 8 else ("Completed" if idx < 14 else "Rescheduled")
        fl = FollowUp(
            lead_id=ld.id,
            franchise_id=ld.franchise_id,
            customer_name=ld.customer_name,
            person=ld.assigned_person or "Executive",
            followup_date=datetime.datetime.utcnow() + datetime.timedelta(days=(idx % 5)),
            discussion=f"Scheduled follow-up call with {ld.customer_name} to review property pictures & commercial terms.",
            outcome="Pending review" if f_status == "Pending" else "Agreed to proceed to next step",
            next_date="2026-09-28",
            status=f_status,
            remarks=f"Priority client in {ld.city}"
        )
        db.session.add(fl)

    # 8. Seed Tokens & Payments
    for f_code, f_obj in fran_objs.items():
        tok = TokenRecord(
            franchise_id=f_obj.id,
            customer_name=f_obj.owner_name,
            token_amount=50000.0,
            payment_date="2026-08-15",
            payment_mode="Bank Transfer (NEFT)",
            reference_no=f"NEFT-CB-{f_obj.code}-001",
            status="Received",
            remarks="Initial booking token received",
            person=f_obj.assigned_person
        )
        pay1 = Payment(
            franchise_id=f_obj.id,
            customer_name=f_obj.owner_name,
            amount=150000.0,
            payment_date="2026-08-25",
            payment_type="Investment Part 1",
            payment_mode="Bank Transfer",
            reference_no=f"REF-PAY-{f_obj.code}-101",
            status="Received",
            remarks="First milestone franchise fee instalment",
            person="Priya Nair"
        )
        pay2 = Payment(
            franchise_id=f_obj.id,
            customer_name=f_obj.owner_name,
            amount=100000.0,
            payment_date="2026-09-10",
            payment_type="Purchase Stock",
            payment_mode="UPI",
            reference_no=f"UPI-PAY-{f_obj.code}-102",
            status="Received",
            remarks="Stock purchase advance",
            person="Priya Nair"
        )
        pur = Purchase(
            franchise_id=f_obj.id,
            invoice_no=f"INV-{f_obj.code}-01",
            purchase_date="2026-09-05",
            item_details="Opening Stock & Store Display Apparel",
            amount=180000.0,
            payment_status="Paid",
            remarks="Dispatched via V-Trans Logistics",
            person=f_obj.assigned_person
        )
        gr = GRReturn(
            franchise_id=f_obj.id,
            gr_number=f"GR-{f_obj.code}-01",
            return_date="2026-09-12",
            item_details="Minor transit size exchange stock",
            return_amount=12000.0,
            reason="Size Swap Request",
            remarks="Approved by QC",
            person=f_obj.assigned_person
        )
        cs = CompanySupport(
            franchise_id=f_obj.id,
            interior_support=35000.0,
            training_support=15000.0,
            branding_support=25000.0,
            date_provided="2026-09-01",
            status="Provided",
            person="Accounts Admin"
        )
        compl = Complaint(
            franchise_id=f_obj.id,
            date_time="2026-09-14 11:30",
            reported_by=f_obj.owner_name,
            category="Supply Chain",
            issue="Delay in 2 display racks shipment",
            priority="Medium" if f_code != "FR-DELHI" else "High",
            assigned_person="Rajesh Singh",
            status="In Progress" if f_code == "FR-DELHI" else "Resolved",
            resolution="Dispatched replacement units via express courier" if f_code != "FR-DELHI" else "",
            remarks="Tracked via BlueDart tracking ID #88921"
        )
        db.session.add_all([tok, pay1, pay2, pur, gr, cs, compl])

    # 9. Seed Surveys & Site Visits
    for idx, f_obj in enumerate(list(fran_objs.values())[:5]):
        sur = SurveyVersion(
            franchise_id=f_obj.id,
            customer_name=f_obj.owner_name,
            version_number=1,
            surveyor_name=f_obj.assigned_person,
            survey_date="2026-08-10",
            area_sqft=650.0 + (idx * 50),
            frontage_ft=22.0,
            daily_footfall=1200 + (idx * 200),
            monthly_rent=45000.0 + (idx * 5000),
            rating_score=4.5,
            approved_by="General Manager",
            approval_date="2026-08-12",
            status="Approved",
            remarks="Prime high footfall commercial street location with great visibility."
        )
        db.session.add(sur)

    # 10. Seed Approval & Agreement Records
    for f_obj in list(fran_objs.values())[:5]:
        appr = ApprovalAgreement(
            franchise_id=f_obj.id,
            submitted_by=f_obj.assigned_person,
            submission_date="2026-08-12",
            stage="Agreement Signed",
            approved_by="General Manager",
            approval_date="2026-08-14",
            agreement_status="Signed",
            agreement_date="2026-08-16",
            remarks="5-Year Master Franchise Agreement executed cleanly."
        )
        db.session.add(appr)

    # 11. Seed Operations Checklist / Setup
    for f_obj in list(fran_objs.values())[:5]:
        b = BrandingSetup(franchise_id=f_obj.id, signage_cost=25000.0, vinyl_cost=8000.0, glowsign_cost=15000.0, installation_date="2026-08-28", status="Completed", person=f_obj.assigned_person)
        i = InteriorSetup(franchise_id=f_obj.id, contractor_name="Apex Interiors", start_date="2026-08-20", target_completion_date="2026-09-05", civil_cost=50000.0, carpentry_cost=80000.0, electrical_cost=25000.0, completion_percentage=100, status="Completed", inspected_by=f_obj.assigned_person)
        m = MarketingCampaign(franchise_id=f_obj.id, campaign_name="Grand Launch Local Promotion", channel="Flex Banners & Meta Ads", cost=15000.0, start_date="2026-09-01", end_date="2026-09-07", leads_generated=45, status="Completed", person=f_obj.assigned_person)
        t = TrainingRecord(franchise_id=f_obj.id, batch_name="Batch #04 Store Operations", staff_count=4, trainer_name="Rajesh Singh", training_date="2026-08-30", status="Completed", person=f_obj.assigned_person)
        o = StoreOperations(franchise_id=f_obj.id, checklist_score=98.5, pos_status="Operational", opening_date="2026-09-01", auditor_name="General Manager", audit_date="2026-09-02", status="Compliant", person=f_obj.assigned_person)
        db.session.add_all([b, i, m, t, o])

    # 12. Seed Expenses across categories
    cat_objs = ExpenseCategory.query.all()
    cat_dict = {c.name: c.id for c in cat_objs}
    for idx, f_obj in enumerate(list(fran_objs.values())):
        e1 = Expense(
            franchise_id=f_obj.id,
            expense_date="2026-09-02",
            expense_time="10:30",
            category_id=cat_dict.get("Rent & Lease"),
            category_name="Rent & Lease",
            sub_category="Store Rent",
            description=f"Monthly store rent for {f_obj.name}",
            amount=40000.0 + (idx * 2000),
            payment_mode="Bank Transfer",
            paid_by="Store",
            person=f_obj.assigned_person,
            vendor_party="Property Owner",
            bill_invoice_no=f"RENT-{f_obj.code}-0926",
            status="Paid"
        )
        e2 = Expense(
            franchise_id=f_obj.id,
            expense_date="2026-09-08",
            expense_time="14:15",
            category_id=cat_dict.get("Utilities (Electricity/Water)"),
            category_name="Utilities (Electricity/Water)",
            sub_category="Electricity Bill",
            description="Power bill for store lighting & AC",
            amount=7500.0 + (idx * 500),
            payment_mode="UPI",
            paid_by="Store",
            person=f_obj.assigned_person,
            vendor_party="Electricity DISCOM",
            bill_invoice_no=f"ELEC-{f_obj.code}-0926",
            status="Paid"
        )
        db.session.add_all([e1, e2])

    # 13. Seed Tasks (12+ Checklist items)
    tasks_data = [
        {"title": "Review Site Visit PDF for Neha Patel (Ahmedabad)", "related_person_or_franchise": "Neha Patel", "module": "Survey & Site Visit", "due_date_time": "Today, 5:00 PM", "priority": "High", "is_completed": False},
        {"title": "Verify Token Payment Receipt Rs. 50,000 for Priya Sharma", "related_person_or_franchise": "Priya Sharma", "module": "Plans & Token", "due_date_time": "Today, 6:30 PM", "priority": "Urgent", "is_completed": False},
        {"title": "Dispatch Opening Stock Inventory to Bengaluru South", "related_person_or_franchise": "Coral Bios - Bengaluru South", "module": "Purchase", "due_date_time": "Tomorrow, 11:00 AM", "priority": "High", "is_completed": False},
        {"title": "Resolve Display Rack Delay Complaint #CMP-102", "related_person_or_franchise": "Coral Bios - Delhi Central", "module": "Complaints & Issues", "due_date_time": "Tomorrow, 2:00 PM", "priority": "Urgent", "is_completed": False},
        {"title": "Schedule Staff Training Batch #05 for Surat Franchise", "related_person_or_franchise": "Coral Bios - Surat Prime", "module": "Operations", "due_date_time": "2026-09-22, 10:00 AM", "priority": "Medium", "is_completed": True},
        {"title": "Follow up with Rahul Joshi on Plan A Agreement Terms", "related_person_or_franchise": "Rahul Joshi", "module": "Follow-ups", "due_date_time": "2026-09-21, 3:00 PM", "priority": "Medium", "is_completed": False},
        {"title": "Audit Monthly Expense Sheet for Mumbai Hub", "related_person_or_franchise": "Coral Bios - Mumbai Hub", "module": "Expenses", "due_date_time": "2026-09-24, 4:00 PM", "priority": "Low", "is_completed": True},
        {"title": "Generate Quarterly Franchise Growth Performance Report", "related_person_or_franchise": "All Franchises", "module": "Reports", "due_date_time": "2026-09-25, 5:00 PM", "priority": "Medium", "is_completed": False},
        {"title": "Conduct Followup Call with Rohan Mehta (Surat)", "related_person_or_franchise": "Rohan Mehta", "module": "Calling History", "due_date_time": "2026-09-22, 12:00 PM", "priority": "High", "is_completed": False},
        {"title": "Approve Agreement Draft for Ahmedabad West", "related_person_or_franchise": "Coral Bios - Ahmedabad West", "module": "Approval & Agreement", "due_date_time": "2026-09-23, 11:30 AM", "priority": "High", "is_completed": False}
    ]

    for t_d in tasks_data:
        if not Task.query.filter_by(title=t_d["title"]).first():
            db.session.add(Task(**t_d))

    # 14. Seed Notifications
    notifs = [
        {"title": "New Lead Received", "message": "Lead Rohan Mehta inquired via Website for Surat location.", "type": "lead"},
        {"title": "Follow-up Overdue", "message": "Follow-up with Pooja Verma (Indore) is scheduled for today.", "type": "followup"},
        {"title": "Token Payment Confirmed", "message": "Token payment of Rs. 50,000 received from Priya Sharma.", "type": "payment"},
        {"title": "Survey Uploaded", "message": "Site visit report PDF uploaded for Ahmedabad West property.", "type": "survey"},
        {"title": "Complaint Escalation", "message": "High priority complaint #CMP-102 assigned regarding Delhi Central dispatch.", "type": "complaint"}
    ]
    for n in notifs:
        if not Notification.query.filter_by(title=n["title"]).first():
            db.session.add(Notification(**n))

    db.session.commit()

    # 15. Seed Initial Audit Logs
    if AuditLog.query.count() == 0:
        log1 = AuditLog(stage_name="Authentication", action="LOGIN", performed_by="Super Admin", remarks="Super Admin logged into Coral Bios FMS")
        log2 = AuditLog(stage_name="Leads & Assignments", action="CREATE", performed_by="Rajesh Singh", remarks="Created new lead #L-1001 Rohan Mehta (Surat)")
        log3 = AuditLog(stage_name="Plans & Token", action="TOKEN_RECEIVED", performed_by="Priya Nair", remarks="Token amount Rs.50,000 recorded for Lead Priya Sharma")
        log4 = AuditLog(stage_name="Franchise", action="CONVERT", performed_by="Vikram Singh", remarks="Converted Lead Amit Singh to Franchise #FR-MUMBAI (Coral Bios - Mumbai Hub)")
        db.session.add_all([log1, log2, log3, log4])
        db.session.commit()

    print("Coral Bios FMS complete demo database seeding completed successfully!")
