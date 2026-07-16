# 04 - Estrutura de Pastas (Torre de Controle ANJUN)

Este documento define a organização do repositório de código e a convenção de nomenclatura de pastas e arquivos no workspace da **Torre de Controle ANJUN** (`C:\ANJUN`).

---

## 1. Visão Geral do Monorepo

O projeto é estruturado em duas pastas principais na raiz do workspace, separando de forma limpa o código do servidor (backend) e o código do cliente (frontend), além da pasta de documentação técnica.

```
C:\ANJUN
├── docs/                 # Documentação técnica e operacional do projeto
├── backend/              # Aplicação REST API em FastAPI (Python)
└── frontend/             # Aplicação Next.js 14 Web App (React)
```

---

## 2. Detalhamento do Diretório `backend/`

A estrutura do backend segue um padrão modular clássico para aplicações FastAPI, mantendo as lógicas de negócio separadas de rotas e banco de dados.

```
backend/
├── venv/                 # Ambiente virtual Python (ignorado pelo Git)
├── arquivos_status/      # Pasta de leitura automática de planilhas locais (atual.xlsx)
├── database/             # Arquivos de conexão e manipulação direta do SQLite
│   ├── connection.py     # Criação da SessionLocal e Engine do SQLAlchemy
│   └── database.py       # Inicialização básica e funções utilitárias de DB
├── models/               # Modelos ORM do SQLAlchemy
│   └── models.py         # Mapeamento das tabelas SQLite
├── schemas/              # Modelos de validação de dados Pydantic
│   └── schemas.py        # Tipos de dados para respostas dos endpoints
├── services/             # Regras de negócio e processamento de dados (Pandas)
│   ├── operacional.py    # Migração das funções de cálculo analítico do Streamlit
│   └── gemini_service.py # Integração com o Google Gemini API
├── routers/              # Definição dos endpoints REST
│   ├── operacional.py    # Rotas de dados, regionais, malha e clientes
│   └── config.py         # Rotas de backups e configurações da base
├── .env                  # Variáveis de ambiente locais (portas, chaves)
├── main.py               # Ponto de entrada da aplicação FastAPI e setup de CORS
├── requirements.txt      # Arquivo de dependências Python
└── torre_anjun.db        # Banco de dados SQLite copiado da origem local
```

---

## 3. Detalhamento do Diretório `frontend/`

O frontend adota a estrutura padrão do Next.js 14 utilizando o App Router, organizando componentes visuais e lógica de consumo de API de forma modular.

```
frontend/
├── app/                  # Roteamento baseado em arquivos (App Router)
│   ├── layout.tsx        # Layout global (Sidebar, Topbar, Provider de Temas)
│   ├── page.tsx          # Rota padrão (/) - Visão Geral (Dashboard)
│   ├── regionais/        # Rota (/regionais) - Performance por Regional
│   │   └── page.tsx
│   ├── filial/           # Rota (/filial) - Filtros específicos por Filial
│   │   └── page.tsx
│   ├── clientes/         # Rota (/clientes) - Métricas por Clientes Marketplace
│   │   └── page.tsx
│   ├── malha/            # Rota (/malha) - Radar de Malha D0 (arquivos_status)
│   │   └── page.tsx
│   ├── config/           # Rota (/config) - Gestão de Histórico e Backups
│   │   └── page.tsx
│   └── login/            # Tela de Acesso Negado / Login Simples
│       └── page.tsx
├── components/           # Componentes React reutilizáveis da aplicação
│   ├── ui/               # Componentes atômicos instalados pelo shadcn/ui
│   │   ├── card.tsx
│   │   ├── table.tsx
│   │   ├── button.tsx
│   │   └── dialog.tsx
│   ├── StitchCard.tsx    # Card estatístico personalizado estilo glassmorphism
│   ├── DataTable.tsx     # Tabela de dados integrada com filtros dinâmicos
│   ├── FormJustificativa.tsx # Form para envio de justificativas diárias
│   └── ChatIA.tsx        # Chatbot de suporte integrado ao Gemini
├── hooks/                # React Hooks customizados
│   └── useAuth.ts        # Hook para controle de rotas por URL searchParams
├── lib/                  # Funções auxiliares e clientes de consumo de API
│   ├── api.ts            # Funções de requisições HTTP (Fetch wrappers)
│   └── utils.ts          # Utilitários gerais (formatação de valores, datas)
├── public/               # Recursos estáticos (Logotipo, Imagens)
├── .env.local            # Variáveis de ambiente locais do frontend
├── package.json          # Dependências e scripts do Node.js
├── tailwind.config.ts    # Configuração de design tokens do Tailwind CSS
└── tsconfig.json         # Configuração de tipos TypeScript
```

---

## 4. Convenções de Nomenclatura e Código

Para assegurar a legibilidade e a consistência em todo o projeto, as seguintes regras de nomenclatura são obrigatórias:

* **Arquivos e Pastas do Frontend**:
  * Pastas de rotas e arquivos utilitários: `kebab-case` (ex: `app/dados-operacionais/`, `use-auth.ts`).
  * Arquivos de componentes React: `PascalCase` (ex: `StitchCard.tsx`, `FormJustificativa.tsx`).
* **Arquivos e Pastas do Backend**:
  * Módulos e funções Python: `snake_case` (ex: `operacional.py`, `carregar_dados_operacionais()`).
  * Classes Python: `PascalCase` (ex: `JustificativaCreate`, `HistoricoTorreModel`).
* **Padrão de Commits (Conventional Commits)**:
  * As mensagens de alteração no repositório de código devem seguir o padrão estruturado:
    * `feat(backend):` para inclusão de novos recursos ou endpoints.
    * `fix(frontend):` para correção de bugs de interface.
    * `docs:` para alterações na documentação.
    * `refactor:` para refatoração de código sem alteração funcional.
