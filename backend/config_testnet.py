import os

BINANCE_API_KEY = os.getenv("BINANCE_API_KEY", "")
BINANCE_API_SECRET = os.getenv("BINANCE_API_SECRET", "")
ENV = os.getenv("ENV", "development")
BINANCE_ENV = os.getenv("BINANCE_ENV", "testnet")

# Testnet endpointy Binance
BINANCE_API_URL = "https://testnet.binance.vision/api"
BINANCE_WS_URL = "wss://stream.testnet.binance.vision"
BINANCE_WS_API_URL = "wss://ws-api.testnet.binance.vision/ws-api/v3"

# WebSocket API feature flags
ENABLE_WS_API = os.getenv("ENABLE_WS_API", "true").lower() in ("true", "1", "yes")
WS_API_PRIMARY = os.getenv("WS_API_PRIMARY", "false").lower() in ("true", "1", "yes")
WS_API_TIMEOUT = float(os.getenv("WS_API_TIMEOUT", "5.0"))
WS_API_MAX_RETRIES = int(os.getenv("WS_API_MAX_RETRIES", "3"))
