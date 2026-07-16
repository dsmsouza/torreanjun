# 01 - Visão Geral do Sistema (Torre de Controle ANJUN)

A **Torre de Controle ANJUN** é a plataforma estratégica de monitoramento de transporte e logística dedicada à etapa do **First Mile** (primeira milha) da operação. O principal foco da plataforma é dar visibilidade de ponta a ponta sobre os pacotes coletados, em trânsito e retidos em centros de micro-distribuição (MDs) e hubs regionais.

Este documento formaliza os objetivos estratégicos, as limitações superadas da versão anterior e a definição do produto na nova arquitetura web.

---

## 1. Contexto Operacional: O First Mile na ANJUN

O *First Mile* representa a etapa crítica na qual as mercadorias saem dos vendedores ou marketplaces e são encaminhadas para triagem nos Micro-Distribuidores (MDs). Qualquer gargalo ou atraso nesta etapa compromete diretamente o prazo de entrega final ao consumidor final (Last Mile).

A operação exige:
* **Rastreabilidade Imediata**: Saber exatamente onde a carga está retida.
* **Velocidade de Resposta**: Identificar falhas de lacre, problemas operacionais e gargalos de capacidade em poucas horas.
* **Responsabilidade Definida**: Direcionar justificativas operacionais específicas para cada regional logística da ANJUN.

---

## 2. A Necessidade de Migração (Streamlit para Next.js + FastAPI)

A solução anterior, desenvolvida sob a biblioteca **Streamlit (Python)**, desempenhou um papel vital na validação rápida de regras de negócio. No entanto, o crescimento da escala operacional impôs limites técnicos que justificam esta migração:

| Limitador no Streamlit | Solução na Nova Plataforma Web |
| :--- | :--- |
| **Performance e Concorrência** | Processamento assíncrono no backend (FastAPI) desacoplado de uma SPA otimizada (Next.js 14). |
| **Ausência de Rotas Reais** | Arquitetura baseada em rotas nativas (`/regionais`, `/malha`), melhorando a usabilidade e bookmarking. |
| **Interface Rígida** | Visual premium personalizado com estilo dashboard executivo (inspirado no Power BI e Stitch). |
| **Processamento Pesado em UI** | Cálculos de volumetria e filtros complexos transferidos inteiramente para a API REST. |
| **Sincronização de Estados** | Controle de estado robusto no frontend (React hooks e Context API) sem necessidade de reexecutar todo o script. |

---

## 3. Personas e Perfis de Acesso

O controle de acesso à plataforma é simplificado e dinâmico, baseado em parâmetros da URL (`Search Parameters`), o que permite o compartilhamento ágil de links parametrizados para os envolvidos da malha.

```
                  ┌──────────────────────┐
                  │ URL Search Parameter │
                  └──────────┬───────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
       ?master=diego2026               ?regional=sp
     ┌───────────────────┐         ┌───────────────────┐
     │   Perfil Master   │         │  Perfil Regional  │
     │  (Acesso Total)   │         │ (Acesso Filtrado) │
     └───────────────────┘         └───────────────────┘
```

### A. Perfil Regional (`?regional=[sigla]`)
* **Público**: Gerentes e supervisores de regionais operacionais (ex: SP, RJ, MG).
* **Escopo de Visualização**: Dados operacionais de coletas, backlogs, ocorrências e avaliações exclusivamente pertencentes à sua regional logística correspondente.
* **Ações Permitidas**: Inserir e atualizar justificativas operacionais diárias de sua regional; visualizar painel de malha filtrada e dados de MDs locais.

### B. Perfil Master (`?master=[chave]`)
* **Público**: Diretores operacionais, equipe de BI corporativo e administradores (ex: Diego).
* **Escopo de Visualização**: Visão global e consolidada de todas as regionais do país.
* **Ações Permitidas**: Acesso completo a todas as telas, aprovação de avaliações de MDs, aplicação de penalidades, download e restauração de backups do banco de dados SQLite.

---

## 4. Principais Casos de Uso do Sistema

* **Monitoramento de Backlog e OTR (On-Time Receiving)**: Acompanhar o volume total de pacotes retidos na primeira milha e identificar o envelhecimento da carga (`backlog_aging`).
* **Visualização da Saúde dos MDs**: Dashboard consolidado do score de saúde de cada ponto de coleta com base em erros de lacre, atrasos e penalidades acumuladas.
* **Radar de Malha (D0)**: Processar dinamicamente planilhas operacionais do sistema na pasta `arquivos_status/` para sinalizar instantaneamente discrepâncias na malha no mesmo dia.
* **Geração de Relatórios por IA**: Criação assistida por Inteligência Artificial (Google Gemini) de relatórios executivos como o *Weekly Business Review (WBR)*, cobranças textuais para transportadores e análises de qualidade de processo.
