import traceback
import datetime

LOG_FILE = 'backend/database/app.log'

def log_error(error: Exception):
    with open(LOG_FILE, 'a') as f:
        f.write(f"[{datetime.datetime.now()}] [ERROR] {type(error).__name__}: {error}\n")
        f.write(traceback.format_exc())
        f.write('\n')

def log_info(msg: str):
    with open(LOG_FILE, 'a') as f:
        f.write(f"[{datetime.datetime.now()}] [INFO] {msg}\n")
