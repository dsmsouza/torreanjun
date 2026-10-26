import os
import shutil
import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional

from database.connection import get_db
from services.operacional import (
    processar_planilha_rotas_motoristas,
    obter_data_semana_atual,
    padronizar_uf
)

router = APIRouter(prefix="/api/rotas", tags=["Inteligência de Rotas SP"])

UPLOAD_DIR = r"C:\ANJUN\uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/importar")
async def importar_planilha_rotas(
    file: UploadFile = File(...),
    dia_base: Optional[str] = Form(None),
    semana_base: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    """Endpoint para upload da planilha diária de rotas de motoristas em SP."""
    try:
        data_op, semana_op = obter_data_semana_atual()
        dia_base = dia_base or data_op
        semana_base = semana_base or semana_op

        file_path = os.path.join(UPLOAD_DIR, f"rotas_sp_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}")
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        res = processar_planilha_rotas_motoristas(file_path, dia_base, semana_base, db)
        return res
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dashboard")
def get_dashboard_rotas_sp(
    data: Optional[str] = Query(None, description="Data base (DD/MM/YYYY)"),
    db: Session = Depends(get_db)
):
    """Dashboard de inteligência de rotas dos motoristas em São Paulo."""
    try:
        # Se data não for informada, busca a mais recente em rotas_motoristas_historico ou detalhe_md_historico
        if not data or data in ["latest", "undefined/undefined/"]:
            row = db.execute(text("SELECT dia_base FROM rotas_motoristas_historico ORDER BY id DESC LIMIT 1;")).scalar()
            if not row:
                row = db.execute(text("SELECT dia_base FROM detalhe_md_historico ORDER BY rowid DESC LIMIT 1;")).scalar()
            data = str(row) if row else datetime.date.today().strftime("%d/%m/%Y")

        # 1. Total Motoristas & Rotas Escaladas
        q_summary = text("""
            SELECT 
                COUNT(DISTINCT motorista_nome) as total_motoristas,
                COUNT(DISTINCT md_codigo) as total_mds_escalados,
                COUNT(*) as total_paradas
            FROM rotas_motoristas_historico
            WHERE dia_base = :d
        """)
        summary = db.execute(q_summary, {"d": data}).fetchone()
        total_motoristas = summary[0] if summary else 0
        total_mds_escalados = summary[1] if summary else 0
        total_paradas = summary[2] if summary else 0

        # 2. Resumo por Motorista (Com Volume real dos MDs bipados no dia)
        q_motoristas = text("""
            SELECT 
                r.motorista_nome,
                r.placa,
                r.horario_previsto,
                COUNT(DISTINCT r.md_codigo) as qtd_mds,
                COALESCE(SUM(m.total), 0) as volume_bipado,
                COALESCE(SUM(m.backlog), 0) as backlog_acumulado
            FROM rotas_motoristas_historico r
            LEFT JOIN detalhe_md_historico m 
                ON UPPER(r.md_codigo) = UPPER(m.md) AND r.dia_base = m.dia_base
            WHERE r.dia_base = :d
            GROUP BY r.motorista_nome, r.placa, r.horario_previsto
            ORDER BY volume_bipado DESC;
        """)
        motoristas_rows = db.execute(q_motoristas, {"d": data}).fetchall()

        motoristas_list = []
        for r in motoristas_rows:
            vol = int(r[4] or 0)
            back = int(r[5] or 0)
            # Estimativa de capacidade ocupada (Van 800 pacotes / VUC 1500)
            cap = 1000
            cap_pct = round((vol * 100.0 / cap), 1)
            motoristas_list.append({
                "motorista_nome": r[0],
                "placa": r[1] or "N/A",
                "horario_previsto": r[2] or "Comercial",
                "qtd_mds": r[3] or 0,
                "volume_bipado": vol,
                "backlog_acumulado": back,
                "capacidade_ocupada_pct": min(cap_pct, 100.0),
                "alerta_gargalo": cap_pct > 90.0
            })

        # 3. MDs em SP Sem Motorista Escalado (Alertas de Coleta Pendente)
        q_mds_sem_motorista = text("""
            SELECT 
                m.md,
                m.cidade,
                m.regional,
                SUM(m.total) as volume_total,
                SUM(m.backlog) as backlog_total
            FROM detalhe_md_historico m
            WHERE m.dia_base = :d
              AND (UPPER(m.estado) = 'SP' OR UPPER(m.regional) LIKE '%SP%')
              AND m.md IS NOT NULL AND m.md != ''
              AND UPPER(m.md) NOT IN (
                  SELECT UPPER(md_codigo) 
                  FROM rotas_motoristas_historico 
                  WHERE dia_base = :d
              )
            GROUP BY m.md, m.cidade, m.regional
            HAVING SUM(m.total) > 0
            ORDER BY volume_total DESC;
        """)
        mds_sem_motorista_rows = db.execute(q_mds_sem_motorista, {"d": data}).fetchall()

        mds_sem_motorista_list = [
            {
                "md": r[0],
                "cidade": r[1] or "São Paulo",
                "regional": r[2] or "SP",
                "volume_total": r[3] or 0,
                "backlog_total": r[4] or 0
            } for r in mds_sem_motorista_rows
        ]

        # 4. Detalhes das Paradas da Rota com Geocalização (Para o Mapa)
        q_paradas = text("""
            SELECT 
                r.motorista_nome,
                r.placa,
                r.md_codigo,
                r.sequencia_parada,
                r.horario_previsto,
                r.cidade,
                r.bairro,
                c.latitude,
                c.longitude,
                COALESCE(m.total, 0) as volume_md
            FROM rotas_motoristas_historico r
            LEFT JOIN malha_coordenadas c ON UPPER(r.md_codigo) = UPPER(c.md_codigo)
            LEFT JOIN detalhe_md_historico m ON UPPER(r.md_codigo) = UPPER(m.md) AND r.dia_base = m.dia_base
            WHERE r.dia_base = :d
            ORDER BY r.motorista_nome, r.sequencia_parada ASC;
        """)
        paradas_rows = db.execute(q_paradas, {"d": data}).fetchall()

        paradas_list = []
        for r in paradas_rows:
            paradas_list.append({
                "motorista_nome": r[0],
                "placa": r[1] or "N/A",
                "md_codigo": r[2],
                "sequencia": r[3] or 1,
                "horario": r[4] or "",
                "cidade": r[5] or "São Paulo",
                "bairro": r[6] or "",
                "latitude": r[7] or -23.5505,
                "longitude": r[8] or -46.6333,
                "volume_md": r[9] or 0
            })

        return {
            "data_base": data,
            "summary": {
                "total_motoristas": total_motoristas,
                "total_mds_escalados": total_mds_escalados,
                "total_paradas": total_paradas,
                "mds_sem_motorista_count": len(mds_sem_motorista_list)
            },
            "motoristas": motoristas_list,
            "mds_sem_motorista": mds_sem_motorista_list,
            "paradas": paradas_list
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/saturacao")
def get_saturacao_rotas(
    dia_planejado: Optional[str] = Query("26/10/2026", description="Data do planejamento das rotas"),
    dia_anterior: Optional[str] = Query(None, description="Data base D-1 para cruzamento com histórico real"),
    capacidade_vuc: int = Query(2500, description="Capacidade nominal do VUC em pacotes")
):
    """Endpoint de Inteligência de Saturação de Rotas com Cruzamento D-1."""
    try:
        from services.saturacao_rotas_service import calcular_saturacao_rotas
        return calcular_saturacao_rotas(
            dia_planejado=dia_planejado,
            dia_anterior=dia_anterior,
            capacidade_vuc=capacidade_vuc
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

