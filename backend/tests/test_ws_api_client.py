"""
Comprehensive tests for BinanceWSApiClient
Tests WebSocket connection, message handling, trading operations,
error scenarios, and statistics tracking.
"""

import pytest
import asyncio
import json
import time
from unittest.mock import AsyncMock, Mock, patch, MagicMock
import websockets.exceptions

from backend.ws_api_client import BinanceWSApiClient


class TestBinanceWSApiClientInit:
    """Test initialization and configuration."""
    
    def test_init_basic_config(self):
        """Test basic client initialization."""
        client = BinanceWSApiClient(
            api_key="test_api_key",
            api_secret="test_api_secret", 
            ws_api_url="wss://testnet.binance.vision/ws-api/v3"
        )
        
        assert client.api_key == "test_api_key"
        assert client.api_secret == "test_api_secret"
        assert client.ws_api_url == "wss://testnet.binance.vision/ws-api/v3"
        assert client.timeout == 5.0
        assert client.max_retries == 3
        assert not client.is_connected
        assert not client.is_connecting
        assert client._request_id == 0
        assert len(client._pending_requests) == 0
    
    def test_init_custom_config(self):
        """Test initialization with custom parameters."""
        client = BinanceWSApiClient(
            api_key="key",
            api_secret="secret",
            ws_api_url="wss://api.binance.com/ws-api/v3",
            timeout=10.0,
            max_retries=5
        )
        
        assert client.timeout == 10.0
        assert client.max_retries == 5
        assert client._max_reconnect_attempts == 10
        assert client._reconnect_delay == 1.0
        assert client.stats == {
            'requests_sent': 0,
            'responses_received': 0,
            'timeouts': 0,
            'errors': 0,
            'reconnections': 0
        }
    
    def test_get_next_request_id(self):
        """Test request ID generation."""
        client = BinanceWSApiClient("key", "secret", "wss://test.com")
        
        assert client._get_next_request_id() == 1
        assert client._get_next_request_id() == 2
        assert client._get_next_request_id() == 3
        assert client._request_id == 3


class TestSigningAndAuthentication:
    """Test HMAC signing and authentication."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        return BinanceWSApiClient("test_key", "test_secret", "wss://test.com")
    
    @patch('time.time')
    def test_sign_params_basic(self, mock_time, client):
        """Test parameter signing without timestamp."""
        mock_time.return_value = 1234567.890
        
        params = {'symbol': 'BTCUSDT', 'side': 'BUY'}
        signed = client._sign_params(params)
        
        assert 'timestamp' in signed
        assert signed['timestamp'] == 1234567890
        assert 'signature' in signed
        assert signed['symbol'] == 'BTCUSDT'
        assert signed['side'] == 'BUY'
        assert isinstance(signed['signature'], str)
        assert len(signed['signature']) == 64  # SHA256 hex length
    
    @patch('time.time')
    def test_sign_params_with_timestamp(self, mock_time, client):
        """Test parameter signing with existing timestamp."""
        mock_time.return_value = 1234567.890
        
        params = {'symbol': 'BTCUSDT', 'timestamp': 1111111111}
        signed = client._sign_params(params)
        
        # Should preserve existing timestamp
        assert signed['timestamp'] == 1111111111
        assert 'signature' in signed
    
    def test_sign_params_signature_consistency(self, client):
        """Test signature consistency for identical parameters."""
        params1 = {'symbol': 'BTCUSDT', 'timestamp': 1234567890}
        params2 = {'symbol': 'BTCUSDT', 'timestamp': 1234567890}
        
        signed1 = client._sign_params(params1)
        signed2 = client._sign_params(params2)
        
        assert signed1['signature'] == signed2['signature']
    
    def test_sign_params_different_order(self, client):
        """Test that parameter order doesn't affect signature."""
        params1 = {'symbol': 'BTCUSDT', 'side': 'BUY', 'timestamp': 1234567890}
        params2 = {'side': 'BUY', 'timestamp': 1234567890, 'symbol': 'BTCUSDT'}
        
        signed1 = client._sign_params(params1)
        signed2 = client._sign_params(params2)
        
        assert signed1['signature'] == signed2['signature']


class TestConnectionManagement:
    """Test WebSocket connection management."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        return BinanceWSApiClient("key", "secret", "wss://test.com", timeout=2.0)
    
    @pytest.mark.asyncio
    async def test_connect_success(self, client):
        """Test successful connection."""
        mock_websocket = AsyncMock()
        
        async def mock_websocket_connect(*args, **kwargs):
            return mock_websocket
        
        with patch('websockets.connect', side_effect=mock_websocket_connect) as mock_connect:
            with patch.object(client, '_handle_messages') as mock_handler:
                with patch.object(client, '_ping_loop') as mock_ping:
                    result = await client.connect()
        
        assert result is True
        assert client.is_connected is True
        assert client.is_connecting is False
        assert client.websocket == mock_websocket
        assert client._reconnect_attempts == 0
        assert client.stats['reconnections'] == 1
        
        mock_connect.assert_called_once_with(
            "wss://test.com",
            ping_interval=20,
            ping_timeout=10,
            close_timeout=10
        )
    
    @pytest.mark.asyncio
    async def test_connect_already_connected(self, client):
        """Test connection when already connected."""
        client.is_connected = True
        
        result = await client.connect()
        
        assert result is True
        # Should not attempt new connection
    
    @pytest.mark.asyncio
    async def test_connect_already_connecting(self, client):
        """Test connection when already in connecting state."""
        client.is_connecting = True
        
        result = await client.connect()
        
        assert result is False  # is_connected is still False
    
    @pytest.mark.asyncio
    async def test_connect_failure(self, client):
        """Test connection failure."""
        with patch('websockets.connect', side_effect=Exception("Connection failed")):
            result = await client.connect()
        
        assert result is False
        assert client.is_connected is False
        assert client.is_connecting is False
        assert client.websocket is None
    
    @pytest.mark.asyncio
    async def test_connect_timeout(self, client):
        """Test connection timeout."""
        with patch('websockets.connect', side_effect=asyncio.TimeoutError("Timeout")):
            result = await client.connect()
        
        assert result is False
        assert client.is_connected is False
    
    @pytest.mark.asyncio
    async def test_disconnect_success(self, client):
        """Test successful disconnection."""
        # Setup connected state
        mock_websocket = AsyncMock()
        mock_handler_task = AsyncMock()
        mock_ping_task = AsyncMock()
        
        client.websocket = mock_websocket
        client.is_connected = True
        client._message_handler_task = mock_handler_task
        client._ping_task = mock_ping_task
        
        # Add pending request
        future = asyncio.Future()
        client._pending_requests[1] = future
        
        await client.disconnect()
        
        assert client.is_connected is False
        assert client.websocket is None
        assert len(client._pending_requests) == 0
        
        mock_handler_task.cancel.assert_called_once()
        mock_ping_task.cancel.assert_called_once()
        mock_websocket.close.assert_called_once()
        
        # Check that pending request was cancelled
        assert future.done()
        with pytest.raises(ConnectionError):
            await future


class TestMessageHandling:
    """Test WebSocket message processing."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        return BinanceWSApiClient("key", "secret", "wss://test.com")
    
    @pytest.mark.asyncio
    async def test_process_message_success_response(self, client):
        """Test processing successful response message."""
        # Setup pending request
        future = asyncio.Future()
        client._pending_requests[123] = future
        
        message = {
            'id': 123,
            'result': {'orderId': 456, 'status': 'FILLED'}
        }
        
        await client._process_message(message)
        
        assert 123 not in client._pending_requests
        assert future.done()
        result = await future
        assert result == {'orderId': 456, 'status': 'FILLED'}
        assert client.stats['responses_received'] == 1
    
    @pytest.mark.asyncio
    async def test_process_message_error_response(self, client):
        """Test processing error response message."""
        future = asyncio.Future()
        client._pending_requests[123] = future
        
        message = {
            'id': 123,
            'error': {'code': -1013, 'msg': 'Invalid quantity'}
        }
        
        await client._process_message(message)
        
        assert 123 not in client._pending_requests
        assert future.done()
        with pytest.raises(Exception) as exc_info:
            await future
        assert "Invalid quantity" in str(exc_info.value)
        assert client.stats['errors'] == 1
    
    @pytest.mark.asyncio
    async def test_process_message_no_pending_request(self, client):
        """Test processing message with no pending request."""
        message = {
            'id': 999,
            'result': {'status': 'OK'}
        }
        
        # Should not raise exception
        await client._process_message(message)
        assert client.stats['responses_received'] == 0
    
    @pytest.mark.asyncio
    async def test_process_message_notification(self, client):
        """Test processing notification message (no id)."""
        message = {
            'stream': 'btcusdt@ticker',
            'data': {'price': '50000'}
        }
        
        # Should not raise exception
        await client._process_message(message)
    
    @pytest.mark.asyncio
    async def test_handle_messages_connection_closed(self, client):
        """Test message handler when connection closes."""
        mock_websocket = AsyncMock()
        mock_websocket.__aiter__.side_effect = websockets.exceptions.ConnectionClosed(None, None)
        
        client.websocket = mock_websocket
        client.is_connected = True
        
        await client._handle_messages()
        
        assert client.is_connected is False
    
    @pytest.mark.asyncio
    async def test_handle_messages_json_decode_error(self, client):
        """Test message handler with invalid JSON."""
        mock_websocket = AsyncMock()
        # Simulate receiving invalid JSON
        mock_websocket.__aiter__.return_value = iter(['invalid json', '{"id": 1, "result": {}}'])
        
        client.websocket = mock_websocket
        client.is_connected = True
        
        # Should handle error gracefully
        with patch.object(client, '_process_message') as mock_process:
            try:
                await client._handle_messages()
            except StopAsyncIteration:
                pass  # Expected when iterator finishes
        
        # Should only process valid message
        mock_process.assert_called_once_with({'id': 1, 'result': {}})
    
    @pytest.mark.asyncio
    async def test_ping_loop(self, client):
        """Test ping loop functionality."""
        mock_websocket = AsyncMock()
        client.websocket = mock_websocket
        client.is_connected = True
        
        # Create a task that will stop the ping loop after short delay
        async def stop_after_delay():
            await asyncio.sleep(0.1)
            client.is_connected = False
        
        stop_task = asyncio.create_task(stop_after_delay())
        
        # Run ping loop (should stop when is_connected becomes False)
        with patch('asyncio.sleep', side_effect=[None, asyncio.CancelledError()]):
            try:
                await client._ping_loop()
            except asyncio.CancelledError:
                pass
        
        await stop_task


class TestSendRequest:
    """Test request sending functionality."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        return BinanceWSApiClient("key", "secret", "wss://test.com", timeout=1.0)
    
    @pytest.mark.asyncio
    async def test_send_request_success(self, client):
        """Test successful request sending."""
        mock_websocket = AsyncMock()
        client.websocket = mock_websocket
        client.is_connected = True
        
        # Mock successful response
        async def mock_response():
            # Simulate response after short delay
            await asyncio.sleep(0.1)
            future = client._pending_requests[1]  # First request ID
            future.set_result({'status': 'OK'})
            # Ensure the future is properly resolved
            await future
        
        response_task = asyncio.create_task(mock_response())
        
        result = await client._send_request('test.method', {'param1': 'value1'})
        
        await response_task
        
        assert result == {'status': 'OK'}
        assert client.stats['requests_sent'] == 1
        assert len(client._pending_requests) == 0
        
        # Verify message was sent
        mock_websocket.send.assert_called_once()
        sent_data = mock_websocket.send.call_args[0][0]
        sent_message = json.loads(sent_data)
        assert sent_message['method'] == 'test.method'
        assert sent_message['id'] == 1
        assert 'apiKey' in sent_message['params']
        assert 'signature' in sent_message['params']
    
    @pytest.mark.asyncio
    async def test_send_request_unsigned(self, client):
        """Test sending unsigned request."""
        mock_websocket = AsyncMock()
        client.websocket = mock_websocket
        client.is_connected = True
        
        async def mock_response():
            await asyncio.sleep(0.1)
            future = client._pending_requests[1]
            future.set_result({'status': 'OK'})
        
        response_task = asyncio.create_task(mock_response())
        
        result = await client._send_request('ping', signed=False)
        
        await response_task
        
        sent_data = mock_websocket.send.call_args[0][0]
        sent_message = json.loads(sent_data)
        assert 'apiKey' not in sent_message['params']
        assert 'signature' not in sent_message['params']
    
    @pytest.mark.asyncio
    async def test_send_request_not_connected(self, client):
        """Test sending request when not connected."""
        client.is_connected = False
        
        with patch.object(client, 'connect', return_value=False):
            with pytest.raises(ConnectionError):
                await client._send_request('test.method')
    
    @pytest.mark.asyncio
    async def test_send_request_timeout(self, client):
        """Test request timeout."""
        mock_websocket = AsyncMock()
        client.websocket = mock_websocket
        client.is_connected = True
        
        with pytest.raises(asyncio.TimeoutError) as exc_info:
            await client._send_request('slow.method', {'param': 'value'})
        
        assert "timed out after 1.0s" in str(exc_info.value)
        assert client.stats['timeouts'] == 1
        assert len(client._pending_requests) == 0  # Should be cleaned up
    
    @pytest.mark.asyncio
    async def test_send_request_websocket_error(self, client):
        """Test request with WebSocket send error."""
        mock_websocket = AsyncMock()
        mock_websocket.send.side_effect = Exception("Send failed")
        client.websocket = mock_websocket
        client.is_connected = True
        
        with pytest.raises(Exception) as exc_info:
            await client._send_request('test.method')
        
        assert "Send failed" in str(exc_info.value)
        assert client.stats['errors'] == 1
        assert len(client._pending_requests) == 0  # Should be cleaned up
    
    @pytest.mark.asyncio
    async def test_send_request_no_websocket(self, client):
        """Test sending request with no websocket connection."""
        client.is_connected = True  # State says connected but websocket is None
        client.websocket = None
        
        with pytest.raises(ConnectionError):
            await client._send_request('test.method')


class TestTradingOperations:
    """Test WebSocket trading operations."""
    
    @pytest.fixture
    def client(self):
        """Create test client with mocked send_request."""
        client = BinanceWSApiClient("key", "secret", "wss://test.com")
        return client
    
    @pytest.mark.asyncio
    async def test_place_order_limit(self, client):
        """Test placing limit order."""
        expected_response = {'orderId': 123, 'status': 'NEW'}
        
        with patch.object(client, '_send_request', return_value=expected_response) as mock_send:
            result = await client.place_order_ws(
                symbol='BTCUSDT',
                side='BUY', 
                order_type='LIMIT',
                quantity=0.001,
                price=50000.0,
                time_in_force='GTC'
            )
        
        assert result == expected_response
        mock_send.assert_called_once()
        call_args = mock_send.call_args
        assert call_args[0][0] == 'order.place'  # method
        params = call_args[0][1]  # params
        assert params['symbol'] == 'BTCUSDT'
        assert params['side'] == 'BUY'
        assert params['type'] == 'LIMIT'
        assert params['quantity'] == '0.001'
        assert params['price'] == '50000.0'
        assert params['timeInForce'] == 'GTC'
        assert call_args[1]['signed'] is True  # signed=True
    
    @pytest.mark.asyncio
    async def test_place_order_market(self, client):
        """Test placing market order."""
        expected_response = {'orderId': 124, 'status': 'FILLED'}
        
        with patch.object(client, '_send_request', return_value=expected_response) as mock_send:
            result = await client.place_order_ws(
                symbol='ethusdt',
                side='sell',
                order_type='market', 
                quantity='0.1'
            )
        
        assert result == expected_response
        params = mock_send.call_args[0][1]
        assert params['symbol'] == 'ETHUSDT'  # Should be uppercase
        assert params['side'] == 'SELL'
        assert params['type'] == 'MARKET'
        assert params['quantity'] == '0.1'
        assert 'price' not in params  # Market order shouldn't have price
        assert 'timeInForce' not in params  # Market order shouldn't have TIF
    
    @pytest.mark.asyncio
    async def test_place_order_with_kwargs(self, client):
        """Test placing order with additional parameters."""
        with patch.object(client, '_send_request', return_value={}) as mock_send:
            await client.place_order_ws(
                symbol='BTCUSDT',
                side='BUY',
                order_type='LIMIT',
                quantity=0.001,
                price=50000,
                newClientOrderId='my-order-123',
                icebergQty='0.0001'
            )
        
        params = mock_send.call_args[0][1]
        assert params['newClientOrderId'] == 'my-order-123'
        assert params['icebergQty'] == '0.0001'
    
    @pytest.mark.asyncio
    async def test_cancel_order_by_id(self, client):
        """Test cancelling order by order ID."""
        expected_response = {'orderId': 123, 'status': 'CANCELED'}
        
        with patch.object(client, '_send_request', return_value=expected_response) as mock_send:
            result = await client.cancel_order_ws('BTCUSDT', order_id=123)
        
        assert result == expected_response
        mock_send.assert_called_once_with(
            'order.cancel',
            {'symbol': 'BTCUSDT', 'orderId': '123'},
            signed=True
        )
    
    @pytest.mark.asyncio
    async def test_cancel_order_by_client_id(self, client):
        """Test cancelling order by client order ID."""
        with patch.object(client, '_send_request', return_value={}) as mock_send:
            await client.cancel_order_ws('ETHUSDT', orig_client_order_id='my-order')
        
        mock_send.assert_called_once_with(
            'order.cancel',
            {'symbol': 'ETHUSDT', 'origClientOrderId': 'my-order'},
            signed=True
        )
    
    @pytest.mark.asyncio
    async def test_cancel_order_no_identifier(self, client):
        """Test cancelling order without providing identifier."""
        with pytest.raises(ValueError) as exc_info:
            await client.cancel_order_ws('BTCUSDT')
        
        assert "Either orderId or origClientOrderId must be provided" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_query_order_by_id(self, client):
        """Test querying order by order ID."""
        expected_response = {'orderId': 123, 'status': 'FILLED', 'executedQty': '0.001'}
        
        with patch.object(client, '_send_request', return_value=expected_response) as mock_send:
            result = await client.query_order_ws('BTCUSDT', order_id=123)
        
        assert result == expected_response
        mock_send.assert_called_once_with(
            'order.status',
            {'symbol': 'BTCUSDT', 'orderId': '123'},
            signed=True
        )
    
    @pytest.mark.asyncio
    async def test_query_order_by_client_id(self, client):
        """Test querying order by client order ID."""
        with patch.object(client, '_send_request', return_value={}) as mock_send:
            await client.query_order_ws('ETHUSDT', orig_client_order_id='my-order')
        
        mock_send.assert_called_once_with(
            'order.status',
            {'symbol': 'ETHUSDT', 'origClientOrderId': 'my-order'},
            signed=True
        )
    
    @pytest.mark.asyncio
    async def test_query_order_no_identifier(self, client):
        """Test querying order without providing identifier."""
        with pytest.raises(ValueError) as exc_info:
            await client.query_order_ws('BTCUSDT')
        
        assert "Either orderId or origClientOrderId must be provided" in str(exc_info.value)
    
    @pytest.mark.asyncio
    async def test_get_account_ws(self, client):
        """Test getting account information."""
        expected_response = {'balances': [{'asset': 'BTC', 'free': '1.0'}]}
        
        with patch.object(client, '_send_request', return_value=expected_response) as mock_send:
            result = await client.get_account_ws()
        
        assert result == expected_response
        mock_send.assert_called_once_with('account.status', {}, signed=True)


class TestStatisticsAndDiagnostics:
    """Test statistics and diagnostic functionality."""
    
    def test_get_stats_initial(self):
        """Test getting initial statistics."""
        client = BinanceWSApiClient("key", "secret", "wss://test.com")
        
        stats = client.get_stats()
        
        assert stats == {
            'requests_sent': 0,
            'responses_received': 0,
            'timeouts': 0,
            'errors': 0,
            'reconnections': 0,
            'connected': False,
            'pending_requests': 0
        }
    
    def test_get_stats_with_data(self):
        """Test getting statistics with data."""
        client = BinanceWSApiClient("key", "secret", "wss://test.com")
        
        # Simulate some activity
        client.stats['requests_sent'] = 10
        client.stats['responses_received'] = 8
        client.stats['timeouts'] = 1
        client.stats['errors'] = 1
        client.stats['reconnections'] = 2
        client.is_connected = True
        client._pending_requests[1] = asyncio.Future()
        client._pending_requests[2] = asyncio.Future()
        
        stats = client.get_stats()
        
        assert stats == {
            'requests_sent': 10,
            'responses_received': 8,
            'timeouts': 1,
            'errors': 1,
            'reconnections': 2,
            'connected': True,
            'pending_requests': 2
        }
    
    def test_stats_modification_protection(self):
        """Test that returned stats cannot modify internal stats."""
        client = BinanceWSApiClient("key", "secret", "wss://test.com")
        
        stats = client.get_stats()
        stats['requests_sent'] = 999
        
        # Internal stats should not be affected
        assert client.stats['requests_sent'] == 0
        assert client.get_stats()['requests_sent'] == 0


@pytest.mark.asyncio
async def test_integration_full_workflow():
    """Integration test of full WebSocket workflow."""
    client = BinanceWSApiClient("test_key", "test_secret", "wss://test.com", timeout=2.0)
    
    # Mock WebSocket connection
    mock_websocket = AsyncMock()
    
    async def mock_websocket_connect(*args, **kwargs):
        return mock_websocket
    
    # Mock only websockets.connect, not asyncio.wait_for
    with patch('websockets.connect', side_effect=mock_websocket_connect):
        with patch.object(client, '_handle_messages') as mock_handler:
            with patch.object(client, '_ping_loop') as mock_ping:
                # Connect
                connected = await client.connect()
                assert connected is True
                assert client.is_connected is True
                
                # Simulate successful order placement
                async def simulate_order_response():
                    # Wait for the request to be added to pending_requests with timeout
                    timeout_counter = 0
                    while not client._pending_requests and timeout_counter < 100:  # Max 1 second
                        await asyncio.sleep(0.01)
                        timeout_counter += 1
                    
                    if client._pending_requests:
                        request_id = list(client._pending_requests.keys())[0]
                        # Simulate WebSocket response
                        response_data = {
                            'id': request_id,
                            'result': {'orderId': 123, 'status': 'NEW'}
                        }
                        await client._process_message(response_data)
                
                response_task = asyncio.create_task(simulate_order_response())
                
                # Place order
                result = await client.place_order_ws(
                    'BTCUSDT', 'BUY', 'LIMIT', '0.001', '50000'
                )
                
                await response_task
                
                assert result == {'orderId': 123, 'status': 'NEW'}
                assert client.stats['requests_sent'] == 1
                assert client.stats['responses_received'] == 1
                
                # Disconnect
                await client.disconnect()
                assert client.is_connected is False
                assert len(client._pending_requests) == 0