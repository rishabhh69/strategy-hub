# Troubleshooting Guide

## OpenAI API Quota Exceeded Error

If you see the error: **"You exceeded your current quota, please check your plan and billing details"**

### What This Means
Your OpenAI API key doesn't have sufficient credits/quota to make API calls.

### Solutions

#### Option 1: Add Credits to Your OpenAI Account (Recommended)
1. Go to https://platform.openai.com/account/billing
2. Click "Add payment method" or "Add credits"
3. Add credits to your account
4. Wait a few minutes for the credits to be processed
5. Try running the backtest again

#### Option 2: Use a Different OpenAI API Key
1. Get a new API key from https://platform.openai.com/api-keys
2. Update your environment variable:
   ```powershell
   $env:OPENAI_API_KEY="your-new-api-key-here"
   ```
3. Or update `start_server.ps1` with the new key
4. Restart the server

#### Option 3: Check Your Usage Limits
1. Visit https://platform.openai.com/usage
2. Check if you've hit any rate limits or usage caps
3. Some accounts have monthly spending limits that need to be increased

### Testing Your API Key

Use the test endpoint to verify your API key works:
```powershell
# Start the server first, then in another terminal:
curl http://127.0.0.1:8000/test-openai
```

Or visit: http://127.0.0.1:8000/test-openai in your browser

### Alternative: Use a Different AI Provider

If you can't resolve the OpenAI quota issue, you could:
- Use Anthropic Claude API (requires code changes)
- Use a local LLM model
- Use a different AI code generation service

## Other Common Errors

### "Invalid API Key"
- Check that your API key is correct (starts with `sk-`)
- Make sure there are no extra spaces or quotes
- Verify the environment variable is set: `echo $env:OPENAI_API_KEY`

### "No data found for ticker"
- The ticker symbol might be incorrect
- The stock might not be available on Yahoo Finance
- Try a different ticker (e.g., RELIANCE.NS, TCS.NS)

### "Strategy execution error"
- The AI-generated code might have syntax errors
- Check the terminal output for the full error message
- Try a simpler strategy prompt
