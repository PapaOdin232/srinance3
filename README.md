# Bot handlowy Binance

## Cel projektu
Automatyzacja handlu na giełdzie Binance z wykorzystaniem własnych strategii oraz panelu do zarządzania i monitorowania bota.

## Główne funkcjonalności
- Integracja z API Binance (REST i WebSocket)
- Panel użytkownika (saldo, historia, rynek, zarządzanie botem)
- Obsługa środowisk testnet/produkcyjne
- Prosta autoryzacja (token admina)
- Logowanie działań i obsługa błędów
- Testy jednostkowe, integracyjne i E2E

## Jak zacząć
1. Sklonuj repozytorium:
   ```bash
   git clone <adres-repo>
   ```
2. Zainstaluj zależności backendu i frontendu:
   - Backend (Python):
     ```bash
     cd backend
     python -m venv venv
     source venv/bin/activate
     pip install -r requirements.txt
     ```
   - Frontend (Node.js):
     ```bash
     cd frontend
     npm install
     ```
3. Skonfiguruj plik `.env` na podstawie `.env.example`.
4. Uruchom backend i frontend zgodnie z instrukcją poniżej.

## Wymagania
- Python 3.10+
- Node.js 18+
- pip, npm
- (opcjonalnie) poetry/pipenv, pre-commit, lintery

## Lintery i pre-commit

### Backend (Python)
Aby uruchomić lintery i formatowanie kodu:
```bash
cd backend
black .
flake8 .
isort .
```
Aby zainstalować i aktywować pre-commit:
```bash
pip install pre-commit
pre-commit install
pre-commit run --all-files
```

### Frontend (Node.js)
Aby uruchomić lintery i formatowanie kodu:
```bash
cd frontend
npx eslint .
npx prettier --check .
```
Aby automatycznie poprawić formatowanie:
```bash
npx prettier --write .
```

## Uruchomienie środowiska
- Backend:
  ```bash
  cd backend
  source venv/bin/activate
  uvicorn main:app --reload
  ```
- Frontend:
  ```bash
  cd frontend
  npm run dev
  ```

## Przykładowe pliki konfiguracyjne

- `backend/config.py` – ładuje zmienne środowiskowe (API KEY, SECRET, środowisko, tryb testnet/produkcyjny)
- `frontend/.env.example` – przykładowe zmienne środowiskowe dla frontendu (np. adres API, tryb środowiska)

Struktura i przykłady znajdują się w odpowiednich katalogach.

## Przełączanie środowisk
Zmienna `BINANCE_ENV` w pliku `.env` pozwala przełączać środowisko między testnet a produkcyjnym.

## Struktura endpointów API (FastAPI)

- `GET /account` – pobiera dane konta Binance (saldo, uprawnienia, limity)
- `POST /ticker` – pobiera aktualną cenę wybranego symbolu (np. BTCUSDT)
- (planowane) `GET /history` – historia transakcji
- (planowane) `GET /orderbook` – orderbook wybranego symbolu
- (planowane) `POST /bot/start` – uruchomienie bota
- (planowane) `POST /bot/stop` – zatrzymanie bota
- (planowane) `GET /bot/status` – status bota
- (planowane) `GET /bot/logs` – logi działania bota

Wszystkie endpointy będą walidowane przez Pydantic.

## Frontend – wybór frameworka

Do realizacji frontendu wybrano **React**. Uzasadnienie:
- Projekt wymaga rozbudowanego, dynamicznego UI (panele: konto, rynek z wykresami, bot z logami na żywo).
- React zapewnia pełną kontrolę nad interfejsem użytkownika, łatwą integrację z REST API i WebSocket, obsługę dynamicznych wykresów (Chart.js, TradingView) oraz bogaty ekosystem narzędzi do testowania (Jest, React Testing Library, Cypress).
- Framework umożliwia łatwą rozbudowę i utrzymanie kodu w miarę rozwoju projektu.
- Streamlit jest dobry do szybkiego prototypowania, ale nie spełnia wymagań dotyczących zaawansowanego UI i komunikacji w czasie rzeczywistym.

---
Więcej szczegółów znajdziesz w folderze `plan/` oraz w dokumentacji projektu.
