import os
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from SmartApi import SmartConnect
import pyotp

from database import get_supabase


router = APIRouter(prefix="/api/broker", tags=["broker"])


class AngelOneLoginPayload(BaseModel):
  # For non-admin users we accept client_id/password from the request.
  # For admin / fully server-side flows, these may be omitted and taken from env.
  client_id: str | None = Field(default=None, min_length=1, max_length=128)
  password: str | None = Field(default=None, min_length=1)
  user_id: str = Field(..., min_length=1, max_length=128)


@router.post("/angelone/login")
async def angelone_login(payload: AngelOneLoginPayload) -> Dict[str, Any]:
  """
  Perform Angel One SmartAPI login using API key, client_id, password and TOTP,
  then upsert broker_credentials with broker_name='angelone' for the given user_id.

  NOTE: In production you should NOT send raw password/TOTP from the frontend.
  This implementation follows the user's requested shape but should be hardened.
  """
  api_key = os.getenv("ANGEL_API_KEY")
  if not api_key:
    raise HTTPException(500, "ANGEL_API_KEY not configured on server.")

  # Resolve credentials: prefer request payload, fall back to backend .env defaults.
  client_id = (payload.client_id or os.getenv("ANGEL_CLIENT_ID") or "").strip()
  password = (payload.password or os.getenv("ANGEL_PASSWORD") or "").strip()
  if not client_id or not password:
    raise HTTPException(400, "Angel One client_id/password not provided and no backend defaults configured.")

  # Always generate TOTP internally using backend secret to avoid asking user for 6-digit code.
  totp_secret = os.getenv("ANGEL_TOTP_SECRET")
  if not totp_secret:
    raise HTTPException(500, "ANGEL_TOTP_SECRET not configured on server.")
  try:
    totp_pin = pyotp.TOTP(totp_secret).now()
  except Exception as e:  # noqa: BLE001
    raise HTTPException(500, f"Failed to generate TOTP: {e}") from e

  try:
    smart = SmartConnect(api_key=api_key)
    session = smart.generateSession(
      client_id=client_id,
      password=password,
      totp=totp_pin,
    )
    data = session.get("data") or session
    jwt_token = (data or {}).get("jwtToken")
    feed_token = smart.getfeedToken()
    if not jwt_token or not feed_token:
      raise HTTPException(500, "Angel One did not return expected tokens.")
  except HTTPException:
    raise
  except Exception as e:  # noqa: BLE001
    raise HTTPException(400, f"Angel One login failed: {e}") from e

  # Persist broker_credentials row via Supabase: map jwtToken→access_token, feed_token→encrypted_api_key
  try:
    supabase = get_supabase()
    resp = (
      supabase.table("broker_credentials")
      .upsert(
        {
          "user_id": payload.user_id,
          "broker_name": "angelone",
          "encrypted_api_key": feed_token,
          "access_token": jwt_token,
          "is_active": True,
        },
        on_conflict="user_id,broker_name",
      )
      .execute()
    )
  except Exception as e:  # noqa: BLE001
    raise HTTPException(503, f"Failed to persist Angel One credentials: {e}") from e

  return {"ok": True, "updated": getattr(resp, "data", None) or []}

