# 01. Inicjalizacja i konfiguracja repozytorium


## Szczegółowa checklista

- [x] Stworzenie katalogów projektu:
    - [x] Utwórz katalogi: `backend/`, `frontend/`, `plan/`.
    - [x] Dodaj plik `plan/00_overview.md` z ogólnym opisem projektu i harmonogramem.

- [x] Utworzenie pliku `.gitignore`:
    - [x] Wygeneruj plik `.gitignore` odpowiedni dla wybranego języka (np. Python, Node.js).
    - [x] Dodaj wpisy ignorujące pliki środowiskowe, zależności, pliki tymczasowe, katalogi wirtualnych środowisk, itp.

- [x] Utworzenie pliku `.env.example` (bez kluczy):
    - [x] Utwórz plik `.env.example` z przykładowymi zmiennymi środowiskowymi (np. `BINANCE_API_KEY=`, `BINANCE_API_SECRET=`, `ENV=development`).
    - [x] Dodaj `.env` do `.gitignore`.

- [x] Przygotowanie README.md z opisem projektu:
    - [x] Opisz krótko cel projektu.
    - [x] Wypisz główne funkcjonalności.
    - [x] Dodaj sekcję „Jak zacząć” (klonowanie repo, instalacja zależności, uruchomienie środowiska).
    - [x] Dodaj sekcję z wymaganiami (Python/Node, narzędzia, itp.).

- [x] Wybór środowiska (testnet/produkcyjne) przez zmienną środowiskową:
    - [x] Dodaj do `.env.example` zmienną np. `BINANCE_ENV=testnet`.
    - [x] Opisz w README.md jak przełączać środowiska.

- [x] Instalacja narzędzi developerskich (pre-commit, linter, itp.):
    - [x] Zainstaluj i skonfiguruj pre-commit hooks (np. black, flake8, isort dla Pythona lub eslint/prettier dla JS).
    - [x] Dodaj pliki konfiguracyjne narzędzi do projektu.
    - [x] Opisz w README.md jak uruchomić lintera i pre-commit.

- [x] Wstępna konfiguracja virtualenv/poetry/pipenv:
    - [x] Utwórz środowisko wirtualne (np. `python -m venv venv` lub `poetry init`).
    - [x] Dodaj instrukcję aktywacji środowiska do README.md.
    - [x] Dodaj plik `requirements.txt` lub `pyproject.toml` z podstawowymi zależnościami.

- [x] Dodanie przykładowych plików konfiguracyjnych:
    - [x] Dodaj przykładowe pliki konfiguracyjne dla backendu i frontendu (np. `backend/config.py`, `frontend/.env.example`).
    - [x] Opisz strukturę plików konfiguracyjnych w README.md.
