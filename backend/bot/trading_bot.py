
import asyncio
import threading
import time
import json


class TradingBot:
    def __init__(self, market_data_queue=None, broadcast_callback=None, main_loop=None):
        self.running = False
        self.status = "stopped"
        self.logs = []
        self.thread = None
        self.loop = None
        self.last_tick = None
        self.orders = []
        self.strategy_name = "test_strategy"
        self.broadcast_callback = broadcast_callback  # Callback do wysyłania przez WebSocket
        self.market_data_queue = market_data_queue  # Queue z live market data
        self.main_loop = main_loop  # Główny event loop FastAPI

    def start(self):
        if not self.running:
            self.running = True
            self.status = "running"
            self._add_log(f"Bot started at {time.ctime()}")
            self._broadcast_status()
            self.thread = threading.Thread(target=self._run_async_loop)
            self.thread.start()

    def stop(self):
        if self.running:
            self.running = False
            self.status = "stopped"
            self._add_log(f"Bot stopped at {time.ctime()}")
            self._broadcast_status()
            if self.thread:
                self.thread.join(timeout=1)

    def _add_log(self, message):
        """Dodaj log i wyślij przez WebSocket jeśli dostępny"""
        self.logs.append(message)
        print(f"[TradingBot] {message}")  # Debug: sprawdzenie czy bot działa
        
        if self.broadcast_callback and self.main_loop:
            try:
                # Używamy asyncio.run_coroutine_threadsafe zamiast call_soon_threadsafe
                import asyncio
                print(f"[DEBUG] Broadcasting log via WebSocket: {message[:50]}...")  # Debug
                future = asyncio.run_coroutine_threadsafe(
                    self.broadcast_callback({
                        "type": "log",
                        "message": message,
                        "timestamp": time.ctime()
                    }),
                    self.main_loop
                )
                print(f"[DEBUG] Broadcast future created successfully")  # Debug
                # Nie czekamy na future.result() żeby nie blokować
            except Exception as e:
                print(f"Error broadcasting log: {e}")
        else:
            print(f"[DEBUG] No broadcast_callback or main_loop available")

    def _broadcast_status(self):
        """Wyślij status przez WebSocket jeśli dostępny"""
        if self.broadcast_callback and self.main_loop:
            try:
                # Używamy asyncio.run_coroutine_threadsafe zamiast call_soon_threadsafe
                import asyncio
                print(f"[DEBUG] Broadcasting status via WebSocket")  # Debug
                future = asyncio.run_coroutine_threadsafe(
                    self.broadcast_callback({
                        "type": "bot_status",
                        "status": self.get_status(),
                        "running": self.running
                    }),
                    self.main_loop
                )
                print(f"[DEBUG] Status broadcast future created successfully")  # Debug
                # Nie czekamy na future.result() żeby nie blokować
            except Exception as e:
                print(f"Error broadcasting status: {e}")
        else:
            print(f"[DEBUG] No broadcast_callback or main_loop available for status")

    def _run_async_loop(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.loop.run_until_complete(self.run())

    async def run(self):
        while self.running:
            try:
                if self.market_data_queue:
                    # Event-driven: czekaj na prawdziwe market data
                    market_data = await self.market_data_queue.get()
                    await self.on_tick(market_data)
                else:
                    # Fallback: timer-based dla testów bez live data
                    await self.on_tick(None)
                    await asyncio.sleep(2)
            except Exception as e:
                error_msg = f"[ERROR] {time.ctime()}: {str(e)}"
                self._add_log(error_msg)

    async def on_tick(self, market_data=None):
        # Logika ticka: analizuj market data i wywołaj strategię
        self.last_tick = time.ctime()
        
        if market_data:
            try:
                # Parse market data z JSON
                data = json.loads(market_data) if isinstance(market_data, str) else market_data
                
                # Binance WebSocket format: { "e": "event_type", "s": "symbol", ... }
                event_type = data.get('e', 'unknown')
                symbol = data.get('s', 'unknown')
                
                self._add_log(f"Market data received: {event_type} for {symbol}")
                await self.execute_strategy(data)
            except Exception as e:
                self._add_log(f"Error parsing market data: {str(e)}")
                await self.execute_strategy(None)
        else:
            # Fallback: timer-based tick
            self._add_log(f"Timer tick: {self.last_tick}")
            await self.execute_strategy(None)

    async def execute_strategy(self, market_data=None):
        # Strategia z analizą prawdziwych danych rynkowych lub fallback
        if market_data:
            # Analizuj prawdziwe market data - format Binance WebSocket
            event_type = market_data.get('e', 'unknown')
            
            if event_type == '24hrTicker':
                # Analiza ticker data (24h stats)
                current_price = float(market_data.get('c', 0))
                price_change = float(market_data.get('P', 0))
                volume = float(market_data.get('v', 0))
                
                decision = "hold"
                if price_change > 2.0:
                    decision = "buy_signal"
                elif price_change < -2.0:
                    decision = "sell_signal"
                    
                self._add_log(f"Ticker analysis - Price: ${current_price:.2f}, Change: {price_change:.2f}%, Decision: {decision}")
                
            elif event_type == 'depthUpdate':
                # Analiza order book
                bids = market_data.get('b', [])
                asks = market_data.get('a', [])
                
                if bids and asks:
                    best_bid = float(bids[0][0]) if bids[0] else 0
                    best_ask = float(asks[0][0]) if asks[0] else 0
                    spread = best_ask - best_bid
                    self._add_log(f"OrderBook - Spread: ${spread:.2f}, Bid: ${best_bid:.2f}, Ask: ${best_ask:.2f}")
                
            elif event_type == 'kline':
                # Analiza świec (candles)
                kline_data = market_data.get('k', {})
                close_price = float(kline_data.get('c', 0))
                volume = float(kline_data.get('v', 0))
                is_closed = kline_data.get('x', False)
                
                if is_closed:
                    self._add_log(f"Kline closed - Price: ${close_price:.2f}, Volume: {volume:.2f}")
                
            else:
                self._add_log(f"Unknown event type: {event_type}")
        else:
            # Przykładowa strategia testowa (fallback)
            decision = "hold"
            self._add_log(f"Strategy {self.strategy_name}: decision={decision}")
        
        # Tu można dodać obsługę zleceń, np. self.place_order(...)

    def get_status(self):
        return {
            "status": self.status,
            "last_tick": self.last_tick,
            "orders": self.orders,
            "strategy": self.strategy_name
        }

    def get_logs(self):
        return self.logs[-20:]  # ostatnie 20 logów
