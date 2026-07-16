import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Absolute database path for SQLite to prevent path resolution issues
DB_PATH = r"C:\ANJUN\Banco de Dados\torre_anjun.db"
DATABASE_URL_ENV = os.getenv("DATABASE_URL")

if DATABASE_URL_ENV:
    # SQLAlchemy requires 'postgresql://' instead of 'postgres://'
    if DATABASE_URL_ENV.startswith("postgres://"):
        DATABASE_URL_ENV = DATABASE_URL_ENV.replace("postgres://", "postgresql://", 1)
    engine = create_engine(DATABASE_URL_ENV)
else:
    DATABASE_URL = f"sqlite:///{DB_PATH.replace(os.sep, '/')}"
    engine = create_engine(
        DATABASE_URL, 
        connect_args={"check_same_thread": False} # Required for SQLite
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Simple migration helper to add 'divisao' column to existing SQLite tables if not present
def run_migrations():
    import sqlite3
    if os.path.exists(DB_PATH):
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # Check and add 'divisao' to 'detalhe_md_historico'
            cursor.execute("PRAGMA table_info(detalhe_md_historico);")
            columns = [col[1] for col in cursor.fetchall()]
            if 'divisao' not in columns:
                cursor.execute("ALTER TABLE detalhe_md_historico ADD COLUMN divisao VARCHAR(100);")
                print("Added column 'divisao' to 'detalhe_md_historico'.")
                
            # Check and add 'divisao' to 'malha_coordenadas'
            cursor.execute("PRAGMA table_info(malha_coordenadas);")
            columns = [col[1] for col in cursor.fetchall()]
            if 'divisao' not in columns:
                cursor.execute("ALTER TABLE malha_coordenadas ADD COLUMN divisao VARCHAR(100);")
                print("Added column 'divisao' to 'malha_coordenadas'.")
                
            conn.commit()
            conn.close()
        except Exception as e:
            print("Error running migrations:", e)

run_migrations()

# FastAPI dependency injection for database sessions
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
