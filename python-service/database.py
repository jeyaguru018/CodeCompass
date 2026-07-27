import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

def get_readonly_db_connection():
    """
    Returns a connection to PostgreSQL using a strictly scoped read-only user.
    This user should ONLY have SELECT permission on repositories.faiss_index_data.
    """
    db_url = os.getenv("DATABASE_URL_READONLY", "postgresql://python_readonly:readonly_pass@localhost:5432/codecompass")
    conn = psycopg2.connect(db_url)
    # Ensure session is read-only at the driver level too
    conn.set_session(readonly=True)
    return conn

def get_db_cursor(conn):
    return conn.cursor(cursor_factory=RealDictCursor)
