from backend.bot.trading_bot import TradingBot

def test_bot_start_stop():
    bot = TradingBot()
    bot.start()
    assert bot.get_status()["status"] == "running"
    bot.stop()
    assert bot.get_status()["status"] == "stopped"
