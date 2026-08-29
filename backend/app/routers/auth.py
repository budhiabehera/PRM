from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..auth import hash_password, verify_password, create_access_token
from ..deps import get_current_user, require_roles

router = APIRouter(prefix="/api/auth", tags=["Auth"])


def _user_with_projects(user: models.User) -> dict:
    """Serialize a user including their project_ids from the many-to-many relationship."""
    user_dict = schemas.UserOut.model_validate(user).model_dump()
    user_dict["project_ids"] = [p.id for p in user.projects]
    return user_dict


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not user.active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"access_token": token, "token_type": "bearer", "user": _user_with_projects(user)}


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return _user_with_projects(current_user)


@router.post("/change-password")
def change_password(
    payload: schemas.ChangePassword,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Change the current user's password. Requires current password verification."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    if len(payload.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password changed successfully"}


@router.get("/users", response_model=list[schemas.UserOut])
def list_users(
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_roles("Admin")),
):
    users = db.query(models.User).order_by(models.User.username).all()
    result = []
    for u in users:
        user_dict = schemas.UserOut.model_validate(u).model_dump()
        user_dict["project_ids"] = [p.id for p in u.projects]
        result.append(user_dict)
    return result


@router.post("/users", response_model=schemas.UserOut, status_code=201)
def create_user(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_roles("Admin")),
):
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(400, "Username already exists")
    user = models.User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        developer_id=payload.developer_id,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    # Assign projects (many-to-many)
    if payload.project_ids:
        projects = db.query(models.Project).filter(models.Project.id.in_(payload.project_ids)).all()
        user.projects = projects
        db.commit()
    db.refresh(user)
    user_dict = schemas.UserOut.model_validate(user).model_dump()
    user_dict["project_ids"] = [p.id for p in user.projects]
    return user_dict


@router.put("/users/{user_id}", response_model=schemas.UserOut)
def update_user(
    user_id: int,
    payload: schemas.UserUpdate,
    db: Session = Depends(get_db),
    _admin: models.User = Depends(require_roles("Admin")),
):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    # Update scalar fields
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.email is not None:
        user.email = payload.email
    if payload.role is not None:
        user.role = payload.role
    if payload.developer_id is not None:
        user.developer_id = payload.developer_id if payload.developer_id else None
    if payload.active is not None:
        user.active = payload.active

    # Update project assignments (many-to-many)
    if payload.project_ids is not None:
        projects = db.query(models.Project).filter(models.Project.id.in_(payload.project_ids)).all() if payload.project_ids else []
        user.projects = projects

    db.commit()
    db.refresh(user)
    user_dict = schemas.UserOut.model_validate(user).model_dump()
    user_dict["project_ids"] = [p.id for p in user.projects]
    return user_dict


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(require_roles("Admin")),
):
    if user_id == admin.id:
        raise HTTPException(400, "You can't delete your own account")
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    db.delete(user)
    db.commit()
