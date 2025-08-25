import logging

logger = logging.getLogger(__name__)

from backend.database.init_db import SessionLocal
from backend.models.order import Order
from backend.models.log import Log
from backend.models.history import History
from backend.models.orders_history import OrdersHistory

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
    try:
        order = session.get(Order, order_id)
        if order:
            session.delete(order)
            session.commit()
    finally:
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
                except (ValueError, TypeError) as e:
                    logger.warning(f"Failed to convert order values to float for order {order.get('orderId')}: {e}")
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

from typing import cast


def get_orders_history_page(symbol: str | None, limit: int, cursor: int | None):
    """Stronicowanie malejąco po order_id.

    Cursor = ostatni zwrócony order_id (następna strona < cursor).
    Zwraca (items, nextCursor, hasMore).

    Hardening:
    - limit musi być > 0 (domyślnie 50)
    - cursor jest bezpiecznie rzutowany do int jeśli to możliwe
    - symbol jest ujednolicony do uppercase
    """
    session = SessionLocal()
    try:
        # Validate and normalize inputs
        try:
            limit = int(limit)
        except Exception:
            limit = 50
        if limit <= 0:
            limit = 50

        if symbol:
            symbol = symbol.upper()

        safe_cursor = None
        if cursor is not None:
            try:
                safe_cursor = int(cursor)
            except Exception:
                safe_cursor = None

        q = session.query(OrdersHistory)
        if symbol:
            q = q.filter(OrdersHistory.symbol == symbol)
        if safe_cursor is not None:
            # exclusive cursor: return rows with order_id < cursor
            q = q.filter(OrdersHistory.order_id < safe_cursor)

        q = q.order_by(OrdersHistory.order_id.desc())
        rows = q.limit(limit + 1).all()
        has_more = len(rows) > limit
        items = rows[:limit]

        next_cursor = None
        if has_more and items:
            try:
                next_cursor = int(getattr(items[-1], 'order_id'))
            except Exception:
                next_cursor = None

        # Serializacja (jednolity typ danych)
        serialized = [
            {
                'orderId': int(cast(int, r.order_id)),
                'symbol': r.symbol,
                'side': r.side,
                'type': r.type,
                'status': r.status,
                'price': float(cast(float, r.price)) if r.price is not None else 0.0,
                'origQty': float(cast(float, r.orig_qty)) if r.orig_qty is not None else 0.0,
                'executedQty': float(cast(float, r.executed_qty)) if r.executed_qty is not None else 0.0,
                'avgPrice': float(cast(float, r.avg_price)) if r.avg_price is not None else 0.0,
                'cummulativeQuoteQty': float(cast(float, r.cumm_quote)) if r.cumm_quote is not None else 0.0,
                'updateTime': int(cast(int, r.update_time)) if r.update_time is not None else None
            } for r in items
        ]
        return serialized, next_cursor, has_more
    finally:
        session.close()
