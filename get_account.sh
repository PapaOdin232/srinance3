#!/bin/bash

# Binance Testnet Account API - curl script
# Autor: Michał Strzałkowski
# Data: 17 września 2025

# Konfiguracja Binance Testnet
API_KEY="VlRfjGjYzgsc4xKHBMKTZRZfVXwnmtbWESunbdpsxKLmegOw6OQ4lPhf1S9DOZyp"
SECRET_KEY="r7F5oF3vaEnl6X9UlAH9cebbuZqk2O5QueIMZlmAeOdudsBaFuDOXE2bOieV04le"
BASE_URL="https://testnet.binance.vision"

# Konfiguracja plików wynikowych
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TIMESTAMP_FILE=$(date +"%Y%m%d_%H%M%S")
JSON_FILE="${SCRIPT_DIR}/account_data_${TIMESTAMP_FILE}.json"
REPORT_FILE="${SCRIPT_DIR}/account_report_${TIMESTAMP_FILE}.txt"
PRICES_FILE="${SCRIPT_DIR}/prices_data_${TIMESTAMP_FILE}.json"

echo "🚀 Pobieranie danych konta z Binance Testnet..."
echo "📅 $(date)"
echo "🔗 URL: ${BASE_URL}/api/v3/account"
echo "💾 Pliki wynikowe:"
echo "   JSON: $(basename "$JSON_FILE")"
echo "   Raport: $(basename "$REPORT_FILE")"
echo "   Ceny: $(basename "$PRICES_FILE")"
echo ""

# Sprawdzenie czy klucze są ustawione
if [[ -z "$API_KEY" || -z "$SECRET_KEY" ]]; then
    echo "❌ Błąd: Klucze API nie są ustawione"
    exit 1
fi

# Generowanie timestamp w milisekundach
TIMESTAMP=$(date +%s)000

# Przygotowanie query string (tylko timestamp jest wymagany)
QUERY_STRING="timestamp=${TIMESTAMP}"

# Generowanie sygnatury HMAC SHA256
echo "🔐 Generowanie sygnatury HMAC SHA256..."
SIGNATURE=$(echo -n "${QUERY_STRING}" | openssl dgst -sha256 -hmac "${SECRET_KEY}" | cut -d' ' -f2)

echo "📊 Parametry zapytania:"
echo "   Timestamp: ${TIMESTAMP}"
echo "   Query: ${QUERY_STRING}"
echo "   Signature: ${SIGNATURE:0:20}..."
echo ""

# Wykonanie zapytania do Binance Testnet
echo "📡 Wykonywanie zapytania..."
RESPONSE=$(curl -s -w "%{http_code}" \
                -H "X-MBX-APIKEY: ${API_KEY}" \
                "${BASE_URL}/api/v3/account?${QUERY_STRING}&signature=${SIGNATURE}")

# Rozdzielenie kodu HTTP od treści odpowiedzi
HTTP_CODE="${RESPONSE: -3}"
BODY="${RESPONSE%???}"

echo "📈 Status HTTP: $HTTP_CODE"
echo ""

# Sprawdzenie rezultatu
if [[ "$HTTP_CODE" == "200" ]]; then
    echo "✅ Sukces! Dane konta Binance Testnet:"
    echo "═══════════════════════════════════════"
    
    # Zapisanie surowych danych JSON do pliku
    echo "$BODY" > "$JSON_FILE"
    echo "💾 Zapisano surowe dane JSON: $(basename "$JSON_FILE")"
    
    # Pobieranie aktualnych cen wszystkich par handlowych
    echo ""
    echo "💱 Pobieranie aktualnych cen z Binance..."
    PRICES_RESPONSE=$(curl -s -w "%{http_code}" "${BASE_URL}/api/v3/ticker/price")
    PRICES_HTTP_CODE="${PRICES_RESPONSE: -3}"
    PRICES_BODY="${PRICES_RESPONSE%???}"
    
    if [[ "$PRICES_HTTP_CODE" == "200" ]]; then
        echo "$PRICES_BODY" > "$PRICES_FILE"
        echo "💾 Zapisano dane cen: $(basename "$PRICES_FILE")"
    else
        echo "⚠️  Ostrzeżenie: Nie udało się pobrać cen (HTTP: $PRICES_HTTP_CODE)"
        echo "📊 Kontynuacja bez przeliczania wartości USDC..."
    fi
    
    # Utworzenie raportu tekstowego
    {
        echo "RAPORT KONTA BINANCE TESTNET"
        echo "═══════════════════════════════════════"
        echo "Data wygenerowania: $(date)"
        echo "Endpoint: ${BASE_URL}/api/v3/account"
        echo "Status HTTP: $HTTP_CODE"
        echo ""
        echo "INFORMACJE O KONCIE:"
        echo "═══════════════════════"
    } > "$REPORT_FILE"
    
    # Funkcja do przeliczania wartości na USDC
# Funkcja do formatowania liczb z bc dla printf
format_number() {
    local number="$1"
    local decimals="$2"
    
    # Upewnij się, że mamy liczbę
    if [[ -z "$number" || "$number" == "0" ]]; then
        printf "0.%0${decimals}d" 0
        return
    fi
    
    # Użyj awk do formatowania liczby
    echo "$number" | awk -v decimals="$decimals" '{printf "%.*f", decimals, $1}'
}

# Funkcja do przeliczania wartości assetu na USDC
    calculate_usdc_value() {
        local asset="$1"
        local amount="$2"
        
        # Jeśli to już USDC, zwróć wartość bez zmian
        if [[ "$asset" == "USDC" ]]; then
            echo "$amount"
            return
        fi
        
        # Specjalna obsługa USDT
        if [[ "$asset" == "USDT" ]]; then
            # Szukaj bezpośredniej pary USDTUSDC
            local usdt_to_usdc_direct
            usdt_to_usdc_direct=$(echo "$PRICES_BODY" | jq -r ".[] | select(.symbol == \"USDTUSDC\") | .price" 2>/dev/null)
            if [[ "$usdt_to_usdc_direct" != "null" && "$usdt_to_usdc_direct" != "" ]]; then
                echo "$amount * $usdt_to_usdc_direct" | bc -l 2>/dev/null || echo "0"
                return
            fi
            
            # Jeśli nie ma USDTUSDC, spróbuj USDCUSDT i odwróć
            local usdc_to_usdt_direct
            usdc_to_usdt_direct=$(echo "$PRICES_BODY" | jq -r ".[] | select(.symbol == \"USDCUSDT\") | .price" 2>/dev/null)
            if [[ "$usdc_to_usdt_direct" != "null" && "$usdc_to_usdt_direct" != "" ]]; then
                echo "$amount / $usdc_to_usdt_direct" | bc -l 2>/dev/null || echo "0"
                return
            fi
        fi
        
        # Jeśli nie mamy danych o cenach, zwróć 0
        if [[ ! -f "$PRICES_FILE" || "$PRICES_HTTP_CODE" != "200" ]]; then
            echo "0"
            return
        fi
        
        # Próba znalezienia ceny dla pary ASSET/USDC
        local price_usdc
        price_usdc=$(echo "$PRICES_BODY" | jq -r ".[] | select(.symbol == \"${asset}USDC\") | .price" 2>/dev/null)
        
        if [[ "$price_usdc" != "null" && "$price_usdc" != "" ]]; then
            # Bezpośrednia para z USDC
            echo "$amount * $price_usdc" | bc -l 2>/dev/null || echo "0"
            return
        fi
        
        # Próba przez USDT (ASSET/USDT * USDT/USDC)
        local price_usdt
        local usdt_to_usdc
        price_usdt=$(echo "$PRICES_BODY" | jq -r ".[] | select(.symbol == \"${asset}USDT\") | .price" 2>/dev/null)
        usdt_to_usdc=$(echo "$PRICES_BODY" | jq -r ".[] | select(.symbol == \"USDTUSDC\") | .price" 2>/dev/null)
        
        # Jeśli nie ma USDTUSDC, spróbuj USDCUSDT i odwróć
        if [[ "$usdt_to_usdc" == "null" || "$usdt_to_usdc" == "" ]]; then
            local usdc_to_usdt
            usdc_to_usdt=$(echo "$PRICES_BODY" | jq -r ".[] | select(.symbol == \"USDCUSDT\") | .price" 2>/dev/null)
            if [[ "$usdc_to_usdt" != "null" && "$usdc_to_usdt" != "" ]]; then
                usdt_to_usdc=$(echo "1 / $usdc_to_usdt" | bc -l 2>/dev/null)
            fi
        fi
        
        if [[ "$price_usdt" != "null" && "$price_usdt" != "" && "$usdt_to_usdc" != "null" && "$usdt_to_usdc" != "" ]]; then
            echo "$amount * $price_usdt * $usdt_to_usdc" | bc -l 2>/dev/null || echo "0"
            return
        fi
        
        # Próba przez BTC (ASSET/BTC * BTC/USDC)
        local price_btc
        local btc_to_usdc
        price_btc=$(echo "$PRICES_BODY" | jq -r ".[] | select(.symbol == \"${asset}BTC\") | .price" 2>/dev/null)
        btc_to_usdc=$(echo "$PRICES_BODY" | jq -r ".[] | select(.symbol == \"BTCUSDC\") | .price" 2>/dev/null)
        
        if [[ "$price_btc" != "null" && "$price_btc" != "" && "$btc_to_usdc" != "null" && "$btc_to_usdc" != "" ]]; then
            echo "$amount * $price_btc * $btc_to_usdc" | bc -l 2>/dev/null || echo "0"
            return
        fi
        
        # Jeśli nie znaleziono żadnej ścieżki, zwróć 0
        echo "0"
    }
    
    # Formatowanie JSON jeśli jq jest dostępne
    if command -v jq &> /dev/null; then
        echo "$BODY" | jq '.'
        
        # Dodanie szczegółów do raportu
        {
            echo "Typ konta: $(echo "$BODY" | jq -r '.accountType // "N/A"')"
            echo "Handel dozwolony: $(echo "$BODY" | jq -r '.canTrade // false')"
            echo "Wypłaty dozwolone: $(echo "$BODY" | jq -r '.canWithdraw // false')"
            echo "Wpłaty dozwolone: $(echo "$BODY" | jq -r '.canDeposit // false')"
            echo "Prowizja Maker: $(echo "$BODY" | jq -r '.makerCommission // 0') basis points"
            echo "Prowizja Taker: $(echo "$BODY" | jq -r '.takerCommission // 0') basis points"
            echo "UID: $(echo "$BODY" | jq -r '.uid // "N/A"')"
            echo "Ostatnia aktualizacja: $(echo "$BODY" | jq -r '.updateTime // 0')"
            echo ""
        } >> "$REPORT_FILE"
    else
        echo "$BODY"
        echo ""
        echo "💡 Tip: Zainstaluj 'jq' dla lepszego formatowania JSON: brew install jq"
        
        # Podstawowe informacje do raportu bez jq
        {
            echo "Dane JSON zapisane w pliku $(basename "$JSON_FILE")"
            echo "Użyj 'jq' dla lepszego formatowania"
            echo ""
        } >> "$REPORT_FILE"
    fi
    
    echo ""
    echo "📊 Podsumowanie konta:"
    echo "═══════════════════════"
    
    if command -v jq &> /dev/null; then
        echo "🏪 Typ konta: $(echo "$BODY" | jq -r '.accountType // "N/A"')"
        echo "💰 Handel: $(echo "$BODY" | jq -r '.canTrade // false')"
        echo "💸 Wypłaty: $(echo "$BODY" | jq -r '.canWithdraw // false')"
        echo "💵 Wpłaty: $(echo "$BODY" | jq -r '.canDeposit // false')"
        echo "📈 Prowizja Maker: $(echo "$BODY" | jq -r '.makerCommission // 0') basis points"
        echo "📉 Prowizja Taker: $(echo "$BODY" | jq -r '.takerCommission // 0') basis points"
        
        # Liczba aktywów z saldem > 0
        ACTIVE_BALANCES=$(echo "$BODY" | jq '[.balances[] | select((.free | tonumber) + (.locked | tonumber) > 0)] | length')
        echo "🪙 Aktywa z saldem: $ACTIVE_BALANCES"
        
        # Przeliczanie wartości portfela na USDC
        if [[ -f "$PRICES_FILE" && "$PRICES_HTTP_CODE" == "200" ]]; then
            echo ""
            echo "💰 Przeliczanie wartości portfela na USDC..."
            
            # Sprawdzenie czy bc jest dostępne
            if ! command -v bc &> /dev/null; then
                echo "⚠️  Ostrzeżenie: 'bc' nie jest dostępne - przeliczanie wartości wyłączone"
                echo "💡 Tip: Zainstaluj 'bc' dla przeliczania wartości: brew install bc"
            else
                TOTAL_USDC_VALUE=0
                PORTFOLIO_DETAILS=""
                
                # Przeiteruj przez wszystkie aktywa z saldem > 0
                while IFS= read -r balance_line; do
                    ASSET=$(echo "$balance_line" | jq -r '.asset')
                    FREE=$(echo "$balance_line" | jq -r '.free')
                    LOCKED=$(echo "$balance_line" | jq -r '.locked')
                    TOTAL_BALANCE=$(echo "$FREE + $LOCKED" | bc -l)
                    
                    # Oblicz wartość w USDC
                    USDC_VALUE=$(calculate_usdc_value "$ASSET" "$TOTAL_BALANCE")
                    
                    # Dodaj do całkowitej wartości jeśli > 0
                    if (( $(echo "$USDC_VALUE > 0" | bc -l) )); then
                        TOTAL_USDC_VALUE=$(echo "$TOTAL_USDC_VALUE + $USDC_VALUE" | bc -l)
                        
                        # Formatowanie wartości USDC
                        if (( $(echo "$USDC_VALUE > 1" | bc -l) )); then
                            FORMATTED_USDC=$(format_number "$USDC_VALUE" 2)
                        else
                            FORMATTED_USDC=$(format_number "$USDC_VALUE" 6)
                        fi
                        PORTFOLIO_DETAILS="${PORTFOLIO_DETAILS}${ASSET}: ${TOTAL_BALANCE} (~\$${FORMATTED_USDC} USDC)\n"
                    else
                        PORTFOLIO_DETAILS="${PORTFOLIO_DETAILS}${ASSET}: ${TOTAL_BALANCE} (brak ceny)\n"
                    fi
                    
                done < <(echo "$BODY" | jq -c '.balances[] | select((.free | tonumber) + (.locked | tonumber) > 0)')
                
                # Wyświetl całkowitą wartość portfela
                FORMATTED_TOTAL=$(format_number "$TOTAL_USDC_VALUE" 2)
                echo "💎 Całkowita wartość portfela: ~\$${FORMATTED_TOTAL} USDC"
            fi
        fi
        
        # Dodanie informacji o aktywach do raportu
        {
            echo "PODSUMOWANIE PORTFELA:"
            echo "═══════════════════════"
            echo "Liczba aktywów z saldem > 0: $ACTIVE_BALANCES"
            
            if [[ -f "$PRICES_FILE" && "$PRICES_HTTP_CODE" == "200" && -n "$FORMATTED_TOTAL" ]]; then
                echo "Całkowita wartość portfela: ~$${FORMATTED_TOTAL} USDC"
            else
                echo "Całkowita wartość portfela: Nie można obliczyć (brak danych o cenach)"
            fi
            echo ""
            echo "TOP 10 AKTYWÓW WEDŁUG SALDA:"
            echo "═══════════════════════════"
        } >> "$REPORT_FILE"
        
        echo ""
        echo "💼 Top 5 sald (free + locked > 0):"
        if [[ -f "$PRICES_FILE" && "$PRICES_HTTP_CODE" == "200" ]] && command -v bc &> /dev/null; then
            # Wyświetl top 5 z wartościami USDC
            echo -e "$PORTFOLIO_DETAILS" | head -5
            
            # Dodaj do raportu
            echo -e "$PORTFOLIO_DETAILS" | head -10 >> "$REPORT_FILE"
        else
            # Podstawowy format bez przeliczania
            TOP_BALANCES=$(echo "$BODY" | jq -r '.balances[] | select((.free | tonumber) + (.locked | tonumber) > 0) | "\(.asset): \(.free) (free) + \(.locked) (locked)"' | head -5)
            echo "$TOP_BALANCES"
            
            # Dodaj do raportu
            echo "$BODY" | jq -r '.balances[] | select((.free | tonumber) + (.locked | tonumber) > 0) | "\(.asset): \(.free) (free) + \(.locked) (locked)"' | head -10 >> "$REPORT_FILE"
        fi
        
        # Dodanie wszystkich aktywów do raportu
        {
            echo ""
            echo "WSZYSTKIE AKTYWA Z SALDEM > 0:"
            echo "═══════════════════════════════"
        } >> "$REPORT_FILE"
        
        if [[ -f "$PRICES_FILE" && "$PRICES_HTTP_CODE" == "200" ]] && command -v bc &> /dev/null && [[ -n "$PORTFOLIO_DETAILS" ]]; then
            echo -e "$PORTFOLIO_DETAILS" >> "$REPORT_FILE"
        else
            echo "$BODY" | jq -r '.balances[] | select((.free | tonumber) + (.locked | tonumber) > 0) | "\(.asset): \(.free) (free) + \(.locked) (locked)"' >> "$REPORT_FILE"
        fi
        
        # Dodanie metadanych na koniec raportu
        {
            echo ""
            echo "METADANE:"
            echo "═══════════════════════"
            echo "Plik JSON: $(basename "$JSON_FILE")"
            echo "Rozmiar pliku JSON: $(du -h "$JSON_FILE" | cut -f1)"
            if [[ -f "$PRICES_FILE" ]]; then
                echo "Plik cen: $(basename "$PRICES_FILE")"
                echo "Rozmiar pliku cen: $(du -h "$PRICES_FILE" | cut -f1)"
            fi
            echo "Wygenerowano przez: $0"
            echo "Data: $(date)"
            echo "Użytkownik: $(whoami)"
            echo "System: $(uname -s)"
        } >> "$REPORT_FILE"
    fi
    
    echo ""
    echo "📁 Pliki zostały zapisane:"
    echo "   🔸 JSON: $JSON_FILE ($(du -h "$JSON_FILE" | cut -f1))"
    echo "   🔸 Raport: $REPORT_FILE ($(du -h "$REPORT_FILE" | cut -f1))"
    if [[ -f "$PRICES_FILE" ]]; then
        echo "   🔸 Ceny: $PRICES_FILE ($(du -h "$PRICES_FILE" | cut -f1))"
    fi
    
else
    echo "❌ Błąd HTTP: $HTTP_CODE"
    echo "📝 Odpowiedź serwera:"
    echo "$BODY"
    
    # Zapisanie błędu do pliku
    ERROR_FILE="${SCRIPT_DIR}/account_error_${TIMESTAMP_FILE}.txt"
    {
        echo "BŁĄD PODCZAS POBIERANIA DANYCH KONTA"
        echo "═══════════════════════════════════════"
        echo "Data: $(date)"
        echo "Endpoint: ${BASE_URL}/api/v3/account"
        echo "Status HTTP: $HTTP_CODE"
        echo ""
        echo "ODPOWIEDŹ SERWERA:"
        echo "═══════════════════════"
        echo "$BODY"
        echo ""
        echo "PARAMETRY ZAPYTANIA:"
        echo "═══════════════════════"
        echo "Timestamp: $TIMESTAMP"
        echo "Query string: $QUERY_STRING"
        echo "Signature: $SIGNATURE"
    } > "$ERROR_FILE"
    
    echo ""
    echo "📁 Błąd zapisany do: $ERROR_FILE"
    
    if [[ "$HTTP_CODE" == "401" ]]; then
        echo ""
        echo "🔍 Możliwe przyczyny błędu 401:"
        echo "   • Nieprawidłowy klucz API"
        echo "   • Nieprawidłowy sekretny klucz"
        echo "   • Błędna sygnatura"
        echo "   • Timestamp za bardzo odległy od czasu serwera"
    elif [[ "$HTTP_CODE" == "403" ]]; then
        echo ""
        echo "🔍 Możliwe przyczyny błędu 403:"
        echo "   • Brak uprawnień do endpointu /api/v3/account"
        echo "   • Klucz API nie ma permisji SPOT trading"
    fi
fi

echo ""
echo "🏁 Koniec"