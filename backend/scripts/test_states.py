import sqlite3

conn = sqlite3.connect(r'C:\ANJUN\Banco de Dados\torre_anjun.db')
c = conn.cursor()

c.execute("SELECT DISTINCT estado FROM criacao_pedidos_historico WHERE estado IS NOT NULL AND estado != ''")
print("Estados criacao:", [r[0] for r in c.fetchall()][:20])

c.execute("SELECT DISTINCT dia_base FROM criacao_pedidos_historico ORDER BY rowid DESC LIMIT 10")
print("Dias criacao recentes:", [r[0] for r in c.fetchall()])

# Check what states are in malha_coordenadas
c.execute("SELECT DISTINCT estado FROM malha_coordenadas WHERE estado IS NOT NULL")
print("Estados malha:", [r[0] for r in c.fetchall()])
