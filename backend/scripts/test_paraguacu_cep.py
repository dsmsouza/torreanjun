import sqlite3

conn = sqlite3.connect(r'C:\ANJUN\Banco de Dados\torre_anjun.db')
c = conn.cursor()

c.execute("SELECT cidade, estado, cep FROM criacao_resumo_cep WHERE LOWER(cidade) LIKE '%paragua%' LIMIT 5")
print(c.fetchall())
