import asyncio
import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Dict, List, Optional
import uvicorn
import os
import threading
import queue

from backend.binance_client import BinanceClient, BinanceWebSocketClient
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
logger = logging.getLogger(__name__)

# Global instances
binance_client: Optional[BinanceClient] = None
binance_ws_client: Optional[BinanceWebSocketClient] = None
trading_bot: Optional[TradingBot] = None
market_data_queue: queue.Queue = queue.Queue()
market_connections: List[WebSocket] = []
bot_connections: List[WebSocket] = []

class ConnectionManager:
    """Enhanced connection manager with heartbeat support and per-client subscriptions"""
    
    def __init__(self, max_connections: int = 10):
        self.market_connections: List[WebSocket] = []
        self.bot_connections: List[WebSocket] = []
        self.heartbeat_tasks: Dict[WebSocket, asyncio.Task] = {}
        self.max_connections = max_connections
        # Track client subscriptions: WebSocket -> Set of symbols
        self.client_subscriptions: Dict[WebSocket, set[str]] = {}
    
    async def connect_market(self, websocket: WebSocket):
        # Sprawdź limit połączeń
        if len(self.market_connections) >= self.max_connections:
            await websocket.close(code=1008, reason="Connection limit exceeded")
            logger.warning(f"Market connection limit exceeded. Current: {len(self.market_connections)}")
            return 0

        await websocket.accept()
        self.market_connections.append(websocket)
        logger.info(f"Market WebSocket connected. Total connections: {len(self.market_connections)}")

        # Start heartbeat for this connection
        task = asyncio.create_task(self._heartbeat_loop(websocket))
        self.heartbeat_tasks[websocket] = task

        return len(self.market_connections)
    
    async def connect_bot(self, websocket: WebSocket):
        await websocket.accept()
        self.bot_connections.append(websocket)
        logger.info(f"Bot WebSocket connected. Total connections: {len(self.bot_connections)}")
        
        # Start heartbeat for this connection
        task = asyncio.create_task(self._heartbeat_loop(websocket))
        self.heartbeat_tasks[websocket] = task
        
        return len(self.bot_connections)
    
    def disconnect_market(self, websocket: WebSocket):
        if websocket in self.market_connections:
            self.market_connections.remove(websocket)
            logger.info(f"Market WebSocket disconnected. Remaining connections: {len(self.market_connections)}")
        
        # Clean up client subscriptions
        if websocket in self.client_subscriptions:
            del self.client_subscriptions[websocket]
        
        self._cleanup_heartbeat(websocket)
    
    def disconnect_bot(self, websocket: WebSocket):
        if websocket in self.bot_connections:
            self.bot_connections.remove(websocket)
            logger.info(f"Bot WebSocket disconnected. Remaining connections: {len(self.bot_connections)}")
        
        self._cleanup_heartbeat(websocket)
    
    def subscribe_client(self, websocket: WebSocket, symbol: str):
        """Subscribe client to a symbol"""
        if websocket not in self.client_subscriptions:
            self.client_subscriptions[websocket] = set()
        
        self.client_subscriptions[websocket].add(symbol)
        logger.info(f"Client subscribed to {symbol}. Total subscriptions: {len(self.client_subscriptions[websocket])}")
    
    def unsubscribe_client(self, websocket: WebSocket, symbol: str):
        """Unsubscribe client from a symbol"""
        if websocket in self.client_subscriptions:
            self.client_subscriptions[websocket].discard(symbol)
            logger.info(f"Client unsubscribed from {symbol}. Remaining subscriptions: {len(self.client_subscriptions[websocket])}")
    
    def get_client_subscriptions(self, websocket: WebSocket) -> set[str]:
        """Get all symbols that client is subscribed to"""
        return self.client_subscriptions.get(websocket, set())
    
    def _cleanup_heartbeat(self, websocket: WebSocket):
        if websocket in self.heartbeat_tasks:
            task = self.heartbeat_tasks.pop(websocket)
            if not task.done():
                task.cancel()
    
    async def _heartbeat_loop(self, websocket: WebSocket):
        """Send periodic ping messages to keep connection alive"""
        try:
            while True:
                await asyncio.sleep(30)  # Send ping every 30 seconds
                
                # Check if connection is still alive
                if websocket.client_state.name != 'CONNECTED':
                    break
                    
                try:
                    await websocket.send_json({"type": "ping"})
                    logger.debug(f"Sent ping to WebSocket")
                except Exception as e:
                    logger.warning(f"Failed to send ping: {e}")
                    break
                    
        except asyncio.CancelledError:
            logger.debug("Heartbeat task cancelled")
        except Exception as e:
            logger.error(f"Heartbeat error: {e}")
    
    async def broadcast_to_market(self, data: dict):
        """Broadcast data to market connections based on their subscriptions"""
        if not self.market_connections:
            return
        
        symbol = data.get('symbol')
        if not symbol:
            # If no symbol specified, broadcast to all connections
            await self._broadcast_to_all_market(data)
            return
        
        disconnected = []
        sent_count = 0
        
        for connection in self.market_connections:
            try:
                # Check if client is subscribed to this symbol
                if symbol in self.get_client_subscriptions(connection):
                    await connection.send_json(data)
                    sent_count += 1
                else:
                    logger.debug(f"Skipping {symbol} data for unsubscribed client")
            except Exception as e:
                logger.warning(f"Failed to send to market connection: {e}")
                disconnected.append(connection)
        
        logger.debug(f"Broadcasted {symbol} data to {sent_count}/{len(self.market_connections)} clients")
        
        # Clean up disconnected connections
        for conn in disconnected:
            self.disconnect_market(conn)
    
    async def _broadcast_to_all_market(self, data: dict):
        """Broadcast data to all market connections regardless of subscriptions"""
        disconnected = []
        for connection in self.market_connections:
            try:
                await connection.send_json(data)
            except Exception as e:
                logger.warning(f"Failed to send to market connection: {e}")
                disconnected.append(connection)
        
        # Clean up disconnected connections
        for conn in disconnected:
            self.disconnect_market(conn)
    
    async def broadcast_to_bot(self, data: dict):
        """Broadcast data to all bot connections with error handling"""
        if not self.bot_connections:
            return
        
        disconnected = []
        for connection in self.bot_connections:
            try:
                await connection.send_json(data)
            except Exception as e:
                logger.warning(f"Failed to send to bot connection: {e}")
                disconnected.append(connection)
        
        # Clean up disconnected connections
        for conn in disconnected:
            self.disconnect_bot(conn)

# Global connection manager
manager = ConnectionManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    global binance_client, trading_bot
    
    logger.info("🚀 Starting SRInance3 application...")
    
    try:
        # Initialize database
        logger.info("📊 Initializing database...")
        init_db()
        
        # Initialize Binance client
        logger.info("🔗 Initializing Binance client...")
        global binance_client, binance_ws_client
        binance_client = BinanceClient()
        await binance_client.initialize()
        
        # Initialize Binance WebSocket client
        logger.info("🌐 Initializing Binance WebSocket client...")
        # Streams for ticker data of popular symbols
        streams = [
            'btcusdt@ticker',
            'ethusdt@ticker', 
            'adausdt@ticker',
            'dotusdt@ticker',
            'linkusdt@ticker'
        ]
        binance_ws_client = BinanceWebSocketClient(
            streams=streams,
            queues=[market_data_queue],
            main_loop=asyncio.get_event_loop()
        )
        binance_ws_client.connect()
        
        # Initialize trading bot with broadcast_callback i event loop
        logger.info("🤖 Initializing trading bot...")
        global trading_bot
        trading_bot = TradingBot(
            market_data_queue=None,
            broadcast_callback=manager.broadcast_to_bot,
            main_loop=asyncio.get_event_loop()
        )
        
        # Start background tasks
        logger.info("⚡ Starting background tasks...")
        asyncio.create_task(market_data_broadcaster())
        asyncio.create_task(bot_log_broadcaster())
        
        logger.info("✅ Application startup completed successfully!")
        yield
        
    except Exception as e:
        logger.error(f"❌ Application startup failed: {e}")
        raise
    finally:
        # Cleanup
        logger.info("🔄 Shutting down application...")
        
        if trading_bot and trading_bot.running:
            logger.info("🛑 Stopping trading bot...")
            if hasattr(trading_bot.stop, '__call__'):
                if asyncio.iscoroutinefunction(trading_bot.stop):
                    await trading_bot.stop()
                else:
                    trading_bot.stop()
        
        if binance_client:
            logger.info("🔌 Closing Binance client...")
            await binance_client.close()
        
        if binance_ws_client:
            logger.info("🔌 Closing Binance WebSocket client...")
            binance_ws_client.close()
        
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

async def market_data_broadcaster():
    """Background task to broadcast market data from Binance WebSocket"""
    logger.info("📡 Starting market data broadcaster...")
    
    while True:
        try:
            # Check if we have connections to broadcast to
            if not manager.market_connections:
                await asyncio.sleep(1)
                continue
                
            # Process messages from WebSocket queue
            try:
                # Non-blocking get from queue
                message = market_data_queue.get_nowait()
                
                # Parse the WebSocket message
                data = json.loads(message)
                logger.debug(f"Received WebSocket data: {data}")
                
                # Handle single stream (testnet) vs multi-stream (prod) format
                if 'stream' in data:
                    # Multi-stream format (production)
                    stream_data = data['data']
                    stream_name = data['stream']
                else:
                    # Single stream format (testnet)
                    stream_data = data
                    # Extract stream name from data context or default
                    stream_name = f"{stream_data.get('s', '').lower()}@ticker"
                
                # Process ticker data
                if '@ticker' in stream_name:
                    symbol = stream_data.get('s')  # Symbol like 'BTCUSDT'
                    if symbol:
                        ticker_data = {
                            "type": "ticker",
                            "symbol": symbol,
                            "price": stream_data.get('c', '0'),  # Current price
                            "change": stream_data.get('P', '0'),  # Price change percent
                            "changePercent": f"{stream_data.get('P', '0')}%"  # Add % sign
                        }
                        
                        logger.debug(f"Broadcasting ticker data for {symbol}: {ticker_data}")
                        await manager.broadcast_to_market(ticker_data)
                
            except queue.Empty:
                # No messages in queue, wait a bit
                await asyncio.sleep(0.1)
                continue
            
            # Also get orderbook data via REST API (less frequent updates are OK)
            if binance_client and manager.market_connections:
                # Get unique subscribed symbols
                subscribed_symbols = set()
                for client_subs in manager.client_subscriptions.values():
                    subscribed_symbols.update(client_subs)
                
                for symbol in subscribed_symbols:
                    try:
                        # Get order book data
                        orderbook = await binance_client.get_order_book(symbol, limit=20)
                        if orderbook:
                            await manager.broadcast_to_market({
                                "type": "orderbook",
                                "symbol": symbol,
                                "bids": orderbook.get('bids', [])[:10],
                                "asks": orderbook.get('asks', [])[:10]
                            })
                            
                    except Exception as e:
                        logger.warning(f"Failed to get orderbook for {symbol}: {e}")
                        continue
                        
                # Wait between orderbook updates
                await asyncio.sleep(5)
            
        except Exception as e:
            logger.error(f"Market data broadcaster error: {e}")
            await asyncio.sleep(10)  # Wait longer on error

async def bot_log_broadcaster():
    """Background task to broadcast bot logs and status"""
    logger.info("📝 Starting bot log broadcaster...")
    
    while True:
        try:
            if trading_bot and manager.bot_connections:
                # Broadcast bot status
                temp_update = getattr(trading_bot, 'last_update', None)
                status_data = {
                    "type": "bot_status",
                    "running": trading_bot.running,
                    "status": {
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
            logger.error(f"Bot log broadcaster error: {e}")
            await asyncio.sleep(10)

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
                            ticker = await binance_client.get_ticker(symbol)
                            if ticker:
                                await websocket.send_json({
                                    "type": "ticker",
                                    "symbol": symbol,
                                    "price": ticker.get('price', '0')
                                })
                        except Exception as e:
                            logger.warning(f"Failed to get immediate ticker for {symbol}: {e}")
                
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
                            "status": trading_bot.get_status()
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
                                "status": {}
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

# Health check endpoint
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

# REST API Endpoints
@app.get("/account")
async def get_account():
    """Get account information"""
    try:
        if binance_client:
            account_info = binance_client.get_account_info()
            return account_info
        else:
            return {"error": "Binance client not available"}
    except Exception as e:
        logger.error(f"Account endpoint error: {e}")
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
            logger.error(f"Failed to get ticker for {symbol}")
            raise HTTPException(status_code=404, detail=f"Ticker not found for symbol {symbol}")

        return ticker
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        logger.error(f"Ticker endpoint error for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/orderbook")
async def get_orderbook(symbol: str, limit: int = 20):
    """Get order book for a symbol"""
    try:
        if binance_client:
            orderbook = binance_client.get_orderbook(symbol, limit)
            return orderbook
        else:
            return {"error": "Binance client not available"}
    except Exception as e:
        logger.error(f"Order book endpoint error: {e}")
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
        logger.error(f"Bot status endpoint error: {e}")
        return {"error": str(e)}

@app.get("/bot/logs")
async def get_bot_logs():
    """Get bot logs"""
    try:
        # For now, return placeholder logs
        return {"logs": ["Bot initialized", "Ready for trading"]}
    except Exception as e:
        logger.error(f"Bot logs endpoint error: {e}")
        return {"error": str(e)}

if __name__ == "__main__":
    logger.info("🚀 Starting SRInance3 server...")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )