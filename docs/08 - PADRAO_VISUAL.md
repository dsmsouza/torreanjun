# 08 - Padrão Visual (Torre de Controle ANJUN)

Este documento estabelece as diretrizes de design, identidade visual, paleta de cores, tipografia e padrões de interface (UI/UX) para a nova aplicação web da **Torre de Controle ANJUN**.

O objetivo é garantir uma interface premium, sofisticada e limpa (estilo dashboards corporativos do Stitch e do Power BI), utilizando um **tema escuro (Dark Mode)** com efeitos de **glassmorphism** (vidro fosco).

---

## 1. Princípios de Design

* **Densidade de Informação**: Por ser uma ferramenta estritamente operacional e de monitoramento analítico, a densidade de dados deve ser média-alta, aproveitando ao máximo a tela sem gerar poluição visual.
* **Foco no Operador**: Elementos críticos de alerta (como backlogs acumulados e estouros de SLA) devem ter destaque visual imediato (uso estratégico de cores de status).
* **Consistência de Estado (SPA)**: Transições suaves entre páginas e estados de loading amigáveis nos cards e tabelas durante requisições de API.

---

## 2. Paleta de Cores (Design Tokens)

O tema padrão do sistema é escuro, utilizando tons de cinza azulado para profundidade e cores vibrantes para sinalização de status operacionais.

### Cores Base (Fundo e Contêineres)
* **Background Global**: `#090D16` (Azul escuro profundo - HSL `224 71% 4%`)
  * Uso: Cor de fundo de toda a aplicação.
* **Card Container (Glassmorphism)**: `#131926` com opacidade de 60% e borda sutil.
  * Uso: Fundo de cards estatísticos, tabelas e janelas de chat.
  * Efeito CSS: `backdrop-filter: blur(12px); background-color: rgba(19, 25, 38, 0.6); border: 1px solid rgba(255, 255, 255, 0.08);`
* **Sidebar / Navegação**: `#0C101B`
  * Uso: Fundo da barra lateral fixa de navegação.

### Cores de Status e Ação (Semânticas)
* **Azul de Ação (Primary)**: `#3B82F6` (Azul clássico)
  * Uso: Links ativos, botões de ação principal, seleções de linha.
* **Verde Sucesso (SLA OK)**: `#10B981` (Esmeralda)
  * Uso: Indicadores de conformidade, taxa de coleta acima do esperado.
* **Amarelo Atenção (Alerta)**: `#F59E0B` (Âmbar)
  * Uso: Pequenos atrasos de bipagem, MDs em observação.
* **Vermelho Crítico (Fora de SLA)**: `#EF4444` (Vermelho operacional)
  * Uso: Pacotes parados (aging alto), erros de lacre, suspensões.

---

## 3. Tipografia

A legibilidade dos números operacionais é prioridade número um na Torre de Controle ANJUN.

* **Fonte Primária**: `Inter` ou `Outfit` (importadas via Google Fonts).
  * Substitutas do sistema: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`.
* **Fonte Numérica (KPIs)**: `Outfit` ou fontes monoespaçadas no caso de tabelas com dados numéricos para evitar desalinhamento.
* **Hierarquia**:
  * Títulos de Tela (`h1`): `30px`, Semi-Bold, cor branca pura (`#FFFFFF`).
  * Títulos de Cards (`h2`/`h3`): `16px`, Medium, cor cinza claro (`#94A3B8`).
  * Valores de KPI principais: `36px`, Bold, cor branca pura (`#FFFFFF`).
  * Textos de Tabela e Listas: `14px`, Regular, cor cinza médio (`#CBD5E1`).

---

## 4. Componentes Visuais Padrão (UI Components)

### A. StitchCard (Card de Métrica Glassmorphism)
Um card estatístico com cantos arredondados, borda brilhante e fundo translúcido para exibição de KPIs operacionais.

```
┌────────────────────────────────────────┐
│  📦 Volume Total           [ Ícone ]   │
│                                        │
│  42.508 pacotes                        │
│  ────────────────────────────────────  │
│  🟢 +12% em relação à média semanal    │
└────────────────────────────────────────┘
```
* **CSS Básico**:
  ```css
  .stitch-card {
    background: rgba(19, 25, 38, 0.6);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4);
  }
  ```

### B. Tabela de Dados (DataTable)
Tabelas de dados escuras com linhas zebradas sutis e efeito de hover azulado.
* Cabecalho da tabela: `#1E293B` (cinza escuro).
* Linha selecionada: Borda esquerda azul `#3B82F6` com fundo levemente clareado.
* Paginação integrada na base de forma limpa.

### C. Chat de IA (Janela Flutuante)
* Fundo do chat combinando com o tema escuro.
* Mensagens do Usuário: Bolha de texto azulada (`#2563EB`) alinhada à direita.
* Mensagens do Assistente (Gemini): Bolha de texto cinza escura (`#1E293B`) alinhada à esquerda com suporte à renderização de tabelas e listas Markdown.
* Botões rápidos de geração de prompt com estilo Outline azul.

---

## 5. Micro-Interações e Animações

* **Hover de Card**: Elevação sutil do card operacional (`transform: translateY(-2px)`) com transição de 200ms.
* **Transição de Rota**: Efeito *fade-in* suave ao carregar novas páginas para garantir a sensação de agilidade de uma Single Page Application.
* **Loading Skeleton**: Efeito animado pulssante de cinza claro (`animate-pulse`) nos locais dos dados numéricos enquanto as chamadas de API estão pendentes.
