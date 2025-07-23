import asyncio
import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from typing import Dict, List
import uvicorn

from binance_client import BinanceClient
from database.crud import init_database
from database.log import setup_logging
from bot.trading_bot import TradingBot

# Setup logging
setup_logging()
logger = logging.getLogger(__name__)

# Global instances
binance_client: BinanceClient = None
trading_bot: TradingBot = None
market_connections: List[WebSocket] = []
bot_connections: List[WebSocket] = []

class ConnectionManager:
    """Enhanced connection manager with heartbeat support"""
    
    def __init__(self):
        self.market_connections: List[WebSocket] = []
        self.bot_connections: List[WebSocket] = []
        self.heartbeat_tasks: Dict[WebSocket, asyncio.Task] = {}
    
    async def connect_market(self, websocket: WebSocket):
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
        
        self._cleanup_heartbeat(websocket)
    
    def disconnect_bot(self, websocket: WebSocket):
        if websocket in self.bot_connections:
            self.bot_connections.remove(websocket)
            logger.info(f"Bot WebSocket disconnected. Remaining connections: {len(self.bot_connections)}")
        
        self._cleanup_heartbeat(websocket)
    
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
        """Broadcast data to all market connections with error handling"""
        if not self.market_connections:
            return
        
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
        init_database()
        
        # Initialize Binance client
        logger.info("🔗 Initializing Binance client...")
        binance_client = BinanceClient()
        await binance_client.initialize()
        
        # Initialize trading bot
        logger.info("🤖 Initializing trading bot...")
        trading_bot = TradingBot(binance_client)
        
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
        
        if trading_bot and trading_bot.is_running:
            logger.info("🛑 Stopping trading bot...")
            await trading_bot.stop()
        
        if binance_client:
            logger.info("🔌 Closing Binance client...")
            await binance_client.close()
        
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
    """Background task to broadcast market data"""
    logger.info("📡 Starting market data broadcaster...")
    
    while True:
        try:
            if binance_client and manager.market_connections:
                # Get ticker data for popular symbols
                symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT', 'LINKUSDT']
                
                for symbol in symbols:
                    try:
                        ticker = await binance_client.get_ticker(symbol)
                        if ticker:
                            await manager.broadcast_to_market({
                                "type": "ticker",
                                "symbol": symbol,
                                "price": ticker.get('price', '0'),
                                "change": ticker.get('priceChange', '0'),
                                "changePercent": ticker.get('priceChangePercent', '0%')
                            })
                        
                        # Get order book data
                        orderbook = await binance_client.get_order_book(symbol, limit=20)
                        if orderbook:
                            await manager.broadcast_to_market({
                                "type": "orderbook",
                                "symbol": symbol,
                                "bids": orderbook.get('bids', [])[:10],
                                "asks": orderbook.get('asks', [])[:10]
                            })
                        
                        await asyncio.sleep(2)  # Delay between symbols
                        
                    except Exception as e:
                        logger.warning(f"Failed to get market data for {symbol}: {e}")
                        continue
            
            await asyncio.sleep(5)  # Wait before next cycle
            
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
                status_data = {
                    "type": "bot_status",
                    "running": trading_bot.is_running,
                    "status": {
                        "symbol": getattr(trading_bot, 'symbol', None),
                        "strategy": getattr(trading_bot, 'strategy', None),
                        "balance": getattr(trading_bot, 'balance', 0),
                        "position": getattr(trading_bot, 'position', None),
                        "last_action": getattr(trading_bot, 'last_action', None),
                        "timestamp": trading_bot.last_update.isoformat() if hasattr(trading_bot, 'last_update') else None
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
    client_id = f"{websocket.client.host}:{websocket.client.port}"
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
                    logger.info(f"Market client subscribed to {symbol}")
                    
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
    client_id = f"{websocket.client.host}:{websocket.client.port}"
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
                "running": trading_bot.is_running,
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
                            "running": trading_bot.is_running,
                            "status": {
                                "symbol": getattr(trading_bot, 'symbol', None),
                                "strategy": getattr(trading_bot, 'strategy', None),
                                "balance": getattr(trading_bot, 'balance', 0),
                            }
                        })
                
                elif message_type == 'start_bot':
                    symbol = data.get('symbol', 'BTCUSDT')
                    strategy = data.get('strategy', 'simple_momentum')
                    
                    logger.info(f"Starting bot with symbol={symbol}, strategy={strategy}")
                    
                    if trading_bot and not trading_bot.is_running:
                        try:
                            await trading_bot.start(symbol=symbol, strategy=strategy)
                            
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
                    
                    if trading_bot and trading_bot.is_running:
                        try:
                            await trading_bot.stop()
                            
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
        "bot_running": trading_bot.is_running if trading_bot else False
    }

if __name__ == "__main__":
    logger.info("🚀 Starting SRInance3 server...")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )