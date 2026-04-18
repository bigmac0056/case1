import psycopg2
from psycopg2.extras import RealDictCursor
from contextlib import contextmanager
from src.core.config import settings


@contextmanager
def get_db_connection():
    conn = psycopg2.connect(
        host=settings.postgres_host,
        port=settings.postgres_port,
        user=settings.postgres_user,
        password=settings.postgres_password,
        dbname=settings.postgres_db,
        cursor_factory=RealDictCursor
    )
    try:
        yield conn
    finally:
        conn.close()


@contextmanager
def get_db_cursor():
    with get_db_connection() as conn:
        cursor = conn.cursor()
        try:
            yield cursor
            conn.commit()
        finally:
            cursor.close()