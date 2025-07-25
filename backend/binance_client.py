import time
import hmac
import hashlib
import requests
import threading
import websocket
import json

from urllib.parse import urlencode
from backend.config import BINANCE_API_URL, BINANCE_WS_URL

class BinanceRESTClient:
    def __init__(self):
        from backend.config import BINANCE_API_KEY, BINANCE_API_SECRET
        self.api_key = BINANCE_API_KEY
        self.api_secret = BINANCE_API_SECRET
        self.base_url = BINANCE_API_URL
        print("[DEBUG][BinanceRESTClient] BINANCE_API_KEY:", self.api_key)
        print("[DEBUG][BinanceRESTClient] BINANCE_API_SECRET:", self.api_secret)

    def get_orderbook(self, symbol, limit=10):
        endpoint = "/v3/depth"
        params = {"symbol": symbol.upper(), "limit": limit}
        url = f"{self.base_url}{endpoint}?{urlencode(params)}"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def _sign(self, params):
        query_string = urlencode(params)
        signature = hmac.new(self.api_secret.encode('utf-8'), query_string.encode('utf-8'), hashlib.sha256).hexdigest()
        print(f"[DEBUG] query_string: {query_string}")
        print(f"[DEBUG] signature: {signature}")
        params['signature'] = signature
        return params

    def _headers(self):
        return {"X-MBX-APIKEY": self.api_key}

    def get_account_info(self):
        endpoint = "/v3/account"
        params = {"timestamp": int(time.time() * 1000)}
        params = self._sign(params)
        url = f"{self.base_url}{endpoint}?{urlencode(params)}"
        resp = requests.get(url, headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return resp.json()

    def get_ticker(self, symbol):
        endpoint = "/v3/ticker/price"
        params = {"symbol": symbol.upper()}
        url = f"{self.base_url}{endpoint}?{urlencode(params)}"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def get_klines(self, symbol, interval="1m", limit=100):
        """Get klines/candlestick data for a symbol"""
        endpoint = "/v3/klines"
        params = {
            "symbol": symbol.upper(),
            "interval": interval,
            "limit": limit
        }
        url = f"{self.base_url}{endpoint}?{urlencode(params)}"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json()

    def get_account_trades(self, symbol):
        endpoint = "/v3/myTrades"
        params = {"symbol": symbol.upper(), "timestamp": int(time.time() * 1000)}
        params = self._sign(params)
        url = f"{self.base_url}{endpoint}?{urlencode(params)}"
        print(f"[DEBUG] url: {url}")
        print(f"[DEBUG] headers: {self._headers()}")
        resp = requests.get(url, headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return resp.json()

    def get_balance(self, asset):
        account = self.get_account_info()
        for bal in account.get("balances", []):
            if bal["asset"].upper() == asset.upper():
                return bal
        return {"asset": asset.upper(), "free": "0", "locked": "0"}

class BinanceWebSocketClient:
    def __init__(self, streams, queues=None, main_loop=None):
        from .config import BINANCE_WS_URL, BINANCE_ENV
        self.ws_url = BINANCE_WS_URL.rstrip('/')
        self.env = BINANCE_ENV
        self.streams = streams
        self.should_reconnect = True
        self.threads = []
        self.ws_apps = []
        self.queues = queues if queues is not None else []  # Lista kolejek do forwardowania wiadomości
        self.main_loop = main_loop

    def on_message(self, ws, message):
        # Forward do wszystkich kolejek jeśli dostępne
        if self.queues and self.main_loop:
            for queue in self.queues:
                if queue:
                    self.main_loop.call_soon_threadsafe(queue.put_nowait, message)
        else:
            data = json.loads(message)
            print("WS MESSAGE:", data)

    def on_error(self, ws, error):
        print("WS ERROR:", error)

    def on_close(self, ws, close_status_code, close_msg):
        print("WS CLOSED")
        if self.should_reconnect:
            print("Reconnecting...")
            self.connect()

    def on_open(self, ws):
        print("WS OPENED")

    def connect(self):
        self.threads = []
        self.ws_apps = []
        if self.env == "testnet":
            # Testnet: osobne połączenie dla każdego streamu
            for stream in self.streams:
                url = f"{self.ws_url}/ws/{stream}"
                print(f"[BinanceWebSocketClient] Testnet: connecting to {url}")
                ws_app = websocket.WebSocketApp(
                    url,
                    on_message=self.on_message,
                    on_error=self.on_error,
                    on_close=self.on_close,
                    on_open=self.on_open
                )
                thread = threading.Thread(target=ws_app.run_forever)
                thread.daemon = True
                thread.start()
                self.threads.append(thread)
                self.ws_apps.append(ws_app)
        else:
            # Produkcja: jedno połączenie multi-stream
            url = f"{self.ws_url}/stream?streams={'/'.join(self.streams)}"
            print(f"[BinanceWebSocketClient] Prod: connecting to {url}")
            ws_app = websocket.WebSocketApp(
                url,
                on_message=self.on_message,
                on_error=self.on_error,
                on_close=self.on_close,
                on_open=self.on_open
            )
            thread = threading.Thread(target=ws_app.run_forever)
            thread.daemon = True
            thread.start()
            self.threads.append(thread)
            self.ws_apps.append(ws_app)

    def close(self):
        self.should_reconnect = False
        for ws in self.ws_apps:
            ws.close()


class BinanceClient(BinanceRESTClient):
    """Enhanced Binance client with both REST and WebSocket support."""
    
    def __init__(self):
        super().__init__()
        self.ws_client = None
    
    async def initialize(self):
        """Initialize the client (placeholder for async initialization)"""
        print("[DEBUG] BinanceClient initialized")
    
    async def close(self):
        """Close the client and clean up resources"""
        if self.ws_client:
            self.ws_client.close()
    
    async def get_ticker(self, symbol):
        """Async wrapper for get_ticker using thread executor"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().get_ticker, symbol)
            return result
        except Exception as e:
            print(f"[ERROR] get_ticker failed for {symbol}: {e}")
            return None

    async def get_order_book(self, symbol, limit=20):
        """Async wrapper for get_orderbook using thread executor"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().get_orderbook, symbol, limit)
            return result
        except Exception as e:
            print(f"[ERROR] get_order_book failed for {symbol}: {e}")
            return None

    async def get_account_info_async(self):
        """Async wrapper for get_account_info"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().get_account_info)
            return result
        except Exception as e:
            print(f"[ERROR] get_account_info failed: {e}")
            return None
