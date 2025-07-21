import os

BINANCE_API_KEY = os.getenv("BINANCE_API_KEY", "")
BINANCE_API_SECRET = os.getenv("BINANCE_API_SECRET", "")
ENV = os.getenv("ENV", "development")
BINANCE_ENV = os.getenv("BINANCE_ENV", "testnet")

# Testnet endpointy Binance
BINANCE_API_URL = "https://testnet.binance.vision/api"
BINANCE_WS_URL = "wss://stream.testnet.binance.vision"
