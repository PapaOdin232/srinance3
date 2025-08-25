
import os
from dotenv import load_dotenv
from typing import TYPE_CHECKING

# Load .env into the environment before reading variables
load_dotenv()

# Base defaults from environment
BINANCE_API_KEY = os.getenv("BINANCE_API_KEY", "")
BINANCE_API_SECRET = os.getenv("BINANCE_API_SECRET", "")
ENV = os.getenv("ENV", "development")
BINANCE_ENV = os.getenv("BINANCE_ENV", "testnet")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "example_admin_token")

# Dynamically import env-specific config module to avoid module-level imports after code
import importlib

def _load_env_config():
    """Dynamically import the environment-specific config module and copy UPPERCASE constants.

    Using importlib avoids static `from ... import ...` after executable code which triggers
    flake8 E402. This preserves behavior while keeping imports non-top-level.
    """
    module_name = "backend.config_prod" if BINANCE_ENV == "prod" else "backend.config_testnet"
    _env_conf = importlib.import_module(module_name)
    for _name in dir(_env_conf):
        if _name.isupper():
            globals()[_name] = getattr(_env_conf, _name)

# Load env-specific constants now
_load_env_config()

# Make Pylance aware of dynamically-populated symbols without changing runtime behavior.
# These imports exist only for type checkers; at runtime they are not executed, and values
# are populated by _load_env_config() above.
if TYPE_CHECKING:  # pragma: no cover - type checking aid only
    from backend.config_prod import (
        BINANCE_API_URL as BINANCE_API_URL,
        BINANCE_WS_URL as BINANCE_WS_URL,
        BINANCE_WS_API_URL as BINANCE_WS_API_URL,
        ENABLE_WS_API as ENABLE_WS_API,
        WS_API_TIMEOUT as WS_API_TIMEOUT,
        WS_API_MAX_RETRIES as WS_API_MAX_RETRIES,
        WS_API_PRIMARY as WS_API_PRIMARY,
    )

# Optional: declare public API for static analyzers
__all__ = [
    "BINANCE_API_KEY",
    "BINANCE_API_SECRET",
    "ENV",
    "BINANCE_ENV",
    "ADMIN_TOKEN",
    # dynamically populated constants below
    "BINANCE_API_URL",
    "BINANCE_WS_URL",
    "BINANCE_WS_API_URL",
    "ENABLE_WS_API",
    "WS_API_TIMEOUT",
    "WS_API_MAX_RETRIES",
    "WS_API_PRIMARY",
]

# Provide safe module-level defaults so static analyzers (and imports) see these names.
# They are immediately overwritten by _load_env_config() during import.
BINANCE_API_URL: str = globals().get("BINANCE_API_URL", "")
BINANCE_WS_URL: str = globals().get("BINANCE_WS_URL", "")
BINANCE_WS_API_URL: str = globals().get("BINANCE_WS_API_URL", "")
ENABLE_WS_API: bool = globals().get("ENABLE_WS_API", False)
WS_API_TIMEOUT: float = float(globals().get("WS_API_TIMEOUT", 5.0))
WS_API_MAX_RETRIES: int = int(globals().get("WS_API_MAX_RETRIES", 3))
WS_API_PRIMARY: bool = globals().get("WS_API_PRIMARY", False)
