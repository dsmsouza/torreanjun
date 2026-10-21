export const getApiUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined" && window.location && window.location.hostname) {
    return `http://${window.location.hostname}:8000`;
  }
  return "http://127.0.0.1:8000";
};

export const getUploadApiUrl = (): string => {
  return getApiUrl();
};

export const API_URL = getApiUrl();
export const UPLOAD_API_URL = getUploadApiUrl();

async function fetchStaticSnapshot(fileName: string, fallbackFileName?: string): Promise<any | null> {
  try {
    const res = await fetch(`/snapshot/${fileName}`, { cache: "no-store" });
    if (res.ok) return await res.json();
    if (fallbackFileName && fallbackFileName !== fileName) {
      const resFb = await fetch(`/snapshot/${fallbackFileName}`, { cache: "no-store" });
      if (resFb.ok) return await resFb.json();
    }
  } catch {
    // ignore
  }
  return null;
}

async function resolveSnapshotRequest(urlStr: string): Promise<Response | null> {
  try {
    const parsed = new URL(urlStr, typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
    const path = parsed.pathname;
    const params = parsed.searchParams;

    const jsonResponse = (payload: any) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Snapshot-Mode": "ONLINE" },
      });

    const diaParam = (params.get("dia") || "").trim();
    const isLatest = !diaParam || ["TODOS", "LATEST", "HOJE", ""].includes(diaParam.toUpperCase());
    const safeDia = isLatest ? "latest" : diaParam.replace(/\//g, "-");

    if (path === "/api/coletas/dias") {
      const data = await fetchStaticSnapshot("dias.json");
      if (data) return jsonResponse(data);
    }

    if (path === "/api/coletas/resumo") {
      const data = await fetchStaticSnapshot(`resumo_${safeDia}.json`, "resumo_latest.json");
      if (data) {
        const cliFiltro = (params.get("cliente") || "").trim();
        const regFiltro = (params.get("regional") || "").trim();
        if ((cliFiltro && cliFiltro.toUpperCase() !== "TODOS") || (regFiltro && regFiltro.toUpperCase() !== "TODOS")) {
          const copy = JSON.parse(JSON.stringify(data));
          if (cliFiltro && cliFiltro.toUpperCase() !== "TODOS" && Array.isArray(copy.clientes)) {
            const cMatch = copy.clientes.find((c: any) => c.cliente?.toLowerCase() === cliFiltro.toLowerCase());
            if (cMatch && copy.kpis) {
              copy.kpis.total_pedidos = cMatch.volume;
              copy.kpis.coletados = cMatch.coletados;
              copy.kpis.backlog = cMatch.backlog;
              copy.kpis.taxa_coleta_pct = cMatch.taxa_coleta;
            }
          }
          if (regFiltro && regFiltro.toUpperCase() !== "TODOS" && Array.isArray(copy.regionais)) {
            const rMatch = copy.regionais.find((r: any) => r.estado?.toLowerCase() === regFiltro.toLowerCase());
            if (rMatch && copy.kpis) {
              copy.kpis.total_pedidos = rMatch.volume;
              copy.kpis.coletados = rMatch.coletados;
              copy.kpis.backlog = rMatch.backlog;
              copy.kpis.taxa_coleta_pct = rMatch.taxa_coleta;
            }
          }
          return jsonResponse(copy);
        }
        return jsonResponse(data);
      }
    }

    if (path === "/api/coletas/mds") {
      const data = await fetchStaticSnapshot(`mds_${safeDia}.json`, "mds_latest.json");
      if (data && Array.isArray(data.mds)) {
        let list = [...data.mds];
        const reg = (params.get("regional") || "").trim().toLowerCase();
        const search = (params.get("search") || "").trim().toLowerCase();
        const ft = (params.get("filtro_tipo") || "").trim().toUpperCase();

        if (reg && reg !== "todos") {
          list = list.filter((m: any) => (m.estado || "").toLowerCase() === reg || (m.regional || "").toLowerCase() === reg);
        }
        if (search) {
          list = list.filter(
            (m: any) =>
              (m.md_codigo || "").toLowerCase().includes(search) ||
              (m.cidade || "").toLowerCase().includes(search) ||
              (m.estado || "").toLowerCase().includes(search) ||
              (m.regional || "").toLowerCase().includes(search)
          );
        }
        if (["BACKLOG", "COM_BACKLOG"].includes(ft)) {
          list = list.filter((m: any) => (m.backlog || 0) > 0);
        } else if (["PRIMEIRA_BIPAGEM", "PRIMEIRA_VEZ", "1A_BIPAGEM"].includes(ft)) {
          list = list.filter((m: any) => m.is_primeira_bipagem);
        } else if (["NAO_CADASTRADOS", "NAO_CADASTRADO"].includes(ft)) {
          list = list.filter((m: any) => !m.is_cadastrado);
        } else if (["SEM_BIPAGEM", "DORMENTE", "SEM_MOVIMENTO"].includes(ft)) {
          list = list.filter((m: any) => m.is_sem_bipagem);
        } else if (["BIPANDO", "BIPANDO_CONSTANTE", "ATIVO_OPERANDO"].includes(ft)) {
          list = list.filter((m: any) => !m.is_sem_bipagem && (m.volume || 0) > 0);
        } else if (["DESVIO_PICKUP", "PICKUP_INCORRETO", "PICKUP_MD"].includes(ft)) {
          list = list.filter((m: any) => m.is_desvio_pickup);
        }

        const totBipando = list.filter((m: any) => !m.is_sem_bipagem && (m.volume || 0) > 0).length;
        const totSemBipagem = list.filter((m: any) => m.is_sem_bipagem).length;

        return jsonResponse({
          mds: list,
          total_mds: list.length,
          total_bipando_constante: totBipando,
          total_sem_bipagem: totSemBipagem,
        });
      }
    }

    if (path === "/api/coletas/sellers") {
      const data = await fetchStaticSnapshot(`sellers_${safeDia}.json`, "sellers_latest.json");
      if (data && Array.isArray(data.sellers)) {
        let list = [...data.sellers];
        const cli = (params.get("cliente") || "").trim().toLowerCase();
        const reg = (params.get("regional") || "").trim().toLowerCase();
        const search = (params.get("search") || "").trim().toLowerCase();

        if (cli && cli !== "todos") {
          list = list.filter((s: any) => (s.nome_cliente || "").toLowerCase() === cli);
        }
        if (reg && reg !== "todos") {
          list = list.filter((s: any) => (s.estado || "").toLowerCase() === reg);
        }
        if (search) {
          list = list.filter(
            (s: any) =>
              (s.merchant_nome || "").toLowerCase().includes(search) ||
              (s.cidade || "").toLowerCase().includes(search) ||
              (s.bairro || "").toLowerCase().includes(search) ||
              (s.ponto_colecao || "").toLowerCase().includes(search)
          );
        }
        return jsonResponse({ sellers: list, total_sellers: list.length });
      }
    }

    if (path === "/api/coletas/horarios") {
      const data = await fetchStaticSnapshot(`horarios_${safeDia}.json`, "horarios_latest.json");
      if (data) return jsonResponse(data);
    }

    if (path === "/api/coletas/no-dia") {
      const data = await fetchStaticSnapshot(`no_dia_${safeDia}.json`, "no_dia_latest.json");
      if (data && Array.isArray(data.mds)) {
        let list = [...data.mds];
        const reg = (params.get("regional") || "").trim().toLowerCase();
        const tp = (params.get("tipo_ponto") || "").trim().toUpperCase();
        const sf = (params.get("status_filtro") || "").trim().toLowerCase();
        const search = (params.get("search") || "").trim().toLowerCase();

        if (reg && reg !== "todos") {
          list = list.filter(
            (m: any) => (m.regional || "").toLowerCase().includes(reg) || (m.estado || "").toLowerCase() === reg
          );
        }
        if (tp && tp !== "TODOS") {
          list = list.filter((m: any) => (m.tipo_ponto || "").toUpperCase().includes(tp));
        }
        if (sf && sf !== "todos") {
          list = list.filter((m: any) => (m.status_operacional || "").toLowerCase().includes(sf));
        }
        if (search) {
          list = list.filter(
            (m: any) =>
              (m.md_codigo || "").toLowerCase().includes(search) ||
              (m.nome_ponto || "").toLowerCase().includes(search) ||
              (m.cidade || "").toLowerCase().includes(search) ||
              (m.estado || "").toLowerCase().includes(search)
          );
        }
        return jsonResponse({
          ...data,
          total_pontos: list.length,
          mds: list,
        });
      }
    }

    if (path === "/api/coletas/d2d-sp") {
      const periodo = (params.get("periodo") || "DIA").trim().toUpperCase();
      const fileAlvo = periodo === "DIA" ? `d2d_sp_DIA_${safeDia}.json` : `d2d_sp_${periodo}_latest.json`;
      const data = await fetchStaticSnapshot(fileAlvo, `d2d_sp_${periodo}_latest.json`);
      if (data) return jsonResponse(data);
    }

    if (path === "/api/implantacao/cockpit-d1") {
      const data = await fetchStaticSnapshot(`cockpit_d1_${safeDia}.json`, "cockpit_d1_latest.json");
      if (data) return jsonResponse(data);
    }

    if (path === "/api/implantacao/stats") {
      const data = await fetchStaticSnapshot("implantacao_stats.json");
      if (data) return jsonResponse(data);
    }

    if (path === "/api/implantacao/solicitacoes") {
      const data = await fetchStaticSnapshot("implantacao_solicitacoes.json");
      if (data) return jsonResponse(data);
    }

    if (path === "/api/implantacao/relatorio-quarta") {
      const data = await fetchStaticSnapshot("implantacao_relatorio_quarta.json");
      if (data) return jsonResponse(data);
    }

    if (path === "/api/implantacao/pontos/classificacao") {
      const data = await fetchStaticSnapshot("implantacao_classificacoes.json");
      if (data) return jsonResponse(data);
    }
  } catch {
    // ignore
  }
  return null;
}

export async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  const isGet = !options?.method || options.method.toUpperCase() === "GET";
  const isCloudHost =
    typeof window !== "undefined" &&
    window.location?.hostname &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1" &&
    !process.env.NEXT_PUBLIC_API_URL;

  // Se estiver rodando na nuvem (ex: Vercel), resolve instantaneamente pelo Snapshot Estático (0ms delay)
  if (isCloudHost && isGet) {
    const snapRes = await resolveSnapshotRequest(url);
    if (snapRes) return snapRes;
  }

  let targetUrl = url;
  if (typeof window !== "undefined" && window.location?.hostname) {
    const directBase = `http://${window.location.hostname}:8000`;
    if (targetUrl.startsWith("/api/")) {
      targetUrl = `${directBase}${targetUrl}`;
    } else if (targetUrl.startsWith("http://127.0.0.1:8000") && window.location.hostname !== "127.0.0.1") {
      targetUrl = targetUrl.replace("http://127.0.0.1:8000", directBase);
    }
  }

  const maxAttempts = isCloudHost ? 1 : 3;
  let lastErr: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(targetUrl, options);
      if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      return res;
    } catch (err: any) {
      lastErr = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  // Fallback automático para Snapshot caso o Backend local (porta 8000) esteja desligado
  if (isGet) {
    const snapFallback = await resolveSnapshotRequest(url);
    if (snapFallback) return snapFallback;
  }

  if (
    lastErr &&
    (lastErr.name === "TypeError" ||
      lastErr.message?.includes("fetch") ||
      lastErr.message?.includes("NetworkError"))
  ) {
    throw new Error(
      "O servidor Backend (porta 8000) está desconectado. Execute iniciarbackend.bat para usar recursos de gravação ao vivo."
    );
  }
  throw lastErr || new Error("Falha de comunicação com o servidor Backend.");
}


export function getAuthHeaders(isFormData = false): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';
  return headers;
}

// In-Memory Client Cache Engine (SWR-like instant response)
interface CacheEntry {
  data: any;
  timestamp: number;
}
const apiCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60000; // 60 seconds instant cache

export function invalidateApiCache() {
  apiCache.clear();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("database_updated"));
  }
}

export async function fetchWithCache<T>(url: string, ttlMs = CACHE_TTL_MS, customHeaders?: HeadersInit): Promise<T> {
  const cached = apiCache.get(url);
  const now = Date.now();
  if (cached && (now - cached.timestamp < ttlMs)) {
    return cached.data as T;
  }

  const res = await safeFetch(url, { headers: customHeaders || getAuthHeaders() });
  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Falha na requisição (${res.status}): ${errorText || res.statusText}`);
  }
  const data = await res.json();
  apiCache.set(url, { data, timestamp: now });
  return data as T;
}

export interface OptionsData {
  dias: string[];
  semanas: string[];
  regionais?: string[];
}

export interface RegionalResumo {
  regional: string;
  total: number;
  backlog: number;
  taxa_coleta: number;
  erros_lacre: number;
}

export interface ResumoGeral {
  volume_total: number;
  volume_backlog: number;
  taxa_coleta: number;
  taxa_backlog: number;
  erros_lacre: number;
  regionais: RegionalResumo[];
}

export interface Justificativa {
  id: number;
  dia_base: string;
  regional: string;
  justificativa: string;
  data_registro?: string;
}

export interface MalhaPacote {
  barcode?: string;
  saca?: string;
  md?: string;
  regional?: string;
  cidade?: string;
  status?: string;
  tempo_coleta?: string;
  dias_parado: number;
}

export interface ClienteRanking {
  nome_cliente: string;
  total_pacotes: number;
  total_backlog: number;
  taxa_coleta: number;
}

export interface ClienteRegionalDetalhe {
  regional: string;
  total_pacotes: number;
  total_backlog: number;
  taxa_coleta: number;
}

export interface ClienteEvolucao {
  dia_base: string;
  taxa_coleta: number;
  total_pacotes: number;
  total_backlog: number;
}

export interface Penalidade {
  id: number;
  data_penalidade: string;
  md: string;
  motivo: string;
  pontos: number;
}

export interface AlertaFixo {
  md: string;
  observacao: string;
}

export interface MDScore {
  md: string;
  regional: string;
  pontos_desconto: number;
  score_final: number;
  recomendacao: string;
}

export interface OfensorPosColeta {
  md: string;
  regional: string;
  pacotes_atrasados: number;
  ultima_hora_bipagem: string;
  hora_saida_carro: string;
  ultimo_barcode: string;
}

export interface AnomaliaData {
  md: string;
  regional: string;
  status_coleta: string;
  tipo_anomalia: string;
  pacotes_atrasados: number;
  ultima_hora_bipagem: string;
  hora_saida_carro: string;
  ultimo_barcode: string;
  backlog_restante: number;
  historico_semana: number;
  historico_mes: number;
  dias_falha?: number;
  detalhes_dias?: string;
}

export interface HistoricoDiario {
  data: string;
  valor: number;
}

// Options filter
export async function fetchOptions(): Promise<OptionsData> {
  return fetchWithCache<OptionsData>(`${API_URL}/api/opcoes`, 120000);
}

export interface PickupDetalhe {
  nome_cliente: string;
  merchant_id: string;
  merchant_nome: string;
  cep_remetente: string;
  estado: string;
  cidade: string;
  bairro: string;
  endereco: string;
  regional: string;
  tipo_coleta: string;
  md_vinculado?: string | null;
  tipo_pedido?: string;
  total_pacotes: number;
  total_backlog: number;
  taxa_coleta: number;
}

// Summary statistics
export async function fetchResumo(
  periodoTipo: string,
  rotulo: string,
  regional?: string | null,
  dtInicio?: string | null,
  dtFim?: string | null,
  regra5k?: boolean,
  modalidade: string = "TODOS"
): Promise<ResumoGeral> {
  const params = new URLSearchParams({
    periodo_tipo: periodoTipo,
    rotulo: rotulo,
  });
  if (regional) params.append("regional", regional);
  if (dtInicio) params.append("dt_inicio", dtInicio);
  if (dtFim) params.append("dt_fim", dtFim);
  if (regra5k) params.append("regra5k", "true");
  if (modalidade) params.append("modalidade", modalidade);

  return fetchWithCache<ResumoGeral>(`${API_URL}/api/resumo?${params.toString()}`);
}

// Radar de Malha
export async function fetchMalha(regional?: string | null): Promise<MalhaPacote[]> {
  const params = new URLSearchParams();
  if (regional) params.append("regional", regional);

  return fetchWithCache<MalhaPacote[]>(`${API_URL}/api/malha?${params.toString()}`);
}

// Clientes Performance
export async function fetchClientes(
  periodoTipo: string,
  rotulo: string,
  regional?: string | null,
  dtInicio?: string | null,
  dtFim?: string | null,
  modalidade: string = "TODOS"
): Promise<ClienteRanking[]> {
  const params = new URLSearchParams({
    periodo_tipo: periodoTipo,
    rotulo: rotulo,
  });
  if (regional) params.append("regional", regional);
  if (dtInicio) params.append("dt_inicio", dtInicio);
  if (dtFim) params.append("dt_fim", dtFim);
  if (modalidade) params.append("modalidade", modalidade);

  return fetchWithCache<ClienteRanking[]>(`${API_URL}/api/clientes?${params.toString()}`);
}

export async function fetchClienteDetalhe(
  cliente: string,
  periodoTipo: string,
  rotulo: string,
  dtInicio?: string | null,
  dtFim?: string | null,
  regional?: string | null,
  modalidade: string = "TODOS"
): Promise<ClienteRegionalDetalhe[]> {
  const params = new URLSearchParams({ cliente, periodo_tipo: periodoTipo, rotulo });
  if (dtInicio) params.append("dt_inicio", dtInicio);
  if (dtFim) params.append("dt_fim", dtFim);
  if (regional) params.append("regional", regional);
  if (modalidade) params.append("modalidade", modalidade);
  return fetchWithCache<ClienteRegionalDetalhe[]>(`${API_URL}/api/clientes/detalhe?${params.toString()}`);
}

export async function fetchClienteEvolucao(
  cliente: string,
  periodoTipo: string,
  rotulo: string,
  dtInicio?: string | null,
  dtFim?: string | null,
  regional?: string | null,
  modalidade: string = "TODOS"
): Promise<ClienteEvolucao[]> {
  const params = new URLSearchParams({ cliente, periodo_tipo: periodoTipo, rotulo });
  if (dtInicio) params.append("dt_inicio", dtInicio);
  if (dtFim) params.append("dt_fim", dtFim);
  if (regional) params.append("regional", regional);
  if (modalidade) params.append("modalidade", modalidade);
  return fetchWithCache<ClienteEvolucao[]>(`${API_URL}/api/clientes/evolucao?${params.toString()}`);
}

export async function fetchPickup(
  periodoTipo: string,
  rotulo: string,
  dtInicio?: string | null,
  dtFim?: string | null,
  regional?: string | null,
  tipoColeta?: string | null
): Promise<PickupDetalhe[]> {
  const params = new URLSearchParams({ periodo_tipo: periodoTipo, rotulo });
  if (dtInicio) params.append("dt_inicio", dtInicio);
  if (dtFim) params.append("dt_fim", dtFim);
  if (regional) params.append("regional", regional);
  if (tipoColeta && tipoColeta !== "TODOS") params.append("tipo_coleta", tipoColeta);
  return fetchWithCache<PickupDetalhe[]>(`${API_URL}/api/pickup?${params.toString()}`);
}

// Justifications
export async function fetchJustificativas(
  diaBase?: string | null,
  regional?: string | null
): Promise<Justificativa[]> {
  const params = new URLSearchParams();
  if (diaBase) params.append("dia_base", diaBase);
  if (regional) params.append("regional", regional);

  const res = await safeFetch(`${API_URL}/api/justificativas?${params.toString()}`);
  if (!res.ok) throw new Error("Falha ao buscar justificativas.");
  return res.json();
}

export async function saveJustificativa(
  diaBase: string,
  regional: string,
  justificativa: string
): Promise<Justificativa> {
  const res = await safeFetch(`${API_URL}/api/justificativas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dia_base: diaBase,
      regional: regional,
      justificativa: justificativa,
    }),
  });
  if (!res.ok) throw new Error("Falha ao salvar a justificativa.");
  return res.json();
}

// Penalties
export async function fetchPenalidades(): Promise<Penalidade[]> {
  const res = await safeFetch(`${API_URL}/api/penalidades`);
  if (!res.ok) throw new Error("Falha ao buscar penalidades.");
  return res.json();
}

export async function savePenalidade(
  dataPenalidade: string,
  md: string,
  motivo: string,
  pontos: number
): Promise<Penalidade> {
  const res = await safeFetch(`${API_URL}/api/penalidades`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data_penalidade: dataPenalidade,
      md: md,
      motivo: motivo,
      pontos: pontos,
    }),
  });
  if (!res.ok) throw new Error("Falha ao salvar penalidade.");
  return res.json();
}

export async function deletePenalidade(id: number): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/penalidades/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Falha ao deletar penalidade.");
  return res.json();
}

// Permanent Alerts
export async function fetchAlertasFixos(): Promise<AlertaFixo[]> {
  const res = await safeFetch(`${API_URL}/api/observacoes-fixas`);
  if (!res.ok) throw new Error("Falha ao buscar alertas permanentes.");
  return res.json();
}

export async function saveAlertaFixo(md: string, observacao: string): Promise<AlertaFixo> {
  const res = await safeFetch(`${API_URL}/api/observacoes-fixas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      md: md,
      observacao: observacao,
    }),
  });
  if (!res.ok) throw new Error("Falha ao salvar alerta permanente.");
  return res.json();
}

export async function deleteAlertaFixo(md: string): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/observacoes-fixas/${md}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Falha ao remover alerta permanente.");
  return res.json();
}

export async function saveMDFullForm(
  md: string,
  iata: string,
  observacao: string,
  status: string
): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/mds/salvar-formulario`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ md, iata, observacao, status }),
  });
  if (!res.ok) throw new Error("Falha ao salvar formulário operacional do MD.");
  return res.json();
}

// MD Scores
export async function fetchMDScores(): Promise<MDScore[]> {
  const res = await safeFetch(`${API_URL}/api/mds/score`);
  if (!res.ok) throw new Error("Falha ao buscar score de saúde de MDs.");
  return res.json();
}

export async function fetchOfensoresPosColeta(
  dataOperacao: string,
  regional?: string | null
): Promise<OfensorPosColeta[]> {
  const params = new URLSearchParams({ data_operacao: dataOperacao });
  if (regional) params.append("regional", regional);
  
  const res = await safeFetch(`${API_URL}/api/rangerover/ofensores-pos-coleta?${params.toString()}`);
  if (!res.ok) throw new Error("Falha ao buscar ofensores de bipagem pós-coleta.");
  return res.json();
}

export async function fetchAnomalias(
  dataOperacao: string,
  regional?: string | null,
  tipoAnomalia: string = "TODAS",
  periodoTipo: string = "Diário",
  dtInicio?: string | null,
  dtFim?: string | null
): Promise<AnomaliaData[]> {
  const params = new URLSearchParams({ 
    data_operacao: dataOperacao, 
    tipo_anomalia: tipoAnomalia,
    periodo_tipo: periodoTipo
  });
  if (regional) params.append("regional", regional);
  if (dtInicio) params.append("dt_inicio", dtInicio);
  if (dtFim) params.append("dt_fim", dtFim);
  
  const res = await safeFetch(`${API_URL}/api/rangerover/anomalias?${params.toString()}`);
  if (!res.ok) throw new Error("Falha ao buscar anomalias logísticas.");
  return res.json();
}

export async function fetchMDHistorico(
  md: string,
  dataOperacao: string,
  tipoAnomalia: string = "TODAS"
): Promise<HistoricoDiario[]> {
  const params = new URLSearchParams({ data_operacao: dataOperacao, tipo_anomalia: tipoAnomalia });
  
  const res = await safeFetch(`${API_URL}/api/rangerover/anomalias/${md}/historico?${params.toString()}`);
  if (!res.ok) throw new Error("Falha ao buscar histórico do MD.");
  return res.json();
}

// AI Report Generation
export async function generateIAReport(
  tipoRelatorio: string,
  filial: string,
  contexto: string,
  apiKey?: string | null
): Promise<{ resultado: string }> {
  const res = await safeFetch(`${API_URL}/api/ia/gerar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tipo_relatorio: tipoRelatorio,
      filial: filial,
      contexto: contexto,
      api_key: apiKey || null,
    }),
  });
  if (!res.ok) throw new Error("Falha ao gerar relatório de IA.");
  return res.json();
}

// Database Administration
export function getBackupUrl(): string {
  return `${API_URL}/api/config/backup`;
}

export async function restoreDatabase(file: File): Promise<any> {
  const formData = new FormData();
  formData.append("db_file", file);

  const res = await safeFetch(`${UPLOAD_API_URL}/api/config/restore`, {
    method: "POST",
    headers: getAuthHeaders(true),
    body: formData,
  });
  
  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.detail || "Falha ao restaurar banco de dados.");
  }
  return res.json();
}

export async function cleanDatabase(): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/config/clean`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Falha ao limpar base de dados histórica.");
  return res.json();
}

export async function importDatabase(
  dataOperacao: string,
  numSemana: string,
  fileMds: File,
  fileOperacional: File,
  fileRangerover?: File | null
): Promise<any> {
  const formData = new FormData();
  formData.append("data_operacao", dataOperacao);
  formData.append("num_semana", numSemana);
  formData.append("file_mds", fileMds);
  formData.append("file_operacional", fileOperacional);
  if (fileRangerover) {
    formData.append("file_rangerover", fileRangerover);
  }

  const res = await safeFetch(`${UPLOAD_API_URL}/api/config/importar`, {
    method: "POST",
    headers: getAuthHeaders(true),
    body: formData,
  });
  
  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.detail || "Falha ao processar ingestão de planilhas.");
  }
  return res.json();
}

export async function fetchContextoSemanal(semanaBase: string): Promise<{ contexto: string }> {
  const res = await safeFetch(`${API_URL}/api/ia/contexto-semanal?semana_base=${encodeURIComponent(semanaBase)}`);
  if (!res.ok) throw new Error("Falha ao carregar contexto semanal da IA.");
  return res.json();
}

export async function fetchContextoPeriodo(
  periodoTipo: string,
  rotulo: string,
  dtInicio?: string | null,
  dtFim?: string | null
): Promise<{ contexto: string }> {
  let url = `${API_URL}/api/ia/contexto-periodo?periodo_tipo=${encodeURIComponent(periodoTipo)}&rotulo=${encodeURIComponent(rotulo)}`;
  if (dtInicio) url += `&dt_inicio=${encodeURIComponent(dtInicio)}`;
  if (dtFim) url += `&dt_fim=${encodeURIComponent(dtFim)}`;
  
  const res = await safeFetch(url);
  if (!res.ok) throw new Error("Falha ao carregar contexto operacional da IA.");
  return res.json();
}

export async function deleteJustification(id: number): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/justificativas/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Falha ao deletar justificativa.");
  return res.json();
}

export async function fetchMalhaPontos(periodoTipo?: string, rotulo?: string): Promise<any[]> {
  const params = new URLSearchParams();
  if (periodoTipo) params.append("periodo_tipo", periodoTipo);
  if (rotulo) params.append("rotulo", rotulo);
  return fetchWithCache<any[]>(`${API_URL}/api/mapa/pontos?${params.toString()}`);
}

export async function simularOtimizacaoMalha(
  mdOrigem: string, 
  raioMax: number = 5.0,
  periodoTipo?: string,
  rotulo?: string
): Promise<any> {
  const params = new URLSearchParams({
    md_origem: mdOrigem,
    raio_max: raioMax.toString()
  });
  if (periodoTipo) params.append("periodo_tipo", periodoTipo);
  if (rotulo) params.append("rotulo", rotulo);
  
  const res = await safeFetch(`${API_URL}/api/malha/simular?${params.toString()}`);
  if (!res.ok) throw new Error("Falha ao rodar simulação de malha.");
  return res.json();
}

export async function saveMDAvaliacao(md: string, decisao: string, motivo: string = ""): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/mds/avaliar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ md, decisao, motivo })
  });
  if (!res.ok) throw new Error("Falha ao salvar avaliação do MD.");
  return res.json();
}

export async function generateIAOtimizacao(
  mdOrigem: string,
  periodoTipo: string,
  rotulo: string,
  apiKey?: string
): Promise<{ relatorio: string }> {
  const res = await safeFetch(`${API_URL}/api/ia/otimizar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      md_origem: mdOrigem,
      periodo_tipo: periodoTipo,
      rotulo: rotulo,
      api_key: apiKey || null
    })
  });
  if (!res.ok) throw new Error("Falha ao gerar otimização inteligente da IA.");
  return res.json();
}

export async function importarPlanilhaMapa(file: File): Promise<any> {
  const formData = new FormData();
  formData.append("file", file); // Must match 'file' in router parameter
  
  const res = await safeFetch(`${UPLOAD_API_URL}/api/mapa/importar`, {
    method: "POST",
    headers: getAuthHeaders(true),
    body: formData,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao importar planilha do Mapa.");
  }
  return res.json();
}



export async function salvarObservacaoMapa(iata: string, observacao: string, status_cor: string): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/mapa/observacoes`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ iata, observacao, status_cor }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao salvar observação.");
  }
  return res.json();
}

export async function getSugestaoTrocaMapa(iata: string): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/mapa/sugestoes-troca/${iata}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao consultar IA para sugestões.");
  }
  return res.json();
}

export async function fetchGeminiConfig(): Promise<{
  provider: string;
  configured: boolean;
  gemini_configured: boolean;
  gemini_masked_key: string;
  openrouter_configured: boolean;
  openrouter_masked_key: string;
  deepseek_configured: boolean;
  deepseek_masked_key: string;
  openrouter_model: string;
  masked_key: string;
}> {
  const res = await safeFetch(`${API_URL}/api/config/gemini-key`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Falha ao carregar configuração de IA.");
  return res.json();
}

export async function saveGeminiKey(payload: {
  provider?: string;
  gemini_key?: string;
  openrouter_key?: string;
  deepseek_key?: string;
  openrouter_model?: string;
} | string): Promise<any> {
  const bodyData = typeof payload === "string" ? { provider: "gemini", gemini_key: payload } : payload;
  const res = await safeFetch(`${API_URL}/api/config/gemini-key`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(bodyData),
  });
  if (!res.ok) throw new Error("Falha ao salvar configuração de IA.");
  return res.json();
}

export async function fetchSLAResumo(): Promise<{
  total_pacotes: number;
  concluidos: number;
  dentro_sla: number;
  fora_sla: number;
  extraviados: number;
  taxa_conformidade: number;
  lead_time_coleta_horas: number;
  lead_time_transporte_horas: number;
  lead_time_arrival_horas: number;
  anomalias_roteirizacao: number;
}> {
  const res = await safeFetch(`${API_URL}/api/sla/resumo`);
  if (!res.ok) throw new Error("Falha ao carregar resumo de SLA.");
  return res.json();
}

export async function fetchSLADetalhes(
  page = 1,
  limit = 100,
  search?: string,
  compliance?: string,
  local_perda?: string,
  estado?: string,
  cidade?: string
): Promise<{ items: any[]; total: number; page: number; limit: number; pages: number }> {
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("limit", limit.toString());
  if (search) params.append("search", search);
  if (compliance && compliance !== "ALL") params.append("compliance", compliance);
  if (local_perda && local_perda !== "ALL") params.append("local_perda", local_perda);
  if (estado && estado !== "ALL") params.append("estado", estado);
  if (cidade && cidade !== "ALL") params.append("cidade", cidade);
  
  const url = `${API_URL}/api/sla/detalhes?${params.toString()}`;
  const res = await safeFetch(url);
  if (!res.ok) throw new Error("Falha ao carregar detalhes de auditoria de SLA.");
  return res.json();
}

export async function fetchSLARoteirizacao(
  page = 1,
  limit = 100,
  estado?: string,
  cidade?: string
): Promise<{ items: any[]; total: number; page: number; limit: number; pages: number }> {
  const params = new URLSearchParams();
  params.append("page", page.toString());
  params.append("limit", limit.toString());
  if (estado && estado !== "ALL") params.append("estado", estado);
  if (cidade && cidade !== "ALL") params.append("cidade", cidade);
  
  const url = `${API_URL}/api/sla/roteirizacao?${params.toString()}`;
  const res = await safeFetch(url);
  if (!res.ok) throw new Error("Falha ao carregar anomalias de roteirização.");
  return res.json();
}

export async function fetchSLAEstados(): Promise<string[]> {
  const res = await safeFetch(`${API_URL}/api/sla/options/estados`);
  if (!res.ok) throw new Error("Falha ao carregar estados de origem.");
  return res.json();
}

export async function fetchSLACidades(estado?: string): Promise<string[]> {
  let url = `${API_URL}/api/sla/options/cidades`;
  if (estado && estado !== "ALL") {
    url += `?estado=${encodeURIComponent(estado)}`;
  }
  const res = await safeFetch(url);
  if (!res.ok) throw new Error("Falha ao carregar cidades de origem.");
  return res.json();
}

export async function importarColetaXLSX(file: File): Promise<any> {
  const formData = new FormData();
  formData.append("file_coleta", file);
  
  const res = await safeFetch(`${API_URL}/api/sla/importar`, {
    method: "POST",
    body: formData
  });
  if (!res.ok) throw new Error("Falha ao importar planilha de coleta.");
  return res.json();
}

export interface MDRouteNode {
  md: string;
  lat: number;
  lng: number;
  volume_medio: number;
  anomalias: number;
}

export interface RouteCluster {
  cluster_id: number;
  color: string;
  total_volume: number;
  mds: MDRouteNode[];
  anomalias_total: number;
  is_fixed?: boolean;
  carro_nome?: string;
}

export async function fetchRouteClusters(
  regional: string,
  capacidade: number,
  dataOperacao: string
): Promise<RouteCluster[]> {
  const params = new URLSearchParams({
    capacidade: capacidade.toString(),
    data_operacao: dataOperacao
  });
  const res = await safeFetch(`${API_URL}/api/planejamento/regional/${regional}/clusterizar-rotas?${params.toString()}`);
  if (!res.ok) throw new Error("Falha ao clusterizar rotas.");
  return res.json();
}

export async function importarPlanilhaRotas(
  regional: string,
  dia_semana: string,
  file: File
): Promise<any> {
  const formData = new FormData();
  formData.append("dia_semana", dia_semana);
  formData.append("file", file);
  
  const res = await safeFetch(`${API_URL}/api/planejamento/regional/${regional}/importar-planilhas`, {
    method: "POST",
    body: formData
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao importar planilha de rotas.");
  }
  return res.json();
}

export async function importarBacklog(file: File): Promise<any> {
  const formData = new FormData();
  formData.append("file_backlog", file);
  
  const res = await safeFetch(`${UPLOAD_API_URL}/api/config/importar-backlog`, {
    method: "POST",
    headers: getAuthHeaders(true),
    body: formData
  });
  
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao importar relatório de backlog.");
  }
  return res.json();
}

export interface OportunidadeExpansao {
  cep: string;
  estado: string;
  cidade: string;
  bairro: string;
  total_pedidos: number;
  total_pickup: number;
  total_dropoff: number;
  qtd_sellers: number;
  distancia_km_md_proximo?: number;
  md_mais_proximo?: string;
  tem_md_raio_3km: boolean;
  prioridade: "ALTA_PRIORIDADE" | "MEDIA_PRIORIDADE" | "COBERTO_OU_BAIXO";
  recomendacao: string;
}

export interface ResumoCriacao {
  total_pedidos: number;
  total_sellers: number;
  clientes: { cliente: string; volume: number; percentual: number }[];
  top_polos: { cidade: string; estado: string; bairro: string; volume: number; sellers: number }[];
}

export async function importarCriacao(
  data_operacao: string,
  num_semana: string,
  file_criacao: File
): Promise<any> {
  const formData = new FormData();
  formData.append("data_operacao", data_operacao);
  formData.append("num_semana", num_semana);
  formData.append("file_criacao", file_criacao);

  const res = await safeFetch(`${UPLOAD_API_URL}/api/config/importar-criacao`, {
    method: "POST",
    headers: getAuthHeaders(true),
    body: formData,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao importar planilha de criação de pedidos.");
  }
  return res.json();
}

export async function importarDupla(
  data_operacao: string,
  num_semana: string,
  file_operacional: File,
  file_criacao?: File | null,
  file_mds?: File | null
): Promise<any> {
  const formData = new FormData();
  formData.append("data_operacao", data_operacao);
  formData.append("num_semana", num_semana);
  formData.append("file_operacional", file_operacional);
  if (file_criacao) formData.append("file_criacao", file_criacao);
  if (file_mds) formData.append("file_mds", file_mds);

  const res = await safeFetch(`${UPLOAD_API_URL}/api/config/importar-dupla`, {
    method: "POST",
    headers: getAuthHeaders(true),
    body: formData,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao processar ingestão das planilhas.");
  }
  invalidateApiCache();
  return res.json();
}

export async function getExpansaoOportunidades(
  periodoTipo: string = "Diário",
  rotulo: string = "latest",
  dtInicio?: string,
  dtFim?: string,
  estado?: string,
  cidade?: string,
  minPedidos: number = 50
): Promise<OportunidadeExpansao[]> {
  const params = new URLSearchParams({
    periodo_tipo: periodoTipo,
    rotulo: rotulo,
    min_pedidos: String(minPedidos),
  });
  if (dtInicio) params.append("dt_inicio", dtInicio);
  if (dtFim) params.append("dt_fim", dtFim);
  if (estado) params.append("estado", estado);
  if (cidade) params.append("cidade", cidade);

  return fetchWithCache<OportunidadeExpansao[]>(`${API_URL}/api/expansao/oportunidades?${params.toString()}`);
}

export async function getExpansaoResumo(
  periodoTipo: string = "Diário",
  rotulo: string = "latest",
  dtInicio?: string,
  dtFim?: string,
  cliente?: string,
  estado?: string
): Promise<ResumoCriacao> {
  const params = new URLSearchParams({
    periodo_tipo: periodoTipo,
    rotulo: rotulo,
  });
  if (dtInicio) params.append("dt_inicio", dtInicio);
  if (dtFim) params.append("dt_fim", dtFim);
  if (cliente) params.append("cliente", cliente);
  if (estado) params.append("estado", estado);

  return fetchWithCache<ResumoCriacao>(`${API_URL}/api/expansao/resumo?${params.toString()}`);
}

export async function perguntarCopilotoGeral(
  prompt: string,
  apiKey?: string | null
): Promise<{ resposta: string }> {
  const res = await safeFetch(`${API_URL}/api/ia`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tipo: "free",
      filial: "EXPANSAO",
      contexto_adicional: prompt,
      api_key: apiKey || null,
    }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao consultar copiloto IA.");
  }
  const data = await res.json();
  return { resposta: data.resultado || data.resposta || "" };
}

// ─── Viabilidade por Cidade ────────────────────────────────────────────────────
export interface ViabilidadeCidade {
  cidade: string;
  estado: string;
  volume_total: number;
  media_diaria: number;
  qtd_sellers: number;
  por_cliente: { cliente: string; volume: number; percentual: number }[];
  top_bairros: { bairro: string; volume: number; sellers: number }[];
  dias_analisados: number;
  raio_km: number;
}

export async function getViabilidadeCidade(
  cidade: string,
  estado: string,
  bairro?: string,
  raioKm: number = 5.0,
  periodoTipo: string = "Diário",
  rotulo: string = "latest"
): Promise<ViabilidadeCidade> {
  const params = new URLSearchParams({ cidade, estado, raio_km: String(raioKm), periodo_tipo: periodoTipo, rotulo });
  if (bairro) params.append("bairro", bairro);
  return fetchWithCache<ViabilidadeCidade>(`${API_URL}/api/expansao/viabilidade?${params.toString()}`, 30000);
}

// ─── Crescimento Semana a Semana ──────────────────────────────────────────────
export interface CrescimentoPolo {
  polo: string;
  cidade: string;
  estado: string;
  bairro: string;
  semanas: { semana: string; volume: number; sellers: number }[];
  crescimento_pct: number;
  tendencia: "CRESCENDO" | "ESTAVEL" | "CAINDO" | "SEM_DADOS";
  volume_atual: number;
}

export async function getCrescimentoPolo(
  cidade: string,
  estado: string,
  bairro?: string
): Promise<CrescimentoPolo> {
  const params = new URLSearchParams({ cidade, estado });
  if (bairro) params.append("bairro", bairro);
  return fetchWithCache<CrescimentoPolo>(`${API_URL}/api/expansao/crescimento?${params.toString()}`, 60000);
}

// ─── Propostas de Expansão CRUD ───────────────────────────────────────────────
export interface PropostaExpansao {
  id: number;
  cidade: string;
  estado: string;
  bairro: string;
  cep_alvo: string;
  volume_estimado: number;
  qtd_sellers_estimada: number;
  distancia_md_mais_proximo?: number | null;
  md_mais_proximo?: string | null;
  clientes_principais?: { cliente: string; volume: number; percentual: number }[] | null;
  justificativa: string;
  status: "Em Análise" | "Aprovada" | "Recusada" | "Em Implantação";
  prioridade: "ALTA" | "MEDIA" | "BAIXA";
  criado_em: string;
  atualizado_em: string;
  criado_por: string;
  observacoes?: string | null;
}

export async function getPropostas(status?: string, estado?: string): Promise<PropostaExpansao[]> {
  const params = new URLSearchParams();
  if (status) params.append("status", status);
  if (estado) params.append("estado", estado);
  const res = await safeFetch(`${API_URL}/api/expansao/propostas?${params.toString()}`);
  if (!res.ok) throw new Error("Falha ao buscar propostas.");
  return res.json();
}

export async function criarProposta(dados: Partial<PropostaExpansao>): Promise<PropostaExpansao> {
  const res = await safeFetch(`${API_URL}/api/expansao/propostas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Falha ao criar proposta."); }
  invalidateApiCache();
  return res.json();
}

export async function atualizarProposta(id: number, dados: Partial<PropostaExpansao>): Promise<PropostaExpansao> {
  const res = await safeFetch(`${API_URL}/api/expansao/propostas/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || "Falha ao atualizar proposta."); }
  invalidateApiCache();
  return res.json();
}

export async function deletarProposta(id: number): Promise<void> {
  const res = await safeFetch(`${API_URL}/api/expansao/propostas/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Falha ao deletar proposta.");
  invalidateApiCache();
}

export interface SimuladorViabilidadeResult {
  cep_info: {
    cidade: string;
    estado: string;
    bairro: string;
    endereco: string;
    lat: number;
    lng: number;
  };
  demanda: {
    dia_base: string;
    total_pedidos: number;
    qtd_sellers: number;
  };
  analise: {
    raio_km: number;
    mds_no_raio: number;
    mds_proximos: Array<{
      codigo: string;
      nome: string;
      distancia_km: number;
      status: string;
    }>;
    score: "VERDE" | "AMARELO" | "VERMELHO";
    parecer: string;
  };
}

export const simularViabilidadeMD = async (cep: string, raioKm: number = 5.0): Promise<SimuladorViabilidadeResult> => {
  return await fetchWithCache(`${API_URL}/api/expansao/simulador?cep=${cep}&raio_km=${raioKm}`);
};



export async function importarDropoff(
  file: File,
  data_operacao: string,
  num_semana: string
): Promise<any> {
  const formData = new FormData();
  formData.append("data_operacao", data_operacao);
  formData.append("num_semana", num_semana);
  formData.append("file_operacional", file);

  const res = await safeFetch(`${UPLOAD_API_URL}/api/config/importar-dropoff`, {
    method: "POST",
    headers: getAuthHeaders(true),
    body: formData,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao importar Dropoff.");
  }
  invalidateApiCache();
  return res.json();
}

export async function importarPickup(
  file: File,
  data_operacao: string,
  num_semana: string
): Promise<any> {
  const formData = new FormData();
  formData.append("data_operacao", data_operacao);
  formData.append("num_semana", num_semana);
  formData.append("file_operacional", file);

  const res = await safeFetch(`${UPLOAD_API_URL}/api/config/importar-pickup`, {
    method: "POST",
    headers: getAuthHeaders(true),
    body: formData,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao importar Pickup.");
  }
  invalidateApiCache();
  return res.json();
}

export async function importarCriacaoD1(
  file: File,
  data_operacao: string,
  num_semana: string
): Promise<any> {
  return importarCriacao(data_operacao, num_semana, file);
}

export async function importarCriacaoHoje(
  file: File,
  data_operacao: string,
  num_semana: string
): Promise<any> {
  return importarCriacao(data_operacao, num_semana, file);
}

export interface PontoMapaInput {
  iata: string;
  collection_point_name: string;
  endere_o?: string;
  cidade?: string;
  estado?: string;
  latitude: number;
  longitude: number;
  shein?: string;
  data_credenciamento?: string;
}

export async function cadastrarPontoMapa(payload: PontoMapaInput): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/mapa/pontos`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao cadastrar ponto no mapa.");
  }
  invalidateApiCache();
  return res.json();
}

export async function editarPontoMapa(iata: string, payload: PontoMapaInput): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/mapa/pontos/${encodeURIComponent(iata)}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao editar ponto no mapa.");
  }
  invalidateApiCache();
  return res.json();
}

export async function excluirPontoMapa(iata: string): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/mapa/pontos/${encodeURIComponent(iata)}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao excluir ponto no mapa.");
  }
  invalidateApiCache();
  return res.json();
}

export async function fetchDropoffNovosMDsReport(regional?: string): Promise<any> {
  const params = new URLSearchParams();
  if (regional && regional !== "TODOS") params.append("regional", regional);
  const res = await safeFetch(`${API_URL}/api/dropoff/radar/novos-mds-relatorio-diario?${params.toString()}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Falha ao carregar relatório diário de novos MDs.");
  return res.json();
}

export async function fetchPickupPendentesAtraso(regional?: string, marketplace?: string): Promise<any> {
  const params = new URLSearchParams();
  if (regional && regional !== "TODOS") params.append("regional", regional);
  if (marketplace && marketplace !== "Todos") params.append("marketplace", marketplace);
  const res = await safeFetch(`${API_URL}/api/pickup/radar/pendentes-atraso?${params.toString()}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Falha ao carregar solicitações de pickup em atraso.");
  return res.json();
}

export async function importarHojeIncremental(file: File, data_operacao: string): Promise<any> {
  const formData = new FormData();
  formData.append("data_operacao", data_operacao);
  formData.append("file", file);

  const res = await safeFetch(`${API_URL}/api/config/importar-hoje-incremental`, {
    method: "POST",
    headers: getAuthHeaders(true),
    body: formData,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao importar planilha D0 incremental.");
  }
  invalidateApiCache();
  return res.json();
}

export async function zerarBaseOperacional(): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/config/zerar-base`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Falha ao zerar base operacional.");
  }
  invalidateApiCache();
  return res.json();
}


export interface SolicitacaoImplantacaoItem {
  id: number;
  codigo: string;
  cliente_nome: string;
  vendedor_comercial: string;
  focal_projetos: string;
  focal_operacao: string;
  segmento?: string;
  endereco_coleta?: string;
  cidade: string;
  estado: string;
  cep?: string;
  volume_estimado_diario?: number;
  horario_coleta_janela?: string;
  observacoes_comercial?: string;
  data_solicitacao: string;
  status: string;
  condicao_viabilidade?: string;
  capacidade_operacional_ok?: number;
  disponibilidade_frota_ok?: number;
  atendimento_regiao_ok?: number;
  necessidade_contratacao_equipe?: number;
  necessidade_novas_rotas?: number;
  estrutura_equipamentos_ok?: number;
  parecer_operacional?: string;
  status_visita?: string;
  data_visita_tecnica?: string;
  relatorio_visita?: string;
  pda_qtd?: number;
  mesa_posto_operacional?: string;
  equipamentos_desc?: string;
  equipe_contratacao_desc?: string;
  rotas_frota_desc?: string;
  insumos_desc?: string;
  outros_recursos?: string;
  data_go_live_prevista?: string;
  go_live_validado_operacao?: number;
  comunicado_comercial_em?: string;
  comercial_ciente?: number;
  gestor_nome?: string;
  parecer_gestor_decisao?: string;
  parecer_gestor_texto?: string;
  parecer_gestor_ressalvas?: string;
  parecer_gestor_data?: string;
  criado_em?: string;
  atualizado_em?: string;
  historico_status?: string;
}

export async function fetchImplantacaoStats(): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/implantacao/stats`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Falha ao carregar estatísticas do fluxo.");
  return res.json();
}

export async function fetchSolicitacoesImplantacao(status?: string, search?: string): Promise<SolicitacaoImplantacaoItem[]> {
  const params = new URLSearchParams();
  if (status && status !== "TODOS") params.append("status", status);
  if (search) params.append("search", search);
  const res = await safeFetch(`${API_URL}/api/implantacao/solicitacoes?${params.toString()}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Falha ao listar solicitações.");
  return res.json();
}

export async function createSolicitacaoImplantacao(data: any): Promise<SolicitacaoImplantacaoItem> {
  const res = await safeFetch(`${API_URL}/api/implantacao/solicitacoes`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Falha ao criar solicitação.");
  invalidateApiCache();
  return res.json();
}

export async function updateViabilidadeImplantacao(id: number, data: any): Promise<SolicitacaoImplantacaoItem> {
  const res = await safeFetch(`${API_URL}/api/implantacao/solicitacoes/${id}/viabilidade`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Falha ao atualizar análise de viabilidade.");
  invalidateApiCache();
  return res.json();
}

export async function updateVisitaImplantacao(id: number, data: any): Promise<SolicitacaoImplantacaoItem> {
  const res = await safeFetch(`${API_URL}/api/implantacao/solicitacoes/${id}/visita`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Falha ao atualizar visita técnica.");
  invalidateApiCache();
  return res.json();
}

export async function updateRecursosGoLiveImplantacao(id: number, data: any): Promise<SolicitacaoImplantacaoItem> {
  const res = await safeFetch(`${API_URL}/api/implantacao/solicitacoes/${id}/recursos-golive`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Falha ao atualizar recursos e Go-Live.");
  invalidateApiCache();
  return res.json();
}

export async function comunicarComercialImplantacao(id: number, data: any): Promise<SolicitacaoImplantacaoItem> {
  const res = await safeFetch(`${API_URL}/api/implantacao/solicitacoes/${id}/comunicar-comercial`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Falha ao atualizar comunicação com Comercial.");
  invalidateApiCache();
  return res.json();
}

export async function updateStatusImplantacao(id: number, status: string, observacao = ""): Promise<SolicitacaoImplantacaoItem> {
  const res = await safeFetch(`${API_URL}/api/implantacao/solicitacoes/${id}/status`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify({ status, observacao }),
  });
  if (!res.ok) throw new Error("Falha ao atualizar status.");
  invalidateApiCache();
  return res.json();
}

export async function fetchRelatorioQuartaImplantacao(): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/implantacao/relatorio-quarta`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Falha ao gerar relatório de quarta-feira.");
  return res.json();
}

export async function updateParecerGestorImplantacao(id: number, data: any): Promise<SolicitacaoImplantacaoItem> {
  const res = await safeFetch(`${API_URL}/api/implantacao/solicitacoes/${id}/parecer-gestor`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Falha ao registrar parecer do gestor.");
  invalidateApiCache();
  return res.json();
}

export async function fetchDiagnosticoD1Implantacao(id: number): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/implantacao/solicitacoes/${id}/diagnostico-d1`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Falha ao carregar diagnóstico histórico da D-1.");
  return res.json();
}

export interface CockpitD1Totais {
  total_pedidos: number;
  total_pontos_todos: number;
  total_mds_biparam: number;
  total_hubs_biparam: number;
  total_sellers: number;
  total_clientes: number;
  coletados: number;
  total_coletado?: number;
  backlog: number;
  total_backlog?: number;
  taxa_coleta: number;
  taxa_coleta_geral?: number;
  is_modo_geral?: boolean;
  media_diaria_pedidos?: number;
  dias_contabilizados?: number;
}

export interface CockpitD1Status {
  status: string;
  volume: number;
  percentual: number;
  tipo: string;
}

export interface CockpitD1Modalidade {
  modalidade: string;
  volume: number;
  share_pct: number;
  qtd_sellers: number;
  coletados: number;
  backlog: number;
  taxa_coleta: number;
}

export interface CockpitD1Cliente {
  nome_cliente: string;
  volume: number;
  share_pct: number;
  qtd_sellers: number;
  qtd_mds: number;
  coletados: number;
  backlog: number;
  taxa_coleta: number;
}

export interface CockpitD1MD {
  ponto_colecao: string;
  nome_display?: string;
  cidade: string;
  estado: string;
  volume: number;
  qtd_sellers: number;
  coletados: number;
  backlog: number;
  taxa_coleta: number;
  tipo_ponto: "MD" | "HUB";
  tipo_label: string;
  operacao: string;
  manual_override?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

export interface CockpitD1Seller {
  merchant_nome: string;
  nome_cliente: string;
  cidade: string;
  estado: string;
  maneira_coleta: string;
  volume: number;
  coletados: number;
  backlog: number;
  taxa_coleta: number;
}

export interface CockpitD1SellerMapa {
  merchant_nome: string;
  cidade: string;
  estado: string;
  cep: string;
  nome_cliente: string;
  volume: number;
  ponto_colecao: string;
  latitude: number;
  longitude: number;
  dest_latitude?: number | null;
  dest_longitude?: number | null;
  dest_nome?: string;
}

export interface CockpitD1Evolucao {
  dia: string;
  volume: number;
  qtd_sellers: number;
  qtd_pontos: number;
  coletados: number;
  backlog: number;
  taxa_coleta: number;
}

export interface ViabilidadeCidadeVizinha {
  cidade: string;
  estado: string;
  distancia_km: number;
  volume_historico: number;
  qtd_sellers: number;
  qtd_pontos: number;
  sinergia_rota: string;
  viabilidade_tipo: "ALTA" | "MEDIA" | "BAIXA";
}

export interface ViabilidadeRapidaResult {
  cidade: string;
  estado: string;
  cliente: string;
  veredito: "ALTA" | "MEDIA" | "BAIXA";
  veredito_label: string;
  cor: string;
  ja_operamos: boolean;
  volume_historico: number;
  qtd_sellers_ativos: number;
  top_sellers: { nome: string; volume: number }[];
  mds_locais: {
    ponto: string;
    nome: string;
    cidade: string;
    estado: string;
    endereco: string;
    lat?: number | null;
    lng?: number | null;
  }[];
  hub_proximo?: {
    iata: string;
    nome: string;
    cidade: string;
    estado: string;
    lat: number;
    lng: number;
    distancia_km: number;
  } | null;
  cidades_proximas?: ViabilidadeCidadeVizinha[];
  latitude?: number | null;
  longitude?: number | null;
  prazo_estimado: string;
  motivos: string[];
  recomendacao_operacional: string;
}

export interface GeocodificacaoResult {
  encontrado: boolean;
  query: string;
  display_name?: string;
  tipo?: "endereco" | "cidade" | "ponto_anjun";
  cidade?: string;
  estado?: string;
  latitude?: number;
  longitude?: number;
  mensagem?: string;
  hub_mais_proximo?: {
    iata: string;
    nome: string;
    cidade: string;
    estado: string;
    distancia_km: number;
    latitude?: number;
    longitude?: number;
  } | null;
  md_mais_proximo?: {
    codigo: string;
    nome: string;
    cidade: string;
    estado: string;
    distancia_km: number;
    latitude?: number;
    longitude?: number;
  } | null;
}

export interface CockpitD1Data {
  dia_selecionado: string;
  dias_disponiveis: string[];
  is_modo_geral?: boolean;
  totais: CockpitD1Totais;
  status_detalhe: CockpitD1Status[];
  modalidades_breakdown: CockpitD1Modalidade[];
  clientes_breakdown: CockpitD1Cliente[];
  mds_breakdown: CockpitD1MD[];
  mapa_pontos_plotaveis: CockpitD1MD[];
  sellers_breakdown: CockpitD1Seller[];
  sellers_mapa?: CockpitD1SellerMapa[];
  evolucao_temporal?: CockpitD1Evolucao[];
}

export async function fetchCockpitD1(dia?: string): Promise<CockpitD1Data> {
  const url = dia ? `${API_URL}/api/implantacao/cockpit-d1?dia=${encodeURIComponent(dia)}` : `${API_URL}/api/implantacao/cockpit-d1`;
  const res = await safeFetch(url, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Falha ao carregar dados consolidados D-1.");
  return res.json();
}

export async function consultarViabilidadeRapida(cidade: string, estado?: string, cliente?: string): Promise<ViabilidadeRapidaResult> {
  const params = new URLSearchParams({ cidade });
  if (estado) params.append("estado", estado);
  if (cliente) params.append("cliente", cliente);

  const res = await safeFetch(`${API_URL}/api/implantacao/viabilidade-rapida?${params.toString()}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Falha ao consultar motor de viabilidade da malha.");
  return res.json();
}

export async function geocodificarEndereco(query: string): Promise<GeocodificacaoResult> {
  const params = new URLSearchParams({ query });
  const res = await safeFetch(`${API_URL}/api/implantacao/geocodificar-endereco?${params.toString()}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Falha ao localizar endereço ou município.");
  return res.json();
}

export async function salvarClassificacaoPonto(pontoCodigo: string, tipo: "MD" | "HUB"): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/implantacao/pontos/classificacao`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ ponto_codigo: pontoCodigo, tipo }),
  });
  if (!res.ok) throw new Error("Falha ao salvar classificação do ponto.");
  return res.json();
}

export async function removerClassificacaoPonto(pontoCodigo: string): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/implantacao/pontos/classificacao/${encodeURIComponent(pontoCodigo)}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Falha ao remover classificação personalizada.");
  return res.json();
}

export async function fetchClassificacoesPontos(): Promise<{ ponto_codigo: string; tipo: "MD" | "HUB"; atualizado_em: string }[]> {
  const res = await safeFetch(`${API_URL}/api/implantacao/pontos/classificacao`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Falha ao listar classificações personalizadas.");
  return res.json();
}

export async function otimizarPlanilha(
  file: File,
  atualizarSistema: boolean = true,
  dataOperacao?: string,
  numSemana?: string,
  modo: "central" | "no_dia" = "central"
): Promise<{ job_id: string; status: string; tamanho_original_mb: number }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("atualizar_sistema", atualizarSistema ? "true" : "false");
  formData.append("modo", modo);
  if (dataOperacao) formData.append("data_operacao", dataOperacao);
  if (numSemana) formData.append("num_semana", numSemana);

  const res = await safeFetch(`${UPLOAD_API_URL}/api/config/otimizar-planilha`, {
    method: "POST",
    headers: getAuthHeaders(true),
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Falha ao enviar planilha para processamento: ${errorText || res.statusText}`);
  }

  return res.json();
}

export function getDownloadOtimizadoUrl(jobId: string, formato: "xlsx" | "csv" = "xlsx"): string {
  return `${API_URL}/api/config/download-otimizado/${jobId}/${formato}`;
}

// ─────────────────────────────────────────────────────────────────
// Módulo de Coletas (Central de Coletas)
// ─────────────────────────────────────────────────────────────────

export async function fetchDiasColetas(): Promise<{ dias: string[]; dia_recente: string | null }> {
  const res = await safeFetch(`${API_URL}/api/coletas/dias`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Falha ao carregar datas de coleta.");
  return res.json();
}

export async function fetchResumoColetas(dia?: string, cliente?: string, regional?: string): Promise<any> {
  const p = new URLSearchParams();
  if (dia) p.append("dia", dia);
  if (cliente) p.append("cliente", cliente);
  if (regional) p.append("regional", regional);
  const res = await safeFetch(`${API_URL}/api/coletas/resumo?${p.toString()}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Falha ao carregar resumo de coletas.");
  return res.json();
}

export async function fetchMdsColetas(dia?: string, cliente?: string, regional?: string, search?: string, filtro_tipo?: string): Promise<any> {
  const p = new URLSearchParams();
  if (dia) p.append("dia", dia);
  if (cliente) p.append("cliente", cliente);
  if (regional) p.append("regional", regional);
  if (search) p.append("search", search);
  if (filtro_tipo) p.append("filtro_tipo", filtro_tipo);
  const res = await safeFetch(`${API_URL}/api/coletas/mds?${p.toString()}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Falha ao carregar lista de MDs.");
  return res.json();
}

export async function fetchSellersColetas(dia?: string, cliente?: string, regional?: string, search?: string): Promise<any> {
  const p = new URLSearchParams();
  if (dia) p.append("dia", dia);
  if (cliente) p.append("cliente", cliente);
  if (regional) p.append("regional", regional);
  if (search) p.append("search", search);
  const res = await safeFetch(`${API_URL}/api/coletas/sellers?${p.toString()}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Falha ao carregar lista de sellers.");
  return res.json();
}

export async function fetchHorariosColetas(dia?: string, md?: string): Promise<any> {
  const p = new URLSearchParams();
  if (dia) p.append("dia", dia);
  if (md) p.append("md", md);
  const res = await safeFetch(`${API_URL}/api/coletas/horarios?${p.toString()}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Falha ao carregar análise de horários de bipagem.");
  return res.json();
}

export async function cadastrarPontoColeta(data: {
  md_codigo: string;
  nome_ponto?: string;
  tipo_ponto?: string;
  cep?: string;
  endereco?: string;
  horario_trabalho?: string;
  cidade: string;
  estado: string;
  regional: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/coletas/cadastrar-ponto`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Erro ao cadastrar ponto." }));
    throw new Error(err.detail || "Erro ao cadastrar ponto.");
  }
  invalidateApiCache();
  return res.json();
}

// ─────────────────────────────────────────────────────────────────
// Copilot IA (Consultas Grounded no SQLite com Zero Alucinação)
// ─────────────────────────────────────────────────────────────────

export interface PerguntaSugeridaIA {
  id: string;
  categoria: string;
  titulo: string;
  pergunta: string;
  icone: string;
}

export interface RespostaCopilotIA {
  sucesso: boolean;
  pergunta: string;
  resposta: string;
  sql_executada?: string | null;
  colunas?: string[];
  total_registros?: number;
  tempo_ms?: number;
  dados_amostra?: any[];
  erro?: string | null;
}

export async function fetchStatusIA(): Promise<{ status: string; provider: string; configurado: boolean; modelo: string }> {
  const res = await safeFetch(`${API_URL}/api/ia/status`, { headers: getAuthHeaders() });
  if (!res.ok) return { status: "offline", provider: "gemini", configurado: false, modelo: "gemini-2.5-flash" };
  return res.json();
}

export async function fetchPerguntasSugeridasIA(): Promise<PerguntaSugeridaIA[]> {
  const res = await safeFetch(`${API_URL}/api/ia/perguntas-sugeridas`, { headers: getAuthHeaders() });
  if (!res.ok) return [];
  return res.json();
}

export async function consultarCopilotIA(pergunta: string, apiKey?: string): Promise<RespostaCopilotIA> {
  const res = await safeFetch(`${API_URL}/api/ia/consultar`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ pergunta, api_key: apiKey }),
  });
  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Falha na consulta ao Copilot: ${errorText || res.statusText}`);
  }
  return res.json();
}

// ─────────────────────────────────────────────────────────────────
// Módulo "No Dia" (D0 / Tempo Real e Drop-off Preditivo)
// ─────────────────────────────────────────────────────────────────

export interface ColetasNoDiaPonto {
  md_codigo: string;
  nome_ponto: string;
  tipo_ponto: string;
  cidade: string;
  estado: string;
  regional: string;
  cep?: string;
  latitude?: number | null;
  longitude?: number | null;
  previstos_diretos: number;
  previstos_dropoff_cep: number;
  total_previstos: number;
  bipados: number;
  backlog: number;
  pendentes: number;
  ritmo_pct: number;
  status_operacional: "Operação Ativa" | "Aguardando 1ª Bipagem" | "Alerta de Backlog" | "Sem Previsão Hoje";
}

export interface ColetasNoDiaKpis {
  dia_operacional: string;
  total_previstos: number;
  total_bipados: number;
  total_pendentes: number;
  total_backlog: number;
  ritmo_geral_pct: number;
  total_mds_rede: number;
  mds_operando: number;
  mds_aguardando: number;
  mds_alerta: number;
  mds_sem_previsao: number;
  vol_dropoff_preditivo_cep: number;
  total_dropoffs_sem_md?: number;
  qtd_sellers_sem_md?: number;
}

export interface DropoffSemMd {
  id: string;
  merchant_nome: string;
  nome_cliente: string;
  cep: string;
  cidade: string;
  estado: string;
  bairro?: string;
  maneira_coleta: string;
  ponto_atual: string;
  volume: number;
  status_pedido: string;
  md_provavel_codigo: string;
  md_provavel_nome: string;
  md_provavel_tipo: string;
  distancia_km: number | null;
  status_roteirizacao: string;
}

export interface AlertaOperacionalNoDia {
  tipo: "COLETA_PENDENTE" | "DROPOFF_CONCENTRACAO_CEP";
  nivel: "warning" | "info" | "urgent";
  titulo: string;
  mensagem: string;
  md_codigo?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  distancia_km?: number | null;
  volume: number;
}

export interface ColetasNoDiaResponse {
  status: string;
  dia_selecionado: string;
  kpis: ColetasNoDiaKpis;
  total_pontos: number;
  mds: ColetasNoDiaPonto[];
  dropoffs_sem_md?: DropoffSemMd[];
  total_dropoffs_sem_md?: number;
  alertas_operacionais?: AlertaOperacionalNoDia[];
}

export async function fetchColetasNoDia(params?: {
  dia?: string;
  regional?: string;
  tipo_ponto?: string;
  status_filtro?: string;
  search?: string;
}): Promise<ColetasNoDiaResponse> {
  const p = new URLSearchParams();
  if (params?.dia) p.append("dia", params.dia);
  if (params?.regional) p.append("regional", params.regional);
  if (params?.tipo_ponto) p.append("tipo_ponto", params.tipo_ponto);
  if (params?.status_filtro) p.append("status_filtro", params.status_filtro);
  if (params?.search) p.append("search", params.search);

  const res = await safeFetch(`${API_URL}/api/coletas/no-dia?${p.toString()}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Falha ao carregar dados operacionais do dia.");
  return res.json();
}

// ─────────────────────────────────────────────────────────────────
// Módulo Projeto D2D SP (Fase 1 Pilotos & Fase 2 Expansão)
// ─────────────────────────────────────────────────────────────────

export interface D2dSpDiaHistorico {
  dia: string;
  dia_curto: string;
  teve_visita: boolean;
  qtd_recebida: number;
  qtd_backlog: number;
  qtd_perus: number;
  qtd_assinado?: number;
  tempo_perus_fmt: string;
}

export interface D2dSpMdItem {
  codigo_curto: string;
  md_codigo: string;
  nome_ponto: string;
  cidade: string;
  estado: string;
  regional: string;
  endereco: string;
  is_piloto_original: boolean;
  teve_visita: boolean;
  dias_com_visita: number;
  total_dias_periodo: number;
  dias_ativos_historico: number;
  total_dias_historico: number;
  streak_consecutivo: number;
  qtd_recebida: number;
  media_diaria: number;
  qtd_backlog: number;
  backlog_pct: number;
  qtd_perus: number;
  perus_pct: number;
  qtd_em_transito: number;
  qtd_assinado: number;
  tempo_perus_horas: number | null;
  tempo_perus_fmt: string;
  hora_media_bipagem: string | null;
  hora_media_perus: string | null;
  status_expansao?: string;
  qtd_destino_sp?: number;
  qtd_destino_outros?: number;
  pct_destino_sp?: number;
  qtd_confirmado_perus?: number;
  pct_confirmado_perus?: number;
  qtd_lacres?: number;
  qtd_lacres_sp?: number;
  qtd_lacres_outros?: number;
  placas_veiculos?: string;
  iatas_descarga?: string;
  historico_diario: D2dSpDiaHistorico[];
  status_rastreio?: "CONFIRMADO_PERUS" | "AGUARDANDO_CONCILIACAO" | "INTERESTADUAL" | "SEM_VISITA";
  label_rastreio?: string;
  cor_status?: "emerald" | "amber" | "blue" | "slate";
  motivo_rastreio?: string;
  foi_validado_perus?: boolean;
  md_operou_correto?: boolean;
}

export interface D2dSpKpisPilotos {
  total_pilotos: number;
  pilotos_com_visita: number;
  pilotos_sem_visita: number;
  pilotos_confirmados_perus?: number;
  taxa_confirmacao_perus?: number;
  qtd_recebida_total: number;
  qtd_backlog_total: number;
  backlog_pct_geral: number;
  qtd_perus_total: number;
  perus_pct_geral: number;
  qtd_critico_assinado_total?: number;
  qtd_destino_sp_total?: number;
  qtd_destino_outros_total?: number;
  pct_destino_sp_geral?: number;
  qtd_confirmado_perus_total?: number;
  pct_confirmado_perus_geral?: number;
  qtd_lacres_total?: number;
  qtd_lacres_sp_total?: number;
  qtd_lacres_outros_total?: number;
  tempo_medio_perus_horas: number | null;
  tempo_medio_perus_fmt: string;
}

export interface D2dSpResponse {
  status: string;
  periodo_selecionado: string;
  dia_referencia: string;
  dias_considerados: string[];
  dias_historico_matriz: string[];
  todos_dias_disponiveis: string[];
  kpis_pilotos: D2dSpKpisPilotos;
  pilotos: D2dSpMdItem[];
  candidatos_expansao: D2dSpMdItem[];
  total_candidatos: number;
}

export async function fetchD2dSpAnalise(params?: {
  periodo?: string;
  dia?: string;
  search?: string;
  filtro_expansao?: string;
}): Promise<D2dSpResponse> {
  const p = new URLSearchParams();
  if (params?.periodo) p.append("periodo", params.periodo);
  if (params?.dia) p.append("dia", params.dia);
  if (params?.search) p.append("search", params.search);
  if (params?.filtro_expansao) p.append("filtro_expansao", params.filtro_expansao);

  const res = await safeFetch(`${API_URL}/api/coletas/d2d-sp?${p.toString()}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error("Falha ao carregar análise do Projeto D2D SP.");
  return res.json();
}

export async function promoverMdD2dSp(mdCodigo: string): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/coletas/d2d-sp/promover`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ md_codigo: mdCodigo }),
  });
  if (!res.ok) throw new Error("Falha ao promover MD para o projeto D2D SP.");
  invalidateApiCache();
  return res.json();
}

export async function removerMdD2dSp(codigoCurto: string): Promise<any> {
  const res = await safeFetch(`${API_URL}/api/coletas/d2d-sp/remover/${encodeURIComponent(codigoCurto)}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error("Falha ao remover MD promovido.");
  invalidateApiCache();
  return res.json();
}

export async function uploadCaminhoesD2d(file: File): Promise<{ status: string; message: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await safeFetch(`${API_URL}/api/coletas/d2d-sp/upload-caminhoes`, {
    method: "POST",
    headers: getAuthHeaders(true),
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Erro ao enviar planilha de caminhões." }));
    throw new Error(err.detail || "Erro ao enviar planilha de caminhões.");
  }
  invalidateApiCache();
  return res.json();
}


