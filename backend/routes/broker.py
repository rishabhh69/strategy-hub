import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from SmartApi import SmartConnect
import pyotp

from database import get_supabase


router = APIRouter(prefix="/api/broker", tags=["broker"])
logger = logging.getLogger(__name__)


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
    # Ensure we pass a 6-digit TOTP string to SmartConnect
    totp_pin = str(pyotp.TOTP(totp_secret).now()).strip()
  except Exception as e:  # noqa: BLE001
    raise HTTPException(500, f"Failed to generate TOTP: {e}") from e

  try:
    smart = SmartConnect(api_key=api_key)
    # SmartConnect.generateSession expects positional args: username, password, totp
    session = smart.generateSession(client_id, password, totp_pin)
    # Angel One typically nests tokens under data['data']
    data = (session or {}).get("data") or {}
    token_data = data.get("data") or data
    jwt_token = (token_data or {}).get("jwtToken")
    refresh_token = (token_data or {}).get("refreshToken")
    feed_token = smart.getfeedToken()
    if not jwt_token or not feed_token:
      raise HTTPException(500, "Angel One did not return expected tokens.")
  except HTTPException:
    raise
  except Exception as e:  # noqa: BLE001
    raise HTTPException(400, f"Angel One login failed: {e}") from e

  # Persist broker_credentials row via Supabase: jwtToken→access_token, refreshToken→refresh_token, feedToken→feed_token
  try:
    supabase = get_supabase()
    resp = (
      supabase.table("broker_credentials")
      .upsert(
        {
          "user_id": payload.user_id,
          "broker_name": "angelone",
          "client_id": client_id,
          "pin": password,
          "totp_secret": totp_secret,
          "access_token": jwt_token,
          "feed_token": feed_token,
          "refresh_token": refresh_token,
          "is_active": True,
        },
        on_conflict="user_id,broker_name",
      )
      .execute()
    )
  except Exception as e:  # noqa: BLE001
    raise HTTPException(
      503,
      f"Database error while saving Angel One credentials (table broker_credentials). "
      f"Please contact support with this message: {e}",
    ) from e

  return {"ok": True, "updated": getattr(resp, "data", None) or []}


def refresh_all_broker_sessions() -> Dict[str, Any]:
  """
  Refresh Angel One sessions for all connected users. Uses stored client_id, pin, and
  totp_secret (or env ANGEL_TOTP_SECRET) per row. On failure (e.g. user changed PIN),
  sets that user's is_active to False so they can reconnect manually.
  """
  api_key = (os.getenv("ANGEL_API_KEY") or "").strip()
  if not api_key:
    logger.warning("refresh_all_broker_sessions: ANGEL_API_KEY not set, skipping.")
    return {"refreshed": 0, "failed": 0, "errors": ["ANGEL_API_KEY not configured"]}

  default_totp_secret = (os.getenv("ANGEL_TOTP_SECRET") or "").strip()
  supabase = get_supabase()
  errors: List[Dict[str, Any]] = []
  refreshed = 0
  failed = 0

  try:
    resp = (
      supabase.table("broker_credentials")
      .select("user_id, client_id, pin, totp_secret")
      .eq("broker_name", "angelone")
      .execute()
    )
  except Exception as e:  # noqa: BLE001
    logger.exception("refresh_all_broker_sessions: failed to fetch credentials")
    return {"refreshed": 0, "failed": 0, "errors": [str(e)]}

  rows = getattr(resp, "data", None) or []
  for row in rows:
    user_id = row.get("user_id")
    client_id = (row.get("client_id") or "").strip()
    pin = (row.get("pin") or "").strip()
    totp_secret = (row.get("totp_secret") or default_totp_secret or "").strip()

    if not client_id or not pin:
      errors.append({"user_id": user_id, "error": "Missing client_id or pin"})
      _set_broker_inactive(supabase, user_id)
      failed += 1
      continue
    if not totp_secret:
      errors.append({"user_id": user_id, "error": "Missing totp_secret (row and ANGEL_TOTP_SECRET)"})
      _set_broker_inactive(supabase, user_id)
      failed += 1
      continue

    try:
      totp_pin = str(pyotp.TOTP(totp_secret).now()).strip()
      smart = SmartConnect(api_key=api_key)
      session = smart.generateSession(client_id, pin, totp_pin)
      data = (session or {}).get("data") or {}
      token_data = data.get("data") or data
      jwt_token = (token_data or {}).get("jwtToken")
      refresh_token = (token_data or {}).get("refreshToken")
      feed_token = smart.getfeedToken()
      if not jwt_token or not feed_token:
        raise ValueError("Angel One did not return jwtToken or feedToken")
    except Exception as e:  # noqa: BLE001
      logger.warning("refresh_all_broker_sessions: refresh failed for user_id=%s: %s", user_id, e)
      errors.append({"user_id": user_id, "error": str(e)})
      _set_broker_inactive(supabase, user_id)
      failed += 1
      continue

    try:
      supabase.table("broker_credentials").update({
        "access_token": jwt_token,
        "refresh_token": refresh_token,
        "feed_token": feed_token,
        "is_active": True,
      }).eq("user_id", user_id).eq("broker_name", "angelone").execute()
      refreshed += 1
    except Exception as e:  # noqa: BLE001
      logger.warning("refresh_all_broker_sessions: DB update failed for user_id=%s: %s", user_id, e)
      errors.append({"user_id": user_id, "error": f"DB update: {e}"})
      failed += 1

  return {"refreshed": refreshed, "failed": failed, "errors": errors}


def _set_broker_inactive(supabase, user_id: str) -> None:
  try:
    supabase.table("broker_credentials").update({
      "is_active": False,
    }).eq("user_id", user_id).eq("broker_name", "angelone").execute()
  except Exception as e:  # noqa: BLE001
    logger.warning("_set_broker_inactive failed for user_id=%s: %s", user_id, e)


@router.post("/admin/refresh-all")
async def admin_refresh_all() -> Dict[str, Any]:
  """Trigger refresh of all Angel One broker sessions (for testing or manual run)."""
  result = refresh_all_broker_sessions()
  return {"ok": True, **result}


# Angel One symbol -> (tradingsymbol, symboltoken, exchange) for place-order
_ANGEL_SYMBOL_MAP: Dict[str, tuple] = {
  "NIFTY": ("NIFTY 50", "99926000", "NSE"),
  "BANKNIFTY": ("NIFTY BANK", "260105", "NSE"),
  "SENSEX": ("SENSEX", "99926009", "BSE"),
  "RELIANCE": ("RELIANCE-EQ", "2881", "NSE"),
  "TCS": ("TCS-EQ", "11536", "NSE"),
  "HDFCBANK": ("HDFCBANK-EQ", "1330", "NSE"),
  "INFY": ("INFY-EQ", "1594", "NSE"),
  "ICICIBANK": ("ICICIBANK-EQ", "1333", "NSE"),
  "SBIN": ("SBIN-EQ", "3045", "NSE"),
  "WIPRO": ("WIPRO-EQ", "9695", "NSE"),
  "TATAMOTORS": ("TATAMOTORS-EQ", "3456", "NSE"),
  "BAJFINANCE": ("BAJFINANCE-EQ", "317", "NSE"),
}


class PlaceOrderPayload(BaseModel):
  user_id: str = Field(..., min_length=1, max_length=128)
  broker_name: str = Field(..., min_length=1, max_length=64)
  symbol: str = Field(..., min_length=1, max_length=32)
  qty: int = Field(..., ge=1, le=100000)
  transaction_type: str = Field(..., pattern="^(BUY|SELL)$")
  order_type: str = Field(..., pattern="^(MARKET|LIMIT)$")
  price: Optional[float] = Field(default=None, ge=0)


def _get_smart_session(user_id: str, broker_name: str):
  """Load credentials and return a SmartConnect instance with session set. Raises on failure."""
  api_key = (os.getenv("ANGEL_API_KEY") or "").strip()
  if not api_key:
    raise ValueError("ANGEL_API_KEY not configured.")
  supabase = get_supabase()
  resp = (
    supabase.table("broker_credentials")
    .select("access_token, refresh_token")
    .eq("user_id", user_id)
    .eq("broker_name", broker_name)
    .eq("is_active", True)
    .limit(1)
    .execute()
  )
  rows = getattr(resp, "data", None) or []
  if not rows:
    raise ValueError("No active broker credentials found for this user and broker.")
  row = rows[0]
  access_token = (row.get("access_token") or "").strip()
  refresh_token = (row.get("refresh_token") or "").strip()
  if not access_token:
    raise ValueError("Broker session expired. Reconnect from Integrations.")
  smart = SmartConnect(api_key=api_key)
  smart.setAccessToken(access_token)
  smart.setRefreshToken(refresh_token)
  return smart


def get_angel_positions(user_id: str, broker_name: str) -> List[Dict[str, Any]]:
  """
  Return open positions for this user/broker from Angel One.
  Each item has tradingsymbol, netqty, etc. Used to avoid placing duplicate orders.
  """
  try:
    smart = _get_smart_session(user_id, broker_name)
    resp = smart.position()
  except Exception as e:  # noqa: BLE001
    logger.warning("get_angel_positions failed: %s", e)
    return []
  data = resp if isinstance(resp, dict) else getattr(resp, "data", resp) or {}
  payload = data.get("data") if isinstance(data.get("data"), list) else (data if isinstance(data, list) else [])
  return list(payload) if payload else []


def place_order_impl(
  user_id: str,
  broker_name: str,
  symbol: str,
  qty: int,
  transaction_type: str = "BUY",
  order_type: str = "MARKET",
  price: Optional[float] = None,
) -> Dict[str, Any]:
  """
  Place an order (sync). Used by the HTTP endpoint and by the strategy monitor.
  Returns {"ok": True, "orderid": "..."}. Raises on failure.
  """
  symbol_key = symbol.upper().replace(".NS", "").replace(" ", "")
  resolved = _ANGEL_SYMBOL_MAP.get(symbol_key)
  if not resolved:
    raise ValueError(f"Symbol '{symbol}' not supported for live order.")
  tradingsymbol, symboltoken, exchange = resolved
  smart = _get_smart_session(user_id, broker_name)
  orderparams: Dict[str, Any] = {
    "variety": "NORMAL",
    "tradingsymbol": tradingsymbol,
    "symboltoken": symboltoken,
    "transactiontype": transaction_type.upper(),
    "exchange": exchange,
    "ordertype": order_type.upper(),
    "producttype": "INTRADAY",
    "duration": "DAY",
    "quantity": str(qty),
  }
  if order_type.upper() == "LIMIT" and price is not None:
    orderparams["price"] = str(round(price, 2))
  result = smart.placeOrder(orderparams)
  data = result if isinstance(result, dict) else getattr(result, "data", result) or {}
  orderid = data.get("data", data) if isinstance(data.get("data"), str) else (data.get("data") or data).get("orderid")
  if not orderid:
    orderid = data.get("orderid")
  if not orderid:
    raise ValueError("Broker did not return an order ID.")
  return {"ok": True, "orderid": str(orderid)}


@router.post("/place-order")
async def place_order(payload: PlaceOrderPayload) -> Dict[str, Any]:
  """
  Place an order with the user's connected broker (Angel One). Uses stored access_token
  to set session and calls SmartConnect.placeOrder(). Returns orderid.
  """
  try:
    return place_order_impl(
      user_id=payload.user_id,
      broker_name=payload.broker_name,
      symbol=payload.symbol,
      qty=payload.qty,
      transaction_type=payload.transaction_type,
      order_type=payload.order_type,
      price=payload.price,
    )
  except ValueError as e:
    if "not supported" in str(e):
      raise HTTPException(400, str(e))
    if "credentials" in str(e).lower() or "session" in str(e).lower():
      raise HTTPException(401, str(e))
    raise HTTPException(400, str(e))
  except Exception as e:  # noqa: BLE001
    logger.warning("place_order failed: %s", e)
    raise HTTPException(400, f"Order placement failed: {e}") from e

