"""
Basic tests for WebSocket API client
"""

import asyncio
import pytest
from unittest.mock import Mock, AsyncMock
from backend.ws_api_client import BinanceWSApiClient


class TestBinanceWSApiClient:
    
    def test_init(self):
        """Test client initialization"""
        client = BinanceWSApiClient(
            api_key="test_key",
            api_secret="test_secret",
            ws_api_url="wss://test.example.com/ws-api/v3"
        )
        
        assert client.api_key == "test_key"
        assert client.api_secret == "test_secret"
        assert client.ws_api_url == "wss://test.example.com/ws-api/v3"
        assert not client.is_connected
        assert client._request_id == 0
        assert len(client._pending_requests) == 0
    
    def test_get_next_request_id(self):
        """Test request ID generation"""
        client = BinanceWSApiClient("key", "secret", "wss://test.com")
        
        id1 = client._get_next_request_id()
        id2 = client._get_next_request_id()
        id3 = client._get_next_request_id()
        
        assert id1 == 1
        assert id2 == 2
        assert id3 == 3
    
    def test_sign_params(self):
        """Test parameter signing"""
        client = BinanceWSApiClient("key", "test_secret", "wss://test.com")
        
        params = {
            "symbol": "BTCUSDT",
            "side": "BUY",
            "type": "MARKET",
            "quantity": "0.001"
        }
        
        signed_params = client._sign_params(params)
        
        # Should contain original params plus timestamp and signature
        assert "signature" in signed_params
        assert "timestamp" in signed_params
        assert signed_params["symbol"] == "BTCUSDT"
        assert signed_params["side"] == "BUY"
        assert signed_params["type"] == "MARKET"
        assert signed_params["quantity"] == "0.001"
        assert len(signed_params["signature"]) == 64  # HMAC SHA256 hex length
    
    def test_get_stats(self):
        """Test statistics retrieval"""
        client = BinanceWSApiClient("key", "secret", "wss://test.com")
        
        stats = client.get_stats()
        
        assert "connected" in stats
        assert "pending_requests" in stats
        assert "requests_sent" in stats
        assert "responses_received" in stats
        assert "timeouts" in stats
        assert "errors" in stats
        assert "reconnections" in stats
        
        assert stats["connected"] is False
        assert stats["pending_requests"] == 0
        assert stats["requests_sent"] == 0


@pytest.mark.asyncio
async def test_disconnect_cleanup():
    """Test proper cleanup on disconnect"""
    client = BinanceWSApiClient("key", "secret", "wss://test.com")
    
    # Simulate some pending requests
    future1 = asyncio.Future()
    future2 = asyncio.Future()
    client._pending_requests[1] = future1
    client._pending_requests[2] = future2
    
    # Mock websocket
    client.websocket = Mock()
    client.websocket.close = AsyncMock()
    client.is_connected = True
    
    await client.disconnect()
    
    # Should cleanup pending requests
    assert len(client._pending_requests) == 0
    assert future1.done()
    assert future2.done()
    assert not client.is_connected
    assert client.websocket is None


def test_message_processing():
    """Test message processing logic"""
    client = BinanceWSApiClient("key", "secret", "wss://test.com")
    
    # Create a pending request
    future = asyncio.Future()
    client._pending_requests[123] = future
    
    # Test successful response
    asyncio.run(client._process_message({
        "id": 123,
        "result": {"orderId": 456, "status": "FILLED"}
    }))
    
    assert future.done()
    assert future.result() == {"orderId": 456, "status": "FILLED"}
    assert 123 not in client._pending_requests


if __name__ == "__main__":
    # Run basic tests
    test_client = TestBinanceWSApiClient()
    test_client.test_init()
    test_client.test_get_next_request_id()
    test_client.test_sign_params()
    test_client.test_get_stats()
    
    print("✅ Basic tests passed!")
    
    # Run async tests
    asyncio.run(test_disconnect_cleanup())
    test_message_processing()
    
    print("✅ All tests passed!")
