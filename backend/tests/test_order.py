import pytest
from backend.models.order import Order

def test_order_creation():
    order = Order(symbol="BTCUSDT", side="BUY", price=30000, quantity=0.1, status="NEW")
    assert order.symbol == "BTCUSDT"
    assert order.side == "BUY"
    assert order.price == 30000
    assert order.quantity == 0.1
    assert order.status == "NEW"
