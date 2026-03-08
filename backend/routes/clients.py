"""
RIA Client Accounts API. Broker secrets (PIN, TOTP) are encrypted at rest; never returned to frontend.
"""

import logging
import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from database import get_supabase
from utils.encryption import encrypt_secret


router = APIRouter(prefix="/api/clients", tags=["clients"])
logger = logging.getLogger(__name__)

MASKED = "****"


class AddClientRequest(BaseModel):
    """Payload for POST /api/clients/add."""
    ria_user_id: str = Field(..., min_length=1, max_length=128, description="RIA's user_id (auth.uid())")
    client_name: str = Field(..., min_length=1, max_length=256)
    capital_allocation: float = Field(..., ge=0)
    broker: str = Field(..., min_length=1, max_length=64)
    client_id: str = Field(..., min_length=1, max_length=128)
    pin: str = Field(..., min_length=1, max_length=64)
    totp_secret: str = Field(..., min_length=1, max_length=128)


@router.post("/add")
async def add_client(req: AddClientRequest) -> Dict[str, Any]:
    """
    Add a client account. PIN and TOTP secret are encrypted before storing; never stored in plain text.
    """
    try:
        encrypted_pin = encrypt_secret(req.pin)
        encrypted_totp = encrypt_secret(req.totp_secret)
    except RuntimeError as e:
        logger.warning("Encryption config error: %s", e)
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.exception("Encryption failed")
        raise HTTPException(status_code=500, detail="Failed to encrypt credentials.")

    try:
        supabase = get_supabase()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail="Supabase is not configured.")

    row = {
        "id": str(uuid.uuid4()),
        "ria_user_id": req.ria_user_id.strip(),
        "client_name": req.client_name.strip(),
        "capital_allocation": req.capital_allocation,
        "broker": req.broker.strip().lower(),
        "client_id": req.client_id.strip(),
        "encrypted_pin": encrypted_pin,
        "encrypted_totp_secret": encrypted_totp,
        "status": "Active",
    }
    try:
        result = supabase.table("client_accounts").insert(row).execute()
        data = result.data
        inserted = data[0] if isinstance(data, list) and data else row
    except Exception as e:
        logger.error("client_accounts insert failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

    # Return inserted row but never expose encrypted secrets to frontend
    out = dict(inserted) if isinstance(inserted, dict) else {}
    out["encrypted_pin"] = MASKED
    out["encrypted_totp_secret"] = MASKED
    return {"ok": True, "client": out}


@router.get("/list")
async def list_clients(
    ria_user_id: str | None = Query(None, min_length=1, max_length=128),
    user_id: str | None = Query(None, min_length=1, max_length=128),
) -> List[Dict[str, Any]]:
    """
    List all client accounts for the RIA. Encrypted PIN and TOTP are never returned; masked as ****.
    Pass ria_user_id= or user_id= (RIA's auth user id).
    """
    uid = (ria_user_id or user_id or "").strip()
    if not uid:
        raise HTTPException(400, "ria_user_id or user_id required")
    try:
        supabase = get_supabase()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Supabase is not configured.")

    try:
        result = supabase.table("client_accounts").select(
            "id, ria_user_id, client_name, capital_allocation, broker, client_id, status, created_at"
        ).eq("ria_user_id", uid).order("created_at", desc=True).execute()
        rows = result.data or []
    except Exception as e:
        logger.error("client_accounts list failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

    # Ensure we never send encrypted fields (select already omitted them; be explicit)
    out: List[Dict[str, Any]] = []
    for r in rows:
        row = dict(r)
        row.setdefault("encrypted_pin", MASKED)
        row.setdefault("encrypted_totp_secret", MASKED)
        out.append(row)
    return out


@router.delete("/{client_id}")
async def delete_client(
    client_id: str,
    user_id: str = Query(..., min_length=1, max_length=128),
) -> Dict[str, Any]:
    """Delete a client account. Only the owning RIA (ria_user_id = user_id) can delete."""
    try:
        supabase = get_supabase()
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Supabase is not configured.")
    try:
        supabase.table("client_accounts").delete().eq("id", client_id).eq("ria_user_id", user_id).execute()
    except Exception as e:
        logger.error("client_accounts delete failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True, "deleted": client_id}
