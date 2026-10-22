# -*- coding: utf-8 -*-
"""
reconciliacao_pacotes.py — Motor de Reconciliação Retroativa de Pacotes e Auditoria de Pacotes Sem Atualização.

Quando uma planilha é enviada (seja de um dia novo como 06/10 ou re-subindo um dia antigo como 03/10):
  1. Identifica pelo código de barras (Coluna B) se o pacote já existe em operacional_pedidos_completo
     (mesmo que tenha sido originalmente bipado em um dia anterior, ex: 03/10).
  2. Se o status mudou (ex: de 'coletado' em 03/10 para 'Circuito fechado' em 06/10):
     - Atualiza o status do pacote lá no dia de origem (03/10) em operacional_pedidos_completo;
     - Registra a transição individual em log_mudancas_status_pacotes ("Pacote X do dia 03/10 foi atualizado em 06/10");
     - Recalcula criacao_pedidos_historico para os dias de origem afetados e invalida o cache de snapshot desses dias.
  3. Mantém o painel de pacotes não finalizados (que não chegaram em 'Circuito fechado'), calculando
     exatamente há quantos dias estão sem atualização ("Há X dias sem atualização").
"""

import os
import re
import csv
import json
import datetime
from pathlib import Path
from typing import Optional, Callable, Dict, Any, List, Set, Tuple
from sqlalchemy import text
from sqlalchemy.orm import Session


def garantir_tabelas_reconciliacao(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS log_mudancas_status_pacotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo_barras TEXT NOT NULL,
            dia_origem TEXT NOT NULL,
            dia_atualizacao TEXT NOT NULL,
            ponto_colecao TEXT DEFAULT '',
            nome_cliente TEXT DEFAULT '',
            merchant_nome TEXT DEFAULT '',
            estado TEXT DEFAULT '',
            cidade TEXT DEFAULT '',
            status_anterior TEXT NOT NULL,
            status_novo TEXT NOT NULL,
            registrado_em TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """))
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_log_mud_bar ON log_mudancas_status_pacotes (codigo_barras);"))
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_log_mud_orig ON log_mudancas_status_pacotes (dia_origem);"))
    db.execute(text("CREATE INDEX IF NOT EXISTS idx_log_mud_atu ON log_mudancas_status_pacotes (dia_atualizacao);"))

    db.execute(text("""
        CREATE TABLE IF NOT EXISTS log_reconciliacao_planilhas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dia_planilha TEXT NOT NULL,
            data_hora_upload TEXT NOT NULL,
            total_pacotes_lidos INTEGER DEFAULT 0,
            pacotes_novos INTEGER DEFAULT 0,
            pacotes_atualizados_status INTEGER DEFAULT 0,
            pacotes_retroativos_outros_dias INTEGER DEFAULT 0,
            dias_afetados TEXT DEFAULT '',
            resumo_transicoes TEXT DEFAULT ''
        );
    """))
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS dias_granulares (
            dia_base TEXT PRIMARY KEY,
            marcado_em TEXT
        );
    """))
    for tabela, coluna, tipo in [
        ("log_mudancas_status_pacotes", "data_conclusao", "TEXT DEFAULT ''"),
        ("log_reconciliacao_planilhas", "pacotes_de_outros_dias", "INTEGER DEFAULT 0"),
    ]:
        try:
            db.execute(text(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {tipo};"))
        except Exception:
            pass
    db.commit()


def _dia_para_date(dia_str: str) -> Optional[datetime.date]:
    if not dia_str or len(dia_str) < 10:
        return None
    try:
        return datetime.datetime.strptime(dia_str[:10], "%d/%m/%Y").date()
    except Exception:
        return None


def _dia_para_iso(dia_str: str) -> str:
    if not dia_str or len(dia_str) < 10:
        return "0000-00-00"
    return f"{dia_str[6:10]}-{dia_str[3:5]}-{dia_str[0:2]}"


def _invalidar_cache_snapshot_dias(dias: Set[str]):
    """Remove os arquivos JSON em cache das datas e meses que sofreram atualização retroativa."""
    try:
        root_dir = Path(__file__).resolve().parent.parent.parent
        snap_dir = root_dir / "frontend" / "public" / "snapshot"
        if not snap_dir.exists():
            return
        for d in dias:
            if not d:
                continue
            safe_d = d.replace("/", "-")
            for prefix in ["resumo_", "mds_", "hubs_", "sellers_", "horarios_", "no_dia_", "d2d_sp_DIA_"]:
                p = snap_dir / f"{prefix}{safe_d}.json"
                if p.exists():
                    try:
                        p.unlink()
                    except Exception:
                        pass
            if len(d) == 10 and d[2] == "/" and d[5] == "/":
                safe_m = f"MES_{d[3:10].replace('/', '-')}"
                for prefix in ["resumo_", "mds_", "hubs_", "sellers_", "horarios_"]:
                    pm = snap_dir / f"{prefix}{safe_m}.json"
                    if pm.exists():
                        try:
                            pm.unlink()
                        except Exception:
                            pass
    except Exception:
        pass


def _extrair_dia_coluna_m(valor: str) -> Optional[str]:
    """Converte o 'Tempo real para a coleta' (Coluna M) em DD/MM/YYYY."""
    v = (valor or "").strip()
    if not v:
        return None
    m_iso = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", v)
    if m_iso:
        y, mo, d = m_iso.groups()
        try:
            return datetime.date(int(y), int(mo), int(d)).strftime("%d/%m/%Y")
        except ValueError:
            return None
    m_br = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", v)
    if m_br:
        d, mo, y = m_br.groups()
        try:
            return datetime.date(int(y), int(mo), int(d)).strftime("%d/%m/%Y")
        except ValueError:
            return None
    return None


def _carregar_dias_granulares(db: Session) -> Set[str]:
    """Dias que possuem a base completa pacote a pacote (código de barras) em operacional_pedidos_completo."""
    rows = db.execute(text("SELECT dia_base FROM dias_granulares;")).fetchall()
    if not rows:
        # Semente inicial: dias que já foram carregados pacote a pacote anteriormente
        db.execute(text("""
            INSERT OR IGNORE INTO dias_granulares (dia_base, marcado_em)
            SELECT DISTINCT dia_base, :agora FROM operacional_pedidos_completo WHERE dia_base IS NOT NULL;
        """), {"agora": datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")})
        db.commit()
        rows = db.execute(text("SELECT dia_base FROM dias_granulares;")).fetchall()
    return {r[0] for r in rows if r[0]}


def _reconstruir_agregado_dia(db: Session, dia: str, mapa_clientes: Dict[str, str]):
    """Recalcula criacao_pedidos_historico de um dia a partir da base pacote a pacote."""
    case_clientes_lista = [
        f"WHEN TRIM(numero_cliente) = '{cid}' THEN '{nome.replace(chr(39), chr(39) * 2)}'"
        for cid, nome in mapa_clientes.items()
    ]
    sql_case = "\n                ".join(case_clientes_lista) if case_clientes_lista else "WHEN 1=0 THEN ''"
    db.execute(text("DELETE FROM criacao_pedidos_historico WHERE dia_base = :d;"), {"d": dia})
    db.execute(text(f"""
        INSERT INTO criacao_pedidos_historico (
            dia_base, semana_base, nome_cliente, merchant_id, merchant_nome,
            cep_remetente, estado, cidade, bairro, endereco_completo,
            maneira_coleta, ponto_colecao, tipo_pedido, status_pedido, total_pedidos
        )
        SELECT
            dia_base,
            MAX(semana_base),
            CASE
                {sql_case}
                WHEN LOWER(remetente_nome) LIKE '%shein%' OR LOWER(merchant_nome) LIKE '%shein%' THEN 'shein'
                WHEN LOWER(remetente_nome) LIKE '%temu%' OR LOWER(merchant_nome) LIKE '%temu%' THEN 'temud2d'
                WHEN LOWER(remetente_nome) LIKE '%kwai%' OR LOWER(merchant_nome) LIKE '%kwai%' THEN 'kwai'
                WHEN LOWER(remetente_nome) LIKE '%tiktok%' OR LOWER(merchant_nome) LIKE '%tiktok%' THEN 'tiktok logistics brazil ltda'
                WHEN numero_cliente IS NOT NULL AND TRIM(numero_cliente) != '' THEN 'Cliente ' || TRIM(numero_cliente)
                ELSE 'Outros'
            END as nome_cliente,
            merchant_id, merchant_nome, remetente_cep, remetente_uf, remetente_cidade,
            remetente_bairro, remetente_endereco, maneira_coleta, ponto_colecao,
            tipo_pedido, status_pedido, COUNT(*) as total_pedidos
        FROM operacional_pedidos_completo
        WHERE dia_base = :d
        GROUP BY
            dia_base, nome_cliente, merchant_id, merchant_nome,
            remetente_cep, remetente_uf, remetente_cidade, remetente_bairro, remetente_endereco,
            maneira_coleta, ponto_colecao, tipo_pedido, status_pedido;
    """), {"d": dia})


def reconciliar_planilha_otimizada_csv(
    db: Session,
    caminho_csv: str,
    dia_planilha: str,
    semana_planilha: str,
    callback_log: Optional[Callable[[str], None]] = None
) -> Dict[str, Any]:
    """
    Regra oficial de contagem (cada pacote conta UMA única vez, no dia em que foi coletado):
      - Dia de origem do pacote = data da Coluna M (Tempo real para a coleta). Sem Coluna M -> dia da planilha.
      - Se o código de barras JÁ existe no banco (em qualquer data): apenas o status / Data de conclusão
        (Coluna N) são atualizados no registro original, e a mudança é registrada no log.
        O pacote NÃO soma no volume do dia da planilha nova.
      - Se o código de barras é novo: entra no dia da sua Coluna M.
      - Retorna 'csv_dia_proprio': CSV apenas com os pacotes que pertencem ao dia da planilha, usado para
        montar os indicadores do dia (Criação de Pedidos, Dropoff/MDs) sem contagem dupla.
    """
    if not caminho_csv or not os.path.exists(caminho_csv):
        return {"status": "ignorado", "motivo": "CSV não encontrado", "csv_dia_proprio": caminho_csv}

    garantir_tabelas_reconciliacao(db)
    from services.ingestao_streaming_500mb import criar_tabelas_banco
    criar_tabelas_banco(db)

    dias_granulares = _carregar_dias_granulares(db)
    dia_ja_era_granular = dia_planilha in dias_granulares

    mapa_clientes: Dict[str, str] = {}
    try:
        for cid, cnome in db.execute(text("SELECT cliente_id, nome_exibicao FROM cliente_mapping WHERE ativo = 1;")).fetchall():
            if cid and cnome:
                mapa_clientes[str(cid).strip()] = str(cnome).strip()
    except Exception:
        pass

    # Saldo de status antigo (para dias que ainda não tinham base pacote a pacote)
    resumo_status_antigo: Dict[str, int] = {}
    if not dia_ja_era_granular:
        try:
            for r in db.execute(text("""
                SELECT LOWER(TRIM(COALESCE(status_pedido, ''))), SUM(total_pedidos)
                FROM criacao_pedidos_historico WHERE dia_base = :d
                GROUP BY LOWER(TRIM(COALESCE(status_pedido, '')));
            """), {"d": dia_planilha}).fetchall():
                resumo_status_antigo[str(r[0])] = int(r[1] or 0)
        except Exception:
            pass

    # 1. Leitura do CSV otimizado (23 colunas: ... 21:BH tipo_pedido, 22:N Data de conclusão)
    header: List[str] = []
    pacotes_csv: Dict[str, Tuple[Tuple, List[str]]] = {}
    with open(caminho_csv, mode="r", encoding="utf-8-sig", errors="replace", newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None) or []
        if not header:
            return {"status": "vazio", "csv_dia_proprio": caminho_csv}
        for row in reader:
            if len(row) < 10:
                continue
            bcode = str(row[0] or "").strip().upper()
            if not bcode or bcode in ("NAN", "NONE"):
                continue

            def g(i: int, default: str = "") -> str:
                return str(row[i] or "").strip() if len(row) > i else default

            dados = (
                bcode,
                g(1).split(".")[0],        # num_cli
                g(2),                      # num_saca
                g(3),                      # ajv
                g(4),                      # maneira
                g(5),                      # t_criacao
                g(6),                      # t_prev
                g(7),                      # t_coleta (Coluna M)
                g(8) or "coletado",        # status
                g(9).upper(),              # ponto
                g(10),                     # carregadeira
                g(11),                     # t_desc
                g(12),                     # merchant_id
                g(13),                     # merchant_nome
                g(14),                     # remetente_nome
                g(15),                     # cep
                g(16).upper() or "SP",     # uf
                g(17),                     # cidade
                g(18),                     # bairro
                g(19),                     # endereco
                g(20).upper(),             # uf destino
                g(21) or "Normal",         # tipo_pedido
                g(22),                     # data_conclusao (Coluna N)
            )
            pacotes_csv[bcode] = (dados, row)

    total_lidos = len(pacotes_csv)
    if total_lidos == 0:
        return {"status": "vazio", "total_pacotes_lidos": 0, "csv_dia_proprio": caminho_csv}

    if callback_log:
        callback_log(f"🔎 Auditando {total_lidos:,} códigos de barras contra todo o histórico do banco...")

    # 2. Localizar pacotes já existentes (em qualquer data) — se houver duplicidade legada, vale o dia mais antigo
    raw_conn = db.connection().connection
    cur = raw_conn.cursor()
    existentes: Dict[str, Tuple[int, str, str, str, str]] = {}
    barcodes = list(pacotes_csv.keys())
    for i in range(0, len(barcodes), 900):
        lote = barcodes[i:i + 900]
        cur.execute(
            f"SELECT id, codigo_barras, dia_base, status_pedido, ponto_colecao, data_conclusao "
            f"FROM operacional_pedidos_completo WHERE codigo_barras IN ({','.join(['?'] * len(lote))})",
            lote,
        )
        for rid, b, d, st, pt, conc in cur.fetchall():
            atual = existentes.get(b)
            if atual is None or _dia_para_iso(d or "") < _dia_para_iso(atual[1]):
                existentes[b] = (rid, d or dia_planilha, st or "", pt or "", conc or "")

    agora_str = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    updates_db: List[Tuple] = []
    inserts_db: List[Tuple] = []
    logs_mudanca: List[Tuple] = []
    linhas_dia_proprio: List[List[str]] = []
    dias_afetados: Set[str] = set()
    transicoes: Dict[str, int] = {}
    pacotes_novos = 0
    pacotes_atualizados = 0
    pacotes_retroativos = 0
    pacotes_de_outros_dias = 0

    for bcode, (dados, row_raw) in pacotes_csv.items():
        (_, num_cli, num_saca, ajv, maneira, t_criacao, t_prev, t_coleta, status_novo, ponto,
         carreg, t_desc, m_id, m_nome, rem_nome, rem_cep, rem_uf, rem_cid, rem_bai, rem_end,
         dest_uf, tipo_ped, data_conc) = dados

        if bcode in existentes:
            rid, dia_orig, st_ant, pt_ant, conc_ant = existentes[bcode]
            dia_destino = dia_orig
            mudou_status = st_ant.strip().lower() != status_novo.strip().lower()
            mudou_conclusao = bool(data_conc) and data_conc != conc_ant
            if mudou_status or mudou_conclusao:
                updates_db.append((status_novo, data_conc or None, t_desc or None, ajv or None, num_saca or None, rid))
                if dia_orig != dia_planilha:
                    dias_afetados.add(dia_orig)
            if mudou_status:
                nome_cli = mapa_clientes.get(num_cli, f"Cliente {num_cli}" if num_cli else (rem_nome or "Outros"))
                logs_mudanca.append((
                    bcode, dia_orig, dia_planilha, ponto or pt_ant, nome_cli, m_nome or rem_nome,
                    rem_uf, rem_cid, st_ant.strip(), status_novo.strip(), data_conc, agora_str,
                ))
                chave = f"{st_ant.strip() or 'Sem status'} → {status_novo.strip()}"
                transicoes[chave] = transicoes.get(chave, 0) + 1
                pacotes_atualizados += 1
                if dia_orig != dia_planilha:
                    pacotes_retroativos += 1
        else:
            pacotes_novos += 1
            dia_destino = _extrair_dia_coluna_m(t_coleta) or dia_planilha
            inserts_db.append((
                dia_destino, semana_planilha, num_saca, bcode, "", num_cli,
                num_saca, ajv, "1", maneira, 0.0, 0.0,
                t_criacao, t_prev, t_coleta, data_conc, status_novo, ponto,
                "", carreg, "", "", t_desc,
                m_id, m_nome, rem_nome, "", "",
                rem_cep, rem_uf, rem_cid, rem_bai, rem_end,
                "", "", "", "", dest_uf,
                "", "", "", "", tipo_ped,
                0.0, 0.0, 0.0, "", None, 1 if dest_uf == "SP" else 0,
            ))
            if dia_destino != dia_planilha:
                dias_afetados.add(dia_destino)

        if dia_destino == dia_planilha:
            linhas_dia_proprio.append(row_raw)
        else:
            pacotes_de_outros_dias += 1

    # 3. Persistir atualizações, novos pacotes e log de mudanças
    if updates_db:
        cur.executemany("""
            UPDATE operacional_pedidos_completo
            SET status_pedido = ?,
                data_conclusao = COALESCE(?, data_conclusao),
                tempo_descarregamento = COALESCE(?, tempo_descarregamento),
                ajv_veiculo = COALESCE(?, ajv_veiculo),
                numero_saca = COALESCE(?, numero_saca)
            WHERE id = ?
        """, updates_db)

    if inserts_db:
        sql_ins = """
            INSERT INTO operacional_pedidos_completo (
                dia_base, semana_base, pedido_coleta, codigo_barras, pedido_cliente, numero_cliente,
                numero_saca, ajv_veiculo, numero_pacote, maneira_coleta, peso_kg, valor_declarado,
                tempo_criacao, tempo_previsto, tempo_coleta, data_conclusao, status_pedido, ponto_colecao,
                colector, carregadeira, tempo_carregamento, descarregador, tempo_descarregamento,
                merchant_id, merchant_nome, remetente_nome, remetente_tel, remetente_email,
                remetente_cep, remetente_uf, remetente_cidade, remetente_bairro, remetente_endereco,
                destinatario_nome, destinatario_tel, destinatario_email, destinatario_cep, destinatario_uf,
                destinatario_cidade, destinatario_bairro, destinatario_endereco, plataforma, tipo_pedido,
                comprimento, largura, altura, saida_armazem_cliente, lead_time_perus_horas, is_destino_sp
            ) VALUES (""" + ", ".join(["?"] * 49) + ")"
        for i in range(0, len(inserts_db), 15000):
            cur.executemany(sql_ins, inserts_db[i:i + 15000])

    if logs_mudanca:
        cur.executemany("""
            INSERT INTO log_mudancas_status_pacotes (
                codigo_barras, dia_origem, dia_atualizacao, ponto_colecao, nome_cliente, merchant_nome,
                estado, cidade, status_anterior, status_novo, data_conclusao, registrado_em
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, logs_mudanca)

    # O dia da planilha passa a ter base completa pacote a pacote
    db.execute(text("INSERT OR IGNORE INTO dias_granulares (dia_base, marcado_em) VALUES (:d, :a);"),
               {"d": dia_planilha, "a": agora_str})
    db.commit()

    # 4. Primeiro re-upload de um dia que só tinha totais: registra a evolução pelo saldo de status
    if not dia_ja_era_granular and resumo_status_antigo:
        novo_cf = sum(1 for r in linhas_dia_proprio if len(r) > 8 and str(r[8]).strip().lower() == "circuito fechado")
        ant_cf = resumo_status_antigo.get("circuito fechado", 0)
        if novo_cf > ant_cf:
            transicoes["Backlog / Trânsito → Circuito fechado (1º re-upload da data)"] = novo_cf - ant_cf
            pacotes_atualizados += novo_cf - ant_cf

    # 5. Recalcular os totais dos dias anteriores afetados (somente dias com base pacote a pacote completa)
    dias_recalculados = sorted(d for d in dias_afetados if d in dias_granulares and d != dia_planilha)
    dias_sem_base = sorted(d for d in dias_afetados if d not in dias_granulares)
    for d_af in dias_recalculados:
        _reconstruir_agregado_dia(db, d_af, mapa_clientes)
    db.commit()

    _invalidar_cache_snapshot_dias(set(dias_recalculados) | {dia_planilha})

    # 6. CSV somente com os pacotes do próprio dia (evita contagem dupla nos indicadores do dia)
    csv_dia_proprio = caminho_csv
    if pacotes_de_outros_dias > 0:
        csv_dia_proprio = caminho_csv[:-4] + "_dia_proprio.csv"
        with open(csv_dia_proprio, mode="w", encoding="utf-8-sig", newline="") as f_out:
            w = csv.writer(f_out)
            w.writerow(header)
            w.writerows(linhas_dia_proprio)

    db.execute(text("""
        INSERT INTO log_reconciliacao_planilhas (
            dia_planilha, data_hora_upload, total_pacotes_lidos, pacotes_novos,
            pacotes_atualizados_status, pacotes_retroativos_outros_dias,
            dias_afetados, resumo_transicoes, pacotes_de_outros_dias
        ) VALUES (:dp, :dh, :tot, :nov, :atu, :ret, :daf, :res, :out);
    """), {
        "dp": dia_planilha, "dh": agora_str, "tot": total_lidos, "nov": pacotes_novos,
        "atu": pacotes_atualizados, "ret": pacotes_retroativos,
        "daf": ", ".join(sorted(dias_afetados | {dia_planilha})),
        "res": json.dumps(transicoes, ensure_ascii=False), "out": pacotes_de_outros_dias,
    })
    db.commit()

    if callback_log:
        callback_log(
            f"🔄 Reconciliação: {pacotes_novos:,} pacotes novos | {pacotes_atualizados:,} com status atualizado "
            f"({pacotes_retroativos:,} em dias anteriores) | {pacotes_de_outros_dias:,} pertencem a outras datas "
            f"e NÃO somaram no volume de {dia_planilha}."
        )
        if dias_sem_base:
            callback_log(
                f"ℹ️ Datas sem base pacote a pacote (totais não recalculados até re-subir a planilha delas): "
                f"{', '.join(dias_sem_base[:10])}"
            )

    return {
        "status": "sucesso",
        "dia_planilha": dia_planilha,
        "total_pacotes_lidos": total_lidos,
        "pacotes_novos": pacotes_novos,
        "pacotes_atualizados_status": pacotes_atualizados,
        "pacotes_retroativos_outros_dias": pacotes_retroativos,
        "pacotes_de_outros_dias": pacotes_de_outros_dias,
        "dias_recalculados": dias_recalculados,
        "dias_sem_base_por_pacote": dias_sem_base,
        "transicoes": transicoes,
        "csv_dia_proprio": csv_dia_proprio,
    }


def construir_painel_atualizacoes_e_aging(db: Session) -> Dict[str, Any]:
    """
    Constrói o painel consolidado de:
      1. Pacotes que foram atualizados em uploads posteriores (log_mudancas_status_pacotes + log_reconciliacao_planilhas)
      2. Pacotes que NÃO foram atualizados para 'Circuito fechado' (estagnados / em aberto), mostrando
         exatamente há quantos dias estão sem atualização ("Há X dias sem atualização") por data,
         por faixa de envelhecimento (aging), por ponto de coleta e amostras individuais de códigos de barras.
    """
    garantir_tabelas_reconciliacao(db)

    # 1. Descobrir a data operacional mais recente para calcular 'dias_sem_atualizacao'
    rows_dias = db.execute(text("""
        SELECT DISTINCT dia_base FROM criacao_pedidos_historico
        WHERE dia_base IS NOT NULL AND LENGTH(TRIM(dia_base)) = 10
        ORDER BY SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2) DESC;
    """)).fetchall()
    dias_disp = [r[0] for r in rows_dias if r[0]]
    dia_ref_str = dias_disp[0] if dias_disp else datetime.date.today().strftime("%d/%m/%Y")
    dt_ref = _dia_para_date(dia_ref_str) or datetime.date.today()

    # 2. Resumo por Data de pacotes que ainda NÃO estão em Circuito Fechado (e quantos dias estão sem atualização)
    rows_por_dia = db.execute(text("""
        SELECT 
            dia_base,
            SUM(total_pedidos) as total,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) = 'circuito fechado' THEN total_pedidos ELSE 0 END) as circuito_fechado,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) IN ('carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as em_transito,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) = 'foi assinado' THEN total_pedidos ELSE 0 END) as foi_assinado,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) IN ('coleta', 'coletado', 'saco selado', 'não coletado', 'nao coletado', 'pendente', 'aguardando', 'no ponto', 'problema')
                      OR status_pedido IS NULL OR TRIM(status_pedido) = '' THEN total_pedidos ELSE 0 END) as backlog_coleta
        FROM criacao_pedidos_historico
        WHERE dia_base IS NOT NULL AND LENGTH(TRIM(dia_base)) = 10
          AND ponto_colecao IS NOT NULL
          AND TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')
          AND UPPER(ponto_colecao) NOT LIKE '%SP-R-TFK001%'
          AND UPPER(ponto_colecao) NOT LIKE '%ANJUN%'
        GROUP BY dia_base
        ORDER BY SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2) DESC;
    """)).fetchall()

    # Contagem de pacotes já atualizados retroativamente por dia_origem
    atu_por_dia_orig: Dict[str, int] = {}
    ultima_atu_por_dia_orig: Dict[str, str] = {}
    try:
        rows_atu_d = db.execute(text("""
            SELECT dia_origem, COUNT(*), MAX(dia_atualizacao)
            FROM log_mudancas_status_pacotes
            GROUP BY dia_origem;
        """)).fetchall()
        for r in rows_atu_d:
            atu_por_dia_orig[str(r[0])] = int(r[1] or 0)
            ultima_atu_por_dia_orig[str(r[0])] = str(r[2] or "")
    except Exception:
        pass

    # Tempo médio entre a coleta no MD (Coluna M) e a conclusão / Circuito Fechado (Coluna N), por data de origem
    lead_time_por_dia: Dict[str, Tuple[float, int]] = {}
    try:
        for r in db.execute(text("""
            SELECT dia_base,
                   AVG((julianday(SUBSTR(data_conclusao, 1, 19)) - julianday(SUBSTR(tempo_coleta, 1, 19))) * 24.0),
                   COUNT(*)
            FROM operacional_pedidos_completo
            WHERE LOWER(TRIM(COALESCE(status_pedido, ''))) = 'circuito fechado'
              AND data_conclusao IS NOT NULL AND TRIM(data_conclusao) != ''
              AND tempo_coleta IS NOT NULL AND TRIM(tempo_coleta) != ''
              AND julianday(SUBSTR(data_conclusao, 1, 19)) >= julianday(SUBSTR(tempo_coleta, 1, 19))
            GROUP BY dia_base;
        """)).fetchall():
            if r[1] is not None:
                lead_time_por_dia[str(r[0])] = (round(float(r[1]), 1), int(r[2] or 0))
    except Exception:
        pass

    aging_por_data = []
    faixas_aging = {
        "ate_2_dias": 0,
        "de_3_a_5_dias": 0,
        "de_6_a_10_dias": 0,
        "mais_10_dias": 0,
    }
    totais_gerais = {
        "total_historico_monitorado": 0,
        "total_circuito_fechado": 0,
        "total_sem_atualizacao": 0,
        "total_backlog_coleta": 0,
        "total_em_transito": 0,
        "total_foi_assinado": 0,
        "total_atualizados_retroativos": sum(atu_por_dia_orig.values()),
    }

    for r in rows_por_dia:
        d_str = str(r[0]).strip()
        tot = int(r[1] or 0)
        cf = int(r[2] or 0)
        tr = int(r[3] or 0)
        fa = int(r[4] or 0)
        bk = int(r[5] or 0)
        sem_atu = tr + fa + bk

        dt_d = _dia_para_date(d_str)
        dias_parado = max(0, (dt_ref - dt_d).days) if dt_d else 0

        totais_gerais["total_historico_monitorado"] += tot
        totais_gerais["total_circuito_fechado"] += cf
        totais_gerais["total_sem_atualizacao"] += sem_atu
        totais_gerais["total_backlog_coleta"] += bk
        totais_gerais["total_em_transito"] += tr
        totais_gerais["total_foi_assinado"] += fa

        if sem_atu > 0:
            if dias_parado <= 2:
                faixas_aging["ate_2_dias"] += sem_atu
            elif dias_parado <= 5:
                faixas_aging["de_3_a_5_dias"] += sem_atu
            elif dias_parado <= 10:
                faixas_aging["de_6_a_10_dias"] += sem_atu
            else:
                faixas_aging["mais_10_dias"] += sem_atu

        aging_por_data.append({
            "dia_base": d_str,
            "dias_sem_atualizacao": dias_parado,
            "rotulo_aging": "Hoje (D0)" if dias_parado == 0 else f"Há {dias_parado} {'dia' if dias_parado == 1 else 'dias'} sem finalizar",
            "total_pedidos": tot,
            "circuito_fechado": cf,
            "taxa_finalizacao_pct": round((cf / max(tot, 1)) * 100, 1),
            "sem_atualizacao_total": sem_atu,
            "backlog_coleta": bk,
            "em_transito": tr,
            "foi_assinado": fa,
            "qtd_atualizados_retroativos": atu_por_dia_orig.get(d_str, 0),
            "ultima_atualizacao_em": ultima_atu_por_dia_orig.get(d_str, ""),
            "horas_medias_coleta_ate_conclusao": lead_time_por_dia.get(d_str, (None, 0))[0],
            "amostras_conclusao": lead_time_por_dia.get(d_str, (None, 0))[1],
        })

    # 3. Top Pontos (MDs / HUBs) com maior volume de pacotes sem atualização (pendentes de Circuito Fechado)
    rows_pts_pendentes = db.execute(text("""
        SELECT 
            UPPER(TRIM(ponto_colecao)) as ponto,
            MAX(cidade) as cidade,
            MAX(estado) as estado,
            MIN(dia_base) as data_mais_antiga,
            MAX(dia_base) as data_mais_recente,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) != 'circuito fechado' OR status_pedido IS NULL THEN total_pedidos ELSE 0 END) as total_pendente,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) IN ('coleta', 'coletado', 'saco selado', 'não coletado', 'nao coletado', 'pendente', 'aguardando') OR status_pedido IS NULL THEN total_pedidos ELSE 0 END) as backlog_coleta,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) IN ('carregamento', 'descarregamento') THEN total_pedidos ELSE 0 END) as em_transito,
            SUM(CASE WHEN LOWER(TRIM(status_pedido)) = 'foi assinado' THEN total_pedidos ELSE 0 END) as foi_assinado
        FROM criacao_pedidos_historico
        WHERE dia_base IS NOT NULL AND LENGTH(TRIM(dia_base)) = 10
          AND ponto_colecao IS NOT NULL
          AND TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')
          AND UPPER(ponto_colecao) NOT LIKE '%SP-R-TFK001%'
          AND UPPER(ponto_colecao) NOT LIKE '%ANJUN%'
        GROUP BY UPPER(TRIM(ponto_colecao))
        HAVING total_pendente > 0
        ORDER BY total_pendente DESC
        LIMIT 80;
    """)).fetchall()

    pontos_sem_atualizacao = []
    for rp in rows_pts_pendentes:
        pt_code = str(rp[0] or "")
        is_md = (pt_code.startswith("MD-") or bool(re.match(r"^[A-Z]{2}-W-MD", pt_code))) and "-H" not in pt_code
        dt_ant = _dia_para_date(str(rp[3] or ""))
        dias_max = max(0, (dt_ref - dt_ant).days) if dt_ant else 0
        pontos_sem_atualizacao.append({
            "ponto_colecao": pt_code,
            "modalidade_ponto": "DROPOFF (MD)" if is_md else "PICKUP (HUB)",
            "cidade": rp[1] or "São Paulo",
            "estado": rp[2] or (pt_code[:2] if len(pt_code) >= 2 and pt_code[:2].isalpha() else "SP"),
            "data_mais_antiga": rp[3] or "",
            "data_mais_recente": rp[4] or "",
            "dias_sem_atualizacao_max": dias_max,
            "total_sem_atualizacao": int(rp[5] or 0),
            "backlog_coleta": int(rp[6] or 0),
            "em_transito": int(rp[7] or 0),
            "foi_assinado": int(rp[8] or 0),
        })

    # 4. Amostra de pacotes individuais sem atualização (de operacional_pedidos_completo)
    pacotes_pendentes_amostra = []
    try:
        rows_pkg = db.execute(text("""
            SELECT 
                codigo_barras,
                dia_base,
                UPPER(TRIM(ponto_colecao)) as ponto,
                COALESCE(merchant_nome, remetente_nome, 'Seller N/D') as seller,
                numero_cliente,
                remetente_cidade,
                remetente_uf,
                status_pedido,
                tempo_coleta,
                numero_saca
            FROM operacional_pedidos_completo
            WHERE LOWER(TRIM(COALESCE(status_pedido, ''))) != 'circuito fechado'
              AND ponto_colecao IS NOT NULL
              AND TRIM(ponto_colecao) NOT IN ('', 'nan', 'None', 'null', '-')
              AND UPPER(ponto_colecao) NOT LIKE '%SP-R-TFK001%'
              AND UPPER(ponto_colecao) NOT LIKE '%ANJUN%'
            ORDER BY SUBSTR(dia_base, 7, 4) || '-' || SUBSTR(dia_base, 4, 2) || '-' || SUBSTR(dia_base, 1, 2) ASC, id DESC
            LIMIT 200;
        """)).fetchall()

        for rk in rows_pkg:
            d_b = str(rk[1] or "")
            dt_b = _dia_para_date(d_b)
            dias_p = max(0, (dt_ref - dt_b).days) if dt_b else 0
            pt_c = str(rk[2] or "")
            is_md = (pt_c.startswith("MD-") or bool(re.match(r"^[A-Z]{2}-W-MD", pt_c))) and "-H" not in pt_c
            pacotes_pendentes_amostra.append({
                "codigo_barras": rk[0],
                "dia_origem": d_b,
                "dias_sem_atualizacao": dias_p,
                "rotulo_aging": "Hoje (D0)" if dias_p == 0 else f"Há {dias_p} {'dia' if dias_p == 1 else 'dias'} sem atualização",
                "ponto_colecao": pt_c,
                "modalidade_ponto": "DROPOFF (MD)" if is_md else "PICKUP (HUB)",
                "seller": rk[3] or "N/D",
                "numero_cliente": rk[4] or "",
                "cidade": rk[5] or "São Paulo",
                "estado": rk[6] or "SP",
                "status_atual": rk[7] or "coletado",
                "tempo_coleta": rk[8] or d_b,
                "numero_saca": rk[9] or "-",
            })
    except Exception:
        pass

    # 5. Histórico de pacotes que FORAM atualizados (log_mudancas_status_pacotes) e histórico de uploads reconciliados
    historico_pacotes_atualizados = []
    try:
        rows_log_m = db.execute(text("""
            SELECT 
                id, codigo_barras, dia_origem, dia_atualizacao, ponto_colecao,
                nome_cliente, merchant_nome, estado, cidade,
                status_anterior, status_novo, registrado_em, COALESCE(data_conclusao, '')
            FROM log_mudancas_status_pacotes
            ORDER BY id DESC
            LIMIT 200;
        """)).fetchall()
        for rm in rows_log_m:
            historico_pacotes_atualizados.append({
                "id": rm[0],
                "codigo_barras": rm[1],
                "dia_origem": rm[2],
                "dia_atualizacao": rm[3],
                "ponto_colecao": rm[4],
                "nome_cliente": rm[5],
                "merchant_nome": rm[6],
                "estado": rm[7],
                "cidade": rm[8],
                "status_anterior": rm[9],
                "status_novo": rm[10],
                "registrado_em": rm[11],
                "data_conclusao": rm[12],
            })
    except Exception:
        pass

    historico_uploads_reconciliacao = []
    try:
        rows_up = db.execute(text("""
            SELECT 
                id, dia_planilha, data_hora_upload, total_pacotes_lidos,
                pacotes_novos, pacotes_atualizados_status, pacotes_retroativos_outros_dias,
                dias_afetados, resumo_transicoes
            FROM log_reconciliacao_planilhas
            ORDER BY id DESC
            LIMIT 50;
        """)).fetchall()
        for ru in rows_up:
            try:
                tr_dict = json.loads(ru[8] or "{}")
            except Exception:
                tr_dict = {}
            historico_uploads_reconciliacao.append({
                "id": ru[0],
                "dia_planilha": ru[1],
                "data_hora_upload": ru[2],
                "total_pacotes_lidos": ru[3],
                "pacotes_novos": ru[4],
                "pacotes_atualizados_status": ru[5],
                "pacotes_retroativos_outros_dias": ru[6],
                "dias_afetados": ru[7],
                "transicoes": tr_dict,
            })
    except Exception:
        pass

    return {
        "dia_referencia": dia_ref_str,
        "totais_gerais": totais_gerais,
        "faixas_aging": faixas_aging,
        "aging_por_data": aging_por_data,
        "pontos_sem_atualizacao": pontos_sem_atualizacao,
        "pacotes_pendentes_amostra": pacotes_pendentes_amostra,
        "historico_pacotes_atualizados": historico_pacotes_atualizados,
        "historico_uploads_reconciliacao": historico_uploads_reconciliacao,
    }
