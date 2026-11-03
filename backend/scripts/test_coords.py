import sqlite3

conn = sqlite3.connect(r'C:\ANJUN\Banco de Dados\torre_anjun.db')
c = conn.cursor()

c.execute("SELECT md_codigo, nome_ponto, cidade, estado, latitude, longitude FROM malha_coordenadas WHERE latitude IS NOT NULL AND latitude != '' LIMIT 5")
for r in c.fetchall():
    print(r)
