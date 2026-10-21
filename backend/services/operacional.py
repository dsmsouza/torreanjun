import os
import re
import io
import json
import math
import datetime
import unicodedata
import pandas as pd
import requests
from python_calamine import CalamineWorkbook
from sqlalchemy import text
from sqlalchemy.orm import Session
from models.models import (
    HistoricoTorre, DetalheMDHistorico, DetalheClienteHistorico, 
    DetalheLacresHistorico, JustificativasDiarias, MDObservacoesFixas, 
    AvaliacaoMD, DetalhePickupHistorico, CriacaoPedidosHistorico, CriacaoResumoCep,
    PropostaExpansao
)


def remover_acentos_espacos(txt: str) -> str:
    if not txt:
        return ""
    nfkd_form = unicodedata.normalize('NFKD', str(txt))
    txt_clean = "".join([c for c in nfkd_form if not unicodedata.combining(c)])
    return re.sub(r'[^a-zA-Z0-9]', '', txt_clean).lower()

def padronizar_uf(uf) -> str:
    if pd.isna(uf): return ""
    uf_str = str(uf).strip().upper()
    
    # Remove accents for reliable matching
    nfkd = unicodedata.normalize('NFKD', uf_str)
    uf_str = "".join([c for c in nfkd if not unicodedata.combining(c)])
    
    if len(uf_str) == 2: return uf_str
    mapa = {
        'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAPA': 'AP', 'AMAZONAS': 'AM', 'BAHIA': 'BA',
        'CEARA': 'CE', 'DISTRITO FEDERAL': 'DF', 'ESPIRITO SANTO': 'ES', 'GOIAS': 'GO',
        'MARANHAO': 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', 'MINAS GERAIS': 'MG',
        'PARA': 'PA', 'PARAIBA': 'PB', 'PARANA': 'PR', 'PERNAMBUCO': 'PE', 'PIAUI': 'PI',
        'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS',
        'RONDONIA': 'RO', 'RORAIMA': 'RR', 'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP',
        'SERGIPE': 'SE', 'TOCANTINS': 'TO'
    }
    return mapa.get(uf_str, uf_str)

MAPA_CLIENTES_PADRAO = {
    '24005': 'Shein',
    '24147': 'Shein D2D',
    '24343': 'temuxborder',
    '24218': 'temuw2d',
    '24189': 'temud2d',
    '24009': 'Kwai',
    '24324': 'tiktok',
    '24020': 'szanjun(internacional)',
    '24245': 'C&A',
    '24246': 'C&A',
    '24247': 'C&A',
    '24248': 'C&A',
    '24249': 'C&A',
    '24250': 'C&A',
    '24251': 'C&A',
    '24252': 'C&A',
    '24253': 'C&A',
    '24254': 'C&A',
    '24255': 'C&A',
    '24256': 'C&A',
    '24257': 'C&A',
    '24258': 'C&A',
    '24259': 'C&A',
    '24260': 'C&A',
    '24261': 'C&A',
    '24262': 'C&A',
    '24263': 'C&A',
    '24264': 'C&A',
    '24265': 'C&A',
    '24266': 'C&A',
    '24267': 'C&A',
    '24268': 'C&A',
    '24269': 'C&A',
    '24270': 'C&A',
    '24271': 'C&A',
    '24272': 'C&A',
    '24273': 'C&A',
}

# Cache em memória para não bater no banco a cada linha de planilha
_mapa_clientes_cache: dict | None = None
_mapa_mds_cache: dict | None = None

def carregar_mapa_clientes(db: Session) -> dict:
    """Carrega mapeamento do banco. Se vazio, usa o padrão hardcoded."""
    global _mapa_clientes_cache
    try:
        rows = db.execute(text("SELECT cliente_id, nome_exibicao FROM cliente_mapping WHERE ativo = 1")).fetchall()
        if rows:
            _mapa_clientes_cache = {r[0]: r[1] for r in rows}
            return _mapa_clientes_cache
    except Exception:
        pass
    _mapa_clientes_cache = MAPA_CLIENTES_PADRAO.copy()
    return _mapa_clientes_cache

def carregar_mapa_mds(db: Session) -> dict:
    """Carrega mapeamento de MDs do banco."""
    global _mapa_mds_cache
    try:
        rows = db.execute(text("SELECT md_codigo, estado, regional FROM md_mapping WHERE ativo = 1")).fetchall()
        _mapa_mds_cache = {r[0]: {"estado": r[1], "regional": r[2]} for r in rows}
        return _mapa_mds_cache
    except Exception:
        return {}

def classificar_cliente(valor, mapa: dict | None = None) -> str:
    if pd.isna(valor):
        return 'Não Informado'
    val_str = str(valor).split('.')[0].strip()
    m = mapa if mapa is not None else MAPA_CLIENTES_PADRAO
    if val_str in m:
        return m[val_str]
    return f"Cliente {val_str}" if val_str else 'Outros'

def normalizar_df_mds(df_ref: pd.DataFrame) -> pd.DataFrame:
    col_map = {}
    for col in df_ref.columns:
        c = remover_acentos_espacos(str(col))
        if ('iata' in c or 'md' in c or 'pontodecolecao' in c or c == 'ponto') and 'md' not in col_map.values():
            col_map[col] = 'md'
        elif ('regional' in c or 'distrito' in c) and 'regional' not in col_map.values():
            col_map[col] = 'regional'
        elif ('estado' in c or c == 'uf') and 'estado' not in col_map.values():
            col_map[col] = 'estado'
        elif ('cidade' in c or 'municipio' in c) and 'cidade' not in col_map.values():
            col_map[col] = 'cidade'
        elif ('divisao' in c) and 'divisao' not in col_map.values():
            col_map[col] = 'divisao'
            
    df_clean = pd.DataFrame()
    for orig_col, target in col_map.items():
        df_clean[target] = df_ref[orig_col]
        
    for req in ['md', 'regional', 'estado', 'cidade', 'divisao']:
        if req not in df_clean.columns:
            df_clean[req] = ''
            
    df_clean['md'] = df_clean['md'].astype(str).str.strip().str.upper()
    df_clean['estado'] = df_clean['estado'].apply(padronizar_uf)
    df_clean['cidade'] = df_clean['cidade'].fillna('NÃO INFORMADA').astype(str).str.strip().str.upper()
    df_clean['divisao'] = df_clean['divisao'].fillna('Sem Divisão').astype(str).str.strip()
    
    def infer_regional(row):
        reg = str(row['regional']).strip().upper()
        if reg and reg != 'NAN' and reg != '':
            return reg
        uf = str(row['estado']).strip().upper()
        if uf == 'SP': return 'SP'
        elif uf in ['RJ', 'ES']: return 'RJ/ES'
        elif uf in ['MG']: return 'MINAS GERAIS'
        elif uf in ['PR', 'SC', 'RS']: return 'SUL'
        elif uf in ['BA', 'PE', 'CE', 'RN', 'PB', 'AL', 'SE', 'MA', 'PI']: return 'NORDESTE'
        elif uf: return uf
        return 'OUTRAS'
        
    df_clean['regional'] = df_clean.apply(infer_regional, axis=1)
    
    div_str = df_clean['divisao'].astype(str).str.strip().str.lower()
    is_jau = div_str.isin(['sp jau', 'sp birigui', 'jaú', 'jau', 'birigui'])
    is_franca = div_str.isin(['sp franca', 'franca'])
    df_clean.loc[is_jau, 'regional'] = 'SP JAU'
    df_clean.loc[is_franca, 'regional'] = 'SP FRANCA'
    
    return df_clean[df_clean['md'] != ''].drop_duplicates(subset=['md'])

def mapear_colunas(df: pd.DataFrame) -> pd.DataFrame:
    col_map = {}
    
    # Priority pass for exact unambiguous terms
    for col in df.columns:
        c = remover_acentos_espacos(str(col))
        
        # Barcode
        if ('codigodebarras' in c or 'barcode' in c) and 'barcode' not in col_map.values():
            col_map[col] = 'barcode'
        # Cliente ID
        elif ('nodocliente' in c or 'numcliente' in c or 'idcliente' in c) and 'id_cliente' not in col_map.values():
            col_map[col] = 'id_cliente'
        # Saca
        elif ('numerodasaca' in c or 'saca' in c or 'lacre' in c) and 'saca' not in col_map.values():
            col_map[col] = 'saca'
        # Maneira de Coleta
        elif ('maneiradecoleta' in c or 'tipocoleta' in c or 'modalidade' in c) and 'maneira_coleta' not in col_map.values():
            col_map[col] = 'maneira_coleta'
        # Tempo Criacao Pedido (exato)
        elif ('tempodecriacaodopedido' in c or 'datacriacao' in c or (c == 'tempodecriacao')) and 'tempo_criacao' not in col_map.values():
            col_map[col] = 'tempo_criacao'
        # Tempo Previsto
        elif ('tempoprevisto' in c or 'dataprevista' in c) and 'tempo_previsto' not in col_map.values():
            col_map[col] = 'tempo_previsto'
        # Tempo Real / Coleta
        elif ('temporeal' in c or 'tempocoleta' in c or 'datacoleta' in c) and 'tempo_coleta' not in col_map.values():
            col_map[col] = 'tempo_coleta'
        # Status
        elif ('statusdopedido' in c or c == 'status') and 'status' not in col_map.values():
            col_map[col] = 'status'
        # Ponto de Colecao (MD) - Exclude 'real' or 'entrega'
        elif ('pontodecolecao' in c or c == 'md' or c == 'minidrop' or c == 'iata') and 'real' not in c and 'md' not in col_map.values():
            col_map[col] = 'md'
        # Merchant ID
        elif ('numerodoclientecomerciante' in c or 'idmerchant' in c or 'codigoseller' in c) and 'merchant_id' not in col_map.values():
            col_map[col] = 'merchant_id'
        # Merchant Nome
        elif ('nomedoclientemerchant' in c or 'merchantnome' in c or 'nomeseller' in c) and 'merchant_nome' not in col_map.values():
            col_map[col] = 'merchant_nome'
        # CEP Remetente (Origin)
        elif ('cep' in c and ('remetente' in c or 'origem' in c or 'envio' in c)) and 'destinatario' not in c and 'recebimento' not in c and 'cep_remetente' not in col_map.values():
            col_map[col] = 'cep_remetente'
        # Estado Remetente / Origem
        elif ('estado' in c and ('origem' in c or 'remetente' in c or 'envio' in c)) and 'recebimento' not in c and 'destinatario' not in c and 'estado' not in col_map.values():
            col_map[col] = 'estado'
        # Cidade Remetente / Origem
        elif ('cidade' in c and ('origem' in c or 'remetente' in c or 'envio' in c)) and 'recebimento' not in c and 'destinatario' not in c and 'cidade' not in col_map.values():
            col_map[col] = 'cidade'
        # Bairro / Area do Envio
        elif ('areadoenvio' in c or 'bairro' in c) and 'recebimento' not in c and 'bairro' not in col_map.values():
            col_map[col] = 'bairro'
        # Endereco do Envio
        elif ('enderecodoenvio' in c or (c == 'endereco' and 'recebimento' not in c)) and 'recebimento' not in c and 'endereco' not in col_map.values():
            col_map[col] = 'endereco'
        # Tipo Pedido
        elif ('tipodopedido' in c or 'tipopedido' in c) and 'tipo_pedido' not in col_map.values():
            col_map[col] = 'tipo_pedido'

    # Fallback pass for single word headers
    for col in df.columns:
        c = remover_acentos_espacos(str(col))
        if c in ['cep'] and 'cep_remetente' not in col_map.values():
            col_map[col] = 'cep_remetente'
        elif c in ['estado', 'uf'] and 'estado' not in col_map.values():
            col_map[col] = 'estado'
        elif c in ['cidade', 'municipio'] and 'cidade' not in col_map.values():
            col_map[col] = 'cidade'

    # Build deduplicated DataFrame
    df_mapped = pd.DataFrame()
    for orig_col, target_name in col_map.items():
        df_mapped[target_name] = df[orig_col]

    target_cols = [
        'barcode', 'id_cliente', 'saca', 'maneira_coleta', 'tempo_criacao',
        'tempo_previsto', 'tempo_coleta', 'status', 'md', 'merchant_id',
        'merchant_nome', 'cep_remetente', 'estado', 'cidade', 'bairro',
        'endereco', 'tipo_pedido'
    ]
    for target in target_cols:
        if target not in df_mapped.columns:
            df_mapped[target] = None

    return df_mapped[target_cols]

def classificar_sla(hora_str: str) -> str:
    try:
        hora_limpa = str(hora_str).strip()
        if ":" in hora_limpa:
            partes = hora_limpa.split(":")
            h, m = int(partes[0]), int(partes[1])
        else:
            h, m = int(hora_limpa), 0
        
        # Check SLA range: 08:00 (8.0) to 18:00 (18.0)
        valor_hora = h + m / 60.0
        if 8.0 <= valor_hora <= 18.0:
            return "🟢 No Horário"
        else:
            return "🔴 Crítico (Fora do SLA)"
    except:
        return "⚠️ Hora Inválida"

def obter_data_semana_atual():
    """Retorna (data_hoje_formatted, semana_hoje_formatted)"""
    import datetime
    today = datetime.date.today()
    dia_str = today.strftime("%d/%m/%Y")
    semana_num = today.isocalendar()[1]
    semana_str = f"SEMANA {semana_num}"
    return dia_str, semana_str


def buscar_datas_e_semanas(db: Session):
    try:
        query_dias = text("""
            SELECT dia_base FROM detalhe_md_historico WHERE dia_base IS NOT NULL AND dia_base != ''
            UNION
            SELECT dia_base FROM detalhe_pickup_historico WHERE dia_base IS NOT NULL AND dia_base != ''
            UNION
            SELECT dia_base FROM criacao_pedidos_historico WHERE dia_base IS NOT NULL AND dia_base != ''
            UNION
            SELECT dia_base FROM historico_torre WHERE dia_base IS NOT NULL AND dia_base != '';
        """)
        dias_raw = db.execute(query_dias).fetchall()
        
        query_semanas = text("""
            SELECT semana_base FROM detalhe_md_historico WHERE semana_base IS NOT NULL AND semana_base != ''
            UNION
            SELECT semana_base FROM detalhe_pickup_historico WHERE semana_base IS NOT NULL AND semana_base != ''
            UNION
            SELECT semana_base FROM criacao_pedidos_historico WHERE semana_base IS NOT NULL AND semana_base != ''
            UNION
            SELECT semana_base FROM historico_torre WHERE semana_base IS NOT NULL AND semana_base != '';
        """)
        semanas_raw = db.execute(query_semanas).fetchall()
        
        dias = list(set(row[0] for row in dias_raw if row[0]))
        semanas = list(set(row[0] for row in semanas_raw if row[0]))
        
        def parse_date(d_str):
            try:
                return datetime.datetime.strptime(d_str, "%d/%m/%Y")
            except:
                return datetime.datetime.min
                
        dias.sort(key=parse_date, reverse=True)
        semanas.sort(reverse=True)
        return dias, semanas
    except Exception as e:
        print(f"Error fetching dates/weeks: {e}")
        return [], []

def obter_dias_periodo(db: Session, periodo_tipo: str, rotulo: str, dt_inicio: str = None, dt_fim: str = None) -> list:
    """Helper to convert any vision type/label to a list of dia_base strings."""
    if not rotulo or rotulo in ["latest", "Carregando...", "TODOS", "todos"]:
        # Resolve 'latest' dynamically from the database
        try:
            row = db.execute(text("SELECT MAX(dia_base) FROM detalhe_md_historico WHERE dia_base IS NOT NULL AND dia_base != ''")).fetchone()
            if not row or not row[0]:
                row = db.execute(text("SELECT MAX(dia_base) FROM criacao_pedidos_historico WHERE dia_base IS NOT NULL AND dia_base != ''")).fetchone()
            if not row or not row[0]:
                row = db.execute(text("SELECT MAX(dia_base) FROM historico_torre WHERE dia_base IS NOT NULL AND dia_base != ''")).fetchone()
            if row and row[0]:
                rotulo = str(row[0])
            else:
                return []
        except Exception as e:
            print(f"Erro em obter_dias_periodo (latest): {e}")
            return []

    if periodo_tipo == "Diário":
        return [rotulo]
    elif periodo_tipo == "Semanal":
        # Get all days matching this week
        rows = db.execute(
            text("SELECT DISTINCT dia_base FROM detalhe_md_historico WHERE semana_base = :ref"), 
            {"ref": rotulo}
        ).fetchall()
        days = [row[0] for row in rows if row[0]]
        if not days:
            # Fallback check on criacao_resumo_cep
            rows_cr = db.execute(
                text("SELECT DISTINCT dia_base FROM criacao_resumo_cep WHERE semana_base = :ref"),
                {"ref": rotulo}
            ).fetchall()
            days = [row[0] for row in rows_cr if row[0]]
        return days
    elif periodo_tipo == "Mensal":
        # rotulo format: "YYYY-MM" (e.g. "2026-06")
        if "-" in rotulo:
            partes = rotulo.split("-")
            mes_ano_ref = f"/{partes[1]}/{partes[0]}"
        else:
            mes_ano_ref = rotulo
            
        rows = db.execute(
            text("SELECT DISTINCT dia_base FROM historico_torre WHERE dia_base LIKE :ref"), 
            {"ref": f"%{mes_ano_ref}"}
        ).fetchall()
        return [row[0] for row in rows if row[0]]
    elif periodo_tipo == "Período":
        if dt_inicio and dt_fim:
            try:
                start = datetime.datetime.strptime(dt_inicio, "%Y-%m-%d")
                end = datetime.datetime.strptime(dt_fim, "%Y-%m-%d")
                delta = end - start
                return [(start + datetime.timedelta(days=i)).strftime('%d/%m/%Y') for i in range(delta.days + 1)]
            except Exception as e:
                print(f"Error parsing period dates: {e}")
                return []
    return []

def obter_mds_excluidos_regra5k(db: Session, dias: list) -> list:
    if not dias:
        return []
    
    placeholders = ", ".join([f":d{i}" for i in range(len(dias))])
    params = {f"d{i}": d for i, d in enumerate(dias)}
    
    query = f"""
        SELECT h.md, h.total, h.cidade, mc.cidade
        FROM detalhe_md_historico h
        LEFT JOIN malha_coordenadas mc ON h.md = mc.md_codigo
        WHERE h.dia_base IN ({placeholders});
    """
    rows = db.execute(text(query), params).fetchall()
    
    city_volumes = {}
    city_mds = {}
    
    for r in rows:
        md, total, h_city, mc_city = r
        total = total or 0
        city = h_city if h_city is not None else (mc_city if mc_city is not None else "OUTRAS")
        clean_city = remover_acentos_espacos(city).upper()
        
        city_volumes[clean_city] = city_volumes.get(clean_city, 0) + total
        if clean_city not in city_mds:
            city_mds[clean_city] = []
        city_mds[clean_city].append(md)
        
    excluded_mds = []
    for city, vol in city_volumes.items():
        if vol < 5000:
            excluded_mds.extend(city_mds[city])
            
    return excluded_mds

def carregar_resumo_geral(db: Session, periodo_tipo: str, rotulo: str, dt_inicio: str = None, dt_fim: str = None, regional: str = None, regra5k: bool = False, modalidade: str = "TODOS"):
    dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
    if not dias:
        return {
            "volume_total": 0, "volume_backlog": 0, "taxa_coleta": 0.0, "taxa_backlog": 0.0, "erros_lacre": 0, "regionais": []
        }
    
    dias_placeholders = ", ".join([f":d{i}" for i in range(len(dias))])
    params = {f"d{i}": d for i, d in enumerate(dias)}
    modalidade_upper = (modalidade or "TODOS").strip().upper()
    
    # 1. Dropoff data
    reg_cond_md = ""
    if regional:
        reg_cond_md = "AND detalhe_md_historico.regional = :regional"
        params["regional"] = regional
        
    filter_cond = ""
    if regra5k:
        excluded_mds = obter_mds_excluidos_regra5k(db, dias)
        if excluded_mds:
            ex_placeholders = ", ".join([f":ex{i}" for i in range(len(excluded_mds))])
            for i, md in enumerate(excluded_mds):
                params[f"ex{i}"] = md
            filter_cond = f"AND detalhe_md_historico.md NOT IN ({ex_placeholders})"

    dropoff_map = {}
    if modalidade_upper in ["TODOS", "DROPOFF"]:
        query_dropoff = f"""
            SELECT regional, SUM(total) as vol_tot, SUM(backlog) as vol_back
            FROM detalhe_md_historico 
            WHERE dia_base IN ({dias_placeholders}) {reg_cond_md} {filter_cond}
            GROUP BY regional;
        """
        rows_dropoff = db.execute(text(query_dropoff), params).fetchall()
        for r in rows_dropoff:
            if r[0]:
                dropoff_map[r[0]] = {"total": r[1] or 0, "backlog": r[2] or 0}

    # 2. Pickup data
    pickup_map = {}
    if modalidade_upper in ["TODOS", "PICKUP"]:
        reg_cond_pickup = ""
        if regional:
            reg_cond_pickup = "AND regional = :regional"
            
        query_pickup = f"""
            SELECT regional, SUM(total_pacotes) as vol_tot, SUM(total_backlog) as vol_back
            FROM detalhe_pickup_historico
            WHERE dia_base IN ({dias_placeholders}) {reg_cond_pickup}
            GROUP BY regional;
        """
        rows_pickup = db.execute(text(query_pickup), params).fetchall()
        for r in rows_pickup:
            if r[0]:
                pickup_map[r[0]] = {"total": r[1] or 0, "backlog": r[2] or 0}

    # 3. Seal errors (erros_lacre) from detalhe_lacres_historico (Dropoff only)
    lacres_map = {}
    if modalidade_upper in ["TODOS", "DROPOFF"]:
        query_lacres = f"""
            SELECT regional, COUNT(DISTINCT saca) as total_erros
            FROM detalhe_lacres_historico
            WHERE dia_base IN ({dias_placeholders})
        """
        lacres_params = {f"d{i}": d for i, d in enumerate(dias)}
        reg_lacres_cond = ""
        if regional:
            reg_lacres_cond = "AND regional = :regional"
            lacres_params["regional"] = regional
        query_lacres += f" {reg_lacres_cond} GROUP BY regional;"
        
        lacres_rows = db.execute(text(query_lacres), lacres_params).fetchall()
        lacres_map = {row[0]: row[1] for row in lacres_rows if row[0]}
    
    tot_erros_lacre = sum(lacres_map.values())
    
    # Merge regionals based on modality
    all_regionals = set(dropoff_map.keys()).union(set(pickup_map.keys()))
    regionais_data = []
    tot_volume = 0
    tot_backlog = 0
    
    for reg in sorted(all_regionals):
        d_info = dropoff_map.get(reg, {"total": 0, "backlog": 0})
        p_info = pickup_map.get(reg, {"total": 0, "backlog": 0})
        
        if modalidade_upper == "DROPOFF":
            v_tot = d_info["total"]
            v_back = d_info["backlog"]
        elif modalidade_upper == "PICKUP":
            v_tot = p_info["total"]
            v_back = p_info["backlog"]
        else: # TODOS
            v_tot = d_info["total"] + p_info["total"]
            v_back = d_info["backlog"] + p_info["backlog"]
            
        if v_tot == 0 and v_back == 0:
            continue
            
        e_lac = lacres_map.get(reg, 0)
        t_col = ((v_tot - v_back) / v_tot * 100) if v_tot > 0 else 100.0
        
        regionais_data.append({
            "regional": reg,
            "total": v_tot,
            "backlog": v_back,
            "taxa_coleta": round(t_col, 2),
            "erros_lacre": e_lac
        })
        
        tot_volume += v_tot
        tot_backlog += v_back

    # Global Rates
    t_coleta_global = ((tot_volume - tot_backlog) / tot_volume * 100) if tot_volume > 0 else 100.0
    t_backlog_global = (tot_backlog / tot_volume * 100) if tot_volume > 0 else 0.0
    
    return {
        "volume_total": tot_volume,
        "volume_backlog": tot_backlog,
        "taxa_coleta": round(t_coleta_global, 2),
        "taxa_backlog": round(t_backlog_global, 2),
        "erros_lacre": tot_erros_lacre,
        "regionais": regionais_data
    }

def carregar_ranking_mds(db: Session, periodo_tipo: str, rotulo: str, dt_inicio: str = None, dt_fim: str = None, regional: str = None, regra5k: bool = False):
    dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
    if not dias:
        return []
    
    dias_placeholders = ", ".join([f":d{i}" for i in range(len(dias))])
    params = {f"d{i}": d for i, d in enumerate(dias)}
    
    reg_cond = ""
    if regional:
        reg_cond = "AND h.regional = :regional"
        params["regional"] = regional
        
    filter_cond = ""
    if regra5k:
        excluded_mds = obter_mds_excluidos_regra5k(db, dias)
        if excluded_mds:
            ex_placeholders = ", ".join([f":ex{i}" for i in range(len(excluded_mds))])
            for i, md in enumerate(excluded_mds):
                params[f"ex{i}"] = md
            filter_cond = f"AND h.md NOT IN ({ex_placeholders})"

    query_str = f"""
    SELECT h.md, h.regional, COALESCE(NULLIF(mc.cidade, ''), NULLIF(h.cidade, 'NÃO CADASTRADA'), 'NÃO CADASTRADA') as cidade, h.divisao,
    SUM(h.total) as total, SUM(h.backlog) as backlog,
    SUM(h.carregamento) as carregamento, SUM(h.descarregamento) as descarregamento,
    SUM(h.erros_md) as erros_md
    FROM detalhe_md_historico h
    LEFT JOIN malha_coordenadas mc ON h.md = mc.md_codigo
    WHERE h.dia_base IN ({dias_placeholders}) {reg_cond} {filter_cond}
    GROUP BY h.md, h.regional, COALESCE(NULLIF(mc.cidade, ''), NULLIF(h.cidade, 'NÃO CADASTRADA'), 'NÃO CADASTRADA'), h.divisao
    ORDER BY total DESC;
    """
    
    rows = db.execute(text(query_str), params).fetchall()
    
    # Query fixed observations and health status decisions
    obs_rows = db.execute(text("SELECT md, observacao FROM md_observacoes_fixas;")).fetchall()
    obs_map = {row[0].strip().upper(): row[1] for row in obs_rows if row[0]}
    
    eval_rows = db.execute(text("""
        SELECT e.md, e.decisao 
        FROM avaliacao_md e
        INNER JOIN (
            SELECT md, MAX(id) as max_id 
            FROM avaliacao_md 
            GROUP BY md
        ) latest ON e.id = latest.max_id;
    """)).fetchall()
    eval_map = {row[0].strip().upper(): row[1] for row in eval_rows if row[0]}
    
    # Query latest status_coleta from auditoria_coleta for the requested days
    status_rows = db.execute(text(f"""
        SELECT md, status_coleta 
        FROM auditoria_coleta 
        WHERE dia_base IN ({dias_placeholders})
        ORDER BY rowid ASC
    """), params).fetchall()
    status_map = {row[0].strip().upper(): row[1] for row in status_rows if row[0]}
    
    ranking = []
    for row in rows:
        md_name = row[0]
        reg = row[1]
        cidade = row[2] or "N/A"
        divisao = row[3] or "Sem Divisão"
        tot = row[4] or 0
        back = row[5] or 0
        carr = row[6] or 0
        desc = row[7] or 0
        err = row[8] or 0
        
        t_col = ((tot - back) / tot * 100) if tot > 0 else 100.0
        
        md_key = md_name.strip().upper()
        
        ranking.append({
            "md": md_name,
            "regional": reg,
            "cidade": cidade,
            "divisao": divisao,
            "total": tot,
            "backlog": back,
            "carregamento": carr,
            "descarregamento": desc,
            "erros_md": err,
            "taxa_coleta": round(t_col, 2),
            "status_saude": eval_map.get(md_key, "Aprovado"),
            "observacao_fixa": obs_map.get(md_key, ""),
            "status_coleta": status_map.get(md_key, "N/A (Sem Carga)")
        })
        
    return ranking

def carregar_ranking_clientes(db: Session, periodo_tipo: str, rotulo: str, dt_inicio: str = None, dt_fim: str = None, regional: str = None, modalidade: str = "TODOS"):
    dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
    if not dias:
        return []
        
    dias_placeholders = ", ".join([f":d{i}" for i in range(len(dias))])
    params = {f"d{i}": d for i, d in enumerate(dias)}
    modalidade_upper = (modalidade or "TODOS").strip().upper()
    
    client_totals = {}
    
    # 1. Dropoff clients
    if modalidade_upper in ["TODOS", "DROPOFF"]:
        reg_cond = ""
        if regional:
            reg_cond = "AND regional = :regional"
            params["regional"] = regional
            
        query_md = f"""
            SELECT nome_cliente, SUM(total_pacotes) as total_pacotes, SUM(total_backlog) as total_backlog
            FROM detalhe_cliente_md_historico
            WHERE dia_base IN ({dias_placeholders}) {reg_cond}
            GROUP BY nome_cliente;
        """
        rows_md = db.execute(text(query_md), params).fetchall()
        for r in rows_md:
            c_name = r[0] or "OUTROS"
            if c_name not in client_totals:
                client_totals[c_name] = {"total": 0, "backlog": 0}
            client_totals[c_name]["total"] += (r[1] or 0)
            client_totals[c_name]["backlog"] += (r[2] or 0)

    # 2. Pickup clients
    if modalidade_upper in ["TODOS", "PICKUP"]:
        reg_cond_pk = ""
        if regional:
            reg_cond_pk = "AND regional = :regional"
            params["regional"] = regional
            
        query_pk = f"""
            SELECT nome_cliente, SUM(total_pacotes) as total_pacotes, SUM(total_backlog) as total_backlog
            FROM detalhe_pickup_historico
            WHERE dia_base IN ({dias_placeholders}) {reg_cond_pk}
            GROUP BY nome_cliente;
        """
        rows_pk = db.execute(text(query_pk), params).fetchall()
        for r in rows_pk:
            c_name = r[0] or "OUTROS"
            if c_name not in client_totals:
                client_totals[c_name] = {"total": 0, "backlog": 0}
            client_totals[c_name]["total"] += (r[1] or 0)
            client_totals[c_name]["backlog"] += (r[2] or 0)
            
    ranking = []
    for c_name, data in client_totals.items():
        tot = data["total"]
        back = data["backlog"]
        t_col = ((tot - back) / tot * 100) if tot > 0 else 100.0
        ranking.append({
            "nome_cliente": c_name,
            "total_pacotes": tot,
            "total_backlog": back,
            "taxa_coleta": round(t_col, 2)
        })
        
    ranking.sort(key=lambda x: x["total_pacotes"], reverse=True)
    return ranking

def _build_cliente_filter(cliente: str, params: dict) -> str:
    if not cliente or cliente.upper() in ["TODOS", "ALL"]:
        return ""
    c_low = cliente.strip().lower()
    if "shein" in c_low:
        return "AND LOWER(nome_cliente) IN ('shein', 'shein d2d')"
    elif "temu" in c_low:
        return "AND LOWER(nome_cliente) IN ('temuxborder', 'temuw2d', 'temud2d', 'temu d2d', 'temu')"
    elif "tiktok" in c_low:
        return "AND LOWER(nome_cliente) LIKE '%tiktok%'"
    elif "kwai" in c_low:
        return "AND LOWER(nome_cliente) LIKE '%kwai%'"
    else:
        params["cliente_val"] = f"%{c_low}%"
        return "AND LOWER(nome_cliente) LIKE :cliente_val"


def carregar_detalhe_cliente_regionais(db: Session, cliente: str, periodo_tipo: str, rotulo: str, dt_inicio: str = None, dt_fim: str = None, regional: str = None, modalidade: str = "TODOS"):
    dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
    if not dias:
        return []
        
    dias_placeholders = ", ".join([f":d{i}" for i in range(len(dias))])
    params = {f"d{i}": d for i, d in enumerate(dias)}
    modalidade_upper = (modalidade or "TODOS").strip().upper()
    
    cliente_cond = _build_cliente_filter(cliente, params)
        
    regional_cond = ""
    if regional and regional != "TODAS":
        regional_cond = "AND regional = :regional"
        params["regional"] = regional
        
    reg_totals = {}
    
    if modalidade_upper in ["TODOS", "DROPOFF"]:
        query_str = f"""
            SELECT regional, SUM(total_pacotes) as total_pacotes, SUM(total_backlog) as total_backlog
            FROM detalhe_cliente_md_historico
            WHERE dia_base IN ({dias_placeholders}) {cliente_cond} {regional_cond}
            GROUP BY regional;
        """
        rows = db.execute(text(query_str), params).fetchall()
        for r in rows:
            reg = r[0]
            if not reg: continue
            if reg not in reg_totals: reg_totals[reg] = {"total": 0, "backlog": 0}
            reg_totals[reg]["total"] += (r[1] or 0)
            reg_totals[reg]["backlog"] += (r[2] or 0)
            
    if modalidade_upper in ["TODOS", "PICKUP"]:
        query_pk = f"""
            SELECT regional, SUM(total_pacotes) as total_pacotes, SUM(total_backlog) as total_backlog
            FROM detalhe_pickup_historico
            WHERE dia_base IN ({dias_placeholders}) {cliente_cond} {regional_cond}
            GROUP BY regional;
        """
        rows_pk = db.execute(text(query_pk), params).fetchall()
        for r in rows_pk:
            reg = r[0]
            if not reg: continue
            if reg not in reg_totals: reg_totals[reg] = {"total": 0, "backlog": 0}
            reg_totals[reg]["total"] += (r[1] or 0)
            reg_totals[reg]["backlog"] += (r[2] or 0)

    regionais = []
    for reg, data in reg_totals.items():
        tot = data["total"]
        back = data["backlog"]
        t_col = ((tot - back) / tot * 100) if tot > 0 else 100.0
        regionais.append({
            "regional": reg,
            "total_pacotes": tot,
            "total_backlog": back,
            "taxa_coleta": round(t_col, 2)
        })
        
def carregar_detalhe_cliente_sellers(db: Session, cliente: str, periodo_tipo: str, rotulo: str, dt_inicio: str = None, dt_fim: str = None, regional: str = None, modalidade: str = "TODOS"):
    dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
    if not dias:
        return []
    dias_placeholders = ", ".join([f":d{i}" for i in range(len(dias))])
    params = {f"d{i}": d for i, d in enumerate(dias)}
    cliente_cond = _build_cliente_filter(cliente, params)
    
    query = f"""
        SELECT 
            nome_cliente,
            merchant_id,
            merchant_nome,
            endereco,
            bairro,
            cidade,
            estado,
            cep_remetente,
            SUM(total_pacotes) as total_pacotes,
            SUM(total_backlog) as total_backlog,
            tipo_coleta
        FROM detalhe_pickup_historico
        WHERE dia_base IN ({dias_placeholders}) {cliente_cond}
        GROUP BY merchant_id
        ORDER BY total_pacotes DESC;
    """
    rows = db.execute(text(query), params).fetchall()
    
    res = []
    for r in rows:
        tot = r[8] or 0
        back = r[9] or 0
        m_id = r[1] or "N/A"
        reg_row = db.execute(text("SELECT primeira_data FROM sellers_pickup_registry WHERE merchant_id = :mid"), {"mid": m_id}).fetchone()
        is_inedito = True if (reg_row and reg_row[0] and reg_row[0] in dias) else False
        
        end_parts = [p for p in [r[3], r[4], r[5], r[6]] if p and str(p).strip()]
        end_str = ", ".join(end_parts) if end_parts else "Endereço Não Informado"
        if r[7]: end_str += f" - CEP: {r[7]}"

        res.append({
            "nome_cliente": r[0] or "N/A",
            "merchant_id": m_id,
            "merchant_nome": r[2] or f"Loja/Seller ({m_id})",
            "endereco_completo": end_str,
            "cidade": r[5] or "N/A",
            "estado": r[6] or "N/A",
            "total_pacotes": tot,
            "total_backlog": back,
            "taxa_coleta": round(((tot - back) / tot * 100) if tot > 0 else 100.0, 2),
            "tipo_coleta": r[10] or "Coleta Porta a Porta",
            "is_inedito": is_inedito
        })
    return res

def carregar_evolucao_cliente(db: Session, cliente: str, periodo_tipo: str, rotulo: str, dt_inicio: str = None, dt_fim: str = None, regional: str = None, modalidade: str = "TODOS"):
    dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
    if not dias:
        return []
        
    dias_placeholders = ", ".join([f":d{i}" for i in range(len(dias))])
    params = {f"d{i}": d for i, d in enumerate(dias)}
    modalidade_upper = (modalidade or "TODOS").strip().upper()
    
    cliente_cond = _build_cliente_filter(cliente, params)
        
    regional_cond = ""
    if regional and regional != "TODAS":
        regional_cond = "AND regional = :regional"
        params["regional"] = regional
        
    dia_totals = {}
    
    if modalidade_upper in ["TODOS", "DROPOFF"]:
        query_str = f"""
            SELECT dia_base, SUM(total_pacotes) as total_pacotes, SUM(total_backlog) as total_backlog
            FROM detalhe_cliente_md_historico
            WHERE dia_base IN ({dias_placeholders}) {cliente_cond} {regional_cond}
            GROUP BY dia_base;
        """
        rows = db.execute(text(query_str), params).fetchall()
        for r in rows:
            dia = r[0]
            if not dia: continue
            if dia not in dia_totals: dia_totals[dia] = {"total": 0, "backlog": 0}
            dia_totals[dia]["total"] += (r[1] or 0)
            dia_totals[dia]["backlog"] += (r[2] or 0)
            
    if modalidade_upper in ["TODOS", "PICKUP"]:
        query_pk = f"""
            SELECT dia_base, SUM(total_pacotes) as total_pacotes, SUM(total_backlog) as total_backlog
            FROM detalhe_pickup_historico
            WHERE dia_base IN ({dias_placeholders}) {cliente_cond} {regional_cond}
            GROUP BY dia_base;
        """
        rows_pk = db.execute(text(query_pk), params).fetchall()
        for r in rows_pk:
            dia = r[0]
            if not dia: continue
            if dia not in dia_totals: dia_totals[dia] = {"total": 0, "backlog": 0}
            dia_totals[dia]["total"] += (r[1] or 0)
            dia_totals[dia]["backlog"] += (r[2] or 0)

    evolucao = []
    for dia, data in dia_totals.items():
        tot = data["total"]
        back = data["backlog"]
        t_col = ((tot - back) / tot * 100) if tot > 0 else 100.0
        evolucao.append({
            "dia_base": dia,
            "taxa_coleta": round(t_col, 2),
            "total_pacotes": tot,
            "total_backlog": back
        })
        
    def parse_date(d_str):
        try:
            return datetime.datetime.strptime(d_str, "%d/%m/%Y")
        except:
            return datetime.datetime.min
            
    evolucao.sort(key=lambda x: parse_date(x["dia_base"]))
    return evolucao

def carregar_detalhes_pickup(
    db: Session,
    periodo_tipo: str,
    rotulo: str,
    dt_inicio: str = None,
    dt_fim: str = None,
    regional: str = None,
    tipo_coleta: str = None
):
    dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
    if not dias:
        return []
    dias_placeholders = ", ".join([f":d{i}" for i in range(len(dias))])
    params = {f"d{i}": d for i, d in enumerate(dias)}
    
    conds = []
    if regional and regional != "TODAS":
        conds.append("regional = :regional")
        params["regional"] = regional
    if tipo_coleta and tipo_coleta != "TODOS":
        conds.append("tipo_coleta = :tipo_coleta")
        params["tipo_coleta"] = tipo_coleta
        
    extra_cond = ("AND " + " AND ".join(conds)) if conds else ""
    
    query = f"""
        SELECT 
            nome_cliente, merchant_id, merchant_nome, cep_remetente,
            estado, cidade, bairro, endereco, regional, tipo_coleta, md_vinculado,
            SUM(total_pacotes) as total_pacotes,
            SUM(total_backlog) as total_backlog
        FROM detalhe_pickup_historico
        WHERE dia_base IN ({dias_placeholders}) {extra_cond}
        GROUP BY nome_cliente, merchant_id, merchant_nome, cep_remetente,
                 estado, cidade, bairro, endereco, regional, tipo_coleta, md_vinculado
        ORDER BY total_pacotes DESC;
    """
    rows = db.execute(text(query), params).fetchall()
    
    res = []
    for r in rows:
        tot = r[11] or 0
        back = r[12] or 0
        t_col = ((tot - back) / tot * 100) if tot > 0 else 100.0
        res.append({
            "nome_cliente": r[0],
            "merchant_id": r[1],
            "merchant_nome": r[2],
            "cep_remetente": r[3],
            "estado": r[4],
            "cidade": r[5],
            "bairro": r[6],
            "endereco": r[7],
            "regional": r[8],
            "tipo_coleta": r[9],
            "md_vinculado": r[10],
            "total_pacotes": tot,
            "total_backlog": back,
            "taxa_coleta": round(t_col, 2)
        })
    return res

def ler_radar_malha(db: Session, regional: str = None) -> list:
    """Read operational packages from database table backlog_aging."""
    try:
        mapping_rows = db.execute(text("SELECT DISTINCT md, regional FROM detalhe_md_historico;")).fetchall()
        mapping = {row[0].strip().upper(): row[1] for row in mapping_rows if row[0]}
    except Exception as e:
        print(f"Error loading mapping: {e}")
        mapping = {}
        
    try:
        query_str = "SELECT codigo_barras, saca, md, cidade, status, data_bipagem FROM backlog_aging;"
        rows = db.execute(text(query_str)).fetchall()
    except Exception as e:
        print(f"Error querying backlog_aging: {e}")
        return []
        
    import datetime
    hoje = datetime.date.today()
    
    parsed_records = []
    for row in rows:
        barcode, saca, md, cidade, status, data_bipagem = row
        md_upper = (md or "").strip().upper()
        reg = mapping.get(md_upper, "OUTRAS")
        
        # Apply regional filter if provided
        if regional and regional.strip().upper() != "TODAS":
            if reg.strip().upper() != regional.strip().upper():
                continue
                
        # Calculate days stopped (dias_parado)
        dias_parado = 0
        if data_bipagem:
            try:
                date_str = data_bipagem.split(" ")[0]
                dt = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
                dias_parado = (hoje - dt).days
            except Exception as e:
                pass
                
        parsed_records.append({
            "barcode": str(barcode or "N/A"),
            "saca": str(saca or "N/A"),
            "md": str(md or "N/A"),
            "regional": str(reg or "N/A"),
            "cidade": str(cidade or "N/A"),
            "status": str(status or "Pendente"),
            "tempo_coleta": str(data_bipagem or "N/A"),
            "dias_parado": int(max(dias_parado, 0))
        })
        
    return parsed_records

import io


def processar_ingestao_dropoff(
    db: Session,
    data_operacao: str,
    num_semana: str,
    file_operacional_bytes: bytes = None,
    file_rangerover_bytes: bytes = None,
    caminho_arquivo: str = None
) -> dict:
    mapa_meses = {
        1: 'JANEIRO', 2: 'FEVEREIRO', 3: 'MARÇO', 4: 'ABRIL', 5: 'MAIO', 6: 'JUNHO',
        7: 'JULHO', 8: 'AGOSTO', 9: 'SETEMBRO', 10: 'OUTUBRO', 11: 'NOVEMBRO', 12: 'DEZEMBRO'
    }
    
    try:
        data_convertida = datetime.datetime.strptime(data_operacao, "%d/%m/%Y")
    except Exception:
        try:
            data_convertida = datetime.datetime.strptime(data_operacao, "%Y-%m-%d")
            data_operacao = data_convertida.strftime("%d/%m/%Y")
        except Exception:
            raise ValueError("Formato de data inválido. Use DD/MM/YYYY ou YYYY-MM-DD.")
            
    nome_mes = mapa_meses[data_convertida.month]
    semana_operacao = f"SEMANA {num_semana} - {nome_mes}"
    
    def padronizar_uf(uf):
        if pd.isna(uf): return ""
        uf_str = str(uf).strip().upper()
        # Remove accents
        import unicodedata
        nfkd = unicodedata.normalize('NFKD', uf_str)
        uf_str = "".join([c for c in nfkd if not unicodedata.combining(c)])
        if len(uf_str) == 2: return uf_str
        mapa = {
            'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAPA': 'AP', 'AMAZONAS': 'AM', 'BAHIA': 'BA',
            'CEARA': 'CE', 'DISTRITO FEDERAL': 'DF', 'ESPIRITO SANTO': 'ES', 'GOIAS': 'GO',
            'MARANHAO': 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', 'MINAS GERAIS': 'MG',
            'PARA': 'PA', 'PARAIBA': 'PB', 'PARANA': 'PR', 'PERNAMBUCO': 'PE', 'PIAUI': 'PI',
            'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS',
            'RONDONIA': 'RO', 'RORAIMA': 'RR', 'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP',
            'SERGIPE': 'SE', 'TOCANTINS': 'TO'
        }
        return mapa.get(uf_str, uf_str)

    def classificar_status(status):
        if not isinstance(status, str): return 'outro'
        s = status.strip().lower()
        if 'cancelad' in s:
            return 'cancelado'
        # COLETADO ou SACO SELADO = Bipado no MD aguardando o caminhão da ANJUN passar (BACKLOG)
        elif 'coletado' in s or 'saco selado' in s or 'aguardando' in s or 'pendente' in s or 'no ponto' in s:
            return 'backlog'
        # CARREGAMENTO (caminhão ANJUN passou e levou), descarregamento, circuito fechado, foi assinado -> COLETADO ANJUN
        elif 'carrega' in s or 'descarrega' in s or 'circuito fechado' in s or 'foi assinado' in s:
            return 'coletado'
        return 'outro'

    # Load MD Dictionary
    _mapa_mds = carregar_mapa_mds(db)
    mds_rows = []
    for md_codigo, info in _mapa_mds.items():
        mds_rows.append({'md': md_codigo.upper(), 'regional': info['regional'], 'estado': info['estado'], 'cidade': 'NÃO CADASTRADA', 'divisao': 'Sem Divisão'})
    df_mds_ref = pd.DataFrame(mds_rows)
    if df_mds_ref.empty:
        df_mds_ref = pd.DataFrame(columns=['md', 'regional', 'estado', 'cidade', 'divisao'])
    valid_mds_set = set([m for m in df_mds_ref['md'].unique() if str(m).strip() != ''])

    import io
    if caminho_arquivo and os.path.exists(caminho_arquivo):
        if caminho_arquivo.lower().endswith('.csv'):
            df_operacional = pd.read_csv(caminho_arquivo)
        else:
            try:
                df_operacional = pd.read_excel(caminho_arquivo, engine='calamine')
            except Exception:
                df_operacional = pd.read_excel(caminho_arquivo)
    elif file_operacional_bytes and len(file_operacional_bytes) > 0:
        try:
            df_operacional = pd.read_excel(io.BytesIO(file_operacional_bytes), engine='calamine')
        except Exception:
            df_operacional = pd.read_excel(io.BytesIO(file_operacional_bytes))
    else:
        raise ValueError("O arquivo da Planilha Operacional está vazio ou não foi encontrado.")
    df_operacional = mapear_colunas(df_operacional)

    _mapa = carregar_mapa_clientes(db)
    
    def is_valid_operational_row(val):
        try:
            return str(int(float(val))) in _mapa
        except:
            return str(val).strip() in _mapa
            
    df_operacional = df_operacional[df_operacional['id_cliente'].apply(is_valid_operational_row)].copy()

    if 'estado' in df_operacional.columns:
        df_operacional['estado'] = df_operacional['estado'].astype(str).apply(padronizar_uf)

    df_operacional['md'] = df_operacional['md'].fillna('').astype(str).str.strip().str.upper()
    df_operacional['categoria'] = df_operacional['status'].apply(classificar_status)
    df_operacional['nome_cliente'] = df_operacional['id_cliente'].apply(lambda v: classificar_cliente(v, _mapa))
    
    if 'tempo_coleta' in df_operacional.columns:
        df_operacional['dt'] = pd.to_datetime(df_operacional['tempo_coleta'], errors='coerce')
        df_operacional['hora_bipagem'] = df_operacional['dt'].dt.hour
    else:
        df_operacional['hora_bipagem'] = 12

    # CRITICAL: ONLY keep packages that belong to a valid MD in the dictionary
    df_filiados = df_operacional[df_operacional['md'].isin(valid_mds_set)].copy()
    
    df_filiados = df_filiados.merge(df_mds_ref[['md', 'regional', 'estado', 'cidade', 'divisao']], on='md', how='left', suffixes=('_orig', ''))
    
    for col in ['regional', 'estado', 'cidade', 'divisao']:
        if f'{col}_orig' in df_filiados.columns:
            df_filiados[col] = df_filiados[col].fillna(df_filiados[f'{col}_orig'])
            
    df_filiados['regional'] = df_filiados['regional'].fillna('OUTROS').astype(str).str.strip().str.upper()
    df_filiados['estado'] = df_filiados['estado'].fillna('SP').astype(str).str.strip().str.upper()

    # Enriquecimento automático de Cidades
    try:
        dict_cidades_malha = {}
        rows_malha = db.execute(text("SELECT DISTINCT UPPER(TRIM(md_codigo)), TRIM(cidade) FROM malha_coordenadas WHERE cidade IS NOT NULL AND cidade != '' AND cidade != 'NÃO CADASTRADA';")).fetchall()
        for r in rows_malha:
            if r[0] and r[1]: dict_cidades_malha[r[0]] = r[1]
            
        rows_pontos = db.execute(text("SELECT DISTINCT UPPER(TRIM(iata)), TRIM(cidade) FROM pontos_coleta WHERE cidade IS NOT NULL AND cidade != '' AND cidade != 'NÃO CADASTRADA';")).fetchall()
        for r in rows_pontos:
            if r[0] and r[1]: dict_cidades_malha[r[0]] = r[1]

        def resolver_cidade(row):
            cid = str(row.get('cidade', '') or '').strip()
            if not cid or cid.upper() in ['NÃO CADASTRADA', 'NONE', 'NAN']:
                md_code = str(row.get('md', '') or '').strip().upper()
                return dict_cidades_malha.get(md_code, 'Não Cadastrada')
            return cid

        df_filiados['cidade'] = df_filiados.apply(resolver_cidade, axis=1)
    except Exception:
        df_filiados['cidade'] = df_filiados['cidade'].fillna('Não Cadastrada').astype(str).str.strip()

    df_filiados['divisao'] = df_filiados['divisao'].fillna('Sem Divisão').astype(str).str.strip()

    saca_str = df_filiados['saca'].fillna('').astype(str).str.strip().str.upper()
    df_lacres_final = df_filiados[(~saca_str.str.startswith(('F', 'D'))) & (saca_str != '')][['md', 'regional', 'saca', 'barcode']].drop_duplicates()
    df_lacres_final['dia_base'] = str(data_operacao)

    df_pico_final = df_filiados.dropna(subset=['hora_bipagem']).groupby(['md', 'regional', 'hora_bipagem']).size().reset_index(name='volume')
    df_pico_final['dia_base'] = str(data_operacao)

    resumo_md = df_filiados.groupby(['nome_cliente', 'md', 'regional', 'estado', 'cidade', 'divisao']).agg(
        total=('barcode', 'count'), 
        backlog=('categoria', lambda x: (x == 'backlog').sum()), 
        carregamento=('categoria', lambda x: (x == 'carregamento').sum()), 
        descarregamento=('categoria', lambda x: (x == 'descarregamento').sum()),
        circuito_fechado=('categoria', lambda x: (x == 'circuito_fechado').sum())
    ).reset_index()
    
    resumo_md['erros_md'] = resumo_md['md'].map(df_lacres_final.groupby('md')['saca'].nunique()).fillna(0).astype(int)
    resumo_md['taxa_coleta'] = ((resumo_md['carregamento'] + resumo_md['descarregamento'] + resumo_md['circuito_fechado']) / resumo_md['total'] * 100).round(2)
    resumo_md['carregamento'] = resumo_md['carregamento'] + resumo_md['circuito_fechado']
    resumo_md = resumo_md.drop(columns=['circuito_fechado'])
    resumo_md['dia_base'] = str(data_operacao)
    resumo_md['semana_base'] = str(semana_operacao)

    resumo_cliente_md = df_filiados.groupby(['nome_cliente', 'md', 'regional']).agg(
        total_pacotes=('barcode', 'count'),
        total_backlog=('categoria', lambda x: (x == 'backlog').sum())
    ).reset_index()
    resumo_cliente_md['total_backlog'] = resumo_cliente_md['total_backlog'].astype(int)
    resumo_cliente_md['dia_base'] = str(data_operacao)
    resumo_cliente_md['semana_base'] = str(semana_operacao)

    # Rangerover processing
    df_rangerover = None
    if file_rangerover_bytes:
        try:
            df_rangerover_raw = pd.read_excel(io.BytesIO(file_rangerover_bytes), engine='calamine')
            rg_map = {}
            for col in df_rangerover_raw.columns:
                c = str(col).lower()
                if 'registo do' in c or 'placa' in c: rg_map[col] = 'placa'
                elif 'condutor' in c or 'motorista' in c: rg_map[col] = 'motorista'
                elif 'ponto de' in c or 'minidrop' in c: rg_map[col] = 'md'
                elif 'confirmação da informação' in c: rg_map[col] = 'confirmador_entrada'
                elif 'tempo de confirmação de carregamento' in c: rg_map[col] = 'entrada'
                elif 'confirmator do pacote' in c: rg_map[col] = 'confirmador_saida'
                elif 'tempo de confirmação do pacote' in c: rg_map[col] = 'saida'
                elif 'número de sacos' in c: rg_map[col] = 'qtd_sacos'
                elif 'número de votos' in c or 'pacotes' in c: rg_map[col] = 'qtd_votos'
                elif 'observações' in c or 'observacao' in c: rg_map[col] = 'observacao'
            
            df_rangerover_raw.rename(columns=rg_map, inplace=True)
            cols_rg = ['md', 'placa', 'motorista', 'entrada', 'saida', 'confirmador_entrada', 'confirmador_saida', 'qtd_sacos', 'qtd_votos', 'observacao']
            for c in cols_rg:
                if c not in df_rangerover_raw.columns:
                    df_rangerover_raw[c] = None
                    
            df_rangerover = df_rangerover_raw[cols_rg].copy()
            df_rangerover['md'] = df_rangerover['md'].astype(str).str.strip().str.upper()
            df_rangerover['data_operacao'] = str(data_operacao)
            df_rangerover['qtd_sacos'] = pd.to_numeric(df_rangerover['qtd_sacos'], errors='coerce').fillna(0).astype(int)
            df_rangerover['qtd_votos'] = pd.to_numeric(df_rangerover['qtd_votos'], errors='coerce').fillna(0).astype(int)
            
            for c in ['placa', 'motorista', 'entrada', 'saida', 'confirmador_entrada', 'confirmador_saida', 'observacao']:
                df_rangerover[c] = df_rangerover[c].astype(str).replace(['nan', 'None', ''], None)
        except Exception as e:
            print(f"Erro ao processar Rangerover: {e}")

    df_auditoria = None
    if df_rangerover is not None and not df_rangerover.empty:
        auditoria_list = []
        mds_rangerover = set(df_rangerover['md'].unique())
        mds_filiados = set(resumo_md['md'].unique())
        all_mds = mds_rangerover.union(mds_filiados)
        
        df_rangerover_sorted = df_rangerover.sort_values(by=['md', 'saida'], na_position='first')
        df_rangerover_unique = df_rangerover_sorted.drop_duplicates(subset=['md'], keep='last')
        rg_dict = df_rangerover_unique.set_index('md').to_dict('index')
        
        resumo_md_unique = resumo_md.drop_duplicates(subset=['md'], keep='first')
        md_resumo_dict = resumo_md_unique.set_index('md').to_dict('index')
        
        df_backlog = df_filiados[df_filiados['categoria'] == 'backlog']
        
        for md in all_mds:
            rg_info = rg_dict.get(md)
            res_info = md_resumo_dict.get(md)
            
            entrada = rg_info['entrada'] if rg_info else None
            saida = rg_info['saida'] if rg_info else None
            placa = rg_info['placa'] if rg_info else None
            motorista = rg_info['motorista'] if rg_info else None
            conf_ent = rg_info['confirmador_entrada'] if rg_info else None
            conf_sai = rg_info['confirmador_saida'] if rg_info else None
            sacos = rg_info['qtd_sacos'] if rg_info else 0
            votos = rg_info['qtd_votos'] if rg_info else 0
            obs = rg_info['observacao'] if rg_info else None
            
            regional = res_info['regional'] if res_info else "N/A"
            carr = res_info['carregamento'] if res_info else 0
            desc = res_info['descarregamento'] if res_info else 0
            back = res_info['backlog'] if res_info else 0
            
            status_coleta = "Desconhecido"
            pacotes_atrasados = 0
            ultimo_pacote_hora = None
            ultimo_pacote_barcode = None
            
            if rg_info:
                if entrada and saida:
                    status_coleta = "Coleta Normal"
                    try:
                        if saida and str(saida).strip() not in ('nan', 'None'):
                            md_pkgs = df_backlog[df_backlog['md'] == md]
                            if not md_pkgs.empty:
                                saida_str = str(saida).strip()
                                if ' ' in saida_str:
                                    saida_str = saida_str.split(' ')[-1]
                                time_parts = saida_str.split(':')
                                h = int(time_parts[0]) if len(time_parts) > 0 and time_parts[0] else 0
                                m = int(time_parts[1]) if len(time_parts) > 1 and time_parts[1] else 0
                                s = int(time_parts[2].split('.')[0]) if len(time_parts) > 2 and time_parts[2] else 0
                                import datetime as dt_mod
                                time_saida = dt_mod.time(h, m, s)
                                
                                def is_after(dt_val):
                                    if pd.isna(dt_val): return False
                                    return dt_val.time() > time_saida
                                
                                after_mask = md_pkgs['dt'].apply(is_after)
                                count_after = after_mask.sum()
                                if count_after > 0:
                                    status_coleta = "Bipagem Pós-Coleta"
                                    pacotes_atrasados = int(count_after)
                                    after_pkgs = md_pkgs[after_mask]
                                    if not after_pkgs.empty:
                                        idx_max = after_pkgs['dt'].idxmax()
                                        last_pkg = after_pkgs.loc[idx_max]
                                        ultimo_pacote_hora = str(last_pkg['tempo_coleta'])
                                        ultimo_pacote_barcode = str(last_pkg['barcode'])
                    except Exception as e:
                        pass
                elif entrada and not saida:
                    status_coleta = "Erro Op. (MD Sem Saída)"
                else:
                    if carr > 0 or desc > 0:
                        status_coleta = "Erro Op. (Não Confirmou Placa)"
                    elif back > 0:
                        status_coleta = "Não Teve Coleta"
                    else:
                        status_coleta = "Sem Registro (Vazio)"
            else:
                if carr > 0 or desc > 0:
                    status_coleta = "Erro Op. (Não Confirmou Placa)"
                elif back > 0:
                    status_coleta = "Não Teve Coleta"
                else:
                    status_coleta = "N/A (Sem Carga)"
            
            auditoria_list.append({
                "dia_base": str(data_operacao),
                "md": md,
                "regional": regional,
                "status_coleta": status_coleta,
                "placa": placa,
                "motorista": motorista,
                "entrada": entrada,
                "saida": saida,
                "confirmador_entrada": conf_ent,
                "confirmador_saida": conf_sai,
                "qtd_sacos": sacos,
                "qtd_votos": votos,
                "observacao": obs,
                "pacotes_atrasados": pacotes_atrasados,
                "ultimo_pacote_hora": ultimo_pacote_hora,
                "ultimo_pacote_barcode": ultimo_pacote_barcode
            })
            
        df_auditoria = pd.DataFrame(auditoria_list)

    from sqlalchemy import text
    for table_name in [
        'detalhe_md_historico', 'detalhe_cliente_md_historico', 
        'detalhe_pico_historico', 'detalhe_lacres_historico',
        'rangerover_data', 'auditoria_coleta'
    ]:
        try:
            db.execute(text(f"DELETE FROM {table_name} WHERE dia_base = :d;"), {"d": str(data_operacao)})
        except Exception:
            pass
    
    conn = db.connection()
    resumo_md.to_sql('detalhe_md_historico', con=conn, if_exists='append', index=False)
    df_pico_final.to_sql('detalhe_pico_historico', con=conn, if_exists='append', index=False)
    df_lacres_final.to_sql('detalhe_lacres_historico', con=conn, if_exists='append', index=False)
    resumo_cliente_md.to_sql('detalhe_cliente_md_historico', con=conn, if_exists='append', index=False)
    
    if df_rangerover is not None and not df_rangerover.empty:
        df_rangerover.to_sql('rangerover_data', con=conn, if_exists='append', index=False)
        
    if df_auditoria is not None and not df_auditoria.empty:
        df_auditoria.to_sql('auditoria_coleta', con=conn, if_exists='append', index=False)
    
    db.commit()
    
    return {
        "status": "success",
        "message": f"Ingestão Dropoff concluída! Total processado para MDs: {len(df_filiados):,} pacotes.",
        "semana": semana_operacao
    }


def processar_ingestao_pickup(
    db: Session,
    data_operacao: str,
    num_semana: str,
    file_operacional_bytes: bytes
) -> dict:
    mapa_meses = {
        1: 'JANEIRO', 2: 'FEVEREIRO', 3: 'MARÇO', 4: 'ABRIL', 5: 'MAIO', 6: 'JUNHO',
        7: 'JULHO', 8: 'AGOSTO', 9: 'SETEMBRO', 10: 'OUTUBRO', 11: 'NOVEMBRO', 12: 'DEZEMBRO'
    }
    
    try:
        data_convertida = datetime.datetime.strptime(data_operacao, "%d/%m/%Y")
    except Exception:
        try:
            data_convertida = datetime.datetime.strptime(data_operacao, "%Y-%m-%d")
            data_operacao = data_convertida.strftime("%d/%m/%Y")
        except Exception:
            raise ValueError("Formato de data inválido. Use DD/MM/YYYY ou YYYY-MM-DD.")
            
    nome_mes = mapa_meses[data_convertida.month]
    semana_operacao = f"SEMANA {num_semana} - {nome_mes}"
    
    def padronizar_uf(uf):
        if pd.isna(uf): return ""
        uf_str = str(uf).strip().upper()
        import unicodedata
        nfkd = unicodedata.normalize('NFKD', uf_str)
        uf_str = "".join([c for c in nfkd if not unicodedata.combining(c)])
        if len(uf_str) == 2: return uf_str
        mapa = {
            'ACRE': 'AC', 'ALAGOAS': 'AL', 'AMAPA': 'AP', 'AMAZONAS': 'AM', 'BAHIA': 'BA',
            'CEARA': 'CE', 'DISTRITO FEDERAL': 'DF', 'ESPIRITO SANTO': 'ES', 'GOIAS': 'GO',
            'MARANHAO': 'MA', 'MATO GROSSO': 'MT', 'MATO GROSSO DO SUL': 'MS', 'MINAS GERAIS': 'MG',
            'PARA': 'PA', 'PARAIBA': 'PB', 'PARANA': 'PR', 'PERNAMBUCO': 'PE', 'PIAUI': 'PI',
            'RIO DE JANEIRO': 'RJ', 'RIO GRANDE DO NORTE': 'RN', 'RIO GRANDE DO SUL': 'RS',
            'RONDONIA': 'RO', 'RORAIMA': 'RR', 'SANTA CATARINA': 'SC', 'SAO PAULO': 'SP',
            'SERGIPE': 'SE', 'TOCANTINS': 'TO'
        }
        return mapa.get(uf_str, uf_str)

    def classificar_status(status):
        if not isinstance(status, str): return 'outro'
        s = status.strip().lower()
        if 'cancelad' in s:
            return 'cancelado'
        # COLETADO ou SACO SELADO = Bipado no MD aguardando o caminhão da ANJUN passar (BACKLOG)
        elif 'coletado' in s or 'saco selado' in s or 'aguardando' in s or 'pendente' in s or 'no ponto' in s:
            return 'backlog'
        # CARREGAMENTO (caminhão ANJUN passou e levou), descarregamento, circuito fechado, foi assinado -> COLETADO ANJUN
        elif 'carrega' in s or 'descarrega' in s or 'circuito fechado' in s or 'foi assinado' in s:
            return 'coletado'
        return 'outro'

    if not file_operacional_bytes or len(file_operacional_bytes) == 0:
        raise ValueError("O arquivo da Planilha Operacional está vazio.")

    import io
    try:
        df_operacional = pd.read_excel(io.BytesIO(file_operacional_bytes), engine='calamine')
    except Exception:
        df_operacional = pd.read_excel(io.BytesIO(file_operacional_bytes))
    df_operacional = mapear_colunas(df_operacional)

    _mapa = carregar_mapa_clientes(db)
    
    def is_valid_operational_row(val):
        try:
            return str(int(float(val))) in _mapa
        except:
            return str(val).strip() in _mapa
            
    df_operacional = df_operacional[df_operacional['id_cliente'].apply(is_valid_operational_row)].copy()

    if 'estado' in df_operacional.columns:
        df_operacional['estado'] = df_operacional['estado'].astype(str).apply(padronizar_uf)
    df_operacional['md'] = df_operacional['md'].fillna('').astype(str).str.strip().str.upper()
    df_operacional['categoria'] = df_operacional['status'].apply(classificar_status)
    df_operacional['nome_cliente'] = df_operacional['id_cliente'].apply(lambda v: classificar_cliente(v, _mapa))
    
    # EVERY ROW IN THIS SPREADSHEET IS PICKUP
    df_pickup_raw = df_operacional.copy()
    resumo_pickup = pd.DataFrame()
    
    if not df_pickup_raw.empty:
        df_pickup_raw['tipo_coleta'] = 'PICKUP_PURO'
        df_pickup_raw['md_vinculado'] = None
        
        _mapa_mds = carregar_mapa_mds(db)
        md_to_reg = {k.upper(): v['regional'] for k, v in _mapa_mds.items()}
        
        def get_pickup_regional(row):
            if row['md'] in md_to_reg:
                return md_to_reg[row['md']]
            uf = padronizar_uf(row['estado'])
            if uf == 'SP': return 'SP'
            elif uf in ['RJ', 'ES']: return 'RJ/ES'
            elif uf in ['MG']: return 'MINAS GERAIS'
            elif uf in ['PR', 'SC', 'RS']: return 'SUL'
            elif uf: return uf
            return 'OUTRAS'
            
        df_pickup_raw['regional'] = df_pickup_raw.apply(get_pickup_regional, axis=1)
        df_pickup_raw['estado'] = df_pickup_raw['estado'].apply(padronizar_uf)
        df_pickup_raw['cidade'] = df_pickup_raw['cidade'].fillna('NÃO INFORMADA').astype(str).str.strip().str.upper()
        df_pickup_raw['bairro'] = df_pickup_raw['bairro'].fillna('').astype(str).str.strip()
        df_pickup_raw['endereco'] = df_pickup_raw['endereco'].fillna('').astype(str).str.strip()
        df_pickup_raw['cep_remetente'] = df_pickup_raw['cep_remetente'].fillna('').astype(str).str.strip()
        df_pickup_raw['merchant_id'] = df_pickup_raw['merchant_id'].fillna('').astype(str).str.strip()
        df_pickup_raw['merchant_nome'] = df_pickup_raw['merchant_nome'].fillna('SELLER NÃO IDENTIFICADO').astype(str).str.strip()
        
        resumo_pickup = df_pickup_raw.groupby([
            'nome_cliente', 'merchant_id', 'merchant_nome', 'cep_remetente',
            'estado', 'cidade', 'bairro', 'endereco', 'regional', 'tipo_coleta', 'md_vinculado'
        ], dropna=False).agg(
            total_pacotes=('barcode', 'count'),
            total_backlog=('categoria', lambda x: (x == 'backlog').sum())
        ).reset_index()
        
        resumo_pickup['taxa_coleta'] = ((resumo_pickup['total_pacotes'] - resumo_pickup['total_backlog']) / resumo_pickup['total_pacotes'] * 100).round(2)
        resumo_pickup['dia_base'] = str(data_operacao)
        resumo_pickup['semana_base'] = str(semana_operacao)

    from sqlalchemy import text
    try:
        db.execute(text("DELETE FROM detalhe_pickup_historico WHERE dia_base = :d;"), {"d": str(data_operacao)})
    except Exception:
        pass
        
    conn = db.connection()
    if not resumo_pickup.empty:
        resumo_pickup.to_sql('detalhe_pickup_historico', con=conn, if_exists='append', index=False)
        atualizar_radar_sellers_pickup(df_pickup_raw, data_operacao, semana_operacao, db)
        
    db.commit()
    
    return {
        "status": "success",
        "message": f"Ingestão Pickup concluída! Total processado para Pickup: {len(df_pickup_raw):,} pacotes.",
        "semana": semana_operacao
    }


def atualizar_radar_sellers_pickup(df_completo: pd.DataFrame, data_operacao: str, semana_operacao: str, db: Session):
    """
    Sincroniza e audita novos sellers de Coleta Porta a Porta (Pickup).
    Detecta sellers inéditos no histórico e alimenta a tabela sellers_pickup_registry.
    """
    try:
        if df_completo is None or df_completo.empty:
            return
            
        # Filtrar apenas coleta porta-a-porta válida
        df_p = df_completo[
            (df_completo['maneira_coleta'].astype(str).str.lower().str.contains('coleta')) &
            (df_completo['merchant_id'].notna()) &
            (~df_completo['merchant_id'].astype(str).str.strip().isin(['', 'N/A', 'None', 'nan', 'Desconhecido']))
        ].copy()
        
        if 'estado' in df_p.columns:
            df_p['estado'] = df_p['estado'].apply(padronizar_uf)

        if df_p.empty:
            return
            
        def _parse_iso(d_str):
            try:
                parts = str(d_str).strip().split("/")
                if len(parts) == 3:
                    return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
            except Exception:
                pass
            return str(d_str)

        iso_operacao = _parse_iso(data_operacao)
        
        # Agrupar dados do lote atual por seller
        agg_atual = df_p.groupby('merchant_id').agg(
            merchant_nome=('merchant_nome', 'first'),
            primeiro_cliente=('nome_cliente', 'first'),
            estado_origem=('estado', 'first'),
            cidade_origem=('cidade', 'first'),
            bairro_origem=('bairro', 'first'),
            cep_origem=('cep_remetente', 'first'),
            endereco_origem=('endereco_completo', 'first'),
            volume_lote=('merchant_id', 'count')
        ).reset_index()
        
        # Buscar sellers já cadastrados na base
        existing_rows = db.execute(text("SELECT merchant_id, volume_acumulado_total, total_dias_ativos, primeira_data_iso, ultima_data_iso FROM sellers_pickup_registry;")).fetchall()
        existing_map = {str(r[0]).strip(): {"vol": r[1] or 0, "dias": r[2] or 1, "p_iso": r[3], "u_iso": r[4]} for r in existing_rows}
        
        novos_inserts = []
        updates = []
        
        for _, row in agg_atual.iterrows():
            m_id = str(row['merchant_id']).strip()
            vol = int(row['volume_lote'])
            m_nome = str(row['merchant_nome']).strip()
            if m_nome.lower() in ['nan', 'none', 'n/a', '']:
                m_nome = m_id
                
            if m_id not in existing_map:
                # NOVO SELLER DETECTADO
                novos_inserts.append({
                    "m_id": m_id,
                    "m_nome": m_nome,
                    "cli": str(row['primeiro_cliente']),
                    "p_data": str(data_operacao),
                    "p_iso": iso_operacao,
                    "p_sem": str(semana_operacao),
                    "uf": str(row['estado_origem']),
                    "cid": str(row['cidade_origem']),
                    "bai": str(row['bairro_origem']),
                    "cep": str(row['cep_origem']),
                    "end": str(row['endereco_origem']),
                    "v_pri": vol,
                    "v_tot": vol,
                    "dias": 1,
                    "u_data": str(data_operacao),
                    "u_iso": iso_operacao,
                    "st": 'Novo'
                })
            else:
                # SELLER JÁ EXISTENTE (UPDATE CUMULATIVO)
                info = existing_map[m_id]
                dias_increment = 1 if info['u_iso'] != iso_operacao else 0
                new_dias = info['dias'] + dias_increment
                new_vol = info['vol'] + vol
                updates.append({
                    "vol": new_vol,
                    "dias": new_dias,
                    "u_data": str(data_operacao),
                    "u_iso": iso_operacao,
                    "st": 'Recorrente' if new_dias > 1 else 'Novo',
                    "m_id": m_id
                })
                
        if novos_inserts:
            db.execute(text("""
                INSERT INTO sellers_pickup_registry (
                    merchant_id, merchant_nome, primeiro_cliente, primeira_data, primeira_data_iso,
                    primeira_semana, estado_origem, cidade_origem, bairro_origem, cep_origem,
                    endereco_origem, volume_primeiro_dia, volume_acumulado_total, total_dias_ativos,
                    ultima_data, ultima_data_iso, status_seller
                ) VALUES (:m_id, :m_nome, :cli, :p_data, :p_iso, :p_sem, :uf, :cid, :bai, :cep, :end, :v_pri, :v_tot, :dias, :u_data, :u_iso, :st);
            """), novos_inserts)
            
        if updates:
            db.execute(text("""
                UPDATE sellers_pickup_registry
                SET volume_acumulado_total = :vol,
                    total_dias_ativos = :dias,
                    ultima_data = :u_data,
                    ultima_data_iso = :u_iso,
                    status_seller = :st
                WHERE merchant_id = :m_id;
            """), updates)
            
        db.commit()
    except Exception as e:
        print(f"Aviso ao sincronizar radar de sellers: {e}")


def processar_planilha_criacao_pedidos(
    db: Session,
    data_operacao: str,
    num_semana: str,
    file_criacao_bytes: bytes = None,
    caminho_arquivo: str = None
) -> dict:
    mapa_meses = {
        1: 'JANEIRO', 2: 'FEVEREIRO', 3: 'MARÇO', 4: 'ABRIL', 5: 'MAIO', 6: 'JUNHO',
        7: 'JULHO', 8: 'AGOSTO', 9: 'SETEMBRO', 10: 'OUTUBRO', 11: 'NOVEMBRO', 12: 'DEZEMBRO'
    }
    try:
        data_convertida = datetime.datetime.strptime(data_operacao, "%d/%m/%Y")
    except Exception:
        try:
            data_convertida = datetime.datetime.strptime(data_operacao, "%Y-%m-%d")
            data_operacao = data_convertida.strftime("%d/%m/%Y")
        except Exception:
            raise ValueError("Formato de data inválido. Use DD/MM/YYYY ou YYYY-MM-DD.")
            
    nome_mes = mapa_meses[data_convertida.month]
    semana_operacao = f"SEMANA {num_semana} - {nome_mes}"
    
    # 1. Leitura do arquivo
    if caminho_arquivo and os.path.exists(caminho_arquivo):
        if caminho_arquivo.lower().endswith('.csv'):
            df_raw = pd.read_csv(caminho_arquivo)
        else:
            try:
                df_raw = pd.read_excel(caminho_arquivo, engine='calamine')
            except Exception:
                df_raw = pd.read_excel(caminho_arquivo)
    elif file_criacao_bytes and len(file_criacao_bytes) > 0:
        wb = CalamineWorkbook.from_filelike(io.BytesIO(file_criacao_bytes))
        sheet_name = wb.sheet_names[0]
        raw_sheet = wb.get_sheet_by_name(sheet_name).to_python()
        if not raw_sheet or len(raw_sheet) < 2:
            raise ValueError("A planilha de Criação de Pedidos está vazia ou sem cabeçalhos.")
            
        headers = [str(h).strip() for h in raw_sheet[0]]
        data_rows = raw_sheet[1:]
        df_raw = pd.DataFrame(data_rows, columns=headers)
    else:
        raise ValueError("A planilha de Criação de Pedidos está vazia ou não foi encontrada.")
    
    # 2. Localizar colunas de interesse
    def achar_coluna(termos, default_idx=None):
        # 1. Tenta match exato primeiro
        for c in df_raw.columns:
            c_low = str(c).lower().strip()
            if any(t == c_low for t in termos):
                return c
        # 2. Tenta contains se nao achar exato
        for c in df_raw.columns:
            c_low = str(c).lower().strip()
            if any(t in c_low for t in termos):
                return c
        
        if default_idx is not None and default_idx < len(df_raw.columns):
            return df_raw.columns[default_idx]
        return None

    col_cliente = achar_coluna(['no. do cliente', 'cliente', 'merchant code'])
    col_cep = achar_coluna(['cep do remetente', 'cep remetente', 'cep_remetente', 'cep'])
    col_cidade = achar_coluna(['cidade de origem', 'cidade origem', 'cidade'])
    col_estado = achar_coluna(['estado de origem', 'estado origem', 'estado', 'uf'])
    col_bairro = achar_coluna(['área do envio', 'area do envio', 'bairro'])
    col_endereco = achar_coluna(['endereço do envio', 'endereco do envio', 'endereço', 'endereco', 'avenida do envio'])
    col_merchant_id = achar_coluna(['número do cliente comerciante', 'numero do cliente comerciante', 'merchant id', 'merchant_id'])
    col_merchant_nome = achar_coluna(['nome do cliente merchant', 'merchant nome', 'merchant_nome', 'remetente'])
    col_maneira = achar_coluna(['maneira de coleta', 'maneira coleta', 'tipo coleta'])
    col_status = achar_coluna(['status do pedido', 'status pedido', 'status'])
    col_tipo_pedido = achar_coluna(['tipo do pedido', 'tipo de pedido', 'tipo pedido', 'order type', 'tipo_pedido'], default_idx=59)
    
    # 3. Filtrar e classificar clientes
    _mapa = carregar_mapa_clientes(db)
    if col_cliente:
        df_raw['nome_cliente'] = df_raw[col_cliente].apply(lambda v: classificar_cliente(v, _mapa))
        # Descartar apenas registros de teste explícito (24012)
        df = df_raw[df_raw['nome_cliente'] != "TESTE_EXCLUIR"].copy()
    else:
        df = df_raw.copy()
        df['nome_cliente'] = "Outros"
        
    if col_status and col_status in df.columns:
        df = df[df[col_status].astype(str).str.lower() != 'cancelado'].copy()

    def limpar_cep(val):
        if pd.isna(val): return ""
        nums = re.sub(r'\D', '', str(val))
        return nums.zfill(8) if nums else ""

    df['cep_remetente'] = df[col_cep].apply(limpar_cep) if col_cep else ""
    df['cidade'] = df[col_cidade].astype(str).str.strip().str.title() if col_cidade else "Desconhecida"
    df['estado'] = df[col_estado].astype(str).apply(padronizar_uf) if col_estado else "SP"

    # Filter out international rows (Brazil only) - STRICT RULE
    estados_br = {
        'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
        'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'
    }
    
    # Drop rows where state is not in Brazil
    df = df[df['estado'].isin(estados_br)].copy()
    
    # Drop rows where city is clearly international (China origins)
    cidades_internacionais = ['dongguan', 'shenzhen', 'guangzhou', 'hong kong', 'yiwu', 'shanghai', 'beijing', 'china']
    df = df[~df['cidade'].str.lower().isin(cidades_internacionais)].copy()
    
    # Drop rows where CEP is empty or not exactly 8 digits (Brazilian format)
    df = df[df['cep_remetente'].str.len() == 8].copy()
    
    # Drop rows that might contain Chinese characters in city or neighborhood
    df = df[~df['cidade'].str.contains('[\u4e00-\u9fff]', regex=True, na=False)].copy()

    df['bairro'] = df[col_bairro].astype(str).str.strip().str.title() if col_bairro else ""
    df['endereco_completo'] = df[col_endereco].astype(str).str.strip() if col_endereco else ""
    df['merchant_id'] = df[col_merchant_id].astype(str).str.strip() if col_merchant_id else "N/A"
    df['merchant_nome'] = df[col_merchant_nome].astype(str).str.strip().str.title() if col_merchant_nome else "N/A"
    df['maneira_coleta'] = df[col_maneira].astype(str).str.strip() if col_maneira else "coleta porta-a-porta"
    
    col_ponto_colecao = achar_coluna(['ponto de coleção', 'ponto de colecao', 'ponto colecao', 'ponto'])
    df['ponto_colecao'] = df[col_ponto_colecao].astype(str).str.strip() if col_ponto_colecao else ""
    
    if col_tipo_pedido and col_tipo_pedido in df.columns:
        df['tipo_pedido'] = df[col_tipo_pedido].astype(str).str.strip().replace({'nan': 'Normal', 'None': 'Normal', '': 'Normal'}).fillna('Normal')
    else:
        df['tipo_pedido'] = "Normal"

    if col_status and col_status in df.columns:
        df['status_pedido'] = df[col_status].astype(str).str.strip().replace({'nan': 'Criado', 'None': 'Criado', '': 'Criado'}).fillna('Criado')
    else:
        df['status_pedido'] = "Criado"

    # --- MODALIDADES E CLIENTES: MANTER TODOS OS REGISTROS ---
    # Preserva 100% dos pacotes da planilha sem descartar linhas
    # ---------------------------------------------------------

    df['dia_base'] = data_operacao
    df['semana_base'] = semana_operacao

    # 4. Agregações
    # A. Detalhe por Seller / Endereço / Modalidade / Tipo / Status / Ponto Coleção
    df_detalhe = df.groupby([
        'dia_base', 'semana_base', 'nome_cliente', 'merchant_id', 'merchant_nome',
        'cep_remetente', 'estado', 'cidade', 'bairro', 'endereco_completo', 'maneira_coleta',
        'ponto_colecao', 'tipo_pedido', 'status_pedido'
    ]).size().reset_index(name='total_pedidos')

    # B. Resumo por CEP (para Heatmap e Análise de Expansão)
    df_resumo_cep = df.groupby([
        'dia_base', 'semana_base', 'nome_cliente', 'cep_remetente', 'estado', 'cidade', 'bairro'
    ]).agg(
        total_pedidos=('nome_cliente', 'count'),
        qtd_sellers=('merchant_id', 'nunique')
    ).reset_index().rename(columns={'cep_remetente': 'cep'})

    # 5. Limpar dados prévios e calcular o saldo
    total_antigo = 0
    try:
        row_antigo = db.execute(
            text("SELECT SUM(total_pedidos) FROM criacao_pedidos_historico WHERE dia_base = :d;"),
            {"d": str(data_operacao)}
        ).fetchone()
        if row_antigo and row_antigo[0]:
            total_antigo = int(row_antigo[0])
    except Exception:
        pass
        
    for tbl in ['criacao_pedidos_historico', 'criacao_resumo_cep']:
        try:
            db.execute(text(f"DELETE FROM {tbl} WHERE dia_base = :d;"), {"d": str(data_operacao)})
        except Exception:
            pass

    conn = db.connection()
    df_detalhe.to_sql('criacao_pedidos_historico', con=conn, if_exists='append', index=False)
    df_resumo_cep.to_sql('criacao_resumo_cep', con=conn, if_exists='append', index=False)

    # C. Cálculo de Lead Time até Perus (Coluna M: Tempo real para a coleta -> Coluna U: Tempo de descarregamento)
    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS d2d_perus_tempos (
                dia_base TEXT,
                md_codigo TEXT,
                qtd_amostras INTEGER DEFAULT 0,
                media_horas_perus REAL,
                min_horas_perus REAL,
                max_horas_perus REAL,
                hora_media_bipagem TEXT,
                hora_media_perus TEXT,
                qtd_destino_sp INTEGER DEFAULT 0,
                qtd_destino_outros INTEGER DEFAULT 0,
                qtd_confirmado_perus INTEGER DEFAULT 0,
                placas_veiculos TEXT DEFAULT '',
                ajvs_veiculos TEXT DEFAULT '',
                iatas_descarga TEXT DEFAULT '',
                PRIMARY KEY (dia_base, md_codigo)
            );
        """))
        # Garantir colunas na tabela d2d_perus_tempos
        for col_nova in ['qtd_lacres', 'qtd_lacres_sp', 'qtd_lacres_outros']:
            try:
                db.execute(text(f"ALTER TABLE d2d_perus_tempos ADD COLUMN {col_nova} INTEGER DEFAULT 0;"))
            except Exception:
                pass

        col_t_coleta = achar_coluna(['tempo real para a coleta', 'tempo coleta', 'data coleta'])
        col_t_desc = achar_coluna(['tempo de descarregamento', 'tempo descarregamento'])
        col_ajv = achar_coluna(['número de escaneamento do veículo', 'numero de escaneamento do veiculo', 'escaneamento veiculo', 'ajv'])
        col_uf_dest = achar_coluna(['estado de recebimento', 'estado recebimento', 'uf recebimento', 'uf destino'])
        col_lacre = achar_coluna(['número da saca', 'numero da saca', 'número do lacre', 'numero do lacre', 'saca', 'lacre', 'saco', 'seal'])

        # Mapa de caminhões em memória
        cam_map = {}
        try:
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS d2d_caminhoes_monitoramento (
                    ajv TEXT PRIMARY KEY,
                    placa TEXT,
                    carregador_nome TEXT,
                    rede_carregador TEXT,
                    endereco_carregamento TEXT,
                    tempo_carregamento TEXT,
                    seguinte_secao TEXT,
                    descarregador_nome TEXT,
                    rede_descarregador TEXT,
                    endereco_descarga TEXT,
                    tempo_descarregamento TEXT,
                    sacos_carregados REAL,
                    sacos_descarregados REAL,
                    votos_carregados REAL,
                    votos_descarregados REAL,
                    tipo_veiculo TEXT
                );
            """))
            c_rows = db.execute(text("SELECT ajv, placa, rede_descarregador, endereco_descarga FROM d2d_caminhoes_monitoramento;")).fetchall()
            cam_map = {r[0]: (r[1] or "", r[2] or "", r[3] or "") for r in c_rows if r and r[0]}
        except Exception:
            pass

        if col_t_coleta and col_t_desc and col_ponto_colecao:
            df_d2d = df[df['nome_cliente'].astype(str).str.lower().str.contains('d2d', na=False)].copy()
            df_d2d['md_clean'] = df_d2d[col_ponto_colecao].astype(str).str.strip().str.upper()
            df_d2d = df_d2d[~df_d2d['md_clean'].isin(['', 'NAN', 'NONE', 'NULL', '-'])].copy()

            if not df_d2d.empty:
                df_d2d['ajv_val'] = df_d2d[col_ajv].astype(str).str.strip() if col_ajv and col_ajv in df_d2d.columns else ""
                df_d2d['uf_dest_val'] = df_d2d[col_uf_dest].astype(str).str.strip().str.upper() if col_uf_dest and col_uf_dest in df_d2d.columns else ""
                df_d2d['is_dest_sp'] = df_d2d['uf_dest_val'] == 'SP'

                # Coluna de lacres/sacas
                if col_lacre and col_lacre in df_d2d.columns:
                    df_d2d['lacre_val'] = df_d2d[col_lacre].astype(str).str.strip()
                    df_d2d['lacre_val'] = df_d2d['lacre_val'].replace({'nan': '', 'None': '', 'null': '', 'NULL': '', '-': ''})
                else:
                    df_d2d['lacre_val'] = ""

                # Match truck
                df_d2d['placa'] = df_d2d['ajv_val'].apply(lambda x: cam_map.get(x, ("", "", ""))[0])
                df_d2d['rede_desc'] = df_d2d['ajv_val'].apply(lambda x: cam_map.get(x, ("", "", ""))[1])
                df_d2d['end_desc'] = df_d2d['ajv_val'].apply(lambda x: cam_map.get(x, ("", "", ""))[2])

                df_d2d['dt_m'] = pd.to_datetime(df_d2d[col_t_coleta], errors='coerce')
                df_d2d['dt_u'] = pd.to_datetime(df_d2d[col_t_desc], errors='coerce')
                df_d2d['horas'] = (df_d2d['dt_u'] - df_d2d['dt_m']).dt.total_seconds() / 3600.0

                db.execute(text("DELETE FROM d2d_perus_tempos WHERE dia_base = :d"), {"d": str(data_operacao)})
                inserts_t = []

                for md_name, g in df_d2d.groupby('md_clean'):
                    q_sp = int((g['is_dest_sp']).sum())
                    q_outros = int((~g['is_dest_sp']).sum())

                    # Lacres e sacas únicos
                    lacres_validos = g[g['lacre_val'] != '']['lacre_val']
                    qtd_lacres = int(lacres_validos.nunique()) if not lacres_validos.empty else 0

                    lacres_sp_validos = g[(g['is_dest_sp']) & (g['lacre_val'] != '')]['lacre_val']
                    qtd_lacres_sp = int(lacres_sp_validos.nunique()) if not lacres_sp_validos.empty else 0

                    lacres_out_validos = g[(~g['is_dest_sp']) & (g['lacre_val'] != '')]['lacre_val']
                    qtd_lacres_outros = int(lacres_out_validos.nunique()) if not lacres_out_validos.empty else 0

                    # Confirmação de Perus: status descarregamento/circuito fechado e IATA SP-RR-001 ou endereço de Perus
                    is_p = (g['status_pedido'].astype(str).str.strip().str.lower().isin(['descarregamento', 'circuito fechado'])) & (
                        (g['rede_desc'] == 'SP-RR-001') |
                        (g['end_desc'].str.lower().str.contains('perus', na=False))
                    )
                    q_conf = int(is_p.sum())

                    placas_str = ", ".join(sorted(set(p for p in g['placa'] if p)))[:200]
                    ajvs_str = ", ".join(sorted(set(a for a in g['ajv_val'] if a)))[:200]
                    iatas_str = ", ".join(sorted(set(i for i in g['rede_desc'] if i)))[:200]

                    gh = g[(g['horas'] >= 0.05) & (g['horas'] <= 168.0)].copy()
                    if not gh.empty:
                        q_amostras = int(len(gh))
                        media_h = round(float(gh['horas'].mean()), 2)
                        min_h = round(float(gh['horas'].min()), 2)
                        max_h = round(float(gh['horas'].max()), 2)
                        min_m = gh['dt_m'].dt.hour * 60 + gh['dt_m'].dt.minute
                        min_u = gh['dt_u'].dt.hour * 60 + gh['dt_u'].dt.minute
                        mm = int(round(min_m.mean())) % 1440
                        mu = int(round(min_u.mean())) % 1440
                        hm_str = f"{mm // 60:02d}:{mm % 60:02d}"
                        hu_str = f"{mu // 60:02d}:{mu % 60:02d}"
                    else:
                        q_amostras = 0
                        media_h = None
                        min_h = None
                        max_h = None
                        hm_str = None
                        hu_str = None

                    inserts_t.append({
                        "d": str(data_operacao),
                        "md": str(md_name),
                        "q": q_amostras,
                        "mh": media_h,
                        "minh": min_h,
                        "maxh": max_h,
                        "hm": hm_str,
                        "hu": hu_str,
                        "q_sp": q_sp,
                        "q_out": q_outros,
                        "q_conf": q_conf,
                        "plc": placas_str,
                        "ajv": ajvs_str,
                        "iatas": iatas_str,
                        "q_lac": qtd_lacres,
                        "q_lac_sp": qtd_lacres_sp,
                        "q_lac_out": qtd_lacres_outros
                    })

                if inserts_t:
                    db.execute(text("""
                        INSERT OR REPLACE INTO d2d_perus_tempos
                        (dia_base, md_codigo, qtd_amostras, media_horas_perus, min_horas_perus, max_horas_perus,
                         hora_media_bipagem, hora_media_perus, qtd_destino_sp, qtd_destino_outros, qtd_confirmado_perus,
                         placas_veiculos, ajvs_veiculos, iatas_descarga, qtd_lacres, qtd_lacres_sp, qtd_lacres_outros)
                        VALUES (:d, :md, :q, :mh, :minh, :maxh, :hm, :hu, :q_sp, :q_out, :q_conf, :plc, :ajv, :iatas, :q_lac, :q_lac_sp, :q_lac_out);
                    """), inserts_t)
    except Exception as e:
        print("Aviso ao calcular tempos Perus (Coluna U):", e)
    
    # Sincronizar Radar de Sellers de Pickup (First-Seen & Tendência Geográfica)
    try:
        atualizar_radar_sellers_pickup(df, data_operacao, semana_operacao, db)
    except Exception as e:
        print("Aviso ao atualizar radar de sellers:", e)
    
    try:
        if col_status and col_status in df.columns:
            status_counts = df[col_status].value_counts().to_dict()
        else:
            status_counts = {"Sem Status": len(df)}
            
        total_novo = int(len(df))
        delta = max(0, total_novo - total_antigo)
        hora_atualizacao = datetime.datetime.now().strftime('%d/%m/%Y %H:%M:%S')

        db.execute(text("CREATE TABLE IF NOT EXISTS app_config (chave TEXT PRIMARY KEY, valor TEXT);"))
        db.execute(text("INSERT OR REPLACE INTO app_config (chave, valor) VALUES ('ultima_ingestao_criacao', :ts)"), {"ts": hora_atualizacao})
        db.execute(text("INSERT OR REPLACE INTO app_config (chave, valor) VALUES ('ultima_ingestao_status', :st)"), {"st": json.dumps(status_counts, ensure_ascii=False)})

        db.execute(text("""
            CREATE TABLE IF NOT EXISTS criacao_ingestao_log (
                dia_base TEXT PRIMARY KEY,
                hora_ultima_atualizacao TEXT,
                volume_anterior INTEGER DEFAULT 0,
                volume_atual INTEGER DEFAULT 0,
                volume_incremental INTEGER DEFAULT 0
            );
        """))
        db.execute(text("""
            INSERT OR REPLACE INTO criacao_ingestao_log (dia_base, hora_ultima_atualizacao, volume_anterior, volume_atual, volume_incremental)
            VALUES (:d, :h, :va, :vnow, :delta);
        """), {
            "d": str(data_operacao),
            "h": hora_atualizacao,
            "va": total_antigo,
            "vnow": total_novo,
            "delta": delta
        })
    except Exception:
        pass
        
    db.commit()

    total_criados = len(df)
    total_novos = total_criados - total_antigo
    
    total_sellers = df['merchant_id'].nunique()
    total_ceps = df_resumo_cep['cep'].nunique()

    return {
        "status": "success",
        "message": f"Dados de criação importados com sucesso! (+{total_novos} novos)" if total_novos > 0 else "Dados de criação importados com sucesso! (Nenhum novo pedido encontrado)",
        "total_pedidos": total_novos if total_novos > 0 else total_criados,
        "total_historico": total_criados,
        "total_sellers": total_sellers,
        "total_ceps": total_ceps
    }


def haversine_distance_km(lat1, lon1, lat2, lon2):
    """Calcula a distância em KM entre dois pontos geográficos."""
    R = 6371.0  # Raio da Terra em KM
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(R * c, 2)


def consultar_oportunidades_expansao(
    db: Session,
    periodo_tipo: str,
    rotulo: str,
    dt_inicio: str = None,
    dt_fim: str = None,
    estado: str = None,
    cidade: str = None,
    min_pedidos: int = 10
) -> list:
    """Cruza a demanda criada e não coletada por CEP com a malha de MDs existentes.
    Aplica o raio estrito de 3.0 KM para identificar vácuos de cobertura sem MD próximo."""
    dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
    if not dias:
        try:
            rows_d = db.execute(text("SELECT DISTINCT dia_base FROM criacao_pedidos_historico ORDER BY rowid DESC LIMIT 30;")).fetchall()
            dias = [r[0] for r in rows_d if r[0]]
        except Exception:
            dias = []
    if not dias:
        return []

    dias_placeholders = ", ".join([f":d{i}" for i in range(len(dias))])
    params = {f"d{i}": d for i, d in enumerate(dias)}

    filter_geo = ""
    if estado:
        filter_geo += " AND estado = :estado"
        params["estado"] = estado.upper().strip()
    if cidade:
        filter_geo += " AND UPPER(cidade) LIKE :cidade"
        params["cidade"] = f"%{cidade.upper().strip()}%"

    # 1. Agrupar criação por CEP e Modalidade (Coleta Porta a Porta vs Entrega Porta a Porta)
    query_cep = f"""
        SELECT 
            cep_remetente as cep, 
            estado, 
            cidade, 
            bairro, 
            SUM(total_pedidos) as total_criado, 
            COUNT(DISTINCT merchant_id) as total_sellers,
            SUM(CASE WHEN LOWER(maneira_coleta) LIKE '%porta%' OR LOWER(maneira_coleta) LIKE '%pickup%' OR LOWER(maneira_coleta) LIKE '%coleta%' THEN total_pedidos ELSE 0 END) as total_pickup,
            SUM(CASE WHEN LOWER(maneira_coleta) LIKE '%ponto%' OR LOWER(maneira_coleta) LIKE '%dropoff%' OR LOWER(maneira_coleta) LIKE '%entrega%' THEN total_pedidos ELSE 0 END) as total_dropoff
        FROM criacao_pedidos_historico
        WHERE dia_base IN ({dias_placeholders}) {filter_geo}
        GROUP BY cep_remetente, estado, cidade, bairro
        HAVING SUM(total_pedidos) >= :min_pedidos
        ORDER BY total_criado DESC
        LIMIT 250;
    """
    params["min_pedidos"] = min_pedidos
    rows_cep = db.execute(text(query_cep), params).fetchall()

    # 2. Obter lista de MDs ativos com coordenadas
    rows_mds = db.execute(text("""
        SELECT md_codigo, nome_ponto, cidade, estado, cep, latitude, longitude
        FROM malha_coordenadas
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND funcionando = 'ATIVADO';
    """)).fetchall()

    md_list = [{
        "codigo": r[0], "nome": r[1] or r[0], "cidade": r[2], "estado": r[3],
        "cep": str(r[4] or "").replace("-", ""), "lat": r[5], "lng": r[6]
    } for r in rows_mds]

    # Mapeamento de coordenadas médias por prefixo de CEP (5 dígitos)
    cep_coords_cache = {}
    for md in md_list:
        if md["cep"] and len(md["cep"]) >= 5:
            cep_coords_cache[md["cep"][:5]] = (md["lat"], md["lng"])

    oportunidades = []
    for r in rows_cep:
        cep, uf, cid, bai, total_ped, sellers, t_pickup, t_dropoff = r
        cep_clean = str(cep or "").replace("-", "").strip()
        
        # Calcular volume de coleta real já realizado no mesmo CEP se houver registros
        q_coletado = text("""
            SELECT SUM(total) FROM detalhe_md_historico 
            WHERE dia_base IN ({}) AND (UPPER(cidade) LIKE :c OR UPPER(md) LIKE :c);
        """.format(dias_placeholders))
        params_col = {f"d{i}": d for i, d in enumerate(dias)}
        params_col["c"] = f"%{(cid or '').upper().strip()}%"
        vol_coletado_cid = db.execute(q_coletado, params_col).scalar() or 0

        # Encontrar MD mais próximo
        md_mais_proximo = None
        menor_dist = 999.0
        
        prefix_cep = cep_clean[:5]
        if prefix_cep in cep_coords_cache:
            lat_cep, lng_cep = cep_coords_cache[prefix_cep]
            for md in md_list:
                dist = haversine_distance_km(lat_cep, lng_cep, md["lat"], md["lng"])
                if dist < menor_dist:
                    menor_dist = dist
                    md_mais_proximo = md
        else:
            # Fallback por correspondência de Cidade
            mds_mesma_cidade = [m for m in md_list if (m["cidade"] or "").upper() == (cid or "").upper()]
            if mds_mesma_cidade:
                md_mais_proximo = mds_mesma_cidade[0]
                menor_dist = 3.5  # Distância estimada
            else:
                menor_dist = 12.0 # Sem MD no município

        # Regra de Raio Estrito de 3.0 KM
        tem_md_raio_3km = menor_dist < 3.0
        
        if not tem_md_raio_3km:
            prioridade = "ALTA_PRIORIDADE"
            modalidade_pred = "Coleta Porta a Porta" if t_pickup >= t_dropoff else "Entrega Porta a Porta"
            recomendacao = f"🚨 Vácuo Crítico (< 3 KM): Nenhum MD num raio de 3.0 km. {sellers} sellers ativos gerando {int(total_ped):,} pacotes ({modalidade_pred}). Requer implantação de ponto parceiro."
        elif menor_dist >= 2.0:
            prioridade = "MEDIA_PRIORIDADE"
            recomendacao = f"⚡ MD mais próximo a {menor_dist:.1f} km ({md_mais_proximo['nome']}). Avaliar criação de ponto de apoio local."
        else:
            prioridade = "COBERTO_OU_BAIXO"
            recomendacao = f"✅ Coberto (< 3 KM): Atendido pelo MD {md_mais_proximo['nome']} a {menor_dist:.1f} km."

        oportunidades.append({
            "cep": cep_clean,
            "estado": uf,
            "cidade": cid,
            "bairro": bai or "",
            "total_pedidos": int(total_ped),
            "total_pickup": int(t_pickup),
            "total_dropoff": int(t_dropoff),
            "qtd_sellers": int(sellers),
            "distancia_km_md_proximo": round(menor_dist, 1) if menor_dist < 900 else None,
            "md_mais_proximo": md_mais_proximo["nome"] if md_mais_proximo else "Nenhum no município",
            "tem_md_raio_3km": tem_md_raio_3km,
            "prioridade": prioridade,
            "recomendacao": recomendacao
        })

    # Ordenar priorizando Vácuos Críticos (< 3 KM) e maior volume
    prioridade_peso = {"ALTA_PRIORIDADE": 3, "MEDIA_PRIORIDADE": 2, "COBERTO_OU_BAIXO": 1}
    oportunidades.sort(key=lambda x: (prioridade_peso.get(x["prioridade"], 0), x["total_pedidos"]), reverse=True)
    return oportunidades


def consultar_resumo_criacao(
    db: Session,
    periodo_tipo: str,
    rotulo: str,
    dt_inicio: str = None,
    dt_fim: str = None,
    cliente: str = None,
    estado: str = None
) -> dict:
    """Retorna o consolidado de criação de pedidos por cliente, principais polos e maneiras de coleta."""
    dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
    if not dias:
        try:
            rows_d = db.execute(text("SELECT DISTINCT dia_base FROM criacao_resumo_cep ORDER BY rowid DESC LIMIT 30;")).fetchall()
            dias = [r[0] for r in rows_d if r[0]]
        except Exception as e:
            print(f"Erro fallback dias em consultar_resumo_criacao: {e}")
            dias = []
    if not dias:
        return {"total_pedidos": 0, "total_sellers": 0, "clientes": [], "top_polos": []}

    dias_placeholders = ", ".join([f":d{i}" for i in range(len(dias))])
    params = {f"d{i}": d for i, d in enumerate(dias)}

    filter_cli = ""
    if cliente and cliente != "TODOS":
        filter_cli = " AND nome_cliente = :cli"
        params["cli"] = cliente

    filter_uf = ""
    if estado and estado != "TODAS":
        filter_uf = " AND estado = :uf"
        params["uf"] = estado.upper().strip()

    # Total geral e por cliente
    query_cli = f"""
        SELECT nome_cliente, SUM(total_pedidos) as volume
        FROM criacao_resumo_cep
        WHERE dia_base IN ({dias_placeholders}) {filter_cli} {filter_uf}
        GROUP BY nome_cliente
        ORDER BY volume DESC;
    """
    rows_cli = db.execute(text(query_cli), params).fetchall()
    total_geral = sum(r[1] or 0 for r in rows_cli)
    clientes_list = [{"cliente": r[0], "volume": r[1] or 0, "percentual": round(((r[1] or 0) / total_geral * 100), 1) if total_geral > 0 else 0} for r in rows_cli]

    # Top Polos (Cidade + Bairro)
    query_polos = f"""
        SELECT cidade, estado, bairro, SUM(total_pedidos) as volume, SUM(qtd_sellers) as sellers
        FROM criacao_resumo_cep
        WHERE dia_base IN ({dias_placeholders}) {filter_cli} {filter_uf}
        GROUP BY cidade, estado, bairro
        ORDER BY volume DESC
        LIMIT 15;
    """
    rows_polos = db.execute(text(query_polos), params).fetchall()
    polos_list = [{
        "cidade": r[0], "estado": r[1], "bairro": r[2] or "Geral",
        "volume": r[3] or 0, "sellers": r[4] or 0
    } for r in rows_polos]

    # Total Sellers
    query_sellers = f"""
        SELECT COUNT(DISTINCT merchant_id)
        FROM criacao_pedidos_historico
        WHERE dia_base IN ({dias_placeholders}) {filter_cli} {filter_uf};
    """
    try:
        total_sellers = db.execute(text(query_sellers), params).fetchone()[0] or 0
    except Exception:
        total_sellers = sum(p["sellers"] for p in polos_list)

    return {
        "total_pedidos": total_geral,
        "total_sellers": total_sellers,
        "clientes": clientes_list,
        "top_polos": polos_list
    }


# ─────────────────────────────────────────────────────────────────────────────
# ANÁLISE DE VIABILIDADE POR CIDADE/POLO
# ─────────────────────────────────────────────────────────────────────────────

def consultar_viabilidade_cidade(
    db: Session,
    cidade: str,
    estado: str,
    bairro: str = None,
    raio_km: float = 5.0,
    periodo_tipo: str = "Diário",
    rotulo: str = "latest"
) -> dict:
    """
    Analisa o volume potencial que um novo MD captaria em uma cidade/bairro,
    incluindo breakdown por cliente e top bairros do raio.
    """
    dias = obter_dias_periodo(db, periodo_tipo, rotulo)
    if not dias:
        # fallback: últimos 30 dias disponíveis
        try:
            rows_d = db.execute(text("SELECT DISTINCT dia_base FROM criacao_resumo_cep ORDER BY rowid DESC LIMIT 30;")).fetchall()
            dias = [r[0] for r in rows_d if r[0]]
        except Exception:
            dias = []
    if not dias:
        return {"volume_total": 0, "qtd_sellers": 0, "por_cliente": [], "top_bairros": [], "dias_analisados": 0}

    dias_ph = ", ".join([f":d{i}" for i in range(len(dias))])
    params: dict = {f"d{i}": d for i, d in enumerate(dias)}
    params["cidade"] = cidade.strip()
    params["estado"] = estado.strip().upper()

    filtro_bairro = ""
    if bairro and bairro.strip():
        filtro_bairro = " AND bairro = :bairro"
        params["bairro"] = bairro.strip()

    # Volume total e sellers na cidade/estado
    q_total = f"""
        SELECT SUM(total_pedidos), SUM(qtd_sellers)
        FROM criacao_resumo_cep
        WHERE dia_base IN ({dias_ph})
          AND cidade = :cidade AND estado = :estado
          {filtro_bairro};
    """
    row_total = db.execute(text(q_total), params).fetchone()
    volume_total = row_total[0] or 0
    qtd_sellers = row_total[1] or 0

    # Volume por cliente
    q_cli = f"""
        SELECT nome_cliente, SUM(total_pedidos) as vol
        FROM criacao_resumo_cep
        WHERE dia_base IN ({dias_ph})
          AND cidade = :cidade AND estado = :estado
          {filtro_bairro}
        GROUP BY nome_cliente
        ORDER BY vol DESC;
    """
    rows_cli = db.execute(text(q_cli), params).fetchall()
    por_cliente = [
        {"cliente": r[0], "volume": r[1] or 0,
         "percentual": round((r[1] or 0) / volume_total * 100, 1) if volume_total > 0 else 0}
        for r in rows_cli
    ]

    # Top bairros
    q_bairros = f"""
        SELECT bairro, SUM(total_pedidos) as vol, SUM(qtd_sellers) as sellers
        FROM criacao_resumo_cep
        WHERE dia_base IN ({dias_ph})
          AND cidade = :cidade AND estado = :estado
        GROUP BY bairro
        ORDER BY vol DESC
        LIMIT 10;
    """
    rows_bairros = db.execute(text(q_bairros), params).fetchall()
    top_bairros = [{"bairro": r[0] or "Geral", "volume": r[1] or 0, "sellers": r[2] or 0} for r in rows_bairros]

    # Média diária
    media_diaria = round(volume_total / len(dias), 1) if dias else 0

    return {
        "cidade": cidade,
        "estado": estado,
        "volume_total": volume_total,
        "media_diaria": media_diaria,
        "qtd_sellers": qtd_sellers,
        "por_cliente": por_cliente,
        "top_bairros": top_bairros,
        "dias_analisados": len(dias),
        "raio_km": raio_km
    }


# ─────────────────────────────────────────────────────────────────────────────
# ANÁLISE DE CRESCIMENTO POR POLO (SEMANA A SEMANA)
# ─────────────────────────────────────────────────────────────────────────────

def consultar_crescimento_polo(
    db: Session,
    cidade: str,
    estado: str,
    bairro: str = None
) -> dict:
    """
    Retorna a evolução semana a semana de pedidos criados para um polo,
    calculando taxa de crescimento e tendência.
    """
    params: dict = {"cidade": cidade.strip(), "estado": estado.strip().upper()}
    filtro_bairro = ""
    if bairro and bairro.strip():
        filtro_bairro = " AND bairro = :bairro"
        params["bairro"] = bairro.strip()

    q = f"""
        SELECT semana_base, SUM(total_pedidos) as vol, SUM(qtd_sellers) as sellers
        FROM criacao_resumo_cep
        WHERE cidade = :cidade AND estado = :estado
          {filtro_bairro}
          AND semana_base IS NOT NULL AND semana_base != ''
        GROUP BY semana_base
        ORDER BY semana_base ASC
        LIMIT 16;
    """
    rows = db.execute(text(q), params).fetchall()
    if not rows:
        return {"polo": cidade, "semanas": [], "crescimento_pct": 0, "tendencia": "SEM_DADOS"}

    semanas = [{"semana": r[0], "volume": r[1] or 0, "sellers": r[2] or 0} for r in rows]

    # Calcular taxa de crescimento (última vs penúltima semana)
    crescimento_pct = 0.0
    if len(semanas) >= 2:
        vol_atual = semanas[-1]["volume"]
        vol_anterior = semanas[-2]["volume"]
        if vol_anterior > 0:
            crescimento_pct = round((vol_atual - vol_anterior) / vol_anterior * 100, 1)

    # Tendência por regressão linear simples nos últimos 6 pontos
    ultimos = semanas[-6:]
    tendencia = "ESTAVEL"
    if len(ultimos) >= 3:
        n = len(ultimos)
        xs = list(range(n))
        ys = [s["volume"] for s in ultimos]
        mean_x = sum(xs) / n
        mean_y = sum(ys) / n
        num = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n))
        den = sum((xs[i] - mean_x) ** 2 for i in range(n))
        slope = num / den if den != 0 else 0
        if slope > mean_y * 0.03:
            tendencia = "CRESCENDO"
        elif slope < -mean_y * 0.03:
            tendencia = "CAINDO"

    return {
        "polo": f"{cidade}/{estado}" + (f" - {bairro}" if bairro else ""),
        "cidade": cidade,
        "estado": estado,
        "bairro": bairro or "",
        "semanas": semanas,
        "crescimento_pct": crescimento_pct,
        "tendencia": tendencia,
        "volume_atual": semanas[-1]["volume"] if semanas else 0
    }


# ─────────────────────────────────────────────────────────────────────────────
# CRUD — PROPOSTAS DE EXPANSÃO
# ─────────────────────────────────────────────────────────────────────────────

def listar_propostas(db: Session, status: str = None, estado: str = None) -> list:
    """Lista todas as propostas com filtros opcionais."""
    query = db.query(PropostaExpansao)
    if status and status != "TODAS":
        query = query.filter(PropostaExpansao.status == status)
    if estado and estado != "TODOS":
        query = query.filter(PropostaExpansao.estado == estado.upper())
    propostas = query.order_by(PropostaExpansao.id.desc()).all()
    result = []
    for p in propostas:
        d = {c.name: getattr(p, c.name) for c in p.__table__.columns}
        # Deserializar clientes_principais
        if d.get("clientes_principais"):
            try:
                d["clientes_principais"] = json.loads(d["clientes_principais"])
            except Exception:
                d["clientes_principais"] = []
        result.append(d)
    return result


def criar_proposta(db: Session, dados: dict) -> dict:
    """Cria uma nova proposta de expansão."""
    agora = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")
    clientes = dados.get("clientes_principais", [])
    proposta = PropostaExpansao(
        cidade=dados.get("cidade", ""),
        estado=dados.get("estado", "").upper(),
        bairro=dados.get("bairro", ""),
        cep_alvo=dados.get("cep_alvo", ""),
        volume_estimado=dados.get("volume_estimado", 0),
        qtd_sellers_estimada=dados.get("qtd_sellers_estimada", 0),
        distancia_md_mais_proximo=dados.get("distancia_md_mais_proximo"),
        md_mais_proximo=dados.get("md_mais_proximo"),
        clientes_principais=json.dumps(clientes, ensure_ascii=False) if clientes else None,
        justificativa=dados.get("justificativa", ""),
        status=dados.get("status", "Em Análise"),
        prioridade=dados.get("prioridade", "MEDIA"),
        criado_em=agora,
        atualizado_em=agora,
        criado_por=dados.get("criado_por", "Analista"),
        observacoes=dados.get("observacoes")
    )
    db.add(proposta)
    db.commit()
    db.refresh(proposta)
    d = {c.name: getattr(proposta, c.name) for c in proposta.__table__.columns}
    if d.get("clientes_principais"):
        try:
            d["clientes_principais"] = json.loads(d["clientes_principais"])
        except Exception:
            d["clientes_principais"] = []
    return d


def atualizar_proposta(db: Session, proposta_id: int, dados: dict) -> dict:
    """Atualiza campos de uma proposta existente (status, observações, etc.)."""
    proposta = db.query(PropostaExpansao).filter(PropostaExpansao.id == proposta_id).first()
    if not proposta:
        raise ValueError(f"Proposta {proposta_id} não encontrada.")
    agora = datetime.datetime.now().strftime("%d/%m/%Y %H:%M")
    campos_atualizaveis = [
        "status", "justificativa", "observacoes", "prioridade",
        "volume_estimado", "qtd_sellers_estimada", "cidade", "estado",
        "bairro", "cep_alvo", "md_mais_proximo", "distancia_md_mais_proximo"
    ]
    for campo in campos_atualizaveis:
        if campo in dados:
            setattr(proposta, campo, dados[campo])
    if "clientes_principais" in dados:
        proposta.clientes_principais = json.dumps(dados["clientes_principais"], ensure_ascii=False)
    proposta.atualizado_em = agora
    db.commit()
    db.refresh(proposta)
    d = {c.name: getattr(proposta, c.name) for c in proposta.__table__.columns}
    if d.get("clientes_principais"):
        try:
            d["clientes_principais"] = json.loads(d["clientes_principais"])
        except Exception:
            d["clientes_principais"] = []
    return d


def deletar_proposta(db: Session, proposta_id: int) -> bool:
    """Remove uma proposta pelo ID."""
    proposta = db.query(PropostaExpansao).filter(PropostaExpansao.id == proposta_id).first()
    if not proposta:
        return False
    db.delete(proposta)
    db.commit()
    return True


def simular_viabilidade_md(db: Session, cep: str, raio_km: float = 5.0) -> dict:
    cep_clean = re.sub(r'[^0-9]', '', cep)
    if len(cep_clean) != 8:
        raise ValueError("CEP inválido.")
    
    # 1. Geocodificação via AwesomeAPI
    resp = requests.get(f"https://cep.awesomeapi.com.br/json/{cep_clean}")
    if resp.status_code != 200:
        raise ValueError("CEP não encontrado ou erro na API.")
    data = resp.json()
    
    lat = float(data.get("lat", 0))
    lng = float(data.get("lng", 0))
    cidade = data.get("city", "")
    estado = data.get("state", "")
    bairro = data.get("district", "")
    endereco = data.get("address", "")
    
    if lat == 0 or lng == 0:
        raise ValueError("Não foi possível obter coordenadas exatas para este CEP.")
        
    # 2. Obter a demanda recente do Bairro / Cidade a partir de criacao_resumo_cep
    dias = obter_dias_periodo(db, "Diário", "latest")
    dia_ref = dias[0] if dias else ""
    
    query = """
        SELECT SUM(total_pedidos), SUM(qtd_sellers) 
        FROM criacao_resumo_cep 
        WHERE dia_base = :dia AND estado = :uf AND UPPER(cidade) = :cid 
    """
    params = {"dia": dia_ref, "uf": estado, "cid": cidade.upper()}
    
    # Busca por bairro exato, se existir na API
    if bairro:
        query_bairro = query + " AND UPPER(bairro) = :bairro"
        params_bairro = {**params, "bairro": bairro.upper()}
        row_demanda = db.execute(text(query_bairro), params_bairro).fetchone()
        
        # Se no encontrou pelo bairro, busca s pela cidade
        if not row_demanda or (row_demanda[0] is None and row_demanda[1] is None):
             row_demanda = db.execute(text(query), params).fetchone()
    else:
        row_demanda = db.execute(text(query), params).fetchone()
        
    total_pedidos = int(row_demanda[0] or 0)
    qtd_sellers = int(row_demanda[1] or 0)
    
    # 3. Analisar MDs vizinhos (Raio e Canibalização)
    rows_mds = db.execute(text("""
        SELECT md_codigo, nome_ponto, latitude, longitude, funcionando 
        FROM malha_coordenadas 
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL
    """)).fetchall()
    
    mds_proximos = []
    for r in rows_mds:
        md_lat, md_lng = r[2], r[3]
        dist = haversine_distance_km(lat, lng, md_lat, md_lng)
        if dist <= raio_km:
            mds_proximos.append({
                "codigo": r[0],
                "nome": r[1],
                "distancia_km": round(dist, 1),
                "status": r[4] or "ATIVADO"
            })
            
    # Ordenar por proximidade
    mds_proximos.sort(key=lambda x: x["distancia_km"])
    
    # 4. Avaliação e Score
    if len(mds_proximos) == 0:
        if total_pedidos >= 200:
            score = "VERDE"
            parecer = f"Oceano Azul! Alta demanda potencial ({total_pedidos} ped/dia) no polo sem nenhum MD num raio de {raio_km}km."
        elif total_pedidos >= 50:
            score = "AMARELO"
            parecer = f"Área livre, mas com demanda moderada ({total_pedidos} ped/dia). Pode não sustentar um ponto fixo ainda."
        else:
            score = "VERMELHO"
            parecer = f"Baixo volume de demanda ({total_pedidos} ped/dia), mesmo sem MD próximo. Risco alto de ociosidade."
    else:
        # Tem MDs no raio
        dist_mais_perto = mds_proximos[0]["distancia_km"]
        if dist_mais_perto < 1.5:
            score = "VERMELHO"
            parecer = f"Risco severo de canibalização! O MD '{mds_proximos[0]['nome']}' já está muito perto ({dist_mais_perto}km)."
        elif total_pedidos > 500:
             score = "AMARELO"
             parecer = f"O MD '{mds_proximos[0]['nome']}' está a {dist_mais_perto}km. Como a demanda da região é alta ({total_pedidos} ped/dia), a divisão de volume pode ser suportada."
        else:
             score = "VERMELHO"
             parecer = f"Demanda insuficiente ({total_pedidos} ped/dia) para abrir um ponto tão perto do MD '{mds_proximos[0]['nome']}' ({dist_mais_perto}km)."
             
    return {
        "status": "success",
        "score_viabilidade": score,
        "parecer_ia": parecer,
        "demanda_estimada": total_pedidos,
        "sellers_ativos": qtd_sellers,
        "mds_proximos": mds_proximos
    }


def processar_planilha_rotas_motoristas(file_path: str, data_operacao: str, semana_operacao: str, db: Session) -> dict:
    """Processa planilha diária de rotas de motoristas e MDs em São Paulo (lendo abas 'Rota da Semana' ou 'Todos os MDs')."""
    import pandas as pd

    # Inspeciona abas disponíveis
    excel = pd.ExcelFile(file_path)
    sheet_names = [s.strip() for s in excel.sheet_names]
    target_sheet = 0
    for target in ['Rota da Semana', 'Todos os MDs', 'Volumetria']:
        if target in sheet_names:
            target_sheet = target
            break

    try:
        df_raw = pd.read_excel(file_path, sheet_name=target_sheet, engine='calamine')
    except Exception:
        try:
            df_raw = pd.read_excel(file_path, sheet_name=target_sheet)
        except Exception:
            df_raw = pd.read_csv(file_path, sep=None, engine='python')

    df_raw.columns = [str(c).strip() for c in df_raw.columns]

    def achar_coluna(termos, default_idx=None):
        for c in df_raw.columns:
            c_low = str(c).lower().strip()
            if any(t in c_low for t in termos):
                return c
        if default_idx is not None and default_idx < len(df_raw.columns):
            return df_raw.columns[default_idx]
        return None

    col_md = achar_coluna(['md', 'codigo md', 'código md', 'ponto', 'iata', 'ponto de coleta'], 0)
    col_motorista = achar_coluna(['motorista', 'driver', 'nome motorista', 'nome do motorista', 'condutor'])
    col_placa = achar_coluna(['placa', 'veiculo', 'veículo', 'tipo veiculo', 'carro', 'van'])
    col_rota = achar_coluna(['rota', 'nome rota', 'linha', 'itinerario'])
    col_regiao = achar_coluna(['região', 'regiao', 'zona', 'polo'])
    col_cidade = achar_coluna(['cidade', 'municipio', 'município'])
    col_bairro = achar_coluna(['bairro', 'bairro/distrito'])
    col_janela1 = achar_coluna(['janela 1', 'janela1', 'abertura'])
    col_janela2 = achar_coluna(['janela 2', 'janela2', 'fechamento'])
    col_limite = achar_coluna(['horário limite', 'horario limite', 'limite'])
    col_rodizio = achar_coluna(['rodízio', 'rodizio'])
    col_media = achar_coluna(['media semana', 'média semana', 'volume médio', 'volume semanal'])
    col_sacas = achar_coluna(['qnt sacas a enviar', 'sacas a enviar', 'sacas'])

    df = df_raw.copy()
    df['md_codigo'] = df[col_md].astype(str).str.strip().str.upper() if col_md else "MD DESCONHECIDO"
    # Filtrar linhas inválidas (ex: cabeçalhos ou vazias)
    df = df[df['md_codigo'].str.startswith("MD-") | df['md_codigo'].str.startswith("SP-")]
    if df.empty:
        df = df_raw.copy()

    df['motorista_nome'] = df[col_motorista].astype(str).str.strip().str.title() if col_motorista else "Motorista Não Informado"
    df['placa'] = df[col_placa].astype(str).str.strip().str.upper() if col_placa else "N/A"
    df['horario_previsto'] = df[col_janela1].astype(str).str.strip() if col_janela1 else "Comercial (08h-18h)"
    df['cidade'] = df[col_cidade].astype(str).str.strip().str.title() if col_cidade else "São Paulo"
    df['bairro'] = df[col_bairro].astype(str).str.strip().str.title() if col_bairro else ""
    df['dia_base'] = data_operacao
    df['semana_base'] = semana_operacao
    df['estado'] = "SP"

    # Criar sequencia de paradas por motorista
    df['sequencia_parada'] = df.groupby('motorista_nome').cumcount() + 1
    df['status_coleta'] = "Agendada"

    df_clean = df[[
        'dia_base', 'semana_base', 'motorista_nome', 'placa', 'horario_previsto',
        'md_codigo', 'cidade', 'estado', 'bairro', 'sequencia_parada', 'status_coleta'
    ]].drop_duplicates()

    # Limpar prévios da mesma data
    try:
        db.execute(text("DELETE FROM rotas_motoristas_historico WHERE dia_base = :d;"), {"d": str(data_operacao)})
    except Exception:
        pass

    conn = db.connection()
    df_clean.to_sql('rotas_motoristas_historico', con=conn, if_exists='append', index=False)

    total_rotas = df_clean['motorista_nome'].nunique()
    total_mds = df_clean['md_codigo'].nunique()

    return {
        "status": "success",
        "dia_base": data_operacao,
        "aba_lida": str(target_sheet),
        "total_linhas": len(df_clean),
        "total_motoristas": total_rotas,
        "total_mds_escalados": total_mds
    }


    return {
        "cep_info": {
            "cidade": cidade,
            "estado": estado,
            "bairro": bairro,
            "endereco": endereco,
            "lat": lat,
            "lng": lng
        },
        "demanda": {
            "dia_base": dia_ref,
            "total_pedidos": total_pedidos,
            "qtd_sellers": qtd_sellers
        },
        "analise": {
            "raio_km": raio_km,
            "mds_no_raio": len(mds_proximos),
            "mds_proximos": mds_proximos[:5],
            "score": score,
            "parecer": parecer
        }
    }


def padronizar_status_operacional(status_raw: str, maneira_coleta: str = "", md_codigo: str = "") -> dict:
    st_low = remover_acentos_espacos(str(status_raw or ""))
    coleta_low = remover_acentos_espacos(str(maneira_coleta or ""))

    # 1. Alerta Crítico: Foi Recebido (sem localização definida)
    if "foirecebido" in st_low or "recebidosemlocal" in st_low or "semrastreio" in st_low:
        return {
            "status_normalizado": "Foi Recebido",
            "is_critico": True,
            "label_exibicao": "🚨 Foi Recebido (Sem Localização)"
        }

    # 2. Circuito Fechado
    if "circuitofechado" in st_low or "finalizado" in st_low or "despachadolastmile" in st_low or "entreguehub" in st_low:
        return {
            "status_normalizado": "Circuito Fechado",
            "is_critico": False,
            "label_exibicao": "🟢 Circuito Fechado"
        }

    # 3. Descarregamento
    if "descarregamento" in st_low or "descarregado" in st_low or "recebidonohub" in st_low:
        return {
            "status_normalizado": "Descarregamento",
            "is_critico": False,
            "label_exibicao": "🏢 Descarregamento (No HUB)"
        }

    # 4. Carregamento
    if "carregamento" in st_low or "carregado" in st_low or "emtransito" in st_low or "motoristacoletou" in st_low:
        return {
            "status_normalizado": "Carregamento",
            "is_critico": False,
            "label_exibicao": "🚛 Carregamento (Motorista)"
        }

    # 5. Coletado / Saca Selada
    if "sacaselada" in st_low or "coletado" in st_low or "recebidomd" in st_low or "nomd" in st_low:
        return {
            "status_normalizado": "Coletado / Saca Selada",
            "is_critico": False,
            "label_exibicao": "📦 Coletado / Saca Selada"
        }

    # Fallback
    return {
        "status_normalizado": str(status_raw or "Pendente").title(),
        "is_critico": False,
        "label_exibicao": str(status_raw or "Pendente")
    }


def classificar_d2d(cli_id: str, cli_nome: str, maneira_coleta: str = "", tipo_pedido: str = "") -> bool:
    combined = remover_acentos_espacos(f"{cli_id} {cli_nome} {maneira_coleta} {tipo_pedido}")
    return "d2d" in combined or "doortodoor" in combined or "direto" in combined


def garantir_tabela_d0_live(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS pacotes_d0_live (
            barcode TEXT PRIMARY KEY,
            dia_base TEXT,
            hora_ultima_bipagem TEXT,
            md_codigo TEXT,
            regional TEXT,
            cidade TEXT,
            cliente TEXT,
            tipo_operacao TEXT,
            status_atual TEXT,
            status_anterior TEXT,
            hora_primeira_bipagem TEXT,
            is_fora_sla INTEGER DEFAULT 0,
            is_status_critico INTEGER DEFAULT 0,
            is_anomalia_pickup_md INTEGER DEFAULT 0,
            is_d2d INTEGER DEFAULT 0,
            data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """))
    db.commit()


def zerar_base_operacional(db: Session) -> dict:
    """Limpa todas as tabelas operacionais para recomeço do zero, preservando o Mapa de MDs e configurações."""
    tabelas = [
        "pacotes_d0_live",
        "detalhe_md_historico",
        "detalhe_pickup_historico",
        "criacao_pedidos_historico",
        "historico_torre",
        "detalhe_cliente_historico",
        "detalhe_lacres_historico",
        "detalhe_pico_historico",
        "detalhe_cliente_md_historico"
    ]
    for tab in tabelas:
        try:
            db.execute(text(f"DELETE FROM {tab};"))
        except Exception:
            pass
    db.commit()
    return {"status": "success", "message": "Base operacional zerada com sucesso! Pronto para nova alimentação do zero."}


def processar_ingestao_incremental_d0(db: Session, df_raw: pd.DataFrame, dia_operacao: str) -> dict:
    garantir_tabela_d0_live(db)
    df_mapped = mapear_colunas(df_raw)
    
    if 'barcode' not in df_mapped.columns or df_mapped['barcode'].dropna().empty:
        df_mapped['barcode'] = [f"PKG-{i}" for i in range(len(df_mapped))]

    ins: int = 0
    upd: int = 0
    criticos: int = 0
    anomalias_pickup_md: int = 0
    total_d2d: int = 0

    from datetime import datetime
    now_str = datetime.now().strftime("%H:%M:%S")

    for _, row in df_mapped.iterrows():
        bcode = str(row.get('barcode') or '').strip().upper()
        if not bcode or bcode == 'NAN': continue

        st_raw = row.get('status') or ''
        coleta_raw = row.get('maneira_coleta') or ''
        md_code = str(row.get('md') or '').strip().upper()
        hora_bip = str(row.get('tempo_coleta') or now_str).strip()
        cli_id = str(row.get('id_cliente') or '').strip()
        tipo_ped = str(row.get('tipo_pedido') or '').strip()

        # Classification
        info_st = padronizar_status_operacional(st_raw, coleta_raw, md_code)
        st_norm = info_st["status_normalizado"]
        is_crit = 1 if info_st["is_critico"] else 0

        # Modalidade & D2D
        coleta_clean = remover_acentos_espacos(str(coleta_raw))
        is_pickup = "pickup" in coleta_clean or "pick" in coleta_clean or "seller" in coleta_clean
        
        is_d2d = 1 if classificar_d2d(cli_id, str(row.get('id_cliente') or ''), coleta_raw, tipo_ped) else 0
        if is_d2d: total_d2d += 1

        tipo_op = "D2D" if is_d2d else ("PICKUP" if is_pickup else "DROPOFF")

        # Cross-modal anomaly: Pick-up order dropped in MD
        is_anomalia = 1 if (is_pickup and md_code and md_code not in ["", "NAN", "N/A"]) else 0

        # SLA calculation (08h-18h)
        sla_res = classificar_sla(hora_bip)
        is_fora_sla = 1 if "Fora do SLA" in sla_res else 0

        if is_crit: criticos += 1
        if is_anomalia: anomalias_pickup_md += 1

        # Check existing row
        existing = db.execute(text("SELECT status_atual, hora_primeira_bipagem FROM pacotes_d0_live WHERE barcode = :b"), {"b": bcode}).fetchone()

        if existing:
            st_ant = existing[0]
            db.execute(text("""
                UPDATE pacotes_d0_live SET
                    dia_base = :dia,
                    hora_ultima_bipagem = :hora,
                    md_codigo = :md,
                    regional = :reg,
                    cidade = :cid,
                    cliente = :cli,
                    tipo_operacao = :top,
                    status_atual = :st_curr,
                    status_anterior = :st_ant,
                    is_fora_sla = :sla,
                    is_status_critico = :crit,
                    is_anomalia_pickup_md = :anom,
                    is_d2d = :d2d,
                    data_atualizacao = CURRENT_TIMESTAMP
                WHERE barcode = :b
            """), {
                "b": bcode,
                "dia": dia_operacao,
                "hora": hora_bip,
                "md": md_code,
                "reg": str(row.get('estado') or 'SP').upper(),
                "cid": str(row.get('cidade') or 'N/A').title(),
                "cli": str(row.get('id_cliente') or 'Marketplace'),
                "top": tipo_op,
                "st_curr": st_norm,
                "st_ant": st_ant,
                "sla": is_fora_sla,
                "crit": is_crit,
                "anom": is_anomalia,
                "d2d": is_d2d
            })
            upd += 1
        else:
            db.execute(text("""
                INSERT INTO pacotes_d0_live (
                    barcode, dia_base, hora_ultima_bipagem, md_codigo, regional, cidade, cliente,
                    tipo_operacao, status_atual, status_anterior, hora_primeira_bipagem, is_fora_sla,
                    is_status_critico, is_anomalia_pickup_md, is_d2d
                ) VALUES (
                    :b, :dia, :hora, :md, :reg, :cid, :cli,
                    :top, :st_curr, :st_curr, :hora, :sla,
                    :crit, :anom, :d2d
                )
            """), {
                "b": bcode,
                "dia": dia_operacao,
                "hora": hora_bip,
                "md": md_code,
                "reg": str(row.get('estado') or 'SP').upper(),
                "cid": str(row.get('cidade') or 'N/A').title(),
                "cli": str(row.get('id_cliente') or 'Marketplace'),
                "top": tipo_op,
                "st_curr": st_norm,
                "sla": is_fora_sla,
                "crit": is_crit,
                "anom": is_anomalia,
                "d2d": is_d2d
            })
            ins += 1

    db.commit()
    return {
        "status": "success",
        "dia_operacao": dia_operacao,
        "total_linhas": len(df_mapped),
        "inseridos_novos": ins,
        "atualizados_status": upd,
        "total_d2d": total_d2d,
        "alertas_criticos_foi_recebido": criticos,
        "alertas_pickup_em_md": anomalias_pickup_md
    }


