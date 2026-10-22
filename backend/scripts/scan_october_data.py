import sqlite3

conn = sqlite3.connect(r'C:\ANJUN\Banco de Dados\torre_anjun.db')
cur = conn.cursor()

tables = cur.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()
for t in tables:
    tname = t[0]
    cols = [c[1] for c in cur.execute(f'PRAGMA table_info("{tname}")').fetchall()]
    date_cols = [c for c in cols if any(k in c.lower() for k in ['dia', 'data', 'tempo'])]
    if date_cols:
        for dc in date_cols:
            try:
                res = cur.execute(f'SELECT DISTINCT {dc} FROM "{tname}" WHERE {dc} LIKE "%10/2026%" OR {dc} LIKE "%2026-10%" LIMIT 10').fetchall()
                if res:
                    print(f"Table {tname}, col {dc}: found October dates! Sample: {[r[0] for r in res[:5]]}")
            except Exception as e:
                pass
