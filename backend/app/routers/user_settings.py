"""User settings & filter presets API."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone, timedelta
from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/user-settings", tags=["User Settings"])

IST = timezone(timedelta(hours=5, minutes=30))

def _now_ist():
    return datetime.now(IST)


# ==================== User Preferences ====================

@router.get("")
def get_all_preferences(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get all preferences for the current user as a key-value dict."""
    prefs = (
        db.query(models.UserPreference)
        .filter(models.UserPreference.user_id == current_user.id)
        .all()
    )
    return {p.key: p.value for p in prefs}


@router.put("/{key}")
def upsert_preference(
    key: str,
    payload: schemas.UserPreferenceUpsert,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create or update a single preference."""
    pref = (
        db.query(models.UserPreference)
        .filter(models.UserPreference.user_id == current_user.id, models.UserPreference.key == key)
        .first()
    )
    if pref:
        pref.value = payload.value
        pref.updated_at = _now_ist()
    else:
        pref = models.UserPreference(
            user_id=current_user.id,
            key=key,
            value=payload.value,
            created_at=_now_ist(),
            updated_at=_now_ist(),
        )
        db.add(pref)
    db.commit()
    db.refresh(pref)
    return {"key": pref.key, "value": pref.value}


# ==================== Filter Presets ====================

preset_router = APIRouter(prefix="/api/filter-presets", tags=["Filter Presets"])


@preset_router.get("")
def list_presets(
    page: str = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """List presets for current user, optionally filtered by page."""
    q = db.query(models.FilterPreset).filter(models.FilterPreset.user_id == current_user.id)
    if page:
        q = q.filter(models.FilterPreset.page == page)
    presets = q.order_by(models.FilterPreset.page, models.FilterPreset.name).all()
    return [
        {
            "id": p.id, "name": p.name, "page": p.page,
            "filters": p.filters, "is_default": p.is_default,
            "created_at": p.created_at, "updated_at": p.updated_at,
        }
        for p in presets
    ]


@preset_router.post("", status_code=201)
def create_preset(
    payload: schemas.FilterPresetCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a new filter preset."""
    # If this is marked as default, unset any existing default for same page
    if payload.is_default:
        _clear_page_defaults(db, current_user.id, payload.page)

    preset = models.FilterPreset(
        user_id=current_user.id,
        name=payload.name,
        page=payload.page,
        filters=payload.filters,
        is_default=payload.is_default,
        created_at=_now_ist(),
        updated_at=_now_ist(),
    )
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return _serialize_preset(preset)


@preset_router.put("/{preset_id}")
def update_preset(
    preset_id: int,
    payload: schemas.FilterPresetUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update an existing preset."""
    preset = _get_user_preset(db, preset_id, current_user.id)

    if payload.name is not None:
        preset.name = payload.name
    if payload.filters is not None:
        preset.filters = payload.filters
    if payload.is_default is not None:
        if payload.is_default:
            _clear_page_defaults(db, current_user.id, preset.page)
        preset.is_default = payload.is_default
    preset.updated_at = _now_ist()

    db.commit()
    db.refresh(preset)
    return _serialize_preset(preset)


@preset_router.delete("/{preset_id}", status_code=204)
def delete_preset(
    preset_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete a preset."""
    preset = _get_user_preset(db, preset_id, current_user.id)
    db.delete(preset)
    db.commit()


@preset_router.put("/{preset_id}/set-default")
def set_default_preset(
    preset_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Set a preset as the default for its page (unsets previous default)."""
    preset = _get_user_preset(db, preset_id, current_user.id)
    _clear_page_defaults(db, current_user.id, preset.page)
    preset.is_default = True
    preset.updated_at = _now_ist()
    db.commit()
    db.refresh(preset)
    return _serialize_preset(preset)


# ==================== Helpers ====================

def _get_user_preset(db, preset_id, user_id):
    preset = db.get(models.FilterPreset, preset_id)
    if not preset or preset.user_id != user_id:
        raise HTTPException(404, "Preset not found")
    return preset


def _clear_page_defaults(db, user_id, page):
    db.query(models.FilterPreset).filter(
        models.FilterPreset.user_id == user_id,
        models.FilterPreset.page == page,
        models.FilterPreset.is_default == True,
    ).update({"is_default": False})


def _serialize_preset(p):
    return {
        "id": p.id, "name": p.name, "page": p.page,
        "filters": p.filters, "is_default": p.is_default,
        "created_at": p.created_at, "updated_at": p.updated_at,
    }
