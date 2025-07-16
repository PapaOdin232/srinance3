
import asyncio
import threading
import time


class TradingBot:
    def __init__(self):
        self.running = False
        self.status = "stopped"
        self.logs = []
        self.thread = None
        self.loop = None
        self.last_tick = None
        self.orders = []
        self.strategy_name = "test_strategy"

    def start(self):
        if not self.running:
            self.running = True
            self.status = "running"
            self.logs.append(f"Bot started at {time.ctime()}")
            self.thread = threading.Thread(target=self._run_async_loop)
            self.thread.start()

    def stop(self):
        if self.running:
            self.running = False
            self.status = "stopped"
            self.logs.append(f"Bot stopped at {time.ctime()}")
            if self.thread:
                self.thread.join(timeout=1)

    def _run_async_loop(self):
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        self.loop.run_until_complete(self.run())

    async def run(self):
        while self.running:
            try:
                await self.on_tick()
            except Exception as e:
                error_msg = f"[ERROR] {time.ctime()}: {str(e)}"
                self.logs.append(error_msg)
            await asyncio.sleep(2)

    async def on_tick(self):
        # Przykładowa logika ticka: logowanie czasu i wywołanie strategii
        self.last_tick = time.ctime()
        self.logs.append(f"Tick: {self.last_tick}")
        await self.execute_strategy()

    async def execute_strategy(self):
        # Przykładowa strategia testowa: logowanie decyzji
        decision = "hold"
        self.logs.append(f"Strategy {self.strategy_name}: decision={decision}")
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
