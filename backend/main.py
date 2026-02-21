"""
Tradeky Backend — FastAPI server

Data fetching strategy (most reliable → least):
  1. Yahoo Finance v8 chart API (direct HTTP, no auth needed, fast)
  2. yf.Ticker.history()  as fallback
  3. Return empty / zeros — never synthetic mock data for quotes/candles
"""

import asyncio
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
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
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
    Get current/last price via v8 API.
    Tries multiple range/interval combos so symbols that return 404 on the
    standard 5d/1d path (e.g. TATAMOTORS.NS) still get a price from the
    1d/5m or 5d/5m intraday data — the same data the chart already fetches.
    Returns {"price": float, "change_percent": float} or None.
    """
    _COMBOS = [
        ("5d", "1d"),   # preferred: daily close
        ("1d", "5m"),   # intraday fallback (always works when chart works)
        ("5d", "5m"),   # wider intraday window
    ]
    for range_, interval in _COMBOS:
        bars = _yahoo_v8(symbol, range_=range_, interval=interval)
        if bars:
            cur  = bars[-1]["close"]
            prev = bars[-2]["close"] if len(bars) >= 2 else cur
            chg  = ((cur - prev) / prev * 100) if prev else 0.0
            return {"price": round(cur, 2), "change_percent": round(chg, 2)}

    # All Yahoo v8 combos failed — last resort: yfinance
    yf_bars = _yf_history(symbol, period="5d", interval="1d")
    if yf_bars:
        cur  = yf_bars[-1]["close"]
        prev = yf_bars[-2]["close"] if len(yf_bars) >= 2 else cur
        chg  = ((cur - prev) / prev * 100) if prev else 0.0
        return {"price": round(cur, 2), "change_percent": round(chg, 2)}

    return None


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

    # ── Sandboxed execution — uses module-level _SAFE_BUILTINS ────────────────
    try:
        g: Dict[str, Any] = {
            "__builtins__": _SAFE_BUILTINS,
            "pd":           pd,
            "np":           np,
        }
        loc: Dict[str, Any] = {}

        try:
            exec(code, g, loc)                                           # noqa: S102
        except NameError as exc:
            blocked = str(exc)
            print(f"[Backtest][SANDBOX] NameError blocked: {blocked}")
            raise HTTPException(
                400,
                f"Malicious or unsupported code detected (blocked built-in): {blocked}",
            )
        except TypeError as exc:
            blocked = str(exc)
            print(f"[Backtest][SANDBOX] TypeError blocked: {blocked}")
            raise HTTPException(
                400,
                f"Malicious or unsupported code detected (type error): {blocked}",
            )
        except ImportError as exc:
            print(f"[Backtest][SANDBOX] ImportError blocked: {exc}")
            raise HTTPException(400, "Malicious or unsupported code detected (import attempt blocked).")

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
_MEM_PENDING:   Dict[str, List[Dict]] = {}   # user_id → pending limit orders

STARTING_BALANCE = 1_00_000.00               # ₹1,00,000 starting capital

# ---------------------------------------------------------------------------
# Bot Manager  — tracks live background strategy workers
# ---------------------------------------------------------------------------
_RUNNING_BOTS: Dict[str, asyncio.Task] = {}   # bot_id → asyncio Task
_BOT_META:     Dict[str, Dict]         = {}   # bot_id → {user_id, symbol, qty, strategy_id, title, started_at}

# ---------------------------------------------------------------------------
# _SAFE_BUILTINS  — module-level sandbox; shared by /backtest AND bot_worker
# ---------------------------------------------------------------------------
_SAFE_BUILTINS: Dict[str, Any] = {
    "abs": abs, "min": min, "max": max, "sum": sum, "round": round,
    "pow": pow, "divmod": divmod,
    "int": int, "float": float, "bool": bool, "str": str,
    "list": list, "tuple": tuple, "dict": dict, "set": set,
    "frozenset": frozenset,
    "len": len, "range": range, "enumerate": enumerate,
    "zip": zip, "map": map, "filter": filter,
    "sorted": sorted, "reversed": reversed,
    "any": any, "all": all, "next": next, "iter": iter,
    "print": print, "repr": repr,
    "isinstance": isinstance, "issubclass": issubclass,
    "hasattr": hasattr, "getattr": getattr,
    "ValueError": ValueError, "TypeError": TypeError,
    "KeyError": KeyError, "IndexError": IndexError,
    "StopIteration": StopIteration, "Exception": Exception,
    # __import__, open, eval, exec, compile, globals, locals, dir … NOT present
}


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
                limit=1000,
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


# ── Pending-order memory helpers ─────────────────────────────────────────────

def _mem_get_pending(user_id: str) -> List[Dict]:
    if user_id not in _MEM_PENDING:
        if _sb_ok():
            rows = _sb_get(
                "paper_pending_orders",
                {"user_id": f"eq.{user_id}", "status": "eq.pending"},
                order="created_at.desc",
            )
            _MEM_PENDING[user_id] = rows
        else:
            _MEM_PENDING[user_id] = []
    return _MEM_PENDING[user_id]


def _mem_add_pending(user_id: str, order: Dict) -> None:
    orders = _mem_get_pending(user_id)
    orders.insert(0, order)
    _MEM_PENDING[user_id] = orders
    if _sb_ok():
        _sb_insert("paper_pending_orders", {
            "user_id":     user_id,
            "symbol":      order["symbol"],
            "quantity":    order["quantity"],
            "side":        order["side"],
            "limit_price": order["limit_price"],
            "status":      "pending",
        })


def _mem_cancel_pending(user_id: str, order_id: str) -> bool:
    """Remove pending order from memory and Supabase. Returns True if found."""
    orders = _mem_get_pending(user_id)
    before = len(orders)
    _MEM_PENDING[user_id] = [o for o in orders if o.get("id") != order_id]
    if _sb_ok():
        _sb_update("paper_pending_orders", {"status": "cancelled"}, {"id": order_id})
    return len(_MEM_PENDING[user_id]) < before


# ── Pydantic models ───────────────────────────────────────────────────────────

class PaperTradeRequest(BaseModel):
    user_id:     str
    symbol:      str
    quantity:    int
    side:        str                       # "buy" | "sell"
    strategy_id: Optional[str]  = None
    price:       Optional[float] = None   # manual price override (market orders)
    order_type:  str             = "market"  # "market" | "limit"
    limit_price: Optional[float] = None   # required when order_type == "limit"


class CancelOrderRequest(BaseModel):
    user_id:  str
    order_id: str


class SquareOffRequest(BaseModel):
    user_id: str


class PaperRestoreRequest(BaseModel):
    user_id:   str
    balance:   float
    positions: List[Dict] = []
    day_pnl:   float = 0.0


class DeployBotRequest(BaseModel):
    user_id:     str
    strategy_id: str
    symbol:      str
    quantity:    int
    title:       str = ""   # display name, passed from frontend


# ---------------------------------------------------------------------------
# POST /api/paper-trading/restore
#   Frontend calls this on page-load to re-seed in-memory state from
#   whatever was previously saved in localStorage.
# ---------------------------------------------------------------------------
@app.post("/api/paper-trading/restore")
async def restore_paper_account(req: PaperRestoreRequest):
    if not req.user_id:
        raise HTTPException(400, "user_id required")

    # Always restore positions from the frontend's localStorage — this is the
    # source of truth after a backend restart. The old guard
    # `if user_id not in _MEM_BALANCE` was causing positions to be silently
    # skipped whenever the account-fetch endpoint had already initialised the
    # balance dict entry before /restore was called.
    _MEM_POSITIONS[req.user_id] = req.positions
    _MEM_DAY_PNL[req.user_id]   = req.day_pnl

    # Only overwrite balance if it hasn't been set yet (or if frontend value
    # is non-default, meaning the user has a real paper balance)
    if req.user_id not in _MEM_BALANCE or req.balance != STARTING_BALANCE:
        _MEM_BALANCE[req.user_id] = req.balance

    print(
        f"[PaperRestore] {req.user_id[:8]}…  "
        f"balance=₹{_MEM_BALANCE[req.user_id]:,.2f}  "
        f"positions={len(req.positions)}  day_pnl=₹{req.day_pnl:,.2f}"
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
# _execute_market_order  — shared logic for endpoint AND bot_worker
# ---------------------------------------------------------------------------
async def _execute_market_order(
    user_id:     str,
    symbol:      str,
    quantity:    int,
    side:        str,           # "buy" | "sell"
    strategy_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Executes a paper market order entirely in-memory (+ optional Supabase sync).
    Returns the same dict shape as the /execute endpoint.
    Raises HTTPException on hard errors (insufficient funds / no position).
    """
    symbol_up = symbol.strip().upper()
    side      = side.lower()
    if side not in ("buy", "sell"):
        raise HTTPException(400, "side must be 'buy' or 'sell'")

    # ── 1. Fetch live price ──────────────────────────────────────────────────
    sym = normalise(symbol_up)
    q   = await asyncio.to_thread(_yahoo_v8_quote, sym)
    exec_price: float = 0.0
    if q and q.get("price", 0) > 0:
        exec_price = round(float(q["price"]), 2)
    else:
        bars = await asyncio.to_thread(_yf_history, sym, "5d", "1d")
        if bars:
            exec_price = round(float(bars[-1]["close"]), 2)

    if exec_price <= 0:
        raise HTTPException(503, f"Cannot fetch live price for {symbol_up}. Retry later.")

    # Simulate market slippage ±0.05 %
    slippage   = random.uniform(-0.05, 0.05) / 100
    exec_price = round(exec_price * (1 + slippage), 2)

    balance      = _mem_get_balance(user_id)
    positions    = _mem_get_positions(user_id)
    total_value  = round(exec_price * quantity, 2)
    order_id     = f"BOT{int(time.time() * 1000) % 10_000_000}"
    realized_pnl = 0.0
    new_balance  = balance

    if side == "buy":
        if balance < total_value:
            raise HTTPException(
                400,
                f"Bot insufficient funds. Need ₹{total_value:,.2f}, have ₹{balance:,.2f}.",
            )
        new_balance = round(balance - total_value, 2)
        _mem_set_balance(user_id, new_balance)

        existing = [p for p in positions if p.get("symbol") == symbol_up]
        if existing:
            pos     = existing[0]
            ex_qty  = int(pos["quantity"])
            ex_avg  = float(pos["average_price"])
            new_qty = ex_qty + quantity
            new_avg = round((ex_qty * ex_avg + quantity * exec_price) / new_qty, 2)
            pos["quantity"]      = new_qty
            pos["average_price"] = new_avg
            pos["side"]          = "buy"
            if _sb_ok() and pos.get("id"):
                _sb_update("paper_positions",
                           {"quantity": new_qty, "average_price": new_avg},
                           {"id": pos["id"]})
        else:
            new_pos: Dict[str, Any] = {
                "id":            f"local_{int(time.time() * 1000)}",
                "user_id":       user_id,
                "symbol":        symbol_up,
                "quantity":      quantity,
                "average_price": exec_price,
                "side":          "buy",
                "created_at":    datetime.utcnow().isoformat() + "Z",
            }
            if _sb_ok():
                ins = _sb_insert("paper_positions", {
                    "user_id":       user_id,
                    "symbol":        symbol_up,
                    "quantity":      quantity,
                    "average_price": exec_price,
                    "side":          "buy",
                })
                if ins.get("id"):
                    new_pos["id"] = ins["id"]
            positions.append(new_pos)

        msg = (f"Order {order_id}: BOT BUY {quantity} {symbol_up} "
               f"@ ₹{exec_price:,.2f}  (cost ₹{total_value:,.2f})")

    else:  # sell
        existing = [p for p in positions if p.get("symbol") == symbol_up]
        if not existing:
            raise HTTPException(400, f"No open position for {symbol_up}.")

        pos     = existing[0]
        ex_qty  = int(pos["quantity"])
        avg_buy = float(pos["average_price"])
        qty_sell = min(quantity, ex_qty)   # sell whatever we hold

        realized_pnl = round((exec_price - avg_buy) * qty_sell, 2)
        sell_value   = round(exec_price * qty_sell, 2)
        new_balance  = round(balance + sell_value, 2)
        _mem_set_balance(user_id, new_balance)
        _MEM_DAY_PNL[user_id] = round(_mem_get_day_pnl(user_id) + realized_pnl, 2)

        net_qty = ex_qty - qty_sell
        if net_qty > 0:
            pos["quantity"] = net_qty
            if _sb_ok() and pos.get("id"):
                _sb_update("paper_positions", {"quantity": net_qty}, {"id": pos["id"]})
        else:
            positions.remove(pos)
            if _sb_ok() and pos.get("id"):
                _sb_delete("paper_positions", {"id": pos["id"]})

        pnl_sign = "+" if realized_pnl >= 0 else ""
        msg = (f"Order {order_id}: BOT SELL {qty_sell} {symbol_up} "
               f"@ ₹{exec_price:,.2f}  | P&L {pnl_sign}₹{realized_pnl:,.2f}")

    _MEM_POSITIONS[user_id] = positions

    ts_str = datetime.utcnow().isoformat() + "Z"
    _mem_add_log(user_id, {
        "user_id":      user_id,
        "strategy_id":  strategy_id,
        "symbol":       symbol_up,
        "action":       side,
        "quantity":     quantity,
        "price":        exec_price,
        "realized_pnl": realized_pnl,
        "timestamp":    ts_str,
        "order_type":   "market",
        "status":       "filled",
    })

    print(f"[BotEngine] {msg}  |  balance ₹{balance:,.2f} → ₹{new_balance:,.2f}")

    return {
        "order_id":       order_id,
        "symbol":         symbol_up,
        "side":           side,
        "quantity":       quantity,
        "executed_price": exec_price,
        "total_value":    total_value,
        "realized_pnl":   realized_pnl,
        "new_balance":    new_balance,
        "new_day_pnl":    round(_MEM_DAY_PNL.get(user_id, 0.0), 2),
        "message":        msg,
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
    order_type = (req.order_type or "market").lower()
    if order_type not in ("market", "limit"):
        raise HTTPException(400, "order_type must be 'market' or 'limit'")

    # ── LIMIT ORDER — queue it, do NOT touch balance/positions yet ────────────
    if order_type == "limit":
        if not req.limit_price or req.limit_price <= 0:
            raise HTTPException(400, "limit_price is required and must be > 0 for limit orders")
        symbol_up = req.symbol.upper()
        order_id  = f"LO{int(time.time() * 1000) % 10_000_000}"
        ts_str    = datetime.utcnow().isoformat() + "Z"
        pending: Dict[str, Any] = {
            "id":          order_id,
            "user_id":     req.user_id,
            "symbol":      symbol_up,
            "quantity":    req.quantity,
            "side":        side,
            "limit_price": round(float(req.limit_price), 2),
            "status":      "pending",
            "created_at":  ts_str,
        }
        _mem_add_pending(req.user_id, pending)
        msg = (
            f"Limit order {order_id} queued: {side.upper()} {req.quantity} {symbol_up} "
            f"@ ₹{pending['limit_price']:,.2f}"
        )
        print(f"[LimitOrder] {msg}")
        # Log the queued order
        _mem_add_log(req.user_id, {
            "user_id":      req.user_id,
            "strategy_id":  req.strategy_id,
            "symbol":       symbol_up,
            "action":       side,
            "quantity":     req.quantity,
            "price":        pending["limit_price"],
            "realized_pnl": 0.0,
            "timestamp":    ts_str,
            "order_type":   "limit",
            "status":       "pending",
        })
        return {
            "order_id":    order_id,
            "order_type":  "limit",
            "status":      "pending",
            "symbol":      symbol_up,
            "side":        side,
            "quantity":    req.quantity,
            "limit_price": pending["limit_price"],
            "message":     msg,
        }

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

        # If not found in memory, try a fresh load from Supabase (handles backend restarts)
        if not existing and _sb_ok():
            fresh = _sb_get("paper_positions", {"user_id": f"eq.{user_id}"})
            if fresh:
                _MEM_POSITIONS[user_id] = fresh
                positions = fresh
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
async def get_paper_logs(user_id: str, limit: int = 500):
    if not user_id:
        raise HTTPException(400, "user_id required")
    return _mem_get_logs(user_id)[:limit]


# ---------------------------------------------------------------------------
# GET /api/paper-trading/pending-orders?user_id=
# ---------------------------------------------------------------------------
@app.get("/api/paper-trading/pending-orders")
async def get_pending_orders(user_id: str):
    if not user_id:
        raise HTTPException(400, "user_id required")
    return _mem_get_pending(user_id)


# ---------------------------------------------------------------------------
# POST /api/paper-trading/cancel-order
# ---------------------------------------------------------------------------
@app.post("/api/paper-trading/cancel-order")
async def cancel_order(req: CancelOrderRequest):
    if not req.user_id or not req.order_id:
        raise HTTPException(400, "user_id and order_id required")
    found = _mem_cancel_pending(req.user_id, req.order_id)
    if not found:
        raise HTTPException(404, f"Pending order {req.order_id} not found")
    print(f"[CancelOrder] {req.order_id} cancelled for {req.user_id[:8]}…")
    return {"ok": True, "order_id": req.order_id, "status": "cancelled"}


# ---------------------------------------------------------------------------
# POST /api/paper-trading/square-off-all
#   Closes every open position at current market price.
#   Calculates realized P&L per position, credits proceeds to balance.
# ---------------------------------------------------------------------------
@app.post("/api/paper-trading/square-off-all")
async def square_off_all(req: SquareOffRequest):
    if not req.user_id:
        raise HTTPException(400, "user_id required")

    positions = _mem_get_positions(req.user_id)
    if not positions:
        return {"ok": True, "message": "No open positions to square off.", "total_pnl": 0.0}

    balance      = _mem_get_balance(req.user_id)
    total_pnl    = 0.0
    closed       = []
    ts_str       = datetime.utcnow().isoformat() + "Z"

    for pos in list(positions):          # iterate a snapshot
        symbol_up = pos.get("symbol", "")
        qty       = int(pos.get("quantity", 0))
        avg_buy   = float(pos.get("average_price", 0))
        pos_side  = pos.get("side", "buy")

        # ── fetch current market price ────────────────────────────────────
        exec_price: float = avg_buy   # fallback: close at cost (zero P&L)
        sym = normalise(symbol_up)
        q   = _yahoo_v8_quote(sym)
        if q and q.get("price", 0) > 0:
            exec_price = round(float(q["price"]), 2)
        else:
            bars = _yf_history(sym, period="5d", interval="1d")
            if bars:
                exec_price = round(float(bars[-1]["close"]), 2)

        # ── P&L and balance update ────────────────────────────────────────
        proceeds     = round(exec_price * qty, 2)
        realized_pnl = round((exec_price - avg_buy) * qty * (1 if pos_side == "buy" else -1), 2)
        balance      = round(balance + proceeds, 2)
        total_pnl    = round(total_pnl + realized_pnl, 2)

        # ── remove from memory + Supabase ────────────────────────────────
        positions = [p for p in positions if p.get("id") != pos.get("id")]
        if _sb_ok() and pos.get("id"):
            _sb_delete("paper_positions", {"id": pos["id"]})

        # ── log each fill ─────────────────────────────────────────────────
        _mem_add_log(req.user_id, {
            "user_id":      req.user_id,
            "symbol":       symbol_up,
            "action":       "sell",
            "quantity":     qty,
            "price":        exec_price,
            "realized_pnl": realized_pnl,
            "timestamp":    ts_str,
            "order_type":   "market",
            "status":       "filled",
        })

        closed.append({
            "symbol":       symbol_up,
            "qty":          qty,
            "exec_price":   exec_price,
            "realized_pnl": realized_pnl,
        })
        print(f"[SquareOff] {symbol_up} {qty} @ ₹{exec_price:,.2f}  pnl=₹{realized_pnl:,.2f}")

    # ── commit memory state ───────────────────────────────────────────────────
    _MEM_POSITIONS[req.user_id] = positions
    _mem_set_balance(req.user_id, balance)
    _MEM_DAY_PNL[req.user_id] = round(
        _mem_get_day_pnl(req.user_id) + total_pnl, 2
    )

    pnl_sign = "+" if total_pnl >= 0 else ""
    msg = f"Square-off complete: {len(closed)} position(s) closed  |  Total P&L {pnl_sign}₹{total_pnl:,.2f}"
    print(f"[SquareOff] {msg}  balance=₹{balance:,.2f}")

    return {
        "ok":         True,
        "closed":     closed,
        "new_balance":round(balance, 2),
        "new_day_pnl":round(_MEM_DAY_PNL[req.user_id], 2),
        "total_pnl":  total_pnl,
        "message":    msg,
    }


# ===========================================================================
# Bot Manager  — background strategy worker + endpoints
# ===========================================================================

async def bot_worker(
    bot_id:        str,
    user_id:       str,
    strategy_code: str,
    symbol:        str,
    quantity:      int,
    strategy_id:   str,
) -> None:
    """
    Runs a strategy in a 60-second polling loop.
    On each tick:
      1. Fetches latest 5-day / 5-minute OHLCV data for the symbol.
      2. Runs strategy_code through the _SAFE_BUILTINS sandbox.
      3. Reads the last row's `signal` column (1 = buy, -1 = sell, 0 = hold).
      4. BUY  if signal == 1  and no existing open position.
      5. SELL if signal == -1 and an open position exists.
    """
    sym_norm = normalise(symbol.upper())
    print(f"[BotWorker] {bot_id} started  symbol={symbol}  qty={quantity}  user={user_id[:8]}…")

    try:
        while True:
            try:
                # ── 1. Fetch OHLCV (run sync IO in thread pool) ──────────────
                bars: List[Dict] = await asyncio.to_thread(
                    _yahoo_v8, sym_norm, "5d", "5m"
                )
                if not bars or len(bars) < 5:
                    print(f"[BotWorker] {bot_id} — not enough data ({len(bars)} bars), skipping tick.")
                    await asyncio.sleep(60)
                    continue

                df = pd.DataFrame(bars)
                # Rename columns to match the strategy template expectations
                df.rename(columns={
                    "open": "open", "high": "high", "low": "low",
                    "close": "close", "volume": "volume",
                }, inplace=True)
                # Ensure a `date` column for strategies that reference it
                if "time" in df.columns:
                    df["date"] = pd.to_datetime(df["time"], unit="s", utc=True)
                df = df.dropna(subset=["close"])

                # ── 2. Execute strategy through sandbox ──────────────────────
                g: Dict[str, Any] = {
                    "__builtins__": _SAFE_BUILTINS,
                    "pd":           pd,
                    "np":           np,
                }
                loc: Dict[str, Any] = {}
                try:
                    exec(strategy_code, g, loc)          # noqa: S102
                except (NameError, TypeError, ImportError) as exc:
                    print(f"[BotWorker] {bot_id} — sandbox violation: {exc}. Bot stopped.")
                    break   # stop this bot permanently

                if "strategy" not in loc:
                    print(f"[BotWorker] {bot_id} — no 'strategy' function in code. Bot stopped.")
                    break

                result_df = loc["strategy"](df.copy())

                # ── 3. Read last signal ───────────────────────────────────────
                if "signal" not in result_df.columns:
                    print(f"[BotWorker] {bot_id} — strategy returned no 'signal' column. Skipping.")
                    await asyncio.sleep(60)
                    continue

                last_signal = int(result_df["signal"].iloc[-1])
                positions   = _mem_get_positions(user_id)
                has_pos     = any(p.get("symbol") == symbol.upper() for p in positions)

                print(
                    f"[BotWorker] {bot_id}  signal={last_signal:+d}  "
                    f"has_pos={has_pos}  {symbol}"
                )

                # ── 4. Buy signal + no current position ───────────────────────
                if last_signal == 1 and not has_pos:
                    try:
                        result = await _execute_market_order(
                            user_id, symbol, quantity, "buy", strategy_id
                        )
                        print(f"[BotWorker] {bot_id} — BUY executed: {result['message']}")
                        if bot_id in _BOT_META:
                            _BOT_META[bot_id]["last_action"] = "buy"
                            _BOT_META[bot_id]["last_price"]  = result["executed_price"]
                    except HTTPException as exc:
                        print(f"[BotWorker] {bot_id} — BUY failed: {exc.detail}")

                # ── 5. Sell signal + open position exists ─────────────────────
                elif last_signal == -1 and has_pos:
                    pos_qty = next(
                        (p["quantity"] for p in positions if p.get("symbol") == symbol.upper()),
                        quantity
                    )
                    try:
                        result = await _execute_market_order(
                            user_id, symbol, int(pos_qty), "sell", strategy_id
                        )
                        print(f"[BotWorker] {bot_id} — SELL executed: {result['message']}")
                        if bot_id in _BOT_META:
                            _BOT_META[bot_id]["last_action"] = "sell"
                            _BOT_META[bot_id]["last_price"]  = result["executed_price"]
                    except HTTPException as exc:
                        print(f"[BotWorker] {bot_id} — SELL failed: {exc.detail}")

            except asyncio.CancelledError:
                raise   # let the outer except handle graceful shutdown

            except Exception as exc:
                # Log unexpected errors but keep the loop alive
                print(f"[BotWorker] {bot_id} — unexpected error: {exc}")

            await asyncio.sleep(60)   # wait 1 minute before next tick

    except asyncio.CancelledError:
        print(f"[BotWorker] {bot_id} — cancelled gracefully.")
    finally:
        # Remove from registry when done
        _RUNNING_BOTS.pop(bot_id, None)
        _BOT_META.pop(bot_id, None)
        print(f"[BotWorker] {bot_id} — exited.")


# ---------------------------------------------------------------------------
# POST /api/paper-trading/deploy-bot
# ---------------------------------------------------------------------------
@app.post("/api/paper-trading/deploy-bot")
async def deploy_bot(req: DeployBotRequest):
    if not req.user_id or not req.strategy_id:
        raise HTTPException(400, "user_id and strategy_id are required")
    if req.quantity < 1:
        raise HTTPException(400, "quantity must be >= 1")

    # ── 1. Fetch strategy code from Supabase ──────────────────────────────────
    strategy_code = ""
    strategy_title = req.title or req.strategy_id

    if _sb_ok():
        rows = _sb_get("strategies", {"id": f"eq.{req.strategy_id}"})
        if not rows:
            raise HTTPException(404, f"Strategy '{req.strategy_id}' not found in Supabase.")
        row = rows[0]
        strategy_code  = row.get("logic_text", "") or ""
        strategy_title = row.get("title", req.title or req.strategy_id)
    else:
        # Supabase unreachable — frontend must have passed the code; not supported
        raise HTTPException(503, "Supabase is unreachable. Cannot fetch strategy code.")

    if not strategy_code.strip():
        raise HTTPException(400, "Strategy has no executable code (logic_text is empty).")

    # ── 2. Generate a unique bot_id ───────────────────────────────────────────
    bot_id = f"bot_{req.user_id[:8]}_{req.strategy_id[:8]}_{int(time.time())}"

    # Stop any existing bot for the same user + strategy + symbol
    old_id = next(
        (bid for bid, meta in _BOT_META.items()
         if meta["user_id"] == req.user_id
         and meta["strategy_id"] == req.strategy_id
         and meta["symbol"] == req.symbol.upper()),
        None,
    )
    if old_id and old_id in _RUNNING_BOTS:
        _RUNNING_BOTS[old_id].cancel()
        print(f"[DeployBot] Replaced existing bot {old_id}")

    # ── 3. Store metadata ─────────────────────────────────────────────────────
    _BOT_META[bot_id] = {
        "user_id":     req.user_id,
        "strategy_id": req.strategy_id,
        "symbol":      req.symbol.upper(),
        "quantity":    req.quantity,
        "title":       strategy_title,
        "started_at":  datetime.utcnow().isoformat() + "Z",
        "last_action": None,
        "last_price":  None,
    }

    # ── 4. Launch background task ─────────────────────────────────────────────
    task = asyncio.create_task(
        bot_worker(bot_id, req.user_id, strategy_code, req.symbol, req.quantity, req.strategy_id)
    )
    _RUNNING_BOTS[bot_id] = task

    print(
        f"[DeployBot] {bot_id} launched  "
        f"strategy='{strategy_title}'  symbol={req.symbol}  qty={req.quantity}  "
        f"user={req.user_id[:8]}…"
    )

    return {
        "ok":      True,
        "bot_id":  bot_id,
        "title":   strategy_title,
        "symbol":  req.symbol.upper(),
        "quantity": req.quantity,
        "message": f"Bot '{strategy_title}' deployed on {req.symbol.upper()} (qty {req.quantity}). Checking every 60 s.",
    }


# ---------------------------------------------------------------------------
# POST /api/paper-trading/stop-bot   — stop a single bot by bot_id
# ---------------------------------------------------------------------------
class StopBotRequest(BaseModel):
    bot_id: str


@app.post("/api/paper-trading/stop-bot")
async def stop_bot(req: StopBotRequest):
    task = _RUNNING_BOTS.get(req.bot_id)
    if not task:
        raise HTTPException(404, f"Bot '{req.bot_id}' not found or already stopped.")
    task.cancel()
    _RUNNING_BOTS.pop(req.bot_id, None)
    _BOT_META.pop(req.bot_id, None)
    print(f"[StopBot] {req.bot_id} cancelled by user request.")
    return {"ok": True, "bot_id": req.bot_id, "message": "Bot stopped."}


# ---------------------------------------------------------------------------
# POST /api/paper-trading/stop-all-bots
# ---------------------------------------------------------------------------
@app.post("/api/paper-trading/stop-all-bots")
async def stop_all_bots():
    count = len(_RUNNING_BOTS)
    for bot_id, task in list(_RUNNING_BOTS.items()):
        task.cancel()
        print(f"[StopAllBots] Cancelled {bot_id}")
    _RUNNING_BOTS.clear()
    _BOT_META.clear()
    return {"ok": True, "stopped": count, "message": f"{count} bot(s) stopped."}


# ---------------------------------------------------------------------------
# GET /api/paper-trading/running-bots   — frontend polls this for live status
# ---------------------------------------------------------------------------
@app.get("/api/paper-trading/running-bots")
async def get_running_bots(user_id: str):
    bots = [
        {**meta, "bot_id": bid, "running": not _RUNNING_BOTS[bid].done()}
        for bid, meta in _BOT_META.items()
        if meta.get("user_id") == user_id and bid in _RUNNING_BOTS
    ]
    return bots


# ===========================================================================
# Community WebSocket Manager
# ===========================================================================

class ConnectionManager:
    """
    Manages all active WebSocket connections for the community chat.
    Thread-safe for asyncio; one shared instance handles all channels.
    """

    def __init__(self) -> None:
        # Maps connection → channel name so we can do per-channel broadcasts
        self._connections: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, channel: str = "general") -> None:
        await websocket.accept()
        self._connections[websocket] = channel
        print(f"[WS] Client connected  channel={channel}  total={len(self._connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        channel = self._connections.pop(websocket, "?")
        print(f"[WS] Client disconnected  channel={channel}  total={len(self._connections)}")

    async def broadcast(self, message: str, channel: str = "general") -> None:
        """Send message to every client subscribed to the same channel."""
        dead: List[WebSocket] = []
        for ws, ch in list(self._connections.items()):
            if ch != channel:
                continue
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def broadcast_all(self, message: str) -> None:
        """Broadcast to every connected client regardless of channel."""
        dead: List[WebSocket] = []
        for ws in list(self._connections.keys()):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


@app.websocket("/ws/community")
async def community_websocket(websocket: WebSocket, channel: str = "general"):
    """
    Persistent WebSocket connection for community chat.

    Query param:  ?channel=general  |  ?channel=expert
    Message flow: client sends JSON → server broadcasts to all
                  clients on the same channel → instant delivery.
    """
    await manager.connect(websocket, channel)
    try:
        while True:
            raw = await websocket.receive_text()
            # Validate it's parseable JSON before echoing
            try:
                import json as _json
                payload = _json.loads(raw)
                # Attach server-side timestamp if missing
                if "timestamp" not in payload:
                    payload["timestamp"] = datetime.utcnow().isoformat() + "Z"
                out = _json.dumps(payload)
            except ValueError:
                # Non-JSON plain text — wrap it
                out = raw
            await manager.broadcast(out, channel)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as exc:
        print(f"[WS] Unexpected error: {exc}")
        manager.disconnect(websocket)


# ===========================================================================
# Greed AI Engine  — lightweight real-time risk health scorer
# ===========================================================================

class GreedAIRequest(BaseModel):
    strategy_title: str
    symbol:         str
    qty:            int
    pnl:            float
    live_price:     float
    side:           str = "buy"   # "buy" | "sell" — position direction


class GreedAIResponse(BaseModel):
    health_score:    int    # 0 – 100
    insight:         str
    status:          str    # "healthy" | "warning" | "critical"
    change_percent:  float  # live day-change % of the symbol (for UI display)


# Insight templates — include market-trend-aware variants
_GREED_INSIGHTS: Dict[str, List[str]] = {
    "healthy": [
        "Strategy is performing within healthy parameters. Momentum looks solid.",
        "Risk-reward ratio is favourable. Position size is well-controlled.",
        "Trend alignment is strong. No immediate adjustments needed.",
        "Equity curve is expanding. Continue monitoring for reversal signals.",
        "Volatility is contained and the market trend supports your position.",
        "Price momentum is with you. Trailing stop recommended to lock profits.",
    ],
    "warning": [
        "Momentum is fading — consider tightening your stop-loss.",
        "P&L drawdown detected. Review position sizing before adding exposure.",
        "Market structure is weakening. Partial profit-taking may reduce risk.",
        "Strategy is in a stressed zone. Avoid adding new entries here.",
        "Adverse price action noted. Keep trailing stops active.",
        "Risk metrics are elevated. Consider reducing qty by 25–50%.",
        "Market is moving against your position. Monitor closely.",
    ],
    "critical": [
        "⚠️ Severe drawdown — emergency stop recommended immediately.",
        "⚠️ Strategy health is critical. Capital preservation is the priority now.",
        "⚠️ Loss threshold breached. Consider full position exit.",
        "⚠️ Greed AI detected extreme risk. Halt new orders and review.",
        "⚠️ P&L deteriorating rapidly. Protect remaining capital.",
        "⚠️ Market is trending strongly against you. Exit now to cut losses.",
    ],
}


@app.post("/api/greed-ai/analyze", response_model=GreedAIResponse)
async def greed_ai_analyze(req: GreedAIRequest):
    """
    Risk health score (0-100) combining P&L, position size, AND live market
    trend so the insight reflects what the market is actually doing right now.

    Scoring layers (clamped to [0, 100]):
      Base                  =  70
      P&L ratio bonus/malus =  pnl / position_value * 100  (capped ±25)
      Outright-loss penalty =  −15  (and extra −20 if loss > 5 % of value)
      Market-trend factor   =  change_pct adjusted for position direction (±15)
      Jitter                =  ±5   (UI feels "alive" on every poll)
    """
    live_price = max(req.live_price, 0.01)
    qty        = max(req.qty, 1)

    # ── 1. Get live day-change % — prefer cache (fast), fall back to network ──
    change_pct: float = 0.0
    try:
        sym_ns = req.symbol if "." in req.symbol else f"{req.symbol}.NS"
        cache_key = f"quote:{sym_ns}"
        now_ts = time.time()
        if cache_key in _quote_cache and now_ts < _quote_cache[cache_key][1]:
            # Use cached value — instant, no network round-trip
            change_pct = _quote_cache[cache_key][0].get("change_percent", 0.0)
        else:
            # Cache miss — fetch but with a short timeout so it doesn't block
            quote = await asyncio.wait_for(
                asyncio.to_thread(_yahoo_v8_quote, req.symbol),
                timeout=3.0
            )
            if quote:
                change_pct = quote.get("change_percent", 0.0)
    except Exception:
        pass   # non-fatal — scoring continues without market trend factor

    # ── 2. Base ──────────────────────────────────────────────────────────────
    score: float = 70.0

    # ── 3. P&L ratio relative to position value ──────────────────────────────
    position_value = live_price * qty
    pnl_ratio      = req.pnl / position_value if position_value > 0 else 0.0
    pnl_bonus      = max(-25.0, min(25.0, pnl_ratio * 100))
    score += pnl_bonus

    # ── 4. Extra penalty for outright losses ──────────────────────────────────
    if req.pnl < 0:
        score -= 15.0
        if req.pnl < -(position_value * 0.05):   # > 5 % loss on position
            score -= 20.0

    # ── 5. Market trend factor — direction-aware ──────────────────────────────
    #   A long position benefits when price rises, hurts when it falls.
    #   A short position benefits when price falls, hurts when it rises.
    direction   = 1 if req.side.lower() == "buy" else -1
    trend_score = direction * change_pct           # e.g. +2 % move on long → +2
    trend_bonus = max(-15.0, min(15.0, trend_score * 2))   # scaled, capped ±15
    score += trend_bonus

    # ── 6. Jitter (±5) so bar "breathes" every poll ──────────────────────────
    score += random.uniform(-5.0, 5.0)

    # ── 7. Clamp ──────────────────────────────────────────────────────────────
    health_score = int(max(0, min(100, round(score))))

    # ── 8. Status + insight ───────────────────────────────────────────────────
    if health_score > 60:
        status = "healthy"
    elif health_score >= 30:
        status = "warning"
    else:
        status = "critical"

    insight = random.choice(_GREED_INSIGHTS[status])

    print(
        f"[GreedAI] {req.strategy_title} | {req.symbol} "
        f"pnl=₹{req.pnl:+.2f}  chg={change_pct:+.2f}%  "
        f"score={health_score}  status={status}"
    )

    return GreedAIResponse(
        health_score=health_score,
        insight=insight,
        status=status,
        change_percent=round(change_pct, 2),
    )


# ---------------------------------------------------------------------------
# User Profile — GET & POST
# ---------------------------------------------------------------------------
import re as _re

_USERNAME_RE = _re.compile(r"^[a-zA-Z0-9_]{3,30}$")


_USERNAME_COOLDOWN_DAYS = 14


class ProfileUpdate(BaseModel):
    user_id:             str
    username:            str
    strategy_alerts:     bool = True
    market_updates:      bool = True
    community_mentions:  bool = True


def _username_taken(username: str, exclude_user_id: str) -> bool:
    """Return True if the username (case-insensitive) is already claimed by another user."""
    rows = _sb_get(
        "profiles",
        filters={"username": f"ilike.{username}"},
        select="user_id",
        limit=5,
    )
    return any(r.get("user_id") != exclude_user_id for r in rows)


def _cooldown_remaining(username_changed_at: Optional[str]) -> Optional[int]:
    """
    Returns number of DAYS remaining in the cooldown, or None if the
    cooldown has expired (or was never set).
    """
    if not username_changed_at:
        return None
    try:
        from datetime import timezone
        changed = datetime.fromisoformat(username_changed_at.replace("Z", "+00:00"))
        elapsed = datetime.now(timezone.utc) - changed
        remaining = _USERNAME_COOLDOWN_DAYS - elapsed.days
        return remaining if remaining > 0 else None
    except Exception:
        return None


@app.get("/api/user/profile")
async def get_user_profile(user_id: str):
    """Return username + notification preferences + cooldown info."""
    if not user_id:
        raise HTTPException(400, "user_id required")
    rows = _sb_get(
        "profiles",
        filters={"user_id": f"eq.{user_id}"},
        select="username,strategy_alerts,market_updates,community_mentions,username_changed_at",
    )
    if rows:
        row = rows[0]
        remaining = _cooldown_remaining(row.get("username_changed_at"))
        return {
            **row,
            "username_cooldown_days": remaining,   # int or null
        }
    return {
        "username":             "",
        "strategy_alerts":      True,
        "market_updates":       True,
        "community_mentions":   True,
        "username_changed_at":  None,
        "username_cooldown_days": None,
    }


@app.get("/api/user/check-username")
async def check_username_endpoint(username: str, user_id: str):
    """
    Real-time availability check.
    Returns { "available": bool, "reason": str }
    """
    username = username.strip()
    if not username:
        return {"available": False, "reason": "Username cannot be empty."}
    if not _USERNAME_RE.match(username):
        return {"available": False,
                "reason": "3–30 chars, letters, numbers and underscores only."}
    if _username_taken(username, exclude_user_id=user_id):
        return {"available": False, "reason": "That username is already taken."}
    return {"available": True, "reason": ""}


@app.post("/api/user/profile")
async def update_user_profile(req: ProfileUpdate):
    """
    Validate-only endpoint — the frontend writes to Supabase directly.
    This route does:
      1. Format check
      2. Uniqueness check
      3. Cooldown check (14-day lock on username changes)
    Returns { "ok": true, "username_changed_at": <iso> } on success,
    or raises HTTP 400/409/423.
    """
    if not req.user_id:
        raise HTTPException(400, "user_id required")

    username = req.username.strip()

    # ── 1. Format ─────────────────────────────────────────────────────────────
    if not username:
        raise HTTPException(400, "Username cannot be empty.")
    if not _USERNAME_RE.match(username):
        raise HTTPException(400,
            "Username must be 3–30 characters: letters, numbers, underscores only.")

    # ── 2. Fetch current profile to check if username is actually changing ────
    rows = _sb_get("profiles",
                   filters={"user_id": f"eq.{req.user_id}"},
                   select="username,username_changed_at")
    current = rows[0] if rows else {}
    current_username = (current.get("username") or "").strip()
    username_is_changing = username.lower() != current_username.lower()

    if username_is_changing:
        # ── 3. Cooldown check ─────────────────────────────────────────────────
        remaining = _cooldown_remaining(current.get("username_changed_at"))
        if remaining is not None:
            raise HTTPException(
                423,   # 423 Locked
                f"Username was changed recently. You can change it again in "
                f"{remaining} day{'s' if remaining != 1 else ''}."
            )
        # ── 4. Uniqueness check ───────────────────────────────────────────────
        if _username_taken(username, exclude_user_id=req.user_id):
            raise HTTPException(409, "That username is already taken. Please choose another.")

    # ── 5. Determine new username_changed_at ──────────────────────────────────
    new_changed_at = (
        datetime.utcnow().isoformat() + "Z" if username_is_changing
        else current.get("username_changed_at")
    )

    # ── 6. Persist via Supabase (backend path — also reliable when token ok) ──
    _sb_update(
        "profiles",
        {
            "username":              username,
            "strategy_alerts":       req.strategy_alerts,
            "market_updates":        req.market_updates,
            "community_mentions":    req.community_mentions,
            "username_changed_at":   new_changed_at if username_is_changing else current.get("username_changed_at"),
            "updated_at":            datetime.utcnow().isoformat() + "Z",
        },
        {"user_id": req.user_id},
    )
    print(f"[Profile] saved for {req.user_id[:8]}… username={username!r} changed={username_is_changing}")
    return {"ok": True, "username_changed_at": new_changed_at}


# ---------------------------------------------------------------------------
# Notifications — GET & mark-read
# ---------------------------------------------------------------------------
class NotificationMarkRead(BaseModel):
    user_id: str


@app.get("/api/notifications")
async def get_notifications(user_id: str):
    """Return the latest 20 notifications for the user, newest first."""
    if not user_id:
        raise HTTPException(400, "user_id required")
    rows = _sb_get(
        "notifications",
        filters={"user_id": f"eq.{user_id}"},
        order="created_at.desc",
        limit=20,
    )
    return rows or []


@app.post("/api/notifications/mark-read")
async def mark_notifications_read(req: NotificationMarkRead):
    """Mark all unread notifications as read for the given user."""
    if not req.user_id:
        raise HTTPException(400, "user_id required")
    _sb_update(
        "notifications",
        {"is_read": True},
        {"user_id": req.user_id, "is_read": "false"},
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Community: Trending Tickers from message mentions
# ---------------------------------------------------------------------------
_DEFAULT_TRENDING = ["$NIFTY", "$BANKNIFTY", "$RELIANCE", "$HDFCBANK", "$TCS"]

@app.get("/api/community/trending-tickers")
async def community_trending_tickers():
    """
    Scan all community_messages from the past 7 days for $TICKER mentions,
    count occurrences, and return the top 5.  Falls back to defaults when
    fewer than 3 unique tickers are found in messages.
    """
    import re as _re
    import json as _json
    from datetime import datetime, timezone, timedelta

    tickers: Dict[str, int] = {}

    try:
        # ISO-8601 cutoff: 7 days ago
        cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

        rows = _sb_get(
            "community_messages",
            params={"created_at": f"gte.{cutoff}", "select": "content"},
        )

        pattern = _re.compile(r"\$([A-Z&\-]{2,20})", _re.IGNORECASE)

        for row in (rows or []):
            content = row.get("content") or ""
            for match in pattern.finditer(content):
                ticker = f"${match.group(1).upper()}"
                tickers[ticker] = tickers.get(ticker, 0) + 1

    except Exception as exc:
        print(f"[trending-tickers] error: {exc}")

    if len(tickers) >= 3:
        # Sort by mention count descending, take top 5
        top = sorted(tickers.items(), key=lambda x: x[1], reverse=True)[:5]
        result = [{"ticker": t, "count": c} for t, c in top]
    else:
        # Not enough organic mentions → use defaults
        result = [{"ticker": t, "count": 0} for t in _DEFAULT_TRENDING]

    return {"tickers": result}


# ---------------------------------------------------------------------------
# Ctrl+C handler
# ---------------------------------------------------------------------------
def _shutdown(*_):
    print("\nShutting down — cancelling all bots...")
    for task in list(_RUNNING_BOTS.values()):
        task.cancel()
    _RUNNING_BOTS.clear()
    _BOT_META.clear()
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, _shutdown)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, _shutdown)

    import uvicorn
    print("Starting Tradeky Backend on http://127.0.0.1:8000")
    print("Press Ctrl+C to stop.\n")
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")
