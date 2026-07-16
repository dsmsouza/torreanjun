import os
import re
import datetime
import unicodedata
import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session
from models.models import HistoricoTorre, DetalheMDHistorico, DetalheClienteHistorico, DetalheLacresHistorico, JustificativasDiarias, MDObservacoesFixas, AvaliacaoMD

def remover_acentos_espacos(txt: str) -> str:
    if not txt:
        return ""
    # Normalize unicode characters to decompose accents
    nfkd_form = unicodedata.normalize('NFKD', txt)
    txt_clean = "".join([c for c in nfkd_form if not unicodedata.combining(c)])
    # Remove spaces and non-alphanumeric chars
    return re.sub(r'[^a-zA-Z0-9]', '', txt_clean)

def mapear_colunas(df: pd.DataFrame) -> pd.DataFrame:
    col_map = {}
    for col in df.columns:
        col_clean = remover_acentos_espacos(str(col)).lower()
        if 'barcode' in col_clean or 'codigo' in col_clean or 'barras' in col_clean:
            col_map[col] = 'barcode'
        elif 'status' in col_clean:
            col_map[col] = 'status'
        elif 'saca' in col_clean:
            col_map[col] = 'saca'
        elif 'md' in col_clean or 'ponto' in col_clean or 'colecao' in col_clean:
            col_map[col] = 'md'
        elif 'cliente' in col_clean:
            if 'id' in col_clean or 'no' in col_clean or 'num' in col_clean:
                col_map[col] = 'id_cliente'
            else:
                col_map[col] = 'nome_cliente'

        elif 'regional' in col_clean:
            col_map[col] = 'regional'
        elif 'cidade' in col_clean or 'origem' in col_clean:
            col_map[col] = 'cidade'
        elif 'volume' in col_clean or 'total' in col_clean or 'pacotes' in col_clean:
            col_map[col] = 'volume'
        elif 'tempo' in col_clean or 'coleta' in col_clean or 'data' in col_clean:
            col_map[col] = 'tempo_coleta'
    return df.rename(columns=col_map)

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

def buscar_datas_e_semanas(db: Session):
    try:
        # Get unique dias order by date descending (convert string date to sortable date if possible, otherwise sort string)
        # Note: SQLite date strings in DD/MM/YYYY can be sorted by parsing
        dias_raw = db.execute(text("SELECT DISTINCT dia_base FROM historico_torre;")).fetchall()
        semanas_raw = db.execute(text("SELECT DISTINCT semana_base FROM detalhe_md_historico WHERE semana_base IS NOT NULL;")).fetchall()
        
        dias = [row[0] for row in dias_raw if row[0]]
        semanas = [row[0] for row in semanas_raw if row[0]]
        
        # Simple helper to sort DD/MM/YYYY dates
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
    if periodo_tipo == "Diário":
        return [rotulo]
    elif periodo_tipo == "Semanal":
        # Get all days matching this week
        rows = db.execute(
            text("SELECT DISTINCT dia_base FROM detalhe_md_historico WHERE semana_base = :ref"), 
            {"ref": rotulo}
        ).fetchall()
        return [row[0] for row in rows if row[0]]
    elif periodo_tipo == "Mensal":
        # rotulo format: "YYYY-MM" (e.g. "2026-06")
        # Find all dia_base that belong to this month
        # dia_base is stored as "DD/MM/YYYY", so we check if the MM/YYYY part matches
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

def carregar_resumo_geral(db: Session, periodo_tipo: str, rotulo: str, dt_inicio: str = None, dt_fim: str = None, regional: str = None, regra5k: bool = False):
    dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
    if not dias:
        return {
            "volume_total": 0, "volume_backlog": 0, "taxa_coleta": 0.0, "taxa_backlog": 0.0, "erros_lacre": 0, "regionais": []
        }
    
    # 1. Calculate general overview by aggregating detalhe_md_historico
    # We query: md, regional, total, backlog, erros_md, etc.
    dias_placeholders = ", ".join([f":d{i}" for i in range(len(dias))])
    params = {f"d{i}": d for i, d in enumerate(dias)}
    
    # Filter by regional if provided
    reg_cond = ""
    if regional:
        reg_cond = "AND detalhe_md_historico.regional = :regional"
        params["regional"] = regional
        
    filter_cond = ""
    if regra5k:
        excluded_mds = obter_mds_excluidos_regra5k(db, dias)
        if excluded_mds:
            ex_placeholders = ", ".join([f":ex{i}" for i in range(len(excluded_mds))])
            for i, md in enumerate(excluded_mds):
                params[f"ex{i}"] = md
            filter_cond = f"AND detalhe_md_historico.md NOT IN ({ex_placeholders})"

    query_str = f"""
        SELECT regional, SUM(total) as vol_tot, SUM(backlog) as vol_back
        FROM detalhe_md_historico 
        WHERE dia_base IN ({dias_placeholders}) {reg_cond} {filter_cond}
        GROUP BY regional;
    """
    
    rows = db.execute(text(query_str), params).fetchall()
    
    regionais_data = []
    tot_volume = 0
    tot_backlog = 0
    
    # Calculate seal errors (erros_lacre) from detalhe_lacres_historico
    query_lacres = f"""
        SELECT regional, COUNT(DISTINCT saca) as total_erros
        FROM detalhe_lacres_historico
        WHERE dia_base IN ({dias_placeholders})
    """
    # Simple append of regional filter to query_lacres params
    lacres_params = {f"d{i}": d for i, d in enumerate(dias)}
    reg_lacres_cond = ""
    if regional:
        reg_lacres_cond = "AND regional = :regional"
        lacres_params["regional"] = regional
    query_lacres += f" {reg_lacres_cond} GROUP BY regional;"
    
    lacres_rows = db.execute(text(query_lacres), lacres_params).fetchall()
    lacres_map = {row[0]: row[1] for row in lacres_rows if row[0]}
    
    tot_erros_lacre = sum(lacres_map.values())
    
    for row in rows:
        reg = row[0]
        if not reg:
            continue
        v_tot = row[1] or 0
        v_back = row[2] or 0
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
            "status_saude": eval_map.get(md_key, "Aprovado"), # default to Aprovado
            "observacao_fixa": obs_map.get(md_key, "")
        })
        
    return ranking

def carregar_ranking_clientes(db: Session, periodo_tipo: str, rotulo: str, dt_inicio: str = None, dt_fim: str = None, regional: str = None):
    dias = obter_dias_periodo(db, periodo_tipo, rotulo, dt_inicio, dt_fim)
    if not dias:
        return []
        
    dias_placeholders = ", ".join([f":d{i}" for i in range(len(dias))])
    params = {f"d{i}": d for i, d in enumerate(dias)}
    
    # Note: If regional is specified, we must group from detalhe_cliente_md_historico
    # which contains details linking client, md, and regional!
    if regional:
        params["regional"] = regional
        query_str = f"""
            SELECT nome_cliente, SUM(total_pacotes) as total_pacotes
            FROM detalhe_cliente_md_historico
            WHERE dia_base IN ({dias_placeholders}) AND regional = :regional
            GROUP BY nome_cliente
            ORDER BY total_pacotes DESC;
        """
        rows = db.execute(text(query_str), params).fetchall()
        
        # Note: detalhe_cliente_md_historico does not contain backlog. We can compute/estimate 
        # or load backlogs. Let's return client total volume and 0 backlog since backlog is at global client level,
        # or estimate it. Let's return backlog as 0 or calculate the rates safely.
        ranking = []
        for row in rows:
            ranking.append({
                "nome_cliente": row[0],
                "total_pacotes": row[1] or 0,
                "total_backlog": 0,
                "taxa_coleta": 100.0
            })
        return ranking
    else:
        query_str = f"""
            SELECT nome_cliente, SUM(total_pacotes) as total_pacotes, SUM(total_backlog) as total_backlog
            FROM detalhe_cliente_historico
            WHERE dia_base IN ({dias_placeholders})
            GROUP BY nome_cliente
            ORDER BY total_pacotes DESC;
        """
        rows = db.execute(text(query_str), params).fetchall()
        
        ranking = []
        for row in rows:
            tot = row[1] or 0
            back = row[2] or 0
            t_col = ((tot - back) / tot * 100) if tot > 0 else 100.0
            
            ranking.append({
                "nome_cliente": row[0],
                "total_pacotes": tot,
                "total_backlog": back,
                "taxa_coleta": round(t_col, 2)
            })
        return ranking

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

def processar_ingestao_planilhas(
    db: Session,
    data_operacao: str,
    num_semana: str,
    file_mds_bytes: bytes,
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
        if s in ['saco selado', 'coletado']: return 'backlog'
        elif 'descarregamento' in s or 'descarrega' in s: return 'descarregamento'
        elif 'carregamento' in s or 'carrega' in s: return 'carregamento'
        return 'outro'

    def classificar_cliente(valor):
        mapa_clientes = {24147: 'SHEIN D2D', 24005: 'SHEIN', 24009: 'KWAI', 24324: 'TIKTOK', 24189: 'TEMU D2D'}
        try: return mapa_clientes.get(int(float(valor)), 'OUTROS')
        except: return 'NÃO INFORMADO'

    # 1. Read files into memory
    df_ref = pd.read_excel(io.BytesIO(file_mds_bytes), engine='calamine')
    df_ref.columns = [str(c).strip().upper() for c in df_ref.columns]
    
    df_ref.rename(columns={'MD': 'md', 'ESTADO': 'estado', 'REGIONAL': 'regional', 'CIDADE': 'cidade', 'MUNICÍPIO': 'cidade', 'DIVISÃO': 'divisao', 'DIVISAO': 'divisao'}, inplace=True)
    df_ref['md'] = df_ref['md'].astype(str).str.strip().str.upper()
    if 'ESTADO' in df_ref.columns:
        df_ref['estado'] = df_ref['estado'].apply(padronizar_uf)
        
    if 'divisao' not in df_ref.columns:
        df_ref['divisao'] = None
        
    if 'divisao' in df_ref.columns:
        # Normalize and strip to ensure clean matches
        div_str = df_ref['divisao'].astype(str).str.strip().str.lower()
        is_jau = div_str.isin(['sp jau', 'sp birigui', 'jaú', 'jau', 'sp birigui'])
        is_franca = div_str.isin(['sp franca', 'franca', 'sp franca'])
        df_ref.loc[is_jau, 'regional'] = 'SP JAU'
        df_ref.loc[is_franca, 'regional'] = 'SP FRANCA'
        
    df_mds_ref = df_ref.drop_duplicates(subset=['md'])

    df_operacional = pd.read_excel(io.BytesIO(file_operacional_bytes), engine='calamine')
    df_operacional = mapear_colunas(df_operacional)

    
    # 2. Process
    df_operacional['md'] = df_operacional['md'].astype(str).str.strip().str.upper()
    df_operacional['categoria'] = df_operacional['status'].apply(classificar_status)
    
    if 'tempo_coleta' in df_operacional.columns:
        df_operacional['dt'] = pd.to_datetime(df_operacional['tempo_coleta'], errors='coerce')
        df_operacional['hora_bipagem'] = df_operacional['dt'].dt.hour
    else:
        df_operacional['hora_bipagem'] = 12

    cols_ref = ['md', 'regional', 'estado', 'divisao']
    if 'cidade' in df_mds_ref.columns:
        cols_ref.append('cidade')
        
    if 'cidade' in df_operacional.columns:
        df_operacional = df_operacional.drop(columns=['cidade'])
        
    df_filiados = df_operacional.merge(df_mds_ref[cols_ref], on='md', how='inner')
    df_filiados['nome_cliente'] = df_filiados['id_cliente'].apply(classificar_cliente)
    
    if 'cidade' not in df_filiados.columns:
        df_filiados['cidade'] = 'NÃO CADASTRADA'
    df_filiados['cidade'] = df_filiados['cidade'].fillna('NÃO CADASTRADA').astype(str).str.strip().str.upper()
    df_filiados['divisao'] = df_filiados['divisao'].fillna('Sem Divisão').astype(str).str.strip()

    saca_str = df_filiados['saca'].fillna('').astype(str).str.strip().str.upper()
    df_lacres_final = df_filiados[(~saca_str.str.startswith(('F', 'D'))) & (saca_str != '')][['md', 'regional', 'saca', 'barcode']].drop_duplicates()
    df_lacres_final['dia_base'] = str(data_operacao)

    df_pico_final = df_filiados.dropna(subset=['hora_bipagem']).groupby(['md', 'regional', 'hora_bipagem']).size().reset_index(name='volume')
    df_pico_final['dia_base'] = str(data_operacao)

    resumo_md = df_filiados.groupby(['md', 'regional', 'estado', 'cidade', 'divisao']).agg(
        total=('barcode', 'count'), 
        backlog=('categoria', lambda x: (x == 'backlog').sum()), 
        carregamento=('categoria', lambda x: (x == 'carregamento').sum()), 
        descarregamento=('categoria', lambda x: (x == 'descarregamento').sum())
    ).reset_index()
    
    resumo_md['erros_md'] = resumo_md['md'].map(df_lacres_final.groupby('md')['saca'].nunique()).fillna(0).astype(int)
    resumo_md['taxa_coleta'] = (resumo_md['total'] - resumo_md['backlog']) / resumo_md['total']
    resumo_md['dia_base'] = str(data_operacao)

    resumo_cliente = df_filiados.groupby('nome_cliente').agg(total_pacotes=('barcode', 'count'), total_backlog=('categoria', lambda x: (x == 'backlog').sum())).reset_index()
    resumo_cliente['taxa_coleta'] = (resumo_cliente['total_pacotes'] - resumo_cliente['total_backlog']) / resumo_cliente['total_pacotes']
    resumo_cliente['dia_base'] = str(data_operacao)

    resumo_cliente_md = df_filiados.groupby(['nome_cliente', 'md', 'regional']).agg(total_pacotes=('barcode', 'count')).reset_index()
    resumo_cliente_md['dia_base'] = str(data_operacao)
    resumo_cliente_md['semana_base'] = str(semana_operacao)

    total_len = len(df_filiados) if len(df_filiados) > 0 else 1
    
    df_geral = pd.DataFrame([{
        "dia_base": str(data_operacao), 
        "volume_total": len(df_filiados), 
        "volume_backlog": int(resumo_md['backlog'].sum()), 
        "taxa_coleta": (len(df_filiados) - int(resumo_md['backlog'].sum())) / total_len, 
        "taxa_backlog": int(resumo_md['backlog'].sum()) / total_len, 
        "erros_lacre": int(df_lacres_final['saca'].nunique())
    }])

    df_geral['semana_base'] = str(semana_operacao)
    resumo_md['semana_base'] = str(semana_operacao)
    resumo_cliente['semana_base'] = str(semana_operacao)
    
    # 3. Clean existing operational date data
    for table_name in [
        'historico_torre', 'detalhe_md_historico', 'detalhe_cliente_historico', 
        'detalhe_pico_historico', 'detalhe_lacres_historico', 'detalhe_cliente_md_historico'
    ]:
        db.execute(text(f"DELETE FROM {table_name} WHERE dia_base = :d;"), {"d": str(data_operacao)})
    
    # 4. Save into SQLite
    conn = db.connection()
    df_geral.to_sql('historico_torre', con=conn, if_exists='append', index=False)
    resumo_md.to_sql('detalhe_md_historico', con=conn, if_exists='append', index=False)
    resumo_cliente.to_sql('detalhe_cliente_historico', con=conn, if_exists='append', index=False)
    df_pico_final.to_sql('detalhe_pico_historico', con=conn, if_exists='append', index=False)
    df_lacres_final.to_sql('detalhe_lacres_historico', con=conn, if_exists='append', index=False)
    resumo_cliente_md.to_sql('detalhe_cliente_md_historico', con=conn, if_exists='append', index=False)
    
    db.commit()
    
    return {
        "status": "success",
        "message": f"Ingestão concluída! {len(df_filiados):,} linhas integradas.",
        "semana": semana_operacao
    }

