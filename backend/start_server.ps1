# PowerShell script to start the backend server with OpenAI API key

# Set the OpenAI API key for this session
$env:OPENAI_API_KEY = "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"

# Verify it's set
Write-Host "OPENAI_API_KEY is set to: $env:OPENAI_API_KEY" -ForegroundColor Green

# Change to backend directory
Set-Location $PSScriptRoot

# Start the server (Ctrl+C will stop it)
Write-Host "`nStarting FastAPI server on http://127.0.0.1:8000..." -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop the server.`n" -ForegroundColor Gray
python -u main.py
