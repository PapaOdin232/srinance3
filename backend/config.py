
import os
from dotenv import load_dotenv

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
