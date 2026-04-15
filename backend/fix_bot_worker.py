"""
One-shot script: replaces the bot_worker function in main.py with the fully-fixed version.
Run from: backend/
  python fix_bot_worker.py
"""
import pathlib

path = pathlib.Path("main.py")
src  = path.read_text(encoding="utf-8")

# ── Locate the old function boundaries ────────────────────────────────────────
START = "async def bot_worker("
END   = "        print(f\"[BotWorker] {bot_id} \u2014 exited.\")"

si = src.index(START)
ei = src.index(END, si) + len(END)

# ── New implementation ─────────────────────────────────────────────────────────
NEW_FN = r'''async def bot_worker(
    bot_id:        str,
    user_id:       str,
    strategy_code: str,
    symbol:        str,
    quantity:      int,
    strategy_id:   str,
    interval:      str = "5m",
) -> None:
    """
    Paper trading bot -- strictly strategy-driven.

    Every 60 seconds:
      1. Fetch OHLCV at user-selected chart interval.
      2. Execute strategy_code (compiled ONCE per deployment for efficiency).
         Supports:
           strategy(df)  -> pd.DataFrame with signal / position columns
           evaluate(df)  -> str "BUY"/"SELL"/"HOLD"  or  int 1/-1/0
      3. BUY  when signal is bullish AND bot has no open position.
      4. SELL when signal is bearish AND bot has an open position.
      5. Every tick: emit a compact log entry the user can see in the terminal.
      6. Every fill: emit a prominent [BOT ORDER] entry + Supabase notification.
      7. All errors surface in the user order log (not just the server console).
      8. Stops cleanly on task cancellation (user pressed Stop).
    """
    sym_norm  = normalise(symbol.upper())
    bot_label = (_BOT_META.get(bot_id) or {}).get("title", bot_id[:8])
    print(
        f"[BotWorker] {bot_id} started  symbol={symbol}  "
        f"qty={quantity}  interval={interval}  user={user_id[:8]}..."
    )

    # ---- helpers ----------------------------------------------------------------

    def _push_error_log(msg: str) -> None:
        """Surface an error message in the user's live order log."""
        _mem_add_tick_log(user_id, {
            "user_id":      user_id,
            "strategy_id":  strategy_id,
            "symbol":       symbol.upper(),
            "action":       None,
            "quantity":     0,
            "price":        0.0,
            "realized_pnl": 0.0,
            "timestamp":    datetime.utcnow().isoformat() + "Z",
            "order_type":   "bot_error",
            "status":       "error",
            "message":      f"[BOT ERROR] {msg}",
        })

    def _push_notif(title: str, body: str) -> None:
        """Best-effort Supabase in-app notification.  Never crashes the bot."""
        if not _sb_ok():
            return
        try:
            _sb_insert("notifications", {
                "user_id":    user_id,
                "title":      title,
                "message":    body,
                "is_read":    False,
                "created_at": datetime.utcnow().isoformat() + "Z",
            })
        except Exception:
            pass   # notification failure must never crash the bot

    def _interpret(result) -> tuple:
        """
        Normalise any strategy output to (want_buy: bool, want_sell: bool).

        Handles all known patterns:
          - pd.DataFrame  with 'signal' and/or 'position' columns  [AI template]
          - str           "BUY" / "SELL" / "HOLD"
          - int / float   1 / -1 / 0
          - pd.Series     with 'signal' index key
        """
        if isinstance(result, str):
            s = result.strip().upper()
            return s == "BUY", s == "SELL"

        if isinstance(result, (int, float)):
            try:
                v = int(result)
                return v == 1, v == -1
            except (TypeError, ValueError):
                return False, False

        if isinstance(result, pd.DataFrame) and len(result) > 0:
            last = result.iloc[-1]
            sv, pv = 0, 0
            if "signal" in result.columns:
                try:
                    sv = int(last["signal"]) if pd.notna(last["signal"]) else 0
                except (TypeError, ValueError):
                    sv = 0
            if "position" in result.columns:
                try:
                    pv = int(last["position"]) if pd.notna(last["position"]) else 0
                except (TypeError, ValueError):
                    pv = 0
            return (sv == 1 or pv == 1), (sv == -1 or pv == -1)

        if isinstance(result, pd.Series):
            try:
                v = int(result.get("signal", result.iloc[-1]))
                return v == 1, v == -1
            except (TypeError, ValueError, IndexError):
                return False, False

        return False, False

    # ---- interval -> Yahoo Finance range mapping --------------------------------
    _RANGE_MAP: Dict[str, str] = {"1m": "1d", "5m": "1d", "15m": "5d", "1d": "2y"}
    fetch_range    = _RANGE_MAP.get(interval, "1d")
    fetch_interval = interval

    # ---- compile strategy code ONCE (fail-fast before the polling loop) --------
    # Inject ta and pandas_ta so complex strategies have all standard imports.
    strategy_globals: Dict[str, Any] = {
        "__builtins__": builtins,
        "pd":   pd,
        "np":   np,
        "math": math,
    }
    for _alias, _mname in [("ta", "ta"), ("pandas_ta", "pandas_ta")]:
        try:
            import importlib as _il
            strategy_globals[_alias] = _il.import_module(_mname)
        except ImportError:
            pass

    _sloc: Dict[str, Any] = {}
    try:
        exec(strategy_code, strategy_globals, _sloc)  # noqa: S102
    except Exception as exc:
        err = f"Strategy compile error: {exc}"
        print(f"[BotWorker] {bot_id} -- {err}")
        _push_error_log(err)
        return   # cannot continue -- exit immediately

    # Accept both strategy(df) and evaluate(df) as the entry-point name
    _fn = _sloc.get("strategy") or _sloc.get("evaluate")
    if not callable(_fn):
        err = "No callable 'strategy' or 'evaluate' function found in strategy code."
        print(f"[BotWorker] {bot_id} -- {err}")
        _push_error_log(err)
        return

    # ---- local state ------------------------------------------------------------
    in_position: bool = False
    tick_n:      int  = 0

    try:
        while True:
            tick_n += 1
            try:
                # 1. fetch OHLCV ---------------------------------------------------
                bars: List[Dict] = await asyncio.to_thread(
                    _yahoo_v8, sym_norm, fetch_range, fetch_interval
                )
                if not bars or len(bars) < 5:
                    bars = await asyncio.to_thread(_yahoo_v8, sym_norm, "5d", "1d")
                if not bars or len(bars) < 2:
                    _push_error_log(
                        f"Not enough market data for {symbol.upper()} "
                        f"({len(bars)} bars).  Retrying next tick."
                    )
                    await asyncio.sleep(60)
                    continue

                df = pd.DataFrame(bars)
                if "time" in df.columns:
                    df["date"] = pd.to_datetime(df["time"], unit="s", utc=True)
                df = df.dropna(subset=["close"])
                try:
                    close_px = float(df["close"].iloc[-1])
                except (IndexError, KeyError, TypeError, ValueError):
                    close_px = 0.0

                # 2. run strategy -------------------------------------------------
                try:
                    strategy_result = _fn(df.copy())
                except Exception as exc:
                    err_msg = f"strategy(df) error: {exc}"
                    print(f"[BotWorker] {bot_id} -- {err_msg}")
                    _push_error_log(err_msg)
                    await asyncio.sleep(60)
                    continue

                # 3. interpret signal ---------------------------------------------
                want_buy, want_sell = _interpret(strategy_result)

                # resync in_position with actual memory (handles restarts/manual trades)
                positions_mem = _mem_get_positions(user_id)
                has_pos = any(p.get("symbol") == symbol.upper() for p in positions_mem)
                if has_pos != in_position:
                    in_position = has_pos

                # 4. tick log (capped at 200 to keep memory healthy) ---------------
                tick_ts = datetime.utcnow().isoformat() + "Z"
                if want_buy and not in_position:
                    lbl, st = "BUY signal", "buy_signal"
                elif want_sell and in_position:
                    lbl, st = "SELL signal", "sell_signal"
                elif want_buy:
                    lbl, st = "BUY (already holding)", "hold"
                elif want_sell:
                    lbl, st = "SELL (no position to exit)", "hold"
                else:
                    lbl, st = "HOLD", "hold"

                tick_msg = (
                    f"[BOT #{tick_n}] {symbol.upper()} "
                    f"Rs{close_px:,.2f}  --  {lbl}"
                )
                existing_ticks = sum(
                    1 for lg in _mem_get_logs(user_id)
                    if lg.get("order_type") == "bot_tick"
                )
                if existing_ticks < 200:
                    _mem_add_tick_log(user_id, {
                        "user_id":      user_id,
                        "strategy_id":  strategy_id,
                        "symbol":       symbol.upper(),
                        "action":       None,
                        "quantity":     0,
                        "price":        close_px,
                        "realized_pnl": 0.0,
                        "timestamp":    tick_ts,
                        "order_type":   "bot_tick",
                        "status":       st,
                        "message":      tick_msg,
                    })

                print(
                    f"[BotWorker] {bot_id} #{tick_n}  "
                    f"buy={want_buy} sell={want_sell} "
                    f"in_pos={in_position}  {symbol} Rs{close_px:,.2f}"
                )

                # 5. BUY ----------------------------------------------------------
                if want_buy and not in_position:
                    try:
                        order = await _execute_market_order(
                            user_id, symbol, quantity, "buy", strategy_id
                        )
                        in_position = True
                        px = order["executed_price"]
                        if bot_id in _BOT_META:
                            _BOT_META[bot_id]["last_action"] = "buy"
                            _BOT_META[bot_id]["last_price"]  = px
                            _BOT_META[bot_id]["in_position"] = True
                        fill_msg = (
                            f"[BOT ORDER] BUY {quantity} {symbol.upper()} "
                            f"@ Rs{px:,.2f}  |  {bot_label}"
                        )
                        # Prominent log entry for the order (action=buy -> renders as trade)
                        _mem_add_tick_log(user_id, {
                            "user_id":      user_id,
                            "strategy_id":  strategy_id,
                            "symbol":       symbol.upper(),
                            "action":       "buy",
                            "quantity":     quantity,
                            "price":        px,
                            "realized_pnl": 0.0,
                            "timestamp":    datetime.utcnow().isoformat() + "Z",
                            "order_type":   "bot_fill",
                            "status":       "filled",
                            "message":      fill_msg,
                        })
                        print(f"[BotWorker] {bot_id} -- BUY executed @ Rs{px:,.2f}")
                        _push_notif(
                            f"Paper Bot BUY -- {symbol.upper()}",
                            f"{bot_label} bought {quantity} {symbol.upper()} @ Rs{px:,.2f}",
                        )
                    except HTTPException as exc:
                        err_msg = f"BUY failed: {exc.detail}"
                        print(f"[BotWorker] {bot_id} -- {err_msg}")
                        _push_error_log(err_msg)

                # 6. SELL ---------------------------------------------------------
                elif want_sell and in_position:
                    pos_qty = next(
                        (int(p["quantity"]) for p in positions_mem
                         if p.get("symbol") == symbol.upper()),
                        quantity,
                    )
                    try:
                        order = await _execute_market_order(
                            user_id, symbol, pos_qty, "sell", strategy_id
                        )
                        in_position = False
                        px  = order["executed_price"]
                        pnl = order["realized_pnl"]
                        sgn = "+" if pnl >= 0 else ""
                        if bot_id in _BOT_META:
                            _BOT_META[bot_id]["last_action"] = "sell"
                            _BOT_META[bot_id]["last_price"]  = px
                            _BOT_META[bot_id]["in_position"] = False
                        fill_msg = (
                            f"[BOT ORDER] SELL {pos_qty} {symbol.upper()} "
                            f"@ Rs{px:,.2f}  |  P&L {sgn}Rs{pnl:,.2f}  |  {bot_label}"
                        )
                        _mem_add_tick_log(user_id, {
                            "user_id":      user_id,
                            "strategy_id":  strategy_id,
                            "symbol":       symbol.upper(),
                            "action":       "sell",
                            "quantity":     pos_qty,
                            "price":        px,
                            "realized_pnl": pnl,
                            "timestamp":    datetime.utcnow().isoformat() + "Z",
                            "order_type":   "bot_fill",
                            "status":       "filled",
                            "message":      fill_msg,
                        })
                        print(
                            f"[BotWorker] {bot_id} -- SELL executed "
                            f"@ Rs{px:,.2f}  P&L {sgn}Rs{pnl:,.2f}"
                        )
                        _push_notif(
                            f"Paper Bot SELL -- {symbol.upper()}",
                            f"{bot_label} sold {pos_qty} {symbol.upper()} "
                            f"@ Rs{px:,.2f}  |  P&L {sgn}Rs{pnl:,.2f}",
                        )
                    except HTTPException as exc:
                        err_msg = f"SELL failed: {exc.detail}"
                        print(f"[BotWorker] {bot_id} -- {err_msg}")
                        _push_error_log(err_msg)

            except asyncio.CancelledError:
                raise   # propagate to outer handler
            except Exception as exc:
                err_msg = f"Unexpected error on tick #{tick_n}: {exc}"
                print(f"[BotWorker] {bot_id} -- {err_msg}")
                _push_error_log(err_msg)

            await asyncio.sleep(60)

    except asyncio.CancelledError:
        print(f"[BotWorker] {bot_id} -- stopped by user after {tick_n} tick(s).")
        _mem_add_tick_log(user_id, {
            "user_id":      user_id,
            "strategy_id":  strategy_id,
            "symbol":       symbol.upper(),
            "action":       None,
            "quantity":     0,
            "price":        0.0,
            "realized_pnl": 0.0,
            "timestamp":    datetime.utcnow().isoformat() + "Z",
            "order_type":   "bot_tick",
            "status":       "stopped",
            "message": (
                f"[BOT STOPPED] {bot_label} on {symbol.upper()} -- "
                f"{tick_n} tick(s) run -- stopped by user."
            ),
        })
    finally:
        _RUNNING_BOTS.pop(bot_id, None)
        _BOT_META.pop(bot_id, None)
        print(f"[BotWorker] {bot_id} -- exited.")'''

# ── Find old function boundaries and swap ─────────────────────────────────────
START = "async def bot_worker("
END   = "        print(f\"[BotWorker] {bot_id} \u2014 exited.\")"

si = src.index(START)
ei = src.index(END, si) + len(END)

new_src = src[:si] + NEW_FN + src[ei:]
path.write_text(new_src, encoding="utf-8")
print(f"Replaced bot_worker ({ei - si} chars old -> {len(NEW_FN)} chars new). DONE.")
