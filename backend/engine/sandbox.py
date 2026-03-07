"""
Secure AST-based validation and restricted execution for user-provided Python trading strategies.
Prevents RCE by allowing only whitelisted imports and blocking dangerous built-ins.
"""

from __future__ import annotations

import ast
import math
from typing import Any

import numpy as np
import pandas as pd

# Optional: technical analysis library (allow in AST; add to safe_globals only if installed)
try:
    import ta  # noqa: F401
    _TA_AVAILABLE = True
except ImportError:
    _TA_AVAILABLE = False


ALLOWED_IMPORTS = frozenset({"pandas", "numpy", "numpy as np", "math", "ta", "pd", "np"})
# Module names that are strictly forbidden (os, sys, subprocess, requests, etc.)
FORBIDDEN_IMPORTS = frozenset({
    "os", "sys", "subprocess", "requests", "urllib", "socket", "ftplib",
    "pickle", "marshal", "shelve", "code", "codeop", "bdb", "pdb",
    "builtins", "__builtin__", "importlib", "runpy", "ctypes", "multiprocessing",
    "threading", "concurrent", "asyncio", "ssl", "http", "xml", "html",
    "pathlib", "shutil", "tempfile", "glob", "fnmatch", "fileinput",
    "getattr", "setattr", "delattr", "eval", "exec", "compile", "open",
    "__import__", "breakpoint", "input", "execfile", "reload", "vars", "dir",
})
# Built-in names that must not appear as calls (RCE vectors)
FORBIDDEN_BUILTIN_CALLS = frozenset({
    "open", "eval", "exec", "__import__", "compile", "getattr", "setattr",
    "globals", "locals", "vars", "dir", "breakpoint", "input", "reload",
    "execfile", "file", "raw_input", "delattr", "__build_class__",
})

# Names that must not appear anywhere (reference or call) — blocks escape via __builtins__
FORBIDDEN_NAMES = frozenset({
    "__builtins__", "__import__", "builtins", "__builtin__",
    "globals", "locals", "vars", "dir", "getattr", "setattr", "delattr",
    "eval", "exec", "compile", "open", "input", "breakpoint", "reload",
    "__globals__", "__code__", "__subclasses__", "func_globals", "func_code",
    "frame", "f_globals", "f_locals", "f_code", "tb_frame",
})

# Attribute names that must not be accessed (e.g. obj.__class__.__subclasses__)
FORBIDDEN_ATTRS = frozenset({
    "__builtins__", "__import__", "__globals__", "__code__", "__subclasses__",
    "func_globals", "func_code", "f_globals", "f_locals", "f_code",
    "tb_frame", "gi_frame", "cr_frame", "__class__", "__bases__",
    "os", "sys", "subprocess", "open", "eval", "exec", "compile",
})

# Minimal safe builtins so strategies can use len(), range(), etc. without full builtins
SAFE_BUILTINS: dict[str, Any] = {
    "len": len,
    "range": range,
    "int": int,
    "float": float,
    "str": str,
    "bool": bool,
    "abs": abs,
    "min": min,
    "max": max,
    "sum": sum,
    "round": round,
    "list": list,
    "dict": dict,
    "tuple": tuple,
    "zip": zip,
    "enumerate": enumerate,
    "isinstance": isinstance,
    "hasattr": hasattr,
    "None": None,
    "True": True,
    "False": False,
}


class SecurityBreachError(ValueError):
    """Raised when AST validation detects forbidden constructs."""


def _normalise_import_name(node: ast.AST) -> str:
    """Return a single string like 'pandas' or 'numpy as np' for the import."""
    if isinstance(node, ast.Import):
        for alias in node.names:
            name = alias.name
            asname = alias.asname
            if asname:
                return f"{name} as {asname}"
            return name
    if isinstance(node, ast.ImportFrom):
        module = node.module or ""
        for alias in node.names:
            name = alias.name
            if name == "*":
                return f"{module}.*"
            asname = alias.asname or name
            if module:
                return f"{module}.{name}"
            return name
    return ""


def _check_import(node: ast.AST) -> None:
    if isinstance(node, ast.Import):
        for alias in node.names:
            base = alias.name.split(".")[0]
            if base in FORBIDDEN_IMPORTS:
                raise SecurityBreachError(
                    f"Security: import '{alias.name}' is not allowed. "
                    f"Only pandas, numpy, math, and ta are permitted."
                )
            allowed = alias.name in ALLOWED_IMPORTS or (
                alias.asname and f"{alias.name} as {alias.asname}" in ALLOWED_IMPORTS
            )
            if not allowed:
                # Allow known-safe modules
                if base not in ("pandas", "numpy", "math", "ta"):
                    raise SecurityBreachError(
                        f"Security: import '{alias.name}' is not allowed. "
                        f"Only pandas, numpy, math, and ta are permitted."
                    )
        return
    if isinstance(node, ast.ImportFrom):
        module = node.module or ""
        base = module.split(".")[0]
        if base in FORBIDDEN_IMPORTS or base not in ("pandas", "numpy", "math", "ta"):
            raise SecurityBreachError(
                f"Security: from '{module}' import ... is not allowed. "
                f"Only pandas, numpy, math, and ta are permitted."
            )
        for alias in node.names:
            if alias.name == "*":
                raise SecurityBreachError("Security: 'from x import *' is not allowed.")
        return


def _check_call(node: ast.Call) -> None:
    """Strikedown: calls to open(), eval(), exec(), __import__(), etc."""
    if isinstance(node.func, ast.Name):
        name = node.func.id
        if name in FORBIDDEN_BUILTIN_CALLS:
            raise SecurityBreachError(
                f"Security: call to '{name}()' is forbidden (RCE risk)."
            )
    if isinstance(node.func, ast.Attribute):
        if node.func.attr in FORBIDDEN_BUILTIN_CALLS or node.func.attr in FORBIDDEN_ATTRS:
            raise SecurityBreachError(
                f"Security: call to '.{node.func.attr}()' is forbidden (RCE risk)."
            )


def _check_name(node: ast.Name) -> None:
    """Block any use of __builtins__, getattr, eval, etc."""
    if node.id in FORBIDDEN_NAMES:
        raise SecurityBreachError(
            f"Security: use of '{node.id}' is not allowed (RCE risk)."
        )


def _check_attr(node: ast.Attribute) -> None:
    """Block access to __globals__, __code__, __subclasses__, etc."""
    if node.attr in FORBIDDEN_ATTRS:
        raise SecurityBreachError(
            f"Security: attribute access '.{node.attr}' is not allowed (RCE risk)."
        )


def _visit_node(node: ast.AST) -> None:
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        _check_import(node)
    if isinstance(node, ast.Call):
        _check_call(node)
    if isinstance(node, ast.Name):
        _check_name(node)
    if isinstance(node, ast.Attribute):
        _check_attr(node)
    for child in ast.iter_child_nodes(node):
        _visit_node(child)


def validate_code_security(code_string: str) -> None:
    """
    Parse and validate user code using AST. Allow only pandas, numpy, math, ta.
    Strikedown: os, sys, requests, subprocess, open(), eval(), exec(), __import__().
    Requires exactly one function: def evaluate(data):.
    Raises ValueError (SecurityBreachError) on violation.
    """
    if not code_string or not code_string.strip():
        raise ValueError("Code string is empty.")
    try:
        tree = ast.parse(code_string)
    except SyntaxError as e:
        raise ValueError(f"Invalid Python syntax: {e}") from e

    func_defs = [
        n for n in ast.walk(tree)
        if isinstance(n, ast.FunctionDef) and n.name == "evaluate"
    ]
    if len(func_defs) != 1:
        raise ValueError(
            "Code must define exactly one function named 'evaluate(data)'."
        )
    # Check signature has at least one arg (data)
    if not func_defs[0].args.args:
        raise ValueError("Function 'evaluate' must accept at least one argument (e.g. data).")

    _visit_node(tree)


def run_strategy_safely(code_string: str, market_data_df: pd.DataFrame) -> str:
    """
    Execute user code in a restricted environment and return "BUY", "SELL", or "HOLD".
    safe_globals: pd, np, math, ta (if available), and minimal __builtins__ (no open/eval/exec).
    """
    validate_code_security(code_string)

    safe_globals: dict[str, Any] = {
        "pd": pd,
        "np": np,
        "math": math,
        "__builtins__": SAFE_BUILTINS,
    }
    if _TA_AVAILABLE:
        import ta as ta_mod
        safe_globals["ta"] = ta_mod

    exec(compile(code_string, "<strategy>", "exec"), safe_globals)

    evaluate = safe_globals.get("evaluate")
    if not callable(evaluate):
        raise ValueError("Code did not define a callable 'evaluate' after execution.")

    result = evaluate(market_data_df)

    if result is None:
        return "HOLD"
    if isinstance(result, str):
        s = result.upper().strip()
        if s in ("BUY", "SELL", "HOLD"):
            return s
        return "HOLD"
    if isinstance(result, (int, float)):
        if result > 0:
            return "BUY"
        if result < 0:
            return "SELL"
        return "HOLD"
    return "HOLD"
