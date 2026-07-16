# 05 - Regras de Negócio (Torre de Controle ANJUN)

Este documento descreve as regras de negócio, lógicas analíticas, fluxos de validação de dados e políticas operacionais aplicadas no sistema da **Torre de Controle ANJUN**.

---

## 1. Controle de Acesso e Permissões por Parâmetros da URL

A plataforma implementa um modelo de autorização simplificado via URL (`Search Parameters`). A API e a interface devem aplicar os seguintes filtros:

1. **Sem Parâmetro**: Se o usuário acessar a aplicação sem nenhum parâmetro na URL (ex: acessando apenas `localhost:3000`), a interface exibe uma tela de **Acesso Restrito / Bloqueado**.
2. **Filtro de Regional (`?regional=XX`)**:
   * O sistema valida se o valor de `XX` corresponde a uma regional cadastrada (ex: `SP`, `RJ`, `MG`).
   * Toda consulta à API (ex: `/api/resumo`, `/api/mds`) enviará o header ou query parameter `regional=XX`. O backend, por sua vez, deve aplicar a cláusula `WHERE regional = :regional` nas queries SQLite.
   * O usuário da regional **não** visualiza dados consolidados de outras regionais, nem tem acesso à rota `/config` (Gestão de Histórico).
3. **Acesso Master (`?master=[chave]`)**:
   * A chave de acesso do administrador é validada (chave atual configurada: `diego2026`).
   * Fornece acesso total a todas as regionais logísticas e a todas as funcionalidades de sistema, incluindo download de backups, limpeza de tabelas e aplicação de penalidades.

---

## 2. Lógicas Analíticas e de Tempo

O sistema suporta quatro tipos de visões de análise temporal, as quais ditam a forma como o backend seleciona dados da base SQLite:

### A. Diário
* **Condição de Query**: Filtra pela data exata da coluna `dia_base` (formato `DD/MM/AAAA`).
* **Lógica de Seleção**: O operador seleciona um ano/mês de referência, depois o dia operacional. O backend filtra `dia_base = :dia_base`.

### B. Semanal
* **Condição de Query**: Filtra pela semana logística na coluna `semana_base` (formato `AAAA-WXX` ou string da semana correspondente).
* **Lógica de Seleção**: O backend filtra `semana_base = :semana_base`.

### C. Mensal
* **Condição de Query**: Mapeia todos os `dia_base` correspondentes ao mês escolhido.
* **Lógica de Seleção**: O backend agrupa os dias pertencentes ao mês e executa a query usando a cláusula `dia_base IN (dias_do_mes)`.

### D. Período
* **Condição de Query**: Intervalo entre `data_inicio` e `data_fim`.
* **Lógica de Seleção**: O backend gera a lista de todas as datas (no formato `DD/MM/AAAA`) dentro daquele intervalo inclusive e executa a cláusula SQL `dia_base IN (lista_de_datas)`.

---

## 3. SLA de Bipagem (Picos de Horário)

A ANJUN possui uma janela rígida de recebimento e expedição diária no First Mile.
* **Janela de SLA**: Das **08:00** às **18:00**.
* **Lógica de Classificação**:
  * Horário de bipagem entre `08:00` e `18:00` (inclusive) -> Classificado como `🟢 No Horário`.
  * Horário de bipagem anterior a `08:00` ou posterior a `18:00` -> Classificado como `🔴 Crítico (Fora do SLA)`.
  * Formato inválido ou erro de leitura -> Classificado como `⚠️ Hora Inválida`.

---

## 4. Radar de Malha (Processamento Turbo D0)

O "Radar de Malha" analisa planilhas operacionais em tempo real salvas na pasta `backend/arquivos_status/`.

### A. Higienização Dinâmica de Cabeçalhos (`mapear_colunas`)
Como as planilhas extraídas de diferentes sistemas logísticos não possuem cabeçalhos idênticos, o backend aplica uma normalização regex ignorando acentos, espaços e caixa alta:
* Colunas com termos de código/barras (`barcode`, `codigo`, `barras`) -> Mapeadas para `barcode`.
* Colunas com termo de status (`status`) -> Mapeadas para `status`.
* Colunas com termo de sacaria/malote (`saca`, `sacola`, `malote`) -> Mapeadas para `saca`.
* Colunas com termos de ponto de coleta (`md`, `ponto`, `colecao`) -> Mapeadas para `md`.
* Colunas com termo de cliente (`cliente` sem conter ID) -> Mapeadas para `nome_cliente`.
* Colunas com termo regional (`regional`) -> Mapeadas para `regional`.
* Colunas com termo de cidade/origem (`cidade`, `origem`, `municipio`) -> Mapeadas para `cidade`.
* Colunas com termo volumetria/pacotes (`volume`, `total`, `pacotes`) -> Mapeadas para `volume`.
* Colunas com termos temporais (`tempo`, `coleta`, `data`) -> Mapeadas para `tempo_coleta`.

### B. Cálculo de Envelhecimento de Carga (Aging)
* Se a coluna `tempo_coleta` estiver presente na planilha, calcula-se a data de bipagem original.
* O envelhecimento é calculado pela diferença de dias:
  $$\text{dias\_parado} = \text{data\_atual} - \text{data\_bipagem}$$
* Se não houver coluna de tempo, assume-se `dias_parado = 0`.

---

## 5. Saúde e Avaliação de Micro-Distribuidores (MDs)

O Score de Saúde e avaliação de um MD são calculados cruzando dados históricos de coletas, erros de lacre cometidos e as penalidades cadastradas.
* **Score de Saúde**:
  * Avalia a taxa de coleta média: $\text{Taxa} = \frac{\text{Volume Total} - \text{Backlog}}{\text{Volume Total}} \times 100$.
  * Deduz pontos de saúde com base nas penalidades associadas na tabela `penalidades_md`.
* **Avaliação Manual**:
  * Perfis master podem registrar decisões de auditoria (`Aprovado`, `Alerta`, `Suspenso`) e justificativas na tabela `avaliacao_md`, que define o status operacional ativo do parceiro MD.
