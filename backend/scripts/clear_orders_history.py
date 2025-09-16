#!/usr/bin/env python3
"""
Skrypt do czyszczenia tabeli orders_history.

Użycie:
    python clear_orders_history.py                 # Wyczyść całą tabelę
    python clear_orders_history.py --symbol BTCUSDT # Wyczyść tylko jeden symbol
    python clear_orders_history.py --help          # Pokaż pomoc
"""

import sys
import os
import argparse
import logging

# Dodaj ścieżkę do głównego katalogu projektu
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..'))

from backend.database.crud import clear_orders_history, delete_orders_history_by_symbol
from backend.database.init_db import init_db

def setup_logging():
    """Skonfiguruj logowanie."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )

def main():
    """Główna funkcja skryptu."""
    parser = argparse.ArgumentParser(
        description='Czyść tabelę orders_history z bazy danych'
    )
    parser.add_argument(
        '--symbol', 
        type=str, 
        help='Symbol pary handlowej do usunięcia (np. BTCUSDT). Jeśli nie podano, usuwa wszystkie rekordy.'
    )
    parser.add_argument(
        '--confirm', 
        action='store_true', 
        help='Potwierdź operację bez pytania'
    )
    
    args = parser.parse_args()
    
    setup_logging()
    
    # Upewnij się, że baza danych jest zainicjalizowana
    init_db()
    
    try:
        if args.symbol:
            # Usuń rekordy dla konkretnego symbolu
            if not args.confirm:
                confirm = input(f"Czy na pewno chcesz usunąć wszystkie rekordy dla symbolu {args.symbol.upper()}? (tak/nie): ")
                if confirm.lower() not in ['tak', 'yes', 'y', 't']:
                    print("Operacja anulowana.")
                    return
            
            deleted_count = delete_orders_history_by_symbol(args.symbol)
            print(f"✅ Usunięto {deleted_count} rekordów dla symbolu {args.symbol.upper()}")
            
        else:
            # Usuń wszystkie rekordy
            if not args.confirm:
                confirm = input("Czy na pewno chcesz usunąć WSZYSTKIE rekordy z tabeli orders_history? (tak/nie): ")
                if confirm.lower() not in ['tak', 'yes', 'y', 't']:
                    print("Operacja anulowana.")
                    return
            
            deleted_count = clear_orders_history()
            print(f"✅ Usunięto {deleted_count} rekordów z tabeli orders_history")
            
    except Exception as e:
        print(f"❌ Błąd podczas czyszczenia bazy danych: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()