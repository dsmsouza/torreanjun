# -*- coding: utf-8 -*-
r"""
sincronizar_malha_oficial_iatas.py — Sincroniza IATAs e Tipos Oficiais da Malha ANJUN.
Lê as planilhas oficiais:
  - C:\Users\Anjun_\Downloads\Pontos de MDs.xlsx
  - C:\Users\Anjun_\Downloads\Template oficial MDs SHEIN.xlsx
Garante que todo ponto tenha sua IATA exata como código e tipo de operação correto.
Remove registros incorretos que usavam nomes de pessoas como IATAs.
"""

import openpyxl
import sqlite3
import re
from datetime import datetime

caminho_mds = r"C:\Users\Anjun_\Downloads\Pontos de MDs.xlsx"
caminho_shein = r"C:\Users\Anjun_\Downloads\Template oficial MDs SHEIN.xlsx"

conn = sqlite3.connect(r'C:\ANJUN\Banco de Dados\torre_anjun.db')
cur = conn.cursor()

pontos = {} # iata -> dict

# 1. Carregar Base SHEIN
wb_s = openpyxl.load_workbook(caminho_shein, read_only=True, data_only=True)
ws_s = wb_s["Base"]
for idx, r in enumerate(ws_s.iter_rows(values_only=True)):
    if idx == 0 or not r: continue
    iata = str(r[2] or "").strip().upper()
    if not iata or iata in ("NONE", "NAN", "-"):
        iata = str(r[1] or "").strip().upper()
    if not iata or iata in ("NONE", "NAN", "-"):
        continue
    
    tipo_raw = str(r[3] or "").strip()
    resp = str(r[7] or "").strip()
    tel = str(r[8] or "").strip()
    end = str(r[9] or "").strip()
    cep = re.sub(r'\D', '', str(r[24] or ""))
    uf = str(r[26] or "").strip().upper() or (iata[:2] if len(iata) >= 2 and iata[:2].isalpha() else "SP")
    cid = str(r[27] or "").strip()
    bairro = str(r[28] or "").strip()
    horario = str(r[29] or "").strip()
    lat = float(r[31]) if len(r) > 31 and r[31] is not None and str(r[31]).strip() else None
    lng = float(r[32]) if len(r) > 32 and r[32] is not None and str(r[32]).strip() else None

    t_upper = tipo_raw.upper()
    if "HUB" in t_upper or "GLP" in iata or "-H" in iata or "HUB" in iata:
        tipo_final = "HUB"
    elif "APOIO" in t_upper or "-PA" in iata or "-RR-" in iata:
        tipo_final = "PONTO DE APOIO"
    elif "REDE" in t_upper:
        tipo_final = "PONTO DE REDE"
    else:
        tipo_final = "MINIDROP"

    pontos[iata] = {
        "iata": iata,
        "nome": resp or iata,
        "tipo": tipo_final,
        "cidade": cid or "São Paulo",
        "estado": uf,
        "cep": cep,
        "endereco": end,
        "bairro": bairro,
        "horario": horario or "08:00-18:00",
        "latitude": lat,
        "longitude": lng,
        "responsavel": resp,
        "telefone": tel
    }
wb_s.close()
print(f"Base SHEIN carregada: {len(pontos)} pontos")

# 2. Carregar Pontos de MDs.xlsx
wb_m = openpyxl.load_workbook(caminho_mds, read_only=True, data_only=True)
ws_m = wb_m["Base Atual"]
for idx, r in enumerate(ws_m.iter_rows(values_only=True)):
    if idx == 0 or not r: continue
    iata = str(r[3] or "").strip().upper()
    if not iata or iata in ("NONE", "NAN", "-"): continue
    
    uf = str(r[0] or "").strip().upper()
    cid = str(r[1] or "").strip()
    resp = str(r[13] or "").strip()
    tel = str(r[14] or "").strip()
    end = str(r[15] or "").strip()
    razao = str(r[18] or "").strip()

    t_final = "HUB" if ("-H" in iata or "HUB" in iata) else "MINIDROP"

    if iata not in pontos:
        pontos[iata] = {
            "iata": iata,
            "nome": resp or razao or iata,
            "tipo": t_final,
            "cidade": cid or "São Paulo",
            "estado": uf or "SP",
            "cep": "",
            "endereco": end,
            "bairro": "",
            "horario": "08:00-18:00",
            "latitude": None,
            "longitude": None,
            "responsavel": resp,
            "telefone": tel
        }
    else:
        if resp: pontos[iata]["responsavel"] = resp
        if tel: pontos[iata]["telefone"] = tel
        if end and not pontos[iata]["endereco"]: pontos[iata]["endereco"] = end
        if cid and not pontos[iata]["cidade"]: pontos[iata]["cidade"] = cid
        if uf and not pontos[iata]["estado"]: pontos[iata]["estado"] = uf

# Coordenadas de Gestão de Ponto
if "Gestão de Ponto" in wb_m.sheetnames:
    ws_gp = wb_m["Gestão de Ponto"]
    for idx, r in enumerate(ws_gp.iter_rows(values_only=True)):
        if idx == 0 or not r or len(r) < 3: continue
        iata = str(r[2] or "").strip().upper()
        if iata and iata in pontos:
            lat_lng = str(r[11] or "").strip() if len(r) > 11 else ""
            if lat_lng and "," in lat_lng:
                try:
                    p = lat_lng.split(",")
                    pontos[iata]["latitude"] = float(p[0])
                    pontos[iata]["longitude"] = float(p[1])
                except Exception:
                    pass
wb_m.close()

print(f"Total IATAs consolidadas: {len(pontos)}")

# 3. Remover registros inválidos com nome de pessoa em md_codigo
cur.execute("""
    DELETE FROM malha_coordenadas 
    WHERE md_codigo LIKE '% %' 
       OR md_codigo LIKE 'AILTON OLIVEIRAS%'
       OR md_codigo LIKE 'BETTA VARIEDADES%'
       OR md_codigo LIKE 'REGINALDO TOLEDO%'
       OR md_codigo LIKE 'ANDREA LIMA%'
       OR md_codigo LIKE 'ANJUN _L A ZAMBELLO%'
       OR md_codigo LIKE 'MERCADO RAPIDO%'
       OR md_codigo LIKE 'FAST DISTRIBUICAO%'
       OR md_codigo LIKE 'TOP STAR%'
       OR md_codigo LIKE 'STYLE FEET%'
       OR md_codigo LIKE 'MILAN LOGISTICA%'
       OR md_codigo LIKE 'CHT LOGISTICA%'
       OR md_codigo LIKE 'HAPPYBUY%'
       OR md_codigo LIKE 'RAFAELLA SANTOS%'
       OR md_codigo LIKE 'JACKCARLOS%';
""")

cur.execute("""
    DELETE FROM md_mapping 
    WHERE md_codigo LIKE '% %' 
       OR md_codigo LIKE 'AILTON OLIVEIRAS%'
       OR md_codigo LIKE 'BETTA VARIEDADES%'
       OR md_codigo LIKE 'REGINALDO TOLEDO%'
       OR md_codigo LIKE 'ANDREA LIMA%'
       OR md_codigo LIKE 'ANJUN _L A ZAMBELLO%'
       OR md_codigo LIKE 'MERCADO RAPIDO%'
       OR md_codigo LIKE 'FAST DISTRIBUICAO%'
       OR md_codigo LIKE 'TOP STAR%'
       OR md_codigo LIKE 'STYLE FEET%'
       OR md_codigo LIKE 'MILAN LOGISTICA%'
       OR md_codigo LIKE 'CHT LOGISTICA%'
       OR md_codigo LIKE 'HAPPYBUY%'
       OR md_codigo LIKE 'RAFAELLA SANTOS%'
       OR md_codigo LIKE 'JACKCARLOS%';
""")

cur.execute("""
    DELETE FROM mapa_pontos 
    WHERE iata LIKE '% %' 
       OR iata LIKE 'Ailton Oliveiras%'
       OR iata LIKE 'Betta variedades%'
       OR iata LIKE 'Reginaldo Toledo%'
       OR iata LIKE 'ANDREA LIMA%'
       OR iata LIKE 'Anjun _L A ZAMBELLO%'
       OR iata LIKE 'MERCADO RAPIDO%'
       OR iata LIKE 'FAST DISTRIBUICAO%'
       OR iata LIKE 'TOP STAR%'
       OR iata LIKE 'STYLE FEET%'
       OR iata LIKE 'MILAN LOGISTICA%'
       OR iata LIKE 'CHT LOGISTICA%'
       OR iata LIKE 'Happybuy%'
       OR iata LIKE 'RAFAELLA SANTOS%'
       OR iata LIKE 'JACKCARLOS%'
       OR iata = 'Nao encontrado';
""")

conn.commit()

# 4. Inserir ou atualizar na malha_coordenadas e md_mapping
sql_ins_malha = """
    INSERT INTO malha_coordenadas (
        md_codigo, nome_ponto, tipo_ponto, latitude, longitude,
        cep, endereco, horario_trabalho, cidade, estado, regional, funcionando
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(md_codigo) DO UPDATE SET
        nome_ponto = COALESCE(excluded.nome_ponto, malha_coordenadas.nome_ponto),
        tipo_ponto = excluded.tipo_ponto,
        cidade = COALESCE(NULLIF(excluded.cidade, ''), malha_coordenadas.cidade),
        estado = COALESCE(NULLIF(excluded.estado, ''), malha_coordenadas.estado),
        latitude = COALESCE(excluded.latitude, malha_coordenadas.latitude),
        longitude = COALESCE(excluded.longitude, malha_coordenadas.longitude),
        endereco = COALESCE(NULLIF(excluded.endereco, ''), malha_coordenadas.endereco),
        horario_trabalho = COALESCE(NULLIF(excluded.horario_trabalho, ''), malha_coordenadas.horario_trabalho);
"""

cur.execute("DELETE FROM malha_coordenadas WHERE id NOT IN (SELECT MAX(id) FROM malha_coordenadas GROUP BY md_codigo);")
cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_mc_md_codigo_unq ON malha_coordenadas(md_codigo);")

dados_malha = []
dados_md_map = []
dados_mapa_pts = []

for code, pt in pontos.items():
    lat = pt["latitude"]
    lng = pt["longitude"]
    cid = pt["cidade"] or "São Paulo"
    uf = pt["estado"] or "SP"
    tipo = pt["tipo"]
    end = pt["endereco"] or ""
    cep = pt["cep"] or ""
    hor = pt["horario"] or "08:00-18:00"
    nome = pt["nome"] or code

    dados_malha.append((
        code, nome, tipo, lat, lng, cep, end, hor, cid, uf, uf, "ATIVADO"
    ))

    dados_md_map.append((
        code, uf, uf, tipo, 1
    ))

    dados_mapa_pts.append((
        code, nome, uf, cid, end, lat, lng, cep, hor, "ANJUN", "Ativado", tipo
    ))

# Inserir em chunks
cur.executemany("""
    INSERT OR REPLACE INTO malha_coordenadas (
        md_codigo, nome_ponto, tipo_ponto, latitude, longitude,
        cep, endereco, horario_trabalho, cidade, estado, regional, funcionando
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", dados_malha)

cur.executemany("""
    INSERT OR REPLACE INTO md_mapping (
        md_codigo, estado, regional, tipo_ponto, ativo
    ) VALUES (?, ?, ?, ?, ?)
""", dados_md_map)

cur.execute("""
    CREATE TABLE IF NOT EXISTS mapa_pontos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        iata VARCHAR(50),
        nome VARCHAR(200),
        estado VARCHAR(50),
        cidade VARCHAR(100),
        endereco TEXT,
        latitude FLOAT,
        longitude FLOAT,
        cep VARCHAR(20),
        horario VARCHAR(100),
        provedor VARCHAR(100),
        status VARCHAR(50),
        observacao TEXT
    );
""")
cur.execute("DELETE FROM mapa_pontos WHERE id NOT IN (SELECT MAX(id) FROM mapa_pontos GROUP BY iata);")
cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_mapa_pontos_iata ON mapa_pontos(iata);")

cur.executemany("""
    INSERT OR REPLACE INTO mapa_pontos (
        iata, nome, estado, cidade, endereco, latitude, longitude, cep, horario, provedor, status, observacao
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""", dados_mapa_pts)

conn.commit()

# Resumo final
total_mc = cur.execute("SELECT count(*) FROM malha_coordenadas;").fetchone()[0]
total_mm = cur.execute("SELECT count(*) FROM md_mapping;").fetchone()[0]
total_mp = cur.execute("SELECT count(*) FROM mapa_pontos;").fetchone()[0]

print("\n--- SINCRONIZAÇÃO CONCLUÍDA ---")
print(f"Total em malha_coordenadas: {total_mc}")
print(f"Total em md_mapping: {total_mm}")
print(f"Total em mapa_pontos: {total_mp}")

# Contagem por tipo em md_mapping
print("\n--- DISTRIBUIÇÃO POR TIPO EM md_mapping ---")
for r in cur.execute("SELECT tipo_ponto, count(*) FROM md_mapping GROUP BY tipo_ponto ORDER BY count(*) DESC;").fetchall():
    print(f"  {r[0]}: {r[1]} pontos")

conn.close()
