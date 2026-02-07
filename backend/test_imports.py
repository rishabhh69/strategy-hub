"""Test script to verify all imports work correctly"""
try:
    print("Testing imports...")
    from fastapi import FastAPI, HTTPException
    print("✓ fastapi")
    
    from fastapi.middleware.cors import CORSMiddleware
    print("✓ fastapi.middleware.cors")
    
    from pydantic import BaseModel
    print("✓ pydantic")
    
    import yfinance as yf
    print("✓ yfinance")
    
    import pandas as pd
    print("✓ pandas")
    
    import numpy as np
    print("✓ numpy")
    
    from openai import OpenAI
    print("✓ openai")
    
    from typing import List, Dict, Any
    print("✓ typing")
    
    import uvicorn
    print("✓ uvicorn")
    
    print("\n✅ All imports successful!")
    print("\nYou can now run: python main.py")
    
except ImportError as e:
    print(f"\n❌ Import error: {e}")
    print("\nPlease install missing dependencies:")
    print("pip install -r requirements.txt")
