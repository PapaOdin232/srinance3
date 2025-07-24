from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.models.order import Base as OrderBase
from backend.models.log import Base as LogBase
from backend.models.history import Base as HistoryBase

DB_URL = "sqlite:///database/bot.db"
engine = create_engine(DB_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    OrderBase.metadata.create_all(bind=engine)
    LogBase.metadata.create_all(bind=engine)
    HistoryBase.metadata.create_all(bind=engine)

if __name__ == "__main__":
    init_db()
    print("Baza danych zainicjalizowana.")
