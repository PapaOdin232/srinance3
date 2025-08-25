from fastapi.testclient import TestClient
import backend.main as main


def test_websocket_market():
    # Prevent heavy startup actions: provide lightweight stubs for globals used in lifespan
    class Dummy:
        async def initialize(self):
            return None
        async def close(self):
            return None

    main.binance_client = Dummy()
    main.market_data_manager = None
    main.binance_ws_api_client = None
    main.trading_bot = None

    client = TestClient(main.app)
    with client.websocket_connect("/ws/market") as websocket:
        # The endpoint sends an initial welcome message; consume it first
        welcome = websocket.receive_json()
        assert welcome.get("type") == "welcome"

        # send a ping message and expect a pong reply per endpoint behavior
        websocket.send_json({"type": "ping"})
        data = websocket.receive_json()
        assert data.get("type") == "pong"
