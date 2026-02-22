@echo off
REM Batch script to start the backend server

REM ── OpenAI (required for /backtest) ────────────────────────────────────────
REM Set OPENAI_API_KEY in one of these ways:
REM   1. Create backend\.env with:  OPENAI_API_KEY=sk-your-key
REM   2. Or set in this window before running:  set OPENAI_API_KEY=sk-your-key
REM   3. Or set in Windows: System Properties → Environment Variables
if not defined OPENAI_API_KEY (
  echo WARNING: OPENAI_API_KEY is not set. Backtest will fail.
  echo Create backend\.env with OPENAI_API_KEY=sk-... or set it in this window.
)

REM ── Supabase (get from: Supabase Dashboard → Settings → API) ─────────────
REM   SUPABASE_URL = Project URL; SUPABASE_SERVICE_ROLE_KEY = service_role key
REM   Can also be set in backend\.env (do not commit .env)
set SUPABASE_URL=https://tvavximzdvbflprysniy.supabase.co
if not defined SUPABASE_SERVICE_ROLE_KEY set SUPABASE_SERVICE_ROLE_KEY=

if defined OPENAI_API_KEY (echo OPENAI_API_KEY: set) else (echo OPENAI_API_KEY: not set)
echo SUPABASE_URL: %SUPABASE_URL%

REM Change to backend directory
cd /d %~dp0

REM Start the server (Ctrl+C will stop it)
echo.
echo Starting FastAPI server on http://127.0.0.1:8000...
echo Press Ctrl+C to stop the server.
echo.
python -u main.py
