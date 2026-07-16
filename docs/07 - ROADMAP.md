# 07 - Roadmap de Desenvolvimento (Torre de Controle ANJUN)

Este documento define o plano de entrega iterativo e incremental para a migração da **Torre de Controle ANJUN**, organizado em 9 fases detalhadas (do setup ao encerramento).

---

## 1. Cronograma de Fases

O tempo estimado para conclusão de todo o ciclo de migração é de **12 dias úteis**, considerando o desenvolvimento focado em ambiente local e offline.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ [F0] Setup ──> [F1] API Backend ──> [F2] Layout Next.js ──> [F3] Visão Geral │
└──────────────────────────────────────────────────┬──────────────────────┘
                                                   │
┌──────────────────────────────────────────────────▼──────────────────────┐
│ [F4] Regionais ──> [F5] Radar Malha ──> [F6] IA Gemini ──> [F7] Configs   │
└──────────────────────────────────────────────────┬──────────────────────┘
                                                   │
                                                   ▼
                                         [F8] Ajustes Finais
```

---

## 2. Detalhamento das Fases

### Fase 0 – Preparação do Ambiente Antigravity (Dia 1)
* **Objetivo**: Inicialização física da estrutura do projeto na máquina de desenvolvimento.
* **Tarefas**:
  1. Criação das pastas `backend/` e `frontend/` sob o diretório `C:\ANJUN`.
  2. Cópia do arquivo original do banco de dados `torre_anjun.db` da pasta de origem `C:\anjun_local\` para a pasta `C:\ANJUN\backend\`.
  3. Inicialização e ativação do ambiente virtual Python (`venv`) na pasta backend.
  4. Escrita do arquivo `requirements.txt` e instalação de dependências via pip.
  5. Criação do esqueleto Next.js 14 via `npx` na pasta frontend com TypeScript, Tailwind CSS e shadcn/ui.
* **Resultado**: Servidor backend rodando rota `GET /` (Hello World) e frontend exibindo landing page básica de template Next.js.

### Fase 1 – Backend: API de Dados Operacionais (Dias 2 e 3)
* **Objetivo**: Construção de todos os endpoints REST no FastAPI responsáveis por ler e servir dados operacionais e históricos.
* **Tarefas**:
  1. Criação da conexão SQLAlchemy e definição dos modelos baseados no banco SQLite existente.
  2. Implementação do arquivo `schemas.py` com validações Pydantic de entrada e saída.
  3. Desenvolvimento das rotas `/api/resumo`, `/api/malha`, `/api/justificativas`, `/api/mds`, `/api/clientes`.
  4. Configuração de CORS no FastAPI para autorizar a origem `http://localhost:3000`.
* **Resultado**: Swagger UI do backend (`/docs`) operacional e retornando dados reais extraídos do SQLite.

### Fase 2 – Frontend: Layout Base e Roteamento (Dia 4)
* **Objetivo**: Construção do esqueleto visual da aplicação Next.js e controle de acesso inicial.
* **Tarefas**:
  1. Criação do layout global (`Layout.tsx`) contendo a barra lateral de navegação fixa com links dinâmicos.
  2. Desenvolvimento do hook customizado `useAuth.ts` para capturar os parâmetros da URL (`?regional=` ou `?master=`) e restringir telas.
  3. Setup de pastas de rotas do App Router (`/regionais`, `/filial`, `/clientes`, `/malha`, `/config`) com placeholders informativos de "Em Construção".
* **Resultado**: Navegação funcional em SPA com controle de acesso integrado.

### Fase 3 – Tela de Visão Geral (Dias 5 e 6)
* **Objetivo**: Implementação do Dashboard principal da Torre.
* **Tarefas**:
  1. Desenvolvimento do componente `StitchCard` com efeitos de glassmorphism para exibir indicadores chave (Volume, Backlog, Taxa de Coleta, Erros).
  2. Criação da tabela principal de regionais com capacidade de clique na linha para filtrar dados (substituindo a lógica de estado do Streamlit).
  3. Criação e vinculação do formulário de justificativas operacionais diárias.
* **Resultado**: Tela inicial com dados operacionais reais e dinâmicos consumidos diretamente do backend.

### Fase 4 – Tela Performance Regionais & Filiais (Dia 7)
* **Objetivo**: Detalhar métricas de performance focadas na malha de distribuição de MDs.
* **Tarefas**:
  1. Criação da interface de listagem de MDs ordenados por taxa de coleta e criticidade.
  2. Criação de filtros dinâmicos de busca de MDs e filiais no topo da página.
  3. Renderização de dados históricos baseados em visualização diária, semanal e mensal.
* **Resultado**: Tela `/regionais` e `/filial` totalmente funcionais integradas aos dados da API.

### Fase 5 – Telas de Malha (Radar D0), Clientes e MD Score (Dias 8 e 9)
* **Objetivo**: Conclusão das telas satélites de monitoramento da malha.
* **Tarefas**:
  1. Migração do motor de leitura do arquivo `atual.xlsx` da pasta `arquivos_status` no backend (Foco em processamento assíncrono).
  2. Criação do painel `/malha` no frontend com tabela de pacotes parados e botão de exportação para CSV.
  3. Visualização do Score de Saúde e listagem de penalidades dos MDs.
* **Resultado**: Visualizações de malha ativa em tempo real funcionais.

### Fase 6 – Assistente IA e Geração de Relatórios (Dia 10)
* **Objetivo**: Integração do assistente cognitivo Gemini nos painéis operacionais.
* **Tarefas**:
  1. Criação do endpoint `POST /api/ia/gerar` no FastAPI integrado ao SDK do Gemini.
  2. Criação do componente visual `ChatIA` flutuante nas telas operacionais.
  3. Programação dos prompts predefinidos: WBR semanal, Cobrança de transportadora e Qualidade do processo.
* **Resultado**: Relatórios automatizados gerados por IA com um único clique.

### Fase 7 – Gestor de Histórico, Backups e Configurações (Dia 11)
* **Objetivo**: Dashboard administrativo para gerenciar a base de dados.
* **Tarefas**:
  1. Criação de endpoints seguros para download do arquivo `torre_anjun.db` (`GET /api/backup`).
  2. Endpoint para restauração/upload do banco de dados SQLite (`POST /api/restore`).
  3. Criação de botões com modais de confirmação na rota `/config`.
* **Resultado**: Administração completa do banco de dados protegida por autenticação Master.

### Fase 8 – Ajustes Finais, Responsividade e Testes (Dia 12)
* **Objetivo**: Polimento final da aplicação antes do lançamento para homologação.
* **Tarefas**:
  1. Ajustes finos de interface para telas de computadores portáteis (Desktop-First).
  2. Otimização de caching de requisições no frontend para evitar recargas excessivas.
  3. Validação de segurança dos fluxos de URL parametrizada.
* **Resultado**: Sistema pronto, homologado e documentado para uso em produção local.
