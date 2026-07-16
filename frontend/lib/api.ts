export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getAuthHeaders(isFormData = false): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('admin_token') : null;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!isFormData) headers['Content-Type'] = 'application/json';
  return headers;
}

export interface OptionsData {
  dias: string[];
  semanas: string[];
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

// Options filter
export async function fetchOptions(): Promise<OptionsData> {
  const res = await fetch(`${API_URL}/api/opcoes`);
  if (!res.ok) throw new Error("Falha ao buscar opções de filtros.");
  return res.json();
}

// Summary statistics
export async function fetchResumo(
  periodoTipo: string,
  rotulo: string,
  regional?: string | null,
  dtInicio?: string | null,
  dtFim?: string | null,
  regra5k?: boolean
): Promise<ResumoGeral> {
  const params = new URLSearchParams({
    periodo_tipo: periodoTipo,
    rotulo: rotulo,
  });
  if (regional) params.append("regional", regional);
  if (dtInicio) params.append("dt_inicio", dtInicio);
  if (dtFim) params.append("dt_fim", dtFim);
  if (regra5k) params.append("regra5k", "true");

  const res = await fetch(`${API_URL}/api/resumo?${params.toString()}`);
  if (!res.ok) throw new Error("Falha ao carregar o resumo de dados.");
  return res.json();
}

// Radar de Malha
export async function fetchMalha(regional?: string | null): Promise<MalhaPacote[]> {
  const params = new URLSearchParams();
  if (regional) params.append("regional", regional);

  const res = await fetch(`${API_URL}/api/malha?${params.toString()}`);
  if (!res.ok) throw new Error("Falha ao buscar radar de malha.");
  return res.json();
}

// Clientes Performance
export async function fetchClientes(
  periodoTipo: string,
  rotulo: string,
  regional?: string | null,
  dtInicio?: string | null,
  dtFim?: string | null
): Promise<ClienteRanking[]> {
  const params = new URLSearchParams({
    periodo_tipo: periodoTipo,
    rotulo: rotulo,
  });
  if (regional) params.append("regional", regional);
  if (dtInicio) params.append("dt_inicio", dtInicio);
  if (dtFim) params.append("dt_fim", dtFim);

  const res = await fetch(`${API_URL}/api/clientes?${params.toString()}`);
  if (!res.ok) throw new Error("Falha ao buscar performance de clientes.");
  return res.json();
}

// Justifications
export async function fetchJustificativas(
  diaBase?: string | null,
  regional?: string | null
): Promise<Justificativa[]> {
  const params = new URLSearchParams();
  if (diaBase) params.append("dia_base", diaBase);
  if (regional) params.append("regional", regional);

  const res = await fetch(`${API_URL}/api/justificativas?${params.toString()}`);
  if (!res.ok) throw new Error("Falha ao buscar justificativas.");
  return res.json();
}

export async function saveJustificativa(
  diaBase: string,
  regional: string,
  justificativa: string
): Promise<Justificativa> {
  const res = await fetch(`${API_URL}/api/justificativas`, {
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
  const res = await fetch(`${API_URL}/api/penalidades`);
  if (!res.ok) throw new Error("Falha ao buscar penalidades.");
  return res.json();
}

export async function savePenalidade(
  dataPenalidade: string,
  md: string,
  motivo: string,
  pontos: number
): Promise<Penalidade> {
  const res = await fetch(`${API_URL}/api/penalidades`, {
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
  const res = await fetch(`${API_URL}/api/penalidades/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Falha ao deletar penalidade.");
  return res.json();
}

// Permanent Alerts
export async function fetchAlertasFixos(): Promise<AlertaFixo[]> {
  const res = await fetch(`${API_URL}/api/observacoes-fixas`);
  if (!res.ok) throw new Error("Falha ao buscar alertas permanentes.");
  return res.json();
}

export async function saveAlertaFixo(md: string, observacao: string): Promise<AlertaFixo> {
  const res = await fetch(`${API_URL}/api/observacoes-fixas`, {
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
  const res = await fetch(`${API_URL}/api/observacoes-fixas/${md}`, {
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
  const res = await fetch(`${API_URL}/api/mds/salvar-formulario`, {
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
  const res = await fetch(`${API_URL}/api/mds/score`);
  if (!res.ok) throw new Error("Falha ao buscar score de saúde de MDs.");
  return res.json();
}

// AI Report Generation
export async function generateIAReport(
  tipoRelatorio: string,
  filial: string,
  contexto: string,
  apiKey?: string | null
): Promise<{ resultado: string }> {
  const res = await fetch(`${API_URL}/api/ia/gerar`, {
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

  const res = await fetch(`${API_URL}/api/config/restore`, {
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
  const res = await fetch(`${API_URL}/api/config/clean`, {
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
  fileOperacional: File
): Promise<any> {
  const formData = new FormData();
  formData.append("data_operacao", dataOperacao);
  formData.append("num_semana", numSemana);
  formData.append("file_mds", fileMds);
  formData.append("file_operacional", fileOperacional);

  const res = await fetch(`${API_URL}/api/config/importar`, {
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
  const res = await fetch(`${API_URL}/api/ia/contexto-semanal?semana_base=${encodeURIComponent(semanaBase)}`);
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
  
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao carregar contexto operacional da IA.");
  return res.json();
}

export async function deleteJustification(id: number): Promise<any> {
  const res = await fetch(`${API_URL}/api/justificativas/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Falha ao deletar justificativa.");
  return res.json();
}

export async function fetchMalhaPontos(periodoTipo?: string, rotulo?: string): Promise<any[]> {
  const params = new URLSearchParams();
  if (periodoTipo) params.append("periodo_tipo", periodoTipo);
  if (rotulo) params.append("rotulo", rotulo);
  const res = await fetch(`${API_URL}/api/malha/pontos?${params.toString()}`);
  if (!res.ok) throw new Error("Falha ao carregar pontos geográficos da malha.");
  return res.json();
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
  
  const res = await fetch(`${API_URL}/api/malha/simular?${params.toString()}`);
  if (!res.ok) throw new Error("Falha ao rodar simulação de malha.");
  return res.json();
}

export async function saveMDAvaliacao(md: string, decisao: string, motivo: string = ""): Promise<any> {
  const res = await fetch(`${API_URL}/api/mds/avaliar`, {
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
  const res = await fetch(`${API_URL}/api/ia/otimizar`, {
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

export async function importarCoordenadasCSV(file: File): Promise<any> {
  const formData = new FormData();
  formData.append("file_coordenadas", file);
  
  const res = await fetch(`${API_URL}/api/config/importar-coordenadas`, {
    method: "POST",
    headers: getAuthHeaders(true),
    body: formData,
  });
  if (!res.ok) throw new Error("Falha ao importar planilha de coordenadas.");
  return res.json();
}

export async function fetchGeminiConfig(): Promise<{ configured: boolean; masked_key: string }> {
  const res = await fetch(`${API_URL}/api/config/gemini-key`, {
    headers: getAuthHeaders()
  });
  if (!res.ok) throw new Error("Falha ao carregar configuração da chave Gemini.");
  return res.json();
}

export async function saveGeminiKey(key: string): Promise<any> {
  const res = await fetch(`${API_URL}/api/config/gemini-key`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ key }),
  });
  if (!res.ok) throw new Error("Falha ao salvar chave do Gemini.");
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
  const res = await fetch(`${API_URL}/api/sla/resumo`);
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
  const res = await fetch(url);
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
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao carregar anomalias de roteirização.");
  return res.json();
}

export async function fetchSLAEstados(): Promise<string[]> {
  const res = await fetch(`${API_URL}/api/sla/options/estados`);
  if (!res.ok) throw new Error("Falha ao carregar estados de origem.");
  return res.json();
}

export async function fetchSLACidades(estado?: string): Promise<string[]> {
  let url = `${API_URL}/api/sla/options/cidades`;
  if (estado && estado !== "ALL") {
    url += `?estado=${encodeURIComponent(estado)}`;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao carregar cidades de origem.");
  return res.json();
}

export async function importarColetaXLSX(file: File): Promise<any> {
  const formData = new FormData();
  formData.append("file_coleta", file);
  
  const res = await fetch(`${API_URL}/api/sla/importar`, {
    method: "POST",
    body: formData
  });
  if (!res.ok) throw new Error("Falha ao importar planilha de coleta.");
  return res.json();
}








