import sqlite3

conn = sqlite3.connect(r'C:\ANJUN\Banco de Dados\torre_anjun.db')
cur = conn.cursor()

print("Distinct dia_base in detalhe_md_historico:")
dias = [r[0] for r in cur.execute("SELECT DISTINCT dia_base FROM detalhe_md_historico ORDER BY dia_base").fetchall()]
print(dias)

print("\nDistinct dia_base in detalhe_pico_historico:")
dias_pico = [r[0] for r in cur.execute("SELECT DISTINCT dia_base FROM detalhe_pico_historico ORDER BY dia_base").fetchall()]
print(dias_pico)

print("\nDistinct dia_base in auditoria_coleta:")
dias_aud = [r[0] for r in cur.execute("SELECT DISTINCT dia_base FROM auditoria_coleta ORDER BY dia_base").fetchall()]
print(dias_aud)

print("\nDistinct dia_base in operacional_pedidos_completo:")
dias_op = [r[0] for r in cur.execute("SELECT DISTINCT dia_base FROM operacional_pedidos_completo ORDER BY dia_base").fetchall()]
print(dias_op)
