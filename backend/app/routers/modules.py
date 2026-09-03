from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from .. import models, schemas
from ..database import get_db
from ..deps import require_roles

router = APIRouter(prefix="/api/modules", tags=["Modules"])


@router.get("", response_model=list[schemas.MainModule])
def list_main_modules(db: Session = Depends(get_db)):
    return db.query(models.MainModule).order_by(func.lower(models.MainModule.name)).all()


@router.get("/tree")
def module_tree(db: Session = Depends(get_db)):
    """Project → Modules → Sub-Modules hierarchy. Optimized with batch queries."""
    from sqlalchemy.orm import joinedload
    from sqlalchemy import func as sqlfunc

    # 1. Load all modules with sub_modules eagerly in ONE query
    modules = (
        db.query(models.MainModule)
        .options(joinedload(models.MainModule.sub_modules))
        .order_by(sqlfunc.lower(models.MainModule.name))
        .all()
    )
    projects = db.query(models.Project).order_by(sqlfunc.lower(models.Project.name)).all()

    # 2. Batch: task counts per main_module in ONE query
    main_task_counts = dict(
        db.query(models.Task.main_module_id, sqlfunc.count(models.Task.id))
        .filter(models.Task.main_module_id.isnot(None))
        .group_by(models.Task.main_module_id)
        .all()
    )

    # 3. Batch: task counts + estimated_hours per sub_module in ONE query
    sub_task_counts = {}
    sub_est_hours = {}
    for row in (
        db.query(
            models.Task.sub_module_id,
            sqlfunc.count(models.Task.id),
            sqlfunc.coalesce(sqlfunc.sum(models.Task.estimated_hours), 0.0),
        )
        .filter(models.Task.sub_module_id.isnot(None))
        .group_by(models.Task.sub_module_id)
        .all()
    ):
        sub_task_counts[row[0]] = row[1]
        sub_est_hours[row[0]] = float(row[2])

    # 4. Build module data (no more individual queries!)
    module_list = []
    for m in modules:
        subs = []
        for s in m.sub_modules:  # already loaded via joinedload
            subs.append({
                "id": s.id,
                "name": s.name,
                "tasks": sub_task_counts.get(s.id, 0),
                "estimated_hours": sub_est_hours.get(s.id, 0),
            })
        subs.sort(key=lambda x: (x["name"] or "").lower())
        module_list.append({
            "id": m.id,
            "name": m.name,
            "project_id": m.project_id,
            "sub_module_count": len(subs),
            "task_count": main_task_counts.get(m.id, 0),
            "sub_modules": subs,
        })

    # 5. Group by project
    project_tree = []
    for p in projects:
        p_mods = [m for m in module_list if m["project_id"] == p.id]
        project_tree.append({
            "project_id": p.id,
            "project_name": p.name,
            "modules": p_mods,
        })

    unlinked = [m for m in module_list if not m["project_id"]]
    if unlinked:
        project_tree.append({
            "project_id": None,
            "project_name": "Unassigned",
            "modules": unlinked,
        })

    return {"modules": module_list, "project_tree": project_tree}


@router.post("", response_model=schemas.MainModule, status_code=201)
def create_main_module(payload: schemas.MainModuleCreate, project_id: int | None = None,
                        db: Session = Depends(get_db),
                        _user=Depends(require_roles("Admin", "Manager"))):
    if db.query(models.MainModule).filter(models.MainModule.name == payload.name).first():
        raise HTTPException(400, "Main module already exists")
    module = models.MainModule(
        name=payload.name,
        description=payload.description or "",
        project_id=project_id,
    )
    db.add(module)
    db.commit()
    db.refresh(module)
    return module


@router.put("/{module_id}", response_model=schemas.MainModule)
def update_main_module(module_id: int, payload: schemas.MainModuleCreate,
                        project_id: int | None = None,
                        db: Session = Depends(get_db),
                        _user=Depends(require_roles("Admin", "Manager"))):
    module = db.get(models.MainModule, module_id)
    if not module:
        raise HTTPException(404, "Main module not found")
    module.name = payload.name
    module.description = payload.description or ""
    if project_id is not None:
        module.project_id = project_id
    db.commit()
    db.refresh(module)
    return module


@router.delete("/{module_id}", status_code=204)
def delete_main_module(module_id: int, db: Session = Depends(get_db),
                        _user=Depends(require_roles("Admin", "Manager"))):
    module = db.get(models.MainModule, module_id)
    if not module:
        raise HTTPException(404, "Main module not found")
    db.delete(module)
    db.commit()


# ---------- Sub Modules ----------
sub_router = APIRouter(prefix="/api/sub-modules", tags=["Sub Modules"])


@sub_router.get("", response_model=list[schemas.SubModule])
def list_sub_modules(main_module_id: int | None = None, db: Session = Depends(get_db)):
    q = db.query(models.SubModule)
    if main_module_id:
        q = q.filter(models.SubModule.main_module_id == main_module_id)
    return q.order_by(func.lower(models.SubModule.name)).all()


@sub_router.post("", response_model=schemas.SubModule, status_code=201)
def create_sub_module(payload: schemas.SubModuleCreate, db: Session = Depends(get_db),
                       _user=Depends(require_roles("Admin", "Manager"))):
    sub = models.SubModule(**payload.model_dump())
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


@sub_router.put("/{sub_id}", response_model=schemas.SubModule)
def update_sub_module(sub_id: int, payload: schemas.SubModuleCreate, db: Session = Depends(get_db),
                       _user=Depends(require_roles("Admin", "Manager"))):
    sub = db.get(models.SubModule, sub_id)
    if not sub:
        raise HTTPException(404, "Sub module not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(sub, key, value)
    db.commit()
    db.refresh(sub)
    return sub


@sub_router.delete("/{sub_id}", status_code=204)
def delete_sub_module(sub_id: int, db: Session = Depends(get_db),
                       _user=Depends(require_roles("Admin", "Manager"))):
    sub = db.get(models.SubModule, sub_id)
    if not sub:
        raise HTTPException(404, "Sub module not found")
    db.delete(sub)
    db.commit()
