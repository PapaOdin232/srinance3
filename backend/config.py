
from dotenv import load_dotenv
load_dotenv()
import os


BINANCE_API_KEY = os.getenv("BINANCE_API_KEY", "")
BINANCE_API_SECRET = os.getenv("BINANCE_API_SECRET", "")
ENV = os.getenv("ENV", "development")
BINANCE_ENV = os.getenv("BINANCE_ENV", "testnet")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "example_admin_token")

if BINANCE_ENV == "prod":
    from .config_prod import *
else:
    from .config_testnet import *
