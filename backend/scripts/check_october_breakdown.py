import sqlite3

conn = sqlite3.connect(r'C:\ANJUN\Banco de Dados\torre_anjun.db')
cur = conn.cursor()

print("--- operacional_pedidos_completo summary by dia_base ---")
rows = cur.execute("""
    SELECT dia_base, count(*), count(DISTINCT ponto_colecao), count(DISTINCT codigo_barras)
    FROM operacional_pedidos_completo
    GROUP BY dia_base
""").fetchall()
for r in rows:
    print(r)

print("\n--- detalhe_md_historico summary by dia_base for October ---")
rows2 = cur.execute("""
    SELECT dia_base, count(*), count(DISTINCT md), sum(total), sum(backlog)
    FROM detalhe_md_historico
    WHERE dia_base LIKE '%10/2026%'
    GROUP BY dia_base
    ORDER BY substr(dia_base, 7, 4) || substr(dia_base, 4, 2) || substr(dia_base, 1, 2)
""").fetchall()
for r in rows2:
    print(r)

print("\n--- detalhe_pico_historico summary by dia_base for October ---")
rows3 = cur.execute("""
    SELECT dia_base, count(*), count(DISTINCT md), sum(volume)
    FROM detalhe_pico_historico
    WHERE dia_base LIKE '%10/2026%'
    GROUP BY dia_base
    ORDER BY substr(dia_base, 7, 4) || substr(dia_base, 4, 2) || substr(dia_base, 1, 2)
""").fetchall()
for r in rows3:
    print(r)
