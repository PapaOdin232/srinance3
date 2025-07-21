
## Analiza problemu statyczności panelu bota

### Wnioski:

- Panel bota nie odświeża się automatycznie, ponieważ backend nie wysyła statusu ani logów bota przez WebSocket, a frontend nie odpyta cyklicznie API REST.
- Połączenie WebSocket jest wykorzystywane tylko do przesyłania danych rynkowych (ticker/orderbook), a nie informacji o stanie bota.
- Status i logi bota są pobierane tylko raz przy starcie komponentu (przy montowaniu), potem nie są aktualizowane.

### Rekomendacje:

1. **Backend:**
   - Dodać mechanizm wysyłania statusu i logów bota do klientów WebSocket (np. po każdym ticku lub zmianie statusu/logów).
   - Można to zrobić np. przez broadcast do wszystkich klientów WebSocket po każdej zmianie stanu bota.

2. **Frontend:**
   - Alternatywnie, jeśli nie chcemy zmieniać backendu, dodać cykliczne odpytywanie API REST (polling) co kilka sekund, aby pobierać aktualny status i logi bota.
   - Najlepszym rozwiązaniem jest jednak push z backendu przez WebSocket, bo to bardziej wydajne i responsywne.

**Podsumowanie:**
Obecna architektura powoduje, że panel bota jest statyczny. Aby był dynamiczny, potrzebna jest integracja push (WebSocket) lub cykliczny polling REST.
