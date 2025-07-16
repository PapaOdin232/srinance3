# 03. Frontend (UI, komunikacja z backendem)

## Szczegółowa checklista

- [x] Wybór frameworka (React lub Streamlit):
    - [x] Przeanalizuj wymagania projektu i wybierz framework (React – rozbudowane UI, Streamlit – szybki prototyp).
    - [x] Opisz w README.md powód wyboru.

- [x] Inicjalizacja projektu frontendowego:
    - [x] Utwórz nowy projekt (np. create-react-app, vite, streamlit init).
    - [x] Skonfiguruj plik .gitignore dla frontendu.
    - [x] Przygotuj strukturę katalogów (src/, components/, services/, assets/).

- [x] Konfiguracja komunikacji z backendem:
    - [x] Zaimplementuj klienta REST (np. axios, fetch).
    - [x] Zaimplementuj klienta WebSocket (np. native WebSocket, socket.io).
    - [x] Dodaj obsługę błędów i reconnect.
    - [x] Przetestuj połączenie z backendem (testowe endpointy).

- [ ] Stworzenie panelu konta (saldo, historia, info):
    - [x] Zaprojektuj UI panelu konta (np. saldo, historia transakcji, dane użytkownika).
    - [x] Pobierz dane z backendu i wyświetl w panelu.
    - [x] Dodaj obsługę ładowania i błędów.

- [ ] Stworzenie panelu rynku (wykres, ticker, orderbook):
    - [x] Zaprojektuj UI panelu rynku.
    - [x] Zaimplementuj wykresy (np. TradingView, Chart.js, plotly).
    - [x] Wyświetl ticker i orderbook na żywo (WebSocket).

- [ ] Stworzenie panelu bota (ustawienia, start/stop, logi):
    - [x] Zaprojektuj UI panelu bota (formularze do ustawień, przyciski start/stop, logi).
    - [x] Zaimplementuj obsługę formularzy i walidację danych.
    - [x] Wyświetl logi bota w czasie rzeczywistym.

- [ ] Testy UI:
    - [x] Skonfiguruj narzędzia do testów UI (np. Jest, React Testing Library, Cypress).
    - [x] Napisz testy jednostkowe i integracyjne dla komponentów.
    - [x] Przetestuj komunikację z backendem (mocki, testy end-to-end).
    - [x] Przetestuj komunikację z backendem (mocki, testy end-to-end).
