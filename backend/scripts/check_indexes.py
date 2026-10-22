import sqlite3, sys

conn = sqlite3.connect(r'C:\ANJUN\Banco de Dados\torre_anjun.db')
cur = conn.cursor()

print("Indexes on operacional_pedidos_completo:")
for idx in cur.execute("PRAGMA index_list(operacional_pedidos_completo);").fetchall():
    print(" ", idx)

print("\nIndexes on detalhe_md_historico:")
for idx in cur.execute("PRAGMA index_list(detalhe_md_historico);").fetchall():
    print(" ", idx)

print("\nIndexes on detalhe_pico_historico:")
for idx in cur.execute("PRAGMA index_list(detalhe_pico_historico);").fetchall():
    print(" ", idx)
sys.stdout.flush()
