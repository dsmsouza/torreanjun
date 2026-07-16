# 03 - Stack Tecnológica (Torre de Controle ANJUN)

Este documento descreve detalhadamente as especificações das tecnologias, frameworks, bibliotecas e dependências adotadas para a **Torre de Controle ANJUN**.

---

## 1. Visão Geral da Stack

A arquitetura de migração visa a independência de serviços e a otimização de execução local. As tecnologias foram escolhidas para garantir a máxima compatibilidade e simplicidade de instalação no ambiente local do usuário.

```
       FRONTEND WEB                       BACKEND API                    BANCO DE DADOS
 ┌──────────────────────┐           ┌──────────────────────┐         ┌────────────────────┐
 │  Next.js 14 (React)  │ <───────> │  FastAPI + Uvicorn   │ <─────> │ SQLite (Local .db) │
 │  Tailwind + shadcn   │   JSON    │  SQLAlchemy + Pandas │   SQL   │  torre_anjun.db    │
 └──────────────────────┘           └──────────────────────┘         └────────────────────┘
```

---

## 2. Camada de Backend (API REST)

O backend é desenvolvido em Python, garantindo consistência com a lógica analítica e de Inteligência Artificial herdada do Streamlit.

* **Linguagem**: Python 3.12 ou superior.
* **Framework Web**: **FastAPI** (v0.110+)
  * Motivo: Altíssima performance assíncrona, documentação interativa automática com Swagger UI (`/docs`), validação automática de dados de entrada e saída.
* **Servidor ASGI**: **Uvicorn** (v0.28+)
  * Motivo: Leve, rápido e ideal para hospedar a aplicação localmente.
* **Mapeamento Objeto-Relacional (ORM)**: **SQLAlchemy** (v2.0+)
  * Motivo: Facilidade de transição e abstração SQL para o banco SQLite.
* **Processamento de Dados**:
  * **Pandas** (v2.2+): Processamento eficiente e higienização de grandes volumes de dados.
  * **python-calamine** (v0.2+): Motor de leitura ultrarrápido escrito em Rust para carregar planilhas Excel `.xlsx` e `.xls` sem o peso de bibliotecas como openpyxl.
* **SDK de Inteligência Artificial**: **google-generativeai** (v0.4+)
  * Motivo: Integração direta e otimizada com o modelo Gemini Flash.
* **Validação e Tipagem**: **Pydantic v2**
  * Motivo: Validação rigorosa de payloads de entrada/saída nos endpoints da API.

---

## 3. Camada de Frontend (Dashboard Web)

O frontend é projetado como uma aplicação web moderna de alto padrão estético.

* **Framework Base**: **Next.js 14** (App Router)
  * Motivo: Roteamento baseado em arquivos extremamente flexível, otimização de assets e estrutura robusta de componentes React.
* **Biblioteca UI**: **React 18**
* **Estilização**: **TailwindCSS** (v3.4+)
  * Motivo: Produtividade acelerada e personalização pixel-perfect.
* **Componentes de Interface (Design System)**: **shadcn/ui** (baseado em Radix UI e Tailwind)
  * Motivo: UI de nível profissional, acessível e customizável sem necessidade de instalar pacotes monolíticos de componentes.
  * Componentes essenciais: *Card*, *Table*, *Select*, *Dialog*, *Dropdown Menu*, *Button*, *Input*, *Toast*.
* **Iconografia**: **Lucide React**
  * Motivo: Biblioteca moderna e limpa de ícones consistentes.
* **Gerenciamento de Requisições**: Fetch API nativa.

---

## 4. Banco de Dados

* **Banco de Dados**: **SQLite 3**
* **Arquivo**: `torre_anjun.db`
  * Motivo: Banco de dados relacional embarcado, sem dependências de serviços adicionais de infraestrutura ou servidores externos. Perfeito para execução local rápida e portabilidade simples (backup/restauração direta de arquivos).

---

## 5. Ferramentas de Desenvolvimento e Execução

* **Ambiente Virtual Python**: `venv` (instalado na raiz do diretório `backend/`).
* **Gerenciamento de Pacotes Python**: `pip` (gerenciado via arquivo `requirements.txt`).
* **Gerenciamento de Pacotes Node.js**: `npm` (gerenciado via arquivo `package.json`).
* **Launcher Concorrente**: `concurrently` (ferramenta npm utilizada no ambiente de desenvolvimento para subir o backend do FastAPI e o frontend do Next.js simultaneamente em um único comando no terminal).
* **Variáveis de Ambiente**:
  * Backend: Arquivo `.env` na pasta `backend/` contendo a porta do servidor, segredos locais e variáveis de cache.
  * Frontend: Arquivo `.env.local` na pasta `frontend/` contendo a URL base da API (`NEXT_PUBLIC_API_URL`).
