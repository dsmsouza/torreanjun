import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from database.connection import get_db
from services.operacional import padronizar_uf

router = APIRouter(
    prefix="/api/pedidos-criados",
    tags=["Pedidos Criados"]
)

@router.get("/dashboard")
def get_dashboard_pedidos_criados(
    data: str = Query(None, description="Data base (DD/MM/YYYY)"),
    db: Session = Depends(get_db)
):
    try:
        # Se data não for fornecida ou for 'latest', busca a mais recente disponível
        if not data or data in ["latest", "undefined/undefined/"]:
            row_data = db.execute(text("SELECT dia_base FROM criacao_pedidos_historico ORDER BY rowid DESC LIMIT 1;")).scalar()
            if not row_data:
                row_data = db.execute(text("SELECT MAX(dia_base) FROM criacao_pedidos_historico;")).scalar()
            data = str(row_data) if row_data else datetime.date.today().strftime("%d/%m/%Y")

        # 1. Resumo Geral e Registro da Última Ingestão
        q_log = text("""
            SELECT hora_ultima_atualizacao, volume_anterior, volume_atual, volume_incremental
            FROM criacao_ingestao_log
            WHERE dia_base = :d
        """)
        row_log = db.execute(q_log, {"d": data}).fetchone() if db.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='criacao_ingestao_log';")).fetchone() else None
        
        hora_ultima_atualizacao = row_log[0] if row_log else None
        volume_anterior = row_log[1] if row_log else 0
        volume_incremental = row_log[3] if row_log else 0

        if not hora_ultima_atualizacao:
            row_cfg = db.execute(text("SELECT valor FROM app_config WHERE chave = 'ultima_ingestao_criacao';")).fetchone() if db.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='app_config';")).fetchone() else None
            hora_ultima_atualizacao = row_cfg[0] if row_cfg else "Sem registro de horário"

        q_resumo = text("""
            SELECT 
                SUM(total_pedidos) as volume_total,
                COUNT(DISTINCT merchant_id) as total_sellers,
                COUNT(DISTINCT cep_remetente) as total_ceps
            FROM criacao_pedidos_historico
            WHERE dia_base = :d
        """)
        resumo = db.execute(q_resumo, {"d": data}).fetchone()
        volume_total = (resumo[0] if resumo else 0) or 0
        total_sellers = (resumo[1] if resumo else 0) or 0
        total_ceps = (resumo[2] if resumo else 0) or 0

        # 2. Breakdown por Modalidade (Entrega Porta a Porta vs Coleta Porta a Porta)
        q_modalidade = text("""
            SELECT 
                CASE 
                    WHEN LOWER(maneira_coleta) LIKE '%coleta%' OR LOWER(maneira_coleta) LIKE '%pickup%' THEN 'Coleta Porta a Porta'
                    ELSE 'Entrega Porta a Porta'
                END as modalidade,
                SUM(total_pedidos) as volume,
                COUNT(DISTINCT merchant_id) as total_sellers
            FROM criacao_pedidos_historico
            WHERE dia_base = :d
            GROUP BY modalidade
            ORDER BY volume DESC;
        """)
        rows_mod = db.execute(q_modalidade, {"d": data}).fetchall()
        
        modalidades_dict = {}
        for r in rows_mod:
            mod_nome = r[0]
            vol = r[1] or 0
            sel = r[2] or 0
            pct = round((vol * 100.0 / volume_total), 1) if volume_total > 0 else 0
            modalidades_dict[mod_nome] = {
                "volume": vol,
                "sellers": sel,
                "percentual": pct
            }

        # 3. Novos Sellers de Coleta Porta a Porta (Inéditos no banco de dados)
        q_novos_pickup = text("""
            SELECT 
                c.merchant_id, 
                c.merchant_nome, 
                c.nome_cliente, 
                c.estado, 
                c.cidade, 
                c.bairro,
                COALESCE(c.endereco_completo, c.logradouro, '') as end_val,
                c.cep_remetente,
                SUM(c.total_pedidos) as volume
            FROM criacao_pedidos_historico c
            WHERE c.dia_base = :d
              AND (LOWER(c.maneira_coleta) LIKE '%coleta%' OR LOWER(c.maneira_coleta) LIKE '%pickup%')
              AND c.merchant_id NOT IN (
                  SELECT DISTINCT merchant_id 
                  FROM criacao_pedidos_historico 
                  WHERE dia_base < :d
              )
            GROUP BY c.merchant_id, c.merchant_nome, c.nome_cliente, c.estado, c.cidade, c.bairro, end_val, c.cep_remetente
            ORDER BY volume DESC;
        """)
        rows_novos = db.execute(q_novos_pickup, {"d": data}).fetchall()
        
        novos_pickup_list = []
        total_novos_pickup_volume = 0
        for r in rows_novos:
            v = r[8] or 0
            total_novos_pickup_volume += v
            end_val = (r[6] or "").strip()
            end_parts = [p for p in [end_val, r[5], r[4], r[3]] if p and str(p).strip()]
            end_str = ", ".join(end_parts) if end_parts else "Endereço Não Informado"
            if r[7]: end_str += f" - CEP: {r[7]}"
            
            novos_pickup_list.append({
                "merchant_id": r[0],
                "merchant_nome": r[1] or r[0],
                "cliente": r[2] or "N/A",
                "estado": padronizar_uf(r[3]),
                "cidade": r[4] or "",
                "bairro": r[5] or "",
                "endereco": end_val,
                "cep": r[7] or "",
                "endereco_completo": end_str,
                "volume": v
            })
        
        # 4. Breakdown por Estado (UF) dos Sellers NOVOS de Coleta
        q_novos_uf = text("""
            SELECT 
                c.estado, 
                COUNT(DISTINCT c.merchant_id) as qtd_sellers, 
                SUM(c.total_pedidos) as volume
            FROM criacao_pedidos_historico c
            WHERE c.dia_base = :d
              AND (LOWER(c.maneira_coleta) LIKE '%coleta%' OR LOWER(c.maneira_coleta) LIKE '%pickup%')
              AND c.merchant_id NOT IN (
                  SELECT DISTINCT merchant_id 
                  FROM criacao_pedidos_historico 
                  WHERE dia_base < :d
              )
            GROUP BY c.estado
            ORDER BY volume DESC;
        """)
        rows_novos_uf = db.execute(q_novos_uf, {"d": data}).fetchall()
        novos_sellers_por_estado = [
            {
                "uf": padronizar_uf(r[0]),
                "sellers": r[1] or 0,
                "volume": r[2] or 0
            } for r in rows_novos_uf if r[0]
        ]

        # 5. Breakdown Geral por Estado (UF)
        q_estado = text("""
            SELECT estado as uf, SUM(total_pedidos) as volume
            FROM criacao_pedidos_historico
            WHERE dia_base = :d AND estado IS NOT NULL AND estado != ''
            GROUP BY estado
            ORDER BY volume DESC
        """)
        por_estado = [{"uf": padronizar_uf(r[0]), "volume": r[1]} for r in db.execute(q_estado, {"d": data}).fetchall()]
        
        # 6. Ranking de Sellers (com endereço completo)
        q_sellers = text("""
            SELECT 
                merchant_nome, 
                merchant_id, 
                SUM(total_pedidos) as volume,
                MAX(nome_cliente) as cliente,
                MAX(maneira_coleta) as maneira_coleta,
                MAX(estado) as estado,
                MAX(cidade) as cidade,
                MAX(bairro) as bairro,
                MAX(COALESCE(endereco_completo, logradouro, '')) as endereco,
                MAX(cep_remetente) as cep
            FROM criacao_pedidos_historico
            WHERE dia_base = :d
            GROUP BY merchant_id, merchant_nome
            ORDER BY volume DESC
            LIMIT 50
        """)
        ranking_sellers = []
        for r in db.execute(q_sellers, {"d": data}).fetchall():
            is_pickup = ("coleta" in str(r[4]).lower() or "pickup" in str(r[4]).lower())
            end_parts = [p for p in [r[8], r[7], r[6], r[5]] if p and str(p).strip()]
            end_str = ", ".join(end_parts) if end_parts else "Endereço Não Informado"
            if r[9]: end_str += f" - CEP: {r[9]}"

            ranking_sellers.append({
                "nome": r[0] or r[1],
                "id": r[1],
                "volume": r[2],
                "cliente": r[3] or "N/A",
                "modalidade": "Coleta Porta a Porta (Pickup)" if is_pickup else "Entrega Porta a Porta (Dropoff)",
                "is_pickup": is_pickup,
                "estado": padronizar_uf(r[5]),
                "cidade": r[6] or "",
                "bairro": r[7] or "",
                "endereco": r[8] or "",
                "cep": r[9] or "",
                "endereco_completo": end_str
            })
        
        return {
            "data_base": data,
            "hora_ultima_atualizacao": hora_ultima_atualizacao,
            "volume_incremental": volume_incremental,
            "volume_anterior": volume_anterior,
            "resumo": {
                "volume_total": volume_total,
                "total_sellers": total_sellers,
                "total_ceps": total_ceps,
                "novos_sellers_pickup_count": len(novos_pickup_list),
                "novos_sellers_pickup_volume": total_novos_pickup_volume,
            },
            "modalidades": modalidades_dict,
            "novos_sellers_pickup": novos_pickup_list,
            "novos_sellers_por_estado": novos_sellers_por_estado,
            "por_estado": por_estado,
            "ranking_sellers": ranking_sellers
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
