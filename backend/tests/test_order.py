
from backend.models.order import Order

def test_order_creation():
    order = Order(symbol="BTCUSDT", side="BUY", price=30000, quantity=0.1, status="NEW")
    # Sprawdzamy wartości bezpośrednio z __dict__ (nie przez ColumnElement)
    assert getattr(order, "symbol") == "BTCUSDT"
    assert getattr(order, "side") == "BUY"
    assert getattr(order, "price") == 30000
    assert getattr(order, "quantity") == 0.1
    assert getattr(order, "status") == "NEW"
