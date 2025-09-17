from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models.order import Base as OrderBase
from models.log import Base as LogBase
from models.history import Base as HistoryBase
from models.orders_history import Base as OrdersHistoryBase
import logging
from pathlib import Path

# Ścieżka do bazy danych w folderze data/
PROJECT_ROOT = Path(__file__).parent.parent.parent
DB_URL = f"sqlite:///{PROJECT_ROOT}/data/bot.db"
engine = create_engine(DB_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """Initialize DB schema.

    For test runs we perform a drop_all() first to ensure a clean database state.
    In normal runs we only create missing tables to avoid accidental data loss.
    """
    import os
    import sys

    running_tests = False
    # Common indicators that we're running under pytest
    if os.environ.get('PYTEST_CURRENT_TEST') or any('py.test' in a or 'pytest' in a for a in sys.argv):
        running_tests = True

    if running_tests:
        # Drop and recreate for deterministic tests
        OrderBase.metadata.drop_all(bind=engine)
        LogBase.metadata.drop_all(bind=engine)
        HistoryBase.metadata.drop_all(bind=engine)
        OrdersHistoryBase.metadata.drop_all(bind=engine)

    OrderBase.metadata.create_all(bind=engine)
    LogBase.metadata.create_all(bind=engine)
    HistoryBase.metadata.create_all(bind=engine)
    OrdersHistoryBase.metadata.create_all(bind=engine)

if __name__ == "__main__":
    init_db()
    logging.getLogger(__name__).info("Baza danych zainicjalizowana.")
