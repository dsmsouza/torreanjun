# -*- coding: utf-8 -*-
r"""
atualizar_nomes_hubs.py — Aplica a atualização oficial dos nomes dos HUBs no sistema ANJUN.
Referência: Imagem oficial da Expansão de Rede (45 HUBs atualizados).
"""

import sqlite3
import sys

DB_PATH = r"c:\ANJUN\Banco de Dados\torre_anjun.db"

HUB_MAPPINGS = [
    # (Nome Antigo, Nome Novo, UF, Cidade)
    ("AL-Z-H001", "AL-57", "AL", "Maceió"),
    ("AM-W-H001", "AM-60", "AM", "Manaus"),
    ("BA-W-H001", "BA-44", "BA", "Feira de Santana"),
    ("BA-W-H002", "BA-45", "BA", "Vitória da Conquista"),
    ("CE-W-H001", "CE-61", "CE", "Itaitinga"),
    ("CE-W-H003", "CE-63", "CE", "Barbalha"),
    ("DF-W-H001", "DF-71", "DF", "Brasília"),
    ("ES-W-H001", "ES-29", "ES", "Viana"),
    ("GO-W-H001", "GO-74", "GO", "Goiânia"),
    ("MA-W-H001", "MA-65", "MA", "São Luís"),
    ("MG-W-H001", "MG-32", "MG", "Contagem"),
    ("MG-Z-H002", "MG-35", "MG", "Governador Valadares"),
    ("MG-Z-H003", "MG-38", "MG", "Uberlândia"),
    ("MG-Z-H004", "MG-39", "MG", "Montes Claros"),
    ("MG-Z-H005", "MG-36", "MG", "Juiz de Fora"),
    ("MG-Z-H006", "MG-37", "MG", "Pouso Alegre"),
    ("MS-W-H001", "MS-79", "MS", "Campo Grande"),
    ("MT-W-H001", "MT-78", "MT", "Cuiabá"),
    ("PA-W-H001", "PA-67", "PA", "Belém"),
    ("PA-W-H002", "PA-69", "PA", "Marabá"),
    ("PA-Z-H001", "PA-68", "PA", "Santarém"),
    ("PB-Z-H001", "PB-58", "PB", "Bayeux"),
    ("PE-W-H001", "PE-54", "PE", "Cabo de Santo Agostinho"),
    ("PI-W-H001", "PI-64", "PI", "Teresina"),
    ("PI-Z-H001", "PI-66", "PI", "Picos"),
    ("PR-W-H001", "PR-83", "PR", "São José dos Pinhais"),
    ("PR-W-H002", "PR-87", "PR", "Maringá"),
    ("PR-Z-H008", "PR-85", "PR", "Guarapuava"),
    ("RJ-W-H001", "RJ-25", "RJ", "São João de Meriti"),
    ("RJ-Z-H001", "RJ-28", "RJ", "Nova Friburgo"),
    ("RN-W-H001", "RN-59", "RN", "Parnamirim"),
    ("RS-W-H001", "RS-90", "RS", "Porto Alegre"),
    ("RS-W-H003", "RS-99", "RS", "Passo Fundo"),
    ("RS-W-H004", "RS-97", "RS", "Santa Maria"),
    ("SC-W-H001", "SC-88", "SC", "Biguaçu"),
    ("SC-Z-H001", "SC-89", "SC", "Guatambu"),
    ("SE-Z-H001", "SE-49", "SE", "Aracaju"),
    ("SP-RR-001", "SP-12", "SP", "São Paulo - Perus"),
    ("SP-RR-002", "SP-13", "SP", "Guarulhos"),
    ("SP-R-TFK001", "SP-10", "SP", "Guarulhos - TFK"),
    ("SP-Z-H002", "SP-14", "SP", "Franca"),
    ("SP-Z-H004", "SP-17", "SP", "Jaú"),
    ("SP-Z-H005", "SP-15", "SP", "São Paulo"),
    ("SP-Z-H006", "SP-11", "SP", "Carapicuíba"),
    ("TO-W-H002", "TO-77", "TO", "Palmas"),
]

def main():
    print(f"Iniciando atualização de {len(HUB_MAPPINGS)} HUBs no banco {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 1. Criar tabela de/para
    cur.execute("""
        CREATE TABLE IF NOT EXISTS hub_de_para (
            nome_antigo TEXT PRIMARY KEY,
            nome_novo TEXT NOT NULL,
            estado TEXT,
            cidade TEXT,
            atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    for antigo, novo, uf, cid in HUB_MAPPINGS:
        cur.execute("""
            INSERT INTO hub_de_para (nome_antigo, nome_novo, estado, cidade)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(nome_antigo) DO UPDATE SET
                nome_novo=excluded.nome_novo,
                estado=excluded.estado,
                cidade=excluded.cidade,
                atualizado_em=CURRENT_TIMESTAMP;
        """, (antigo, novo, uf, cid))
    print("Tabela hub_de_para preenchida com sucesso.")

    # 2. Atualizar malha_coordenadas
    malha_upd = 0
    malha_ins = 0
    for antigo, novo, uf, cid in HUB_MAPPINGS:
        cur.execute("SELECT id, nome_ponto FROM malha_coordenadas WHERE md_codigo = ?", (antigo,))
        row = cur.fetchone()
        if row:
            cur.execute("""
                UPDATE malha_coordenadas
                SET md_codigo = ?, tipo_ponto = 'HUB', regional = ?
                WHERE id = ?
            """, (novo, uf, row[0]))
            malha_upd += 1
        else:
            cur.execute("SELECT id FROM malha_coordenadas WHERE md_codigo = ?", (novo,))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO malha_coordenadas (md_codigo, nome_ponto, cidade, estado, regional, tipo_ponto, funcionando)
                    VALUES (?, ?, ?, ?, ?, 'HUB', 'ATIVADO')
                """, (novo, f"HUB {novo}", cid, uf, uf))
                malha_ins += 1
    print(f"malha_coordenadas: {malha_upd} atualizados, {malha_ins} inseridos.")

    # 3. Atualizar mapa_pontos
    mapa_upd = 0
    mapa_ins = 0
    for antigo, novo, uf, cid in HUB_MAPPINGS:
        cur.execute("SELECT id FROM mapa_pontos WHERE iata = ?", (antigo,))
        rows = cur.fetchall()
        if rows:
            for r in rows:
                cur.execute("UPDATE mapa_pontos SET iata = ? WHERE id = ?", (novo, r[0]))
                mapa_upd += 1
        else:
            cur.execute("SELECT id FROM mapa_pontos WHERE iata = ?", (novo,))
            if not cur.fetchone():
                cur.execute("""
                    INSERT INTO mapa_pontos (iata, nome, cidade, estado, status)
                    VALUES (?, ?, ?, ?, 'Ativado')
                """, (novo, f"HUB {novo}", cid, uf))
                mapa_ins += 1
    print(f"mapa_pontos: {mapa_upd} atualizados, {mapa_ins} inseridos.")

    # 4. Atualizar md_mapping
    mapping_upd = 0
    mapping_ins = 0
    for antigo, novo, uf, cid in HUB_MAPPINGS:
        cur.execute("SELECT id FROM md_mapping WHERE md_codigo = ?", (antigo,))
        r = cur.fetchone()
        if r:
            cur.execute("UPDATE md_mapping SET md_codigo = ?, tipo_ponto = 'HUB', regional = ?, estado = ?, ativo = 1 WHERE id = ?", (novo, uf, uf, r[0]))
            mapping_upd += 1
        else:
            cur.execute("SELECT id FROM md_mapping WHERE md_codigo = ?", (novo,))
            if not cur.fetchone():
                cur.execute("INSERT INTO md_mapping (md_codigo, estado, regional, tipo_ponto, ativo) VALUES (?, ?, ?, 'HUB', 1)", (novo, uf, uf))
                mapping_ins += 1
        
        # Garante também que o código legado mapeie como HUB para compatibilidade
        cur.execute("SELECT id FROM md_mapping WHERE md_codigo = ?", (antigo,))
        if not cur.fetchone():
            cur.execute("INSERT INTO md_mapping (md_codigo, estado, regional, tipo_ponto, ativo) VALUES (?, ?, ?, 'HUB', 1)", (antigo, uf, uf))
    print(f"md_mapping: {mapping_upd} atualizados, {mapping_ins} inseridos.")

    # 5. Atualizar md_sla
    sla_upd = 0
    for antigo, novo, uf, cid in HUB_MAPPINGS:
        cur.execute("SELECT sla_horas, regiao FROM md_sla WHERE md = ?", (antigo,))
        row = cur.fetchone()
        if row:
            cur.execute("INSERT OR REPLACE INTO md_sla (md, sla_horas, regiao) VALUES (?, ?, ?)", (novo, row[0], row[1]))
            sla_upd += 1
    print(f"md_sla: {sla_upd} atualizados/inseridos.")

    # 6. Atualizar d2d_caminhoes_monitoramento
    caminhoes_upd = 0
    for antigo, novo, uf, cid in HUB_MAPPINGS:
        cur.execute("UPDATE d2d_caminhoes_monitoramento SET rede_carregador = ? WHERE rede_carregador = ?", (novo, antigo))
        caminhoes_upd += cur.rowcount
        cur.execute("UPDATE d2d_caminhoes_monitoramento SET seguinte_secao = ? WHERE seguinte_secao = ?", (novo, antigo))
        caminhoes_upd += cur.rowcount
        cur.execute("UPDATE d2d_caminhoes_monitoramento SET rede_descarregador = ? WHERE rede_descarregador = ?", (novo, antigo))
        caminhoes_upd += cur.rowcount
    print(f"d2d_caminhoes_monitoramento: {caminhoes_upd} campos atualizados.")

    # 7. Atualizar detalhe_md_historico e detalhe_cliente_md_historico
    md_hist_upd = 0
    for antigo, novo, uf, cid in HUB_MAPPINGS:
        cur.execute("UPDATE detalhe_md_historico SET md = ? WHERE md = ?", (novo, antigo))
        md_hist_upd += cur.rowcount
        cur.execute("UPDATE detalhe_cliente_md_historico SET md = ? WHERE md = ?", (novo, antigo))
        md_hist_upd += cur.rowcount
        cur.execute("UPDATE detalhe_pickup_historico SET md_vinculado = ? WHERE md_vinculado = ?", (novo, antigo))
        md_hist_upd += cur.rowcount
    print(f"Tabelas de historico de MDs: {md_hist_upd} linhas atualizadas.")

    # 8. Atualizar criacao_pedidos_historico
    cur.execute("CREATE INDEX IF NOT EXISTS idx_criacao_pedidos_ponto ON criacao_pedidos_historico(ponto_colecao);")
    pedidos_upd = 0
    for antigo, novo, uf, cid in HUB_MAPPINGS:
        cur.execute("UPDATE criacao_pedidos_historico SET ponto_colecao = ? WHERE ponto_colecao = ?", (novo, antigo))
        pedidos_upd += cur.rowcount
    print(f"criacao_pedidos_historico: {pedidos_upd} linhas atualizadas.")

    # 9. Atualizar pacotes_sla
    pacotes_upd = 0
    for antigo, novo, uf, cid in HUB_MAPPINGS:
        cur.execute("UPDATE pacotes_sla SET ponto_colecao = ? WHERE ponto_colecao = ?", (novo, antigo))
        pacotes_upd += cur.rowcount
    print(f"pacotes_sla: {pacotes_upd} linhas atualizadas.")

    conn.commit()
    conn.close()
    print("Atualização do Banco de Dados concluída com sucesso!")

if __name__ == "__main__":
    main()
