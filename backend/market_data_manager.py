"""
Market Data Manager for dynamic symbol subscription management.

This module implements optimized market data streaming with:
- Dynamic subscription/unsubscription to symbols
- Client tracking for symbol usage
- Automatic cleanup of unused streams
- Integration with Binance WebSocket streams
"""

import asyncio
import json
import logging
import threading
import time
import websocket
from typing import Dict, Set, Optional, List, Callable
from collections import defaultdict

logger = logging.getLogger(__name__)


class MarketDataManager:
    """
    Manages dynamic WebSocket subscriptions to Binance market data streams.

    Key features:
    - Subscribe only to symbols with active clients
    - Automatic unsubscribe when no clients remain
    - Client tracking and reference counting
    - WebSocket connection pooling and reuse
    """

    def __init__(self, ws_url: str, env: str = "testnet", main_loop: Optional[asyncio.AbstractEventLoop] = None):
        self.ws_url = ws_url.rstrip('/')
        self.env = env
        self.main_loop = main_loop

        # Symbol subscription tracking
        self.symbol_subscribers: Dict[str, Set[str]] = defaultdict(set)  # symbol -> set of client_ids
        self.client_symbols: Dict[str, Set[str]] = defaultdict(set)      # client_id -> set of symbols

        # WebSocket connections tracking
        self.active_streams: Dict[str, Dict] = {}  # symbol -> {ws_app, thread, connected}
        self.message_handlers: List[Callable] = []

        # Configuration
        self.reconnect_delay = 5
        self.should_reconnect = True

        # Statistics
        self.stats = {
            "total_subscriptions": 0,
            "total_unsubscriptions": 0,
            "active_symbols": 0,
            "active_clients": 0,
            "reconnections": 0,
            "last_activity": None
        }

        logger.info("MarketDataManager initialized")

    def add_message_handler(self, handler: Callable):
        """Add a message handler function"""
        self.message_handlers.append(handler)

    def subscribe_client_to_symbol(self, client_id: str, symbol: str) -> bool:
        """
        Subscribe a client to a symbol's market data.

        Args:
            client_id: Unique identifier for the client
            symbol: Trading pair symbol (e.g., 'BTCUSDT')

        Returns:
            bool: True if subscription was successful
        """
        symbol = symbol.upper()

        # Add client to symbol subscribers
        was_new_symbol = len(self.symbol_subscribers[symbol]) == 0
        self.symbol_subscribers[symbol].add(client_id)
        self.client_symbols[client_id].add(symbol)

        # Start stream for new symbol
        if was_new_symbol:
            self._start_symbol_stream(symbol)

        # Update statistics
        self.stats["total_subscriptions"] += 1
        self.stats["active_symbols"] = len(self.symbol_subscribers)
        self.stats["active_clients"] = len(self.client_symbols)
        self.stats["last_activity"] = time.time()

        logger.info(f"Client {client_id} subscribed to {symbol}. Active subscribers: {len(self.symbol_subscribers[symbol])}")
        return True

    def unsubscribe_client_from_symbol(self, client_id: str, symbol: str) -> bool:
        """
        Unsubscribe a client from a symbol's market data.

        Args:
            client_id: Unique identifier for the client
            symbol: Trading pair symbol (e.g., 'BTCUSDT')

        Returns:
            bool: True if unsubscription was successful
        """
        symbol = symbol.upper()

        # Remove client from symbol subscribers
        if client_id in self.symbol_subscribers[symbol]:
            self.symbol_subscribers[symbol].remove(client_id)
            self.client_symbols[client_id].discard(symbol)

            # Stop stream if no more subscribers
            if len(self.symbol_subscribers[symbol]) == 0:
                self._stop_symbol_stream(symbol)
                del self.symbol_subscribers[symbol]

            # Clean up client if no more symbols
            if len(self.client_symbols[client_id]) == 0:
                del self.client_symbols[client_id]

            # Update statistics
            self.stats["total_unsubscriptions"] += 1
            self.stats["active_symbols"] = len(self.symbol_subscribers)
            self.stats["active_clients"] = len(self.client_symbols)
            self.stats["last_activity"] = time.time()

            logger.info(f"Client {client_id} unsubscribed from {symbol}. Remaining subscribers: {len(self.symbol_subscribers.get(symbol, set()))}")
            return True

        return False

    def unsubscribe_client_from_all(self, client_id: str) -> int:
        """
        Unsubscribe a client from all symbols.

        Args:
            client_id: Unique identifier for the client

        Returns:
            int: Number of symbols unsubscribed from
        """
        symbols_to_remove = list(self.client_symbols.get(client_id, set()))
        count = 0

        for symbol in symbols_to_remove:
            if self.unsubscribe_client_from_symbol(client_id, symbol):
                count += 1

        logger.info(f"Client {client_id} unsubscribed from {count} symbols")
        return count

    def get_symbol_subscribers(self, symbol: str) -> Set[str]:
        """Get all client IDs subscribed to a symbol"""
        return self.symbol_subscribers.get(symbol.upper(), set()).copy()

    def get_client_symbols(self, client_id: str) -> Set[str]:
        """Get all symbols a client is subscribed to"""
        return self.client_symbols.get(client_id, set()).copy()

    def get_active_symbols(self) -> List[str]:
        """Get list of all symbols with active subscriptions"""
        return list(self.symbol_subscribers.keys())

    def _start_symbol_stream(self, symbol: str):
        """Start WebSocket stream for a symbol"""
        if symbol in self.active_streams:
            logger.warning(f"Stream for {symbol} already active")
            return

        stream_name = f"{symbol.lower()}@ticker"

        if self.env == "testnet":
            url = f"{self.ws_url}/ws/{stream_name}"
        else:
            # For production, we'll use single connection per symbol for now
            # Could be optimized to use multi-stream connection
            url = f"{self.ws_url}/ws/{stream_name}"

        logger.info(f"Starting stream for {symbol}: {url}")

        ws_app = websocket.WebSocketApp(
            url,
            on_message=lambda ws, msg: self._on_message(symbol, ws, msg),
            on_error=lambda ws, error: self._on_error(symbol, ws, error),
            on_close=lambda ws, close_status_code, close_msg: self._on_close(symbol, ws, close_status_code, close_msg),
            on_open=lambda ws: self._on_open(symbol, ws)
        )

        thread = threading.Thread(target=ws_app.run_forever, daemon=True)
        thread.start()

        self.active_streams[symbol] = {
            "ws_app": ws_app,
            "thread": thread,
            "connected": False,
            "url": url,
            "start_time": time.time()
        }

    def _stop_symbol_stream(self, symbol: str):
        """Stop WebSocket stream for a symbol"""
        if symbol not in self.active_streams:
            logger.warning(f"No active stream for {symbol}")
            return

        logger.info(f"Stopping stream for {symbol}")

        stream_info = self.active_streams[symbol]
        stream_info["ws_app"].close()

        # Clean up
        del self.active_streams[symbol]

    def _on_message(self, symbol: str, ws, message: str):
        """Handle WebSocket message for a specific symbol"""
        try:
            data = json.loads(message)

            # Add symbol context to message
            enhanced_message = {
                "symbol": symbol,
                "data": data,
                "timestamp": time.time()
            }

            # Forward to all registered handlers
            for handler in self.message_handlers:
                try:
                    if self.main_loop:
                        self.main_loop.call_soon_threadsafe(
                            lambda: asyncio.create_task(handler(enhanced_message))
                        )
                    else:
                        handler(enhanced_message)
                except Exception as e:
                    logger.error(f"Error in message handler: {e}")

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse WebSocket message for {symbol}: {e}")

    def _on_error(self, symbol: str, ws, error):
        """Handle WebSocket error for a specific symbol"""
        logger.error(f"WebSocket error for {symbol}: {error}")

    def _on_close(self, symbol: str, ws, close_status_code, close_msg):
        """Handle WebSocket close for a specific symbol"""
        logger.info(f"WebSocket closed for {symbol} (code: {close_status_code})")

        if symbol in self.active_streams:
            self.active_streams[symbol]["connected"] = False

        # Reconnect if symbol still has subscribers and should reconnect
        if self.should_reconnect and symbol in self.symbol_subscribers and len(self.symbol_subscribers[symbol]) > 0:
            logger.info(f"Reconnecting to {symbol} in {self.reconnect_delay} seconds")
            threading.Timer(self.reconnect_delay, lambda: self._start_symbol_stream(symbol)).start()
            self.stats["reconnections"] += 1

    def _on_open(self, symbol: str, ws):
        """Handle WebSocket open for a specific symbol"""
        logger.info(f"WebSocket connected for {symbol}")

        if symbol in self.active_streams:
            self.active_streams[symbol]["connected"] = True

    def get_stats(self) -> Dict:
        """Get comprehensive statistics about the manager"""
        return {
            **self.stats,
            "active_streams": len(self.active_streams),
            "connected_streams": sum(1 for stream in self.active_streams.values() if stream.get("connected", False)),
            "stream_details": {
                symbol: {
                    "subscribers": len(self.symbol_subscribers[symbol]),
                    "connected": stream.get("connected", False),
                    "uptime": time.time() - stream.get("start_time", time.time())
                }
                for symbol, stream in self.active_streams.items()
            }
        }

    def shutdown(self):
        """Shutdown all WebSocket connections"""
        logger.info("Shutting down MarketDataManager")
        self.should_reconnect = False

        for symbol in list(self.active_streams.keys()):
            self._stop_symbol_stream(symbol)

        # Clear all subscriptions
        self.symbol_subscribers.clear()
        self.client_symbols.clear()
        self.active_streams.clear()

        logger.info("MarketDataManager shutdown complete")
