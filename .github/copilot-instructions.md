# Strategy Hub - Copilot Instructions

## Build, Test, and Lint Commands

### Frontend (React + Vite + TypeScript)
```bash
# Install dependencies
npm install

# Development server (runs on http://localhost:8080)
npm run dev

# Production build
npm run build

# Development build
npm run build:dev

# Lint all files
npm run lint

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Preview production build
npm run preview
```

### Backend (Python FastAPI)
```bash
# Install Python dependencies
cd backend
pip install -r requirements.txt

# Run development server (http://127.0.0.1:8000)
python main.py

# Or with uvicorn directly
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**Important:** The backend requires `OPENAI_API_KEY` environment variable for AI-powered backtesting and strategy generation. Set it in `backend/.env` (copy from `backend/.env.example`). The `/quote` endpoint works without OpenAI, but `/backtest` requires it.

## Architecture Overview

### Monorepo Structure
This is a full-stack trading strategy platform with three main components:

1. **Frontend** (React + TypeScript + Vite)
   - Built with shadcn/ui components and Tailwind CSS
   - Uses React Router for navigation
   - Supabase for authentication and data persistence
   - TanStack Query for server state management

2. **Backend** (Python FastAPI)
   - RESTful API for strategy backtesting, paper trading, and live market data
   - OpenAI integration for AI-generated trading strategies
   - Yahoo Finance (yfinance) for market data
   - Angel One SmartAPI integration for broker connectivity
   - Supabase for database operations (service role)

3. **Database** (Supabase PostgreSQL)
   - `strategies` table: Terminal-deployed strategies (user_id, code, symbol, status)
   - `saved_strategies` table: User's saved backtested strategies with metrics
   - Authentication handled by Supabase Auth
   - Schema files in `supabase/` directory

### Data Flow
- **Strategy Studio**: Frontend → Backend `/backtest` → OpenAI generates code → executes with pandas/numpy → returns metrics
- **Live Terminal**: Frontend → Supabase `strategies` table → Backend scheduler reads strategies → executes on market data → manages positions
- **Saved Strategies**: Backtest results saved to Supabase `saved_strategies` with equity curves (JSON) and performance metrics
- **Paper Trading**: Backend maintains in-memory positions, executes user strategies via WebSocket, persists state to Supabase

### Key Technologies
- **Frontend**: React 18, TypeScript, Vite, shadcn/ui, TailwindCSS, Recharts, TanStack Query
- **Backend**: FastAPI, Pydantic, OpenAI SDK, yfinance, pandas, numpy, APScheduler
- **Database**: Supabase (PostgreSQL), Row Level Security (RLS)
- **Deployment**: Vercel (frontend), backend runs standalone

## Coding Conventions

### Frontend Conventions

#### Import Aliases
Use `@/` for all src imports:
```typescript
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
```

#### Component Organization
- **Pages**: Route-level components in `src/pages/`
- **UI Components**: shadcn/ui primitives in `src/components/ui/`
- **Feature Components**: Grouped by feature (e.g., `src/components/StrategyStudio/`, `src/components/auth/`)
- **Layout Components**: Shared layouts in `src/components/layout/`

#### State Management
- **Server State**: TanStack Query (`useQuery`, `useMutation`)
- **Client State**: React hooks (`useState`, `useReducer`, `useContext`)
- **Form State**: React Hook Form with Zod validation

#### Supabase Client Usage
- Frontend uses **anon key** (`VITE_SUPABASE_PUBLISHABLE_KEY`)
- Client automatically created in `src/integrations/supabase/client.ts`
- Types auto-generated in `src/integrations/supabase/types.ts`
- Authentication persists in localStorage with auto-refresh

#### Protected Routes
Use `RequireConfirmedAuth` wrapper for authenticated routes:
```typescript
<Route element={<RequireConfirmedAuth />}>
  <Route path="/strategy-studio" element={<StrategyStudio />} />
</Route>
```

### Backend Conventions

#### Security Model (OWASP-Aligned)
- **Rate Limiting**: IP-based in-memory rate limiting (configurable per endpoint in `_RATE_RULES`)
- **Input Validation**: Strict Pydantic schemas with length limits, no extra fields allowed
- **Code Execution**: AI-generated strategy code runs with **AST security validation** (blocks `os`, `sys`, `eval`, `exec`, `open`, etc.)
- **CORS**: Configure `allow_origins` in production to restrict frontend domain
- **No Sandboxing**: Strategy code executes with full Python builtins to allow pandas/numpy/math operations

#### Strategy Code Contract
All user-submitted strategies must:
1. Define exactly one function: `def evaluate(data):` that accepts a pandas DataFrame
2. Return `"BUY"`, `"SELL"`, `"HOLD"` (strings) OR numeric values (>0 = BUY, <0 = SELL, 0 = HOLD)
3. Use only allowed imports: pandas, numpy, math, ta (technical analysis library)
4. Pass AST security validation in `engine/sandbox.py`

#### Data Fetching Strategy
Backend prioritizes reliability over mocking (from `main.py` docstring):
1. Yahoo Finance v8 chart API (direct HTTP, no auth, fast)
2. `yf.Ticker.history()` as fallback
3. Return empty/zeros if all fail — **never** return synthetic mock data

#### Environment Variables
Backend loads from `backend/.env`:
- `OPENAI_API_KEY`: Required for `/backtest` and strategy generation
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for backend database operations
- Angel One credentials for live broker integration (optional)

#### Supabase Usage
- Backend uses **service role key** for full database access
- Client created lazily in `database.py::get_supabase()`
- Frontend uses RLS policies; backend bypasses RLS with service role

### File Naming
- **React Components**: PascalCase (e.g., `StrategyStudio.tsx`, `DeploymentModal.tsx`)
- **Hooks**: kebab-case with `use-` prefix (e.g., `use-toast.ts`, `use-mobile.tsx`)
- **Utilities**: kebab-case (e.g., `symbol-map.ts`, `utils.ts`)
- **Python Files**: snake_case (e.g., `main.py`, `strategy.py`, `database.py`)

### Test Files
- Frontend tests: `src/**/*.{test,spec}.{ts,tsx}`
- Test setup: `src/test/setup.ts`
- Environment: jsdom with vitest globals enabled

## Common Patterns

### Adding a New Supabase Table
1. Write SQL schema in `supabase/` directory
2. Add RLS policies for anon/authenticated/service_role
3. Run SQL in Supabase Dashboard → SQL Editor
4. If using TypeScript client, regenerate types from Supabase dashboard

### Adding a Backend Endpoint
1. Create/update router in `backend/routes/` (e.g., `strategy.py`, `broker.py`)
2. Define Pydantic request/response models with strict validation
3. Add rate limiting rule to `_RATE_RULES` in `main.py` if needed
4. Register router in `main.py` with `app.include_router()`

### Environment Variables Setup
**Frontend** (`.env` in project root):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
```

**Backend** (`backend/.env`):
```
OPENAI_API_KEY=sk-proj-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Troubleshooting

For backend errors, check `backend/TROUBLESHOOTING.md`. Common issues:

- **OpenAI quota exceeded**: Add credits at https://platform.openai.com/account/billing or use a different key
- **Invalid API key**: Ensure `OPENAI_API_KEY` in `backend/.env` has no quotes/spaces, starts with `sk-proj-` or `sk-`
- **No data for ticker**: Try `.NS` suffix for Indian stocks (e.g., `RELIANCE.NS`)
- **Strategy execution error**: Check that AI-generated code follows the `evaluate(data)` contract

## Project Context

This is a trading strategy development platform called "Strategy Hub" (or "Tradeky" in backend code). It was initially generated with Lovable (low-code platform) and has been extensively customized. The platform allows users to:

1. **Strategy Studio**: Generate trading strategies with AI prompts, backtest on historical data
2. **Live Terminal**: Deploy strategies for paper/live trading with broker integration
3. **Marketplace**: Browse and deploy community strategies (feature present but may be incomplete)
4. **Saved Strategies**: Personal library of backtested strategies with performance metrics

The codebase uses modern tooling (Vite, TypeScript, FastAPI) and follows security best practices for code execution sandboxing and rate limiting.
