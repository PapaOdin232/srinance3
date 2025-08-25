import time
import hmac
import hashlib
import logging
import requests
import threading
import websocket
import json
from datetime import datetime, timedelta

from urllib.parse import urlencode
from backend.config import BINANCE_API_URL

# Module logger
logger = logging.getLogger(__name__)


class BinanceRESTClient:
    def __init__(self):
        from backend.config import BINANCE_API_KEY, BINANCE_API_SECRET
        self.api_key = BINANCE_API_KEY
        self.api_secret = BINANCE_API_SECRET
        self.base_url = BINANCE_API_URL
        # Cache for exchange info (updates rarely)
        self._exchange_info_cache = None
        self._exchange_info_cache_time = None
        self._exchange_info_cache_ttl = 3600  # 1 hour TTL
        # Short cache for 24hr ticker (all symbols) to cut bandwidth
        self._ticker24_all_cache = None
        self._ticker24_all_cache_time = None
        self._ticker24_all_cache_ttl = 5  # 5 seconds TTL

        def _mask(s: str, show: int = 4):
            if not s:
                return "(empty)"
            if len(s) <= show * 2:
                return s[0] + "***" + s[-1]
            return s[:show] + "***" + s[-show:]

        # Use module logger instead of print
        logger = logging.getLogger(__name__)
        logger.debug("[BinanceRESTClient] BINANCE_API_KEY: %s", _mask(self.api_key))
        logger.debug("[BinanceRESTClient] BINANCE_API_SECRET: %s", _mask(self.api_secret))

    def get_orderbook(self, symbol, limit=10):
        endpoint = "/v3/depth"
        params = {"symbol": symbol.upper(), "limit": limit}
        url = f"{self.base_url}{endpoint}?{urlencode(params)}"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return resp.json()

    # --- User Data Stream (listenKey) management ---
    def start_user_data_stream(self):
        """Start a new user data stream and return listenKey"""
        endpoint = "/v3/userDataStream"
        url = f"{self.base_url}{endpoint}"
        resp = requests.post(url, headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return resp.json()  # {"listenKey": "..."}

    def keepalive_user_data_stream(self, listen_key: str):
        """Ping/keepalive existing user data stream"""
        endpoint = "/v3/userDataStream"
        params = {"listenKey": listen_key}
        url = f"{self.base_url}{endpoint}?{urlencode(params)}"
        resp = requests.put(url, headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return True

    def close_user_data_stream(self, listen_key: str):
        """Close user data stream"""
        endpoint = "/v3/userDataStream"
        params = {"listenKey": listen_key}
        url = f"{self.base_url}{endpoint}?{urlencode(params)}"
        resp = requests.delete(url, headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return True

    def _sign(self, params):
        query_string = urlencode(params)
        # Generate signature but do NOT log full query_string or signature to avoid leaking secrets
        signature = hmac.new(self.api_secret.encode('utf-8'), query_string.encode('utf-8'), hashlib.sha256).hexdigest()
        logger = logging.getLogger(__name__)
        # Log only the parameter keys and length of signature (no sensitive values)
        try:
            logger.debug("Signing params keys: %s", list(params.keys()))
        except Exception:
            # Avoid any logging failure impacting signing
            pass
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

    def get_exchange_info(self):
        """Get exchange info with caching to reduce API calls"""
        now = datetime.now()

        # Check if cache is valid
        if (
            self._exchange_info_cache
            and self._exchange_info_cache_time
            and now - self._exchange_info_cache_time < timedelta(seconds=self._exchange_info_cache_ttl)
        ):
            logger.debug("Using cached exchange info")
            return self._exchange_info_cache

        # Fetch new data
        endpoint = "/v3/exchangeInfo"
        url = f"{self.base_url}{endpoint}"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()

        # Update cache
        self._exchange_info_cache = resp.json()
        self._exchange_info_cache_time = now
        logger.debug("Fetched and cached new exchange info")

        return self._exchange_info_cache

    def get_ticker_24hr_all(self):
        """Get 24hr ticker for all symbols with short-lived caching"""
        now = datetime.now()
        if (
            self._ticker24_all_cache is not None and
            self._ticker24_all_cache_time is not None and
            (now - self._ticker24_all_cache_time) < timedelta(seconds=self._ticker24_all_cache_ttl)
        ):
            return self._ticker24_all_cache

        endpoint = "/v3/ticker/24hr"
        url = f"{self.base_url}{endpoint}"
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        self._ticker24_all_cache = data
        self._ticker24_all_cache_time = now
        return data

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
        logger = logging.getLogger(__name__)
        logger.debug("get_account_trades url: %s", url)
        # Do not log headers content (may contain api key)
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
        logger = logging.getLogger(__name__)
        logger.debug("get_open_orders url constructed")
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
        logger = logging.getLogger(__name__)
        logger.debug("get_all_orders url constructed for symbol=%s limit=%s", symbol, limit)
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
        logger = logging.getLogger(__name__)
        logger.debug("get_order_status request for symbol=%s", symbol)
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

        # Sign and send request for any order type
        params = self._sign(params)
        url = f"{self.base_url}{endpoint}"
        logger = logging.getLogger(__name__)
        logger.debug("Placing order: symbol=%s side=%s type=%s", symbol, side, order_type)
        # Do NOT log params (they contain signature and possibly sensitive info)
        resp = requests.post(url, data=params, headers=self._headers(), timeout=10)
        if resp.status_code >= 400:
            # Try to parse error body to include code/msg from Binance
            err_payload = None
            try:
                err_payload = resp.json()
            except Exception:
                err_payload = {'raw': resp.text[:500]}
            logger.error("place_order HTTP %s body=%s", resp.status_code, str(err_payload)[:500])
            # Raise to let async layer handle the error
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
        logger = logging.getLogger(__name__)
        logger.debug("Testing order: symbol=%s side=%s type=%s", symbol, side, order_type)
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
        logger = logging.getLogger(__name__)
        logger.debug("Cancel order requested for symbol=%s", symbol)
        # Do not log params which include signature
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
            logger.debug("WS MESSAGE: %s", data)

    def on_error(self, ws, error):
        logger.error("WS ERROR: %s", error)

    def on_close(self, ws, close_status_code, close_msg):
        logger.info("WS CLOSED: code=%s msg=%s", close_status_code, close_msg)
        if self.should_reconnect:
            logger.info("Reconnecting websocket")
            self.connect()

    def on_open(self, ws):
        logger.info("WS OPENED")

    def connect(self):
        self.threads = []
        self.ws_apps = []
        if self.env == "testnet":
            # Testnet: osobne połączenie dla każdego streamu
            for stream in self.streams:
                url = f"{self.ws_url}/ws/{stream}"
                logger.debug("[BinanceWebSocketClient] Testnet: connecting to %s", url)
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
            logger.debug("[BinanceWebSocketClient] Prod: connecting to %s", url)
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
        # Placeholder for any async init work (e.g., connect WS client)
        try:
            logger.debug("[DEBUG] BinanceClient initialized")
        except Exception:
            # Logging should not break initialization
            pass
        return True

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
            logger.error("[ERROR] get_ticker failed for %s: %s", symbol, e)
            return None

    async def get_ticker_24hr(self, symbol):
        """Async wrapper for get_ticker_24hr with changePercent data"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().get_ticker_24hr, symbol)
            return result
        except Exception as e:
            logger.error("[ERROR] get_ticker_24hr failed for %s: %s", symbol, e)
            return None

    async def get_exchange_info_async(self):
        """Async wrapper for get_exchange_info"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().get_exchange_info)
            return result
        except Exception as e:
            logger.error("[ERROR] get_exchange_info failed: %s", e)
            return None

    async def get_ticker_24hr_all_async(self):
        """Async wrapper for get_ticker_24hr_all"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().get_ticker_24hr_all)
            return result
        except Exception as e:
            logger.error("[ERROR] get_ticker_24hr_all failed: %s", e)
            return None

    async def get_order_book(self, symbol, limit=20):
        """Async wrapper for get_orderbook using thread executor"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().get_orderbook, symbol, limit)
            return result
        except Exception as e:
            logger.error("[ERROR] get_order_book failed for %s: %s", symbol, e)
            return None

    async def get_account_info_async(self):
        """Async wrapper for get_account_info"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().get_account_info)
            return result
        except Exception as e:
            logger.error("[ERROR] get_account_info failed: %s", e)
            return None

    async def get_open_orders_async(self, symbol=None):
        """Async wrapper for get_open_orders"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().get_open_orders, symbol)
            return result
        except Exception as e:
            logger.error("[ERROR] get_open_orders failed for %s: %s", symbol, e)
            return None

    async def get_all_orders_async(self, symbol, limit=500, order_id=None, start_time=None, end_time=None):
        """Async wrapper for get_all_orders"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().get_all_orders, symbol, limit, order_id, start_time, end_time)
            return result
        except Exception as e:
            logger.error("[ERROR] get_all_orders failed for %s: %s", symbol, e)
            return None

    async def get_order_status_async(self, symbol, order_id=None, orig_client_order_id=None):
        """Async wrapper for get_order_status"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().get_order_status, symbol, order_id, orig_client_order_id)
            return result
        except Exception as e:
            logger.error("[ERROR] get_order_status failed for %s, orderId: %s: %s", symbol, order_id, e)
            return None

    async def place_order_async(self, symbol, side, order_type, quantity, price=None, time_in_force="GTC"):
        """Async wrapper for place_order"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().place_order, symbol, side, order_type, quantity, price, time_in_force)
            return result
        except Exception as e:
            # Spróbuj wyciągnąć szczegóły HTTPError (code/msg Binance)
            detail = {'error': str(e)}
            try:
                import requests
                if isinstance(e, requests.HTTPError) and e.response is not None:
                    try:
                        j = e.response.json()
                        if isinstance(j, dict):
                            # Rozszerz szczegóły błędu
                            detail['binanceCode'] = str(j.get('code')) if 'code' in j else None  # type: ignore
                            detail['binanceMsg'] = str(j.get('msg')) if 'msg' in j else None  # type: ignore
                            detail['httpStatus'] = str(e.response.status_code)  # type: ignore
                    except Exception:
                        detail['responseText'] = e.response.text[:500]
            except Exception as ex:
                logging.getLogger(__name__).warning(f"Failed to extract response details from order error: {ex}")
            logger.error("[ERROR] place_order failed for %s: %s", symbol, detail)
            return detail

    async def test_order_async(self, symbol, side, order_type, quantity, price=None, time_in_force="GTC"):
        """Async wrapper for test_order"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().test_order, symbol, side, order_type, quantity, price, time_in_force)
            return result
        except Exception as e:
            logger.error("[ERROR] test_order failed for %s: %s", symbol, e)
            return None

    async def cancel_order_async(self, symbol, order_id=None, orig_client_order_id=None):
        """Async wrapper for cancel_order"""
        import asyncio
        try:
            result = await asyncio.to_thread(super().cancel_order, symbol, order_id, orig_client_order_id)
            return result
        except Exception as e:
            logger.error("[ERROR] cancel_order failed for %s, orderId: %s: %s", symbol, order_id, e)
            return None

    # --- Async wrappers for user data stream ---
    async def start_user_data_stream_async(self):
        import asyncio
        try:
            result = await asyncio.to_thread(super().start_user_data_stream)
            return result
        except Exception as e:
            logger.error("[ERROR] start_user_data_stream failed: %s", e)
            return None

    async def keepalive_user_data_stream_async(self, listen_key: str):
        import asyncio
        try:
            await asyncio.to_thread(super().keepalive_user_data_stream, listen_key)
            return True
        except Exception as e:
            logger.error("[ERROR] keepalive_user_data_stream failed: %s", e)
            return False

    async def close_user_data_stream_async(self, listen_key: str):
        import asyncio
        try:
            await asyncio.to_thread(super().close_user_data_stream, listen_key)
            return True
        except Exception as e:
            logger.error("[ERROR] close_user_data_stream failed: %s", e)
            return False
