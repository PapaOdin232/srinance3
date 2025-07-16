# 02. Backend (FastAPI, Binance, logika bota)


## Szczegółowa checklista

- [x] Konfiguracja środowisk (testnet/produkcyjne):
    - [x] Dodaj obsługę zmiennej środowiskowej do wyboru środowiska (np. TESTNET/PROD).
    - [x] Przygotuj osobne pliki konfiguracyjne dla obu środowisk.
    - [x] Zaimplementuj ładowanie konfiguracji na podstawie zmiennej środowiskowej.

- [x] Implementacja klienta Binance (REST + WebSocket):
    - [x] Zapoznaj się z dokumentacją API Binance (REST i WebSocket).
    - [x] Zaimplementuj klasę klienta REST (autoryzacja, pobieranie danych, obsługa błędów).
    - [x] Zaimplementuj klienta WebSocket (subskrypcja tickerów, orderbook, obsługa reconnect).
    - [x] Dodaj testy jednostkowe dla klienta Binance.

- [ ] Endpointy API: konto, rynek, bot:
    - [x] Zaprojektuj i opisz w README.md strukturę endpointów.
    - [x] Utwórz endpointy do pobierania stanu konta, historii, salda.
    - [x] Utwórz endpointy do pobierania danych rynkowych (ticker, orderbook).
    - [x] Utwórz endpointy do zarządzania botem (start, stop, status, logi).
    - [x] Dodaj walidację danych wejściowych (Pydantic).

- [ ] Moduł bota handlowego (asynchroniczny):
    - [x] Zaprojektuj architekturę bota (asynchroniczne taski, obsługa ticków, zleceń, statusów).
    - [x] Zaimplementuj podstawową logikę bota (np. strategia testowa).
    - [x] Zaimplementuj obsługę błędów i logowanie działań bota.
    - [x] Dodaj możliwość start/stop bota przez API.

- [ ] Obsługa autoryzacji (prosta, tylko admin):
    - [x] Dodaj prostą autoryzację (np. token admina w .env).
    - [x] Zaimplementuj middleware sprawdzający autoryzację dla endpointów administracyjnych.

- [ ] Integracja z bazą danych (SQLite):
    - [x] Zaprojektuj modele ORM (np. SQLAlchemy).
    - [x] Zaimplementuj inicjalizację bazy i migracje.
    - [x] Dodaj operacje CRUD dla najważniejszych danych (zlecenia, logi, historia).

- [ ] Struktura katalogów i plików backendu:
    - [x] Stwórz plik `backend/main.py` (uruchamianie FastAPI, routing).
    - [x] Stwórz plik `backend/config.py` (obsługa .env, wybór środowiska).
    - [x] Stwórz plik `backend/binance_client.py` (obsługa REST/WebSocket, zgodność z dokumentacją Binance).
    - [x] Stwórz plik `backend/bot/trading_bot.py` (logika bota, obsługa ticków, zleceń, statusów).
    - [x] Stwórz katalog `backend/models/` (modele Pydantic, ORM).
    - [x] Stwórz katalog `backend/database/` (inicjalizacja bazy, migracje).

- [ ] Testy jednostkowe backendu:
    - [x] Przygotuj środowisko testowe (pytest, coverage).
    - [x] Napisz testy jednostkowe dla każdego modułu backendu.
    - [x] Dodaj testy integracyjne dla komunikacji z Binance (testnet).
