import sqlite3

conn = sqlite3.connect(r'C:\ANJUN\Banco de Dados\torre_anjun.db')
cur = conn.cursor()

print("criacao_ingestao_log:")
for r in cur.execute("SELECT * FROM criacao_ingestao_log").fetchall():
    print(" ", r)

print("\nSample row from operacional_pedidos_completo where dia_base='21/10/2026':")
sample = cur.execute("SELECT tempo_coleta, status_pedido, ponto_colecao FROM operacional_pedidos_completo WHERE dia_base='21/10/2026' LIMIT 5").fetchall()
print(sample)
