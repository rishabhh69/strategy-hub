"""
Tradeky Backend — FastAPI server

Data fetching strategy (most reliable → least):
  1. Yahoo Finance v8 chart API (direct HTTP, no auth needed, fast)
  2. yf.Ticker.history()  as fallback
  3. Return empty / zeros — never synthetic mock data for quotes/candles
"""

import logging
import os
import random
import signal
import sys
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import requests
import yfinance as yf
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel

logging.getLogger("yfinance").setLevel(logging.WARNING)
logging.getLogger("peewee").setLevel(logging.CRITICAL)

# ---------------------------------------------------------------------------
# App + CORS  (allow all origins in dev)
# ---------------------------------------------------------------------------
app = FastAPI(title="Tradeky Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# OpenAI
# ---------------------------------------------------------------------------
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    print("WARNING: OPENAI_API_KEY not set — /backtest will not work.")
openai_client = OpenAI(api_key=openai_api_key) if openai_api_key else None

# ---------------------------------------------------------------------------
# Persistent requests session for Yahoo Finance v8 API
# ---------------------------------------------------------------------------
_YF_SESSION = requests.Session()
_YF_SESSION.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept":          "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer":         "https://finance.yahoo.com/",
})

# ---------------------------------------------------------------------------
# In-memory cache
# ---------------------------------------------------------------------------
_quote_cache:  Dict[str, Tuple[Dict, float]] = {}
_candle_cache: Dict[str, Tuple[Dict, float]] = {}

QUOTE_TTL  = 60    # seconds
CANDLE_TTL = 120   # seconds

# ---------------------------------------------------------------------------
# Ticker normalisation
# ---------------------------------------------------------------------------
_INDEX_MAP = {
    "NIFTY":      "^NSEI",
    "NIFTY 50":   "^NSEI",
    "NIFTY50":    "^NSEI",
    "BANKNIFTY":  "^NSEBANK",
    "BANK NIFTY": "^NSEBANK",
}


def normalise(ticker: str) -> str:
    t = ticker.replace("%20", " ").strip().upper()
    if t in _INDEX_MAP:
        return _INDEX_MAP[t]
    if not t.endswith(".NS") and not t.startswith("^"):
        return f"{t}.NS"
    return t


# ---------------------------------------------------------------------------
# Primary data source — Yahoo Finance v8 chart API (no auth needed)
# ---------------------------------------------------------------------------
def _yahoo_v8(symbol: str, range_: str = "5d", interval: str = "1d") -> List[Dict]:
    """
    Call Yahoo Finance v8 chart endpoint directly.
    Tries query1 first; falls back to query2 on 404 (some symbols only live on query2).
    Returns list of OHLCV dicts (time = Unix seconds).
    """
    encoded = symbol.replace("^", "%5E")
    params = {
        "range":          range_,
        "interval":       interval,
        "includePrePost": "false",
        "events":         "div,splits",
    }
    hosts = [
        "https://query1.finance.yahoo.com",
        "https://query2.finance.yahoo.com",
    ]
    for host in hosts:
        url = f"{host}/v8/finance/chart/{encoded}"
        try:
            r = _YF_SESSION.get(url, params=params, timeout=15)
            if r.status_code == 429:
                raise RuntimeError("429 Too Many Requests from Yahoo Finance")
            if r.status_code == 404:
                print(f"[Yahoo v8] 404 on {host} for {symbol} — trying next host...")
                continue   # try query2
            r.raise_for_status()

            data    = r.json()
            chart   = data.get("chart", {})
            results = chart.get("result") or []
            if not results:
                print(f"[Yahoo v8] No result for {symbol}: {chart.get('error')}")
                continue   # try next host

            res        = results[0]
            timestamps = res.get("timestamp") or []
            quote      = (res.get("indicators", {}).get("quote") or [{}])[0]
            opens      = quote.get("open",   [])
            highs      = quote.get("high",   [])
            lows       = quote.get("low",    [])
            closes     = quote.get("close",  [])
            volumes    = quote.get("volume", [])

            candles: List[Dict] = []
            for i, ts in enumerate(timestamps):
                try:
                    o = opens[i];  h = highs[i]
                    lo = lows[i];  c = closes[i]
                    v  = volumes[i]
                    if None not in (o, h, lo, c):
                        candles.append({
                            "time":   int(ts),
                            "open":   round(float(o),  2),
                            "high":   round(float(h),  2),
                            "low":    round(float(lo), 2),
                            "close":  round(float(c),  2),
                            "volume": int(v) if v else 0,
                        })
                except (IndexError, TypeError, ValueError):
                    pass
            print(f"[Yahoo v8] {symbol} ({range_}/{interval}): {len(candles)} bars via {host.split('.')[1]}")
            return candles

        except RuntimeError:
            raise
        except Exception as e:
            print(f"[Yahoo v8] Error on {host} for {symbol}: {e}")
            continue   # try next host

    # All hosts failed
    print(f"[Yahoo v8] All hosts failed for {symbol}")
    return []


def _yahoo_v8_quote(symbol: str) -> Optional[Dict]:
    """
    Get current/last price via v8 API (2-day daily → last close).
    Returns {"price": float, "change_percent": float} or None.
    """
    bars = _yahoo_v8(symbol, range_="5d", interval="1d")
    if not bars:
        return None
    cur  = bars[-1]["close"]
    prev = bars[-2]["close"] if len(bars) >= 2 else cur
    chg  = ((cur - prev) / prev * 100) if prev else 0.0
    return {"price": round(cur, 2), "change_percent": round(chg, 2)}


# ---------------------------------------------------------------------------
# Fallback — yf.Ticker.history() (same underlying Yahoo endpoint)
# ---------------------------------------------------------------------------
def _yf_history(symbol: str, period: str = "5d", interval: str = "1d") -> List[Dict]:
    """yfinance fallback. Returns OHLCV list or empty list."""
    try:
        t  = yf.Ticker(symbol)
        df = t.history(period=period, interval=interval, auto_adjust=True)
        if df.empty:
            print(f"[yfinance] {symbol}: empty DataFrame")
            return []
        candles: List[Dict] = []
        for ts, row in df.iterrows():
            unix_ts = int(ts.timestamp()) if hasattr(ts, "timestamp") else int(ts)
            candles.append({
                "time":   unix_ts,
                "open":   round(float(row["Open"]),  2),
                "high":   round(float(row["High"]),  2),
                "low":    round(float(row["Low"]),   2),
                "close":  round(float(row["Close"]), 2),
                "volume": int(row.get("Volume", 0)),
            })
        print(f"[yfinance] {symbol} ({period}/{interval}): {len(candles)} bars")
        return candles
    except Exception as e:
        print(f"[yfinance] Error for {symbol}: {e}")
        return []


# ---------------------------------------------------------------------------
# Batch quote helper (used by /quotes endpoint)
# ---------------------------------------------------------------------------
def _batch_quotes(symbols: List[str]) -> Dict[str, Optional[Dict]]:
    """Fetch quotes for multiple symbols. Returns {sym -> quote_dict or None}."""
    out: Dict[str, Optional[Dict]] = {}
    for sym in symbols:
        try:
            q = _yahoo_v8_quote(sym)
            if q is None:
                # fallback
                bars = _yf_history(sym, period="5d", interval="1d")
                if bars:
                    cur  = bars[-1]["close"]
                    prev = bars[-2]["close"] if len(bars) >= 2 else cur
                    chg  = ((cur - prev) / prev * 100) if prev else 0.0
                    q = {"price": round(cur, 2), "change_percent": round(chg, 2)}
            out[sym] = q
        except Exception as e:
            print(f"[BatchQuote] {sym}: {e}")
            out[sym] = None
    return out


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class BacktestRequest(BaseModel):
    ticker: str
    prompt: str


class BacktestResponse(BaseModel):
    metrics:        Dict[str, float]
    chart_data:     List[Dict[str, Any]]
    generated_code: str


class TradeRequest(BaseModel):
    symbol:      str
    side:        str           # "buy" or "sell"
    quantity:    int
    strategy_id: Optional[str] = None


class TradeResponse(BaseModel):
    status:         str
    order_id:       str
    symbol:         str
    side:           str
    quantity:       int
    executed_price: float
    message:        str


# ---------------------------------------------------------------------------
# /  health check
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    return {
        "message":           "Tradeky Backend API",
        "status":            "running",
        "openai_configured": openai_client is not None,
    }


# ---------------------------------------------------------------------------
# /debug/{ticker}  — quick sanity-check endpoint
# ---------------------------------------------------------------------------
@app.get("/debug/{ticker}")
async def debug_ticker(ticker: str):
    sym   = normalise(ticker)
    v8    = _yahoo_v8(sym, range_="5d", interval="1d")
    yhist = _yf_history(sym, period="5d", interval="1d")
    return {
        "symbol":       sym,
        "v8_bars":      len(v8),
        "v8_last":      v8[-1] if v8 else None,
        "yf_bars":      len(yhist),
        "yf_last":      yhist[-1] if yhist else None,
    }


# ---------------------------------------------------------------------------
# /quote/{ticker}
# ---------------------------------------------------------------------------
@app.get("/quote/{ticker}")
async def get_quote(ticker: str):
    ticker = ticker.replace("%20", " ").strip()
    key    = ticker.upper()
    now    = time.time()

    if key in _quote_cache and now < _quote_cache[key][1]:
        return _quote_cache[key][0]

    sym = normalise(ticker)
    print(f"[Quote] Fetching {sym}...")

    result: Dict[str, Any] = {"price": 0.0, "change_percent": 0.0}
    try:
        q = _yahoo_v8_quote(sym)
        if q:
            result = q
        else:
            # fallback to yfinance
            bars = _yf_history(sym, period="5d", interval="1d")
            if bars:
                cur  = bars[-1]["close"]
                prev = bars[-2]["close"] if len(bars) >= 2 else cur
                chg  = ((cur - prev) / prev * 100) if prev else 0.0
                result = {"price": round(cur, 2), "change_percent": round(chg, 2)}
            else:
                result["unavailable"] = True
    except RuntimeError as e:
        # 429
        if key in _quote_cache:
            return _quote_cache[key][0]
        result["unavailable"] = True
    except Exception as e:
        print(f"[Quote] Unexpected error for {sym}: {e}")
        result["unavailable"] = True

    print(f"[Quote] {sym}: {result}")
    _quote_cache[key] = (result, now + QUOTE_TTL)
    return result


# ---------------------------------------------------------------------------
# /quotes  — batch
# ---------------------------------------------------------------------------
@app.get("/quotes")
async def get_quotes_batch(tickers: str):
    symbols_raw = [s.strip() for s in tickers.split(",") if s.strip()]
    if not symbols_raw:
        return []

    now     = time.time()
    results = []
    to_fetch: List[str] = []

    for raw in symbols_raw:
        key = raw.upper()
        if key in _quote_cache and now < _quote_cache[key][1]:
            results.append({"ticker": raw, **_quote_cache[key][0]})
        else:
            to_fetch.append(raw)

    if to_fetch:
        syms_ns = [normalise(t) for t in to_fetch]
        print(f"[Quotes] Fetching: {syms_ns}")
        batch = _batch_quotes(syms_ns)

        for raw, sym in zip(to_fetch, syms_ns):
            key     = raw.upper()
            q       = batch.get(sym)
            payload: Dict[str, Any] = q if q else {"price": 0.0, "change_percent": 0.0, "unavailable": True}
            _quote_cache[key] = (payload, now + QUOTE_TTL)
            results.append({"ticker": raw, **payload})

    return results


# ---------------------------------------------------------------------------
# /candles/{ticker}
#   1. Try intraday 5m  (range=1d)
#   2. If empty → try 1mo daily bars  (market closed / weekend)
#   3. If still empty → return []  with market_closed=true
# ---------------------------------------------------------------------------
@app.get("/candles/{ticker}")
async def get_candles(ticker: str, period: str = "1d", interval: str = "5m"):
    ticker = ticker.replace("%20", " ").strip()
    key    = f"{ticker.upper()}_{period}_{interval}"
    now    = time.time()

    if key in _candle_cache and now < _candle_cache[key][1]:
        return _candle_cache[key][0]

    sym           = normalise(ticker)
    candles: List[Dict] = []
    interval_used = interval
    market_closed = False

    print(f"[Candles] {sym} — trying intraday {period}/{interval}...")
    try:
        # ── Step 1: intraday ──────────────────────────────────────────────
        candles = _yahoo_v8(sym, range_=period, interval=interval)

        if not candles:
            # ── Step 2: daily fallback (market closed) ────────────────────
            print(f"[Candles] {sym} intraday empty → trying 1mo daily...")
            candles = _yahoo_v8(sym, range_="1mo", interval="1d")
            interval_used = "1d"
            market_closed = True

        if not candles:
            # ── Step 3: yfinance fallback ─────────────────────────────────
            print(f"[Candles] {sym} v8 failed → yfinance fallback...")
            candles = _yf_history(sym, period=period, interval=interval)
            if not candles:
                candles       = _yf_history(sym, period="1mo", interval="1d")
                interval_used = "1d"
                market_closed = True

    except RuntimeError as e:
        # 429 — serve stale cache if available
        print(f"[Candles] 429 for {sym}: {e}")
        if key in _candle_cache:
            return _candle_cache[key][0]
    except Exception as e:
        print(f"[Candles] Unexpected error for {sym}: {e}")

    print(f"[Candles] {sym}: {len(candles)} candles (closed={market_closed})")
    result = {
        "ticker":        ticker,
        "interval":      interval_used,
        "candles":       candles,
        "market_closed": market_closed,
    }
    _candle_cache[key] = (result, now + CANDLE_TTL)
    return result


# ---------------------------------------------------------------------------
# /chart/{ticker}  — legacy area-chart endpoint
# ---------------------------------------------------------------------------
@app.get("/chart/{ticker}")
async def get_chart(ticker: str):
    ticker = ticker.replace("%20", " ").strip()
    key    = f"chart_{ticker.upper()}"
    now    = time.time()
    if key in _candle_cache and now < _candle_cache[key][1]:
        return _candle_cache[key][0]

    sym  = normalise(ticker)
    bars: List[Dict] = []

    # Try intraday first, then daily
    candles = _yahoo_v8(sym, range_="1d", interval="5m")
    if not candles:
        candles = _yahoo_v8(sym, range_="1mo", interval="1d")

    if candles:
        is_intraday = (candles[-1]["time"] - candles[0]["time"]) < 86400 * 2
        for c in candles:
            ts_dt = datetime.fromtimestamp(c["time"])
            t_str = ts_dt.strftime("%H:%M") if is_intraday else ts_dt.strftime("%m/%d")
            bars.append({
                "time":   t_str,
                "price":  c["close"],
                "volume": c.get("volume", 0),
                "open":   c["open"],
                "close":  c["close"],
                "high":   c["high"],
                "low":    c["low"],
            })

    result = {"data": bars}
    _candle_cache[key] = (result, now + CANDLE_TTL)
    return result


# ---------------------------------------------------------------------------
# /backtest
# ---------------------------------------------------------------------------
@app.post("/backtest", response_model=BacktestResponse)
async def run_backtest(request: BacktestRequest):
    sym = normalise(request.ticker)

    # Fetch 2 years of daily data
    bars = _yahoo_v8(sym, range_="2y", interval="1d")
    if not bars:
        bars = _yf_history(sym, period="2y", interval="1d")

    if bars:
        df = pd.DataFrame(bars)
        df["date"]   = pd.to_datetime(df["time"], unit="s")
        df = df.rename(columns={"open":"open","high":"high","low":"low","close":"close","volume":"volume"})
        df = df[["date","open","high","low","close","volume"]]
    else:
        df = _gen_mock_history(request.ticker)

    if not openai_client:
        raise HTTPException(500, "OpenAI API key not configured.")

    strategy_prompt = f"""Generate a Python trading strategy function based on this description:
{request.prompt}

Requirements:
1. Function named 'strategy' accepting a pandas DataFrame 'data'
2. Columns: date, open, high, low, close, volume
3. Add 'signal' column: 1=buy, -1=sell, 0=hold
4. Add 'position' column: 1=long, -1=short, 0=none
5. Add 'equity' column: cumulative equity starting from 100000
6. Use only pandas and numpy
7. Return modified DataFrame
8. Output only executable Python code, no markdown
"""
    try:
        resp = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a Python trading strategy expert."},
                {"role": "user",   "content": strategy_prompt},
            ],
            temperature=0.3,
        )
        code = resp.choices[0].message.content.strip()
        for prefix in ("```python", "```"):
            if code.startswith(prefix):
                code = code[len(prefix):]
        if code.endswith("```"):
            code = code[:-3]
        code = code.strip()
    except Exception as e:
        err_str = str(e)
        if "quota" in err_str.lower() or "insufficient" in err_str.lower():
            raise HTTPException(500, "OpenAI quota exceeded.")
        raise HTTPException(500, f"OpenAI error: {err_str}")

    try:
        g:   Dict = {"pd": pd, "np": np}
        loc: Dict = {}
        exec(code, g, loc)
        if "strategy" not in loc:
            raise HTTPException(500, "Generated code has no 'strategy' function.")
        result_df = loc["strategy"](df.copy())

        if "equity" not in result_df.columns:
            result_df["returns"]          = result_df["close"].pct_change()
            pos_col                       = result_df.get("position", pd.Series(0, index=result_df.index))
            result_df["strategy_returns"] = pos_col.shift(1) * result_df["returns"]
            result_df["equity"]           = 100_000 * (1 + result_df["strategy_returns"]).cumprod()

        equity      = result_df["equity"].dropna()
        initial     = equity.iloc[0]
        final       = equity.iloc[-1]
        days_n      = (result_df["date"].iloc[-1] - result_df["date"].iloc[0]).days
        years       = days_n / 365.25
        cagr        = ((final / initial) ** (1 / years) - 1) * 100 if years > 0 else 0
        running_max = equity.expanding().max()
        max_dd      = ((equity - running_max) / running_max * 100).min()
        sharpe      = 0.0
        if "strategy_returns" in result_df.columns:
            ret    = result_df["strategy_returns"].dropna()
            sharpe = (ret.mean() / ret.std()) * np.sqrt(252) if ret.std() > 0 else 0.0

        chart_data = [
            {"time": str(r["date"])[:10], "value": float(r["equity"])}
            for _, r in result_df.iterrows()
        ]
        return BacktestResponse(
            metrics={"cagr": round(cagr, 2), "drawdown": round(max_dd, 2), "sharpe": round(sharpe, 2)},
            chart_data=chart_data,
            generated_code=code,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Strategy execution error: {e}")


def _gen_mock_history(ticker: str) -> pd.DataFrame:
    rng   = random.Random(abs(hash(ticker)) % (2**31))
    price = rng.uniform(200, 5000)
    dates = pd.bdate_range(end=datetime.today(), periods=504)
    rows  = []
    for d in dates:
        chg = rng.gauss(0, price * 0.015)
        o   = price
        c   = price + chg
        h   = max(o, c) * (1 + abs(rng.gauss(0, 0.005)))
        l   = min(o, c) * (1 - abs(rng.gauss(0, 0.005)))
        rows.append({"date": d, "open": o, "high": h, "low": l, "close": c,
                     "volume": int(rng.uniform(1_000_000, 10_000_000))})
        price = c
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# /trade/execute  — paper trade
# ---------------------------------------------------------------------------
@app.post("/trade/execute", response_model=TradeResponse)
async def execute_trade(request: TradeRequest):
    sym   = normalise(request.symbol)
    price = 0.0
    q     = _yahoo_v8_quote(sym)
    if q:
        price = q["price"]
    else:
        bars = _yf_history(sym, period="5d", interval="1d")
        if bars:
            price = bars[-1]["close"]

    slippage   = random.uniform(-0.05, 0.05) / 100
    exec_price = round(price * (1 + slippage), 2) if price > 0 else 0.0
    order_id   = f"TK{int(time.time() * 1000) % 10_000_000}"

    return TradeResponse(
        status="filled",
        order_id=order_id,
        symbol=request.symbol.upper(),
        side=request.side.lower(),
        quantity=request.quantity,
        executed_price=exec_price,
        message=(
            f"Order {order_id} filled: {request.side.upper()} "
            f"{request.quantity} {request.symbol.upper()} @ ₹{exec_price}"
        ),
    )


# ---------------------------------------------------------------------------
# Supabase REST helpers  (service_role key — trusted server-side access)
# ---------------------------------------------------------------------------
SUPABASE_URL              = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — paper trading will not persist data.")


# True  = keys set AND last connection succeeded
# False = keys not set OR connection failed (use in-memory only)
_SB_REACHABLE: bool = bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)


def _sb_ok() -> bool:
    return _SB_REACHABLE


def _sb_mark_down(err: Exception) -> None:
    global _SB_REACHABLE
    if _SB_REACHABLE:
        print(f"[Supabase] ⚠  Connection failed — switching to in-memory mode: {err}")
        _SB_REACHABLE = False


def _sb_headers(prefer: str = "") -> Dict[str, str]:
    h: Dict[str, str] = {
        "apikey":        SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type":  "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


def _sb_get(
    table:   str,
    filters: Optional[Dict[str, str]] = None,
    select:  str = "*",
    order:   Optional[str] = None,
    limit:   Optional[int] = None,
) -> List[Dict]:
    if not _sb_ok():
        return []
    params: Dict[str, Any] = {"select": select}
    if filters:
        params.update(filters)
    if order:
        params["order"] = order
    if limit:
        params["limit"] = str(limit)
    try:
        r = _YF_SESSION.get(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=_sb_headers(),
            params=params,
            timeout=10,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        _sb_mark_down(e)
        return []


def _sb_insert(table: str, data: Dict) -> Dict:
    if not _sb_ok():
        return {}
    try:
        r = _YF_SESSION.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=_sb_headers("return=representation"),
            json=data,
            timeout=10,
        )
        r.raise_for_status()
        result = r.json()
        return result[0] if isinstance(result, list) and result else {}
    except Exception as e:
        _sb_mark_down(e)
        return {}


def _sb_update(table: str, data: Dict, match: Dict[str, str]) -> Dict:
    if not _sb_ok():
        return {}
    params = {k: f"eq.{v}" for k, v in match.items()}
    try:
        r = _YF_SESSION.patch(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=_sb_headers("return=representation"),
            params=params,
            json=data,
            timeout=10,
        )
        r.raise_for_status()
        result = r.json()
        return result[0] if isinstance(result, list) and result else {}
    except Exception as e:
        _sb_mark_down(e)
        return {}


def _sb_delete(table: str, match: Dict[str, str]) -> None:
    if not _sb_ok():
        return
    params = {k: f"eq.{v}" for k, v in match.items()}
    try:
        _YF_SESSION.delete(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers=_sb_headers(),
            params=params,
            timeout=10,
        )
    except Exception as e:
        _sb_mark_down(e)


# ---------------------------------------------------------------------------
# Paper Trading — in-memory state  (source of truth; Supabase is persistence)
# ---------------------------------------------------------------------------
_MEM_BALANCE:   Dict[str, float]      = {}   # user_id → cash balance
_MEM_POSITIONS: Dict[str, List[Dict]] = {}   # user_id → open positions
_MEM_LOGS:      Dict[str, List[Dict]] = {}   # user_id → order log
_MEM_DAY_PNL:   Dict[str, float]      = {}   # user_id → today's realized P&L

STARTING_BALANCE = 1_00_000.00               # ₹1,00,000 starting capital


# ── low-level memory helpers ─────────────────────────────────────────────────

def _mem_get_balance(user_id: str) -> float:
    if user_id not in _MEM_BALANCE:
        if _sb_ok():
            rows = _sb_get("paper_accounts", {"user_id": f"eq.{user_id}"})
            if rows:
                _MEM_BALANCE[user_id] = float(rows[0].get("balance", STARTING_BALANCE))
            else:
                _MEM_BALANCE[user_id] = STARTING_BALANCE
                _sb_insert("paper_accounts", {"user_id": user_id, "balance": STARTING_BALANCE})
        else:
            _MEM_BALANCE[user_id] = STARTING_BALANCE
    return _MEM_BALANCE[user_id]


def _mem_set_balance(user_id: str, balance: float) -> None:
    _MEM_BALANCE[user_id] = balance
    if _sb_ok():
        _sb_update("paper_accounts", {"balance": balance}, {"user_id": user_id})


def _mem_get_positions(user_id: str) -> List[Dict]:
    if user_id not in _MEM_POSITIONS:
        if _sb_ok():
            _MEM_POSITIONS[user_id] = _sb_get("paper_positions", {"user_id": f"eq.{user_id}"})
        else:
            _MEM_POSITIONS[user_id] = []
    return _MEM_POSITIONS[user_id]


def _mem_get_logs(user_id: str) -> List[Dict]:
    if user_id not in _MEM_LOGS:
        if _sb_ok():
            _MEM_LOGS[user_id] = _sb_get(
                "paper_orders_log",
                {"user_id": f"eq.{user_id}"},
                order="timestamp.desc",
                limit=200,
            )
        else:
            _MEM_LOGS[user_id] = []
    return _MEM_LOGS[user_id]


def _mem_add_log(user_id: str, entry: Dict) -> None:
    logs = _mem_get_logs(user_id)
    logs.insert(0, entry)
    _MEM_LOGS[user_id] = logs
    if _sb_ok():
        _sb_insert("paper_orders_log", {
            "user_id":     user_id,
            "strategy_id": entry.get("strategy_id"),
            "symbol":      entry["symbol"],
            "action":      entry["action"],
            "quantity":    entry["quantity"],
            "price":       entry["price"],
        })


def _mem_get_day_pnl(user_id: str) -> float:
    """Return today's realized P&L, deriving from log on first access."""
    if user_id not in _MEM_DAY_PNL:
        # Reconstruct from in-memory logs that carry realized_pnl
        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        pnl = sum(
            float(lg.get("realized_pnl", 0.0))
            for lg in _mem_get_logs(user_id)
            if lg.get("timestamp", "").startswith(today_str)
               and lg.get("action") == "sell"
        )
        _MEM_DAY_PNL[user_id] = pnl
    return _MEM_DAY_PNL[user_id]


# ── Pydantic models ───────────────────────────────────────────────────────────

class PaperTradeRequest(BaseModel):
    user_id:     str
    symbol:      str
    quantity:    int
    side:        str                    # "buy" | "sell"
    strategy_id: Optional[str] = None
    price:       Optional[float] = None # if provided, skip live-price fetch


class PaperRestoreRequest(BaseModel):
    user_id:   str
    balance:   float
    positions: List[Dict] = []
    day_pnl:   float = 0.0


# ---------------------------------------------------------------------------
# POST /api/paper-trading/restore
#   Frontend calls this on page-load to re-seed in-memory state from
#   whatever was previously saved in localStorage.
# ---------------------------------------------------------------------------
@app.post("/api/paper-trading/restore")
async def restore_paper_account(req: PaperRestoreRequest):
    if not req.user_id:
        raise HTTPException(400, "user_id required")

    if req.user_id not in _MEM_BALANCE:
        _MEM_BALANCE[req.user_id]   = req.balance
        _MEM_POSITIONS[req.user_id] = req.positions
        _MEM_DAY_PNL[req.user_id]   = req.day_pnl
        print(
            f"[PaperRestore] {req.user_id[:8]}…  "
            f"balance=₹{req.balance:,.2f}  positions={len(req.positions)}  "
            f"day_pnl=₹{req.day_pnl:,.2f}"
        )
    return {"ok": True, "balance": _MEM_BALANCE[req.user_id]}


# ---------------------------------------------------------------------------
# GET /api/paper-trading/account?user_id=
# ---------------------------------------------------------------------------
@app.get("/api/paper-trading/account")
async def get_paper_account(user_id: str):
    if not user_id:
        raise HTTPException(400, "user_id required")

    balance   = _mem_get_balance(user_id)
    positions = _mem_get_positions(user_id)
    day_pnl   = _mem_get_day_pnl(user_id)

    print(
        f"[PaperAccount] {user_id[:8]}…  "
        f"bal=₹{balance:,.2f}  pos={len(positions)}  day_pnl=₹{day_pnl:,.2f}"
    )
    return {
        "balance":        round(balance, 2),
        "day_pnl":        round(day_pnl, 2),
        "open_positions": len(positions),
        "positions":      positions,
    }


# ---------------------------------------------------------------------------
# POST /api/paper-trading/execute  —  Paper Trading Matching Engine
# ---------------------------------------------------------------------------
@app.post("/api/paper-trading/execute")
async def paper_execute(req: PaperTradeRequest):
    # ── Input validation ──────────────────────────────────────────────────────
    if req.quantity <= 0:
        raise HTTPException(400, "Quantity must be greater than 0")
    side = req.side.lower()
    if side not in ("buy", "sell"):
        raise HTTPException(400, "Side must be 'buy' or 'sell'")

    symbol_up = req.symbol.upper()

    # ── 1. Fetch current market price ─────────────────────────────────────────
    if req.price and req.price > 0:
        exec_price = round(float(req.price), 2)
    else:
        sym = normalise(req.symbol)
        q   = _yahoo_v8_quote(sym)
        if q and q.get("price", 0) > 0:
            exec_price = round(float(q["price"]), 2)
        else:
            bars = _yf_history(sym, period="5d", interval="1d")
            if bars:
                exec_price = round(float(bars[-1]["close"]), 2)
            else:
                raise HTTPException(503, f"Cannot fetch live price for {symbol_up}. "
                                         "Provide a manual price or retry later.")

    # Simulate market slippage ±0.05 %
    slippage   = random.uniform(-0.05, 0.05) / 100
    exec_price = round(exec_price * (1 + slippage), 2)

    # ── 2. Fetch account state from in-memory ─────────────────────────────────
    balance        = _mem_get_balance(req.user_id)
    positions      = _mem_get_positions(req.user_id)
    total_value    = round(exec_price * req.quantity, 2)
    order_id       = f"PT{int(time.time() * 1000) % 10_000_000}"
    realized_pnl   = 0.0

    # =========================================================================
    # BUY LOGIC
    # =========================================================================
    if side == "buy":
        # 2a. Insufficient-funds guard
        if balance < total_value:
            raise HTTPException(
                400,
                f"Insufficient funds. "
                f"Need ₹{total_value:,.2f} but available balance is ₹{balance:,.2f}.",
            )

        # 2b. Deduct cost from balance
        new_balance = round(balance - total_value, 2)
        _mem_set_balance(req.user_id, new_balance)

        # 2c. Upsert position (weighted-average cost)
        existing = [p for p in positions if p.get("symbol") == symbol_up]
        if existing:
            pos     = existing[0]
            ex_qty  = int(pos["quantity"])
            ex_avg  = float(pos["average_price"])
            new_qty = ex_qty + req.quantity
            new_avg = round((ex_qty * ex_avg + req.quantity * exec_price) / new_qty, 2)
            pos["quantity"]      = new_qty
            pos["average_price"] = new_avg
            pos["side"]          = "buy"
            if _sb_ok() and pos.get("id"):
                _sb_update(
                    "paper_positions",
                    {"quantity": new_qty, "average_price": new_avg},
                    {"id": pos["id"]},
                )
        else:
            new_pos: Dict[str, Any] = {
                "id":            f"local_{int(time.time() * 1000)}",
                "user_id":       req.user_id,
                "symbol":        symbol_up,
                "quantity":      req.quantity,
                "average_price": exec_price,
                "side":          "buy",
                "created_at":    datetime.utcnow().isoformat() + "Z",
            }
            if _sb_ok():
                inserted = _sb_insert("paper_positions", {
                    "user_id":       req.user_id,
                    "symbol":        symbol_up,
                    "quantity":      req.quantity,
                    "average_price": exec_price,
                    "side":          "buy",
                })
                if inserted.get("id"):
                    new_pos["id"] = inserted["id"]
            positions.append(new_pos)

        slip_amt = abs(slippage * exec_price * req.quantity)
        msg = (
            f"Order {order_id}: BUY {req.quantity} {symbol_up} "
            f"@ ₹{exec_price:,.2f}  (cost ₹{total_value:,.2f}  slip ₹{slip_amt:.2f})"
        )

    # =========================================================================
    # SELL LOGIC
    # =========================================================================
    else:
        # 3a. Fetch the position for this symbol
        existing = [p for p in positions if p.get("symbol") == symbol_up]
        if not existing:
            raise HTTPException(
                400,
                f"No open position found for {symbol_up}. "
                "You must hold the stock before selling.",
            )

        pos     = existing[0]
        ex_qty  = int(pos["quantity"])
        avg_buy = float(pos["average_price"])

        # 3b. Insufficient-position guard
        if ex_qty < req.quantity:
            raise HTTPException(
                400,
                f"Insufficient position. "
                f"You hold {ex_qty} {symbol_up} but tried to sell {req.quantity}.",
            )

        # 3c. Realized P&L  =  (sell_price − avg_buy_price) × qty
        realized_pnl = round((exec_price - avg_buy) * req.quantity, 2)

        # 3d. Credit proceeds to balance
        new_balance = round(balance + total_value, 2)
        _mem_set_balance(req.user_id, new_balance)

        # 3e. Accumulate today's realized P&L
        _MEM_DAY_PNL[req.user_id] = round(
            _mem_get_day_pnl(req.user_id) + realized_pnl, 2
        )

        # 3f. Update or delete the position row
        net_qty = ex_qty - req.quantity
        if net_qty > 0:
            pos["quantity"] = net_qty
            if _sb_ok() and pos.get("id"):
                _sb_update("paper_positions", {"quantity": net_qty}, {"id": pos["id"]})
        else:
            positions.remove(pos)
            if _sb_ok() and pos.get("id"):
                _sb_delete("paper_positions", {"id": pos["id"]})

        pnl_sign = "+" if realized_pnl >= 0 else ""
        slip_amt = abs(slippage * exec_price * req.quantity)
        msg = (
            f"Order {order_id}: SELL {req.quantity} {symbol_up} "
            f"@ ₹{exec_price:,.2f}  | Realized P&L {pnl_sign}₹{realized_pnl:,.2f}  "
            f"(slip ₹{slip_amt:.2f})"
        )

    # ── 4. Commit updated positions list to memory ────────────────────────────
    _MEM_POSITIONS[req.user_id] = positions

    # ── 5. Append to order log (in-memory + Supabase) ─────────────────────────
    ts_str: str = datetime.utcnow().isoformat() + "Z"
    log_entry: Dict[str, Any] = {
        "user_id":       req.user_id,
        "strategy_id":   req.strategy_id,
        "symbol":        symbol_up,
        "action":        side,
        "quantity":      req.quantity,
        "price":         exec_price,
        "realized_pnl":  realized_pnl,   # stored in-memory; used for day_pnl rebuild
        "timestamp":     ts_str,
    }
    _mem_add_log(req.user_id, log_entry)

    print(
        f"[PaperEngine] {msg}  |  "
        f"balance ₹{balance:,.2f} → ₹{new_balance:,.2f}  "
        f"day_pnl=₹{_MEM_DAY_PNL.get(req.user_id, 0):,.2f}"
    )

    return {
        "order_id":       order_id,
        "symbol":         symbol_up,
        "side":           side,
        "quantity":       req.quantity,
        "executed_price": exec_price,
        "total_value":    total_value,
        "realized_pnl":   realized_pnl,
        "new_balance":    new_balance,
        "new_day_pnl":    round(_MEM_DAY_PNL.get(req.user_id, 0.0), 2),
        "message":        msg,
    }


# ---------------------------------------------------------------------------
# GET /api/paper-trading/logs?user_id=&limit=
# ---------------------------------------------------------------------------
@app.get("/api/paper-trading/logs")
async def get_paper_logs(user_id: str, limit: int = 50):
    if not user_id:
        raise HTTPException(400, "user_id required")
    return _mem_get_logs(user_id)[:limit]


# ---------------------------------------------------------------------------
# Ctrl+C handler
# ---------------------------------------------------------------------------
def _shutdown(*_):
    print("\nShutting down...")
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, _shutdown)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _shutdown)

    import uvicorn
    print("Starting Tradeky Backend on http://127.0.0.1:8000")
    print("Press Ctrl+C to stop.\n")
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
