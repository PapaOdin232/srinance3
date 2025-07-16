# Ładowanie zmiennych środowiskowych z .env.test
import os
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../.env.test'))
import pytest

@pytest.fixture(scope="session")
def any_fixture():
    pass
