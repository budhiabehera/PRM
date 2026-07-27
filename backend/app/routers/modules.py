from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..deps import require_roles

router = APIRouter(prefix="/api/modules", tags=["Modules"])


@router.get("", response_model=list[schemas.MainModule])
def list_main_modules(db: Session = Depends(get_db)):
    return db.query(models.MainModule).order_by(models.MainModule.name).all()


@router.get("/tree")
def module_tree(db: Session = Depends(get_db)):
    """Main modules with nested sub-modules + counts, for the module hierarchy view."""
    modules = db.query(models.MainModule).order_by(models.MainModule.name).all()
    projects = db.query(models.Project).order_by(models.Project.name).all()

    # Build module data
    module_list = []
    for m in modules:
        dev_count = db.query(models.Developer).filter(models.Developer.home_module_id == m.id).count()
        task_count = db.query(models.Task).filter(models.Task.main_module_id == m.id).count()
        subs = []
        for s in m.sub_modules:
            s_tasks = [t for t in s.tasks]
            subs.append({
                "id": s.id,
                "name": s.name,
                "tasks": len(s_tasks),
                "estimated_hours": sum(t.estimated_hours for t in s_tasks),
            })
        # Find projects linked to this module (Project.main_module_id == m.id)
        linked_projects = [p.name for p in projects if p.main_module_id == m.id]
        module_list.append({
            "id": m.id,
            "name": m.name,
            "projects": linked_projects,
            "sub_module_count": len(subs),
            "developer_count": dev_count,
            "task_count": task_count,
            "sub_modules": subs,
        })

    # Build project tree (Project → Modules → Sub-Modules)
    project_tree = []
    for p in projects:
        p_mods = [m for m in module_list if m["id"] == p.main_module_id] if p.main_module_id else []
        project_tree.append({
            "project_id": p.id,
            "project_name": p.name,
            "modules": p_mods,
        })
    # Also include modules not linked to any project
    unlinked = [m for m in module_list if not m["projects"]]
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
    module = models.MainModule(**payload.model_dump())
    db.add(module)
    db.commit()
    db.refresh(module)
    # Link the project to this module if project_id provided
    if project_id:
        project = db.query(models.Project).get(project_id)
        if project:
            project.main_module_id = module.id
            db.commit()
    return module


@router.put("/{module_id}", response_model=schemas.MainModule)
def update_main_module(module_id: int, payload: schemas.MainModuleCreate, db: Session = Depends(get_db),
                        _user=Depends(require_roles("Admin", "Manager"))):
    module = db.query(models.MainModule).get(module_id)
    if not module:
        raise HTTPException(404, "Main module not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(module, key, value)
    db.commit()
    db.refresh(module)
    return module


@router.delete("/{module_id}", status_code=204)
def delete_main_module(module_id: int, db: Session = Depends(get_db),
                        _user=Depends(require_roles("Admin", "Manager"))):
    module = db.query(models.MainModule).get(module_id)
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
    return q.order_by(models.SubModule.name).all()


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
    sub = db.query(models.SubModule).get(sub_id)
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
    sub = db.query(models.SubModule).get(sub_id)
    if not sub:
        raise HTTPException(404, "Sub module not found")
    db.delete(sub)
    db.commit()
