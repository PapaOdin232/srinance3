from fastapi import FastAPI, Depends, Request, HTTPException
app = FastAPI()
from pydantic import BaseModel
from backend.binance_client import BinanceRESTClient
from backend.bot.trading_bot import TradingBot


import os
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "example_admin_token")

def admin_auth(request: Request):
    token = request.headers.get("Authorization")
    if token != f"Bearer {ADMIN_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")

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
