from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..deps import require_roles

router = APIRouter(prefix="/api/skills", tags=["Skills"])


@router.get("", response_model=list[schemas.Skill])
def list_skills(db: Session = Depends(get_db)):
    return db.query(models.Skill).order_by(models.Skill.name).all()


@router.post("", response_model=schemas.Skill, status_code=201)
def create_skill(payload: schemas.SkillCreate, db: Session = Depends(get_db),
                 _user=Depends(require_roles("Admin", "Manager"))):
    if db.query(models.Skill).filter(models.Skill.name == payload.name).first():
        raise HTTPException(400, "Skill already exists")
    skill = models.Skill(**payload.model_dump())
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


@router.put("/{skill_id}", response_model=schemas.Skill)
def update_skill(skill_id: int, payload: schemas.SkillCreate, db: Session = Depends(get_db),
                 _user=Depends(require_roles("Admin", "Manager"))):
    skill = db.query(models.Skill).get(skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")
    skill.name = payload.name
    skill.description = payload.description or ""
    db.commit()
    db.refresh(skill)
    return skill


@router.delete("/{skill_id}", status_code=204)
def delete_skill(skill_id: int, db: Session = Depends(get_db),
                 _user=Depends(require_roles("Admin", "Manager"))):
    skill = db.query(models.Skill).get(skill_id)
    if not skill:
        raise HTTPException(404, "Skill not found")
    db.delete(skill)
    db.commit()
