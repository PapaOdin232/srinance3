
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
        
        # ===== NOWE: Konfiguracja strategii handlowych =====
        self.strategy_config = {
            "type": "simple_ma",  # simple_ma, rsi, grid, dca
            "symbol": "BTCUSDT",
            "timeframe": "1m",
            "parameters": {
                # Simple Moving Average
                "ma_period": 20,
                "ma_type": "SMA",  # SMA, EMA
                # RSI Strategy
                "rsi_period": 14,
                "rsi_overbought": 70,
                "rsi_oversold": 30,
                # Grid Trading
                "grid_levels": 10,
                "grid_spacing": 0.01,  # 1%
                "grid_amount": 100,  # USDT per level
                # DCA Strategy
                "dca_interval": 3600,  # seconds
                "dca_amount": 50,  # USDT
                "dca_price_drop": 0.02,  # 2%
            },
            "risk_management": {
                "max_position_size": 1000,  # USDT
                "stop_loss_pct": 0.05,  # 5%
                "take_profit_pct": 0.10,  # 10%
                "max_daily_trades": 50,
                "max_daily_loss": 500,  # USDT
            }
        }
        
        # Strategy state tracking
        self.strategy_state = {
            "position": {"size": 0, "entry_price": 0, "side": "none"},
            "indicators": {},
            "last_signal": "none",
            "daily_trades": 0,
            "daily_pnl": 0,
            "grid_orders": [],
            "last_dca_time": 0,
        }

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
                
                # Execute configured strategy
                await self._execute_configured_strategy(current_price, market_data)
                
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
                    # Execute strategy on closed candle
                    await self._execute_configured_strategy(close_price, market_data)
                    self._add_log(f"Kline closed - Price: ${close_price:.2f}, Volume: {volume:.2f}")
                
            else:
                self._add_log(f"Unknown event type: {event_type}")
        else:
            # Przykładowa strategia testowa (fallback)
            decision = "hold"
            self._add_log(f"Strategy {self.strategy_name}: decision={decision}")
        
        # Tu można dodać obsługę zleceń, np. self.place_order(...)

    async def _execute_configured_strategy(self, current_price, market_data):
        """Execute the configured trading strategy"""
        strategy_type = self.strategy_config["type"]
        
        try:
            if strategy_type == "simple_ma":
                await self._simple_ma_strategy(current_price, market_data)
            elif strategy_type == "rsi":
                await self._rsi_strategy(current_price, market_data)
            elif strategy_type == "grid":
                await self._grid_strategy(current_price, market_data)
            elif strategy_type == "dca":
                await self._dca_strategy(current_price, market_data)
            else:
                self._add_log(f"Unknown strategy type: {strategy_type}")
                
        except Exception as e:
            self._add_log(f"Strategy execution error: {str(e)}")

    async def _simple_ma_strategy(self, current_price, market_data):
        """Simple Moving Average strategy"""
        ma_period = self.strategy_config["parameters"]["ma_period"]
        
        # Update price history (simplified - in production use proper data storage)
        if "price_history" not in self.strategy_state:
            self.strategy_state["price_history"] = []
        
        self.strategy_state["price_history"].append(current_price)
        if len(self.strategy_state["price_history"]) > ma_period:
            self.strategy_state["price_history"].pop(0)
        
        if len(self.strategy_state["price_history"]) >= ma_period:
            ma_value = sum(self.strategy_state["price_history"]) / ma_period
            
            # Trading signals
            if current_price > ma_value * 1.001 and self.strategy_state["position"]["side"] != "long":
                signal = "BUY"
                self._add_log(f"MA Strategy: {signal} signal - Price: ${current_price:.2f} > MA: ${ma_value:.2f}")
                await self._execute_trade_signal(signal, current_price)
                
            elif current_price < ma_value * 0.999 and self.strategy_state["position"]["side"] != "short":
                signal = "SELL"
                self._add_log(f"MA Strategy: {signal} signal - Price: ${current_price:.2f} < MA: ${ma_value:.2f}")
                await self._execute_trade_signal(signal, current_price)

    async def _rsi_strategy(self, current_price, market_data):
        """RSI-based strategy"""
        rsi_period = self.strategy_config["parameters"]["rsi_period"]
        rsi_overbought = self.strategy_config["parameters"]["rsi_overbought"]
        rsi_oversold = self.strategy_config["parameters"]["rsi_oversold"]
        
        # Simplified RSI calculation (in production use proper TA library)
        if "rsi_data" not in self.strategy_state:
            self.strategy_state["rsi_data"] = {"gains": [], "losses": []}
        
        # Calculate price change
        if "prev_price" in self.strategy_state:
            change = current_price - self.strategy_state["prev_price"]
            if change > 0:
                self.strategy_state["rsi_data"]["gains"].append(change)
                self.strategy_state["rsi_data"]["losses"].append(0)
            else:
                self.strategy_state["rsi_data"]["gains"].append(0)
                self.strategy_state["rsi_data"]["losses"].append(abs(change))
        
        self.strategy_state["prev_price"] = current_price
        
        # Keep only last N periods
        for key in ["gains", "losses"]:
            if len(self.strategy_state["rsi_data"][key]) > rsi_period:
                self.strategy_state["rsi_data"][key].pop(0)
        
        if len(self.strategy_state["rsi_data"]["gains"]) >= rsi_period:
            avg_gain = sum(self.strategy_state["rsi_data"]["gains"]) / rsi_period
            avg_loss = sum(self.strategy_state["rsi_data"]["losses"]) / rsi_period
            
            if avg_loss != 0:
                rs = avg_gain / avg_loss
                rsi = 100 - (100 / (1 + rs))
                
                if rsi < rsi_oversold and self.strategy_state["position"]["side"] != "long":
                    signal = "BUY"
                    self._add_log(f"RSI Strategy: {signal} signal - RSI: {rsi:.2f} < {rsi_oversold}")
                    await self._execute_trade_signal(signal, current_price)
                    
                elif rsi > rsi_overbought and self.strategy_state["position"]["side"] != "short":
                    signal = "SELL"
                    self._add_log(f"RSI Strategy: {signal} signal - RSI: {rsi:.2f} > {rsi_overbought}")
                    await self._execute_trade_signal(signal, current_price)

    async def _grid_strategy(self, current_price, market_data):
        """Grid trading strategy"""
        grid_levels = self.strategy_config["parameters"]["grid_levels"]
        grid_spacing = self.strategy_config["parameters"]["grid_spacing"]
        grid_amount = self.strategy_config["parameters"]["grid_amount"]
        
        # Initialize grid if not exists
        if "grid_center" not in self.strategy_state:
            self.strategy_state["grid_center"] = current_price
            self.strategy_state["grid_orders"] = []
            
            # Create initial grid orders (mock)
            for i in range(-grid_levels//2, grid_levels//2 + 1):
                if i == 0:
                    continue
                price_level = current_price * (1 + i * grid_spacing)
                order_type = "BUY" if i < 0 else "SELL"
                
                grid_order = {
                    "level": i,
                    "price": price_level,
                    "amount": grid_amount,
                    "type": order_type,
                    "status": "pending"
                }
                self.strategy_state["grid_orders"].append(grid_order)
        
        # Check for grid order fills (simplified)
        self._add_log(f"Grid Strategy: Monitoring {len(self.strategy_state['grid_orders'])} grid levels around ${self.strategy_state['grid_center']:.2f}")

    async def _dca_strategy(self, current_price, market_data):
        """Dollar Cost Averaging strategy"""
        dca_interval = self.strategy_config["parameters"]["dca_interval"]
        dca_amount = self.strategy_config["parameters"]["dca_amount"]
        dca_price_drop = self.strategy_config["parameters"]["dca_price_drop"]
        
        current_time = time.time()
        
        # Initialize DCA state
        if "dca_last_price" not in self.strategy_state:
            self.strategy_state["dca_last_price"] = current_price
            self.strategy_state["last_dca_time"] = current_time
        
        time_since_last = current_time - self.strategy_state["last_dca_time"]
        price_drop = (self.strategy_state["dca_last_price"] - current_price) / self.strategy_state["dca_last_price"]
        
        # Execute DCA buy on time interval or significant price drop
        if (time_since_last >= dca_interval) or (price_drop >= dca_price_drop):
            signal = "DCA_BUY"
            self._add_log(f"DCA Strategy: {signal} - Amount: ${dca_amount}, Price: ${current_price:.2f}")
            await self._execute_trade_signal(signal, current_price, dca_amount)
            
            self.strategy_state["last_dca_time"] = current_time
            self.strategy_state["dca_last_price"] = current_price

    async def _execute_trade_signal(self, signal, price, amount=None):
        """Execute trading signal with risk management"""
        risk_config = self.strategy_config["risk_management"]
        
        # Check daily limits
        if self.strategy_state["daily_trades"] >= risk_config["max_daily_trades"]:
            self._add_log(f"Daily trade limit reached: {risk_config['max_daily_trades']}")
            return
        
        if abs(self.strategy_state["daily_pnl"]) >= risk_config["max_daily_loss"]:
            self._add_log(f"Daily loss limit reached: ${risk_config['max_daily_loss']}")
            return
        
        # Calculate position size
        if amount is None:
            amount = min(risk_config["max_position_size"], 100)  # Default $100
        
        # Mock order execution (in production, integrate with binance_client)
        order = {
            "signal": signal,
            "price": price,
            "amount": amount,
            "timestamp": time.time(),
            "status": "executed"
        }
        
        self.orders.append(order)
        self.strategy_state["daily_trades"] += 1
        
        # Update position
        if signal in ["BUY", "DCA_BUY"]:
            self.strategy_state["position"]["side"] = "long"
            self.strategy_state["position"]["entry_price"] = price
            self.strategy_state["position"]["size"] += amount
        elif signal == "SELL":
            self.strategy_state["position"]["side"] = "short"
            self.strategy_state["position"]["entry_price"] = price
            self.strategy_state["position"]["size"] -= amount
        
        self._add_log(f"Order executed: {signal} ${amount} at ${price:.2f}")
        self._broadcast_status()

    def get_status(self):
        return {
            "status": self.status,
            "last_tick": self.last_tick,
            "orders": self.orders,
            "strategy": self.strategy_name,
            "strategy_config": self.strategy_config,
            "strategy_state": self.strategy_state,
            "position": self.strategy_state.get("position", {}),
            "daily_stats": {
                "trades": self.strategy_state.get("daily_trades", 0),
                "pnl": self.strategy_state.get("daily_pnl", 0)
            }
        }

    def get_logs(self):
        return self.logs[-20:]  # ostatnie 20 logów
    
    def update_strategy_config(self, new_config):
        """Update strategy configuration"""
        if self.running:
            self._add_log("Cannot update strategy config while bot is running")
            return False
        
        try:
            # Validate config structure
            required_keys = ["type", "symbol", "timeframe", "parameters", "risk_management"]
            for key in required_keys:
                if key not in new_config:
                    raise ValueError(f"Missing required config key: {key}")
            
            self.strategy_config.update(new_config)
            self.strategy_name = f"{new_config['type']}_{new_config['symbol']}"
            
            # Reset strategy state
            self.strategy_state = {
                "position": {"size": 0, "entry_price": 0, "side": "none"},
                "indicators": {},
                "last_signal": "none",
                "daily_trades": 0,
                "daily_pnl": 0,
                "grid_orders": [],
                "last_dca_time": 0,
            }
            
            self._add_log(f"Strategy config updated: {self.strategy_name}")
            return True
            
        except Exception as e:
            self._add_log(f"Failed to update strategy config: {str(e)}")
            return False
    
    def get_available_strategies(self):
        """Get list of available strategy types"""
        return {
            "simple_ma": {
                "name": "Simple Moving Average",
                "description": "Buy/sell based on price vs moving average",
                "parameters": {
                    "ma_period": {"type": "int", "min": 5, "max": 200, "default": 20},
                    "ma_type": {"type": "select", "options": ["SMA", "EMA"], "default": "SMA"}
                }
            },
            "rsi": {
                "name": "RSI Strategy",
                "description": "Relative Strength Index overbought/oversold signals",
                "parameters": {
                    "rsi_period": {"type": "int", "min": 5, "max": 50, "default": 14},
                    "rsi_overbought": {"type": "int", "min": 60, "max": 90, "default": 70},
                    "rsi_oversold": {"type": "int", "min": 10, "max": 40, "default": 30}
                }
            },
            "grid": {
                "name": "Grid Trading",
                "description": "Place buy/sell orders at regular price intervals",
                "parameters": {
                    "grid_levels": {"type": "int", "min": 5, "max": 50, "default": 10},
                    "grid_spacing": {"type": "float", "min": 0.001, "max": 0.1, "default": 0.01},
                    "grid_amount": {"type": "float", "min": 10, "max": 1000, "default": 100}
                }
            },
            "dca": {
                "name": "Dollar Cost Averaging",
                "description": "Regular purchases with additional buys on price drops",
                "parameters": {
                    "dca_interval": {"type": "int", "min": 300, "max": 86400, "default": 3600},
                    "dca_amount": {"type": "float", "min": 10, "max": 500, "default": 50},
                    "dca_price_drop": {"type": "float", "min": 0.01, "max": 0.2, "default": 0.02}
                }
            }
        }
