# Problemy w projekcie Srinance 3 i generowanie planu naprawy

## Wprowadzenie
Srinance 3 to aplikacja do handlu kryptowalutami, która boryka się z problemami dotyczącymi renderowania wykresów (Chart.js), zarządzania połączeniami WebSocket, błędami API REST oraz aktualizacją interfejsu użytkownika (UI). Niniejszy dokument szczegółowo opisuje te problemy i dostarcza instrukcje dla GitHub Copilota w trybie agenta, aby wykorzystując serwery MCP (filesystem, codacy, sequentialthinking), przeanalizował kod projektu i wygenerował plan naprawy krok po kroku.

## Szczegółowy opis problemów

### 1. Problemy z Chart.js
- **Brak adaptera daty:** 
  Błąd *"This method is not implemented: Check that a complete date adapter is provided."* wskazuje, że Chart.js nie ma skonfigurowanego adaptera daty (np. `chartjs-adapter-date-fns`), co jest wymagane dla wykresów z osią czasową. Bez tego dane rynkowe nie są wyświetlane poprawnie.
- **Błąd ponownego użycia canvasu:** 
  Błąd *"Canvas is already in use. Chart with ID '0' must be destroyed before the canvas with ID '' can be reused."* sugeruje, że nowe instancje wykresów są tworzone na tym samym canvasie bez niszczenia starych, co prowadzi do konfliktów.

### 2. Zarządzanie WebSocket
- **Wiele otwartych połączeń:** 
  Aplikacja otwiera nowe połączenia WebSocket bez zamykania poprzednich, co powoduje wyczerpanie zasobów. W zakładce Network widoczne są połączenia w stanie "Pending".
- **Brak aktualizacji UI:** 
  Dane z WebSocket nie aktualizują UI w czasie rzeczywistym, co wskazuje na problem z przekazywaniem danych do stanu aplikacji lub brak subskrypcji komponentów na te dane.

### 3. Błędy API REST
- **Problemy z CORS:** 
  Błąd *"No 'Access-Control-Allow-Origin' header is present on the requested resource."* oznacza, że backend FastAPI nie obsługuje żądań międzydomenowych, blokując komunikację z frontendem.
- **Błąd 500 w endpointcie `/ticker`:** 
  Endpoint `/ticker?symbol=BTCUSDT` zwraca błąd 500, co może być spowodowane błędami w kodzie backendu, np. nieobsłużonym wyjątkiem lub błędnym wywołaniem API Binance.

### 4. Obserwacje UI
- **Statyczne dane rynkowe:** 
  Dane rynkowe nie aktualizują się pomimo aktywnych połączeń WebSocket, co sugeruje problem z integracją danych w UI.
- **Panel bota:** 
  Status "Stopped", zerowy balans i puste logi wskazują, że stan bota nie jest poprawnie pobierany lub wyświetlany.
- **Pusty panel konta:** 
  Brak danych w panelu konta sugeruje problemy z pobieraniem lub renderowaniem danych.

## Analiza repozytoriów
- **Binance API:** [https://github.com/binance/binance-spot-api-docs](https://github.com/binance/binance-spot-api-docs) – Kluczowe dla poprawnego użycia API REST i WebSocket.
- **Chart.js:** [https://github.com/chartjs/Chart.js](https://github.com/chartjs/Chart.js) – Dokumentacja dotycząca adapterów daty i zarządzania wykresami.
- **FastAPI i Vite:** Źródła wiedzy o konfiguracji CORS, zarządzaniu stanem i cyklem życia komponentów.

## Instrukcje dla GitHub Copilota
Wykorzystaj Copilota w trybie agenta z serwerami MCP:
- **filesystem:** Przeanalizuj pliki kodu w repozytoriach projektu (np. `useChart.ts`, `wsClient.ts`, `MarketPanel.tsx`).
- **codacy:** Sprawdź jakość kodu, szukając błędów, luk w zabezpieczeniach i złych praktyk.
- **sequentialthinking:** Rozbij problemy na mniejsze zadania i wygeneruj plan krok po kroku.

### Kroki dla Copilota
1. **Analiza kodu (filesystem):** 
   - Zbadaj implementację wykresów, WebSocket, endpointów API i komponentów UI.
2. **Kontrola jakości (codacy):** 
   - Zidentyfikuj potencjalne błędy i obszary do poprawy w kodzie.
3. **Generowanie planu (sequentialthinking):** 
   - Stwórz szczegółowy plan naprawy dla każdego problemu.
4. **Uwzględnienie dokumentacji:** 
   - Skorzystaj z Binance API, Chart.js i dokumentacji FastAPI/React.

### Oczekiwany wynik
Copilot powinien wygenerować plik markdown z planem zawierającym:
- **Konfiguracja Chart.js:**
  - Instalacja i konfiguracja adaptera daty.
  - Zarządzanie cyklem życia wykresów.
- **Zarządzanie WebSocket:**
  - Zamykanie nieużywanych połączeń.
  - Integracja danych z UI.
- **Naprawa API REST:**
  - Konfiguracja CORS w FastAPI.
  - Debugowanie endpointu `/ticker`.
- **Aktualizacje UI:**
  - Poprawa subskrypcji komponentów na dane.
  - Debugowanie przepływu danych.

Plan ten pomoże zespołowi deweloperskiemu w systematycznym rozwiązaniu problemów i poprawie aplikacji Srinance 3.