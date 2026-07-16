import os
import google.generativeai as genai
from typing import Optional
from sqlalchemy import text

def gerar_query_sql(pergunta: str, api_key: str) -> Optional[str]:
    schema_info = """
    Tabelas e Colunas no banco SQLite (torre_anjun.db):
    1. malha_coordenadas:
       - md_codigo (TEXT, chave primária, ex: 'DF-W-MD006')
       - nome_ponto (TEXT, IATA)
       - latitude, longitude (REAL)
       - cep (TEXT)
       - endereco (TEXT)
       - horario_trabalho (TEXT)
       - cidade (TEXT, ex: 'Praia Grande', 'São Paulo')
       - estado (TEXT, ex: 'SP', 'DF')
    2. detalhe_md_historico:
       - dia_base (TEXT, formato 'DD/MM/YYYY', ex: '25/06/2026')
       - semana_base (TEXT, ex: 'W26')
       - md (TEXT, ex: 'DF-W-MD006')
       - regional (TEXT, ex: 'SP', 'SUL')
       - total (INTEGER, volume previsto/bipado)
       - backlog (INTEGER, volume retido/backlog de carregamento)
       - carregamento (INTEGER)
       - descarregamento (INTEGER)
       - erros_md (INTEGER)
       - taxa_coleta (REAL, eficiência)
       - cidade (TEXT)
    3. md_observacoes_fixas:
       - md (TEXT)
       - observacao (TEXT, alerta permanente)
    4. avaliacao_md:
       - md (TEXT)
       - decisao (TEXT, ex: 'manter', 'observar', 'trocar')
       - motivo (TEXT)
       - data_avaliacao (TEXT)
    5. justificativas_diarias:
       - dia_base (TEXT)
       - regional (TEXT)
       - justificativa (TEXT)
    6. penalidades_md:
       - md (TEXT)
       - motivo (TEXT)
       - pontos (INTEGER)
    """

    prompt = f"""Você é um tradutor especialista de perguntas em português para consultas SQLite.
Dado o seguinte esquema de banco de dados SQLite:
{schema_info}

Analise a pergunta do usuário: "{pergunta}"

Se a pergunta puder ser respondida realizando uma consulta SQL no banco de dados acima, escreva a consulta SQLite SELECT exata para retornar apenas as informações necessárias para responder à pergunta.
Regras obrigatórias:
1. Retorne APENAS a query SQL pura. Não adicione crases, markdown, explicações ou blocos ```sql. Apenas a instrução SQL.
2. A consulta deve ser estritamente de leitura (SELECT).
3. Se a pergunta do usuário for geral (ex: "Olá", "Escreva um e-mail de cobrança", "Gere o relatório WBR"), ou se não requerer consulta ao banco, responda estritamente com a palavra: NO_QUERY
4. Se o usuário estiver perguntando sobre quantidade de MDs em uma cidade, faça um LIKE insensível a maiúsculas/minúsculas na tabela malha_coordenadas. Por exemplo: SELECT COUNT(*) FROM malha_coordenadas WHERE cidade LIKE '%praia grande%'
5. Se for perguntado sobre o volume total ou backlog de uma regional, faça a consulta na tabela detalhe_md_historico filtrando pela regional e, se mencionado, pelo mês/ano (ex: dia_base LIKE '%/06/2026').

Pergunta: "{pergunta}"
SQL:"""

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(model_name='gemini-2.5-flash')
        response = model.generate_content(prompt)
        text_resp = response.text.strip()
        if "SELECT" in text_resp.upper() and not "NO_QUERY" in text_resp.upper():
            # Strip potential markdown wrappers
            clean = text_resp.replace("```sql", "").replace("```", "").strip()
            return clean
        return None
    except Exception as e:
        print(f"Error generating SQL query: {e}")
        return None

def executar_query_sql(query: str) -> str:
    clean_query = query.strip()
    if not clean_query.upper().startswith("SELECT"):
        return "Erro: Apenas consultas SELECT são permitidas."
    
    if "APP_CONFIG" in clean_query.upper():
        return "Erro: Acesso à tabela de configuração não permitido por motivos de segurança."
        
    import sqlite3
    from database.connection import DB_PATH
    db_path = DB_PATH
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(clean_query)
        columns = [d[0] for d in cursor.description]
        rows = cursor.fetchall()
        conn.close()
        
        if not rows:
            return "Nenhum dado encontrado no banco de dados para essa consulta."
            
        res_str = ""
        for r in rows:
            row_dict = dict(zip(columns, r))
            res_str += f"{row_dict}\n"
        return res_str
    except Exception as e:
        return f"Erro ao executar query SQL no banco: {e}"

def gerar_conteudo_gemini(
    prompt: str, 
    api_key: Optional[str] = None,
    fallback_report: Optional[str] = None
) -> str:
    # 1. Resolve API Key (payload parameter > environment variable)
    key = api_key or os.environ.get("GEMINI_API_KEY")
    
    # 2. Fallback to SQLite app_config table
    if not key:
        try:
            from database.connection import SessionLocal
            db = SessionLocal()
            # Ensure config table exists
            db.execute(text("CREATE TABLE IF NOT EXISTS app_config (chave TEXT PRIMARY KEY, valor TEXT);"))
            db.commit()
            row = db.execute(text("SELECT valor FROM app_config WHERE chave = 'gemini_api_key';")).fetchone()
            if row:
                key = row[0]
            db.close()
        except Exception as e:
            print(f"Error loading gemini key from DB: {e}")
            
    if not key:
        # Graceful degradation fallback
        return f"[ANJUN CO-PILOTO IA - MODO LOCAL OFF-LINE]\n\n" + (
            fallback_report or "Chave de API do Gemini não configurada. Por favor, cadastre sua chave nas Configurações da Torre."
        )

    # 3. Text-to-SQL verification for free text questions
    user_question = None
    if "Pergunta livre do usuário:" in prompt:
        idx = prompt.find("Pergunta livre do usuário:")
        user_question = prompt[idx + len("Pergunta livre do usuário:"):].strip()

    if user_question:
        sql_query = gerar_query_sql(user_question, key)
        if sql_query and "SELECT" in sql_query.upper():
            db_results = executar_query_sql(sql_query)
            # Append SQL results to the prompt so Gemini has exact factual context
            prompt += f"\n\n[DADOS REAIS DA CONSULTA AO BANCO DE DADOS (SQLite)]:\nQuery Executada: {sql_query}\nResultados:\n{db_results}\n"

    try:
        genai.configure(api_key=key)
        system_instruction = (
            "Você é o Assistente IA da Torre de Controle ANJUN Logística. "
            "Suas respostas e relatórios operacionais devem usar linguagem altamente natural, fluida, orgânica e com 'toque humano' sênior. "
            "Evite termos repetitivos, robóticos ou jargões típicos de IA (como 'aqui está', 'com base nos dados analisados', 'é importante ressaltar', etc.). "
            "Redija com a fluidez direta e clara de um Diretor ou Gerente Sênior de Operações Logísticas, mantendo o texto indetectável por ferramentas de detecção automática. "
            "Se houver dados reais da consulta ao banco de dados fornecidos no prompt, use-os como a única fonte da verdade absoluta para responder à dúvida do usuário. Não invente dados sob hipótese alguma."
        )
        # Use the newer gemini-2.5-flash model to support the new AQ. key format
        model = genai.GenerativeModel(
            model_name='gemini-2.5-flash',
            system_instruction=system_instruction
        )
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        # Fallback to local report if API call fails
        return (
            f"[ANJUN CO-PILOTO IA - FALHA NA API GEMINI: {e}]\n\n"
            f"Exibindo relatório analítico consolidado local:\n\n"
            f"{fallback_report or 'Nenhum relatório de fallback fornecido.'}"
        )
