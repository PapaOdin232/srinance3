import pytest
import asyncio
import websockets

@pytest.mark.asyncio
async def test_websocket_market():
    uri = "ws://localhost:8000/ws/market"
    async with websockets.connect(uri) as websocket:
        await websocket.send("test123")
        response = await websocket.recv()
        assert response == "Echo: test123"
