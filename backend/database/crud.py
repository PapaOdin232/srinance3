from database.init_db import SessionLocal
from models.order import Order
from models.log import Log
from models.history import History
from models.orders_history import OrdersHistory

def create_order(**kwargs):
    session = SessionLocal()
    order = Order(**kwargs)
    session.add(order)
    session.commit()
    session.refresh(order)
    session.close()
    return order

def get_orders():
    session = SessionLocal()
    orders = session.query(Order).all()
    session.close()
    return orders

def delete_order(order_id):
    session = SessionLocal()
    order = session.query(Order).get(order_id)
    if order:
        session.delete(order)
        session.commit()
    session.close()

def create_log(message):
    session = SessionLocal()
    log = Log(message=message)
    session.add(log)
    session.commit()
    session.refresh(log)
    session.close()
    return log

def get_logs():
    session = SessionLocal()
    logs = session.query(Log).all()
    session.close()
    return logs

def create_history(**kwargs):
    session = SessionLocal()
    history = History(**kwargs)
    session.add(history)
    session.commit()
    session.refresh(history)
    session.close()
    return history

def get_history():
    session = SessionLocal()
    history = session.query(History).all()
    session.close()
    return history

# ===== OrdersHistory (final orders) =====
def upsert_final_order(order: dict):
    """Zapisz finalny snapshot zlecenia jeśli nie istnieje.
    order: dict zawiera klucze: orderId, symbol, side, type, status, price, origQty, executedQty, avgPrice, cummulativeQuoteQty, updateTime
    """
    session = SessionLocal()
    try:
        existing = session.query(OrdersHistory).filter(OrdersHistory.order_id == order['orderId']).first()
        if existing:
            try:
                new_ut = int(order.get('updateTime') or 0)
            except Exception:
                new_ut = 0
            current_ut = existing.update_time or 0
            if isinstance(current_ut, int) and new_ut and new_ut > current_ut:
                setattr(existing, 'status', order.get('status') or existing.status)
                try:
                    setattr(existing, 'executed_qty', float(order.get('executedQty') or 0))
                    setattr(existing, 'avg_price', float(order.get('avgPrice') or 0))
                    setattr(existing, 'cumm_quote', float(order.get('cummulativeQuoteQty') or 0))
                except Exception:
                    pass
                setattr(existing, 'update_time', new_ut)
            session.commit()
            return existing
        rec = OrdersHistory(
            order_id=order['orderId'],
            symbol=order.get('symbol'),
            side=order.get('side'),
            type=order.get('type'),
            status=order.get('status'),
            price=float(order.get('price') or 0),
            orig_qty=float(order.get('origQty') or 0),
            executed_qty=float(order.get('executedQty') or 0),
            avg_price=float(order.get('avgPrice') or 0),
            cumm_quote=float(order.get('cummulativeQuoteQty') or 0),
            update_time=order.get('updateTime')
        )
        session.add(rec)
        session.commit()
        session.refresh(rec)
        return rec
    finally:
        session.close()

def get_orders_history_page(symbol: str|None, limit: int, cursor: int|None):
    """Stronicowanie malejąco po order_id. Cursor = ostatni zwrócony order_id (następna strona < cursor).
    Zwraca (items, nextCursor, hasMore)."""
    session = SessionLocal()
    try:
        q = session.query(OrdersHistory)
        if symbol:
            q = q.filter(OrdersHistory.symbol == symbol.upper())
        if cursor is not None:
            q = q.filter(OrdersHistory.order_id < cursor)
        q = q.order_by(OrdersHistory.order_id.desc())
        rows = q.limit(limit + 1).all()
        has_more = len(rows) > limit
        items = rows[:limit]
        next_cursor = int(getattr(items[-1], 'order_id')) if has_more and items else None
        # Serializacja
        serialized = [
            {
                'orderId': r.order_id,
                'symbol': r.symbol,
                'side': r.side,
                'type': r.type,
                'status': r.status,
                'price': r.price,
                'origQty': r.orig_qty,
                'executedQty': r.executed_qty,
                'avgPrice': r.avg_price,
                'cummulativeQuoteQty': r.cumm_quote,
                'updateTime': r.update_time
            } for r in items
        ]
        return serialized, next_cursor, has_more
    finally:
        session.close()
