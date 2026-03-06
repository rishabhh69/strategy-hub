import os
from typing import Optional

from supabase import Client, create_client


_supabase_client: Optional[Client] = None


def get_supabase() -> Client:
  """
  Lazily initialize and return a Supabase client using service-role key.
  This is intentionally separate from the main FastAPI app so it can be reused
  by auxiliary routers like broker integrations without touching core logic.
  """
  global _supabase_client
  if _supabase_client is None:
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")
    if not url or not key:
      raise RuntimeError("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured in environment.")
    _supabase_client = create_client(url, key)
  return _supabase_client

