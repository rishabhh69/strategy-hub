from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yfinance as yf
import pandas as pd
import numpy as np
from openai import OpenAI
from typing import List, Dict, Any
import os
from datetime import datetime, timedelta

app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize OpenAI client
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    print("WARNING: OPENAI_API_KEY environment variable not set. Backtest endpoint will not work.")
    openai_client = None
else:
    openai_client = OpenAI(api_key=openai_api_key)

class BacktestRequest(BaseModel):
    ticker: str
    prompt: str

class BacktestResponse(BaseModel):
    metrics: Dict[str, float]
    chart_data: List[Dict[str, Any]]
    generated_code: str

@app.post("/backtest", response_model=BacktestResponse)
async def run_backtest(request: BacktestRequest):
    try:
        # Prepare ticker symbol (append .NS for India)
        ticker_symbol = request.ticker
        if not ticker_symbol.endswith('.NS'):
            ticker_symbol = f"{ticker_symbol}.NS"
        
        # Download historical data using yfinance
        print(f"Downloading data for {ticker_symbol}...")
        stock = yf.Ticker(ticker_symbol)
        df = stock.history(period="2y")  # 2 years of data
        
        if df.empty:
            raise HTTPException(status_code=400, detail=f"No data found for ticker {ticker_symbol}")
        
        # Reset index to make Date a column
        df = df.reset_index()
        df.columns = [col.lower().replace(' ', '_') for col in df.columns]
        
        # Ensure we have required columns
        required_cols = ['date', 'open', 'high', 'low', 'close', 'volume']
        for col in required_cols:
            if col not in df.columns:
                raise HTTPException(status_code=500, detail=f"Missing required column: {col}")
        
        # Check if OpenAI is configured
        if not openai_client:
            raise HTTPException(
                status_code=500, 
                detail="OpenAI API key not configured. Please set OPENAI_API_KEY environment variable."
            )
        
        # Generate Python strategy code using OpenAI
        print(f"Generating strategy code from prompt: {request.prompt[:50]}...")
        
        strategy_prompt = f"""Generate a Python trading strategy function based on this description:
{request.prompt}

Requirements:
1. Create a function named 'strategy' that takes a pandas DataFrame 'data' as input
2. The DataFrame will have columns: date, open, high, low, close, volume
3. The function should add a 'signal' column with values: 1 for buy, -1 for sell, 0 for hold
4. The function should add a 'position' column that tracks current position (1 for long, -1 for short, 0 for none)
5. The function should add a 'equity' column that tracks cumulative equity curve starting from 100000
6. Use pandas and numpy operations. You can use technical indicators like RSI, SMA, EMA, MACD calculations
7. Return the modified DataFrame
8. Only output the function code, no explanations or markdown formatting

Example structure:
import pandas as pd
import numpy as np

def strategy(data: pd.DataFrame) -> pd.DataFrame:
    # Your strategy logic here
    # Calculate indicators
    # Generate signals
    # Track positions
    # Calculate equity curve
    return data
"""
        
        try:
            response = openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are a Python trading strategy expert. Generate clean, executable Python code."},
                    {"role": "user", "content": strategy_prompt}
                ],
                temperature=0.3,
            )
            generated_code = response.choices[0].message.content.strip()
            
            # Clean up the code (remove markdown code blocks if present)
            if generated_code.startswith("```python"):
                generated_code = generated_code[9:]
            elif generated_code.startswith("```"):
                generated_code = generated_code[3:]
            if generated_code.endswith("```"):
                generated_code = generated_code[:-3]
            generated_code = generated_code.strip()
            
            # Validate that we got some code
            if not generated_code or len(generated_code) < 50:
                raise HTTPException(status_code=500, detail="Generated code is too short or empty")
            
            print(f"Generated code length: {len(generated_code)} characters")
            
        except Exception as e:
            error_str = str(e)
            print(f"ERROR: OpenAI API error: {error_str}")
            import traceback
            traceback.print_exc()
            
            # Check for specific error types
            if 'insufficient_quota' in error_str or 'quota' in error_str.lower():
                error_msg = "OpenAI API quota exceeded. Please check your OpenAI account billing and add credits. Visit https://platform.openai.com/account/billing"
            elif 'invalid_api_key' in error_str.lower() or 'authentication' in error_str.lower():
                error_msg = "Invalid OpenAI API key. Please check your OPENAI_API_KEY environment variable."
            else:
                error_msg = f"OpenAI API error: {error_str}"
            
            raise HTTPException(status_code=500, detail=error_msg)
        
        # Execute the strategy code
        print("Executing strategy...")
        try:
            # Create a safe execution environment
            exec_globals = {
                'pd': pd,
                'np': np,
                'pd.DataFrame': pd.DataFrame,
            }
            exec_locals = {}
            
            # Execute the generated code
            print(f"Executing generated code (length: {len(generated_code)} chars)...")
            exec(generated_code, exec_globals, exec_locals)
            print("Code executed successfully")
            
            # Get the strategy function
            if 'strategy' not in exec_locals:
                raise HTTPException(status_code=500, detail="Generated code does not contain a 'strategy' function")
            
            strategy_func = exec_locals['strategy']
            
            # Run the strategy on the data
            print(f"Running strategy on dataframe with {len(df)} rows...")
            result_df = strategy_func(df.copy())
            print(f"Strategy completed. Result dataframe shape: {result_df.shape}")
            print(f"Result columns: {list(result_df.columns)}")
            
            # Ensure we have equity column
            if 'equity' not in result_df.columns:
                # Calculate equity from returns if not present
                if 'strategy_returns' in result_df.columns:
                    result_df['equity'] = 100000 * (1 + result_df['strategy_returns']).cumprod()
                else:
                    # Simple equity calculation from positions
                    result_df['returns'] = result_df['close'].pct_change()
                    if 'position' in result_df.columns:
                        result_df['strategy_returns'] = result_df['position'].shift(1) * result_df['returns']
                    else:
                        result_df['strategy_returns'] = result_df['returns']
                    result_df['equity'] = 100000 * (1 + result_df['strategy_returns']).cumprod()
            
            # Calculate metrics
            equity_values = result_df['equity'].dropna()
            if len(equity_values) < 2:
                raise HTTPException(status_code=500, detail="Insufficient data for backtest")
            
            initial_equity = equity_values.iloc[0]
            final_equity = equity_values.iloc[-1]
            
            # Calculate CAGR
            days = (result_df['date'].iloc[-1] - result_df['date'].iloc[0]).days
            years = days / 365.25
            if years > 0:
                cagr = ((final_equity / initial_equity) ** (1 / years) - 1) * 100
            else:
                cagr = 0
            
            # Calculate Max Drawdown
            running_max = equity_values.expanding().max()
            drawdown = (equity_values - running_max) / running_max * 100
            max_drawdown = drawdown.min()
            
            # Calculate Sharpe Ratio
            if 'strategy_returns' in result_df.columns:
                returns = result_df['strategy_returns'].dropna()
                if len(returns) > 1 and returns.std() > 0:
                    sharpe = (returns.mean() / returns.std()) * np.sqrt(252)  # Annualized
                else:
                    sharpe = 0
            else:
                sharpe = 0
            
            # Prepare chart data
            chart_data = []
            for _, row in result_df.iterrows():
                chart_data.append({
                    "time": row['date'].strftime('%Y-%m-%d') if isinstance(row['date'], pd.Timestamp) else str(row['date']),
                    "value": float(row['equity'])
                })
            
            return BacktestResponse(
                metrics={
                    "cagr": round(cagr, 2),
                    "drawdown": round(max_drawdown, 2),
                    "sharpe": round(sharpe, 2)
                },
                chart_data=chart_data,
                generated_code=generated_code
            )
            
        except Exception as e:
            error_msg = f"Strategy execution error: {str(e)}"
            print(f"ERROR: {error_msg}")
            print(f"Generated code was:\n{generated_code[:500]}...")  # Print first 500 chars
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=error_msg)
    
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Backtest error: {str(e)}"
        print(f"ERROR: {error_msg}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=error_msg)

@app.get("/quote/{ticker}")
async def get_quote(ticker: str):
    try:
        # Prepare ticker symbol (append .NS for India)
        ticker_symbol = ticker
        if not ticker_symbol.endswith('.NS'):
            ticker_symbol = f"{ticker_symbol}.NS"
        
        # Get current quote
        stock = yf.Ticker(ticker_symbol)
        info = stock.info
        
        # Get current price
        current_data = stock.history(period="1d", interval="1m")
        if current_data.empty:
            # Fallback to regular market data
            hist = stock.history(period="5d")
            if hist.empty:
                raise HTTPException(status_code=404, detail=f"No data found for ticker {ticker_symbol}")
            current_price = hist['Close'].iloc[-1]
            prev_close = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
        else:
            current_price = current_data['Close'].iloc[-1]
            prev_close = info.get('previousClose', current_price)
        
        # Calculate change percent
        change_percent = ((current_price - prev_close) / prev_close) * 100 if prev_close > 0 else 0
        
        return {
            "price": round(float(current_price), 2),
            "change_percent": round(change_percent, 2)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Quote error: {str(e)}")

@app.get("/")
async def root():
    return {
        "message": "Strategy Hub Backend API", 
        "status": "running",
        "openai_configured": openai_client is not None
    }

@app.get("/test-openai")
async def test_openai():
    """Test endpoint to verify OpenAI API is working"""
    if not openai_client:
        return {"error": "OpenAI API key not configured"}
    
    try:
        response = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "user", "content": "Say 'Hello, OpenAI is working!'"}
            ],
            max_tokens=20
        )
        return {
            "status": "success",
            "message": response.choices[0].message.content
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
