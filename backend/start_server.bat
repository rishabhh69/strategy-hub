@echo off
REM Batch script to start the backend server

REM ── OpenAI ────────────────────────────────────────────────────────────────
REM Do NOT store secrets in source. Set the OpenAI key in your environment instead.
set OPENAI_API_KEY=

REM ── Supabase (get from: Supabase Dashboard → Settings → API) ─────────────
REM   SUPABASE_URL        = Project URL  (e.g. https://xxxx.supabase.co)
REM   SUPABASE_SERVICE_ROLE_KEY = service_role key (NOT the anon/public key)
set SUPABASE_URL=https://tvavximzdvbflprysniy.supabase.co
REM Service role keys must not be checked into source. Set via environment.
set SUPABASE_SERVICE_ROLE_KEY=

echo OPENAI_API_KEY is set to: %OPENAI_API_KEY%
echo SUPABASE_URL is set to: %SUPABASE_URL%

REM Change to backend directory
cd /d %~dp0

REM Start the server (Ctrl+C will stop it)
echo.
echo Starting FastAPI server on http://127.0.0.1:8000...
echo Press Ctrl+C to stop the server.
echo.
python -u main.py
