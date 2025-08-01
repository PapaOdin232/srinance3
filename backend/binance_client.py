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
    
    def get_ticker_24hr(self, symbol):
        """Get 24hr ticker price change statistics including changePercent"""
        endpoint = "/v3/ticker/24hr"
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

    def get_open_orders(self, symbol=None):
        """Get current open orders for a symbol or all symbols"""
        endpoint = "/v3/openOrders"
        params = {"timestamp": int(time.time() * 1000)}
        if symbol:
            params["symbol"] = symbol.upper()
        params = self._sign(params)
        url = f"{self.base_url}{endpoint}?{urlencode(params)}"
        print(f"[DEBUG] get_open_orders url: {url}")
        resp = requests.get(url, headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return resp.json()

    def get_all_orders(self, symbol, limit=500, order_id=None, start_time=None, end_time=None):
        """Get all orders history for a symbol"""
        endpoint = "/v3/allOrders"
        params = {
            "symbol": symbol.upper(),
            "timestamp": int(time.time() * 1000),
            "limit": min(limit, 1000)  # Max 1000 according to API docs
        }
        if order_id:
            params["orderId"] = order_id
        if start_time:
            params["startTime"] = start_time
        if end_time:
            params["endTime"] = end_time
        params = self._sign(params)
        url = f"{self.base_url}{endpoint}?{urlencode(params)}"
        print(f"[DEBUG] get_all_orders url: {url}")
        resp = requests.get(url, headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return resp.json()

    def get_order_status(self, symbol, order_id=None, orig_client_order_id=None):
        """Get specific order status by orderId or origClientOrderId"""
        endpoint = "/v3/order"
        params = {
            "symbol": symbol.upper(),
            "timestamp": int(time.time() * 1000)
        }
        if order_id:
            params["orderId"] = order_id
        elif orig_client_order_id:
            params["origClientOrderId"] = orig_client_order_id
        else:
            raise ValueError("Either orderId or origClientOrderId must be provided")
        
        params = self._sign(params)
        url = f"{self.base_url}{endpoint}?{urlencode(params)}"
        print(f"[DEBUG] get_order_status url: {url}")
        resp = requests.get(url, headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return resp.json()

    def place_order(self, symbol, side, order_type, quantity, price=None, time_in_force="GTC"):
        """Place a new order on Binance
        
        Args:
            symbol: Trading pair (e.g., 'BTCUSDT')
            side: 'BUY' or 'SELL'
            order_type: 'MARKET', 'LIMIT', 'STOP_LOSS', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT', 'TAKE_PROFIT_LIMIT'
            quantity: Quantity to buy/sell
            price: Price for LIMIT orders (required for LIMIT, STOP_LOSS_LIMIT, TAKE_PROFIT_LIMIT)
            time_in_force: 'GTC', 'IOC', 'FOK' (default: 'GTC')
        """
        endpoint = "/v3/order"
        params = {
            "symbol": symbol.upper(),
            "side": side.upper(),
            "type": order_type.upper(),
            "quantity": str(quantity),
            "timestamp": int(time.time() * 1000)
        }
        
        # Add price for LIMIT orders
        if order_type.upper() in ['LIMIT', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT_LIMIT']:
            if price is None:
                raise ValueError(f"Price is required for {order_type} orders")
            params["price"] = str(price)
            params["timeInForce"] = time_in_force.upper()
        
        params = self._sign(params)
        url = f"{self.base_url}{endpoint}"
        print(f"[DEBUG] place_order url: {url}")
        print(f"[DEBUG] place_order params: {params}")
        resp = requests.post(url, data=params, headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return resp.json()

    def test_order(self, symbol, side, order_type, quantity, price=None, time_in_force="GTC"):
        """Test a new order (same as place_order but doesn't execute)
        
        Args:
            symbol: Trading pair (e.g., 'BTCUSDT')
            side: 'BUY' or 'SELL'
            order_type: 'MARKET', 'LIMIT', 'STOP_LOSS', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT', 'TAKE_PROFIT_LIMIT'
            quantity: Quantity to buy/sell
            price: Price for LIMIT orders (required for LIMIT, STOP_LOSS_LIMIT, TAKE_PROFIT_LIMIT)
            time_in_force: 'GTC', 'IOC', 'FOK' (default: 'GTC')
        """
        endpoint = "/v3/order/test"
        params = {
            "symbol": symbol.upper(),
            "side": side.upper(),
            "type": order_type.upper(),
            "quantity": str(quantity),
            "timestamp": int(time.time() * 1000)
        }
        
        # Add price for LIMIT orders
        if order_type.upper() in ['LIMIT', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT_LIMIT']:
            if price is None:
                raise ValueError(f"Price is required for {order_type} orders")
            params["price"] = str(price)
            params["timeInForce"] = time_in_force.upper()
        
        params = self._sign(params)
        url = f"{self.base_url}{endpoint}"
        print(f"[DEBUG] test_order url: {url}")
        print(f"[DEBUG] test_order params: {params}")
        resp = requests.post(url, data=params, headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return resp.json()

    def cancel_order(self, symbol, order_id=None, orig_client_order_id=None):
        """Cancel an active order
        
        Args:
            symbol: Trading pair (e.g., 'BTCUSDT')
            order_id: Order ID to cancel (either this or orig_client_order_id is required)
            orig_client_order_id: Client Order ID to cancel
        """
        endpoint = "/v3/order"
        params = {
            "symbol": symbol.upper(),
            "timestamp": int(time.time() * 1000)
        }
        
        if order_id:
            params["orderId"] = order_id
        elif orig_client_order_id:
            params["origClientOrderId"] = orig_client_order_id
        else:
            raise ValueError("Either orderId or origClientOrderId must be provided")
        
        params = self._sign(params)
        url = f"{self.base_url}{endpoint}"
        print(f"[DEBUG] cancel_order url: {url}")
        print(f"[DEBUG] cancel_order params: {params}")
        resp = requests.delete(url, data=params, headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return resp.json()

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
    
    async def get_ticker_24hr(self, symbol):
        """Async wrapper for get_ticker_24hr with changePercent data"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().get_ticker_24hr, symbol)
            return result
        except Exception as e:
            print(f"[ERROR] get_ticker_24hr failed for {symbol}: {e}")
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

    async def get_open_orders_async(self, symbol=None):
        """Async wrapper for get_open_orders"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().get_open_orders, symbol)
            return result
        except Exception as e:
            print(f"[ERROR] get_open_orders failed for {symbol}: {e}")
            return None

    async def get_all_orders_async(self, symbol, limit=500, order_id=None, start_time=None, end_time=None):
        """Async wrapper for get_all_orders"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().get_all_orders, symbol, limit, order_id, start_time, end_time)
            return result
        except Exception as e:
            print(f"[ERROR] get_all_orders failed for {symbol}: {e}")
            return None

    async def get_order_status_async(self, symbol, order_id=None, orig_client_order_id=None):
        """Async wrapper for get_order_status"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().get_order_status, symbol, order_id, orig_client_order_id)
            return result
        except Exception as e:
            print(f"[ERROR] get_order_status failed for {symbol}, orderId: {order_id}: {e}")
            return None

    async def place_order_async(self, symbol, side, order_type, quantity, price=None, time_in_force="GTC"):
        """Async wrapper for place_order"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().place_order, symbol, side, order_type, quantity, price, time_in_force)
            return result
        except Exception as e:
            print(f"[ERROR] place_order failed for {symbol}: {e}")
            return None

    async def test_order_async(self, symbol, side, order_type, quantity, price=None, time_in_force="GTC"):
        """Async wrapper for test_order"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().test_order, symbol, side, order_type, quantity, price, time_in_force)
            return result
        except Exception as e:
            print(f"[ERROR] test_order failed for {symbol}: {e}")
            return None

    async def cancel_order_async(self, symbol, order_id=None, orig_client_order_id=None):
        """Async wrapper for cancel_order"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().cancel_order, symbol, order_id, orig_client_order_id)
            return result
        except Exception as e:
            print(f"[ERROR] cancel_order failed for {symbol}, orderId: {order_id}: {e}")
            return None
