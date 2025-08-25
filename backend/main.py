import asyncio
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
import uvicorn
import os
import json
import websockets

from backend.binance_client import BinanceClient, BinanceWebSocketClient
from backend.ws_api_client import BinanceWSApiClient
from backend.market_data_manager import MarketDataManager
from backend.database.init_db import init_db
from backend.bot.trading_bot import TradingBot

# Ensure database directory exists
os.makedirs('database', exist_ok=True)

# Setup logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('database/app.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("srinance3")
 

# === User stream state variables (ensure defined before usage) ===
_user_stream_event_queue: asyncio.Queue = asyncio.Queue(maxsize=1000)
_order_store_broadcast_queue: asyncio.Queue = asyncio.Queue(maxsize=200)
_user_stream_listen_key: str | None = None
_user_stream_last_keepalive: float | None = None
_user_stream_last_event_time: float | None = None
_user_stream_keepalive_errors = 0
_user_stream_restarts = 0
_user_stream_connection_errors = 0
_user_stream_keepalive_task: asyncio.Task | None = None
_user_stream_listener_task: asyncio.Task | None = None
_user_stream_processor_task: asyncio.Task | None = None
_user_heartbeat_task: asyncio.Task | None = None
_user_watchdog_task: asyncio.Task | None = None

# Keepalive interval constant (seconds)
_USER_STREAM_KEEPALIVE_INTERVAL = 30 * 60  # 30 minutes default per Binance docs

# Placeholder globals for objects initialized later
binance_client: BinanceClient | None = None
binance_ws_client: BinanceWebSocketClient | None = None
market_data_manager: MarketDataManager | None = None
trading_bot: TradingBot | None = None
binance_ws_api_client: BinanceWSApiClient | None = None
market_data_queue = None
 

# ===== ORDER STORE (Phase 3) =====


class OrderStore:
    def __init__(self):
        self.orders: Dict[int, dict] = {}
        self.open_orders: set[int] = set()
        self.balances: Dict[str, dict] = {}
        self._lock = asyncio.Lock()
        # Optional mapping for OCO lists
        self.oco_lists: Dict[int, dict] = {}
        # History (final statuses)
        from collections import deque
        self._history_max = 200
        self._history = deque(maxlen=self._history_max)
        self._final_statuses = {"FILLED", "CANCELED", "REJECTED", "EXPIRED"}

    @staticmethod
    def _map_status(raw_status: Optional[str]) -> Optional[str]:
        if not raw_status:
            return raw_status
        mapping = {
            'NEW': 'NEW',
            'PARTIALLY_FILLED': 'PARTIALLY_FILLED',
            'FILLED': 'FILLED',
            'CANCELED': 'CANCELED',
            'CANCELLED': 'CANCELED',  # just in case
            'REJECTED': 'REJECTED',
            'EXPIRED': 'EXPIRED'
        }
        return mapping.get(raw_status, raw_status)


    async def apply_execution_report(self, rep: dict):
        async with self._lock:
            oid = rep.get('orderId') or rep.get('orderId'.lower()) or rep.get('i')
            if oid is None:
                return
            existing = self.orders.get(oid, {})
            status_raw = rep.get('status') or rep.get('X')
            status = self._map_status(status_raw)
            # numeric conversions

            def _to_decimal(val):
                try:
                    return float(val)
                except Exception:
                    return 0.0
            last_qty = _to_decimal(rep.get('lastQty') or rep.get('l'))
            last_price = _to_decimal(rep.get('lastPrice') or rep.get('L'))
            cum_qty = _to_decimal(rep.get('cumQty') or rep.get('z'))
            cum_quote = _to_decimal(rep.get('cumQuote') or rep.get('Z'))
            fee = rep.get('commission') or rep.get('n')
            fee_asset = rep.get('commissionAsset') or rep.get('N')

            # Initialize order structure if new
            if not existing:
                existing = {
                    'orderId': oid,
                    'clientOrderId': rep.get('clientOrderId') or rep.get('c'),
                    'symbol': (rep.get('symbol') or rep.get('s') or '').upper(),
                    'side': rep.get('side') or rep.get('S'),
                    'type': rep.get('orderType') or rep.get('o'),
                    'timeInForce': rep.get('timeInForce') or rep.get('f'),
                    'price': rep.get('price') or rep.get('p') or rep.get('stopPrice') or rep.get('P') or '0',
                    'origQty': rep.get('origQty') or rep.get('q') or '0',
                    'executedQty': '0',
                    'cummulativeQuoteQty': '0',
                    'avgPrice': '0',
                    'fills': [],
                    'status': status,
                    'updateTime': rep.get('E') or rep.get('eventTime'),
                }

            # Detect fill event
            exec_type = rep.get('execType') or rep.get('x')
            if exec_type == 'TRADE' and last_qty > 0:
                # compute quote amount for this fill
                fill_quote = last_qty * last_price
                fill_entry = {
                    'tradeId': rep.get('t'),
                    'qty': f"{last_qty:.8f}",
                    'price': f"{last_price:.8f}",
                    'quoteQty': f"{fill_quote:.8f}",
                    'commission': fee,
                    'commissionAsset': fee_asset,
                    'time': rep.get('T') or rep.get('E')
                }
                existing['fills'].append(fill_entry)
            # Update cumulative quantities
            if cum_qty:
                existing['executedQty'] = f"{cum_qty:.8f}"
            if cum_quote:
                existing['cummulativeQuoteQty'] = f"{cum_quote:.8f}"
            # Recompute avgPrice if executedQty > 0
            try:
                executed = float(existing['executedQty'])
                if executed > 0:
                    existing['avgPrice'] = f"{float(existing['cummulativeQuoteQty']) / executed:.8f}"
            except (ZeroDivisionError, ValueError, TypeError) as e:
                logger.warning(f"Failed to calculate average price for order {oid}: {e}")
                existing['avgPrice'] = "0.00000000"  # fallback value
            existing['status'] = status
            existing['updateTime'] = rep.get('E') or rep.get('eventTime') or existing.get('updateTime')
            # Save
            self.orders[oid] = existing
            # Track open/closed
            if status in ("NEW", "PARTIALLY_FILLED"):
                self.open_orders.add(oid)
            else:
                self.open_orders.discard(oid)
                # If order just transitioned to final, push to history (copy)
                if status in self._final_statuses:
                    try:
                        self._history.append({**existing})
                    except Exception as e:
                        logger.warning("Ignored non-fatal error while appending history item: %s", e, exc_info=True)
                    # Persist final snapshot to DB (best-effort)
                    try:
                        from backend.database.crud import upsert_final_order
                        upsert_final_order(existing)
                    except Exception as _e:
                        logger.debug(f"Persist final order failed orderId={oid}: {_e}")
            await _order_store_broadcast_queue.put({
                'type': 'order_delta',
                'order': existing
            })

    async def apply_account_position(self, pos: dict):
        async with self._lock:
            for b in pos.get('balances', []):
                asset = b.get('asset') or b.get('a')
                if not asset:
                    continue
                self.balances[asset.upper()] = {
                    'asset': asset.upper(),
                    'free': b.get('free') or b.get('f'),
                    'locked': b.get('locked') or b.get('l')
                }
            await _order_store_broadcast_queue.put({
                'type': 'balance_delta',
                'balances': list(self.balances.values())
            })

    async def apply_balance_update(self, upd: dict):
        async with self._lock:
            asset = upd.get('asset') or upd.get('a')
            if asset:
                bal = self.balances.get(asset.upper(), {'asset': asset.upper(), 'free': '0', 'locked': '0'})
                # delta applies to free balance typically
                delta = upd.get('delta') or upd.get('d') or '0'
                try:
                    bal_free = float(bal['free']) + float(delta)
                    bal['free'] = f"{bal_free:.8f}"
                except (ValueError, TypeError) as e:
                    logger.warning(f"Failed to update balance for asset {asset}: {e}")
                self.balances[asset.upper()] = bal
                await _order_store_broadcast_queue.put({
                    'type': 'balance_delta',
                    'balances': [bal]
                })

    async def apply_list_status(self, evt: dict):
        async with self._lock:
            list_id = evt.get('orderListId') or evt.get('i')
            if list_id is None:
                return
            self.oco_lists[list_id] = evt
            await _order_store_broadcast_queue.put({
                'type': 'list_status_delta',
                'listStatus': evt
            })

    async def snapshot_open_orders(self):
        async with self._lock:
            return [self.orders[oid] for oid in self.open_orders if oid in self.orders]

    async def get_balances(self):
        async with self._lock:
            return list(self.balances.values())

    async def snapshot_history(self, limit: int = 50):
        async with self._lock:
            if limit <= 0:
                return []
            return list(list(self._history)[-limit:])

    async def merge_rest_open_orders(self, rest_open: list[dict], rest_balances: list[dict]):
        """Merge REST snapshot with in-memory state (used on fallback).

        - Ensures open_orders set matches REST open orders list.
        - Adds placeholder orders if missing (minimal fields) so frontend sees them.
        - Removes orders from open set that REST no longer reports (but keeps them in self.orders history if present).
        - Reconciles balances (overwrite with REST balances snapshot if provided).
        Returns dict with stats.
        """
        added = 0
        removed = 0
        placeholders = 0
        async with self._lock:
            rest_ids = set()
            for o in rest_open or []:
                oid = o.get('orderId') or o.get('id')
                if oid is None:
                    continue
                rest_ids.add(oid)
                if oid not in self.orders:
                    # Create placeholder minimal order
                    self.orders[oid] = {
                        'orderId': oid,
                        'clientOrderId': o.get('clientOrderId'),
                        'symbol': (o.get('symbol') or '').upper(),
                        'side': o.get('side'),
                        'type': o.get('type'),
                        'timeInForce': o.get('timeInForce'),
                        'price': o.get('price') or '0',
                        'origQty': o.get('origQty') or o.get('origQuantity') or '0',
                        'executedQty': o.get('executedQty') or '0',
                        'cummulativeQuoteQty': o.get('cummulativeQuoteQty') or '0',
                        'avgPrice': o.get('avgPrice') or '0',
                        'fills': [],
                        'status': o.get('status') or 'NEW',
                        'updateTime': o.get('updateTime') or o.get('time')
                    }
                    placeholders += 1
                # Ensure status not final if in open list
                self.open_orders.add(oid)
            # Orders to remove from open set
            to_remove = [oid for oid in list(self.open_orders) if oid not in rest_ids]
            for oid in to_remove:
                self.open_orders.discard(oid)
                removed += 1
            added = len(rest_ids)
            # Merge balances (overwrite snapshot)
            if rest_balances:
                new_balances = {}
                for b in rest_balances:
                    asset = (b.get('asset') or b.get('a') or '').upper()
                    if not asset:
                        continue
                    new_balances[asset] = {
                        'asset': asset,
                        'free': b.get('free') or b.get('f') or '0',
                        'locked': b.get('locked') or b.get('l') or '0'
                    }
                self.balances = new_balances
        return {
            'addedOpenFromREST': added,
            'removedOpenMissingInREST': removed,
            'placeholdersCreated': placeholders
        }


order_store = OrderStore()


class ConnectionManager:
    """Enhanced connection manager with heartbeat support and per-client subscriptions"""

    def __init__(self, max_connections: int = 10):
        # Separate lists of websocket connections per channel
        self.market_connections: List[WebSocket] = []
        self.bot_connections: List[WebSocket] = []
        self.user_connections: List[WebSocket] = []
        # Heartbeat tasks per connection
        self.heartbeat_tasks: Dict[WebSocket, asyncio.Task] = {}
        # Limit to avoid resource exhaustion
        self.max_connections = max_connections
        # Per-client symbol subscriptions (market channel)
        self.client_subscriptions: Dict[WebSocket, set[str]] = {}

    async def connect_market(self, websocket: WebSocket):
        # Check connection limit
        if len(self.market_connections) >= self.max_connections:
            await websocket.close(code=1008, reason="Connection limit exceeded")
            logger.warning(
                f"WS_MARKET: connection limit exceeded. Current: {len(self.market_connections)}"
            )
            return 0

        await websocket.accept()
        self.market_connections.append(websocket)
        logger.info(
            f"WS_MARKET: connected. Total connections: {len(self.market_connections)}"
        )

        # Start heartbeat for this connection
        task = asyncio.create_task(self._heartbeat_loop(websocket))
        self.heartbeat_tasks[websocket] = task
        return len(self.market_connections)

    async def connect_bot(self, websocket: WebSocket):
        await websocket.accept()
        self.bot_connections.append(websocket)
        logger.info(
            f"WS_BOT: connected. Total connections: {len(self.bot_connections)}"
        )
        task = asyncio.create_task(self._heartbeat_loop(websocket))
        self.heartbeat_tasks[websocket] = task
        return len(self.bot_connections)

    async def connect_user(self, websocket: WebSocket):
        await websocket.accept()
        self.user_connections.append(websocket)
        logger.info(
            f"WS_USER: connected. Total connections: {len(self.user_connections)}"
        )
        task = asyncio.create_task(self._heartbeat_loop(websocket))
        self.heartbeat_tasks[websocket] = task
        return len(self.user_connections)

    def disconnect_market(self, websocket: WebSocket):
        if websocket in self.market_connections:
            self.market_connections.remove(websocket)
            logger.info(
                f"WS_MARKET: disconnected. Remaining connections: {len(self.market_connections)}"
            )

        # Unsubscribe from all symbols when disconnecting
        if websocket in self.client_subscriptions:
            if market_data_manager:
                client_id = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else id(websocket)
                market_data_manager.unsubscribe_client_from_all(str(client_id))
            del self.client_subscriptions[websocket]

        self._cleanup_heartbeat(websocket)

    def disconnect_bot(self, websocket: WebSocket):
        if websocket in self.bot_connections:
            self.bot_connections.remove(websocket)
            logger.info(
                f"WS_BOT: disconnected. Remaining connections: {len(self.bot_connections)}"
            )
        self._cleanup_heartbeat(websocket)

    def disconnect_user(self, websocket: WebSocket):
        if websocket in self.user_connections:
            self.user_connections.remove(websocket)
            logger.info(
                f"WS_USER: disconnected. Remaining connections: {len(self.user_connections)}"
            )
        self._cleanup_heartbeat(websocket)

    def subscribe_client(self, websocket: WebSocket, symbol: str):
        if websocket not in self.client_subscriptions:
            self.client_subscriptions[websocket] = set()
        self.client_subscriptions[websocket].add(symbol)

        # Integrate with MarketDataManager for dynamic subscriptions
        if market_data_manager:
            client_id = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else id(websocket)
            market_data_manager.subscribe_client_to_symbol(str(client_id), symbol)

        logger.info(
            f"Client subscribed to {symbol}. Total subscriptions: {len(self.client_subscriptions[websocket])}"
        )

    def unsubscribe_client(self, websocket: WebSocket, symbol: str):
        if websocket in self.client_subscriptions:
            self.client_subscriptions[websocket].discard(symbol)

            # Integrate with MarketDataManager for dynamic unsubscriptions
            if market_data_manager:
                client_id = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else id(websocket)
                market_data_manager.unsubscribe_client_from_symbol(str(client_id), symbol)

            logger.info(
                f"WS_MARKET: client unsubscribed from {symbol}. "
                f"Remaining subscriptions: {len(self.client_subscriptions[websocket])}"
            )

    def get_client_subscriptions(self, websocket: WebSocket) -> set[str]:
        return self.client_subscriptions.get(websocket, set())

    def _cleanup_heartbeat(self, websocket: WebSocket):
        if websocket in self.heartbeat_tasks:
            task = self.heartbeat_tasks.pop(websocket)
            if not task.done():
                task.cancel()

    async def _heartbeat_loop(self, websocket: WebSocket):
        try:
            while True:
                await asyncio.sleep(30)
                if websocket.client_state.name != "CONNECTED":
                    break
                try:
                    await websocket.send_json({"type": "ping"})
                    logger.debug("WS_HEARTBEAT: sent ping")
                except Exception as e:
                    logger.warning(f"WS_HEARTBEAT: failed to send ping: {e}")
                    break
        except asyncio.CancelledError:
            logger.debug("WS_HEARTBEAT: task cancelled")
        except Exception as e:
            logger.error(f"WS_HEARTBEAT: error: {e}")

    async def broadcast_to_market(self, data: dict):
        if not self.market_connections:
            return
        symbol = data.get("symbol")
        if not symbol:
            await self._broadcast_to_all_market(data)
            return
        disconnected = []
        sent_count = 0
        for connection in self.market_connections:
            try:
                if symbol in self.get_client_subscriptions(connection):
                    await connection.send_json(data)
                    sent_count += 1
                else:
                    logger.debug(
                        f"Skipping {symbol} data for unsubscribed client"
                    )
            except Exception as e:
                logger.warning(f"WS_MARKET: failed to send to market connection: {e}")
                disconnected.append(connection)
        logger.debug(
            f"Broadcasted {symbol} data to {sent_count}/{len(self.market_connections)} clients"
        )
        for conn in disconnected:
            self.disconnect_market(conn)

    async def _broadcast_to_all_market(self, data: dict):
        disconnected = []
        for connection in self.market_connections:
            try:
                await connection.send_json(data)
            except Exception as e:
                logger.warning(f"WS_MARKET: failed to send to market connection: {e}")
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect_market(conn)

    async def broadcast_to_bot(self, data: dict):
        if not self.bot_connections:
            return
        disconnected = []
        for connection in self.bot_connections:
            try:
                await connection.send_json(data)
            except Exception as e:
                logger.warning(f"WS_BOT: failed to send to bot connection: {e}")
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect_bot(conn)

    async def broadcast_to_user(self, data: dict):
        if not self.user_connections:
            return
        disconnected = []
        for connection in self.user_connections:
            try:
                await connection.send_json(data)
            except Exception as e:
                logger.warning(f"WS_USER: failed to send to user connection: {e}")
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect_user(conn)

# ===== Pydantic MODELS (Faza 0) =====


class BalanceModel(BaseModel):
    asset: str
    free: str
    locked: str

 
class OrderModel(BaseModel):
    # Minimal superset pól zwracanych przez Binance (pozostawiamy jako Any niektóre opcjonalne)
    symbol: str
    orderId: int
    clientOrderId: Optional[str] = None
    price: str
    origQty: str
    executedQty: str
    cummulativeQuoteQty: Optional[str] = None
    status: Optional[str] = None
    timeInForce: Optional[str] = None
    type: Optional[str] = None
    side: Optional[str] = None
    stopPrice: Optional[str] = None
    icebergQty: Optional[str] = None
    time: Optional[int] = None
    updateTime: Optional[int] = Field(default=None, alias="updateTime")
    isWorking: Optional[bool] = None
    # Pozostałe pola dynamiczne
    fills: Optional[Any] = None

 
class OpenOrdersSnapshot(BaseModel):
    orders: List[OrderModel] = []
    cached: Optional[bool] = None
    stale: Optional[bool] = None
    error: Optional[str] = None


class OrderStatusResponse(BaseModel):
    order: Optional[OrderModel] = None
    error: Optional[str] = None

 
class GenericErrorResponse(BaseModel):
    error: str


# ===== KONIEC MODELI =====

# Global connection manager
manager = ConnectionManager()

# Simple in-memory caches (not persistent) to reduce Binance API load
_open_orders_cache: dict[str, dict] = {}
_open_orders_cache_ttl_seconds = 5  # avoid hammering endpoint
_last_open_orders_error: Optional[str] = None

# ===== USER DATA STREAM MANAGEMENT (Faza 1) =====


async def _user_stream_keepalive_loop():
    global _user_stream_last_keepalive
    global _user_stream_keepalive_errors, _user_stream_restarts
    logger.info("USER_STREAM: keepalive loop started")
    try:
        while True:
            await asyncio.sleep(5)
            if not _user_stream_listen_key or not binance_client:
                continue
            now = asyncio.get_event_loop().time()
            if (
                _user_stream_last_keepalive is None
                or now - _user_stream_last_keepalive > _USER_STREAM_KEEPALIVE_INTERVAL
            ):
                try:
                    ok = await binance_client.keepalive_user_data_stream_async(_user_stream_listen_key)
                    if ok:
                        _user_stream_last_keepalive = now
                        logger.debug("USER_STREAM: keepalive sent")
                    else:
                        _user_stream_keepalive_errors += 1
                        _user_stream_restarts += 1
                        logger.warning("USER_STREAM: keepalive returned False – forcing restart")
                        await _start_user_stream(force=True)
                except Exception as e:
                    _user_stream_keepalive_errors += 1
                    logger.error(f"USER_STREAM: keepalive error: {e}")
    except asyncio.CancelledError:
        logger.info("USER_STREAM: keepalive loop cancelled")
    finally:
        logger.info("USER_STREAM: keepalive loop stopped")


async def _start_user_stream(force: bool = False):
    """Internal helper to start or restart user data stream (listenKey)."""
    global _user_stream_listen_key, _user_stream_last_keepalive, _user_stream_keepalive_task
    global _user_stream_restarts
    if not binance_client:
        raise RuntimeError("Binance client not available")
    if _user_stream_listen_key and not force:
        logger.info("USER_STREAM: already active")
        return _user_stream_listen_key

    if force and _user_stream_listen_key:
        _user_stream_restarts += 1
        logger.info("USER_STREAM: forcing restart")

    result = await binance_client.start_user_data_stream_async()
    if not result or 'listenKey' not in result:
        raise RuntimeError("Failed to obtain listenKey")
    _user_stream_listen_key = result['listenKey']
    _user_stream_last_keepalive = asyncio.get_event_loop().time()
    logger.info(f"USER_STREAM: started listenKey={_user_stream_listen_key}")
    # start keepalive task if not running
    if not _user_stream_keepalive_task or _user_stream_keepalive_task.done():
        _user_stream_keepalive_task = asyncio.create_task(_user_stream_keepalive_loop())
    return _user_stream_listen_key


async def _close_user_stream():
    global _user_stream_listen_key
    if _user_stream_listen_key and binance_client:
        ok = await binance_client.close_user_data_stream_async(_user_stream_listen_key)
        if ok:
            logger.info("USER_STREAM: closed")
        else:
            logger.warning("USER_STREAM: close returned False")
    _user_stream_listen_key = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    global binance_client, trading_bot, binance_ws_api_client, market_data_manager
    global _user_heartbeat_task, _user_watchdog_task
    global _user_stream_listener_task, _user_stream_processor_task

    logger.info("🚀 SERVER: starting SRInance3 application...")

    try:
        # Initialize database
        logger.info("📊 DATABASE: initializing...")
        init_db()

        # Initialize Binance client
        logger.info("🔗 BINANCE: initializing client...")
        binance_client = BinanceClient()
        await binance_client.initialize()

        # Initialize Binance WebSocket API client (optional)
        from backend.config import (
            ENABLE_WS_API,
            BINANCE_WS_API_URL,
            BINANCE_API_KEY,
            BINANCE_API_SECRET,
            WS_API_TIMEOUT,
            WS_API_MAX_RETRIES,
            BINANCE_WS_URL,
            BINANCE_ENV,
        )
        if ENABLE_WS_API and BINANCE_API_KEY and BINANCE_API_SECRET:
            logger.info("🌐 BINANCE_WS_API: initializing...")
            try:
                binance_ws_api_client = BinanceWSApiClient(
                    api_key=BINANCE_API_KEY,
                    api_secret=BINANCE_API_SECRET,
                    ws_api_url=BINANCE_WS_API_URL,
                    timeout=WS_API_TIMEOUT,
                    max_retries=WS_API_MAX_RETRIES
                )
                await binance_ws_api_client.connect()
                logger.info("✅ BINANCE_WS_API: connected successfully")
            except Exception as e:
                logger.warning(f"⚠️ BINANCE_WS_API: failed to initialize: {e}")
                binance_ws_api_client = None
        else:
            logger.info("⚪ BINANCE_WS_API: disabled or credentials missing")
            binance_ws_api_client = None

        # Initialize MarketDataManager for dynamic subscriptions
        logger.info("🌐 MARKET_DATA_MANAGER: initializing...")
        market_data_manager = MarketDataManager(
            ws_url=BINANCE_WS_URL,
            env=BINANCE_ENV,
            main_loop=asyncio.get_event_loop()
        )

        # Add message handler for processing market data
        async def handle_market_data(message):
            """Handle market data from MarketDataManager"""
            try:
                symbol = message.get("symbol")
                data = message.get("data")

                if symbol and data:
                    # Convert to the format expected by the broadcaster
                    enhanced_data = {
                        **data,
                        "symbol": symbol,
                        "timestamp": message.get("timestamp")
                    }
                    # Put in queue for compatibility with existing broadcaster
                    if market_data_queue is not None:
                        try:
                            market_data_queue.put_nowait(json.dumps(enhanced_data))
                        except Exception as e:
                            logger.warning("Failed to enqueue enhanced market data: %s", e, exc_info=True)
            except Exception as e:
                logger.error(f"Error handling market data: {e}")

        market_data_manager.add_message_handler(handle_market_data)
        logger.info("✅ MARKET_DATA_MANAGER: initialized successfully")

        # Initialize trading bot
        logger.info("🤖 BOT: initializing...")
        trading_bot = TradingBot(
            market_data_queue=None,
            broadcast_callback=manager.broadcast_to_bot,
            main_loop=asyncio.get_event_loop()
        )

        # Start background tasks
        logger.info("⚡ SERVER: starting background tasks...")
        asyncio.create_task(market_data_broadcaster())
        asyncio.create_task(bot_log_broadcaster())
        asyncio.create_task(order_store_broadcaster())
        _user_heartbeat_task = asyncio.create_task(user_channel_heartbeat())
        _user_watchdog_task = asyncio.create_task(fallback_user_stream_watchdog())

        # Auto start user data stream
        try:
            await _start_user_stream()
            if _user_stream_listen_key:
                _user_stream_listener_task = asyncio.create_task(user_data_stream_listener())
                _user_stream_processor_task = asyncio.create_task(user_data_event_processor())
        except Exception as e:
            logger.warning(f"USER_STREAM: failed to auto-start: {e}")

        logger.info("✅ SERVER: startup completed successfully!")
        yield

    except Exception as e:
        logger.error(f"❌ SERVER: startup failed: {e}")
        raise
    finally:
        # Cleanup
        logger.info("🔄 SERVER: shutting down...")

        if trading_bot and trading_bot.running:
            logger.info("🛑 BOT: stopping...")
            if hasattr(trading_bot.stop, '__call__'):
                if asyncio.iscoroutinefunction(trading_bot.stop):
                    await trading_bot.stop()
                else:
                    trading_bot.stop()

        if binance_client:
            logger.info("🔌 BINANCE: closing client...")
            await binance_client.close()

        if binance_ws_client:
            logger.info("🔌 Closing Binance WebSocket client...")
            binance_ws_client.close()

        if market_data_manager:
            logger.info("🔌 MARKET_DATA_MANAGER: shutting down...")
            market_data_manager.shutdown()

        if binance_ws_api_client:
            logger.info("🔌 BINANCE_WS_API: disconnecting...")
            await binance_ws_api_client.disconnect()

        # Stop keepalive task
        if _user_stream_keepalive_task and not _user_stream_keepalive_task.done():
            _user_stream_keepalive_task.cancel()
        if _user_stream_listener_task and not _user_stream_listener_task.done():
            _user_stream_listener_task.cancel()
        if _user_stream_processor_task and not _user_stream_processor_task.done():
            _user_stream_processor_task.cancel()
        if _user_heartbeat_task and not _user_heartbeat_task.done():
            _user_heartbeat_task.cancel()
        if _user_watchdog_task and not _user_watchdog_task.done():
            _user_watchdog_task.cancel()

        # Cancel all heartbeat tasks
        for task in manager.heartbeat_tasks.values():
            if not task.done():
                task.cancel()

        logger.info("✅ Application shutdown completed!")

# Create FastAPI app with lifespan
app = FastAPI(
    title="SRInance3 Trading Bot API",
    description="Advanced cryptocurrency trading bot with real-time WebSocket support",
    version="3.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# User stream endpoints (defined after app instantiation)


@app.post("/user-stream/start")
async def user_stream_start():
    try:
        listen_key = await _start_user_stream(force=True)
        return {"listenKey": listen_key, "started": True}
    except Exception as e:
        logger.error(f"USER_STREAM start error: {e}")
        return {"error": str(e)}


@app.delete("/user-stream/close")
async def user_stream_close():
    try:
        await _close_user_stream()
        return {"closed": True}
    except Exception as e:
        logger.error(f"USER_STREAM close error: {e}")
        return {"error": str(e)}


@app.get("/user-stream/status")
async def user_stream_status():
    return {
        "listenKey": _user_stream_listen_key,
        "lastKeepAliveAge": (
            (asyncio.get_event_loop().time() - _user_stream_last_keepalive)
            if _user_stream_last_keepalive
            else None
        ),
        "active": _user_stream_listen_key is not None
    }

# ===== USER DATA STREAM LISTENER (Faza 2) =====


async def user_data_stream_listener():
    """Listener for Binance user data stream events (raw parsing phase)."""
    global _user_stream_listen_key, _user_stream_connection_errors
    if not binance_client:
        logger.warning("USER_WS: Binance client unavailable – listener abort")
        return
    # Preferuj ws url z configu; fallback do env tylko jeśli podany; normalizuj bez końcowego /ws
    from backend.config import BINANCE_WS_URL as CFG_WS_URL
    env_override = os.getenv("BINANCE_WS_URL")
    base_ws_url = (env_override or CFG_WS_URL).rstrip('/')
    if base_ws_url.endswith('/ws'):
        base_ws_url = base_ws_url[:-3]
    reconnect_delay = 5
    logger.info("USER_WS: listener starting")
    while True:
        if not _user_stream_listen_key:
            try:
                await _start_user_stream(force=True)
            except Exception as e:
                _user_stream_connection_errors += 1
                logger.error(f"USER_WS: cannot obtain listenKey: {e}")
                await asyncio.sleep(reconnect_delay)
                continue
        ws_url = base_ws_url.rstrip('/') + f"/ws/{_user_stream_listen_key}"
        logger.info(f"USER_WS: connecting to {ws_url}")
        try:
            async with websockets.connect(ws_url, ping_interval=20, ping_timeout=10) as ws:
                logger.info("USER_WS: connected")
                reconnect_delay = 5  # reset backoff
                async for raw_msg in ws:
                    try:
                        data = json.loads(raw_msg)
                    except Exception:
                        logger.warning("USER_WS: failed to parse message JSON")
                        continue
                    event_type = data.get('e')
                    if event_type:
                        logger.debug(f"USER_WS: event {event_type}, keys={list(data.keys())}")
                    else:
                        logger.debug(f"USER_WS: unknown event: {data}")
                    try:
                        _user_stream_event_queue.put_nowait(data)
                    except asyncio.QueueFull:
                        logger.warning("USER_WS: event queue full – dropping event")
        except asyncio.CancelledError:
            logger.info("USER_WS: listener cancelled")
            break
        except Exception as e:
            _user_stream_connection_errors += 1
            logger.error(f"USER_WS: listener error: {e}")
            _user_stream_listen_key = None  # force re-init
            reconnect_delay = min(reconnect_delay * 2, 60)
            await asyncio.sleep(reconnect_delay)
            continue
    logger.info("USER_WS: listener stopped")


async def user_data_event_processor():
    """Process raw user stream events into normalized interim structures (Phase 2)."""
    logger.info("ORDER_STORE: processor started")
    try:
        while True:
            evt = await _user_stream_event_queue.get()
            if not isinstance(evt, dict):
                continue
            # Update global last event timestamp (monotonic time)
            try:
                global _user_stream_last_event_time
                _user_stream_last_event_time = asyncio.get_event_loop().time()
            except Exception as e:
                logger.warning("Error while updating user stream event timestamp: %s", e, exc_info=True)
            etype = evt.get('e')
            # latency metrics removed
            if etype == 'executionReport':
                norm = {
                    'type': 'execution_report',
                    'symbol': evt.get('s'),
                    'orderId': evt.get('i'),
                    'clientOrderId': evt.get('c'),
                    'side': evt.get('S'),
                    'orderType': evt.get('o'),
                    # Include original order quantity and price for accurate history
                    'origQty': evt.get('q'),
                    'price': evt.get('p'),
                    'timeInForce': evt.get('f'),
                    'status': evt.get('X'),
                    'execType': evt.get('x'),
                    'lastQty': evt.get('l'),
                    'lastPrice': evt.get('L'),
                    'cumQty': evt.get('z'),
                    'cumQuote': evt.get('Z'),
                    'fee': evt.get('n'),
                    'feeAsset': evt.get('N'),
                    'eventTime': evt.get('E'),
                    'orderTime': evt.get('T')
                }
                logger.debug(f"USER_STREAM NORM execution_report: {norm}")
                await order_store.apply_execution_report({'orderId': norm['orderId'], **norm})
            elif etype == 'outboundAccountPosition':
                balances = evt.get('B', [])
                norm = {
                    'type': 'account_position',
                    'eventTime': evt.get('E'),
                    'balances': [
                        {
                            'asset': b.get('a'),
                            'free': b.get('f'),
                            'locked': b.get('l')
                        } for b in balances
                    ]
                }
                logger.debug(f"USER_STREAM NORM account_position: assets={len(norm['balances'])}")
                await order_store.apply_account_position({'balances': norm['balances']})
            elif etype == 'balanceUpdate':
                norm = {
                    'type': 'balance_update',
                    'asset': evt.get('a'),
                    'delta': evt.get('d'),
                    'clearTime': evt.get('T'),
                    'eventTime': evt.get('E')
                }
                logger.debug(f"USER_STREAM NORM balance_update: {norm}")
                await order_store.apply_balance_update(norm)
            elif etype == 'listStatus':
                norm = {
                    'type': 'list_status',
                    'orderListId': evt.get('i'),
                    'contingencyType': evt.get('c'),
                    'listStatusType': evt.get('l'),
                    'listOrderStatus': evt.get('L'),
                    'symbol': (evt.get('s') or '').upper(),
                    'orders': evt.get('O'),
                    'eventTime': evt.get('E')
                }
                logger.debug(f"USER_STREAM NORM list_status: {norm}")
                await order_store.apply_list_status(norm)
            else:
                logger.debug(f"USER_STREAM: unhandled event type {etype}")
            # Phase 3 will consume normalizations; for now just log.
    except asyncio.CancelledError:
        logger.info("USER_STREAM: processor cancelled")
    except Exception as e:
        logger.error(f"USER_STREAM: processor error: {e}")
    finally:
        logger.info("USER_STREAM: processor stopped")


async def order_store_broadcaster(debounce_ms: int = 50):
    """Debounced broadcaster agregujący delty i wysyłający paczki do kanału user.

    Zbiera wiadomości z kolejki przez krótkie okno czasowe (debounce_ms) i wysyła:
    {
      type: 'order_store_batch',
      events: [...],
      batchSize: N,
      latencyMs: (czas od ostatniego eventu user stream)
    }

    Dodatkowo kopia (opcjonalnie) na kanał bot w celu zachowania kompatybilności.
    """
    logger.info("ORDER_STORE: debounced broadcaster started")
    pending: List[dict] = []
    try:
        loop = asyncio.get_event_loop()
        while True:
            try:
                # Zawsze weź pierwszą wiadomość (blokująco)
                msg = await _order_store_broadcast_queue.get()
                pending.append(msg)
                window_start = loop.time()
                # Zbieraj dalej aż okno minie
                while True:
                    timeout = (debounce_ms / 1000) - (loop.time() - window_start)
                    if timeout <= 0:
                        break
                    try:
                        more = await asyncio.wait_for(_order_store_broadcast_queue.get(), timeout=timeout)
                        pending.append(more)
                    except asyncio.TimeoutError:
                        break

                # Flush batch
                batch = pending
                pending = []
                batch_ts = loop.time()
                last_event_age_ms = None
                if _user_stream_last_event_time is not None:
                    last_event_age_ms = (batch_ts - _user_stream_last_event_time) * 1000.0
                envelope = {
                    'type': 'order_store_batch',
                    'schemaVersion': 1,
                    'events': batch,
                    'batchSize': len(batch),
                    'ts': batch_ts,
                    'lastEventAgeMs': last_event_age_ms
                }
                # Prefer user channel, fallback to bot if no user connections (tymczasowo)
                if manager.user_connections:
                    await manager.broadcast_to_user(envelope)
                else:
                    await manager.broadcast_to_bot(envelope)
                # metrics removed
            except Exception as e:
                logger.error(f"ORDER_STORE: broadcast loop error: {e}")
                await asyncio.sleep(1)
    except asyncio.CancelledError:
        logger.info("ORDER_STORE: debounced broadcaster cancelled")
    finally:
        logger.info("ORDER_STORE: debounced broadcaster stopped")


async def market_data_broadcaster():
    """Background task to broadcast market data (ticker and orderbook) using MarketDataManager"""
    logger.info("📡 MARKET_BROADCASTER: starting...")

    while True:
        try:
            # Check if we have connections and client to broadcast to
            if not manager.market_connections or not binance_client:
                await asyncio.sleep(2)
                continue

            # Use MarketDataManager for dynamic symbol subscriptions
            if market_data_manager:
                # Get active symbols from MarketDataManager (only symbols with subscribers)
                subscribed_symbols = set(market_data_manager.get_active_symbols())
            else:
                # Fallback to ConnectionManager client subscriptions
                subscribed_symbols = set()
                for client_subs in manager.client_subscriptions.values():
                    subscribed_symbols.update(client_subs)

            if not subscribed_symbols:
                await asyncio.sleep(2)
                continue

            for symbol in subscribed_symbols:
                try:
                    # Get 24hr ticker data with price change percent
                    ticker_24hr = await binance_client.get_ticker_24hr(symbol)
                    if ticker_24hr:
                        ticker_data = {
                            "type": "ticker",
                            "symbol": symbol,
                            "price": ticker_24hr.get('lastPrice', '0'),
                            "change": ticker_24hr.get('priceChange', '0'),
                            "changePercent": ticker_24hr.get('priceChangePercent', '0')
                        }
                        logger.debug(f"Broadcasting ticker data for {symbol}: {ticker_data}")
                        await manager.broadcast_to_market(ticker_data)

                    # Get order book data
                    orderbook = await binance_client.get_order_book(symbol, limit=20)
                    if orderbook:
                        orderbook_data = {
                            "type": "orderbook",
                            "symbol": symbol,
                            "bids": orderbook.get('bids', [])[:10],
                            "asks": orderbook.get('asks', [])[:10]
                        }
                        logger.debug(f"Broadcasting orderbook data for {symbol}")
                        await manager.broadcast_to_market(orderbook_data)

                    # Note: Kline data removed - frontend uses Binance WebSocket directly for faster updates

                except Exception as e:
                    logger.warning(f"Failed to get market data for {symbol}: {e}")
                    continue

            # Wait between updates (faster updates for better user experience)
            await asyncio.sleep(2)  # 2 seconds instead of 5

        except Exception as e:
            logger.error(f"MARKET_BROADCASTER: error: {e}")
            await asyncio.sleep(10)  # Wait longer on error


async def bot_log_broadcaster():
    """Background task to broadcast bot logs and status"""
    logger.info("📝 BOT_BROADCASTER: starting...")

    while True:
        try:
            if trading_bot and manager.bot_connections:
                # Broadcast bot status
                temp_update = getattr(trading_bot, 'last_update', None)
                status_data = {
                    "type": "bot_status",
                    "running": trading_bot.running,
                    "status": {
                        "running": trading_bot.running,
                        "symbol": getattr(trading_bot, 'symbol', None),
                        "strategy": getattr(trading_bot, 'strategy', None),
                        "balance": getattr(trading_bot, 'balance', 0),
                        "position": getattr(trading_bot, 'position', None),
                        "last_action": getattr(trading_bot, 'last_action', None),
                        "timestamp": temp_update.isoformat() if temp_update is not None else None
                    }
                }

                await manager.broadcast_to_bot(status_data)

            await asyncio.sleep(10)  # Update every 10 seconds

        except Exception as e:
            logger.error(f"BOT_BROADCASTER: error: {e}")
            await asyncio.sleep(10)


async def user_channel_heartbeat(interval: int = 10):
    """Heartbeat dla kanału user: latency i statystyki store"""
    logger.info("USER_CHANNEL: heartbeat started")
    try:
        loop = asyncio.get_event_loop()
        while True:
            await asyncio.sleep(interval)
            now = loop.time()
            last_age_ms = None
            if _user_stream_last_event_time is not None:
                last_age_ms = (now - _user_stream_last_event_time) * 1000.0
            try:
                # Snapshot częściowy (bez blokowania długo) – korzysta z metod async store
                open_orders = await order_store.snapshot_open_orders()
                balances = await order_store.get_balances()
                payload = {
                    'type': 'user_heartbeat',
                    'ts': now,
                    'lastEventAgeMs': last_age_ms,
                    'openOrders': len(open_orders),
                    'balances': len(balances)
                }
                if manager.user_connections:
                    await manager.broadcast_to_user(payload)
            except Exception as e:
                logger.warning(f"USER_CHANNEL heartbeat send error: {e}")
    except asyncio.CancelledError:
        logger.info("USER_CHANNEL: heartbeat cancelled")
    finally:
        logger.info("USER_CHANNEL: heartbeat stopped")


async def fallback_user_stream_watchdog(check_interval: float = 2.0, stale_after: float = 10.0):
    """Watchdog: jeśli brak eventów user stream > stale_after sekund
    -> fallback REST snapshot + system warn.

    Mechanizm:
    - Sprawdza wiek ostatniego eventu (_user_stream_last_event_time)
    - Jeśli przekracza próg i nie wykonano niedawno fallbacku,
      pobiera snapshot open orders + balances REST (jeśli binance_client dostępny)
    - Wysyła 'system' (level=warn) oraz 'orders_snapshot' do kanału user
    """
    logger.info("USER_WATCHDOG: started")
    last_fallback_ts: Optional[float] = None
    try:
        loop = asyncio.get_event_loop()
        while True:
            await asyncio.sleep(check_interval)
            now = loop.time()
            if _user_stream_last_event_time is None:
                continue
            age = now - _user_stream_last_event_time
            if age > stale_after:
                # Debounce fallback (nie częściej niż co stale_after sekund)
                if last_fallback_ts and (now - last_fallback_ts) < stale_after:
                    continue
                last_fallback_ts = now
                try:
                    # REST snapshot (open orders + account) – minimalna forma
                    snapshot_open = []
                    snapshot_balances = []
                    merge_stats = None
                    if binance_client:
                        try:
                            # open orders REST
                            raw_open = await binance_client.get_open_orders_async()
                            if isinstance(raw_open, list):
                                snapshot_open = raw_open
                        except Exception as e:
                            logger.warning(
                                f"USER_WATCHDOG: open orders REST failed: {e}"
                            )
                        try:
                            acct = await binance_client.get_account_info_async()
                            if acct and isinstance(acct, dict):
                                bals = acct.get('balances') or []
                                snapshot_balances = bals
                        except Exception as e:
                            logger.warning(
                                f"USER_WATCHDOG: account REST failed: {e}"
                            )
                        # Merge with in-memory (optional)
                        try:
                            merge_stats = await order_store.merge_rest_open_orders(
                                snapshot_open, snapshot_balances
                            )
                        except Exception as me:
                            logger.warning(f"USER_WATCHDOG: merge error: {me}")
                    warn_msg = {
                        'type': 'system',
                        'level': 'warn',
                        'message': (
                            f'User stream stale ({int(age)}s). '
                            'Fallback snapshot applied.'
                        ),
                        'lastEventAgeMs': age * 1000.0,
                        'ts': now,
                        'mergeStats': merge_stats
                    }
                    if manager.user_connections:
                        await manager.broadcast_to_user(warn_msg)
                        await manager.broadcast_to_user({
                            'type': 'orders_snapshot',
                            'openOrders': snapshot_open,
                            'balances': snapshot_balances,
                            'fallback': True,
                            'mergeStats': merge_stats,
                            'ts': now
                        })
                            # metrics removed
                except Exception as e:
                    logger.error(f"USER_WATCHDOG: fallback error {e}")
    except asyncio.CancelledError:
        logger.info("USER_WATCHDOG: cancelled")
    finally:
        logger.info("USER_WATCHDOG: stopped")


@app.websocket("/ws/market")
async def websocket_market_endpoint(websocket: WebSocket):
    """Enhanced market WebSocket endpoint with heartbeat support"""
    client_id = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
    logger.info(f"Market WebSocket connection attempt from {client_id}")

    try:
        connection_count = await manager.connect_market(websocket)

        # Send welcome message
        await websocket.send_json({
            "type": "welcome",
            "message": f"Connected to market stream (connection #{connection_count})",
            "timestamp": asyncio.get_event_loop().time()
        })

        while True:
            try:
                # Wait for messages from client
                data = await websocket.receive_json()
                logger.debug(f"Market WebSocket received: {data}")

                # Handle different message types
                message_type = data.get('type')

                if message_type == 'pong':
                    logger.debug("Received pong from market client")
                    continue

                elif message_type == 'subscribe':
                    symbol = data.get('symbol', 'BTCUSDT')

                    # Unsubscribe from previous symbols (single subscription per client)
                    current_subscriptions = manager.get_client_subscriptions(websocket)
                    for old_symbol in current_subscriptions.copy():
                        manager.unsubscribe_client(websocket, old_symbol)

                    # Subscribe to new symbol
                    manager.subscribe_client(websocket, symbol)
                    logger.info(f"Market client {client_id} subscribed to {symbol}")

                    # Send immediate data for subscribed symbol
                    if binance_client:
                        try:
                            # Get both ticker price and 24hr data
                            ticker_24hr = await binance_client.get_ticker_24hr(symbol)
                            if ticker_24hr:
                                await websocket.send_json({
                                    "type": "ticker",
                                    "symbol": symbol,
                                    "price": ticker_24hr.get('lastPrice', '0'),
                                    "change": ticker_24hr.get('priceChange', '0'),
                                    "changePercent": ticker_24hr.get('priceChangePercent', '0')
                                })

                            # Also send orderbook data
                            orderbook = await binance_client.get_order_book(symbol, limit=20)
                            if orderbook:
                                await websocket.send_json({
                                    "type": "orderbook",
                                    "symbol": symbol,
                                    "bids": orderbook.get('bids', [])[:10],
                                    "asks": orderbook.get('asks', [])[:10]
                                })

                            # Send initial kline data for chart
                            try:
                                klines = binance_client.get_klines(symbol, "1m", 1)  # Get latest kline
                                if klines and len(klines) > 0:
                                    latest_kline = klines[0]
                                    await websocket.send_json({
                                        "type": "kline",
                                        "symbol": symbol,
                                        "time": int(latest_kline[0] / 1000),  # Convert to seconds
                                        "open": float(latest_kline[1]),
                                        "high": float(latest_kline[2]),
                                        "low": float(latest_kline[3]),
                                        "close": float(latest_kline[4]),
                                        "volume": float(latest_kline[5])
                                    })
                            except Exception as kline_error:
                                logger.warning(f"Failed to get kline data for {symbol}: {kline_error}")
                        except Exception as e:
                            logger.warning(f"Failed to get immediate data for {symbol}: {e}")

                elif message_type == 'unsubscribe':
                    symbol = data.get('symbol')
                    if symbol:
                        manager.unsubscribe_client(websocket, symbol)
                        logger.info(f"Market client {client_id} unsubscribed from {symbol}")

                elif message_type == 'ping':
                    await websocket.send_json({"type": "pong"})

                else:
                    logger.warning(f"Unknown message type from market client: {message_type}")

            except asyncio.TimeoutError:
                logger.debug("Market WebSocket timeout, sending ping")
                await websocket.send_json({"type": "ping"})

    except WebSocketDisconnect:
        logger.info(f"Market WebSocket client {client_id} disconnected normally")
    except Exception as e:
        logger.error(f"Market WebSocket error for {client_id}: {e}")
    finally:
        manager.disconnect_market(websocket)
        logger.info(f"Market WebSocket cleanup completed for {client_id}")


@app.websocket("/ws/bot")
async def websocket_bot_endpoint(websocket: WebSocket):
    """Enhanced bot WebSocket endpoint with command handling"""
    client_id = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
    logger.info(f"Bot WebSocket connection attempt from {client_id}")

    try:
        connection_count = await manager.connect_bot(websocket)

        # Send welcome message with current bot status
        await websocket.send_json({
            "type": "welcome",
            "message": f"Connected to bot stream (connection #{connection_count})",
            "timestamp": asyncio.get_event_loop().time()
        })

        # Send current bot status
        if trading_bot:
            await websocket.send_json({
                "type": "bot_status",
                "running": trading_bot.running,
                "status": {
                    "running": trading_bot.running,
                    "symbol": getattr(trading_bot, 'symbol', None),
                    "strategy": getattr(trading_bot, 'strategy', None),
                    "balance": getattr(trading_bot, 'balance', 0),
                }
            })

        while True:
            try:
                # Wait for messages from client
                data = await websocket.receive_json()
                logger.info(f"Bot WebSocket received command: {data}")

                message_type = data.get('type')

                if message_type == 'pong':
                    logger.debug("Received pong from bot client")
                    continue

                elif message_type == 'ping':
                    await websocket.send_json({"type": "pong"})
                    continue

                elif message_type == 'get_status':
                    # Send current status
                    if trading_bot:
                        await websocket.send_json({
                            "type": "bot_status",
                            "running": trading_bot.running,
                            "status": {
                                "running": trading_bot.running,
                                **trading_bot.get_status()
                            }
                        })

                elif message_type == 'get_logs':
                    # Send last logs
                    if trading_bot:
                        await websocket.send_json({
                            "type": "bot_logs",
                            "logs": trading_bot.get_logs()
                        })

                elif message_type == 'start_bot':
                    symbol = data.get('symbol', 'BTCUSDT')
                    strategy = data.get('strategy', 'simple_momentum')

                    logger.info(f"Starting bot with symbol={symbol}, strategy={strategy}")

                    if trading_bot and not trading_bot.running:
                        try:
                            # Używamy setattr aby bezpiecznie ustawić atrybuty
                            setattr(trading_bot, 'symbol', symbol)
                            setattr(trading_bot, 'strategy', strategy)

                            if asyncio.iscoroutinefunction(trading_bot.start):
                                await trading_bot.start()
                            else:
                                trading_bot.start()

                            await websocket.send_json({
                                "type": "log",
                                "message": f"✅ Bot started successfully for {symbol} with {strategy} strategy"
                            })

                            await websocket.send_json({
                                "type": "bot_status",
                                "running": True,
                                "status": {
                                    "running": True,
                                    "symbol": symbol,
                                    "strategy": strategy,
                                    "balance": getattr(trading_bot, 'balance', 0),
                                }
                            })

                        except Exception as e:
                            logger.error(f"Failed to start bot: {e}")
                            await websocket.send_json({
                                "type": "error",
                                "message": f"❌ Failed to start bot: {str(e)}"
                            })
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "message": "⚠️ Bot is already running or not available"
                        })

                elif message_type == 'stop_bot':
                    logger.info("Stopping bot")

                    if trading_bot and trading_bot.running:
                        try:
                            if hasattr(trading_bot.stop, '__call__'):
                                if asyncio.iscoroutinefunction(trading_bot.stop):
                                    await trading_bot.stop()
                                else:
                                    trading_bot.stop()

                            await websocket.send_json({
                                "type": "log",
                                "message": "✅ Bot stopped successfully"
                            })

                            await websocket.send_json({
                                "type": "bot_status",
                                "running": False,
                                "status": {
                                    "running": False
                                }
                            })

                        except Exception as e:
                            logger.error(f"Failed to stop bot: {e}")
                            await websocket.send_json({
                                "type": "error",
                                "message": f"❌ Failed to stop bot: {str(e)}"
                            })
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "message": "⚠️ Bot is not running"
                        })

                else:
                    logger.warning(f"Unknown command from bot client: {message_type}")
                    await websocket.send_json({
                        "type": "error",
                        "message": f"❓ Unknown command: {message_type}"
                    })

            except asyncio.TimeoutError:
                logger.debug("Bot WebSocket timeout, sending ping")
                await websocket.send_json({"type": "ping"})

    except WebSocketDisconnect:
        logger.info(f"Bot WebSocket client {client_id} disconnected normally")
    except Exception as e:
        logger.error(f"Bot WebSocket error for {client_id}: {e}")
    finally:
        manager.disconnect_bot(websocket)
        logger.info(f"Bot WebSocket cleanup completed for {client_id}")


@app.websocket("/ws/user")
async def websocket_user_endpoint(websocket: WebSocket):
    """User data WebSocket: snapshot + batched delty + heartbeat."""
    client_id = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
    logger.info(f"USER_WS: connection attempt from {client_id}")

    try:
        connection_count = await manager.connect_user(websocket)
    # metrics removed
        loop = asyncio.get_event_loop()

        # Build initial snapshot
        open_orders = await order_store.snapshot_open_orders()
        balances = await order_store.get_balances()
        now = loop.time()
        last_event_age_ms = None
        if _user_stream_last_event_time is not None:
            last_event_age_ms = (now - _user_stream_last_event_time) * 1000.0

        await websocket.send_json({
            'type': 'welcome',
            'message': f'Connected to user stream (connection #{connection_count})',
            'ts': now
        })

        history = await order_store.snapshot_history(limit=50)
        await websocket.send_json({
            'type': 'orders_snapshot',
            'openOrders': open_orders,
            'balances': balances,
            'history': history,
            'lastEventAgeMs': last_event_age_ms,
            'ts': now
        })

        while True:
            data = await websocket.receive_json()
            mtype = data.get('type')
            if mtype == 'ping':
                await websocket.send_json({'type': 'pong', 'ts': loop.time()})
            elif mtype == 'resnapshot':
                # Rebuild snapshot on demand
                open_orders = await order_store.snapshot_open_orders()
                balances = await order_store.get_balances()
                history = await order_store.snapshot_history(limit=50)
                now = loop.time()
                last_event_age_ms = None
                if _user_stream_last_event_time is not None:
                    last_event_age_ms = (now - _user_stream_last_event_time) * 1000.0
                await websocket.send_json({
                    'type': 'orders_snapshot',
                    'openOrders': open_orders,
                    'balances': balances,
                    'history': history,
                    'lastEventAgeMs': last_event_age_ms,
                    'ts': now
                })
            elif mtype == 'pong':
                # Ignore
                continue
            else:
                logger.debug(f"USER_WS: unknown message type {mtype} from {client_id}")

    except WebSocketDisconnect:
        logger.info(f"USER_WS: client disconnected {client_id}")
    except Exception as e:
        logger.error(f"USER_WS error for {client_id}: {e}")
    finally:
        manager.disconnect_user(websocket)
        logger.info(f"USER_WS: cleanup done for {client_id}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": asyncio.get_event_loop().time(),
        "market_connections": len(manager.market_connections),
        "bot_connections": len(manager.bot_connections),
        "binance_connected": binance_client is not None,
        "bot_available": trading_bot is not None,
        "bot_running": trading_bot.running if trading_bot else False
    }


@app.get("/env/info")
async def env_info():
    """Diagnostic: zwraca podstawowe informacje środowiskowe (bez pełnych kluczy)."""
    from backend.config import BINANCE_API_URL, BINANCE_WS_URL, BINANCE_ENV, BINANCE_API_KEY

    def _mask(s: str, show: int = 4):
        if not s:
            return None
        if len(s) <= show*2:
            return s[0] + "***" + s[-1]
        return s[:show] + "***" + s[-show:]
    info = {
        'binanceEnv': BINANCE_ENV,
        'apiBaseUrl': BINANCE_API_URL,
        'wsUrl': BINANCE_WS_URL,
        'apiKeyMasked': _mask(BINANCE_API_KEY),
        'userStreamListenKeyActive': _user_stream_listen_key is not None,
        'openOrdersCount': len(order_store.open_orders),
        'ordersKnown': len(order_store.orders),
        'balancesTracked': len(order_store.balances),
    }
    # Heurystyka ostrzegająca o możliwym mismatch: duża liczba balansów w trybie testnet
    try:
        if BINANCE_ENV == 'testnet':
            acct = None
            if binance_client:
                acct = await binance_client.get_account_info_async()
            if acct and isinstance(acct, dict):
                bal_count = len(acct.get('balances', []))
                if bal_count > 100:
                    info['warning'] = (
                        f'Unusually high balances count ({bal_count}) on testnet '
                        '– check if prod keys used.'
                    )
    except Exception as e:
        logger.warning("Error computing diagnostic info: %s", e, exc_info=True)
    return info

# REST API Endpoints


@app.get("/account")
async def get_account():
    """Get account information"""
    try:
        try:
            from backend import config as _cfg
            if hasattr(_cfg, 'BINANCE_API_KEY'):
                ak = _cfg.BINANCE_API_KEY
                if ak:
                    logger.debug(
                        f"[DIAG]/account keyFP={ak[:4]}...{ak[-4:]} env={getattr(_cfg, 'BINANCE_ENV', '?')}"
                    )
        except Exception as e:
            logger.warning("Diagnostic /account logging helper failed: %s", e, exc_info=True)
        if binance_client:
            account_info = binance_client.get_account_info()
            # Wzbogacenie: dodaj total (free+locked) dla każdej pozycji + sumaryczne agregaty
            balances = account_info.get('balances', [])
            for bal in balances:
                try:
                    free_f = float(bal.get('free', '0'))
                    locked_f = float(bal.get('locked', '0'))
                    bal['total'] = f"{free_f+locked_f:.8f}"
                except Exception:
                    bal['total'] = bal.get('free')
            # (opcjonalnie można dodać agregaty jeśli będą potrzebne w UI)
            account_info['balancesEnhanced'] = True
            return account_info
        else:
            return {"error": "Binance client not available"}
    except Exception as e:
        logger.error(f"API_ACCOUNT: endpoint error: {e}")
        # Return demo data for testing purposes when API keys are invalid
        if "401" in str(e) or "Unauthorized" in str(e):
            return {
                "makerCommission": 10,
                "takerCommission": 10,
                "buyerCommission": 0,
                "sellerCommission": 0,
                "canTrade": True,
                "canWithdraw": False,
                "canDeposit": True,
                "brokered": False,
                "requireSelfTradePrevention": False,
                "preventSor": False,
                "updateTime": 1640995200000,
                "accountType": "SPOT",
                "balances": [
                    {"asset": "BTC", "free": "0.00100000", "locked": "0.00000000"},
                    {"asset": "USDT", "free": "1000.00000000", "locked": "50.00000000"},
                    {"asset": "ETH", "free": "0.50000000", "locked": "0.00000000"},
                    {"asset": "BNB", "free": "10.00000000", "locked": "2.00000000"}
                ],
                "permissions": ["SPOT"],
                "uid": 12345,
                "_note": "Demo data - API keys invalid for testnet"
            }
        return {"error": str(e)}


@app.get("/ticker")
async def get_ticker(symbol: str):
    """Get ticker information for a symbol"""
    from fastapi import HTTPException
    try:
        if not binance_client:
            logger.error("Binance client not available")
            raise HTTPException(status_code=503, detail="Binance client not available")

        ticker = await binance_client.get_ticker(symbol)
        if ticker is None:
            # Provide graceful fallback with minimal structure expected by frontend
            logger.warning(f"Ticker not found for {symbol}, returning fallback")
            return {"symbol": symbol.upper(), "price": "0", "change": "0", "changePercent": "0"}

        # Normal Binance ticker returns symbol & price only; enrich for frontend consistency
        if 'change' not in ticker:
            ticker = {**ticker, 'change': '0', 'changePercent': '0'}
        return ticker
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        logger.error(f"API_TICKER: endpoint error for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get("/orderbook")
async def get_orderbook(symbol: str, limit: int = 20):
    """Get order book for a symbol"""
    try:
        if binance_client:
            orderbook = await binance_client.get_order_book(symbol, limit)
            if orderbook is None:
                return {"symbol": symbol.upper(), "bids": [], "asks": [], "error": "Failed to fetch order book"}
            return {
                "symbol": symbol.upper(),
                "bids": orderbook.get('bids', []),
                "asks": orderbook.get('asks', [])
            }
        else:
            return {"error": "Binance client not available"}
    except Exception as e:
        logger.error(f"API_ORDERBOOK: endpoint error: {e}")
        return {"error": str(e)}


@app.get("/klines")
async def get_klines(symbol: str, interval: str = "1m", limit: int = 100):
    """Get klines/candlestick data for a symbol"""
    try:
        if binance_client:
            # Używaj prawdziwych danych z Binance API
            klines_data = binance_client.get_klines(symbol, interval, limit)
            logger.info(f"Retrieved {len(klines_data)} klines for {symbol}")
            return klines_data
        else:
            return {"error": "Binance client not available"}
    except Exception as e:
        logger.error(f"Klines endpoint error: {e}")
        return {"error": str(e)}


@app.get("/exchangeInfo")
async def get_exchange_info():
    """Get exchange information (cached for 1 hour)"""
    try:
        if not binance_client:
            raise HTTPException(status_code=503, detail="Binance client not available")

        exchange_info = await binance_client.get_exchange_info_async()
        return exchange_info
    except Exception as e:
        logger.error(f"Exchange info endpoint error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get("/24hr")
async def get_24hr_ticker():
    """Get 24hr ticker for all symbols"""
    try:
        if not binance_client:
            raise HTTPException(status_code=503, detail="Binance client not available")

        ticker_data = await binance_client.get_ticker_24hr_all_async()
        return ticker_data
    except Exception as e:
        logger.error(f"24hr ticker endpoint error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get("/account/history")
async def get_account_history(symbol: str):
    """Get account trade history for a symbol"""
    try:
        if binance_client:
            history = binance_client.get_account_trades(symbol)
            return {"history": history}
        else:
            return {"error": "Binance client not available"}
    except Exception as e:
        logger.error(f"Account history endpoint error: {e}")
        return {"error": str(e)}


@app.get("/account/balance")
async def get_account_balance(asset: str):
    """Get account balance for an asset"""
    try:
        if binance_client:
            balance = binance_client.get_balance(asset)
            return {"balance": balance.get("free", "0")}
        else:
            return {"error": "Binance client not available"}
    except Exception as e:
        logger.error(f"Account balance endpoint error: {e}")
        return {"error": str(e)}


@app.get("/orders/open", response_model=OpenOrdersSnapshot)
async def get_open_orders(symbol: Optional[str] = None):
    """Get current open orders for a symbol or all symbols with simple caching & throttling"""
    import time
    global _last_open_orders_error
    cache_key = symbol or '__ALL__'
    now = time.time()

    if not binance_client:
        return OpenOrdersSnapshot(orders=[], error="Binance client not available")

    try:
        cached = _open_orders_cache.get(cache_key)
        if cached and (now - cached['time'] < _open_orders_cache_ttl_seconds):
            logger.debug("/orders/open cache HIT key=%s age=%.2fs", cache_key, now - cached['time'])
            return OpenOrdersSnapshot(orders=cached['data'], cached=True)

        orders = await binance_client.get_open_orders_async(symbol)
        if orders is None:
            if cached:
                logger.warning("Using stale open orders cache due to upstream failure")
                logger.debug("/orders/open cache STALE key=%s age=%.2fs", cache_key, now - cached['time'])
                return OpenOrdersSnapshot(
                    orders=cached['data'],
                    stale=True,
                    error=_last_open_orders_error or 'Upstream error',
                )
            _last_open_orders_error = "Failed to fetch open orders"
            return OpenOrdersSnapshot(orders=[], error=_last_open_orders_error)

        _open_orders_cache[cache_key] = {"time": now, "data": orders}
        logger.debug("/orders/open cache MISS key=%s refreshed size=%d", cache_key, len(orders))
        _last_open_orders_error = None
        return OpenOrdersSnapshot(orders=orders)
    except Exception as e:
        logger.error(f"Open orders endpoint error: {e}")
        _last_open_orders_error = str(e)
        cached = _open_orders_cache.get(cache_key)
        if cached:
            logger.debug("/orders/open exception served STALE key=%s age=%.2fs", cache_key, now - cached['time'])
            return OpenOrdersSnapshot(orders=cached['data'], stale=True, error=_last_open_orders_error)
        return OpenOrdersSnapshot(orders=[], error=_last_open_orders_error)


@app.get("/orders/history")
async def get_orders_history(
    symbol: Optional[str] = None,
    limit: int = 50,
    cursor: Optional[int] = None,
    source: str = 'local',
    orderId: Optional[int] = None,
    startTime: Optional[int] = None,
    endTime: Optional[int] = None
):
    """Orders history paginacja.

    Domyślnie source=local (paginacja po lokalnej tabeli orders_history).
    Parametry legacy (orderId/startTime/endTime) używane tylko gdy source=binance.
    Cursor: ostatni orderId z poprzedniej strony (następna strona zwraca orderId < cursor).
    """
    try:
        if source == 'binance':
            if not symbol:
                return {"error": "symbol required for binance source"}
            if not binance_client:
                return {"error": "Binance client not available"}
            orders = await binance_client.get_all_orders_async(
                symbol=symbol,
                limit=min(limit, 1000),
                order_id=orderId,
                start_time=startTime,
                end_time=endTime
            )
            if orders is None:
                return {"error": "Failed to fetch orders history", "source": "binance"}
            return {"items": orders, "nextCursor": None, "hasMore": False, "source": "binance"}
        # Local source
        if limit <= 0:
            limit = 1
        if limit > 500:
            limit = 500
        from backend.database.crud import get_orders_history_page
        items, next_cursor, has_more = get_orders_history_page(symbol, limit, cursor)
        return {
            "items": items,
            "nextCursor": next_cursor,
            "hasMore": has_more,
            "source": "local",
            "symbol": symbol.upper() if symbol else None
        }
    except Exception as e:
        logger.error(f"Orders history endpoint error: {e}")
        return {"error": str(e), "source": source}


@app.get("/orders/{order_id}", response_model=OrderStatusResponse)
async def get_order_status(order_id: int, symbol: str, origClientOrderId: Optional[str] = None):
    """Get specific order status"""
    try:
        if binance_client:
            order = await binance_client.get_order_status_async(
                symbol=symbol,
                order_id=order_id if order_id else None,
                orig_client_order_id=origClientOrderId
            )
            if order is not None:
                return OrderStatusResponse(order=order)
            else:
                return OrderStatusResponse(error="Failed to fetch order status")
        else:
            return OrderStatusResponse(error="Binance client not available")
    except Exception as e:
        logger.error(f"Order status endpoint error: {e}")
        return OrderStatusResponse(error=str(e))


@app.get("/orders/snapshot")
async def orders_snapshot():
    """Return current open orders snapshot and balances from in-memory store"""
    try:
        open_orders = await order_store.snapshot_open_orders()
        balances = await order_store.get_balances()
        return {"openOrders": open_orders, "balances": balances}
    except Exception as e:
        logger.error(f"Orders snapshot error: {e}")
        return {"error": str(e), "openOrders": [], "balances": []}


@app.get("/bot/status")
async def get_bot_status():
    """Get bot status"""
    try:
        if trading_bot:
            return {
                "status": "running" if trading_bot.running else "stopped",
                "running": trading_bot.running
            }
        else:
            return {"error": "Trading bot not available"}
    except Exception as e:
        logger.error(f"API_BOT: status endpoint error: {e}")
        return {"error": str(e)}


@app.get("/bot/logs")
async def get_bot_logs():
    """Get bot logs"""
    try:
        if trading_bot:
            return {"logs": trading_bot.get_logs()}
        else:
            return {"logs": ["Bot not initialized"]}
    except Exception as e:
        logger.error(f"Bot logs endpoint error: {e}")
        return {"error": str(e)}


@app.post("/bot/config")
async def update_bot_config(config: dict):
    """Update bot strategy configuration"""
    try:
        if trading_bot:
            success = trading_bot.update_strategy_config(config)
            if success:
                return {"status": "success", "message": "Config updated"}
            else:
                return {"error": "Failed to update config"}
        else:
            return {"error": "Bot not available"}
    except Exception as e:
        logger.error(f"Bot config update endpoint error: {e}")
        return {"error": str(e)}


@app.get("/bot/strategies")
async def get_available_strategies():
    """Get available trading strategies"""
    try:
        if trading_bot:
            strategies = trading_bot.get_available_strategies()
            return {"strategies": strategies}
        else:
            return {"error": "Bot not available"}
    except Exception as e:
        logger.error(f"Bot strategies endpoint error: {e}")
        return {"error": str(e)}


@app.get("/bot/config")
async def get_bot_config():
    """Get current bot configuration"""
    try:
        if trading_bot:
            status = trading_bot.get_status()
            return {
                "config": status.get("strategy_config", {}),
                "state": status.get("strategy_state", {}),
                "position": status.get("position", {}),
                "daily_stats": status.get("daily_stats", {})
            }
        else:
            return {"error": "Bot not available"}
    except Exception as e:
        logger.error(f"Bot config endpoint error: {e}")
        return {"error": str(e)}

# ===== ORDER MANAGEMENT ENDPOINTS =====


@app.post("/orders")
async def place_order(order_data: dict, prefer: str = "auto"):
    """Place a new order on Binance

    Expected body:
    {
        "symbol": "BTCUSDT",
        "side": "BUY",
        "type": "MARKET",
        "quantity": "0.001",
        "price": "50000.00",  // Optional for MARKET orders
        "timeInForce": "GTC"  // Optional, default GTC
    }

    Query parameters:
    - prefer: "ws", "rest", or "auto" (default) - preferred execution method
    """
    try:
        if not binance_client:
            return {"error": "Binance client not available"}
        # Log key fingerprint
        try:
            from backend import config as _cfg
            ak = _cfg.BINANCE_API_KEY
            if ak:
                logger.debug(
                    f"[DIAG]/orders keyFP={ak[:4]}...{ak[-4:]} env={getattr(_cfg, 'BINANCE_ENV', '?')}"
                )
        except Exception as e:
            logger.warning("Diagnostic /orders logging helper failed: %s", e, exc_info=True)

        # Validate required fields
        required_fields = ["symbol", "side", "type", "quantity"]
        for field in required_fields:
            if field not in order_data:
                return {"error": f"Missing required field: {field}"}

        symbol = order_data["symbol"]
        side = order_data["side"]
        order_type = order_data["type"]
        quantity = order_data["quantity"]
        price = order_data.get("price")
        time_in_force = order_data.get("timeInForce", "GTC")

        # Determine execution method
        execution_source = "rest"  # Default fallback
        use_ws_api = False

        from backend.config import ENABLE_WS_API, WS_API_PRIMARY

        if prefer == "ws" and ENABLE_WS_API and binance_ws_api_client:
            use_ws_api = True
        elif prefer == "auto" and ENABLE_WS_API and WS_API_PRIMARY and binance_ws_api_client:
            use_ws_api = True

        # Try WebSocket API first if preferred
        if use_ws_api and binance_ws_api_client:
            try:
                logger.info(f"Attempting order placement via WebSocket API: {symbol}")
                result = await binance_ws_api_client.place_order_ws(
                    symbol=symbol,
                    side=side,
                    order_type=order_type,
                    quantity=quantity,
                    price=price,
                    time_in_force=time_in_force
                )
                execution_source = "ws"
                logger.info(f"Order placed successfully via WebSocket API: {result}")
                return {
                    "success": True,
                    "order": result,
                    "executionSource": execution_source,
                    "method": "WebSocket API"
                }
            except Exception as ws_error:
                logger.warning(f"WebSocket API order failed, falling back to REST: {ws_error}")
                # Continue to REST API fallback

        # Pre-check (opcjonalny) – jeśli LIMIT/BUY i mamy price + quantity -> sprawdź saldo USDT
        try:
            if side.upper() == 'BUY' and order_type.upper() == 'LIMIT' and price and quantity:
                # Prosty check dla par *USDT (jeśli kończy się na USDT)
                if symbol.upper().endswith('USDT'):
                    notional = float(price) * float(quantity)
                    acct = await binance_client.get_account_info_async()
                    if acct and isinstance(acct, dict):
                        usdt = next((b for b in acct.get('balances', []) if b.get('asset') == 'USDT'), None)
                        if usdt:
                            free_usdt = float(usdt.get('free', '0'))
                            locked_usdt = float(usdt.get('locked', '0'))
                            total_usdt = free_usdt + locked_usdt
                            if notional > free_usdt:
                                logger.warning(
                                    "Pre-check insufficient USDT: need %s free %s locked %s total %s",
                                    notional,
                                    free_usdt,
                                    locked_usdt,
                                    total_usdt,
                                )
                                return {
                                    "error": "Insufficient USDT balance (pre-check)",
                                    "needed": notional,
                                    "free": free_usdt,
                                }
        except Exception as _pc_err:
            logger.debug(f"Pre-check error ignored: {_pc_err}")

        # REST API execution (fallback or primary)
        result = await binance_client.place_order_async(
            symbol=symbol,
            side=side,
            order_type=order_type,
            quantity=quantity,
            price=price,
            time_in_force=time_in_force
        )

        # Jeśli przyszła struktura z kluczem error / binanceMsg traktuj jako błąd
        if isinstance(result, dict) and (result.get('error') or result.get('binanceMsg')):
            logger.warning(f"Order placement failed (REST) details={result}")
            return {
                "error": (
                    result.get('binanceMsg')
                    or result.get('error')
                    or 'Failed to place order'
                ),
                "details": result,
            }

        if result and isinstance(result, dict):
            logger.info(f"Order placed successfully via REST API: {result}")
            # Post-order szybki merge REST (jeśli user stream opóźniony)
            # – zapewnia natychmiastową obecność w UI
            try:
                open_orders_rest_raw = await binance_client.get_open_orders_async(symbol=None)
                open_orders_rest = open_orders_rest_raw if isinstance(open_orders_rest_raw, list) else []
                acct = await binance_client.get_account_info_async()
                balances_rest_raw = acct.get('balances') if acct and isinstance(acct, dict) else []
                balances_rest = balances_rest_raw if isinstance(balances_rest_raw, list) else []
                merge_stats = await order_store.merge_rest_open_orders(open_orders_rest, balances_rest)
                if manager.user_connections:
                    await manager.broadcast_to_user({
                        'type': 'orders_snapshot',
                        'openOrders': open_orders_rest,
                        'balances': balances_rest,
                        'ts': asyncio.get_event_loop().time(),
                        'mergeStats': merge_stats,
                        'reason': 'post_order_rest_merge'
                    })
            except Exception as _merge_err:
                logger.debug(f"Post-order merge error ignored: {_merge_err}")
            return {
                "success": True,
                "order": result,
                "executionSource": execution_source,
                "method": "REST API"
            }
        return {"error": "Failed to place order"}

    except Exception as e:
        logger.error(f"Place order endpoint error: {e}")
        return {"error": str(e)}


@app.post("/orders/test")
async def test_order(order_data: dict):
    """Test a new order (validation without execution)

    Expected body: Same as place_order
    """
    try:
        if not binance_client:
            return {"error": "Binance client not available"}

        # Validate required fields
        required_fields = ["symbol", "side", "type", "quantity"]
        for field in required_fields:
            if field not in order_data:
                return {"error": f"Missing required field: {field}"}

        symbol = order_data["symbol"]
        side = order_data["side"]
        order_type = order_data["type"]
        quantity = order_data["quantity"]
        price = order_data.get("price")
        time_in_force = order_data.get("timeInForce", "GTC")

        result = await binance_client.test_order_async(
            symbol=symbol,
            side=side,
            order_type=order_type,
            quantity=quantity,
            price=price,
            time_in_force=time_in_force
        )

        if result is not None:  # Test order returns empty dict on success
            logger.info(f"Order test successful: {result}")
            return {"success": True, "message": "Order validation passed", "test_result": result}
        else:
            return {"error": "Order test failed"}

    except Exception as e:
        logger.error(f"Test order endpoint error: {e}")
        return {"error": str(e)}


@app.delete("/orders/{order_id}")
async def cancel_order(order_id: int, symbol: str, origClientOrderId: Optional[str] = None, prefer: str = "auto"):
    """Cancel an active order

    Query parameters:
    - symbol: Trading pair (required)
    - origClientOrderId: Client order ID (optional, alternative to orderId)
    - prefer: "ws", "rest", or "auto" (default) - preferred execution method
    """
    try:
        if not binance_client:
            return {"error": "Binance client not available"}

        # Determine execution method
        execution_source = "rest"  # Default fallback
        use_ws_api = False

        from backend.config import ENABLE_WS_API, WS_API_PRIMARY

        if prefer == "ws" and ENABLE_WS_API and binance_ws_api_client:
            use_ws_api = True
        elif prefer == "auto" and ENABLE_WS_API and WS_API_PRIMARY and binance_ws_api_client:
            use_ws_api = True

        # Try WebSocket API first if preferred
        if use_ws_api and binance_ws_api_client:
            try:
                logger.info(f"Attempting order cancellation via WebSocket API: {symbol}, orderId: {order_id}")
                result = await binance_ws_api_client.cancel_order_ws(
                    symbol=symbol,
                    order_id=order_id if order_id != 0 else None,
                    orig_client_order_id=origClientOrderId
                )
                execution_source = "ws"
                logger.info(f"Order cancelled successfully via WebSocket API: {result}")
                return {
                    "success": True,
                    "cancelled_order": result,
                    "executionSource": execution_source,
                    "method": "WebSocket API"
                }
            except Exception as ws_error:
                logger.warning(f"WebSocket API cancellation failed, falling back to REST: {ws_error}")
                # Continue to REST API fallback

        # REST API execution (fallback or primary)
        result = await binance_client.cancel_order_async(
            symbol=symbol,
            order_id=order_id if order_id != 0 else None,
            orig_client_order_id=origClientOrderId
        )

        if result:
            logger.info(f"Order cancelled successfully via REST API: {result}")
            return {
                "success": True,
                "cancelled_order": result,
                "executionSource": execution_source,
                "method": "REST API"
            }
        else:
            return {"error": "Failed to cancel order"}

    except Exception as e:
        logger.error(f"Cancel order endpoint error: {e}")
        return {"error": str(e)}


@app.get("/ws-api/stats")
async def get_ws_api_stats():
    """Get WebSocket API client statistics"""
    try:
        if not binance_ws_api_client:
            return {"error": "WebSocket API client not available"}

        stats = binance_ws_api_client.get_stats()
        return {
            "websocket_api": {
                "enabled": True,
                "connected": stats.get("connected", False),
                "statistics": stats
            }
        }
    except Exception as e:
        logger.error(f"WebSocket API stats error: {e}")
        return {"error": str(e)}


@app.get("/ws-api/health")
async def ws_api_health_check():
    """Health check for WebSocket API connection"""
    try:
        from backend.config import ENABLE_WS_API
        if not ENABLE_WS_API:
            return {
                "websocket_api": {
                    "enabled": False,
                    "status": "disabled",
                    "message": "WebSocket API is disabled in configuration"
                }
            }

        if not binance_ws_api_client:
            return {
                "websocket_api": {
                    "enabled": True,
                    "status": "not_initialized",
                    "message": "WebSocket API client is not initialized"
                }
            }

        # Simple health check by trying to get stats
        is_connected = binance_ws_api_client.is_connected
        stats = binance_ws_api_client.get_stats()

        return {
            "websocket_api": {
                "enabled": True,
                "status": "healthy" if is_connected else "disconnected",
                "connected": is_connected,
                "pending_requests": stats.get("pending_requests", 0),
                "total_requests": stats.get("requests_sent", 0),
                "success_rate": (
                    stats.get("responses_received", 0) / max(1, stats.get("requests_sent", 1))
                ) * 100 if stats.get("requests_sent", 0) > 0 else 0
            }
        }
    except Exception as e:
        logger.error(f"WebSocket API health check error: {e}")
        return {
            "websocket_api": {
                "enabled": True,
                "status": "error",
                "message": str(e)
            }
        }

# Market Data Manager API endpoints


@app.get("/market-data/stats")
async def get_market_data_stats():
    """Get comprehensive statistics about the MarketDataManager"""
    try:
        if not market_data_manager:
            return {
                "status": "disabled",
                "message": "MarketDataManager is not initialized"
            }

        stats = market_data_manager.get_stats()
        return {
            "status": "active",
            "market_data_manager": stats
        }
    except Exception as e:
        logger.error(f"Market data stats error: {e}")
        return {
            "status": "error",
            "message": str(e)
        }


@app.get("/market-data/active-symbols")
async def get_active_symbols():
    """Get list of all symbols with active subscriptions"""
    try:
        if not market_data_manager:
            return {
                "status": "disabled",
                "symbols": []
            }

        symbols = market_data_manager.get_active_symbols()
        return {
            "status": "active",
            "symbols": symbols,
            "count": len(symbols)
        }
    except Exception as e:
        logger.error(f"Active symbols error: {e}")
        return {
            "status": "error",
            "symbols": [],
            "message": str(e)
        }


class MarketSubscriptionRequest(BaseModel):
    symbol: str = Field(..., description="Trading pair symbol (e.g., BTCUSDT)")
    client_id: Optional[str] = Field(None, description="Optional client identifier")


@app.post("/market-data/subscribe")
async def subscribe_to_symbol(request: MarketSubscriptionRequest):
    """Manually subscribe to a symbol's market data"""
    try:
        if not market_data_manager:
            return {
                "success": False,
                "message": "MarketDataManager is not initialized"
            }

        client_id = request.client_id or "manual_client"
        success = market_data_manager.subscribe_client_to_symbol(client_id, request.symbol)

        if success:
            return {
                "success": True,
                "message": f"Successfully subscribed to {request.symbol}",
                "symbol": request.symbol.upper(),
                "client_id": client_id
            }
        else:
            return {
                "success": False,
                "message": f"Failed to subscribe to {request.symbol}"
            }
    except Exception as e:
        logger.error(f"Market data subscription error: {e}")
        return {
            "success": False,
            "message": str(e)
        }


@app.delete("/market-data/unsubscribe")
async def unsubscribe_from_symbol(request: MarketSubscriptionRequest):
    """Manually unsubscribe from a symbol's market data"""
    try:
        if not market_data_manager:
            return {
                "success": False,
                "message": "MarketDataManager is not initialized"
            }

        client_id = request.client_id or "manual_client"
        success = market_data_manager.unsubscribe_client_from_symbol(client_id, request.symbol)

        if success:
            return {
                "success": True,
                "message": f"Successfully unsubscribed from {request.symbol}",
                "symbol": request.symbol.upper(),
                "client_id": client_id
            }
        else:
            return {
                "success": False,
                "message": f"Client was not subscribed to {request.symbol}"
            }
    except Exception as e:
        logger.error(f"Market data unsubscription error: {e}")
        return {
            "success": False,
            "message": str(e)
        }

if __name__ == "__main__":
    logger.info("🚀 Starting SRInance3 server...")

    # Make host configurable for security
    host = os.getenv("SERVER_HOST", "127.0.0.1")  # Default to localhost for security
    # Domyślnie 8001 (frontend klient też używa 8001)
    port = int(os.getenv("SERVER_PORT", "8001"))
    # Determine proper module path (supports running via `python backend/main.py` or `python -m backend.main`)
    module_path = "backend.main:app" if (__package__ or "backend" in __name__) else "main:app"
    uvicorn.run(
        module_path,
        host=host,
        port=port,
        reload=True,
        log_level="info"
    )
