@echo off
REM Batch script to start the backend server with OpenAI API key

REM Set the OpenAI API key for this session
set OPENAI_API_KEY=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

REM Verify it's set
echo OPENAI_API_KEY is set to: %OPENAI_API_KEY%

REM Change to backend directory
cd /d %~dp0

REM Start the server
echo.
echo Starting FastAPI server on http://127.0.0.1:8000...
python main.py

pause
