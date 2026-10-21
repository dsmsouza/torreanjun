"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../../hooks/use-auth";
import IngestaoLogPanel from "../../components/IngestaoLogPanel";
import { 
  API_URL,
  getBackupUrl, 
  restoreDatabase, 
  cleanDatabase,
  importDatabase, 
  importarPlanilhaMapa,
  importarDropoff,
  importarPickup,
  importarCriacaoD1,
  importarCriacaoHoje,
  importarBacklog,
  fetchGeminiConfig,
  saveGeminiKey,
  zerarBaseOperacional,
  otimizarPlanilha,
  safeFetch,
  getAuthHeaders
} from "../../lib/api";
import { 
  ShieldAlert, 
  Download, 
  Upload, 
  Trash2, 
  Loader2, 
  AlertOctagon, 
  CheckCircle,
  Database,
  FileSpreadsheet,
  Calendar,
  Layers,
  ArrowRight,
  MapPin,
  Sparkles,
  Cloud,
  UploadCloud,
  TrendingUp,
  PackageCheck,
  Store,
  Plus,
  Pencil,
  X,
  ToggleLeft,
  ToggleRight,
  Search,
  Zap,
  Filter
} from "lucide-react";

export default function ConfigPage() {
  const { isMaster } = useAuth();

  // Backup / Restore / Purge States
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleanConfirm, setCleanConfirm] = useState(false);
  const [zerarConfirm, setZerarConfirm] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const handleZerarBaseSubmit = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await zerarBaseOperacional();
      setMessage({ text: res.message || "Base operacional zerada com sucesso! Pronto para nova alimentação do zero.", type: "success" });
      setZerarConfirm(false);
    } catch (err: any) {
      setMessage({ text: err.message || "Falha ao zerar base operacional.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Ingestion States (4 Tracks)
  const [dataOperacao, setDataOperacao] = useState<string>(new Date().toISOString().split("T")[0]);
  const [numSemana, setNumSemana] = useState<string>("32");

  const [fileDropoff, setFileDropoff] = useState<File | null>(null);
  const [importingDropoff, setImportingDropoff] = useState(false);
  const [msgDropoff, setMsgDropoff] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [jobDropoff, setJobDropoff] = useState<string | null>(null);

  const [filePickup, setFilePickup] = useState<File | null>(null);
  const [importingPickup, setImportingPickup] = useState(false);
  const [msgPickup, setMsgPickup] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [jobPickup, setJobPickup] = useState<string | null>(null);

  const [fileCriacaoD1, setFileCriacaoD1] = useState<File | null>(null);
  const [importingCriacaoD1, setImportingCriacaoD1] = useState(false);
  const [msgCriacaoD1, setMsgCriacaoD1] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [jobCriacaoD1, setJobCriacaoD1] = useState<string | null>(null);

  const [fileCriacaoHoje, setFileCriacaoHoje] = useState<File | null>(null);
  const [importingCriacaoHoje, setImportingCriacaoHoje] = useState(false);
  const [msgCriacaoHoje, setMsgCriacaoHoje] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [jobCriacaoHoje, setJobCriacaoHoje] = useState<string | null>(null);

  // Optimizer States (Planilhas 300MB+)
  const [filePesado, setFilePesado] = useState<File | null>(null);
  const [otimizando, setOtimizando] = useState(false);
  const [jobOtimizador, setJobOtimizador] = useState<string | null>(null);
  const [msgOtimizador, setMsgOtimizador] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [autoAtualizarSistema, setAutoAtualizarSistema] = useState<boolean>(true);

  const handleOtimizarSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filePesado) return;
    setOtimizando(true);
    setMsgOtimizador(null);
    try {
      const res = await otimizarPlanilha(filePesado, autoAtualizarSistema, dataOperacao, numSemana);
      setJobOtimizador(res.job_id);
      setMsgOtimizador({
        text: `Arquivo enviado (${res.tamanho_original_mb} MB). Processamento em streaming iniciado! Acompanhe a barra abaixo.`,
        type: "success"
      });
    } catch (err: any) {
      setMsgOtimizador({ text: err.message || "Falha ao enviar arquivo para otimização.", type: "error" });
    } finally {
      setOtimizando(false);
    }
  };

  const handleAplicarDataDetectada = (dt: string) => {
    setDataOperacao(dt);
    try {
      const d = new Date(dt + "T12:00:00");
      const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
      const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000;
      const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
      setNumSemana(String(weekNum));
    } catch {}
  };







  // Coordinates Import States
  const [fileCoordenadas, setFileCoordenadas] = useState<File | null>(null);
  const [coordImporting, setCoordImporting] = useState(false);
  const [coordMessage, setCoordMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Multi-Provider AI Copilot States
  const [aiProvider, setAiProvider] = useState<string>("gemini");
  const [geminiKey, setGeminiKey] = useState<string>("");
  const [openrouterKey, setOpenrouterKey] = useState<string>("");
  const [deepseekKey, setDeepseekKey] = useState<string>("");
  const [openrouterModel, setOpenrouterModel] = useState<string>("deepseek/deepseek-chat");
  const [aiConfig, setAiConfig] = useState<any>({
    provider: "gemini",
    configured: false,
    gemini_configured: false,
    gemini_masked_key: "",
    openrouter_configured: false,
    openrouter_masked_key: "",
    deepseek_configured: false,
    deepseek_masked_key: "",
    openrouter_model: "deepseek/deepseek-chat"
  });
  const [geminiLoading, setGeminiLoading] = useState<boolean>(false);
  const [geminiMessage, setGeminiMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Cliente Mapping States
  type ClienteMap = {
    id: number;
    cliente_id: string;
    nome_exibicao: string;
    ativo: number;
  };
  const [clienteMappings, setClienteMappings] = useState<ClienteMap[]>([]);
  const [clienteMapLoading, setClienteMapLoading] = useState(false);
  const [clienteMapMsg, setClienteMapMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [novoId, setNovoId] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");

  // Backlog Import States
  const [fileBacklog, setFileBacklog] = useState<File | null>(null);
  const [backlogImporting, setBacklogImporting] = useState(false);
  const [backlogMessage, setBacklogMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const loadAiConfig = async () => {
    try {
      const config = await fetchGeminiConfig();
      setAiConfig(config);
      setAiProvider(config.provider || "gemini");
      if (config.openrouter_model) setOpenrouterModel(config.openrouter_model);
    } catch (err) {
      console.error("Error loading AI configuration:", err);
    }
  };

  useEffect(() => {
    loadAiConfig();
  }, []);

  const carregarClienteMappings = async () => {
    setClienteMapLoading(true);
    try {
      const res = await safeFetch(`${API_URL}/api/config/clientes-mapping`, { headers: getAuthHeaders() });
      const data = await res.json();
      setClienteMappings(data);
    } catch { setClienteMapMsg({ text: "Erro ao carregar mapeamentos.", type: "error" }); }
    finally { setClienteMapLoading(false); }
  };

  useEffect(() => { carregarClienteMappings(); }, []);

  const carregarMdMappings = async () => {
    setMdMapLoading(true);
    try {
      const res = await safeFetch(`${API_URL}/api/config/md-mapping`, { headers: getAuthHeaders() });
      const data = await res.json();
      setMdMappings(data);
    } catch { setMdMapMsg({ text: "Erro ao carregar mapeamentos de MD.", type: "error" }); }
    finally { setMdMapLoading(false); }
  };

  useEffect(() => { carregarMdMappings(); }, []);

  const handleAdicionarCliente = async () => {
    if (!novoId.trim() || !novoNome.trim()) { setClienteMapMsg({ text: "Preencha o ID e o Nome.", type: "error" }); return; }
    try {
      const res = await fetch(`${API_URL}/api/config/clientes-mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_id: novoId.trim(), nome_exibicao: novoNome.trim(), ativo: 1 })
      });
      const data = await res.json();
      if (!res.ok) { setClienteMapMsg({ text: data.detail || "Erro ao criar.", type: "error" }); return; }
      setClienteMapMsg({ text: data.message, type: "success" });
      setNovoId(""); setNovoNome("");
      await carregarClienteMappings();
    } catch { setClienteMapMsg({ text: "Erro de conexão.", type: "error" }); }
  };

  const handleAtualizarCliente = async (id: number, nome: string, ativo: number) => {
    try {
      const res = await fetch(`${API_URL}/api/config/clientes-mapping/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome_exibicao: nome, ativo })
      });
      const data = await res.json();
      if (!res.ok) { setClienteMapMsg({ text: data.detail || "Erro ao atualizar.", type: "error" }); return; }
      setClienteMapMsg({ text: data.message, type: "success" });
      setEditingId(null);
      await carregarClienteMappings();
    } catch { setClienteMapMsg({ text: "Erro de conexão.", type: "error" }); }
  };

  const handleDeletarCliente = async (id: number, nome: string) => {
    if (!confirm(`Remover o mapeamento de "${nome}"? Os pedidos já gravados não serão afetados.`)) return;
    try {
      const res = await fetch(`${API_URL}/api/config/clientes-mapping/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setClienteMapMsg({ text: data.detail || "Erro ao remover.", type: "error" }); return; }
      setClienteMapMsg({ text: data.message, type: "success" });
      await carregarClienteMappings();
    } catch { setClienteMapMsg({ text: "Erro de conexão.", type: "error" }); }
  };

  // MD Mapping States
  type MDMap = { 
    id: number; 
    md_codigo: string; 
    estado: string; 
    regional: string; 
    cidade?: string;
    endereco?: string;
    latitude?: number | null; 
    longitude?: number | null; 
    tem_coordenadas?: boolean;
    ativo: number 
  };
  const [mdMappings, setMdMappings] = useState<MDMap[]>([]);
  const [mdMapLoading, setMdMapLoading] = useState(false);
  const [mdMapMsg, setMdMapMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [novoMdCodigo, setNovoMdCodigo] = useState("");
  const [novoMdTipo, setNovoMdTipo] = useState("MD (Ponto de Coleta)");
  const [novoMdCidade, setNovoMdCidade] = useState("");
  const [novoMdEstado, setNovoMdEstado] = useState("");
  const [novoMdRegional, setNovoMdRegional] = useState("");
  const [novoMdEndereco, setNovoMdEndereco] = useState("");
  const [novoMdLat, setNovoMdLat] = useState("");
  const [novoMdLng, setNovoMdLng] = useState("");
  const [editingMdId, setEditingMdId] = useState<number | null>(null);
  const [editMdEstado, setEditMdEstado] = useState("");
  const [editMdRegional, setEditMdRegional] = useState("");
  const [fileMdImport, setFileMdImport] = useState<File | null>(null);
  const [mdImporting, setMdImporting] = useState(false);
  const [mdSearchTerm, setMdSearchTerm] = useState("");
  const [geocoding, setGeocoding] = useState(false);

  const handleGeocodeMd = async () => {
    const busca = `${novoMdEndereco} ${novoMdCidade} ${novoMdEstado} Brasil`.trim();
    if (!busca || busca === "Brasil") {
      setMdMapMsg({ text: "Insira ao menos a cidade ou endereço para buscar geolocalização.", type: "error" });
      return;
    }
    setGeocoding(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(busca)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        setNovoMdLat(data[0].lat);
        setNovoMdLng(data[0].lon);
        setMdMapMsg({ text: `Coordenadas encontradas: Lat ${data[0].lat}, Lng ${data[0].lon}`, type: "success" });
      } else {
        setMdMapMsg({ text: "Não foi possível obter coordenadas automáticas para o endereço informado.", type: "error" });
      }
    } catch {
      setMdMapMsg({ text: "Falha ao buscar coordenadas online.", type: "error" });
    } finally {
      setGeocoding(false);
    }
  };

  const handleAdicionarMd = async () => {
    if (!novoMdCodigo.trim() || !novoMdEstado.trim() || !novoMdRegional.trim()) { setMdMapMsg({ text: "Preencha ao menos o Código, Estado e Regional do MD.", type: "error" }); return; }
    try {
      const payload: any = {
        md_codigo: novoMdCodigo.trim(),
        cidade: novoMdCidade.trim() || "Não Informada",
        estado: novoMdEstado.trim(),
        regional: novoMdRegional.trim(),
        endereco: novoMdEndereco.trim() || null,
        latitude: novoMdLat ? parseFloat(novoMdLat) : null,
        longitude: novoMdLng ? parseFloat(novoMdLng) : null,
        ativo: 1
      };
      const res = await fetch(`${API_URL}/api/config/md-mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) { setMdMapMsg({ text: data.detail || "Erro ao criar MD.", type: "error" }); return; }
      setMdMapMsg({ text: data.message, type: "success" });
      setNovoMdCodigo(""); setNovoMdCidade(""); setNovoMdEstado(""); setNovoMdRegional(""); setNovoMdEndereco(""); setNovoMdLat(""); setNovoMdLng("");
      await carregarMdMappings();
    } catch { setMdMapMsg({ text: "Erro de conexão.", type: "error" }); }
  };

  const handleAtualizarMd = async (id: number, estado: string, regional: string, cidade?: string, endereco?: string, lat?: number | null, lng?: number | null, ativo?: number) => {
    try {
      const res = await fetch(`${API_URL}/api/config/md-mapping/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          estado: estado.trim(), 
          regional: regional.trim(), 
          cidade: cidade?.trim(),
          endereco: endereco?.trim(),
          latitude: lat,
          longitude: lng,
          ativo: ativo ?? 1 
        })
      });
      const data = await res.json();
      if (!res.ok) { setMdMapMsg({ text: data.detail || "Erro ao atualizar MD.", type: "error" }); return; }
      setMdMapMsg({ text: data.message, type: "success" });
      setEditingMdId(null);
      await carregarMdMappings();
    } catch { setMdMapMsg({ text: "Erro de conexão.", type: "error" }); }
  };

  const handleDeletarMd = async (id: number, mdCodigo: string) => {
    if (!confirm(`Remover o mapeamento do MD "${mdCodigo}"? Os dados já ingeridos não serão alterados.`)) return;
    try {
      const res = await fetch(`${API_URL}/api/config/md-mapping/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setMdMapMsg({ text: data.detail || "Erro ao remover.", type: "error" }); return; }
      setMdMapMsg({ text: data.message, type: "success" });
      await carregarMdMappings();
    } catch { setMdMapMsg({ text: "Erro de conexão.", type: "error" }); }
  };

  const handleImportarMd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMdImporting(true);
    setMdMapMsg(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_URL}/api/config/md-mapping/importar`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erro ao importar planilha");
      setMdMapMsg({ text: data.message, type: "success" });
      await carregarMdMappings();
    } catch (err: any) {
      setMdMapMsg({ text: err.message, type: "error" });
    } finally {
      setMdImporting(false);
      if (e.target) e.target.value = ''; // Reset input
    }
  };

  if (!isMaster) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="max-w-md w-full glass-panel p-8 rounded-2xl border border-destructive/20 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-lg font-bold text-white">Acesso Negado</h2>
          <p className="text-sm text-muted-foreground">
            Você não possui credenciais suficientes para acessar as configurações e gerenciar backups. Por favor, contate o administrador Master da Torre.
          </p>
        </div>
      </div>
    );
  }

  // Handle Download Backup
  const handleDownload = () => {
    window.open(getBackupUrl(), "_blank");
  };

  // Handle Upload Database Restore
  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    if (!window.confirm("ATENÇÃO: Restaurar esta base irá substituir permanentemente todos os dados operacionais atuais. Deseja prosseguir?")) {
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await restoreDatabase(file);
      setMessage({ text: "Base de dados SQLite restaurada com sucesso!", type: "success" });
      setFile(null);
    } catch (err: any) {
      setMessage({ text: err.message || "Falha ao restaurar banco de dados.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Handle Clean Database
  const handleClean = async () => {
    setLoading(true);
    setMessage(null);
    setCleanConfirm(false);
    try {
      await cleanDatabase();
      setMessage({ text: "Todas as tabelas operacionais históricas foram limpas!", type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message || "Erro ao limpar banco de dados.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Handle Dropoff Ingestion
  const handleImportDropoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileDropoff) return;

    setImportingDropoff(true);
    setMsgDropoff(null);
    setJobDropoff(null);
    try {
      const res = await importarDropoff(fileDropoff, dataOperacao, numSemana);
      setMsgDropoff({ text: res.message || "Planilha de Dropoff enviada para processamento!", type: "success" });
      if (res.job_id) setJobDropoff(res.job_id);
      setFileDropoff(null);
    } catch (err: any) {
      setMsgDropoff({ text: err.message || "Falha ao importar Dropoff.", type: "error" });
    } finally {
      setImportingDropoff(false);
    }
  };

  // Handle Pickup Ingestion
  const handleImportPickup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!filePickup) return;

    setImportingPickup(true);
    setMsgPickup(null);
    setJobPickup(null);
    try {
      const res = await importarPickup(filePickup, dataOperacao, numSemana);
      setMsgPickup({ text: res.message || "Planilha de Pickup enviada para processamento!", type: "success" });
      if (res.job_id) setJobPickup(res.job_id);
      setFilePickup(null);
    } catch (err: any) {
      setMsgPickup({ text: err.message || "Falha ao importar Pickup.", type: "error" });
    } finally {
      setImportingPickup(false);
    }
  };

  // Handle Criacao Pedidos D-1 Ingestion
  const handleImportCriacaoD1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileCriacaoD1) return;

    setImportingCriacaoD1(true);
    setMsgCriacaoD1(null);
    setJobCriacaoD1(null);
    try {
      const res = await importarCriacaoD1(fileCriacaoD1, dataOperacao, numSemana);
      setMsgCriacaoD1({ text: res.message || "Planilha de Pedidos D-1 enviada para processamento!", type: "success" });
      if (res.job_id) setJobCriacaoD1(res.job_id);
      setFileCriacaoD1(null);
    } catch (err: any) {
      setMsgCriacaoD1({ text: err.message || "Falha ao importar Pedidos D-1.", type: "error" });
    } finally {
      setImportingCriacaoD1(false);
    }
  };

  // Handle Criacao Pedidos Hoje Ingestion
  const handleImportCriacaoHoje = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileCriacaoHoje) return;

    setImportingCriacaoHoje(true);
    setMsgCriacaoHoje(null);
    setJobCriacaoHoje(null);
    try {
      const res = await importarCriacaoHoje(fileCriacaoHoje, dataOperacao, numSemana);
      setMsgCriacaoHoje({ text: res.message || "Planilha de Pedidos Hoje enviada para processamento!", type: "success" });
      if (res.job_id) setJobCriacaoHoje(res.job_id);
      setFileCriacaoHoje(null);
    } catch (err: any) {
      setMsgCriacaoHoje({ text: err.message || "Falha ao importar Pedidos Hoje.", type: "error" });
    } finally {
      setImportingCriacaoHoje(false);
    }
  };



  // Handle Map Spreadsheet Ingestion
  const handleImportCoordenadas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileCoordenadas) return;

    setCoordImporting(true);
    setCoordMessage(null);
    try {
      const res = await importarPlanilhaMapa(fileCoordenadas);
      setCoordMessage({ 
        text: res.message || "Mapa atualizado na base de dados com sucesso!", 
        type: "success" 
      });
      setFileCoordenadas(null);
    } catch (err: any) {
      setCoordMessage({ text: err.message || "Falha ao processar planilha do Mapa.", type: "error" });
    } finally {
      setCoordImporting(false);
    }
  };

  // Handle Backlog Aging Ingestion (substitui a tabela backlog_aging)
  const handleImportBacklog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileBacklog) return;

    setBacklogImporting(true);
    setBacklogMessage(null);
    try {
      const res = await importarBacklog(fileBacklog);
      setBacklogMessage({ text: res.message || "Relatório de backlog importado com sucesso!", type: "success" });
      setFileBacklog(null);
    } catch (err: any) {
      setBacklogMessage({ text: err.message || "Falha ao importar relatório de backlog.", type: "error" });
    } finally {
      setBacklogImporting(false);
    }
  };
  
  // Handle Save AI Provider Settings
  const handleSaveAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeminiLoading(true);
    setGeminiMessage(null);
    try {
      const payload: any = {
        provider: aiProvider,
        openrouter_model: openrouterModel
      };
      if (geminiKey.trim()) payload.gemini_key = geminiKey.trim();
      if (openrouterKey.trim()) payload.openrouter_key = openrouterKey.trim();
      if (deepseekKey.trim()) payload.deepseek_key = deepseekKey.trim();

      await saveGeminiKey(payload);
      setGeminiMessage({ text: `Configurações do provedor de IA (${aiProvider.toUpperCase()}) salvas com sucesso!`, type: "success" });
      await loadAiConfig();
      setGeminiKey("");
      setOpenrouterKey("");
      setDeepseekKey("");
    } catch (err: any) {
      setGeminiMessage({ text: err.message || "Erro ao salvar configurações de IA.", type: "error" });
    } finally {
      setGeminiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex justify-between items-center bg-[#0C101B]/40 p-6 rounded-2xl border border-border">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight font-medium">Configurações & Backups</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Painel Master de administração da Torre: backups, limpezas e importações operacionais.
          </p>
        </div>
        <div className="px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-400">
          Perfil Master Habilitado
        </div>
      </div>

      {/* Global Status Message */}
      {message && (
        <div className={`p-4 rounded-xl text-sm font-semibold border flex items-center gap-2 ${
          message.type === "success" 
            ? "bg-success/10 text-success border-success/20" 
            : "bg-destructive/10 text-destructive border-destructive/20"
        }`}>
          {message.type === "success" ? <CheckCircle className="w-5 h-5 shrink-0" /> : <ShieldAlert className="w-5 h-5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Admin Panel Actions */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Card 1: Download Backup */}
        <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="text-md font-bold text-white">Exportar Backup (.db)</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Baixe uma cópia compacta em tempo real do banco de dados SQLite (`torre_anjun.db`) contendo todo o histórico acumulado.
            </p>
          </div>
          <button
            onClick={handleDownload}
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-primary hover:bg-blue-600 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Baixar Backup Completo</span>
          </button>
        </div>

        {/* Card 3: Purge Database */}
        <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-md font-bold text-white">Limpeza das Tabelas Históricas</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Exclua permanentemente os registros de todas as tabelas operacionais (Volumes, Backlogs, Justificativas, Ocorrências e Penalidades).
            </p>
          </div>
          
          {cleanConfirm ? (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl space-y-2">
              <p className="text-[10px] font-bold text-destructive flex items-center gap-1">
                <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                <span>CONFIRMAÇÃO EXTREMA E IRREVOGÁVEL</span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleClean}
                  disabled={loading}
                  className="flex-1 py-1.5 bg-destructive hover:bg-destructive-hover text-[10px] font-bold text-white rounded-lg transition-all cursor-pointer"
                >
                  Confirmar Exclusão
                </button>
                <button
                  onClick={() => setCleanConfirm(false)}
                  disabled={loading}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 rounded-lg transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCleanConfirm(true)}
              disabled={loading}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 rounded-xl text-xs font-semibold text-destructive transition-all disabled:opacity-50 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Limpar Tabelas Históricas</span>
            </button>
          )}
        </div>

        {/* Card 4: Começar do Zero (Reset para Retorno de Férias) */}
        <div className="glass-panel p-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <h3 className="text-md font-bold text-white">Começar do Zero</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Zera a base operacional acumulada mantendo o cadastro do **Mapa de MDs**. Ideal para reiniciar a alimentação diária a partir de hoje.
            </p>
          </div>
          
          {zerarConfirm ? (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-2">
              <p className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                <span>CONFIRMAÇÃO: ZERAR BASE OPERACIONAL</span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleZerarBaseSubmit}
                  disabled={loading}
                  className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-[10px] font-bold text-white rounded-lg transition-all cursor-pointer shadow-lg"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Confirmar e Zerar"}
                </button>
                <button
                  onClick={() => setZerarConfirm(false)}
                  disabled={loading}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 rounded-lg transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setZerarConfirm(true)}
              disabled={loading}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Zerar Base (Começar do Zero)</span>
            </button>
          )}
        </div>

      </div>

      {/* NOVO: CARGA OPERACIONAL AUTOMÁTICA VIA ARQUIVO .BAT */}
      <div className="glass-panel p-6 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/20 via-slate-900/40 to-blue-950/20 shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Zap className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Carga Operacional Direta via Script (.BAT)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Para maior velocidade e evitar travamento do navegador com arquivos de 300MB+, a ingestão agora é realizada pelo script automático.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 space-y-2">
          <p className="font-semibold text-emerald-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Como atualizar o sistema com os dados do dia anterior:</span>
          </p>
          <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300 ml-1">
            <li>Baixe o relatório diário do sistema operacional (ele será salvo na pasta <strong className="text-white">Downloads</strong>).</li>
            <li>Dê um duplo clique no atalho <strong className="text-indigo-300 font-mono">C:\ANJUN\subir_dia_anterior.bat</strong> (ou arraste a planilha para cima dele).</li>
            <li>O script detecta a data de operação, otimiza em streaming e injeta os pacotes, D2D SP e Minidrops instantaneamente no banco de dados.</li>
          </ol>
        </div>
      </div>


      {/* Card 6: Multi-Provider AI Copilot Config */}
      <div className="glass-panel p-6 rounded-2xl border border-border space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-400 border border-purple-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Copiloto IA & Provedores de Inteligência Artificial</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Escolha o provedor de IA da Torre: Google Gemini, OpenRouter (DeepSeek R1, Llama 3, Claude, GPT-4o) ou DeepSeek Direct.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-[#0C101B] px-3 py-1.5 rounded-xl border border-border">
            <span className="text-[11px] text-slate-400">Provedor Ativo:</span>
            <span className="text-xs font-bold text-purple-400 uppercase font-mono">{aiProvider}</span>
          </div>
        </div>

        {geminiMessage && (
          <div className={`p-4 rounded-xl text-sm font-semibold border flex items-center gap-2 ${
            geminiMessage.type === "success" 
              ? "bg-success/10 text-success border-success/20" 
              : "bg-destructive/10 text-destructive border-destructive/20"
          }`}>
            {geminiMessage.type === "success" ? <CheckCircle className="w-5 h-5 shrink-0" /> : <ShieldAlert className="w-5 h-5 shrink-0" />}
            <span>{geminiMessage.text}</span>
          </div>
        )}

        {/* Provedor Tabs */}
        <div className="flex flex-wrap gap-3 border-b border-border pb-4">
          <button
            type="button"
            onClick={() => setAiProvider("gemini")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              aiProvider === "gemini" 
                ? "bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-500/20" 
                : "bg-[#0C101B] text-slate-400 border-border hover:bg-slate-800"
            }`}
          >
            <span>🌟 Google Gemini</span>
            {aiConfig.gemini_configured && <span className="w-2 h-2 rounded-full bg-emerald-400"></span>}
          </button>
          
          <button
            type="button"
            onClick={() => setAiProvider("openrouter")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              aiProvider === "openrouter" 
                ? "bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-500/20" 
                : "bg-[#0C101B] text-slate-400 border-border hover:bg-slate-800"
            }`}
          >
            <span>🚀 OpenRouter (Multimodelo / DeepSeek R1)</span>
            {aiConfig.openrouter_configured && <span className="w-2 h-2 rounded-full bg-emerald-400"></span>}
          </button>

          <button
            type="button"
            onClick={() => setAiProvider("deepseek")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              aiProvider === "deepseek" 
                ? "bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-500/20" 
                : "bg-[#0C101B] text-slate-400 border-border hover:bg-slate-800"
            }`}
          >
            <span>🐳 DeepSeek Direct</span>
            {aiConfig.deepseek_configured && <span className="w-2 h-2 rounded-full bg-emerald-400"></span>}
          </button>
        </div>

        <form onSubmit={handleSaveAiConfig} className="space-y-4">
          {aiProvider === "gemini" && (
            <div className="space-y-3 bg-[#0C101B] p-4 rounded-xl border border-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white">Chave de API do Google Gemini (AIzaSy...):</label>
                <span className="text-[11px] text-slate-400 font-mono">
                  {aiConfig.gemini_configured ? `Configurada (${aiConfig.gemini_masked_key})` : "Não configurada"}
                </span>
              </div>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder={aiConfig.gemini_configured ? "Deixe em branco para manter a chave atual..." : "Cole sua chave do Gemini aqui..."}
                className="w-full px-4 py-2.5 bg-[#131825] border border-border rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500/50 font-mono"
              />
              <p className="text-[11px] text-slate-500">Usa o modelo <code className="text-purple-400">gemini-2.5-flash</code> para respostas nativas da Google.</p>
            </div>
          )}

          {aiProvider === "openrouter" && (
            <div className="space-y-4 bg-[#0C101B] p-4 rounded-xl border border-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white">Chave de API do OpenRouter (sk-or-v1-...):</label>
                <span className="text-[11px] text-slate-400 font-mono">
                  {aiConfig.openrouter_configured ? `Configurada (${aiConfig.openrouter_masked_key})` : "Não configurada"}
                </span>
              </div>
              <input
                type="password"
                value={openrouterKey}
                onChange={(e) => setOpenrouterKey(e.target.value)}
                placeholder={aiConfig.openrouter_configured ? "Deixe em branco para manter a chave atual..." : "Cole sua chave do OpenRouter..."}
                className="w-full px-4 py-2.5 bg-[#131825] border border-border rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500/50 font-mono"
              />
              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">Modelo do OpenRouter:</label>
                <input
                  type="text"
                  value={openrouterModel}
                  onChange={(e) => setOpenrouterModel(e.target.value)}
                  placeholder="ex: deepseek/deepseek-chat, meta-llama/llama-3.3-70b-instruct, openai/gpt-4o-mini"
                  className="w-full px-4 py-2.5 bg-[#131825] border border-border rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500/50 font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-500">O OpenRouter distribui a carga entre dezenas de provedores e permite rodar DeepSeek, Llama 3, Claude e OpenAI na mesma chave sem limites rígidos.</p>
            </div>
          )}

          {aiProvider === "deepseek" && (
            <div className="space-y-3 bg-[#0C101B] p-4 rounded-xl border border-border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-white">Chave de API do DeepSeek Direct (sk-...):</label>
                <span className="text-[11px] text-slate-400 font-mono">
                  {aiConfig.deepseek_configured ? `Configurada (${aiConfig.deepseek_masked_key})` : "Não configurada"}
                </span>
              </div>
              <input
                type="password"
                value={deepseekKey}
                onChange={(e) => setDeepseekKey(e.target.value)}
                placeholder={aiConfig.deepseek_configured ? "Deixe em branco para manter a chave atual..." : "Cole sua chave da DeepSeek..."}
                className="w-full px-4 py-2.5 bg-[#131825] border border-border rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500/50 font-mono"
              />
              <p className="text-[11px] text-slate-500">Conecta diretamente à API da DeepSeek (<code className="text-purple-400">deepseek-chat / V3 / R1</code>) com alta velocidade e custo reduzido.</p>
            </div>
          )}

          <button
            type="submit"
            disabled={geminiLoading}
            className="flex items-center justify-center gap-2 w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-purple-600/20"
          >
            {geminiLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Salvando Configurações...</span>
              </>
            ) : (
              <>
                <span>Salvar e Ativar Provedor ({aiProvider.toUpperCase()})</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>

      {/* ─── Mapeamento de Clientes ─────────────────────────────── */}
      <div className="glass-panel rounded-2xl border border-border p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
              <Store className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Mapeamento de Clientes (Marketplaces)</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Vincule os IDs numéricos ao nome do parceiro. Usado na classificação automática dos relatórios.</p>
            </div>
          </div>
        </div>

        {clienteMapMsg && (
          <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
            clienteMapMsg.type === "success" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}>
            {clienteMapMsg.type === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertOctagon className="w-4 h-4 shrink-0" />}
            <span>{clienteMapMsg.text}</span>
            <button onClick={() => setClienteMapMsg(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Formulário para adicionar novo */}
        <div className="bg-[#0C101B] border border-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Adicionar Novo Parceiro</p>
          <div className="flex gap-3">
            <div className="flex-none w-36">
              <label className="block text-[10px] text-slate-500 mb-1">Nº do Cliente (ID)</label>
              <input
                type="text" value={novoId} onChange={e => setNovoId(e.target.value)}
                placeholder="ex: 24005"
                className="w-full px-3 py-2 bg-[#131825] border border-border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50 font-mono"
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-slate-500 mb-1">Nome de Exibição</label>
              <input
                type="text" value={novoNome} onChange={e => setNovoNome(e.target.value)}
                placeholder="ex: Shein"
                className="w-full px-3 py-2 bg-[#131825] border border-border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleAdicionarCliente}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" /> Adicionar
              </button>
            </div>
          </div>
        </div>

        {/* Tabela de mapeamentos existentes */}
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900/60 border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-36">Nº Cliente (ID)</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nome de Exibição</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-28">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clienteMapLoading ? (
                <tr><td colSpan={4} className="text-center py-6 text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
              ) : clienteMappings.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-6 text-slate-500 text-xs">Nenhum mapeamento encontrado.</td></tr>
              ) : clienteMappings.map(m => (
                <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-slate-300 text-xs">{m.cliente_id}</td>
                  <td className="px-4 py-3">
                    {editingId === m.id ? (
                      <input
                        type="text" value={editNome} onChange={e => setEditNome(e.target.value)}
                        className="w-full px-2 py-1 bg-[#0C101B] border border-blue-500/40 rounded text-sm text-white focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <span className="text-white font-medium">{m.nome_exibicao}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleAtualizarCliente(m.id, editingId === m.id ? editNome : m.nome_exibicao, m.ativo === 1 ? 0 : 1)}
                      title={m.ativo ? "Clique para desativar" : "Clique para ativar"}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                        m.ativo ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-slate-700/50 text-slate-500 hover:bg-slate-700"
                      }`}
                    >
                      {m.ativo ? <><ToggleRight className="w-3.5 h-3.5" /> Ativo</> : <><ToggleLeft className="w-3.5 h-3.5" /> Inativo</>}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {editingId === m.id ? (
                        <>
                          <button onClick={() => handleAtualizarCliente(m.id, editNome, m.ativo)} className="p-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg transition-colors" title="Salvar">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors" title="Cancelar">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditingId(m.id); setEditNome(m.nome_exibicao); }} className="p-1.5 bg-blue-600/10 hover:bg-blue-600/30 text-blue-400 rounded-lg transition-colors" title="Editar nome">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeletarCliente(m.id, m.nome_exibicao)} className="p-1.5 bg-red-500/10 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors" title="Remover">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-slate-500">
          💡 <strong className="text-slate-400">Dica:</strong> IDs marcados como <span className="text-slate-400">Inativo</span> continuarão sendo lidos, mas classificados como <span className="text-slate-400">"Outros"</span>. Remover apaga permanentemente.
          Após qualquer alteração, reprocesse a planilha de Criação para aplicar a nova classificação.
        </p>
      </div>

      {/* ─── Mapeamento de MDs ─────────────────────────────── */}
      <div className="glass-panel rounded-2xl border border-border p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
              <MapPin className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Dicionário de MDs (Pontos de Coleta)</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Vincule os Códigos de Ponto (ex: PONTO 1) ao Estado e Regional correspondente.</p>
            </div>
          </div>
        </div>

        {mdMapMsg && (
          <div className={`flex items-center gap-2 p-3 rounded-xl text-sm ${
            mdMapMsg.type === "success" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
          }`}>
            {mdMapMsg.type === "success" ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertOctagon className="w-4 h-4 shrink-0" />}
            <span>{mdMapMsg.text}</span>
            <button onClick={() => setMdMapMsg(null)} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        <div className="bg-[#0C101B] border border-border rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Adicionar / Cadastrar Novo MD no Mapa</p>
            <button
              type="button"
              onClick={handleGeocodeMd}
              disabled={geocoding}
              className="flex items-center gap-1.5 px-3 py-1 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              {geocoding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Auto-Obter Lat/Lng via Endereço</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Ponto / MD *</label>
              <input
                type="text" value={novoMdCodigo} onChange={e => setNovoMdCodigo(e.target.value)}
                placeholder="ex: SP-W-MD099"
                className="w-full px-3 py-2 bg-[#131825] border border-border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Cidade</label>
              <input
                type="text" value={novoMdCidade} onChange={e => setNovoMdCidade(e.target.value)}
                placeholder="ex: Guarulhos"
                className="w-full px-3 py-2 bg-[#131825] border border-border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Estado (UF) *</label>
              <input
                type="text" value={novoMdEstado} onChange={e => setNovoMdEstado(e.target.value)}
                placeholder="ex: SP"
                className="w-full px-3 py-2 bg-[#131825] border border-border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 uppercase"
                maxLength={2}
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Regional *</label>
              <input
                type="text" value={novoMdRegional} onChange={e => setNovoMdRegional(e.target.value)}
                placeholder="ex: SP METROPOLITANA"
                className="w-full px-3 py-2 bg-[#131825] border border-border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="block text-[10px] text-slate-500 mb-1">Endereço Completo</label>
              <input
                type="text" value={novoMdEndereco} onChange={e => setNovoMdEndereco(e.target.value)}
                placeholder="ex: Av. Monteiro Lobato, 1234, Centro"
                className="w-full px-3 py-2 bg-[#131825] border border-border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Latitude (Lat)</label>
              <input
                type="text" value={novoMdLat} onChange={e => setNovoMdLat(e.target.value)}
                placeholder="ex: -23.454"
                className="w-full px-3 py-2 bg-[#131825] border border-border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-500 mb-1">Longitude (Lng)</label>
              <input
                type="text" value={novoMdLng} onChange={e => setNovoMdLng(e.target.value)}
                placeholder="ex: -46.533"
                className="w-full px-3 py-2 bg-[#131825] border border-border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border/50">
            <label className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer border ${mdImporting ? 'bg-slate-800 text-slate-500 border-border cursor-not-allowed' : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-border'}`}>
              {mdImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
              Importar Planilha (.xlsx)
              
            </label>

            <button
              onClick={handleAdicionarMd}
              className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-colors shadow-md shadow-blue-600/20"
            >
              <Plus className="w-4 h-4" /> Adicionar e Plotar no Mapa
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <Search className="w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar por MD, Cidade ou Regional..."
            value={mdSearchTerm}
            onChange={e => setMdSearchTerm(e.target.value)}
            className="w-full md:w-64 px-3 py-2 bg-[#0C101B] border border-border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500/50"
          />
        </div>
        <div className="overflow-hidden rounded-xl border border-border max-h-96 overflow-y-auto custom-scrollbar">
          <table className="w-full text-sm relative">
            <thead className="sticky top-0 bg-slate-900/90 backdrop-blur-sm z-10 shadow-sm">
              <tr className="bg-slate-900/60 border-b border-border">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-36">MD / Ponto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Cidade / Estado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Regional</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-32">Coordenadas</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-28">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mdMapLoading ? (
                <tr><td colSpan={6} className="text-center py-6 text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
              ) : mdMappings.filter(m => m.md_codigo.toLowerCase().includes(mdSearchTerm.toLowerCase()) || m.regional.toLowerCase().includes(mdSearchTerm.toLowerCase()) || (m.cidade || '').toLowerCase().includes(mdSearchTerm.toLowerCase())).length === 0 ? (
                <tr><td colSpan={6} className="text-center py-6 text-slate-500 text-xs">Nenhum MD encontrado.</td></tr>
              ) : mdMappings.filter(m => m.md_codigo.toLowerCase().includes(mdSearchTerm.toLowerCase()) || m.regional.toLowerCase().includes(mdSearchTerm.toLowerCase()) || (m.cidade || '').toLowerCase().includes(mdSearchTerm.toLowerCase())).map(m => (
                <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-slate-300 text-xs font-semibold">{m.md_codigo}</td>
                  <td className="px-4 py-3">
                    {editingMdId === m.id ? (
                      <div className="flex gap-1">
                        <input
                          type="text" value={editMdEstado} onChange={e => setEditMdEstado(e.target.value)}
                          className="w-12 px-2 py-1 bg-[#0C101B] border border-blue-500/40 rounded text-xs text-white focus:outline-none uppercase"
                          maxLength={2}
                        />
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">{m.cidade || 'Não Informada'} ({m.estado})</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingMdId === m.id ? (
                      <input
                        type="text" value={editMdRegional} onChange={e => setEditMdRegional(e.target.value)}
                        className="w-full px-2 py-1 bg-[#0C101B] border border-blue-500/40 rounded text-xs text-white focus:outline-none uppercase"
                      />
                    ) : (
                      <span className="text-white font-medium text-xs">{m.regional}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {m.tem_coordenadas ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title={`Lat: ${m.latitude}, Lng: ${m.longitude}`}>
                        📍 Map OK
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        ⚠️ Sem Coords
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleAtualizarMd(m.id, editingMdId === m.id ? editMdEstado : m.estado, editingMdId === m.id ? editMdRegional : m.regional, m.cidade, m.endereco, m.latitude, m.longitude, m.ativo === 1 ? 0 : 1)}
                      title={m.ativo ? "Clique para desativar" : "Clique para ativar"}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                        m.ativo ? "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30" : "bg-slate-700/50 text-slate-500 hover:bg-slate-700"
                      }`}
                    >
                      {m.ativo ? <><ToggleRight className="w-3.5 h-3.5" /> Ativo</> : <><ToggleLeft className="w-3.5 h-3.5" /> Inativo</>}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {editingMdId === m.id ? (
                        <>
                          <button onClick={() => handleAtualizarMd(m.id, editMdEstado, editMdRegional, m.cidade, m.endereco, m.latitude, m.longitude, m.ativo)} className="p-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg transition-colors" title="Salvar">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingMdId(null)} className="p-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors" title="Cancelar">
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditingMdId(m.id); setEditMdEstado(m.estado); setEditMdRegional(m.regional); }} className="p-1.5 bg-blue-600/10 hover:bg-blue-600/30 text-blue-400 rounded-lg transition-colors" title="Editar">
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeletarMd(m.id, m.md_codigo)} className="p-1.5 bg-red-500/10 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors" title="Remover">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-500">
          💡 <strong className="text-slate-400">Regra de Negócio:</strong> MDs não mapeados ou marcados como inativos serão classificados na Regional <span className="text-slate-400">"OUTROS"</span> durante a ingestão do Radar Dropoff.
        </p>
      </div>

    </div>
  );
}
