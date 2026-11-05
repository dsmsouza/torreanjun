# 🧠 CÉREBRO DO SISTEMA — TORRE DE CONTROLE ANJUN

> **LEITURA MANDATÓRIA AO INICIAR UMA NOVA CONVERSA**  
> Este documento é a **Fonte Única da Verdade (Single Source of Truth)** da Torre de Controle ANJUN. Ele consolida toda a arquitetura técnica, regras de negócio logísticas, máquina de estados, mapeamento de colunas das planilhas, histórico de decisões e status das aplicações.

---

## 1. Visão Geral e Arquitetura do Sistema

A **Torre de Controle ANJUN** é a plataforma de inteligência operacional e auditoria logística da ANJUN Express no Brasil. O sistema monitora a malha nacional de MiniDrops (MDs), Pontos de Apoio (PAs), HUBs de transferência, rotas de coleta (Pickup) e entrega balcão (Drop-off) para os 4 grandes marketplaces parceiros (**Shein, TikTok Shop, TEMU e Kwai**) e centenas de sellers independentes.

### Stack Tecnológica
- **Backend:** Python 3.14 + FastAPI + SQLite3 + Uvicorn + Haversine Geo-calc.
- **Frontend:** Next.js 16 (App Router) + React 19 + Tailwind CSS + Lucide Icons + Turbopack.
- **Banco de Dados:** `C:\ANJUN\backend\coletas.db` (SQLite em modo WAL com índices otimizados).
- **Robôs e Automação:**
  - Bot do Telegram: `@anjun_torre_bot` (`backend/telegram_bot/bot.py`) via long-polling assíncrono.
  - Agendador Autônomo: `backend/services/agendador_automatico.py` (sincronização periódica + consolidação noturna).
- **Ambiente Operacional:** Windows PowerShell (Encoding UTF-8 obrigatório ao executar scripts python via terminal: `& 'C:\ANJUN\backend\venv\Scripts\python.exe'`).

---

## 2. Daemons e Processos em Background

Quando o ambiente estiver ativo, os serviços devem rodar ou ser validados nos seguintes endereços:
1. **Backend FastAPI:** `http://127.0.0.1:8000` (Docs: `http://127.0.0.1:8000/docs`).
2. **Frontend Next.js:** `http://localhost:3000` (Dev server com Turbopack).
3. **Telegram Bot:** Executando em background conectado ao bot token oficial.
4. **Agendador:** Monitorando sincronizações horárias e geração de snapshots estáticos.

---

## 3. Regras de Negócio e Taxonomia Logística Oficiais

### 3.1. Marketplaces (4 Oficiais)
- **Shein, TikTok, TEMU, Kwai.**
- ⚠️ **NÃO AFIRME MODALIDADE FIXA:** Todo marketplace e todo seller pode movimentar tanto pacotes **D2D** quanto **W2D**. A modalidade operacional real é determinada pelo cruzamento da **Coluna H (`maneira de coleta`)** com a **Coluna BH (`Tipo do pedido`)** e o **Ponto de Coleção (Coluna P)**.

### 3.2. Diferenciação Mandatória: DROPOFF vs PICKUP
1. **Tudo o que for bipado por MiniDrop (MD) é DROPOFF:**
   - Independentemente de constar "entrega porta-a-porta" ou "coleta porta-a-porta" na etiqueta, se o ponto de coleção for um MD credenciado, o pacote foi acolhido no balcão do ponto parceiro = **DROPOFF**.
2. **Quando o ponto de coleção NÃO for MD (ex.: HUB, Galpão, PA ou base regional em estados sem rede de MDs, como Pernambuco):**
   - Se `Coluna H` = `coleta porta-a-porta` ➔ **PICKUP** (veículo da ANJUN foi fisicamente ao endereço do seller coletar a carga).
   - Se `Coluna H` = `entrega porta-a-porta` ➔ **DROPOFF** (seller levou a carga até a doca/balcão do HUB que atua como ponto de apoio).

### 3.3. Sellers com PA vs Sellers Pickup Avulso
- **Seller com PA (Posto Avançado):** Sellers de altíssimo volume que possuem equipe da ANJUN alocada dentro do seu galpão. O seller produz, a equipe da ANJUN bipa os pacotes in loco e os caminhões de linha recolhem.
- **Seller Pickup Convencional:** Não há equipe da ANJUN no local. O seller gera e empacota, e a rota de vans da ANJUN passa no endereço para coletar.
- **Identificação do Seller nas Colunas:**
  - `Coluna D`: `No. do cliente` (Atenção: contém tanto código de Seller quanto código de Marketplace).
  - `Coluna V`: `Número do Cliente Comerciante` (Merchant ID exclusivo).
  - `Coluna W`: `Nome do Cliente Merchant` (Nome fantasia / Razão).
  - `Coluna AB`: `remetente` (Nome impresso na etiqueta de expedição).
  - `Coluna AE`: `CEP do remetente` (CEP de origem do comerciante).

---

## 4. Máquina de Estados e Ciclo de Vida do Pacote

### 🏪 A. Pacotes Dropados no MiniDrop (MD) — Ciclo COM SACA
O fluxo correto possui 5 etapas sequenciais:
```
[coletado] ➔ [saco selado] ➔ [Carregamento] ➔ [Descarregamento] ➔ [Circuito fechado]
```
- **coletado:** Pacote recebido individualmente no balcão do MD.
- **saco selado:** O atendente do MD consolida os pacotes dentro de uma saca lacrada com número de lacre. Fica em **backlog** aguardando a van da ANJUN.
- **Carregamento:** Motorista da ANJUN bipa o lacre/saca na coleta e embarca no veículo (em trânsito).
- **Descarregamento:** Saca chega na doca do HUB de triagem da ANJUN.
- **Circuito fechado:** A saca é aberta no HUB, os pacotes são conferidos individualmente e finalizados no First Mile (FM) para direcionamento ao Last Mile (LM).

### 🚚 B. Pacotes Pickup no Seller ou PA — Ciclo SEM SACA (Pacote a Pacote)
O fluxo correto possui 4 etapas sequenciais:
```
[coletado] ➔ [Carregamento] ➔ [Descarregamento] ➔ [Circuito fechado]
```
- ⚠️ **REGRA CRÍTICA:** **NÃO EXISTE ETAPA `saco selado` NO PICKUP E NO PA!** No pickup em seller/PA, a coleta é feita pacote a pacote (volumes soltos). Se um pacote de pickup apresentar status `saco selado`, trata-se de contaminação de bipagem operacional.

### 🚨 C. Anomalias Operacionais Críticas
1. **`Foi assinado` (Possível Extravio Grave):**
   - Ocorre quando a saca lacrada percorreu o trajeto até o HUB de destino, mas ao abrir e conferir os pacotes, **aquele pacote específico não estava dentro da saca**. Sinaliza furto ou extravio no ponto de coleta/transporte.
2. **Pulo de Etapas (Saltos Operacionais):**
   - Pacotes que transitam direto de `coletado` ou `saco selado` para `Circuito fechado`, sem bipe de `Carregamento` ou `Descarregamento` do motorista. O pacote deu certo no final, mas houve falha de auditoria na transferência.
3. **MISSCAN (Drop-offs sem Ponto de Coleção):**
   - Pacotes com maneira de coleta Drop-off (`entrega porta-a-porta`), mas com o campo `ponto de coleção` **vazio**, tendo avançado para `Carregamento`, `Descarregamento` ou `Circuito fechado`.
   - **Causa:** O seller entregou no balcão do MD, o atendente não bipou a entrada e entregou para o motorista solto ou colocou na saca sem bipe.
   - **Impacto:** O MD parceiro perde a remuneração pelo pacote e a ANJUN perde o marco zero de custódia.
   - **Auditoria Geodésica por Raio:** O sistema cruza o CEP do Seller (`Coluna AE`) com a malha de coordenadas geográficas de 3.949 MDs cadastrados (`malha_coordenadas`), calculando via Haversine os MDs mais prováveis em um raio configurável (3 km, 5 km, 10 km, 15 km).

### ⏳ D. O Motor Dinâmico de Aging
- Pacotes retidos nas etapas iniciais acumulam idade (`dias_sem_atualizacao`):
  - **D0 / D1 (0 a 24h):** Operação normal / saudável.
  - **D2 (24h a 48h):** Pré-estouro de SLA / Alerta para o roteirizador coletar com prioridade matinal.
  - **D3+ (> 72h):** Estouro crítico de SLA / Risco iminente de perda.

---

## 5. Mapeamento Completo de Colunas da Planilha Oficial (`02-11.xlsx`)

A planilha padrão diária de coletas da ANJUN possui **66 colunas (Coluna A até Coluna BN)**:

| Coluna | Letra | Nome do Cabeçalho Oficial | Função no Sistema |
|---|---|---|---|
| 0 | A | `No.` | Sequencial da linha |
| 1 | B | `código do pedido` | ID único / Tracking number do pacote |
| 2 | C | `Número do pedido de venda do comerciante` | Pedido no Seller / Pedido Marketplace |
| 3 | D | `No. do cliente` | Código do Seller ou do Marketplace |
| 4 | E | `Nome do cliente` | Nome cadastral da conta cliente |
| 5 | F | `Tipo de negócio` | Classificação do negócio |
| 6 | G | `tipo de entrega` | Modalidade da entrega |
| 7 | H | `maneira de coleta` | `coleta porta-a-porta` (Pickup) vs `entrega porta-a-porta` (Drop-off) |
| 8 | I | `código do cliente do comerciante` | Sub-código do comerciante |
| 9 | J | `Nome de registro de comerciante` | Razão social de registro |
| 10 | K | `ponto de envio` | Ponto logístico de expedição |
| 11 | L | `Data de criação do pedido` | Timestamp de criação no sistema |
| 12 | M | `Horário de recolhimento` | Timestamp de bipagem da coleta no ponto |
| 13 | N | `Horário de assinatura` | Timestamp de finalização / assinatura |
| 14 | O | `Status do pedido` | Status: `coletado`, `saco selado`, `Carregamento`, `Descarregamento`, `Circuito fechado`, `Foi assinado`, `Cancelado` |
| 15 | P | `ponto de coleção` | Código do MD parceiro, HUB ou Ponto de Apoio |
| 16 | Q | `Primeiro tempo de varredura de recebimento` | Primeiro bipe físico |
| 17 | R | `Tempo de digitalização do primeiro pacote de entrega` | Bipe do primeiro pacote |
| 18 | S | `Primeiro tempo de varredura de retorno` | Bipe de devolução |
| 19 | T | `Tempo de digitalização do segundo pacote de entrega` | Segundo bipe |
| 20 | U | `Terceiro tempo de varredura de retorno` | Terceiro bipe devolução |
| 21 | V | `Número do Cliente Comerciante` | Merchant ID exclusivo do Seller |
| 22 | W | `Nome do Cliente Merchant` | Nome Fantasia do Comerciante / Seller |
| 23 | X | `Mercadorias perigosas ou não` | Indicador de carga perigosa |
| 24 | Y | `Tipo de mercadorias perigosas` | Classe de risco |
| 25 | Z | `Seguro ou não` | Carga assegurada (Sim/Não) |
| 26 | AA | `Valor declarado` | Valor em R$ |
| 27 | AB | `remetente` | Nome do remetente na etiqueta |
| 28 | AC | `telefone de envio` | Telefone de contato do remetente |
| 29 | AD | `Celular do remetente` | Celular do remetente |
| 30 | AE | `CEP do remetente` | CEP de origem da carga |
| 31 | AF | `província de entrega` | Estado (UF) de envio |
| 32 | AG | `Cidade de entrega` | Cidade de envio |
| 33 | AH | `área de entrega` | Bairro / Região de envio |
| 34 | AI | `endereço de envio` | Logradouro e número |
| 35 | AJ | `destinatário` | Nome do comprador / destinatário |
| 36 | AK | `telefone de recebimento` | Telefone do comprador |
| 37 | AL | `Celular do destinatário` | Celular do comprador |
| 38 | AM | `CEP do destinatário` | CEP de destino do comprador |
| 39 | AN | `província de recebimento` | UF de destino |
| 40 | AO | `Cidade de recebimento` | Cidade de destino |
| 41 | AP | `área de recebimento` | Bairro de destino |
| 42 | AQ | `endereço de entrega` | Endereço final do comprador |
| 43 | AR | `tipo de carga` | Descrição do produto |
| 44 | AS | `peso(kg)` | Peso bruto |
| 45 | AT | `comprimento(cm)` | Dimensão C |
| 46 | AU | `largura(cm)` | Dimensão L |
| 47 | AV | `altura(cm)` | Dimensão A |
| 48 | AW | `volume(cm³)` | Volume cúbico |
| 49 | AX | `Número de pacotes` | Quantidade de volumes |
| 50 | AY | `cobrança no recebimento de produtos ou não` | Pagamento no ato |
| 51 | AZ | `tipo de pagamento` | Forma de frete/pagamento |
| 52 | BA | `valor a ser cobrado` | Valor a receber |
| 53 | BB | `valor do frete` | Custo do frete |
| 54 | BC | `taxa de serviço de pagamento` | Taxa bancária/financeira |
| 55 | BD | `outras taxas` | Despesas acessórias |
| 56 | BE | `taxa total` | Total em R$ |
| 57 | BF | `observações` | Instruções operacionais |
| 58 | BG | `mercadorias` | Itens contidos |
| 59 | BH | `Tipo do pedido` | `Normal`, `Pedidos D2D`, `Cut-off`, `Pedido de carga grande` |
| 60 | BI | `Tipo de mercadorias` | Subtipo de mercadoria |
| 61 | BJ | `Armazém do cliente` | Galpão ou filial do cliente |
| 62 | BK | `Tempo de digitalização do primeiro pacote de recebimento` | Bipe primário de recebimento |
| 63 | BL | `Segundo tempo de varredura de recebimento` | Bipe secundário |
| 64 | BM | `Terceiro tempo de varredura de recebimento` | Bipe terciário |
| 65 | BN | `Segundo tempo de varredura de retorno` | Bipe secundário de retorno |

---

## 6. Telas e Estrutura de Navegação do Sistema

O menu lateral (`frontend/components/Sidebar.tsx`) foi otimizado e focado nas funcionalidades essenciais:
- **Itens Removidos (Não faziam sentido no momento):**
  - ❌ `NO DIA` (`/no-dia`)
  - ❌ `D2D SP` (`/d2d-sp`)
  - ❌ `Saturação de Rotas` (`/saturacao-rotas`)

### Telas Principais:
1. **Torre de Coletas (`/` - Página Inicial):**
   - Resumo Executivo Nacional por Regiões e Estados.
   - Cards de Status: Circuito Fechado, Em Trânsito, Backlog no MD, Foi Assinado.
   - **Banner de Alertas Inteligentes:** 1ª Bipagem na História, Pontos Não Cadastrados e **Auditoria de Misscan**.
   - **Auditoria de Misscan:** Modal com seletor de raio (3 km, 5 km, 10 km, 15 km), busca e listagem de MDs vizinhos recomendados com distância Haversine exata.
   - Abas: 1. Visão Geral Executiva | 2. Pontos de Coleta (MDs) | 3. Sellers & Embarcadores | 4. Horários de Bipagem (Coluna M) | 5. Linha do Tempo & Eventos | 6. Reconciliação & Aging.
2. **Planejador 16h SP (`/planejador-rotas`):**
   - Inteligência preditiva de fim de tarde para a malha de MiniDrops de São Paulo.
   - Ingestão automática diária da planilha mais recente em `C:\ANJUN\PLANILHA DE ROTAS\`.
   - Motor estatístico de pico: projeta o incremento horário das 16h às 18h via histórico (`detalhe_pico_historico`).
   - Simulador de saturação e ponto de corte: calcula o backlog residual por rota, identifica veículos em risco de estouro (>100%) e permite rebalanceamento What-If em tempo real.
   - Tabela de acurácia diária: compara o previsto das 16h00 com o fechamento oficial noturno.
3. **Mapa da Malha (`/mapa`):**
   - Visualização geográfica Leaflet dos pontos da rede.
   - **Filtros e Controles:** Seletor de visualização de pontos **Ativos** vs **Inativos/Excluídos**, círculos de abrangência e calor de volumetria.
3. **Configurações da Malha (`/config`):**
   - Gestão de parâmetros, tabelas de mapeamento de MDs, cadastro de novos pontos e sincronização.
4. **Clientes & Marketplaces (`/clientes`):**
   - Visão segregada de Shein, TikTok, TEMU, Kwai e Sellers.
5. **Backlog & SLA (`/backlog`, `/sla`):**
   - Monitoramento das cargas retidas em MDs e conformidade de SLA de coleta.

---

## 7. Banco de Dados SQLite (`backend/coletas.db`)

Tabelas essenciais e suas finalidades:
- `operacional_pedidos_completo`: Base transacional rica com os 66 campos da planilha do dia atual (inclui `remetente_nome`, `remetente_cep`, `status_pedido`, `ponto_colecao`, `maneira_coleta`, etc.).
- `criacao_pedidos_historico`: Registro consolidado de pedidos criados ao longo dos dias.
- `malha_coordenadas`: Cadastro oficial de **3.949 MiniDrops e HUBs**, contendo `md_codigo`, `nome_ponto`, `cep`, `cidade`, `estado`, `latitude`, `longitude` e `funcionando` (1=Ativo, 0=Inativo).
- `eventos_dia` / `eventos_nota`: Diário de bordo e linha do tempo de ocorrências operacionais.
- `historico_reconciliacao`: Rastreamento de aging de pacotes e transições entre uploads diários.

---

## 8. Checklist Obrigatório para a IA em Novas Sessões

Antes de propor alterações ou responder sobre a operação:
1. **Consulte este arquivo (`CEREBRO_TORRE_ANJUN.md`):** Nunca assuma regras contrárias às definidas nas seções 3 e 4.
2. **Atenção aos comandos no Windows:**
   - Nunca use `powershell -c "script de múltiplas linhas"` direto no terminal devido a conflitos de aspas e codificação cp1252.
   - Crie sempre um pequeno arquivo script `.py` em disco e execute: `& 'C:\ANJUN\backend\venv\Scripts\python.exe' script.py`.
3. **Preserve integridade de arquivos e histórico:**
   - Faça backups lógicos ou commits atômicos no Git (`origin main`).
   - Mantenha tokens e senhas no `.gitignore` (`telegram_config.json`, etc.).
4. **Respeite a máquina de estados:**
   - Se for MiniDrop: `coletado ➔ saco selado ➔ Carregamento ➔ Descarregamento ➔ Circuito fechado`.
   - Se for Pickup/PA: `coletado ➔ Carregamento ➔ Descarregamento ➔ Circuito fechado` (Sem saco selado!).
   - Se houver `Foi assinado`, aponte risco crítico de extravio.
   - Se houver Drop-off sem MD, use o endpoint `/api/coletas/misscan` para identificar os MDs prováveis por proximidade de CEP.


---

## 9. Integração com a API Anjun Express (`newmanage.anjunexpress.com`)

O sistema já possui o módulo cliente e as credenciais de autenticação configuradas para comunicação direta com a plataforma corporativa da Anjun:
- **Arquivo de Configuração de Sessão:** `backend/services/anjun_api_config.json`
- **Módulo Cliente:** `backend/services/anjun_api_client.py`
- **Usuário Conectado:** `mandarino` (Diego de Souza Mandarino / Site ANJUN1 / Org 71)
- **Base URL da API:** `https://newmanage.anjunexpress.com/admin`
- **Headers Padrão:** `token` (JWT), `Origin: https://manage.anjunexpress.com`, `Referer: https://manage.anjunexpress.com/`
- **Rotas Mapeadas:**
  - Ingestão de pedidos operacionais: `/collectOrder/page`
  - Geração de VTAGs e veículos: tela `https://manage.anjunexpress.com/basicData/carNumber`
- **Diretório da Planilha de Rotas Diária:** `C:\ANJUN\PLANILHA DE ROTAS` (arquivo atualizado diariamente por volta das 08:00 com os MDs, rotas, placas e telefones dos 91 motoristas).
