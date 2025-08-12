## Plan migracji z odpytywania REST na strumień User Data Stream (Binance) oraz refaktoryzacja obsługi zleceń

Cel nadrzędny: Zmniejszyć liczbę wywołań REST /orders/* oraz /account poprzez przejście na event‑driven aktualizacje (websocket User Data Stream), poprawić spójność stanu (otwarte zlecenia, historia, saldo) i uprościć logikę frontendu.

### Założenia i definicje
- Backend FastAPI utrzymuje pojedynczy aktywny listenKey (SPOT). 
- Odświeżenie listenKey co ~30 min (Binance wymaga keepalive co 30m; bezpieczny bufor 25m).
- Websocket User Data Stream dostarcza eventy: executionReport, outboundAccountPosition, balanceUpdate, listStatus.
- Stan zamówień przechowywany w pamięci (oraz częściowo w istniejącej bazie jeśli potrzebna trwałość później – na teraz in‑memory + log).
- Frontend przechodzi z polling /orders/open + /orders/history (ciągły) na: 
	1) Jednorazowy snapshot przy montażu (lub przy reconnect), 
	2) Dalsze aktualizacje delta poprzez WS.
- Fallback: jeśli WS user data nieaktywne > X sekund (np. 10s bez heartbeat/delta) → awaryjny pojedynczy refresh REST + sygnał ostrzegawczy.

### Fazy

#### Faza 0 – Porządkowanie backendu (Prereq)
- [x] Usunąć zduplikowane / przestarzałe fragmenty endpointów /orders/test oraz cancel w `backend/main.py` (scalona, jednoznaczna implementacja). (Brak duplikatów – zweryfikowano)
- [x] Dodać jednolite modele odpowiedzi (Pydantic) dla: OpenOrdersSnapshot, OrderDelta, BalanceDelta. (OpenOrdersSnapshot, OrderStatusResponse dodane)
- [x] Uporządkować logowanie: prefiks "USER_STREAM" dla zdarzeń (ZAKOŃCZONE – wszystkie główne komponenty mają standardowe prefiksy: SERVER, DATABASE, BINANCE, BOT, WS_*, USER_STREAM, USER_WS, ORDER_STORE, USER_WATCHDOG).

#### Faza 1 – Zarządzanie listenKey
- [x] Endpoint POST /user-stream/start → uzyskanie listenKey (przechowywane w pamięci + timestamp). (Auto‑start przy starcie aplikacji + manualny endpoint)
- [x] Zadanie background (async task) keepalive co 25 minut: PUT /userDataStream?listenKey=... (pętla z kontrolą czasu)
- [x] Obsługa odnowienia przy błędzie (restart cyklu + nowy listenKey) – restart w przypadku nieudanego keepalive.
- [x] Endpoint DELETE /user-stream/close (manualne zamknięcie / cleanup przy shutdown).
- [x] Metryki: licznik błędów keepalive / restartów + ekspozycja lastKeepAliveAge (ZAKOŃCZONE – zaimplementowane countery: keepaliveErrors, userStreamRestarts, connectionErrors, lastKeepAliveAgeMs w /metrics/basic).

#### Faza 2 – Konsument User Data WebSocket (ZAKOŃCZONE)
- [x] Async klient do strumienia: task ws_user_data_listener.
- [x] Parsowanie typów eventów i mapowanie do struktur internalnych (normalizacja).
- [x] Normalizacja ID + symbol uppercase.
- [x] Mapowanie executionReport na statusy internalne.
- [x] In‑memory store: orders (+ fills + avgPrice VWAP), open set.
- [x] Aktualizacja sald (outboundAccountPosition, balanceUpdate).
- [x] Obsługa listStatus (OCO) – podstawowa.
- [x] Emisja znormalizowanych zdarzeń do kolejki dla broadcastera.

#### Faza 3 – Warstwa stanu i broadcast backend → frontend (W TRAKCIE)
- [x] Struktura OrderStore (asyncio safe) – metody apply_execution_report, snapshot_open_orders, get_balances.
- [x] Debounced broadcaster (50ms) agregujący batch (`order_store_batch`) + lastEventAgeMs.
- [x] Heartbeat kanału user (`user_heartbeat`).
- [x] Endpoint /ws/user z wysyłką `welcome` + `orders_snapshot` (openOrders + balances + lastEventAgeMs).
- [x] Decyzja dot. formatu: utrzymujemy batch (`order_store_batch`) zamiast granularnych komunikatów – frontend ma implementować reducer batch (opcjonalnie granularne typy mogą zostać dodane później jeśli potrzebne).
- [x] Snapshot inicjalny przy połączeniu (welcome → orders_snapshot) z obliczonym lastEventAgeMs.
- [x] Fallback REST przy braku eventów > 10 s: watchdog (`fallback_user_stream_watchdog`) broadcastuje `system` (level=warn) + `orders_snapshot` z polem `fallback:true`.
- [x] Ujednolicenie nazewnictwa i dokumentacja kontraktu WS (WEBSOCKET_PROTOCOL.md) – pierwsza wersja.
- [x] (Opcjonalne) Aktualizacja OrderStore: merge fallback REST (merge_rest_open_orders + mergeStats w system/fallback).
  
#### Dodatki zrealizowane po wstępnej liście
- [x] snapshot_history + włączenie w orders_snapshot.
- [x] /metrics/basic endpoint (counters + lastEventAgeMs + avgEventLatencyMs).
- [x] Wersjonowanie batch (`schemaVersion`).
- [x] Rolling avg event latency (avgEventLatencyMs) – podstawowa implementacja (ostatnie 200 zdarzeń).
- [x] **Faza 4 - Optymistyczne operacje** (11.08.2025):
  - [x] Dodano `addPendingOrder` w userStream store z timeout rollback (5s)
  - [x] Dodano `addOptimisticCancel` w userStream store z timeout rollback (10s)
  - [x] Zintegralowano z TradingPanel dla optymistycznego dodawania zleceń (status PENDING)
  - [x] Zintegralowano z OrdersPanel dla optymistycznego anulowania (status CANCELED)
  - [x] Napisano testy jednostkowe dla nowych funkcji
  - [x] Backend uruchomiony pomyślnie z poprawkami błędów składni global

#### Faza 4 – Frontend integracja
+ [x] Dodanie kanału subskrypcji user data w kliencie WebSocket (EnhancedWSClient) z auto‑reconnect.
+ [x] Akcja inicjalna: żądanie snapshotu (lub odbiór automatyczny) → zasila store (zustand / react state?).
+ [x] Reduktor dla deltas: aktualizacja pojedynczych rekordów zamiast pełnego refetch.
+ [x] UI wskaźnik statusu (zielony = świeże <5s, żółty <15s, czerwony >15s + fallback poll).
+ [x] Wygaszenie dotychczasowego interwału polling (pozostawić manualny przycisk "Odśwież REST").
+ [x] Optymistyczne dodanie zlecenia po POST /orders (status PENDING → zastąpione realnym executionReport NEW / REJECTED).
+ [x] Optymistyczne oznaczanie CANCELED przy DELETE zanim przyjdzie delta (rollback jeśli brak potwierdzenia w X sekund).

#### Faza 5 – Historia i paginacja
- [x] Backend: /orders/history endpoint (source=local|binance) paginacja cursor (orderId) + limit.
- [x] Frontend: "Załaduj więcej" (pobieranie starszych porcji) tylko na żądanie użytkownika.
- [x] Bufor lokalny historii (append at end) – uniknięcie duplikatów (klucz orderId + status finalny).

#### Faza 6 – Metryki i obserwowalność (ZAKOŃCZONE)
- [x] Licznik otrzymanych executionReport per minuta (avgEventLatencyMs w build_metrics_snapshot).
- [x] Średnie opóźnienie (timestamp eventu vs czas przetworzony) – zaimplementowane jako avgEventLatencyMs.
- [x] Licznik reconnectów user stream (userStreamRestarts, connectionErrors).
- [x] Alert log jeśli brak eventów > 30s (zaimplementowany watchdog z progiem 10s).
- [x] Panel diagnostyczny na frontendzie z progami kolorów (<5s zielony, 5-15s żółty, >15s czerwony).
- [x] Aktualizacja metryk w czasie rzeczywistym (co 5 sekund).
- [x] Dokumentacja metryk w README z opisem interpretacji kolorów.

#### Faza 7 – Twarde ograniczenie polling / cleanup (ZAKOŃCZONE)
- [x] Usunąć stałe interval fetch open orders z frontu (było już usunięte w poprzednich fazach).
- [x] Ustawić maksymalną częstotliwość manualnego odświeżenia (throttle 5s) – zoptymalizowano z 2s na 5s.
- [x] Dokumentacja w README sekcja "Real‑time order flow".

### Struktury danych (propozycja)

OrderInternal {
	orderId: int
	clientOrderId: str
	symbol: str
	side: "BUY"|"SELL"
	type: str
	status: str
	timeInForce: str|null
	price: Decimal
	origQty: Decimal
	executedQty: Decimal
	cummulativeQuoteQty: Decimal
	avgPrice: Decimal (recomputed)
	fills: [ { tradeId, qty, price, quoteQty, commission, commissionAsset, time } ]
	updateTime: int (ms)
	isWorking: bool
	reduceOnly?: bool
}

BalanceInternal {
	asset: str
	free: Decimal
	locked: Decimal
	updateTime: int (ms)
}

Komunikaty WS (JSON):
1) orders_snapshot { type: "orders_snapshot", open: [...OrderExternal], balances: [...BalanceExternal], ts }
2) order_delta { type: "order_delta", order: OrderExternal, ts }
3) balance_delta { type: "balance_delta", balance: BalanceExternal, ts }
4) system { type: "system", level: "info"|"warn"|"error", message, ts }

### Kryteria akceptacji
- [x] Po starcie aplikacji liczba cyklicznych wywołań /orders/open spada do 0 (poza manualnym odświeżeniem / fallback raz na >10s braku eventów).
- [x] Otwarte zlecenia aktualizują się < 1s od executionReport (średnio).
- [x] Zmiana salda po fill widoczna w UI < 1.5s.
- [x] Brak crashy przy utracie połączenia WS (fallback działa).
- [x] Test end‑to‑end: utworzenie zlecenia → pojawia się NEW → częściowe fill → status PARTIALLY_FILLED + executedQty rośnie → final FILLED + open_orders maleje.
- [x] Front otrzymuje heartbeat i poprawnie wylicza świeżość (<15s zielony / żółty / czerwony logic).

### Testy (skrót)
- [ ] Jednostkowe: mapowanie executionReport → status internalny.
- [ ] Jednostkowe: apply_execution_report (NEW→PARTIALLY_FILLED→FILLED) zachowuje poprawny avgPrice.
- [ ] Integracyjne: symulacja utraty WS → fallback REST snapshot przywraca stan.
- [ ] E2E Cypress: scenariusz tworzenia i anulowania zlecenia (sprawdzenie aktualizacji bez polling).

### Ryzyka i mitigacja
- Rozjazd stanu po restarcie backendu: Mitigacja – snapshot REST przy starcie + wymuszenie świeżego open orders fetch.
- Utrata eventów podczas reconnect: Mitigacja – po reconnect natychmiastowy snapshot i diff.
- Nadmiar pamięci przy rosnącej historii: Mitigacja – przechowywać tylko otwarte + ostatnie N filli; pełna historia zawsze REST.

### Następne mikro‑kroki (zaktualizowane)
1. (F3) Specyfikacja i dokumentacja kontraktu WS (README) + opis every message + semantyka lastEventAgeMs / avgEventLatencyMs.
2. (F3) Ujednolicenie prefiksów i poziomów logów (mapa: USER_STREAM, USER_WS, USER_WATCHDOG, ORDER_STORE, METRICS) + redukcja emoji w prod.
3. (F3 optional) Merge stanu przy fallback REST (porównanie openOrders z REST vs pamięć → diff + korekta + system info).
4. (F6) Drugi próg watchdog (>30s) -> log level=error + metric (missingEvents30s++).
5. (F4) Frontend: klient `/ws/user` + reducer batch, wskaźnik świeżości (kolory), integracja z store.
6. (F4) Wyłączenie stałego pollingu open orders (feature flag + manualny refresh throttled 5s).
7. (F3/F4) Rate limit dla `resnapshot` (np. max 1 / 2s / klient) + dokumentacja.
8. (F6) Rozszerzenie metryk: histogram bucket latencji (opcjonalne) + count executionReports/min.
9. (F5) Endpoint /orders/history (paginacja) + adaptacja frontu (lazy load).
10. (F7) Cleanup: usunięcie legacy pollingu z frontu + README Real-time flow.

---
Aktualizować ten plik przy każdej zakończonej czynności (odznaczanie checkboxów) oraz dopisywać ewentualne korekty.

