import os
import re
import json
import time
import requests
import warnings
warnings.filterwarnings("ignore", category=FutureWarning)
import google.generativeai as genai
from typing import Optional, Tuple, List, Dict, Any
from sqlalchemy import text

def obter_configuracao_ai():
    """Recupera o provedor ativo e as chaves cadastradas na tabela app_config."""
    config = {
        "provider": "gemini",
        "gemini_api_key": None,
        "openrouter_api_key": None,
        "deepseek_api_key": None,
        "openrouter_model": "deepseek/deepseek-chat"
    }
    try:
        from database.connection import SessionLocal
        db = SessionLocal()
        db.execute(text("CREATE TABLE IF NOT EXISTS app_config (chave TEXT PRIMARY KEY, valor TEXT);"))
        db.commit()
        rows = db.execute(text("SELECT chave, valor FROM app_config;")).fetchall()
        db.close()
        
        for k, v in rows:
            if k in config:
                config[k] = v
    except Exception as e:
        print(f"Erro ao carregar configuracoes de IA: {e}")
        
    # Fallbacks de variaveis de ambiente se disponiveis
    if not config["gemini_api_key"]:
        config["gemini_api_key"] = os.environ.get("GEMINI_API_KEY")
    if not config["openrouter_api_key"]:
        config["openrouter_api_key"] = os.environ.get("OPENROUTER_API_KEY")
    if not config["deepseek_api_key"]:
        config["deepseek_api_key"] = os.environ.get("DEEPSEEK_API_KEY")
        
    return config

def chamar_openrouter(prompt: str, api_key: str, model: Optional[str] = None, system_instruction: Optional[str] = None) -> str:
    url = "https://openrouter.ai/api/v1/chat/completions"
    model_name = model if model and model.strip() else "deepseek/deepseek-chat"
    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Torre ANJUN Copilot"
    }
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})
    
    payload = {
        "model": model_name,
        "messages": messages,
        "temperature": 0.2
    }
    res = requests.post(url, json=payload, headers=headers, timeout=60)
    res.raise_for_status()
    data = res.json()
    return data["choices"][0]["message"]["content"]

def chamar_deepseek(prompt: str, api_key: str, system_instruction: Optional[str] = None) -> str:
    url = "https://api.deepseek.com/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json"
    }
    messages = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})
    
    payload = {
        "model": "deepseek-chat",
        "messages": messages,
        "temperature": 0.2
    }
    res = requests.post(url, json=payload, headers=headers, timeout=60)
    res.raise_for_status()
    data = res.json()
    return data["choices"][0]["message"]["content"]

# Esquema detalhado do SQLite para geração precisa de queries
SQLITE_SCHEMA_DESCRICAO = """
BANCO DE DADOS SQLite (torre_anjun.db) - TORRE DE CONTROLE LOGÍSTICA ANJUN:

1. TABELA detalhe_md_historico (Performance diária de bipagem e coletas por Ponto/MD):
   - id: INTEGER PRIMARY KEY
   - dia_base: TEXT (Data no formato 'DD/MM/YYYY', ex: '08/10/2026')
   - semana_base: TEXT (ex: 'Semana 41')
   - md: TEXT (Código do ponto, ex: 'MD-TAT-01', 'MD-HAV-01')
   - regional: TEXT (ex: 'SP Capital', 'Grande SP', 'Interior')
   - estado: TEXT (UF, ex: 'SP', 'RJ', 'MG')
   - total: INTEGER (Total de pacotes coletados/bipados no dia)
   - backlog: INTEGER (Total de pacotes em atraso/backlog no MD)
   - carregamento: INTEGER (Pacotes carregados para transferência)
   - descarregamento: INTEGER (Pacotes descarregados no MD)
   - erros_md: INTEGER (Erros de bipagem ou divergências registradas)
   - taxa_coleta: REAL (Percentual de taxa de coleta de 0 a 100, ex: 98.5)
   - cidade: TEXT (Município do MD)
   - divisao: TEXT (ex: 'Express', 'Cross-Docking')
   - nome_cliente: TEXT (Marketplace / Embarcador associado, ex: 'SHEIN', 'TIKTOK')

2. TABELA malha_coordenadas (Cadastro geográfico oficial da rede ANJUN):
   - md_codigo: TEXT (Código do ponto, ex: 'MD-TAT-01', 'WR-GRU-01')
   - nome_ponto: TEXT (Nome ou descrição do ponto)
   - latitude: REAL (Coordenada Lat)
   - longitude: REAL (Coordenada Lng)
   - cep: TEXT (CEP do local)
   - endereco: TEXT (Logradouro e bairro)
   - horario_trabalho: TEXT (Horário de funcionamento)
   - cidade: TEXT (Município)
   - estado: TEXT (UF)
   - regional: TEXT (Regional operacional)
   - funcionando: INTEGER (1 = ativo, 0 = inativo)
   - divisao: TEXT (Divisão logística)
   - tipo_ponto: TEXT ('MD (Ponto de Coleta)', 'HUB (Transferência)', 'Galpão / CD (Distribuição)')

3. TABELA detalhe_cliente_historico (Volume diário por Cliente / Marketplace):
   - dia_base: TEXT ('DD/MM/YYYY')
   - semana_base: TEXT
   - nome_cliente: TEXT ('SHEIN', 'TIKTOK', 'SHOPEE', 'TEMU', 'MERCADO LIVRE')
   - total_pacotes: INTEGER (Volume total bipado do cliente)
   - total_backlog: INTEGER (Backlog total)
   - taxa_coleta: REAL (Taxa média de coleta %)

4. TABELA criacao_pedidos_historico (Pedidos gerados por Sellers / Demanda na ponta):
   - dia_base: TEXT ('DD/MM/YYYY')
   - semana_base: TEXT
   - nome_cliente: TEXT ('SHEIN', 'TIKTOK', etc.)
   - merchant_id: TEXT (ID do vendedor/loja)
   - merchant_nome: TEXT (Nome do seller)
   - cep_remetente: TEXT (CEP de origem do seller)
   - estado: TEXT (UF)
   - cidade: TEXT (Cidade)
   - bairro: TEXT (Bairro do seller)
   - maneira_coleta: TEXT ('PICKUP' ou 'DROP-OFF')
   - total_pedidos: INTEGER (Quantidade de pedidos criados no dia)
   - tipo_pedido: TEXT
   - ponto_colecao: TEXT (MD vinculado, se houver)

5. TABELA sellers_pickup_registry (Base consolidada de Sellers e histórico de ativação):
   - merchant_id: TEXT PRIMARY KEY
   - merchant_nome: TEXT
   - primeiro_cliente: TEXT (Primeiro marketplace pelo qual operou)
   - primeira_data: TEXT (Data de ativação 'DD/MM/YYYY')
   - primeira_data_iso: TEXT ('YYYY-MM-DD')
   - cidade_origem: TEXT
   - bairro_origem: TEXT
   - cep_origem: TEXT
   - volume_acumulado_total: INTEGER (Total histórico de pacotes do seller)
   - total_dias_ativos: INTEGER (Dias com coletas realizadas)
   - status_seller: TEXT ('ATIVO', 'INATIVO', 'CHURN')

6. TABELA auditoria_coleta (Auditoria operacional de docas, motoristas e horários):
   - dia_base: TEXT ('DD/MM/YYYY')
   - md: TEXT (Código do MD)
   - regional: TEXT
   - status_coleta: TEXT ('CONCLUÍDO', 'EM ANDAMENTO', 'PENDENTE')
   - placa: TEXT (Placa do veículo de transporte)
   - motorista: TEXT (Nome do motorista)
   - entrada: TEXT (Horário de chegada)
   - saida: TEXT (Horário de saída)
   - qtd_sacos: INTEGER (Total de sacas manipuladas)
   - pacotes_atrasados: INTEGER (Pacotes que excederam janela)

7. TABELA proposta_expansao (Pipeline de expansão da rede ANJUN):
   - cidade: TEXT, estado: TEXT, bairro: TEXT, cep_alvo: TEXT
   - volume_estimado: INTEGER, qtd_sellers_estimada: INTEGER
   - distancia_md_mais_proximo: REAL, md_mais_proximo: TEXT
   - justificativa: TEXT, status: TEXT ('EM ESTUDO', 'APROVADO', 'REJEITADO')

8. TABELA solicitacoes_implantacao (Novas solicitações comerciais de P.A / Implantação):
   - codigo: TEXT, cliente_nome: TEXT, cidade: TEXT, estado: TEXT
   - volume_estimado_diario: INTEGER, status: TEXT, condicao_viabilidade: TEXT
"""

def gerar_query_sql_robusto(pergunta: str, api_key: Optional[str] = None) -> Tuple[Optional[str], Optional[str]]:
    """Gera uma query SQL pura (SELECT) a partir de uma pergunta em linguagem natural."""
    ai_cfg = obter_configuracao_ai()
    provider = ai_cfg["provider"]
    key = api_key or ai_cfg["gemini_api_key"] or ai_cfg["openrouter_api_key"] or ai_cfg["deepseek_api_key"]
    
    if not key:
        return None, "Chave de API não configurada. Acesse Configurações da Torre para cadastrar."

    prompt = f"""Você é o Engenheiro Especialista em Dados e SQL da Torre de Controle ANJUN.
Analise a seguinte pergunta sobre as operações logísticas da ANJUN:
"{pergunta}"

Consulte o esquema detalhado das tabelas do banco SQLite abaixo:
{SQLITE_SCHEMA_DESCRICAO}

REGRAS OBRIGATÓRIAS:
1. Retorne ESTRITAMENTE a query SQL pura do SQLite. Não use crases, não use ```sql, não adicione explicações.
2. Apenas comandos de LEITURA são permitidos: 'SELECT' ou 'WITH ... SELECT'.
3. Formato de datas nas tabelas: o campo 'dia_base' está como 'DD/MM/YYYY' (ex: '08/10/2026'). Se a pergunta pedir dados recentes sem especificar dia, ordene por id DESC ou agrupe pelos dias disponíveis.
4. Nomes de colunas e tabelas devem ser exatamente como definidos no esquema.
5. Sempre limite a quantidade de registros com 'LIMIT 50' no final, a menos que seja uma agregação (ex: COUNT, SUM, AVG).
6. Se a pergunta não tiver nenhuma relação com dados do banco de dados, responda apenas: NO_QUERY

Pergunta: "{pergunta}"
SQL:"""

    try:
        if provider == "openrouter":
            raw_sql = chamar_openrouter(prompt, key, model=ai_cfg.get("openrouter_model"))
        elif provider == "deepseek":
            raw_sql = chamar_deepseek(prompt, key)
        else:
            genai.configure(api_key=key)
            model = genai.GenerativeModel(model_name='gemini-2.5-flash')
            response = model.generate_content(prompt)
            raw_sql = response.text.strip()

        clean_sql = raw_sql.strip()
        clean_sql = re.sub(r"^```(?:sql)?\s*", "", clean_sql, flags=re.IGNORECASE)
        clean_sql = re.sub(r"\s*```$", "", clean_sql)
        clean_sql = clean_sql.strip()

        if "SELECT" in clean_sql.upper() and "NO_QUERY" not in clean_sql.upper():
            return clean_sql, None
        return None, "A pergunta não requer consulta de dados estruturados ou não pôde ser mapeada para SQL."
    except Exception as e:
        print(f"[Copilot LLM Aviso] {e} - Tentando fallback heurístico operacional...")
        # Fallback heurístico resiliente para perguntas operacionais comuns
        p_lower = pergunta.lower()
        if any(w in p_lower for w in ["bipa mais", "mais bipa", "mais pacotes", "top md", "ranking md", "maior volume"]):
            return ("SELECT md, regional, SUM(total) AS total_pacotes, ROUND(AVG(taxa_coleta), 1) AS taxa_media_pct, "
                    "SUM(backlog) AS total_backlog FROM detalhe_md_historico GROUP BY md "
                    "ORDER BY total_pacotes DESC LIMIT 10;"), None

        if any(w in p_lower for w in ["saturado", "saturação", "gargalo", "pior taxa", "mais backlog", "alto backlog"]):
            return ("SELECT md, regional, SUM(backlog) AS total_backlog, SUM(total) AS total_pacotes, "
                    "ROUND(AVG(taxa_coleta), 1) AS taxa_media_pct FROM detalhe_md_historico "
                    "GROUP BY md ORDER BY total_backlog DESC LIMIT 15;"), None

        if any(w in p_lower for w in ["expandir", "expansão", "novos sellers", "onde tem mais seller", "concentração"]):
            return ("SELECT cidade, estado, COUNT(DISTINCT merchant_id) AS total_sellers, "
                    "SUM(total_pedidos) AS volume_pedidos FROM criacao_pedidos_historico "
                    "GROUP BY cidade, estado ORDER BY volume_pedidos DESC LIMIT 15;"), None

        if any(w in p_lower for w in ["seller", "vendedor", "mais ativo", "volume acumulado"]):
            return ("SELECT merchant_nome, cidade_origem, estado_origem, volume_acumulado_total, "
                    "total_dias_ativos, status_seller FROM sellers_pickup_registry "
                    "ORDER BY volume_acumulado_total DESC LIMIT 15;"), None

        if any(w in p_lower for w in ["cliente", "marketplace", "shein", "tiktok", "shopee"]):
            return ("SELECT nome_cliente, SUM(total_pacotes) AS total_pacotes, SUM(total_backlog) AS total_backlog, "
                    "ROUND(AVG(taxa_coleta), 1) AS taxa_media_pct FROM detalhe_cliente_historico "
                    "GROUP BY nome_cliente ORDER BY total_pacotes DESC;"), None

        if any(w in p_lower for w in ["tipo de ponto", "hub", "galpão", "quantos pontos", "rede"]):
            return ("SELECT tipo_ponto, estado, COUNT(*) AS qtd_pontos FROM malha_coordenadas "
                    "WHERE funcionando = 1 GROUP BY tipo_ponto, estado ORDER BY qtd_pontos DESC LIMIT 20;"), None

        return None, f"Falha na IA e pergunta sem padrão heurístico: {str(e)}"

def validar_e_executar_sql(sql_query: str) -> Tuple[List[Dict[str, Any]], List[str], int, Optional[str]]:
    """Valida que a consulta é estritamente segura (SELECT) e executa no banco SQLite."""
    clean = sql_query.strip()
    upper = clean.upper()

    if not (upper.startswith("SELECT") or upper.startswith("WITH")):
        return [], [], 0, "Segurança: Apenas consultas SELECT ou WITH são autorizadas."

    # Bloqueio rigoroso de mutação
    forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE", 
                 "ATTACH", "DETACH", "PRAGMA", "APP_CONFIG", "REPLACE INTO"]
    for word in forbidden:
        # Checar se a palavra aparece como token isolado
        if re.search(rf"\b{word}\b", upper):
            return [], [], 0, f"Segurança: O termo restrito '{word}' não é permitido."

    # Garantir que não tenta consultar a tabela de senhas/chaves
    if "APP_CONFIG" in upper:
        return [], [], 0, "Segurança: Acesso a configurações restrito."

    # Adicionar LIMIT 50 se não houver LIMIT
    if "LIMIT" not in upper and not any(agg in upper for agg in ["COUNT(", "SUM(", "AVG(", "MIN(", "MAX("]):
        clean += " LIMIT 50"

    import sqlite3
    from database.connection import DB_PATH

    start_time = time.time()
    try:
        conn = sqlite3.connect(DB_PATH, timeout=10.0)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(clean)
        
        description = cursor.description
        if not description:
            conn.close()
            return [], [], int((time.time() - start_time) * 1000), "A consulta não retornou colunas."

        columns = [d[0] for d in description]
        rows = cursor.fetchall()
        conn.close()

        elapsed_ms = int((time.time() - start_time) * 1000)
        results = [dict(row) for row in rows]
        return results, columns, elapsed_ms, None

    except Exception as e:
        elapsed_ms = int((time.time() - start_time) * 1000)
        return [], [], elapsed_ms, f"Erro de execução SQLite: {str(e)}"

def sintetizar_resposta_com_dados(
    pergunta: str,
    sql_executada: str,
    colunas: List[str],
    dados: List[Dict[str, Any]],
    tempo_ms: int,
    api_key: Optional[str] = None
) -> str:
    """Consolida os dados reais do banco em um relatório executivo com zero alucinação."""
    ai_cfg = obter_configuracao_ai()
    provider = ai_cfg["provider"]
    key = api_key or ai_cfg["gemini_api_key"] or ai_cfg["openrouter_api_key"] or ai_cfg["deepseek_api_key"]

    # Se não retornou dados
    if not dados:
        return (
            f"**Consulta Executada com Sucesso** ({tempo_ms}ms):\n"
            f"Nenhum registro foi encontrado no banco de dados para os critérios da pergunta.\n\n"
            f"> Verifique se o período ou o código pesquisado está presente nos registros importados da Torre."
        )

    # Limitar payload enviado ao LLM para 50 linhas para respeitar contexto
    dados_amostra = dados[:50]
    dados_json = json.dumps(dados_amostra, ensure_ascii=False, indent=2)

    prompt = f"""Você é o Copilot de Inteligência Operacional da Torre de Controle ANJUN Logística.
Um Diretor / Gerente Operacional fez a seguinte pergunta:
"{pergunta}"

Foi executada a seguinte consulta SQL real no banco de dados da ANJUN:
Query: {sql_executada}

TOTAL DE REGISTROS ENCONTRADOS NO BANCO: {len(dados)} linhas (tempo: {tempo_ms}ms).
DADOS REAIS RETORNADOS PELO BANCO DE DADOS (SQLite):
{dados_json}

DIRETRIZES DE RESPOSTA OBRIGATÓRIAS (ZERO ALUCINAÇÃO):
1. USE APENAS e EXCLUSIVAMENTE os dados reais fornecidos acima. JAMAIS invente qualquer número, nome de MD, cidade ou percentual.
2. Apresente um Resumo Executivo Direto no primeiro parágrafo destacando o resultado central.
3. Formate os dados em uma Tabela Markdown limpa com as métricas mais relevantes (ex: MD, Cidade, Volume, Backlog, Taxa %).
4. Destaque Pontos de Atenção / Alertas Operacionais (ex: pontos com taxa baixa, saturação ou grande concentração).
5. Forneça Recomendações Práticas e Objetivas de Ação para a operação ou expansão.
6. Use formatação elegante com negrito, listas e emojis operacionais (📦, ⚠️, 🚀, 📈, 📍).
"""

    system_instruction = (
        "Você é o Diretor Sênior de Inteligência da Torre de Controle ANJUN. "
        "Suas respostas são 100% fundamentadas nos dados reais do SQLite da empresa. "
        "Você nunca inventa métricas e comunica de forma executiva, clara e focada em tomada de decisão."
    )

    try:
        if not key:
            # Fallback local sem LLM: formatação tabular automática
            linhas_md = [f"### Resumo de Dados ({len(dados)} registros - {tempo_ms}ms)"]
            if dados:
                cols = list(dados[0].keys())
                header = "| " + " | ".join(cols) + " |"
                sep = "| " + " | ".join(["---"] * len(cols)) + " |"
                linhas_md.extend([header, sep])
                for r in dados[:20]:
                    linhas_md.append("| " + " | ".join(str(r.get(c, "")) for c in cols) + " |")
            return "\n".join(linhas_md)

        if provider == "openrouter":
            return chamar_openrouter(prompt, key, model=ai_cfg.get("openrouter_model"), system_instruction=system_instruction)
        elif provider == "deepseek":
            return chamar_deepseek(prompt, key, system_instruction=system_instruction)
        else:
            genai.configure(api_key=key)
            model = genai.GenerativeModel(model_name='gemini-2.5-flash', system_instruction=system_instruction)
            resp = model.generate_content(prompt)
            return resp.text.strip()
    except Exception as e:
        # Fallback executivo local em caso de chave externa ausente ou instabilidade
        linhas_md = [
            f"### 📊 Relatório Executivo da Torre de Controle",
            f"**Critério Pesquisado:** *{pergunta}*",
            f"**Volume de Registros Analisados:** `{len(dados)} registros` *(Tempo de execução: {tempo_ms}ms)*\n"
        ]
        if dados:
            cols = list(dados[0].keys())
            header = "| " + " | ".join(str(c).upper().replace("_", " ") for c in cols) + " |"
            sep = "| " + " | ".join(["---"] * len(cols)) + " |"
            linhas_md.extend([header, sep])
            for r in dados[:20]:
                linhas_md.append("| " + " | ".join(str(r.get(c, "")) for c in cols) + " |")
        
        linhas_md.append("\n> 💡 *Dica Operacional: Conecte uma chave Gemini válida nas Configurações da Torre para sínteses analíticas avançadas em linguagem natural.*")
        return "\n".join(linhas_md)

# Função legado mantida para compatibilidade com routers existentes
def gerar_conteudo_gemini(
    prompt: str, 
    api_key: Optional[str] = None,
    fallback_report: Optional[str] = None
) -> str:
    ai_cfg = obter_configuracao_ai()
    provider = ai_cfg["provider"]
    key = api_key or ai_cfg["gemini_api_key"] or ai_cfg["openrouter_api_key"] or ai_cfg["deepseek_api_key"]
            
    if not key:
        return f"[ANJUN CO-PILOTO IA - MODO LOCAL OFF-LINE]\n\n" + (
            fallback_report or f"Chave de API do provedor '{provider.upper()}' não configurada."
        )

    system_instruction = (
        "Você é o Assistente IA da Torre de Controle ANJUN Logística. "
        "Suas respostas e relatórios operacionais devem usar linguagem altamente natural e precisa."
    )

    try:
        if provider == "openrouter":
            return chamar_openrouter(prompt, key, model=ai_cfg.get("openrouter_model"), system_instruction=system_instruction)
        elif provider == "deepseek":
            return chamar_deepseek(prompt, key, system_instruction=system_instruction)
        else:
            genai.configure(api_key=key)
            model = genai.GenerativeModel(model_name='gemini-2.5-flash', system_instruction=system_instruction)
            response = model.generate_content(prompt)
            return response.text
    except Exception as e:
        return f"[ANJUN IA]: {fallback_report or str(e)}"
