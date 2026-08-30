"""Seeds the database with sample data mirroring the PRM (Project & Resource
Management) prototype (projects, modules, resources, work types, sprints, tasks). Runs once —
if projects already exist, that part of seeding is skipped. Default login users are
seeded independently so upgrading an existing database still gets accounts created.
"""
from datetime import date
from sqlalchemy.orm import Session
from . import models
from .auth import hash_password


def run_seed(db: Session):
    """Only creates the admin user if no users exist (fresh database)."""
    _ensure_admin_user(db)
    _seed_kb_categories(db)


def _ensure_admin_user(db: Session):
    """Create default admin account if no users exist in the database."""
    if db.query(models.User).count() > 0:
        return  # users already exist, skip
    admin = models.User(
        username="admin",
        full_name="System Administrator",
        email="admin@prm.local",
        role="Admin",
        password_hash=hash_password("Ids@1001"),
        active=True,
    )
    db.add(admin)
    db.commit()
    print("[SEED] Created default admin user (admin / Ids@1001)")


def _seed_core_data(db: Session):
    if db.query(models.Project).count() > 0:
        return  # already seeded


def _seed_skills(db: Session):
    """Seed default skills if none exist."""
    if db.query(models.Skill).count() > 0:
        return
    default_skills = ["Backend", "Frontend", "Mobile", "QA", "DevOps", "Full Stack", "UI/UX"]
    for name in default_skills:
        db.add(models.Skill(name=name))
    db.commit()

    # ---------- Main Modules ----------
    fom = models.MainModule(name="FX FOM", description="Front Office Management")
    pos = models.MainModule(name="FX POS", description="Point of Sale")
    snc = models.MainModule(name="FX SNC", description="Sales & Catering")
    spa = models.MainModule(name="FX SPA", description="Spa & Wellness")
    ai = models.MainModule(name="AI", description="AI Platform Initiatives")
    db.add_all([fom, pos, snc, spa, ai])
    db.flush()

    # ---------- Sub Modules ----------
    sub_names = {
        fom: ["Reservations", "Registration", "Cashiering", "Configuration", "Reports", "Profile"],
        pos: ["Order Entry", "Reports", "Kitchen Display System", "Bill Print", "Settlement"],
        snc: ["Operation"],
    }
    subs = {}
    for module, names in sub_names.items():
        for n in names:
            sm = models.SubModule(name=n, main_module_id=module.id)
            db.add(sm)
            db.flush()
            subs[(module.name, n)] = sm

    # ---------- Projects ----------
    projects = [
        models.Project(name="FX FOM", code="FXFOM", main_module_id=fom.id, status="Active",
                        start_date=date(2026, 7, 1), end_date=date(2026, 12, 31),
                        description="Front Office Management system"),
        models.Project(name="FX POS", code="FXPOS", main_module_id=pos.id, status="Inactive",
                        start_date=date(2026, 7, 1), end_date=date(2026, 12, 31),
                        description="Point of Sale system"),
        models.Project(name="FX SNC", code="FXSNC", main_module_id=snc.id, status="Inactive",
                        start_date=date(2026, 7, 1), end_date=date(2026, 12, 31),
                        description="Sales & Catering system"),
        models.Project(name="Data Platform", code="DATAPL", status="Inactive",
                        description="Data & Analytics platform"),
        models.Project(name="Internal CRM", code="INTCRM", status="Inactive",
                        description="Customer Relationship Management"),
        models.Project(name="API Modernization", code="APIMOD", status="Inactive",
                        description="API Refactoring initiative"),
    ]
    db.add_all(projects)
    db.flush()
    proj_by_name = {p.name: p for p in projects}

    # ---------- Work Types ----------
    work_types = [
        models.WorkType(name="New Requirement", customer_committed=True, color="#4f46e5"),
        models.WorkType(name="Production Issue", customer_committed=True, color="#22c55e"),
        models.WorkType(name="Tech Upgrade", customer_committed=False, color="#9ca3af"),
        models.WorkType(name="Internal Task", customer_committed=False, color="#f59e0b"),
        models.WorkType(name="Internal Issue", customer_committed=False, color="#0ea5e9"),
    ]
    db.add_all(work_types)
    db.flush()
    wt_by_name = {w.name: w for w in work_types}

    # ---------- Sprints (Jul-Dec 2026) ----------
    sprint_defs = [
        ("Jul-2026", date(2026, 7, 1), date(2026, 7, 31), "Active"),
        ("Aug-2026", date(2026, 8, 1), date(2026, 8, 31), "Planned"),
        ("Sep-2026", date(2026, 9, 1), date(2026, 9, 30), "Not Started"),
        ("Oct-2026", date(2026, 10, 1), date(2026, 10, 31), "Not Started"),
        ("Nov-2026", date(2026, 11, 1), date(2026, 11, 30), "Not Started"),
        ("Dec-2026", date(2026, 12, 1), date(2026, 12, 31), "Not Started"),
    ]
    sprints = [models.Sprint(name=n, start_date=s, end_date=e, status=st) for n, s, e, st in sprint_defs]
    db.add_all(sprints)
    db.flush()
    sprint_by_name = {s.name: s for s in sprints}

    # ---------- Developers ----------
    dev_defs = [
        # code, name, role, module, skill, capacity
        ("DEV019", "Elango Muthu Kumar", "Manager", fom, "Backend", 96),
        ("DEV035", "Prakash Dakshinamoorthi", "Lead - Manager", spa, "Backend", 96),
        ("DEV006", "Ramesh Meda", "Lead", fom, "Backend", 96),
        ("DEV007", "Srishti Rawat", "Developer", fom, "Backend", 192),
        ("DEV020", "Budhia Behra", "Lead - Manager", pos, "Backend", 96),
        ("DEV002", "Nare Suresh", "Lead", fom, "Backend", 96),
        ("DEV004", "Praveen Koli", "Lead", fom, "Backend", 96),
        ("DEV029", "Indira Priyadharshini", "Lead", fom, "Backend", 96),
        ("DEV033", "Chaitanya Peddakotla", "Lead", fom, "Frontend", 96),
        ("DEV003", "Shivangi Nimesh Patel", "Developer", fom, "Backend", 192),
        ("DEV008", "Ankit Mishra", "Developer", fom, "Frontend", 192),
        ("DEV012", "Navyashree S", "Lead", fom, "Mobile", 96),
        ("DEV013", "Jayashree Behera", "Developer", fom, "Mobile", 192),
        ("DEV009", "Nishu Thakur", "Developer", fom, "Frontend", 192),
        ("DEV010", "Priyanka Shashidharan", "Developer", fom, "Frontend", 192),
        ("DEV011", "Ayyapureddi Swami", "Developer", fom, "Backend", 192),
        ("DEV015", "Rohit Verma", "Developer", pos, "Backend", 192),
        ("DEV016", "Ananya Iyer", "Developer", pos, "Frontend", 192),
        ("DEV017", "Farhan Sheikh", "Developer", pos, "Backend", 192),
        ("DEV018", "Meera Krishnan", "Developer", pos, "Frontend", 192),
        ("DEV021", "Vikram Rao", "Developer", pos, "Backend", 192),
        ("DEV022", "Sara Thomas", "Lead", pos, "Backend", 96),
        ("DEV023", "Aditya Bhatt", "Developer", snc, "Backend", 192),
        ("DEV024", "Divya Menon", "Developer", snc, "Frontend", 192),
        ("DEV025", "Karan Malhotra", "Developer", snc, "Backend", 192),
        ("DEV026", "Fatima Noor", "Lead", snc, "Backend", 96),
        ("DEV027", "Rahul Chawla", "Developer", spa, "Backend", 192),
        ("DEV028", "Priya Nair", "Developer", spa, "Frontend", 192),
        ("DEV030", "Suresh Babu", "Developer", spa, "Backend", 192),
        ("DEV031", "Anjali Desai", "Developer", spa, "Mobile", 192),
        ("DEV032", "Manoj Tiwari", "Developer", ai, "Backend", 192),
        ("DEV034", "Deepika Reddy", "Developer", ai, "Backend", 192),
        ("DEV036", "Gopal Krishnan", "Developer", ai, "Backend", 192),
        ("DEV037", "Sneha Kulkarni", "Developer", ai, "Frontend", 192),
        ("DEV038", "Arjun Pillai", "Lead", ai, "Backend", 96),
        ("DEV039", "Meenakshi Sundaram", "Developer", ai, "Backend", 192),
        ("DEV001", "Vinay Kumar", "Manager", fom, "Backend", 96),
        ("DEV005", "Lakshmi Narayan", "Lead", fom, "Backend", 96),
        ("DEV014", "Ritu Sharma", "Developer", fom, "Mobile", 192),
    ]
    devs = []
    for code, name, role, module, skill, cap in dev_defs:
        d = models.Developer(dev_code=code, name=name, role=role, home_module_id=module.id,
                              skill=skill, base_capacity=cap, active=True)
        devs.append(d)
    db.add_all(devs)
    db.flush()
    dev_by_name = {d.name: d for d in devs}

    # ---------- Tasks ----------
    def sub(module, name):
        return subs[(module.name, name)]

    task_defs = [
        # code, case_ref, property, description, project, sub_module, developer, work_type, priority, status, committed, start, end, est, act, sprint
        ("T06001", "Internal", "Internal", "Departure report timezone issue", fom, "Reports", "Ramesh Meda",
         "Internal Issue", "Medium", "Completed", False, date(2026, 6, 1), date(2026, 6, 30), 26, 26, "Jul-2026"),
        ("T06002", "—", "Ama Stays Beach Haven", "Reservation data pushing to MDM", fom, "Reservations", "Ramesh Meda",
         "Internal Issue", "High", "Completed", False, date(2026, 6, 4), date(2026, 6, 30), 24, 24, "Jul-2026"),
        ("T06003", "—", "Ama Stays Beach Haven", "IDS Missing reservations", fom, "Reservations", "Ramesh Meda",
         "Production Issue", "High", "Completed", True, date(2026, 6, 9), date(2026, 6, 30), 16, 14, "Jul-2026"),
        ("T06004", "—", "Ama Stays Beach Haven", "CDP Reservations Repush", fom, "Reservations", "Ramesh Meda",
         "Internal Issue", "High", "Completed", False, date(2026, 6, 12), date(2026, 6, 30), 6, 6, "Jul-2026"),
        ("T06005", "—", "Ama Stays Beach Haven", "Reservation data pushing old MDM", fom, "Reservations", "Ramesh Meda",
         "Internal Issue", "High", "Completed", False, date(2026, 6, 15), date(2026, 6, 30), 16, 16, "Jul-2026"),
        ("T06006", "—", "Ama Stays Beach Haven", "Reservation Stay Detail Payload", fom, "Reservations", "Ramesh Meda",
         "New Requirement", "High", "Completed", True, date(2026, 6, 17), date(2026, 7, 30), 32, 32, "Jul-2026"),
        ("T06007", "Internal", "Internal", "Salesforce Integration Classification", fom, "Profile", "Srishti Rawat",
         "Internal Issue", "High", "Completed", False, date(2026, 6, 1), date(2026, 6, 30), 28, 28, "Jul-2026"),
        ("T06008", "Internal", "Internal", "Wakeup Call Save FN Bridge URL", fom, "Reservations", "Srishti Rawat",
         "Internal Issue", "High", "Completed", False, date(2026, 6, 5), date(2026, 6, 30), 32, 32, "Jul-2026"),
        ("T06009", "Internal", "Internal", "SAF-T Guest Exemption CR", fom, "Reservations", "Srishti Rawat",
         "New Requirement", "High", "Completed", True, date(2026, 6, 11), date(2026, 6, 30), 42, 42, "Jul-2026"),
        ("T06010", "Internal", "Internal", "Salesforce Company Profile Integration", fom, "Profile", "Srishti Rawat",
         "New Requirement", "High", "Completed", True, date(2026, 6, 18), date(2026, 6, 30), 32, 32, "Jul-2026"),
        ("T07001", "Internal", "Internal", "Tranquil Wellness Tower | TDH", fom, "Reservations", "Ramesh Meda",
         "New Requirement", "High", "In Progress", True, date(2026, 7, 1), date(2026, 7, 30), 32, 29, "Jul-2026"),
        ("T07002", "Internal", "Internal", "Bseccure Penetration Error Handling", fom, "Configuration", "Ramesh Meda",
         "New Requirement", "High", "Completed", True, date(2026, 7, 7), date(2026, 7, 30), 24, 24, "Jul-2026"),
        ("T07003", "Internal", "Internal", "Canary Integration test Production", fom, "Reservations", "Ramesh Meda",
         "Internal Task", "High", "In Progress", False, date(2026, 7, 10), date(2026, 7, 30), 16, 14, "Jul-2026"),
        ("T07004", "Internal", "Internal", "Babelfish Database Handover Phase2", fom, "Configuration", "Ramesh Meda",
         "Internal Task", "Medium", "Not Started", False, date(2026, 7, 14), date(2026, 7, 30), 16, 0, "Jul-2026"),
        ("T07005", "Internal", "Internal", "Company Profile FX CRS Sync", fom, "Configuration", "Ramesh Meda",
         "Internal Task", "High", "Not Started", False, date(2026, 7, 16), date(2026, 7, 30), 8, 0, "Jul-2026"),
        ("T07006", "Internal", "Internal", "PING status of an IP address", fom, "Configuration", "Ramesh Meda",
         "Internal Task", "Medium", "Not Started", False, date(2026, 7, 17), date(2026, 7, 30), 8, 0, "Jul-2026"),
        ("T07007", "Internal", "Internal", "Canary Interface Two-way Test", fom, "Reservations", "Srishti Rawat",
         "Internal Task", "High", "In Progress", False, date(2026, 7, 1), date(2026, 7, 30), 32, 29, "Jul-2026"),
        ("T07008", "Internal", "Internal", "TDH Interface One-way Use Cases", fom, "Registration", "Srishti Rawat",
         "Internal Task", "High", "In Progress", False, date(2026, 7, 7), date(2026, 7, 30), 36, 32, "Jul-2026"),
        ("T07009", "Internal", "Internal", "Salesforce Company Booking Interface", fom, "Reservations", "Srishti Rawat",
         "Internal Task", "High", "In Progress", False, date(2026, 7, 8), date(2026, 7, 30), 24, 22, "Jul-2026"),
        ("T07010", "Internal", "Internal", "Company Profile FX CRS Sync (FE)", fom, "Profile", "Srishti Rawat",
         "New Requirement", "High", "Not Started", True, date(2026, 7, 14), date(2026, 7, 30), 16, 0, "Jul-2026"),
        ("T07011", "Internal", "Internal", "SAF-T File Guest Exemption Phase2", fom, "Reservations", "Srishti Rawat",
         "New Requirement", "High", "Completed", True, date(2026, 7, 2), date(2026, 7, 30), 36, 36, "Jul-2026"),
        ("T07012", "Internal", "Internal", "Open API ExpectedArrivalList Issue", fom, "Reservations", "Srishti Rawat",
         "Production Issue", "High", "In Progress", True, date(2026, 7, 10), date(2026, 7, 30), 16, 2, "Jul-2026"),
        ("T07013", "Internal", "Internal", "CMS Company/Guest Profile Key", fom, "Profile", "Srishti Rawat",
         "New Requirement", "High", "In Progress", True, date(2026, 7, 6), date(2026, 7, 30), 16, 14, "Jul-2026"),
        ("T08001", "1178419", "Dragon Beach Hotel", "Room Revenue Dashboard", fom, "Reservations", "Ramesh Meda",
         "New Requirement", "Medium", "Not Started", True, date(2026, 8, 3), date(2026, 8, 31), 36, 0, "Aug-2026"),
        ("T08002", "1285516", "Hawthorn Suites Wyndham", "KSA NTMP Interface FE Options", fom, "Reservations", "Ramesh Meda",
         "New Requirement", "Medium", "Not Started", True, date(2026, 8, 7), date(2026, 8, 31), 16, 0, "Aug-2026"),
        ("T08003", "1290967", "Eagle Regency Sri Lanka", "Property Name Multi-Property UI", fom, "Reservations", "Ramesh Meda",
         "New Requirement", "Medium", "Not Started", True, date(2026, 8, 11), date(2026, 8, 31), 36, 0, "Aug-2026"),
        ("T08004", "Internal", "Internal", "Keycard system names migration", fom, "Reservations", "Ramesh Meda",
         "New Requirement", "Medium", "Not Started", True, date(2026, 8, 18), date(2026, 8, 31), 26, 0, "Aug-2026"),
        ("T08005", "—", "Ama Stays Serendipity", "Component Room Configuration", fom, "Reservations", "Ramesh Meda",
         "New Requirement", "Medium", "Not Started", True, date(2026, 8, 24), date(2026, 8, 31), 28, 0, "Aug-2026"),
        ("T08006", "1290237", "Mana Mana Suites", "Hub OS Interface Integration", fom, "Reservations", "Srishti Rawat",
         "New Requirement", "High", "Not Started", True, date(2026, 8, 3), date(2026, 8, 31), 46, 0, "Aug-2026"),
        ("T08007", "—", "D'Kelly Hotel Malaysia", "Door Lock / FN Bridge Implementation", fom, "Reservations", "Srishti Rawat",
         "New Requirement", "High", "Not Started", True, date(2026, 8, 10), date(2026, 8, 31), 32, 0, "Aug-2026"),
        ("T08008", "Internal", "Internal", "DH API not called on checkout", fom, "Reservations", "Srishti Rawat",
         "New Requirement", "High", "Not Started", True, date(2026, 8, 12), date(2026, 8, 31), 24, 0, "Aug-2026"),
        ("T08009", "Internal", "Internal", "CDP TAJ Guest Profile Update API", fom, "Reservations", "Srishti Rawat",
         "New Requirement", "High", "Not Started", True, date(2026, 8, 17), date(2026, 8, 31), 30, 0, "Aug-2026"),
        ("T08010", "Internal", "Internal", "SAF-T File Credit Note Point", fom, "Reservations", "Srishti Rawat",
         "New Requirement", "High", "Not Started", True, date(2026, 8, 21), date(2026, 8, 31), 22, 0, "Aug-2026"),
    ]

    tasks = []
    for (code, case_ref, prop, desc, module, sub_name, dev_name, wt_name, priority, status,
         committed, start, end, est, act, sprint_name) in task_defs:
        tasks.append(models.Task(
            task_code=code,
            case_ref=case_ref,
            property_client=prop,
            description=desc,
            project_id=proj_by_name["FX FOM"].id,
            main_module_id=module.id,
            sub_module_id=sub(module, sub_name).id,
            developer_id=dev_by_name[dev_name].id,
            work_type_id=wt_by_name[wt_name].id,
            sprint_id=sprint_by_name[sprint_name].id,
            priority=priority,
            status=status,
            customer_committed=committed,
            start_date=start,
            end_date=end,
            estimated_hours=est,
            actual_hours=act,
        ))
    db.add_all(tasks)

    # ---------- Availability (sample leave) ----------
    db.add_all([
        models.Availability(developer_id=dev_by_name["Ramesh Meda"].id,
                             sprint_id=sprint_by_name["Jul-2026"].id, leave_days=2, notes="Planned leave"),
        models.Availability(developer_id=dev_by_name["Srishti Rawat"].id,
                             sprint_id=sprint_by_name["Aug-2026"].id, leave_days=3, notes="Vacation"),
    ])

    db.commit()


def _seed_default_users(db: Session):
    if db.query(models.User).count() > 0:
        return  # already seeded

    def dev_id(name: str):
        dev = db.query(models.Developer).filter(models.Developer.name == name).first()
        return dev.id if dev else None

    accounts = [
        # username, password, full_name, role, linked developer (None for pure Admin)
        ("admin", "Admin@123", "System Administrator", "Admin", None),
        ("elango.manager", "Manager@123", "Elango Muthu Kumar", "Manager", dev_id("Elango Muthu Kumar")),
        ("ramesh.lead", "Lead@123", "Ramesh Meda", "Lead", dev_id("Ramesh Meda")),
        ("srishti.dev", "Dev@123", "Srishti Rawat", "Developer", dev_id("Srishti Rawat")),
    ]
    for username, password, full_name, role, linked_dev_id in accounts:
        db.add(models.User(
            username=username,
            full_name=full_name,
            role=role,
            developer_id=linked_dev_id,
            password_hash=hash_password(password),
            active=True,
        ))
    db.commit()


def _seed_kb_categories(db: Session):
    """Seed default KB categories if none exist."""
    from sqlalchemy import text, inspect
    # Ensure project_id column exists (migration safety net)
    try:
        insp = inspect(db.bind)
        cols = {c["name"] for c in insp.get_columns("PRM_kb_categories")}
        if "project_id" not in cols:
            db.execute(text("ALTER TABLE [PRM_kb_categories] ADD [project_id] INTEGER"))
            db.commit()
            print("[SEED] Added project_id column to PRM_kb_categories")
    except Exception as e:
        db.rollback()
        # Table may not exist yet — create_all() will handle it
    # Use raw SQL to check count (avoids ORM column mismatch issues)
    try:
        count = db.execute(text("SELECT COUNT(*) FROM [PRM_kb_categories]")).scalar()
        if count > 0:
            return  # already seeded
    except Exception:
        return  # table doesn't exist yet, create_all() will handle it
    defaults = [
        ("Process", "#3b82f6", 1),
        ("Setup Guide", "#22c55e", 2),
        ("Module Guide", "#a855f7", 3),
        ("FAQ", "#eab308", 4),
        ("Troubleshooting", "#ef4444", 5),
        ("Architecture", "#6366f1", 6),
        ("Deployment", "#06b6d4", 7),
        ("Database", "#f59e0b", 8),
        ("API Documentation", "#14b8a6", 9),
        ("Known Issues", "#f97316", 10),
        ("Production Support", "#f43f5e", 11),
        ("Release Notes", "#84cc16", 12),
    ]
    for name, color, order in defaults:
        db.execute(text(
            "INSERT INTO [PRM_kb_categories] ([name], [color], [sort_order]) VALUES (:name, :color, :sort_order)"
        ), {"name": name, "color": color, "sort_order": order})
    db.commit()
    print(f"[SEED] Created {len(defaults)} default KB categories")
