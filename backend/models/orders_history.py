from sqlalchemy import Column, Integer, String, Float, DateTime
from sqlalchemy.ext.declarative import declarative_base
import datetime

Base = declarative_base()

class OrdersHistory(Base):
    """Persistent snapshot finalnych zleceń (po statusach końcowych).

    order_id: Binance orderId (unikalny, primary key)
    Pola liczbowo przechowywane jako Float (upraszczamy względem Decimal dla sqlite prototypu).
    update_time: epoch ms kiedy ostatni raz zlecenie się zaktualizowało (status finalny).
    created_at: timestamp zapisu lokalnego.
    """
    __tablename__ = "orders_history"
    order_id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, nullable=False, index=True)
    side = Column(String, nullable=False)
    type = Column(String, nullable=True)
    status = Column(String, nullable=False)
    price = Column(Float, nullable=True)
    orig_qty = Column(Float, nullable=True)
    executed_qty = Column(Float, nullable=True)
    avg_price = Column(Float, nullable=True)
    cumm_quote = Column(Float, nullable=True)
    update_time = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
