# Strategy Hub Backend

Python FastAPI backend for the Strategy Hub trading application.

## Setup

1. **Install Python dependencies:**
   ```powershell
   pip install -r requirements.txt
   ```

2. **Set OpenAI API Key (required for backtest endpoint):**
   
   **Option A: Use the startup script (Easiest - includes your API key):**
   ```powershell
   .\start_server.ps1
   ```
   Or double-click `start_server.bat` in Windows Explorer
   
   **Option B: Set manually in PowerShell:**
   ```powershell
   $env:OPENAI_API_KEY="tradeky_api_2510"
   python main.py
   ```
   
   **Option C: Set permanently in Windows:**
   - Open System Properties → Environment Variables
   - Add `OPENAI_API_KEY` with your API key value
   - Restart your terminal/IDE

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
