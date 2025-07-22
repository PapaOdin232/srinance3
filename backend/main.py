
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from backend.database.log import log_error

app = FastAPI()


# WebSocket endpoint do cyklicznego wysyłania tickera i orderbooka

import asyncio
import threading
import json
from backend.binance_client import BinanceWebSocketClient


# --- Binance WebSocket integration (MVP: broadcast do wszystkich klientów) ---
binance_streams = [
    "btcusdt@ticker",
    "btcusdt@depth",
    "btcusdt@kline_1m"
]
binance_queue = asyncio.Queue()


# Przekaż referencję do głównej event loop do klienta WS
main_loop = asyncio.get_event_loop()
binance_ws_client = BinanceWebSocketClient(binance_streams, queue=binance_queue, main_loop=main_loop)
binance_ws_client.connect()

@app.websocket("/ws/market")
async def websocket_market(websocket: WebSocket):
    await websocket.accept()
    print("[WebSocket] Nowe połączenie /ws/market")
    try:
        while True:
            try:
                # Odbierz wiadomość z kolejki i wyślij do klienta
                msg = await binance_queue.get()
                try:
                    data = json.loads(msg)
                except Exception:
                    data = msg
                await websocket.send_json(data)
            except WebSocketDisconnect:
                print("[WebSocket] Klient rozłączył się /ws/market")
                break
            except Exception as e:
                print(f"[WebSocket ERROR] {e}")
                break
    except WebSocketDisconnect:
        print("[WebSocket] WebSocketDisconnect na zewnątrz pętli /ws/market")
    print("[WebSocket] Zakończono pętlę /ws/market")

# Globalny handler błędów
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log_error(exc)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal Server Error: {str(exc)}"}
    )

# Konfiguracja CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)
from pydantic import BaseModel
from backend.binance_client import BinanceRESTClient
from backend.bot.trading_bot import TradingBot



from backend.config import ADMIN_TOKEN

def admin_auth(request: Request):
    token = request.headers.get("Authorization")
    if not token or token != f"Bearer {ADMIN_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized: invalid or missing token")

client = BinanceRESTClient()
bot = TradingBot()


class SymbolRequest(BaseModel):
    symbol: str

class AssetRequest(BaseModel):
    asset: str


@app.get("/account")
def get_account():
    return client.get_account_info()

@app.get("/account/history")
def get_account_history(symbol: str):
    return client.get_account_trades(symbol)

@app.get("/account/balance")
def get_account_balance(asset: str):
    return client.get_balance(asset)


@app.get("/ticker")
def get_ticker(symbol: str):
    return client.get_ticker(symbol)

@app.get("/orderbook")
def get_orderbook(symbol: str, limit: int = 10):
    return client.get_orderbook(symbol, limit)


class BotActionRequest(BaseModel):
    action: str

@app.post("/bot/start")
async def start_bot(request: Request):
    admin_auth(request)
    bot.start()
    return {"status": bot.get_status()}

@app.post("/bot/stop")
async def stop_bot(request: Request):
    admin_auth(request)
    bot.stop()
    return {"status": bot.get_status()}

@app.get("/bot/status")
async def bot_status(request: Request):
    admin_auth(request)
    return {"status": bot.get_status()}

@app.get("/bot/logs")
async def bot_logs(request: Request):
    admin_auth(request)
    return {"logs": bot.get_logs()}
