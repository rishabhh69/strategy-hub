# Strategy Hub Backend

Python FastAPI backend for the Strategy Hub trading application.

## Setup

1. **Install Python dependencies:**
   ```powershell
   pip install -r requirements.txt
   ```

2. **Set OpenAI API Key (required for backtest / Strategy Studio):**
   
   **Option A – .env file (recommended):**
   ```powershell
   cd backend
   copy .env.example .env
   # Edit .env and set: OPENAI_API_KEY=sk-your-key-here
   ```
   Then run `start_server.bat` or `python main.py`. The server loads `OPENAI_API_KEY` from `backend\.env`.
   
   **Option B – This terminal only:**
   ```powershell
   set OPENAI_API_KEY=sk-your-key-here
   python main.py
   ```
   
   **Option C – System environment variable:**
   - Windows: System Properties → Environment Variables → add `OPENAI_API_KEY`
   - Restart terminal/IDE after changing

3. **Run the server:**
   ```powershell
   python main.py
   ```
   
   Or using uvicorn directly:
   ```powershell
   uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```
   
   **Note:** In PowerShell, use `$env:VARIABLE="value"` (not `set VARIABLE=value` which is CMD syntax)

The server will start on `http://127.0.0.1:8000`

## Endpoints

- `GET /` - Health check
- `POST /backtest` - Run backtest with AI-generated strategy
- `GET /quote/{ticker}` - Get live quote for a ticker

## Notes

- The `/quote` endpoint works without OpenAI API key
- The `/backtest` endpoint requires OpenAI API key to generate strategies
- Indian stocks should use `.NS` suffix (e.g., `RELIANCE.NS`)

## Troubleshooting

If you encounter errors, check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues and solutions.

### Common Issues:

**OpenAI Quota Exceeded:**
- Add credits at https://platform.openai.com/account/billing
- Or use a different API key with available quota

**Test your API key:**
```powershell
# Visit: http://127.0.0.1:8000/test-openai
```
