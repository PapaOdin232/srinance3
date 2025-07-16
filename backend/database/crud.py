from backend.database.init_db import SessionLocal
from backend.models.order import Order
from backend.models.log import Log
from backend.models.history import History

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
