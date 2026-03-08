import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from SmartApi import SmartConnect
import pyotp

from database import get_supabase
from utils.encryption import decrypt_secret


router = APIRouter(prefix="/api/broker", tags=["broker"])
logger = logging.getLogger(__name__)


class AngelOneLoginPayload(BaseModel):
  # For normal users: send client_id, password, totp_secret to connect their own broker.
  # For admin / server-side: omit and use env ANGEL_CLIENT_ID, ANGEL_PASSWORD, ANGEL_TOTP_SECRET.
  client_id: str | None = Field(default=None, min_length=1, max_length=128)
  password: str | None = Field(default=None, min_length=1)
  totp_secret: str | None = Field(default=None, min_length=1, max_length=128)
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
  totp_secret = (payload.totp_secret or os.getenv("ANGEL_TOTP_SECRET") or "").strip()
  if not client_id or not password:
    raise HTTPException(400, "Angel One client_id/password not provided and no backend defaults configured.")
  if not totp_secret:
    raise HTTPException(
      400,
      "TOTP secret required. Provide it in the request (Settings → Connect broker) or set ANGEL_TOTP_SECRET on server.",
    )
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

  # Persist broker_credentials so user can execute trades and connection stays active (daily auto-refresh)
  now_iso = datetime.now(timezone.utc).isoformat()
  try:
    supabase = get_supabase()
    upsert_payload: Dict[str, Any] = {
      "user_id": payload.user_id,
      "broker_name": "angelone",
      "client_id": client_id,
      "pin": password,
      "totp_secret": totp_secret,
      "access_token": jwt_token,
      "feed_token": feed_token,
      "refresh_token": refresh_token,
      "is_active": True,
      "last_connected": now_iso,
      "status": "Active",
    }
    resp = (
      supabase.table("broker_credentials")
      .upsert(upsert_payload, on_conflict="user_id,broker_name")
      .execute()
    )
  except Exception as e:  # noqa: BLE001
    err_str = str(e).lower()
    if "column" in err_str or "unknown" in err_str:
      for k in ("last_connected", "status"):
        upsert_payload.pop(k, None)
      try:
        resp = (
          supabase.table("broker_credentials")
          .upsert(upsert_payload, on_conflict="user_id,broker_name")
          .execute()
        )
      except Exception as e2:  # noqa: BLE001
        raise HTTPException(
          503,
          f"Database error while saving Angel One credentials: {e2}",
        ) from e2
    else:
      raise HTTPException(
        503,
        f"Database error while saving Angel One credentials: {e}",
      ) from e

  return {"ok": True, "updated": getattr(resp, "data", None) or []}


def _extract_angel_error_code(err: Exception) -> Optional[str]:
  """Extract Angel One error code (e.g. AB1010, AG8001) from exception message if present."""
  msg = str(err)
  m = re.search(r"\b([A-Z]{2}\d{4,5})\b", msg, re.IGNORECASE)
  return m.group(1) if m else None


def auto_refresh_sessions() -> Dict[str, Any]:
  """
  Refresh Angel One sessions for all users in broker_credentials. Runs daily at 08:45 AM IST.
  1. Query all rows (angelone), get client_id, pin, totp_secret.
  2. Generate 6-digit TOTP, call generateSession(client_id, pin, totp).
  3. Update record with new access_token, refresh_token, feed_token; set status Active, last_connected.
  4. On failure (e.g. invalid PIN), set status Inactive and log error code (e.g. AB1010).
  """
  api_key = (os.getenv("ANGEL_API_KEY") or "").strip()
  if not api_key:
    logger.warning("auto_refresh_sessions: ANGEL_API_KEY not set, skipping.")
    return {"refreshed": 0, "failed": 0, "errors": ["ANGEL_API_KEY not configured"]}

  default_totp_secret = (os.getenv("ANGEL_TOTP_SECRET") or "").strip()
  supabase = get_supabase()
  errors: List[Dict[str, Any]] = []
  refreshed = 0
  failed = 0
  now_iso = datetime.now(timezone.utc).isoformat()

  try:
    resp = (
      supabase.table("broker_credentials")
      .select("user_id, client_id, pin, totp_secret")
      .eq("broker_name", "angelone")
      .execute()
    )
  except Exception as e:  # noqa: BLE001
    logger.exception("auto_refresh_sessions: failed to fetch credentials")
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
      code = _extract_angel_error_code(e)
      err_msg = str(e)
      logger.warning(
        "auto_refresh_sessions: refresh failed for user_id=%s error_code=%s msg=%s",
        user_id, code or "—", err_msg,
      )
      errors.append({"user_id": user_id, "error": err_msg, "error_code": code})
      _set_broker_inactive(supabase, user_id)
      failed += 1
      continue

    update_payload: Dict[str, Any] = {
      "access_token": jwt_token,
      "refresh_token": refresh_token,
      "feed_token": feed_token,
      "is_active": True,
      "last_connected": now_iso,
      "status": "Active",
    }
    try:
      supabase.table("broker_credentials").update(update_payload).eq(
        "user_id", user_id
      ).eq("broker_name", "angelone").execute()
      refreshed += 1
    except Exception as e:  # noqa: BLE001
      err_str = str(e).lower()
      if "column" in err_str or "unknown" in err_str:
        for key in ("last_connected", "status"):
          update_payload.pop(key, None)
        try:
          supabase.table("broker_credentials").update(update_payload).eq(
            "user_id", user_id
          ).eq("broker_name", "angelone").execute()
          refreshed += 1
        except Exception as e2:  # noqa: BLE001
          logger.warning("auto_refresh_sessions: DB update failed for user_id=%s: %s", user_id, e2)
          errors.append({"user_id": user_id, "error": str(e2)})
          failed += 1
      else:
        logger.warning("auto_refresh_sessions: DB update failed for user_id=%s: %s", user_id, e)
        errors.append({"user_id": user_id, "error": str(e)})
        failed += 1

  return {"refreshed": refreshed, "failed": failed, "errors": errors}


def refresh_all_broker_sessions() -> Dict[str, Any]:
  """Alias for auto_refresh_sessions (used by admin/refresh-all and scheduler)."""
  return auto_refresh_sessions()


def _set_broker_inactive(supabase, user_id: str) -> None:
  """Set broker to Inactive on refresh failure (invalid PIN, error code e.g. AB1010)."""
  payload: Dict[str, Any] = {"is_active": False, "status": "Inactive"}
  try:
    supabase.table("broker_credentials").update(payload).eq(
      "user_id", user_id
    ).eq("broker_name", "angelone").execute()
  except Exception as e:  # noqa: BLE001
    payload.pop("status", None)
    try:
      supabase.table("broker_credentials").update(payload).eq(
        "user_id", user_id
      ).eq("broker_name", "angelone").execute()
    except Exception as e2:  # noqa: BLE001
      logger.warning("_set_broker_inactive failed for user_id=%s: %s", user_id, e2)


@router.post("/admin/refresh-all")
async def admin_refresh_all() -> Dict[str, Any]:
  """Trigger refresh of all Angel One broker sessions (for testing or manual run)."""
  result = auto_refresh_sessions()
  return {"ok": True, **result}


@router.post("/refresh-test")
async def refresh_test() -> Dict[str, Any]:
  """Manual trigger for auto_refresh_sessions to verify daily login works (e.g. before market open)."""
  result = auto_refresh_sessions()
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
  # When provided by frontend (from symbolMap), skip server-side symbol resolution
  angel_symbol: Optional[str] = Field(default=None, max_length=64)
  token: Optional[str] = Field(default=None, max_length=32)
  exchange: Optional[str] = Field(default="NSE", max_length=8)


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
  angel_symbol: Optional[str] = None,
  token: Optional[str] = None,
  exchange: Optional[str] = None,
) -> Dict[str, Any]:
  """
  Place an order (sync). When angel_symbol and token are provided, use them; else resolve from symbol map.
  """
  if angel_symbol and token:
    tradingsymbol = angel_symbol.strip()
    symboltoken = token.strip()
    exchange_str = (exchange or "NSE").strip().upper()
  else:
    symbol_key = symbol.upper().replace(".NS", "").replace(" ", "")
    resolved = _ANGEL_SYMBOL_MAP.get(symbol_key)
    if not resolved:
      raise ValueError(f"Symbol '{symbol}' not supported for live order.")
    tradingsymbol, symboltoken, exchange_str = resolved
  smart = _get_smart_session(user_id, broker_name)
  orderparams: Dict[str, Any] = {
    "variety": "NORMAL",
    "tradingsymbol": tradingsymbol,
    "symboltoken": symboltoken,
    "transactiontype": transaction_type.upper(),
    "exchange": exchange_str,
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
  Place an order with the user's connected broker (Angel One). When angel_symbol and token
  are provided (from frontend symbolMap), they are used directly; otherwise symbol is resolved via map.
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
      angel_symbol=payload.angel_symbol,
      token=payload.token,
      exchange=payload.exchange,
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


# ---------------------------------------------------------------------------
# Bulk order: RIA triggers trade for all active clients (decrypt creds, concurrent execution)
# ---------------------------------------------------------------------------

class PlaceBulkOrderPayload(BaseModel):
  ria_user_id: str = Field(..., min_length=1, max_length=128)
  strategy_name: Optional[str] = Field(default=None, max_length=256)
  tradingsymbol: str = Field(..., min_length=1, max_length=64)
  symboltoken: str = Field(..., min_length=1, max_length=32)
  transaction_type: str = Field(..., pattern="^(BUY|SELL)$")
  order_type: str = Field(..., pattern="^(MARKET|LIMIT)$")
  price: Optional[float] = Field(default=None, ge=0)
  exchange: str = Field(default="NSE", max_length=8)
  # Reference price (e.g. LTP) used to compute quantity from capital_allocation: qty = capital / reference_price
  reference_price: float = Field(default=1.0, gt=0, description="Current price for qty calculation (e.g. LTP)")


async def execute_client_order(
  client_data: Dict[str, Any],
  order_details: Dict[str, Any],
  reference_price: float,
) -> Dict[str, Any]:
  """
  Async helper: decrypt pin/totp, generate TOTP, then run SmartConnect + placeOrder in a thread.
  client_data = one row from client_accounts (with encrypted_pin, encrypted_totp_secret, capital_allocation, etc).
  """
  try:
    pin = decrypt_secret(client_data.get("encrypted_pin") or "")
    totp_secret = decrypt_secret(client_data.get("encrypted_totp_secret") or "")
  except Exception as e:  # noqa: BLE001
    logger.warning("execute_client_order: decrypt failed for client %s: %s", client_data.get("client_id"), e)
    return {
      "client_id": client_data.get("client_id"),
      "client_name": client_data.get("client_name"),
      "success": False,
      "error": "Decryption failed",
    }
  totp_pin = str(pyotp.TOTP(totp_secret).now()).strip()
  capital = float(client_data.get("capital_allocation") or 0)
  if capital <= 0:
    capital = 1.0
  quantity = max(1, int(capital / reference_price))
  client_exec = {
    "client_id": (client_data.get("client_id") or "").strip(),
    "client_name": (client_data.get("client_name") or "").strip(),
    "pin": pin,
    "totp_pin": totp_pin,
    "quantity": quantity,
  }
  return await asyncio.to_thread(_execute_single_client_order_sync, client_exec, order_details)


def _execute_single_client_order_sync(
  client_exec: Dict[str, Any],
  order_details: Dict[str, Any],
) -> Dict[str, Any]:
  """
  Synchronous helper: create SmartConnect session for this client and place order.
  Called from asyncio.to_thread. Returns {client_id, client_name, success, orderid?, error?}.
  """
  api_key = (os.getenv("ANGEL_API_KEY") or "").strip()
  if not api_key:
    return {
      "client_id": client_exec.get("client_id"),
      "client_name": client_exec.get("client_name"),
      "success": False,
      "error": "ANGEL_API_KEY not configured",
    }
  client_id = (client_exec.get("client_id") or "").strip()
  pin = (client_exec.get("pin") or "").strip()
  totp_pin = (client_exec.get("totp_pin") or "").strip()
  qty = int(client_exec.get("quantity", 1))
  if not client_id or not pin or not totp_pin:
    return {
      "client_id": client_id,
      "client_name": client_exec.get("client_name"),
      "success": False,
      "error": "Missing client_id, pin, or totp",
    }
  if qty < 1:
    return {
      "client_id": client_id,
      "client_name": client_exec.get("client_name"),
      "success": False,
      "error": "Quantity must be >= 1",
    }
  try:
    smart = SmartConnect(api_key=api_key)
    session = smart.generateSession(client_id, pin, totp_pin)
    data = (session or {}).get("data") or {}
    token_data = data.get("data") or data
    jwt_token = (token_data or {}).get("jwtToken")
    if not jwt_token:
      return {
        "client_id": client_id,
        "client_name": client_exec.get("client_name"),
        "success": False,
        "error": "Angel One login failed (no token)",
      }
    smart.setAccessToken(jwt_token)
    refresh = (token_data or {}).get("refreshToken")
    if refresh:
      smart.setRefreshToken(refresh)
    orderparams: Dict[str, Any] = {
      "variety": "NORMAL",
      "tradingsymbol": order_details["tradingsymbol"],
      "symboltoken": order_details["symboltoken"],
      "transactiontype": order_details["transaction_type"],
      "exchange": order_details.get("exchange", "NSE"),
      "ordertype": order_details["order_type"],
      "producttype": "INTRADAY",
      "duration": "DAY",
      "quantity": str(qty),
    }
    if (order_details.get("order_type") or "").upper() == "LIMIT" and order_details.get("price") is not None:
      orderparams["price"] = str(round(order_details["price"], 2))
    result = smart.placeOrder(orderparams)
    data = result if isinstance(result, dict) else getattr(result, "data", result) or {}
    orderid = data.get("data", data) if isinstance(data.get("data"), str) else (data.get("data") or data).get("orderid")
    if not orderid:
      orderid = data.get("orderid")
    return {
      "client_id": client_id,
      "client_name": client_exec.get("client_name"),
      "success": True,
      "orderid": str(orderid) if orderid else None,
    }
  except Exception as e:  # noqa: BLE001
    return {
      "client_id": client_id,
      "client_name": client_exec.get("client_name"),
      "success": False,
      "error": str(e),
    }


async def place_bulk_order_impl(
  ria_user_id: str,
  tradingsymbol: str,
  symboltoken: str,
  transaction_type: str,
  order_type: str,
  reference_price: float,
  exchange: str = "NSE",
  price: Optional[float] = None,
) -> Dict[str, Any]:
  """
  RIA bulk execution: fetch active clients, decrypt creds, place orders concurrently.
  Used by POST /place-bulk-order and by the strategy monitor when the deployment user has client accounts.
  """
  try:
    supabase = get_supabase()
  except RuntimeError:
    return {"ok": False, "total": 0, "success_count": 0, "failed_count": 0, "successful": [], "failed": [], "message": "Supabase not configured."}

  try:
    resp = (
      supabase.table("client_accounts")
      .select("id, client_id, client_name, capital_allocation, encrypted_pin, encrypted_totp_secret")
      .eq("ria_user_id", ria_user_id)
      .eq("status", "Active")
      .execute()
    )
  except Exception as e:  # noqa: BLE001
    logger.exception("place_bulk_order_impl: failed to fetch client_accounts")
    return {"ok": False, "total": 0, "success_count": 0, "failed_count": 0, "successful": [], "failed": [], "message": str(e)}

  rows = getattr(resp, "data", None) or []
  if not rows:
    return {
      "ok": True,
      "total": 0,
      "success_count": 0,
      "failed_count": 0,
      "successful": [],
      "failed": [],
      "message": "No active clients found for this RIA.",
    }

  order_details = {
    "tradingsymbol": tradingsymbol.strip(),
    "symboltoken": symboltoken.strip(),
    "transaction_type": transaction_type.upper(),
    "order_type": order_type.upper(),
    "exchange": (exchange or "NSE").strip().upper(),
    "price": price,
  }

  tasks = [execute_client_order(row, order_details, reference_price) for row in rows]
  results = await asyncio.gather(*tasks, return_exceptions=True)

  successful = [{"client_id": r.get("client_id"), "client_name": r.get("client_name"), "orderid": r.get("orderid")} for r in results if isinstance(r, dict) and r.get("success")]
  failed: List[Dict[str, Any]] = []
  for r in results:
    if isinstance(r, Exception):
      failed.append({"success": False, "error": str(r)})
    elif isinstance(r, dict) and not r.get("success"):
      failed.append({"client_id": r.get("client_id"), "client_name": r.get("client_name"), "error": r.get("error", "Unknown error")})

  return {
    "ok": True,
    "total": len(rows),
    "success_count": len(successful),
    "failed_count": len(failed),
    "successful": successful,
    "failed": failed,
  }


@router.post("/place-bulk-order")
async def place_bulk_order(payload: PlaceBulkOrderPayload) -> Dict[str, Any]:
  """RIA bulk execution HTTP endpoint. Delegates to place_bulk_order_impl."""
  api_key = (os.getenv("ANGEL_API_KEY") or "").strip()
  if not api_key:
    raise HTTPException(500, "ANGEL_API_KEY not configured.")
  return await place_bulk_order_impl(
    ria_user_id=payload.ria_user_id,
    tradingsymbol=payload.tradingsymbol,
    symboltoken=payload.symboltoken,
    transaction_type=payload.transaction_type,
    order_type=payload.order_type,
    reference_price=payload.reference_price,
    exchange=payload.exchange,
    price=payload.price,
  )

