@echo off
REM Batch script to start the backend server

REM ── OpenAI ────────────────────────────────────────────────────────────────
set OPENAI_API_KEY=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

REM ── Supabase (get from: Supabase Dashboard → Settings → API) ─────────────
REM   SUPABASE_URL        = Project URL  (e.g. https://xxxx.supabase.co)
REM   SUPABASE_SERVICE_ROLE_KEY = service_role key (NOT the anon/public key)
set SUPABASE_URL=https://tvavximzdvbflprysniy.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2YXZ4aW16ZHZiZmxwcnlzbmp5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDQ0OTg5NywiZXhwIjoyMDg2MDI1ODk3fQ.n4L64C5XlFst56OnmtNwg8QRK1-eO-uulFzrJ1lHaWQ

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
