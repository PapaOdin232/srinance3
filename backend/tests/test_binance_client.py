def test_get_ticker_testnet():
    client = BinanceRESTClient()
    result = client.get_ticker("BTCUSDT")
    assert "symbol" in result
from backend.binance_client import BinanceRESTClient

def test_get_account_info():
    client = BinanceRESTClient()
    result = client.get_account_info()
    assert isinstance(result, dict)
import pytest
from backend.binance_client import BinanceRESTClient

class DummyResponse:
    def __init__(self, json_data):
        self._json = json_data
    def json(self):
        return self._json
    def raise_for_status(self):
        pass

def test_get_ticker(monkeypatch):
    client = BinanceRESTClient()
    def mock_get(*args, **kwargs):
        return DummyResponse({"symbol": "BTCUSDT", "price": "60000.00"})
    monkeypatch.setattr("requests.get", mock_get)
    result = client.get_ticker("BTCUSDT")
    assert result["symbol"] == "BTCUSDT"
    assert float(result["price"]) > 0
