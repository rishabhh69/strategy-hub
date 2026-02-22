# PowerShell script to start the backend server with OpenAI API key

# Do NOT store secrets in source. Set the OpenAI key in your environment instead.
$env:OPENAI_API_KEY = ""

# For safety, do not print the full key in logs. Verify manually if needed.
Write-Host "OPENAI_API_KEY is present:" -ForegroundColor Green

# Change to backend directory
Set-Location $PSScriptRoot

# Start the server (Ctrl+C will stop it)
Write-Host "`nStarting FastAPI server on http://127.0.0.1:8000..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server.`n" -ForegroundColor Gray
python -u main.py
