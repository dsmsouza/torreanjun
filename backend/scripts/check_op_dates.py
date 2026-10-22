import sqlite3

conn = sqlite3.connect(r'C:\ANJUN\Banco de Dados\torre_anjun.db')
cur = conn.cursor()

print("Min and max tempo_coleta per dia_base in operacional_pedidos_completo:")
rows = cur.execute("""
    SELECT dia_base, count(*), min(tempo_coleta), max(tempo_coleta)
    FROM operacional_pedidos_completo
    GROUP BY dia_base
""").fetchall()
for r in rows:
    print(r)

print("\nDistinct dates formatted YYYY-MM-DD from tempo_coleta in operacional_pedidos_completo:")
rows2 = cur.execute("""
    SELECT substr(tempo_coleta, 1, 10) as dt, count(*)
    FROM operacional_pedidos_completo
    WHERE tempo_coleta IS NOT NULL AND tempo_coleta != ''
    GROUP BY dt
    ORDER BY dt DESC
    LIMIT 15
""").fetchall()
for r in rows2:
    print(r)
