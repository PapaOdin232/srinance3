import traceback
import datetime
from pathlib import Path

# Ścieżka do logów w folderze data/logs/
PROJECT_ROOT = Path(__file__).parent.parent.parent
LOG_FILE = PROJECT_ROOT / 'data' / 'logs' / 'app.log'

def log_error(error: Exception):
    with open(LOG_FILE, 'a') as f:
        f.write(f"[{datetime.datetime.now()}] [ERROR] {type(error).__name__}: {error}\n")
        f.write(traceback.format_exc())
        f.write('\n')

def log_info(msg: str):
    with open(LOG_FILE, 'a') as f:
        f.write(f"[{datetime.datetime.now()}] [INFO] {msg}\n")
