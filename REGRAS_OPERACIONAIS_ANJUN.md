# 📘 REGRAS OPERACIONAIS OFICIAIS — TORRE DE CONTROLE ANJUN

> **Documento de Referência Permanente para Agentes, Desenvolvedores e Operação.**  
> *Última revisão e consolidação oficial: 04/11/2026.*  
> **Atenção:** Qualquer agente ou rotina que atue nesta base DEVE ler e seguir rigorosamente estas definições.

---

## 1. Dicionário Operacional de Nomenclaturas e Modalidades

| Termo no Sistema Anjun | Significado Operacional Real | Descrição / Dinâmica Fisiológica |
| :--- | :--- | :--- |
| **`entrega porta-a-porta`** | **Seller dropando no MiniDrop (Drop-off)** | O vendedor transporta os pacotes por conta própria e os entrega fisicamente no balcão do MiniDrop (MD) parceiro mais próximo. |
| **`coleta porta-a-porta`** | **Pickup da Van Anjun (Coleta Programada)** | A van/veículo da Anjun vai fisicamente até o endereço do seller (galpão, confecção, fábrica) recolher a mercadoria. |
| **`ponto_colecao`** | **Ponto de Bipagem de Custódia** | Ponto físico onde o pacote recebeu o primeiro bip de entrada. *Nota:* Sellers de Pickup podem eventualmente dropar mercadoria em um MiniDrop, fazendo com que um MD conste como seu ponto de coleção. |
| **`W2D`** | **Pickup / Coleta de Van** | Coleta tradicional porta a porta em galpões e indústrias para transporte ao HUB. |
| **`D2D`** | **Door-to-Door / Drop-off no MD** | Modalidade onde a maior parte dos pedidos (especialmente Shein D2D) é dropada no balcão de MiniDrops para agilizar o first-mile. |
| **`Circuito Fechado`** | **Ciclo Concluído / Entregue** | Pacote que percorreu toda a cadeia logística e teve a baixa final de entrega confirmada no destino. |
| **`Em Trânsito`** | **Carregamento & Descarregamento** | Carga bipada em transferência operacional entre MiniDrops, Pontos Avançados e HUBs centrais. |
| **`Backlog no MD`** | **Carga Retida no Balcão** | Pacotes bipados e sob custódia do parceiro no MiniDrop que ainda não foram carregados no veículo de coleta da Anjun. |
| **`Não Coletado`** | **Pedido Aberto no Sistema** | Pacote cuja etiqueta/pedido foi gerada na plataforma pelo embarcador, mas que ainda não recebeu o primeiro escaneamento físico na malha. |

---

## 2. Classificação Estrita da Malha: MiniDrop (MD) vs HUB Central

### 🏪 A. O que É MiniDrop (MD Legítimo)
Lojas parceiras de rua, pontos de bairro e estabelecimentos de conveniência credenciados para atendimento de balcão e recebimento de drop-offs.
* **Padrões de Nomenclatura Obrigatórios:**
  1. `[UF]-W-MDxxx` (Exemplos: `SP-W-MD245`, `RJ-W-MD199`, `MG-W-MD104`, `SP-W-MD384`).
  2. `MD-[SIGLA]-[01|02]` (Exemplos: `MD-HAV-01`, `MD-ETT-02`, `MD-ATL-01`, `MD-WON-01`, `MD-GAS-02`).
* **Regra de Alarme:** Apenas unidades com esses prefixos devem figurar na aba de **Anomalias em MiniDrops**.

### 🚚 B. O que NÃO É MiniDrop (HUBs e Centros de Triagem)
* **`WR-GLP-01`**: É o **HUB Central Anjun Guarulhos** (Centro de Triagem / Cross-docking Nacional). **NUNCA DEVE SER CLASSIFICADO COMO MINIDROP**. Não possui atendimento de balcão ao público e movimenta grandes lotes de transferência.
* **Centros Regionais de Transferência:** `SP-10`, `SP-12`, `SP-13`, `SC-88`, `MG-38`, `SP-Z-H001`, `RJ-25`, `RJ-28`.

---

## 3. Segmentação Oficial da Carteira de Clientes

A carteira de clientes da Anjun é dividida em **3 Segmentos Estratégicos**:

### 🛒 1. Marketplaces & Plataformas Globais
Contratos de grande escala com integração de sistema própria:
* **Shein** (Shein Normal/W2D, Shein D2D, Shein W2S)
* **Temu** (Temu D2D, Temu W2D, Temu XBorder)
* **TikTok Logistics Brazil**
* **Kwai**
* **SZAnjun** (Internacional / Crossborder)

### 🏬 2. PA — Pontos Avançados & Ship-from-Store (Grandes Redes de Varejo)
Grandes redes corporativas atendidas com coleta dedicada em lojas de shopping ou centros de distribuição avançados:
* **Lojas Renner:** `rennercabreuva` (CD Cabreúva)
* **Camicado:** `camod`
* **Youcom:** `youcom` (Moda jovem do Grupo Renner)
* **C&A Brasil:** Dezenas de lojas de shopping mapeadas (`c&a_shopping morumbi`, `c&a_shopping ibirapuera`, `c&a_shopping center norte`, `c&a_shopping tambore`, `c&a_shopping aricanduva`, `c&a_shoppingbotafogo`, etc.)
* **Ri Happy:** Lojas de brinquedos de shopping (`rihappy_eldorado`, `rihappy_shopinterlagos`, `rihappy-catuaishopmaringa`...)
* **Casas Bahia**, **Samsonite**, **Hanesbrands**, **Lojas Melman**.

### 📦 3. Sellers de Pickup (Coleta Porta a Porta)
Vendedores independentes, marcas de e-commerce e confecções atendidos pela roteirização de vans da Anjun que vão até o endereço do seller recolher a carga:
* Exemplos: `B4A Tecnologia e Comércio`, `Lescent Varejo`, `Beauty Hub Varejo`, `Maxmix Ltda`, `Linda Casa Enxovais`, `Ap Cosmetics`, `Shopmulti`, `Zakat`, `Premici`, `Playkids`.

---

## 4. Regras de Dados, Fechamento e SLA

1. **Total Oficial Absoluto (D-1):**
   * No fechamento do dia anterior (D-1), o total de pedidos gerados reflete 100% da operação oficial Anjun (exemplo histórico: **1.030.159 pedidos em 03/11/2026**).
   * A sincronização extrai a amostra detalhada de pacotes, mas preserva nos cards macro o número oficial exato.
2. **Aging e SLA:**
   * **Faixa Verde:** Até 24 horas (Dentro do prazo de SLA).
   * **Faixa Amarela:** 24h a 48h (Atenção / Pré-alerta).
   * **Faixa Laranja:** 48h a 72h (Risco alto de estouro de SLA).
   * **Faixa Vermelha:** Acima de 72 horas (Crítico / Fora do SLA operacional).

---

## 5. Arquitetura de Robôs e Segurança da Aplicação

1. **Agendador 24/7 (`agendador_automatico.py`):**
   * Roda em segundo plano coletando dados hora a hora (07h às 23h), consolidando o D-1 às 00h05 e publicando o deploy noturno às 22h30.
2. **Assistente Telegram (`anjun_torre_bot`):**
   * Roda de forma contínua conectado ao token seguro em `backend/telegram_config.json`.
   * Dispara alertas proativos para o administrador quando o token da sessão web Anjun estiver prestes a expirar (< 6 horas) ou quando expirar.
3. **Segurança de Credenciais:**
   * Arquivos locais como `telegram_config.json`, `anjun_api_config.json` e pastas de logs estão inclusos no `.gitignore` e **NUNCA** devem ser commitados no GitHub.
