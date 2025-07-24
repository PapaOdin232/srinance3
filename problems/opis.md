### Opis projektu: Srinance 3

Srinance 3 to aplikacja do handlu kryptowalutami, łącząca frontend (React + Vite) z backendem (FastAPI, Python). Bot pobiera dane rynkowe z Binance (REST API i WebSocket), wyświetla je w panelu użytkownika, umożliwia automatyczne składanie zleceń oraz monitorowanie aktywności konta. System obsługuje strumienie danych na żywo, księgę zleceń, status bota, logi oraz integrację z bazą danych. Projekt skupia się na szybkim reagowaniu na zmiany rynkowe, automatyzacji handlu i przejrzystej prezentacji danych.

### Analiza logów z DevTools (24.07.2025)

1. Połączenie z serwerem Vite przebiega prawidłowo (`[vite] connecting...`, `[vite] connected.`).
2. Pojawia się informacja o React DevTools – zalecenie instalacji rozszerzenia dla lepszej diagnostyki.
3. Ostrzeżenie z `browser-polyfill.js` dotyczące preferowanego sposobu obsługi odpowiedzi w rozszerzeniach Chrome (Promise zamiast sendResponse).
4. Krytyczny błąd przy tworzeniu wykresu w `useChart.ts`: 
   - "This method is not implemented: Check that a complete date adapter is provided." – brakuje adaptera daty dla Chart.js, przez co wykresy nie renderują się poprawnie.
   - "Canvas is already in use. Chart with ID '0' must be destroyed before the canvas with ID '' can be reused." – próba ponownego użycia tego samego canvas bez uprzedniego zniszczenia poprzedniego wykresu.
5. Logi z WebSocket (`wsClient.ts`):
   - Tworzenie instancji połączenia z backendem dla marketu i bota (`ws://localhost:8000/ws/market`, `ws://localhost:8000/ws/bot`).
   - Odbierane są wiadomości typu `ticker`, `orderbook` oraz `bot_status` dla różnych symboli (ETHUSDT, ADAUSDT, DOTUSDT, LINKUSDT). Dane są poprawnie odbierane i logowane.
6. Panel bota (`BotPanel.tsx`) poprawnie odbiera status bota.

#### Podsumowanie:
- Frontend poprawnie komunikuje się z backendem przez WebSocket i odbiera dane rynkowe oraz status bota.
- Główny problem dotyczy renderowania wykresów: brakuje adaptera daty dla Chart.js oraz występuje konflikt przy wielokrotnym użyciu canvas.
- Pozostałe logi nie wskazują na krytyczne błędy w komunikacji czy logice aplikacji.

---
### Obserwacje z zakładki Network (DevTools)

1. Widać aktywne połączenia websocket dla marketu i bota (`ws://localhost:8000/ws/market`, `ws://localhost:8000/ws/bot`). Status 101 oznacza prawidłowe ustanowienie połączenia websocket.
2. Występuje wiele zapytań websocket, co sugeruje, że frontend nawiązuje kilka połączeń (możliwe, że dla różnych paneli lub komponentów).
3. Skrypty frontendowe (np. `main.tsx`, `App.tsx`, `MarketPanel.tsx`, `BotPanel.tsx`) oraz pliki konfiguracyjne są ładowane poprawnie (status 200).
4. Widać zapytania typu `xhr` oraz `preflight` dla endpointów REST API, np. `/ticker?symbol=BTCUSDT`, `/orderbook?symbol=BTCUSDT`. Większość z nich kończy się statusem 200 (OK), ale jedno zapytanie do `/ticker?symbol=BTCUSDT` zwraca błąd 500 (Internal Server Error) – backend nie obsłużył poprawnie tego żądania.
5. Preflight (OPTIONS) dla CORS przechodzi poprawnie (status 200), więc nie ma problemów z polityką dostępu między frontendem a backendem.
6. Rozmiary przesyłanych plików i odpowiedzi są typowe dla aplikacji SPA, nie widać opóźnień ani dużych transferów.
7. Inicjatory zapytań wskazują, że komunikacja jest dobrze rozdzielona pomiędzy websockety i REST (wsClient, restClient, poszczególne komponenty).

#### Podsumowanie Network:
- Połączenia websocket są aktywne i stabilne.
- Większość zapytań REST działa poprawnie, ale endpoint `/ticker?symbol=BTCUSDT` zwraca błąd 500 – wymaga analizy po stronie backendu.
- Brak problemów z CORS.
- Frontend ładuje wszystkie zasoby bez błędów.

#### Dodatkowa obserwacja po kilku minutach działania aplikacji (Network)

Po kilku minutach w zakładce Network widać, że liczba aktywnych połączeń websocket dla marketu i bota rośnie. Wiele połączeń pozostaje w stanie "Pending" (oczekiwanie), a niektóre utrzymują się przez kilka minut (np. 4-6 min). Oznacza to, że aplikacja nie zamyka starych połączeń websocket, tylko otwiera kolejne, co może prowadzić do nadmiernego obciążenia backendu i przeglądarki.

Możliwe przyczyny:
- Brak mechanizmu zamykania nieużywanych połączeń websocket po stronie frontendu.
- Komponenty mogą wielokrotnie inicjować nowe połączenia bez zamykania poprzednich (np. przy każdym odświeżeniu panelu lub renderze).

Skutki:
- Zwiększone zużycie zasobów po stronie serwera i klienta.
- Potencjalne problemy z limitem połączeń lub stabilnością aplikacji.

Rekomendacja:
- Sprawdzić logikę inicjowania i zamykania połączeń websocket w kodzie frontendu (wsClient).
- Upewnić się, że przy odmontowaniu komponentu lub zmianie panelu stare połączenia są zamykane (ws.close()).
- Rozważyć limitowanie liczby jednoczesnych połączeń.

---
#### Przykładowa wiadomość z połączenia websocket (market)

W zakładce Network, w sekcji Messages dla połączenia websocket do marketu, pojawiają się cykliczne wiadomości w formacie JSON dla wielu par handlowych, np.:

```
{"type":"ticker","symbol":"LINKUSDT","price":"17.93000000","change":"0","changePercent":"0%"}
{"type":"ticker","symbol":"BTCUSDT","price":"118739.13000000","change":"0","changePercent":"0%"}
{"type":"ticker","symbol":"ETHUSDT","price":"3649.40000000","change":"0","changePercent":"0%"}
{"type":"ticker","symbol":"ADAUSDT","price":"0.80520000","change":"0","changePercent":"0%"}
{"type":"ticker","symbol":"DOTUSDT","price":"3.99900000","change":"0","changePercent":"0%"}
```

oraz:
```
{"type":"orderbook","symbol":"LINKUSDT","bids":[...],"asks":[...]}
{"type":"orderbook","symbol":"BTCUSDT","bids":[...],"asks":[...]}
{"type":"orderbook","symbol":"ETHUSDT","bids":[...],"asks":[...]}
{"type":"orderbook","symbol":"ADAUSDT","bids":[...],"asks":[...]}
{"type":"orderbook","symbol":"DOTUSDT","bids":[...],"asks":[...]}
```

Każda wiadomość dotyczy konkretnej pary handlowej (np. BTCUSDT, ETHUSDT, LINKUSDT, ADAUSDT, DOTUSDT) i zawiera:
- typ (`ticker` lub `orderbook`),
- symbol instrumentu,
- aktualną cenę, zmianę i procent zmiany (dla `ticker`),
- listę ofert kupna/sprzedaży (dla `orderbook`).

Wiadomości są przesyłane regularnie dla każdej pary, co pozwala na bieżąco aktualizować dane rynkowe w aplikacji frontendowej dla wielu instrumentów jednocześnie.

Widać także komunikaty typu `ping`/`pong` służące do utrzymania połączenia:
```
{"type":"ping"}
{"type":"pong"}
```

---
### Analiza logów z pliku opis2.md (DevTools)

1. Połączenie z serwerem Vite przebiega prawidłowo (`[vite] connecting...`, `[vite] connected.`).
2. Pojawia się informacja o React DevTools – zalecenie instalacji rozszerzenia dla lepszej diagnostyki.
3. Ostrzeżenie z `browser-polyfill.js` dotyczące preferowanego sposobu obsługi odpowiedzi w rozszerzeniach Chrome (Promise zamiast sendResponse).
4. Krytyczne błędy przy tworzeniu wykresu w `useChart.ts`:
   - "This method is not implemented: Check that a complete date adapter is provided." – brakuje adaptera daty dla Chart.js, przez co wykresy nie renderują się poprawnie.
   - "Canvas is already in use. Chart with ID '0' must be destroyed before the canvas with ID '' can be reused." – próba ponownego użycia tego samego canvas bez uprzedniego zniszczenia poprzedniego wykresu.
5. Logi z WebSocket (`wsClient.ts`):
   - Tworzenie i niszczenie instancji połączenia z backendem dla marketu i bota (`ws://localhost:8000/ws/market`, `ws://localhost:8000/ws/bot`).
   - Widoczne są zmiany stanu połączenia: DISCONNECTED -> CLOSING -> DISCONNECTED oraz DISCONNECTED -> CONNECTING.
   - Połączenia są poprawnie zamykane i otwierane, co świadczy o obsłudze cyklu życia połączenia.
6. Występują błędy CORS przy próbie pobrania danych z endpointu `/ticker?symbol=BTCUSDT`:
   - "No 'Access-Control-Allow-Origin' header is present on the requested resource." – backend nie zwraca nagłówka CORS, przez co frontend nie może pobrać danych.
   - W efekcie pojawia się błąd sieci w Axios: `AxiosError: Network Error` oraz komunikat `GET ... net::ERR_FAILED 500 (Internal Server Error)`.
7. Panel MarketPanel nie może załadować danych początkowych z powodu błędu sieci.
8. Mimo błędów REST, WebSocket nadal przesyła wiadomości typu `ticker` z danymi rynkowymi (np. BTCUSDT).

#### Podsumowanie logów opis2.md:
- Frontend poprawnie obsługuje cykl życia połączeń WebSocket (tworzenie, zamykanie, zmiana stanu).
- Występują poważne problemy z CORS i REST API – brak nagłówka CORS oraz błąd 500 uniemożliwiają pobieranie danych przez frontend.
- Dane rynkowe są nadal przesyłane przez WebSocket, więc aplikacja nie traci całkowicie funkcjonalności.
- Główny problem do rozwiązania: konfiguracja CORS na backendzie oraz naprawa endpointu `/ticker?symbol=BTCUSDT`.
- Dodatkowo należy rozwiązać problem z adapterem daty dla Chart.js oraz zarządzaniem canvas.

---
### Obserwacje dotyczące UI i aktualizacji danych

Na załączonym screenie widać główne panele aplikacji:
- Panel Rynkowy z informacją o połączeniu, wyborem symbolu, aktualną ceną, wykresem oraz komunikatem o błędzie pobierania danych.
- Księga zleceń (order book) z podziałem na oferty kupna i sprzedaży.
- Panel Bota Tradingowego z informacją o statusie, saldzie oraz przyciskami do uruchamiania/zatrzymywania bota i logami na żywo.

Obserwacje:
- Dane takie jak ticker (aktualna cena) oraz order book wyświetlają się statycznie – nie są aktualizowane na bieżąco mimo aktywnego połączenia WebSocket.
- Wygląda na to, że UI pobiera i wyświetla dane tylko z REST API (jednorazowo przy ładowaniu), a kolejne aktualizacje z WebSocket nie są przekazywane do komponentów frontendowych.
- Komunikat o błędzie pobierania danych sugeruje problem z REST API (np. błąd CORS lub 500), co powoduje brak odświeżania danych po stronie UI.
- Panel bota pokazuje status "Zatrzymany" i saldo $0, a logi na żywo są puste – brak aktywności bota.
- Panel konta nie wyświetla żadnych danych dotyczących salda, historii czy aktywności – sekcja pozostaje pusta niezależnie od stanu połączenia.

Wnioski:
- UI nie reaguje na nowe dane z WebSocket, przez co informacje rynkowe pozostają nieaktualne.
- Należy sprawdzić, czy eventy z WebSocket są poprawnie obsługiwane i przekazywane do stanu aplikacji (np. przez setState, Redux, Context API itp.).
- Warto zweryfikować, czy komponenty nasłuchują na wiadomości z WebSocket i czy mechanizm aktualizacji widoku jest aktywny.
- Rozwiązanie problemu z REST API (CORS, 500) nie wystarczy – konieczna jest poprawa integracji WebSocket z frontendem.



Repozytoria i dokumentacja:
https://github.com/binance/binance-spot-api-docs
Repozytorium `binance/binance-spot-api-docs` zawiera pełną dokumentację oficjalnych API Binance Spot – zarówno REST, jak i WebSocket (ws streams). Najważniejsze pliki i sekcje:

- **rest-api.md** – szczegółowa dokumentacja endpointów REST (np. `/api/*`), formaty żądań/odpowiedzi, autoryzacja, limity, obsługa błędów.
- **web-socket-api.md** – opis WebSocket API: dostępne kanały, formaty wiadomości, przykłady subskrypcji, obsługa połączeń, autoryzacja.
- **web-socket-streams.md** – szczegóły dotyczące strumieni rynkowych (market data streams) przez WebSocket: ticker, orderbook, trades, przykłady payloadów.
- **user-data-stream.md** – opis strumieni WebSocket dla danych użytkownika (np. saldo, zlecenia, aktywność konta).
- **errors.md** – lista kodów błędów i komunikatów dla Spot API (REST i WebSocket).
- **enums.md, filters.md** – szczegóły dotyczące typów danych, filtrów i parametrów używanych w API.
- **sbe-market-data-streams.md** – alternatywne strumienie rynkowe w formacie SBE.
- **testnet/** – dokumentacja dla środowiska testowego Spot Testnet.

Dodatkowo repozytorium zawiera:
- FAQ (np. market-data-only, trailing-stop-faq, stp_faq, market_orders_faq).
- Linki do oficjalnych klientów (Python, JS, Java, Go, Rust, PHP itd.).
- Kolekcje Postman do testowania API.
- Swagger/OpenAPI specyfikację.
- Informacje o limitach, autoryzacji, obsłudze błędów, formatach wiadomości, payloadach.

Wszystkie oficjalne formaty, parametry, payloady i przykłady użycia są opisane w powyższych plikach – zarówno dla REST, jak i WebSocket. Repozytorium jest podstawowym źródłem do analizy i debugowania integracji z Binance Spot API.
https://github.com/fastapi/fastapi
https://github.com/vitejs/vite
https://github.com/mjhea0/awesome-fastapi  # Lista narzędzi, rozszerzeń i przykładów dla FastAPI
https://github.com/binance/binance-connector-js  # Oficjalny klient JS do Binance API
https://github.com/binance/binance-api-postman  # Kolekcje Postman do testowania Binance API
https://github.com/SocketCluster/socketcluster  # Przykładowy serwer WebSocket dla Node.js
https://github.com/pladaria/react-websocket  # Prosty klient WebSocket dla React
https://github.com/axios/axios  # Klient HTTP dla REST API w JS/TS
https://github.com/reduxjs/redux  # Zarządzanie stanem w React
https://github.com/reactjs/react-devtools  # Debugowanie React
https://github.com/chartjs/Chart.js  # Dokumentacja i przykłady Chart.js
https://github.com/rt2zz/redux-persist  # Przechowywanie stanu aplikacji React
https://github.com/pmndrs/zustand  # Lekka alternatywa dla Redux do zarządzania stanem
https://github.com/fastify/fastify  # Alternatywa dla FastAPI w Node.js
https://github.com/typicode/json-server  # Mockowanie REST API do testów
https://github.com/expressjs/express  # Popularny backend Node.js do REST API
https://github.com/GoogleChromeLabs/swr  # Hooki do pobierania danych w React
https://github.com/vercel/next.js  # Przykłady integracji WebSocket/REST w React
https://github.com/SocketIO/socket.io  # Popularna biblioteka WebSocket dla Node.js
https://github.com/fastapi/fastapi-websocket  # Przykłady WebSocket w FastAPI
https://github.com/tiangolo/full-stack-fastapi-postgresql  # Kompletny stack FastAPI + React + WebSocket
