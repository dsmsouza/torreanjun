import sqlite3

conn = sqlite3.connect(r'C:\ANJUN\Banco de Dados\torre_anjun.db')
c = conn.cursor()

c.execute("SELECT md_codigo, nome_ponto, cidade, cep, endereco FROM malha_coordenadas WHERE cep LIKE '19%' LIMIT 10")
for r in c.fetchall():
    print(r)
