import asyncio
import json
import pytest
from unittest.mock import AsyncMock, patch

from backend.ws_api_client import BinanceWSApiClient, SignatureError


@pytest.mark.asyncio
async def test_session_logon_gated_only_for_ed25519():
    client = BinanceWSApiClient("k", "s", "wss://test/ws", use_session_auth=True, signing_method="HMAC")
    mock_ws = AsyncMock()

    async def mock_connect(*args, **kwargs):
        return mock_ws

    with patch('websockets.connect', side_effect=mock_connect):
        with patch.object(client, '_session_logon') as logon:
            await client.connect()
            logon.assert_not_called()


@pytest.mark.asyncio
async def test_session_logon_runs_for_ed25519():
    client = BinanceWSApiClient("k", "s", "wss://test/ws", use_session_auth=True, signing_method="ED25519")
    mock_ws = AsyncMock()

    async def mock_connect(*args, **kwargs):
        return mock_ws

    with patch('websockets.connect', side_effect=mock_connect):
        with patch.object(client, '_session_logon', return_value={}) as logon:
            ok = await client.connect()
            assert ok is True
            logon.assert_called_once()


@pytest.mark.asyncio
async def test_hmac_signing_when_not_session_authenticated():
    client = BinanceWSApiClient("k", "s", "wss://test/ws", use_session_auth=True, signing_method="HMAC")
    client.is_connected = True
    client.websocket = AsyncMock()

    async def resolve():
        await asyncio.sleep(0.01)
        fut = next(iter(client._pending_requests.values()))
        fut.set_result({"ok": True})

    task = asyncio.create_task(resolve())
    res = await client._send_request('account.status', {}, signed=True)
    await task

    sent = client.websocket.send.call_args[0][0]
    payload = json.loads(sent)
    assert 'apiKey' in payload['params']
    assert 'signature' in payload['params']
    assert res["ok"] is True


def test_order_validation_market_exactly_one_qty():
    client = BinanceWSApiClient("k", "s", "ws")
    with pytest.raises(ValueError):
        client._validate_order('MARKET', {'symbol': 'BTCUSDT'})
    with pytest.raises(ValueError):
        client._validate_order('MARKET', {'quantity': '1', 'quoteOrderQty': '10'})
    # Valid cases shouldn't raise
    client._validate_order('MARKET', {'quantity': '1'})
    client._validate_order('MARKET', {'quoteOrderQty': '10'})


def test_order_validation_limit_requirements():
    client = BinanceWSApiClient("k", "s", "ws")
    with pytest.raises(ValueError):
        client._validate_order('LIMIT', {'quantity': '1'})
    client._validate_order('LIMIT', {'timeInForce': 'GTC', 'price': '1', 'quantity': '1'})


@pytest.mark.asyncio
async def test_client_side_throttling_queues_requests():
    client = BinanceWSApiClient("k", "s", "wss://test/ws", rate_limit_per_sec=1)
    client.is_connected = True
    client.websocket = AsyncMock()

    order = []
    async def resolver():
        # resolve futures in order
        while len(order) < 2:
            await asyncio.sleep(0.01)
        for req_id in order:
            fut = client._pending_requests.get(req_id)
            if fut and not fut.done():
                fut.set_result({"ok": True, "id": req_id})

    async def intercept_send(payload):
        data = json.loads(payload)
        order.append(data['id'])

    client.websocket.send.side_effect = intercept_send
    resolver_task = asyncio.create_task(resolver())

    # Fire two requests nearly at the same time, the semaphore allows 1 per second
    t0 = asyncio.get_event_loop().time()
    r1 = asyncio.create_task(client._send_request('ping', {}, signed=False))
    r2 = asyncio.create_task(client._send_request('ping', {}, signed=False))
    await asyncio.wait([r1, r2])
    t1 = asyncio.get_event_loop().time()

    # Expect at least ~1s between acquiring tokens
    assert (t1 - t0) >= 1.0
    await resolver_task


@pytest.mark.asyncio
async def test_signature_error_mapping():
    client = BinanceWSApiClient("k", "s", "wss://test/ws")
    client.is_connected = True
    client.websocket = AsyncMock()

    async def mock_wait():
        await asyncio.sleep(0.01)
        fut = next(iter(client._pending_requests.values()))
        fut.set_exception(SignatureError("Invalid signature (-1022)"))

    task = asyncio.create_task(mock_wait())
    with pytest.raises(SignatureError):
        await client._send_request('account.status', {}, signed=True)
    await task
