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
            if 'nome_cliente' not in columns:
                cursor.execute("ALTER TABLE detalhe_md_historico ADD COLUMN nome_cliente VARCHAR(100);")
                print("Added column 'nome_cliente' to 'detalhe_md_historico'.")
                
            # Check and add 'divisao' to 'malha_coordenadas'
            cursor.execute("PRAGMA table_info(malha_coordenadas);")
            columns = [col[1] for col in cursor.fetchall()]
            if 'divisao' not in columns:
                cursor.execute("ALTER TABLE malha_coordenadas ADD COLUMN divisao VARCHAR(100);")
                print("Added column 'divisao' to 'malha_coordenadas'.")
                
            # Check and add new columns to 'auditoria_coleta'
            cursor.execute("PRAGMA table_info(auditoria_coleta);")
            columns = [col[1] for col in cursor.fetchall()]
            if columns and 'ultimo_pacote_hora' not in columns:
                cursor.execute("ALTER TABLE auditoria_coleta ADD COLUMN ultimo_pacote_hora VARCHAR(50);")
                print("Added column 'ultimo_pacote_hora' to 'auditoria_coleta'.")
            if columns and 'ultimo_pacote_barcode' not in columns:
                cursor.execute("ALTER TABLE auditoria_coleta ADD COLUMN ultimo_pacote_barcode VARCHAR(100);")
                print("Added column 'ultimo_pacote_barcode' to 'auditoria_coleta'.")

            # Check and add 'tipo_ponto' to 'malha_coordenadas' and 'md_mapping'
            cursor.execute("PRAGMA table_info(malha_coordenadas);")
            malha_cols = [col[1] for col in cursor.fetchall()]
            if 'tipo_ponto' not in malha_cols:
                cursor.execute("ALTER TABLE malha_coordenadas ADD COLUMN tipo_ponto VARCHAR(100) DEFAULT 'MD (Ponto de Coleta)';")
                print("Added column 'tipo_ponto' to 'malha_coordenadas'.")

            cursor.execute("PRAGMA table_info(md_mapping);")
            mapping_cols = [col[1] for col in cursor.fetchall()]
            if 'tipo_ponto' not in mapping_cols:
                cursor.execute("ALTER TABLE md_mapping ADD COLUMN tipo_ponto VARCHAR(100) DEFAULT 'MD (Ponto de Coleta)';")
                print("Added column 'tipo_ponto' to 'md_mapping'.")
                
            # Performance Indexes
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA synchronous=NORMAL;")
            cursor.execute("PRAGMA cache_size=-64000;")
            cursor.execute("PRAGMA temp_store=MEMORY;")
            cursor.execute("PRAGMA mmap_size=268435456;")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_hist_torre_dia ON historico_torre(dia_base);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_det_md_dia ON detalhe_md_historico(dia_base);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_det_md_semana ON detalhe_md_historico(semana_base);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_det_md_name ON detalhe_md_historico(md);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_det_md_dia_reg ON detalhe_md_historico(dia_base, regional);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_det_cli_dia ON detalhe_cliente_md_historico(dia_base);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_det_cli_nome ON detalhe_cliente_md_historico(nome_cliente);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_det_cli_dia_reg ON detalhe_cliente_md_historico(dia_base, regional);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_det_pk_dia ON detalhe_pickup_historico(dia_base);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_det_pk_semana ON detalhe_pickup_historico(semana_base);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_det_pk_dia_reg ON detalhe_pickup_historico(dia_base, regional);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_criacao_cep_dia ON criacao_resumo_cep(dia_base);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_criacao_cep_semana ON criacao_resumo_cep(semana_base);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_criacao_cep_val ON criacao_resumo_cep(cep);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_criacao_cep_dia_uf ON criacao_resumo_cep(dia_base, estado);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_criacao_cep_dia_cid ON criacao_resumo_cep(dia_base, cidade);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_criacao_hist_dia ON criacao_pedidos_historico(dia_base);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_criacao_hist_cli ON criacao_pedidos_historico(nome_cliente);")

            # Migration for tipo_pedido and status_pedido in criacao_pedidos_historico
            try:
                cursor.execute("ALTER TABLE criacao_pedidos_historico ADD COLUMN tipo_pedido VARCHAR(100);")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE criacao_pedidos_historico ADD COLUMN status_pedido VARCHAR(100);")
            except Exception:
                pass
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_criacao_hist_tipo ON criacao_pedidos_historico(tipo_pedido);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_criacao_hist_status ON criacao_pedidos_historico(status_pedido);")

            # PropostaExpansao table migration
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS proposta_expansao (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    cidade VARCHAR(100),
                    estado VARCHAR(50),
                    bairro VARCHAR(150),
                    cep_alvo VARCHAR(20),
                    volume_estimado INTEGER DEFAULT 0,
                    qtd_sellers_estimada INTEGER DEFAULT 0,
                    distancia_md_mais_proximo REAL,
                    md_mais_proximo VARCHAR(100),
                    clientes_principais TEXT,
                    justificativa TEXT,
                    status VARCHAR(50) DEFAULT 'Em Análise',
                    prioridade VARCHAR(20) DEFAULT 'MEDIA',
                    criado_em VARCHAR(50),
                    atualizado_em VARCHAR(50),
                    criado_por VARCHAR(100) DEFAULT 'Analista',
                    observacoes TEXT
                );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_proposta_status ON proposta_expansao(status);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_proposta_cidade ON proposta_expansao(cidade);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_proposta_estado ON proposta_expansao(estado);")
            
            # Check and create 'sellers_pickup_registry' table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sellers_pickup_registry (
                    merchant_id VARCHAR(100) PRIMARY KEY,
                    merchant_nome VARCHAR(200),
                    primeiro_cliente VARCHAR(100),
                    primeira_data VARCHAR(50),
                    primeira_data_iso VARCHAR(20),
                    primeira_semana VARCHAR(50),
                    estado_origem VARCHAR(50),
                    cidade_origem VARCHAR(100),
                    bairro_origem VARCHAR(150),
                    cep_origem VARCHAR(20),
                    endereco_origem TEXT,
                    volume_primeiro_dia INTEGER DEFAULT 0,
                    volume_acumulado_total INTEGER DEFAULT 0,
                    total_dias_ativos INTEGER DEFAULT 1,
                    ultima_data VARCHAR(50),
                    ultima_data_iso VARCHAR(20),
                    status_seller VARCHAR(50) DEFAULT 'Novo'
                );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_spr_primeira_data_iso ON sellers_pickup_registry(primeira_data_iso);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_spr_estado ON sellers_pickup_registry(estado_origem);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_spr_cidade ON sellers_pickup_registry(cidade_origem);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_spr_bairro ON sellers_pickup_registry(bairro_origem);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_spr_cliente ON sellers_pickup_registry(primeiro_cliente);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_spr_status ON sellers_pickup_registry(status_seller);")

            # Check and add gestor columns to solicitacoes_implantacao
            cursor.execute("PRAGMA table_info(solicitacoes_implantacao);")
            sol_cols = [col[1] for col in cursor.fetchall()]
            if sol_cols:
                for col_name, col_def in [
                    ("gestor_nome", "VARCHAR(150) DEFAULT 'Gestor FM / Projetos'"),
                    ("parecer_gestor_decisao", "VARCHAR(50) DEFAULT 'Pendente'"),
                    ("parecer_gestor_texto", "TEXT"),
                    ("parecer_gestor_ressalvas", "TEXT"),
                    ("parecer_gestor_data", "VARCHAR(50)")
                ]:
                    if col_name not in sol_cols:
                        cursor.execute(f"ALTER TABLE solicitacoes_implantacao ADD COLUMN {col_name} {col_def};")
                
            conn.commit()
            conn.close()
        except Exception as e:
            print("Error running migrations:", e)

run_migrations()

from sqlalchemy import event

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    if not DATABASE_URL_ENV:
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA cache_size=-64000") # 64MB cache
            cursor.execute("PRAGMA temp_store=MEMORY")
            cursor.execute("PRAGMA mmap_size=268435456") # 256MB Memory-Mapped I/O
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.close()
        except Exception:
            pass

# FastAPI dependency injection for database sessions
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
