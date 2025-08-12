from backend.database.init_db import init_db
from backend.database.crud import upsert_final_order, get_orders_history_page

def setup_module(module):
    init_db()

def test_orders_history_pagination_basic():
    # Wstaw 15 rekordów
    for i in range(1, 16):
        upsert_final_order({
            'orderId': i,
            'symbol': 'BTCUSDT',
            'side': 'BUY' if i % 2 else 'SELL',
            'type': 'LIMIT',
            'status': 'FILLED',
            'price': '30000',
            'origQty': '0.01',
            'executedQty': '0.01',
            'avgPrice': '30000',
            'cummulativeQuoteQty': '300',
            'updateTime': 1700000000000 + i
        })
    # Page 1
    items, next_cursor, has_more = get_orders_history_page('BTCUSDT', 10, None)
    assert len(items) == 10
    assert has_more is True
    assert next_cursor is not None
    # Page 2
    items2, next_cursor2, has_more2 = get_orders_history_page('BTCUSDT', 10, next_cursor)
    # Powinno zwrócić pozostałe 5
    assert len(items2) == 5
    assert has_more2 is False
    assert next_cursor2 is None
