
import pytest
from backend.database.crud import create_order, get_orders
from backend.database.init_db import init_db

@pytest.fixture(autouse=True, scope="module")
def setup_database():
    init_db()

def test_create_and_get_order():
    created_order = create_order(symbol="BTCUSDT", side="BUY", price=30000, quantity=0.1, status="NEW")
    orders = get_orders()
    assert any(o.symbol == "BTCUSDT" for o in orders)
    # Sprawdź czy order został utworzony
    assert created_order is not None
