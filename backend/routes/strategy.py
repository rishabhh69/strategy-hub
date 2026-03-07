"""
Tradeky terminal strategy deployment: secure deploy endpoint and schema.

Supabase table 'strategies' (for terminal mode) should have columns:
  id (uuid, primary key), user_id (text), strategy_name (text), python_code (text),
  symbol (text), symboltoken (text), environment (text: 'paper'|'live'),
  mode (text: 'terminal'), status (text: 'active'), created_at (timestamptz, optional).
"""

import logging
import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from database import get_supabase
from engine.sandbox import SecurityBreachError, validate_code_security


router = APIRouter(prefix="/api/strategy", tags=["strategy"])
logger = logging.getLogger(__name__)


class DeployTerminalRequest(BaseModel):
    """Payload for POST /api/strategy/deploy-terminal."""
    user_id: str = Field(..., min_length=1, max_length=128)
    strategy_name: str = Field(..., min_length=1, max_length=256)
    code_string: str = Field(..., min_length=1, max_length=200_000)
    symbol: str = Field(..., min_length=1, max_length=64)
    symboltoken: str = Field(..., min_length=1, max_length=32)
    environment: Literal["paper", "live"] = Field(..., description="paper or live")


@router.post("/deploy-terminal")
async def deploy_terminal(req: DeployTerminalRequest):
    """
    Validate user code via AST security scanner, then save to Supabase `strategies` table.
    Stores python_code, mode='terminal', status='active'. Returns 400 if validation fails.

    Contract: code must define exactly one function `def evaluate(data):` that returns
    "BUY", "SELL", or "HOLD" (or a number: >0 BUY, <0 SELL). Only pandas, numpy, math, ta
    are allowed; os, sys, eval, exec, open, etc. are blocked. Trades execute only when
    your strategy returns BUY/SELL and position checks pass (no duplicate BUY, no SELL without position).
    """
    try:
        validate_code_security(req.code_string)
    except SecurityBreachError as e:
        logger.warning("deploy-terminal security breach: %s", e)
        raise HTTPException(
            status_code=400,
            detail=f"Code rejected for security: {e}. Only pandas, numpy, math, and ta are allowed. No os, sys, eval, exec, open, or similar.",
        )
    except ValueError as e:
        logger.warning("deploy-terminal validation: %s", e)
        raise HTTPException(
            status_code=400,
            detail=str(e) if "evaluate" in str(e).lower() or "syntax" in str(e).lower() else f"Validation failed: {e}",
        )

    try:
        supabase = get_supabase()
    except RuntimeError as e:
        logger.error("deploy-terminal Supabase not configured: %s", e)
        raise HTTPException(status_code=503, detail="Supabase is not configured or unreachable.")

    payload = {
        "id": str(uuid.uuid4()),
        "user_id": req.user_id,
        "strategy_name": req.strategy_name.strip(),
        "python_code": req.code_string,
        "symbol": req.symbol.strip(),
        "symboltoken": req.symboltoken.strip(),
        "environment": req.environment,
        "mode": "terminal",
        "status": "active",
    }

    try:
        result = supabase.table("strategies").insert(payload).execute()
        data = result.data
        row = data[0] if isinstance(data, list) and data else payload
        logger.info("deploy-terminal saved strategy id=%s user=%s", row.get("id"), req.user_id[:8])
        return {"ok": True, "id": row.get("id"), "status": "active", "message": "Strategy deployed to terminal."}
    except Exception as e:
        logger.error("Supabase Insert Failed (strategies): %s", str(e))
        raise HTTPException(status_code=500, detail=str(e))
