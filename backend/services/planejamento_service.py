import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import HTTPException
import io

def parse_and_save_rotas(db: Session, file_bytes: bytes, dia_semana: str, regional: str = "SP"):
    try:
        # Lê a planilha usando Pandas
        df = pd.read_excel(io.BytesIO(file_bytes))
        
        # O usuário disse que a Coluna A é o MD.
        
        md_col = df.columns[0] # Coluna A
        
        # Procurar pela coluna de Carro/Rota
        carro_col = None
        for col in df.columns:
            nome = str(col).lower()
            if "carro" in nome or "rota" in nome or "veículo" in nome or "veiculo" in nome:
                carro_col = col
                break
                
        if not carro_col and len(df.columns) > 1:
            carro_col = df.columns[1] # Assume a coluna B como o Carro
            
        if not carro_col:
            raise ValueError("Não foi possível identificar a coluna de Carro/Rota na planilha.")
            
        # Preparar dados para inserção
        rows_to_insert = []
        
        # Bulk insert (criando a tabela se não existir primeiro)
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS planejamento_rotas_fixas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            md_codigo TEXT,
            dia_semana TEXT,
            carro_id TEXT,
            ordem_coleta INTEGER,
            regional TEXT
        )
        """
        db.execute(text(create_table_sql))
        
        # Primeiro deleta as rotas antigas para este dia da semana e regional
        db.execute(text("DELETE FROM planejamento_rotas_fixas WHERE dia_semana = :dia AND regional = :regional"), 
                   {"dia": dia_semana, "regional": regional})
        
        # Iterar sobre as linhas
        for index, row in df.iterrows():
            md = str(row[md_col]).strip()
            carro = str(row[carro_col]).strip()
            
            if md and md.lower() != 'nan' and carro and carro.lower() != 'nan':
                rows_to_insert.append({
                    "md_codigo": md,
                    "dia_semana": dia_semana,
                    "carro_id": carro,
                    "ordem_coleta": index + 1,
                    "regional": regional
                })
        
        if not rows_to_insert:
            raise ValueError(f"Nenhum dado válido encontrado na planilha para {dia_semana}.")
            
        insert_sql = """
        INSERT INTO planejamento_rotas_fixas (md_codigo, dia_semana, carro_id, ordem_coleta, regional) 
        VALUES (:md_codigo, :dia_semana, :carro_id, :ordem_coleta, :regional)
        """
        for r in rows_to_insert:
            db.execute(text(insert_sql), r)
            
        db.commit()
        return {"status": "success", "message": f"{len(rows_to_insert)} rotas de {dia_semana} inseridas com sucesso."}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro ao processar planilha ({dia_semana}): {str(e)}")
