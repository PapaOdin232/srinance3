import os
import time
import hmac
import hashlib
import requests
import threading
import websocket
import json
from urllib.parse import urlencode
from backend.config import BINANCE_API_KEY, BINANCE_API_SECRET, BINANCE_API_URL, BINANCE_WS_URL

class BinanceRESTClient:
    def get_orderbook(self, symbol, limit=10):
        endpoint = "/v3/depth"
        params = {"symbol": symbol.upper(), "limit": limit}
        url = f"{self.base_url}{endpoint}?{urlencode(params)}"
        resp = requests.get(url)
        resp.raise_for_status()
        return resp.json()
    def __init__(self):
        self.api_key = BINANCE_API_KEY
        self.api_secret = BINANCE_API_SECRET
        self.base_url = BINANCE_API_URL

    def _sign(self, params):
        query_string = urlencode(params)
        signature = hmac.new(self.api_secret.encode('utf-8'), query_string.encode('utf-8'), hashlib.sha256).hexdigest()
        params['signature'] = signature
        return params

    def _headers(self):
        return {"X-MBX-APIKEY": self.api_key}

    def get_account_info(self):
        endpoint = "/v3/account"
        params = {"timestamp": int(time.time() * 1000)}
        params = self._sign(params)
        url = f"{self.base_url}{endpoint}?{urlencode(params)}"
        resp = requests.get(url, headers=self._headers())
        resp.raise_for_status()
        return resp.json()

    def get_ticker(self, symbol):
        endpoint = "/v3/ticker/price"
        params = {"symbol": symbol.upper()}
        url = f"{self.base_url}{endpoint}?{urlencode(params)}"
        resp = requests.get(url)
        resp.raise_for_status()
        return resp.json()

    def get_account_trades(self, symbol):
        endpoint = "/v3/myTrades"
        params = {"symbol": symbol.upper(), "timestamp": int(time.time() * 1000)}
        params = self._sign(params)
        url = f"{self.base_url}{endpoint}?{urlencode(params)}"
        resp = requests.get(url, headers=self._headers())
        resp.raise_for_status()
        return resp.json()

    def get_balance(self, asset):
        account = self.get_account_info()
        for bal in account.get("balances", []):
            if bal["asset"].upper() == asset.upper():
                return bal
        return {"asset": asset.upper(), "free": "0", "locked": "0"}

class BinanceWebSocketClient:
    def __init__(self, streams):
        self.ws_url = BINANCE_WS_URL
        self.streams = streams
        self.ws = None
        self.thread = None
        self.should_reconnect = True

    def on_message(self, ws, message):
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
        url = f"{self.ws_url}/stream?streams={'/'.join(self.streams)}"
        self.ws = websocket.WebSocketApp(
            url,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close,
            on_open=self.on_open
        )
        self.thread = threading.Thread(target=self.ws.run_forever)
        self.thread.start()

    def close(self):
        self.should_reconnect = False
        if self.ws:
            self.ws.close()
