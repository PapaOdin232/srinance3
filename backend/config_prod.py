import os

BINANCE_API_KEY = os.getenv("BINANCE_API_KEY", "")
BINANCE_API_SECRET = os.getenv("BINANCE_API_SECRET", "")
ENV = os.getenv("ENV", "production")
BINANCE_ENV = os.getenv("BINANCE_ENV", "prod")

# Produkcyjne endpointy Binance
BINANCE_API_URL = "https://api.binance.com/api"
BINANCE_WS_URL = "wss://stream.binance.com:9443"
