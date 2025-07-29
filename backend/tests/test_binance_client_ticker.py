import pytest
import asyncio
from unittest.mock import Mock, patch, AsyncMock
from backend.binance_client import BinanceClient

@pytest.fixture
def binance_client():
    """Fixture for BinanceClient instance"""
    return BinanceClient()

@pytest.mark.asyncio
async def test_get_ticker_24hr_success(binance_client):
    """Test successful ticker 24hr data retrieval"""
    mock_response = {
        "symbol": "BTCUSDT",
        "lastPrice": "45000.00",
        "priceChange": "1000.00",
        "priceChangePercent": "2.27"
    }
    
    with patch('asyncio.to_thread') as mock_to_thread:
        mock_to_thread.return_value = mock_response
        
        result = await binance_client.get_ticker_24hr("BTCUSDT")
        
        assert result is not None
        assert result["symbol"] == "BTCUSDT"
        assert result["lastPrice"] == "45000.00"
        assert result["priceChange"] == "1000.00"
        assert result["priceChangePercent"] == "2.27"

@pytest.mark.asyncio
async def test_get_ticker_24hr_failure(binance_client):
    """Test ticker 24hr data retrieval failure"""
    with patch('asyncio.to_thread') as mock_to_thread:
        mock_to_thread.side_effect = Exception("API Error")
        
        result = await binance_client.get_ticker_24hr("BTCUSDT")
        
        assert result is None

@pytest.mark.asyncio
async def test_get_order_book_success(binance_client):
    """Test successful order book retrieval"""
    mock_response = {
        "bids": [["45000.00", "1.0"], ["44999.00", "2.0"]],
        "asks": [["45001.00", "1.5"], ["45002.00", "0.5"]]
    }
    
    with patch('asyncio.to_thread') as mock_to_thread:
        mock_to_thread.return_value = mock_response
        
        result = await binance_client.get_order_book("BTCUSDT", limit=20)
        
        assert result is not None
        assert "bids" in result
        assert "asks" in result
        assert len(result["bids"]) == 2
        assert len(result["asks"]) == 2

@pytest.mark.asyncio
async def test_get_order_book_failure(binance_client):
    """Test order book retrieval failure"""
    with patch('asyncio.to_thread') as mock_to_thread:
        mock_to_thread.side_effect = Exception("API Error")
        
        result = await binance_client.get_order_book("BTCUSDT")
        
        assert result is None
