import sqlite3

conn = sqlite3.connect(r'C:\ANJUN\Banco de Dados\torre_anjun.db')
cur = conn.cursor()

tables = cur.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()
print("Tables in torre_anjun.db:")
for t in tables:
    name = t[0]
    count = cur.execute(f'SELECT count(*) FROM "{name}"').fetchone()[0]
    cols = [c[1] for c in cur.execute(f'PRAGMA table_info("{name}")').fetchall()]
    print(f"  {name}: {count} rows")
    print(f"    cols: {cols}")

print("\n--- Let's check dates in detalhe_md_historico if present ---")
try:
    dates = cur.execute("SELECT DISTINCT data_referencia FROM detalhe_md_historico ORDER BY data_referencia").fetchall()
    print("Dates in detalhe_md_historico:", [d[0] for d in dates])
except Exception as e:
    print("Error detalhe_md_historico:", e)

try:
    dates2 = cur.execute("SELECT DISTINCT data FROM auditoria_coleta ORDER BY data").fetchall()
    print("Dates in auditoria_coleta:", [d[0] for d in dates2[:20]], "... total distinct:", len(dates2))
except Exception as e:
    print("Error auditoria_coleta:", e)
