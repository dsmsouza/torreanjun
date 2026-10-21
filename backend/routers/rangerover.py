from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from database.connection import get_db
from datetime import datetime
from services import operacional as op_service

router = APIRouter(
    prefix="/api/rangerover", 
    tags=["Rangerover"]
)

@router.get("/")
def get_rangerover_data(
    data_operacao: str = Query(..., description="Data da operação (DD/MM/YYYY)"),
    db: Session = Depends(get_db)
):
    try:
        # Fetch data from auditoria_coleta
        query_str = """
            SELECT md, regional, placa, motorista, entrada, saida, confirmador_entrada, confirmador_saida, qtd_sacos, qtd_votos, observacao, status_coleta, pacotes_atrasados, ultimo_pacote_hora, ultimo_pacote_barcode
            FROM auditoria_coleta 
            WHERE dia_base = :data
        """
        rows = db.execute(text(query_str), {"data": data_operacao}).fetchall()
        
        result = []
        for row in rows:
            md, regional, placa, motorista, entrada, saida, conf_ent, conf_sai, sacos, votos, obs, status_coleta, pacotes_atrasados, ultimo_pacote_hora, ultimo_pacote_barcode = row
                
            result.append({
                "md": md,
                "regional": regional,
                "placa": placa,
                "motorista": motorista,
                "entrada": entrada,
                "saida": saida,
                "confirmador_entrada": conf_ent,
                "confirmador_saida": conf_sai,
                "qtd_sacos": sacos,
                "qtd_votos": votos,
                "observacao": obs,
                "status": status_coleta,
                "pacotes_atrasados": pacotes_atrasados,
                "ultimo_pacote_hora": ultimo_pacote_hora,
                "ultimo_pacote_barcode": ultimo_pacote_barcode
            })
            
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/ofensores-pos-coleta")
def get_ofensores_pos_coleta(
    data_operacao: str = Query(..., description="Data da operação (DD/MM/YYYY)"),
    regional: str = Query(None, description="Filtrar por regional"),
    db: Session = Depends(get_db)
):
    try:
        params = {"data": data_operacao}
        regional_cond = ""
        if regional and regional != "TODAS":
            regional_cond = "AND regional = :regional"
            params["regional"] = regional
            
        query_str = f"""
            SELECT 
                md, 
                regional, 
                SUM(pacotes_atrasados) as total_atrasados,
                MAX(ultimo_pacote_hora) as ultima_hora,
                MAX(saida) as hora_saida_carro,
                MAX(ultimo_pacote_barcode) as ultimo_barcode
            FROM auditoria_coleta 
            WHERE dia_base = :data 
              AND status_coleta = 'Bipagem Pós-Coleta'
              {regional_cond}
            GROUP BY md, regional
            ORDER BY total_atrasados DESC
        """
        rows = db.execute(text(query_str), params).fetchall()
        
        result = []
        for row in rows:
            md, reg, atrasados, ultima_hora, saida, barcode = row
            result.append({
                "md": md,
                "regional": reg,
                "pacotes_atrasados": atrasados or 0,
                "ultima_hora_bipagem": ultima_hora,
                "hora_saida_carro": saida,
                "ultimo_barcode": barcode
            })
            
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/anomalias")
def get_anomalias_coleta(
    periodo_tipo: str = Query("Diário", description="Tipo de período (Diário, Semanal, Mensal, Período)"),
    data_operacao: str = Query(..., description="Data da operação (DD/MM/YYYY) ou Rótulo"),
    dt_inicio: Optional[str] = Query(None),
    dt_fim: Optional[str] = Query(None),
    regional: str = Query(None, description="Filtrar por regional"),
    tipo_anomalia: str = Query("TODAS", description="Tipo de anomalia (POS_COLETA, NAO_COLETA, ERRO_OP, TODAS)"),
    db: Session = Depends(get_db)
):
    try:
        dias = op_service.obter_dias_periodo(db, periodo_tipo, data_operacao, dt_inicio, dt_fim)
        if not dias:
            return []
            
        placeholders = ', '.join([f"'{d}'" for d in dias])
        
        params = {}
        regional_cond = ""
        if regional and regional != "TODAS":
            regional_cond = "AND a.regional = :regional"
            params["regional"] = regional
            
        tipo_cond = ""
        if tipo_anomalia == "POS_COLETA":
            tipo_cond = "AND a.status_coleta = 'Bipagem Pós-Coleta'"
        elif tipo_anomalia == "NAO_COLETA":
            tipo_cond = "AND a.status_coleta = 'Não Teve Coleta'"
        elif tipo_anomalia == "ERRO_OP":
            tipo_cond = "AND a.status_coleta LIKE 'Erro Op%'"
        elif tipo_anomalia == "TODAS":
            tipo_cond = "AND a.status_coleta NOT IN ('Coleta Normal', 'N/A (Sem Carga)', 'Sem Registro (Vazio)')"

        query_str = f"""
            SELECT 
                a.md, 
                a.regional, 
                a.status_coleta,
                SUM(a.pacotes_atrasados) as total_atrasados,
                MAX(a.ultimo_pacote_hora) as ultima_hora,
                MAX(a.saida) as hora_saida_carro,
                MAX(a.ultimo_pacote_barcode) as ultimo_barcode,
                MAX(CAST(d.backlog AS INTEGER)) as backlog_restante,
                COUNT(DISTINCT a.dia_base) as qtd_dias,
                GROUP_CONCAT(SUBSTR(a.dia_base, 1, 5) || ' (' || COALESCE(a.pacotes_atrasados, 0) || ' pts)', ', ') as detalhes_dias
            FROM auditoria_coleta a
            LEFT JOIN detalhe_md_historico d ON a.md = d.md AND a.dia_base = d.dia_base
            WHERE a.dia_base IN ({placeholders}) 
              {regional_cond}
              {tipo_cond}
            GROUP BY a.md, a.regional, a.status_coleta
            ORDER BY total_atrasados DESC, backlog_restante DESC
        """
        rows = db.execute(text(query_str), params).fetchall()
        
        # Compute historical offenses relative to data_operacao
        try:
            ref_dt = datetime.strptime(data_operacao, "%d/%m/%Y")
        except ValueError:
            ref_dt = datetime.now()
            
        hist_query = "SELECT md, dia_base FROM auditoria_coleta WHERE status_coleta NOT IN ('Coleta Normal', 'N/A (Sem Carga)', 'Sem Registro (Vazio)') OR (status_coleta = 'Coleta Normal' AND pacotes_atrasados > 0)"
        hist_rows = db.execute(text(hist_query)).fetchall()
        
        md_history = {}
        for h_md, h_dia in hist_rows:
            if not h_dia: continue
            try:
                dt = datetime.strptime(h_dia, "%d/%m/%Y")
                diff_days = (ref_dt - dt).days
                if diff_days < 0: continue # future dates don't count
                
                if h_md not in md_history:
                    md_history[h_md] = {"semana": 0, "mes": 0}
                    
                if diff_days <= 7:
                    md_history[h_md]["semana"] += 1
                if diff_days <= 30:
                    md_history[h_md]["mes"] += 1
            except ValueError:
                pass
        
        result = []
        for row in rows:
            md, reg, status, atrasados, ultima_hora, saida, barcode, backlog, qtd_dias, detalhes_dias = row
            
            tipo_anomalia_str = "Desconhecida"
            if status == "Bipagem Pós-Coleta":
                tipo_anomalia_str = "Bipagem Pós-Coleta"
            elif status == "Não Teve Coleta":
                tipo_anomalia_str = "Não Teve Coleta"
            elif status and "Erro Op" in status:
                tipo_anomalia_str = status

            result.append({
                "md": md,
                "regional": reg,
                "status_coleta": status,
                "tipo_anomalia": tipo_anomalia_str,
                "pacotes_atrasados": atrasados or 0,
                "ultima_hora_bipagem": ultima_hora,
                "hora_saida_carro": saida,
                "ultimo_barcode": barcode,
                "backlog_restante": backlog or 0,
                "historico_semana": md_history.get(md, {}).get("semana", 0),
                "historico_mes": md_history.get(md, {}).get("mes", 0),
                "dias_falha": qtd_dias or 0,
                "detalhes_dias": detalhes_dias or ""
            })
            
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/anomalias/{md}/historico")
def get_md_historico(
    md: str,
    data_operacao: str = Query(..., description="Data de referência (DD/MM/YYYY)"),
    tipo_anomalia: str = Query("TODAS"),
    db: Session = Depends(get_db)
):
    try:
        from datetime import datetime, timedelta
        
        try:
            ref_dt = datetime.strptime(data_operacao, "%d/%m/%Y")
        except ValueError:
            ref_dt = datetime.now()
            
        # Generate last 7 days strings
        last_7_days_dts = [ref_dt - timedelta(days=i) for i in range(6, -1, -1)]
        days_strs = [dt.strftime("%d/%m/%Y") for dt in last_7_days_dts]
        
        placeholders = ', '.join([f"'{d}'" for d in days_strs])
        
        tipo_cond = ""
        if tipo_anomalia == "POS_COLETA":
            tipo_cond = "AND a.status_coleta = 'Bipagem Pós-Coleta'"
        elif tipo_anomalia == "NAO_COLETA":
            tipo_cond = "AND a.status_coleta = 'Não Teve Coleta'"
        elif tipo_anomalia == "ERRO_OP":
            tipo_cond = "AND a.status_coleta LIKE 'Erro Op%'"
        elif tipo_anomalia == "TODAS":
            tipo_cond = "AND a.status_coleta NOT IN ('Coleta Normal', 'N/A (Sem Carga)', 'Sem Registro (Vazio)')"

        query = f"""
            SELECT 
                a.dia_base,
                SUM(a.pacotes_atrasados) as atrasados,
                MAX(CAST(d.backlog AS INTEGER)) as backlog
            FROM auditoria_coleta a
            LEFT JOIN detalhe_md_historico d ON a.md = d.md AND a.dia_base = d.dia_base
            WHERE a.md = :md 
              AND a.dia_base IN ({placeholders})
              {tipo_cond}
            GROUP BY a.dia_base
        """
        
        rows = db.execute(text(query), {"md": md}).fetchall()
        
        # Map results
        db_map = {}
        for r in rows:
            dia, atrasados, backlog = r
            db_map[dia] = {
                "atrasados": atrasados or 0,
                "backlog": backlog or 0
            }
            
        result = []
        for dt in last_7_days_dts:
            dt_str = dt.strftime("%d/%m/%Y")
            short_day = dt.strftime("%d/%m")
            
            val = 0
            if dt_str in db_map:
                if tipo_anomalia == "POS_COLETA":
                    val = db_map[dt_str]["atrasados"]
                else:
                    # For furo or generic, just count occurrences (1 or 0)
                    val = 1
            
            result.append({
                "data": short_day,
                "valor": val
            })
            
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
