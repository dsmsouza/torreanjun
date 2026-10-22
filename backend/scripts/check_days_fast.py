import sqlite3, sys

conn = sqlite3.connect(r'C:\ANJUN\Banco de Dados\torre_anjun.db')
cur = conn.cursor()

print("Distinct dia_base in operacional_pedidos_completo:")
for r in cur.execute("SELECT DISTINCT dia_base FROM operacional_pedidos_completo").fetchall():
    cnt = cur.execute("SELECT count(*) FROM operacional_pedidos_completo WHERE dia_base = ?", (r[0],)).fetchone()[0]
    print(f"  {r[0]}: {cnt:,} rows")

print("\nDistinct dia_base in detalhe_md_historico for October:")
for r in cur.execute("SELECT DISTINCT dia_base FROM detalhe_md_historico WHERE dia_base LIKE '%/10/2026%' ORDER BY dia_base").fetchall():
    cnt = cur.execute("SELECT count(*), sum(total), sum(backlog) FROM detalhe_md_historico WHERE dia_base = ?", (r[0],)).fetchone()
    print(f"  {r[0]}: {cnt[0]} mds, total={cnt[1]}, backlog={cnt[2]}")

sys.stdout.flush()
