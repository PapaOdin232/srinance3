# 04. Testy i środowiska


## Szczegółowa checklista

- [x] Testy jednostkowe backendu:
    - [x] Skonfiguruj środowisko testowe (pytest, coverage).
    - [x] Napisz testy jednostkowe dla każdego modułu backendu (klient Binance, API, bot, baza danych).
    - [x] Dodaj testy walidacji danych i obsługi błędów.

- [x] Testy integracyjne (połączenie z Binance testnet):
    - [x] Przygotuj testowe klucze API Binance.
    - [x] Napisz testy integracyjne dla komunikacji z Binance (REST i WebSocket).
    - [x] Przetestuj obsługę typowych błędów i reconnect.

- [x] Testy frontendu:
    - [x] Skonfiguruj narzędzia do testów UI (Jest, React Testing Library, Cypress lub Streamlit test).
    - [x] Napisz testy jednostkowe i integracyjne dla komponentów UI.
    - [x] Przetestuj komunikację frontendu z backendem (mocki, testy end-to-end).

- [ ] Testy end-to-end (cały flow: konto, rynek, bot):
    - [ ] Zaprojektuj scenariusze testowe pokrywające cały przepływ użytkownika.
    - [ ] Zautomatyzuj testy E2E (np. Cypress, Playwright).
    - [ ] Przetestuj różne przypadki brzegowe i obsługę błędów.

- [ ] Przełączanie środowisk (testnet/produkcyjne):
    - [ ] Przetestuj przełączanie środowisk przez zmienne środowiskowe.
    - [ ] Zweryfikuj, czy testy nie wpływają na środowisko produkcyjne.

- [ ] Skrypty testowe do symulacji zleceń:
    - [ ] Przygotuj skrypty generujące przykładowe zlecenia i symulujące ruch na rynku.
    - [ ] Użyj ich do testów integracyjnych i wydajnościowych.

- [ ] Testy obsługi błędów API Binance:
    - [ ] Zaimplementuj testy sprawdzające reakcję systemu na typowe błędy API (np. rate limit, invalid signature).

- [ ] Testy wydajnościowe:
    - [ ] Skonfiguruj narzędzia do testów wydajnościowych (np. locust, k6).
    - [ ] Przeprowadź testy obciążeniowe backendu i frontendu.
    - [ ] Zbierz i przeanalizuj wyniki, zaproponuj optymalizacje.
