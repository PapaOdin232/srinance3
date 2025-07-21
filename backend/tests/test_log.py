import os
from backend.database.log import log_info, log_error

def test_log_info_and_error(tmp_path):
    log_path = tmp_path / "test.log"
    # Patch global LOG_FILE
    import backend.database.log as logmod
    logmod.LOG_FILE = str(log_path)

    log_info("Test info")
    try:
        raise ValueError("Test error")
    except Exception as e:
        log_error(e)

    with open(log_path) as f:
        content = f.read()
        assert "[INFO] Test info" in content
        assert "[ERROR] ValueError: Test error" in content
        assert "Traceback" in content
