"use client";

import React, { useEffect, useState, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import { 
  Rocket, 
  Search, 
  RefreshCw, 
  Plus, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Calendar, 
  UserCheck, 
  FileText, 
  MapPin, 
  Building2, 
  Truck, 
  Package, 
  Copy, 
  Check, 
  ChevronRight, 
  Eye, 
  ArrowRight,
  Sparkles,
  ClipboardList,
  Layers,
  List,
  ShieldCheck,
  Zap,
  HelpCircle,
  BrainCircuit,
  UserCog,
  TrendingUp,
  Activity,
  Store,
  ShoppingBag,
  Users,
  ChevronDown,
  ChevronUp,
  BarChart3,
  ArrowUpRight,
  Navigation,
  Map as MapIcon,
  Compass
} from "lucide-react";
import dynamic from "next/dynamic";

const CockpitMap = dynamic(() => import("@/components/CockpitMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[620px] rounded-2xl border border-slate-800 bg-[#090D16] flex flex-col items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-3" />
      <span className="text-xs text-slate-400 font-medium">Carregando mapa interativo da malha...</span>
    </div>
  ),
});

import { 
  fetchSolicitacoesImplantacao, 
  fetchImplantacaoStats, 
  createSolicitacaoImplantacao,
  updateViabilidadeImplantacao,
  updateVisitaImplantacao,
  updateRecursosGoLiveImplantacao,
  comunicarComercialImplantacao,
  updateParecerGestorImplantacao,
  fetchDiagnosticoD1Implantacao,
  updateStatusImplantacao,
  fetchRelatorioQuartaImplantacao,
  fetchCockpitD1,
  CockpitD1Data,
  SolicitacaoImplantacaoItem
} from "@/lib/api";
import ViabilidadeModal from "@/components/ViabilidadeModal";

const STAGES = [
  { id: "Em análise", title: "1. Em Análise", color: "border-blue-500/40 bg-blue-500/5 text-blue-400", badge: "bg-blue-500/20 text-blue-300" },
  { id: "Visita técnica", title: "2. Visita Técnica", color: "border-purple-500/40 bg-purple-500/5 text-purple-400", badge: "bg-purple-500/20 text-purple-300" },
  { id: "Em preparação", title: "3. Em Preparação", color: "border-amber-500/40 bg-amber-500/5 text-amber-400", badge: "bg-amber-500/20 text-amber-300" },
  { id: "Go-Live definido", title: "4. Go-Live Definido", color: "border-emerald-500/40 bg-emerald-500/5 text-emerald-400", badge: "bg-emerald-500/20 text-emerald-300" },
  { id: "Concluído", title: "5. Concluído", color: "border-teal-500/40 bg-teal-500/5 text-teal-400", badge: "bg-teal-500/20 text-teal-300" },
  { id: "Restrição/Pendente", title: "6. Restrição/Pendente", color: "border-rose-500/40 bg-rose-500/5 text-rose-400", badge: "bg-rose-500/20 text-rose-300" },
];

export default function ImplantacaoFMPage() {
  const [loading, setLoading] = useState(true);
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoImplantacaoItem[]>([]);
  const [stats, setStats] = useState<any>({
    total: 0,
    em_analise: 0,
    visita_tecnica: 0,
    em_preparacao: 0,
    golive_definido: 0,
    concluidos: 0,
    restricao_pendente: 0,
    focal_projetos: "@Diego de Souza Mandarino",
    focal_operacao: "@Thatiane Silva Santos"
  });

  // Views & Filters
  const [viewMode, setViewMode] = useState<"kanban" | "tabela" | "relatorio" | "guia">("kanban");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("TODOS");

  // Modals
  const [isNovoModalOpen, setIsNovoModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SolicitacaoImplantacaoItem | null>(null);
  const [activeTabModal, setActiveTabModal] = useState<"diagnostico" | "solicitacao" | "viabilidade" | "visita" | "recursos" | "comercial" | "gestor" | "historico">("diagnostico");
  
  // Diagnostico D1
  const [diagnosticoD1, setDiagnosticoD1] = useState<any>(null);
  const [loadingDiag, setLoadingDiag] = useState(false);

  // Relatório de Quarta
  const [relatorioQuarta, setRelatorioQuarta] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Forms
  const [formNovo, setFormNovo] = useState({
    cliente_nome: "",
    vendedor_comercial: "",
    focal_projetos: "@Diego de Souza Mandarino",
    focal_operacao: "@Thatiane Silva Santos",
    segmento: "E-Commerce",
    endereco_coleta: "",
    cidade: "São Paulo",
    estado: "SP",
    cep: "",
    volume_estimado_diario: 500,
    horario_coleta_janela: "14:00 - 18:00",
    observacoes_comercial: ""
  });

  const [formViabilidade, setFormViabilidade] = useState({
    condicao_viabilidade: "① Início imediato",
    capacidade_operacional_ok: 1,
    disponibilidade_frota_ok: 1,
    atendimento_regiao_ok: 1,
    necessidade_contratacao_equipe: 0,
    necessidade_novas_rotas: 0,
    estrutura_equipamentos_ok: 1,
    parecer_operacional: ""
  });

  const [formVisita, setFormVisita] = useState({
    status_visita: "Agendada",
    data_visita_tecnica: new Date().toISOString().split("T")[0],
    relatorio_visita: ""
  });

  const [formRecursos, setFormRecursos] = useState({
    pda_qtd: 1,
    mesa_posto_operacional: "",
    equipamentos_desc: "",
    equipe_contratacao_desc: "",
    rotas_frota_desc: "",
    insumos_desc: "",
    outros_recursos: "",
    data_go_live_prevista: "",
    go_live_validado_operacao: 1
  });

  const [formComercial, setFormComercial] = useState({
    comunicado_comercial_em: new Date().toISOString().split("T")[0],
    comercial_ciente: 1
  });

  const [formGestor, setFormGestor] = useState({
    gestor_nome: "Gestor FM / Projetos",
    parecer_gestor_decisao: "Aprovado com Ressalvas",
    parecer_gestor_texto: "",
    parecer_gestor_ressalvas: "",
    parecer_gestor_data: new Date().toISOString().split("T")[0]
  });

  // Cockpit D-1 State
  const [cockpitData, setCockpitData] = useState<CockpitD1Data | null>(null);
  const [loadingCockpit, setLoadingCockpit] = useState(false);
  const [selectedDiaD1, setSelectedDiaD1] = useState<string>("");
  const [activeCockpitTab, setActiveCockpitTab] = useState<"clientes" | "modalidades" | "mds" | "sellers" | "status" | "mapa">("clientes");
  const [tipoPontoFiltro, setTipoPontoFiltro] = useState<"TODOS" | "MD" | "HUB">("TODOS");
  const [isCockpitExpanded, setIsCockpitExpanded] = useState(true);
  const [cockpitSearch, setCockpitSearch] = useState("");
  const [isViabilidadeModalOpen, setIsViabilidadeModalOpen] = useState(false);

  const loadCockpit = async (dia?: string) => {
    setLoadingCockpit(true);
    try {
      const data = await fetchCockpitD1(dia);
      setCockpitData(data);
      if (data.dia_selecionado && (!dia || dia === "")) {
        setSelectedDiaD1(data.dia_selecionado);
      }
    } catch (err) {
      console.error("Erro ao carregar Cockpit D-1:", err);
    } finally {
      setLoadingCockpit(false);
    }
  };

  const handleDiaD1Change = (novoDia: string) => {
    setSelectedDiaD1(novoDia);
    loadCockpit(novoDia);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [sData, stData] = await Promise.all([
        fetchSolicitacoesImplantacao(),
        fetchImplantacaoStats()
      ]);
      setSolicitacoes(sData);
      setStats(stData);
    } catch (err) {
      console.error("Erro ao carregar solicitações:", err);
    } finally {
      setLoading(false);
    }
  };

  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>("");
  const [showUpdatedNotification, setShowUpdatedNotification] = useState(false);

  useEffect(() => {
    loadData();
    loadCockpit();
    setLastUpdatedTime(new Date().toLocaleTimeString());

    const handleDatabaseUpdate = () => {
      loadData();
      loadCockpit(selectedDiaD1);
      setLastUpdatedTime(new Date().toLocaleTimeString());
      setShowUpdatedNotification(true);
      setTimeout(() => setShowUpdatedNotification(false), 5000);
      
      // Re-fetch diagnostic if modal is open
      if (selectedItem) {
        fetchDiagnosticoD1Implantacao(selectedItem.id).then(setDiagnosticoD1).catch(console.error);
      }
    };

    window.addEventListener("database_updated", handleDatabaseUpdate);
    window.addEventListener("focus", handleDatabaseUpdate);

    return () => {
      window.removeEventListener("database_updated", handleDatabaseUpdate);
      window.removeEventListener("focus", handleDatabaseUpdate);
    };
  }, [selectedItem, selectedDiaD1]);

  const handleOpenDetailModal = async (item: SolicitacaoImplantacaoItem) => {
    setSelectedItem(item);
    setActiveTabModal("diagnostico");
    
    // Set forms with item data
    setFormViabilidade({
      condicao_viabilidade: item.condicao_viabilidade || "① Início imediato",
      capacidade_operacional_ok: item.capacidade_operacional_ok ?? 1,
      disponibilidade_frota_ok: item.disponibilidade_frota_ok ?? 1,
      atendimento_regiao_ok: item.atendimento_regiao_ok ?? 1,
      necessidade_contratacao_equipe: item.necessidade_contratacao_equipe ?? 0,
      necessidade_novas_rotas: item.necessidade_novas_rotas ?? 0,
      estrutura_equipamentos_ok: item.estrutura_equipamentos_ok ?? 1,
      parecer_operacional: item.parecer_operacional || ""
    });

    setFormVisita({
      status_visita: item.status_visita || "Pendente",
      data_visita_tecnica: item.data_visita_tecnica || "",
      relatorio_visita: item.relatorio_visita || ""
    });

    setFormRecursos({
      pda_qtd: item.pda_qtd ?? 0,
      mesa_posto_operacional: item.mesa_posto_operacional || "",
      equipamentos_desc: item.equipamentos_desc || "",
      equipe_contratacao_desc: item.equipe_contratacao_desc || "",
      rotas_frota_desc: item.rotas_frota_desc || "",
      insumos_desc: item.insumos_desc || "",
      outros_recursos: item.outros_recursos || "",
      data_go_live_prevista: item.data_go_live_prevista || "",
      go_live_validado_operacao: item.go_live_validado_operacao ?? 0
    });

    setFormComercial({
      comunicado_comercial_em: item.comunicado_comercial_em || new Date().toISOString().split("T")[0],
      comercial_ciente: item.comercial_ciente ?? 1
    });

    setFormGestor({
      gestor_nome: item.gestor_nome || "Gestor FM / Projetos",
      parecer_gestor_decisao: item.parecer_gestor_decisao || "Aprovado com Ressalvas",
      parecer_gestor_texto: item.parecer_gestor_texto || "",
      parecer_gestor_ressalvas: item.parecer_gestor_ressalvas || "",
      parecer_gestor_data: item.parecer_gestor_data || new Date().toISOString().split("T")[0]
    });

    // Load D-1 Diagnosis
    setLoadingDiag(true);
    try {
      const diagData = await fetchDiagnosticoD1Implantacao(item.id);
      setDiagnosticoD1(diagData);
    } catch (err) {
      console.error("Erro ao carregar diagnóstico D1:", err);
    } finally {
      setLoadingDiag(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createSolicitacaoImplantacao(formNovo);
      setIsNovoModalOpen(false);
      setFormNovo({
        cliente_nome: "",
        vendedor_comercial: "",
        focal_projetos: "@Diego de Souza Mandarino",
        focal_operacao: "@Thatiane Silva Santos",
        segmento: "E-Commerce",
        endereco_coleta: "",
        cidade: "São Paulo",
        estado: "SP",
        cep: "",
        volume_estimado_diario: 500,
        horario_coleta_janela: "14:00 - 18:00",
        observacoes_comercial: ""
      });
      await loadData();
    } catch (err: any) {
      alert("Erro ao cadastrar solicitação: " + err.message);
    }
  };

  const handleSaveViabilidade = async () => {
    if (!selectedItem) return;
    try {
      const updated = await updateViabilidadeImplantacao(selectedItem.id, formViabilidade);
      setSelectedItem(updated);
      await loadData();
      alert("Análise de viabilidade salva com sucesso!");
    } catch (err: any) {
      alert("Erro ao salvar viabilidade: " + err.message);
    }
  };

  const handleSaveVisita = async () => {
    if (!selectedItem) return;
    try {
      const updated = await updateVisitaImplantacao(selectedItem.id, formVisita);
      setSelectedItem(updated);
      await loadData();
      alert("Visita técnica atualizada!");
    } catch (err: any) {
      alert("Erro ao salvar visita: " + err.message);
    }
  };

  const handleSaveRecursos = async () => {
    if (!selectedItem) return;
    try {
      const updated = await updateRecursosGoLiveImplantacao(selectedItem.id, formRecursos);
      setSelectedItem(updated);
      await loadData();
      alert("Recursos e Go-Live atualizados!");
    } catch (err: any) {
      alert("Erro ao salvar recursos: " + err.message);
    }
  };

  const handleSaveComercial = async () => {
    if (!selectedItem) return;
    try {
      const updated = await comunicarComercialImplantacao(selectedItem.id, formComercial);
      setSelectedItem(updated);
      await loadData();
      alert("Comunicação comercial salva!");
    } catch (err: any) {
      alert("Erro ao salvar comunicação: " + err.message);
    }
  };

  const handleSaveGestor = async () => {
    if (!selectedItem) return;
    try {
      const updated = await updateParecerGestorImplantacao(selectedItem.id, formGestor);
      setSelectedItem(updated);
      await loadData();
      alert("Parecer e Opinião do Gestor salvos com sucesso!");
    } catch (err: any) {
      alert("Erro ao salvar parecer do gestor: " + err.message);
    }
  };

  const loadRelatorioQuarta = async () => {
    try {
      const data = await fetchRelatorioQuartaImplantacao();
      setRelatorioQuarta(data);
    } catch (err) {
      console.error("Erro ao carregar relatório:", err);
    }
  };

  useEffect(() => {
    if (viewMode === "relatorio") {
      loadRelatorioQuarta();
    }
  }, [viewMode]);

  const copyRelatorioText = () => {
    if (!relatorioQuarta?.texto_formatado) return;
    navigator.clipboard.writeText(relatorioQuarta.texto_formatado);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Filtered List
  const listFiltered = useMemo(() => {
    return solicitacoes.filter(item => {
      const matchSearch = searchTerm === "" || 
        item.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.cidade.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.vendedor_comercial.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchStatus = selectedStatusFilter === "TODOS" || item.status === selectedStatusFilter;

      return matchSearch && matchStatus;
    });
  }, [solicitacoes, searchTerm, selectedStatusFilter]);

  return (
    <div className="flex h-screen bg-[#090D16] text-slate-100 font-sans overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto pl-16 md:pl-64 flex flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-[#0C101B]/90 backdrop-blur-md border-b border-slate-800/80 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Operação FM & Projetos
              </span>
              <span className="text-xs text-slate-400">• ANJUN Express</span>
              {lastUpdatedTime && (
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                  Sincronizado: {lastUpdatedTime}
                </span>
              )}
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-2 mt-1">
              <Rocket className="w-6 h-6 text-emerald-400" />
              Fluxo de Implantação de Novas Solicitações
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Alinhamento entre Comercial, Projetos, Operação FM e Opinião do Gestor da Área.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Focal Points Badges */}
            <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs">
              <div className="flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-slate-400">Projetos:</span>
                <span className="font-medium text-slate-200">@Diego Mandarino</span>
              </div>
              <span className="text-slate-700">|</span>
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-slate-400">Operação:</span>
                <span className="font-medium text-slate-200">@Thatiane Santos</span>
              </div>
            </div>

            <button
              onClick={() => setIsNovoModalOpen(true)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-all shadow-lg shadow-emerald-900/30"
            >
              <Plus className="w-4 h-4" />
              Nova Solicitação
            </button>
          </div>
        </header>

        {/* Content Container */}
        <div className="p-6 space-y-6 max-w-[1700px] mx-auto w-full">
          
          {showUpdatedNotification && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-between animate-in fade-in slide-in-from-top duration-300">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Base de dados D-1 atualizada! As estatísticas e diagnósticos foram sincronizados automaticamente.</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">{lastUpdatedTime}</span>
            </div>
          )}



          {/* KPI Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div 
              onClick={() => setSelectedStatusFilter("TODOS")}
              className={`p-4 rounded-xl bg-slate-900/60 border transition-all cursor-pointer ${selectedStatusFilter === "TODOS" ? "border-emerald-500 shadow-md shadow-emerald-900/20" : "border-slate-800/80 hover:border-slate-700"}`}
            >
              <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
                <span>Total no Pipeline</span>
                <Layers className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-white mt-2">{stats.total || 0}</p>
              <span className="text-[10px] text-slate-500">Demanda total ativa</span>
            </div>

            <div 
              onClick={() => setSelectedStatusFilter("Em análise")}
              className={`p-4 rounded-xl bg-slate-900/60 border transition-all cursor-pointer ${selectedStatusFilter === "Em análise" ? "border-blue-500 shadow-md shadow-blue-900/20" : "border-slate-800/80 hover:border-slate-700"}`}
            >
              <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
                <span>1. Em Análise</span>
                <Clock className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-2xl font-bold text-blue-400 mt-2">{stats.em_analise || 0}</p>
              <span className="text-[10px] text-slate-500">Comercial → Projetos</span>
            </div>

            <div 
              onClick={() => setSelectedStatusFilter("Visita técnica")}
              className={`p-4 rounded-xl bg-slate-900/60 border transition-all cursor-pointer ${selectedStatusFilter === "Visita técnica" ? "border-purple-500 shadow-md shadow-purple-900/20" : "border-slate-800/80 hover:border-slate-700"}`}
            >
              <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
                <span>2. Visita Técnica</span>
                <MapPin className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-2xl font-bold text-purple-400 mt-2">{stats.visita_tecnica || 0}</p>
              <span className="text-[10px] text-slate-500">Projetos + Operação</span>
            </div>

            <div 
              onClick={() => setSelectedStatusFilter("Em preparação")}
              className={`p-4 rounded-xl bg-slate-900/60 border transition-all cursor-pointer ${selectedStatusFilter === "Em preparação" ? "border-amber-500 shadow-md shadow-amber-900/20" : "border-slate-800/80 hover:border-slate-700"}`}
            >
              <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
                <span>3. Em Preparação</span>
                <Truck className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-amber-400 mt-2">{stats.em_preparacao || 0}</p>
              <span className="text-[10px] text-slate-500">Recursos e Frota</span>
            </div>

            <div 
              onClick={() => setSelectedStatusFilter("Go-Live definido")}
              className={`p-4 rounded-xl bg-slate-900/60 border transition-all cursor-pointer ${selectedStatusFilter === "Go-Live definido" ? "border-emerald-500 shadow-md shadow-emerald-900/20" : "border-slate-800/80 hover:border-slate-700"}`}
            >
              <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
                <span>4. Go-Live Definido</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-emerald-400 mt-2">{stats.golive_definido || 0}</p>
              <span className="text-[10px] text-slate-500">Validado pela Operação</span>
            </div>

            <div 
              onClick={() => setSelectedStatusFilter("Restrição/Pendente")}
              className={`p-4 rounded-xl bg-slate-900/60 border transition-all cursor-pointer ${selectedStatusFilter === "Restrição/Pendente" ? "border-rose-500 shadow-md shadow-rose-900/20" : "border-slate-800/80 hover:border-slate-700"}`}
            >
              <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
                <span>5. Restrição / Pend.</span>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              </div>
              <p className="text-2xl font-bold text-rose-400 mt-2">{stats.restricao_pendente || 0}</p>
              <span className="text-[10px] text-slate-500">Requer Ajustes</span>
            </div>
          </div>

          {/* Sub Navigation Bar & Search */}
          <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-slate-900/70 p-3 rounded-xl border border-slate-800">
            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800/60">
              <button
                onClick={() => setViewMode("kanban")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "kanban" ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-white"}`}
              >
                <Layers className="w-3.5 h-3.5" />
                Pipeline Kanban
              </button>
              <button
                onClick={() => setViewMode("tabela")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "tabela" ? "bg-emerald-600 text-white shadow" : "text-slate-400 hover:text-white"}`}
              >
                <List className="w-3.5 h-3.5" />
                Lista Geral
              </button>
              <button
                onClick={() => setViewMode("relatorio")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "relatorio" ? "bg-blue-600 text-white shadow" : "text-slate-400 hover:text-white"}`}
              >
                <Calendar className="w-3.5 h-3.5" />
                Relatório de Quarta-feira 📢
              </button>
              <button
                onClick={() => setViewMode("guia")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "guia" ? "bg-purple-600 text-white shadow" : "text-slate-400 hover:text-white"}`}
              >
                <HelpCircle className="w-3.5 h-3.5" />
                Regras do Fluxo
              </button>
            </div>

            {/* Search & Filter */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 md:w-64">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar cliente, cidade, código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                onClick={loadData}
                className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all"
                title="Atualizar dados"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-400" : ""}`} />
              </button>
            </div>
          </div>

          {/* VIEW MODE 1: KANBAN BOARD */}
          {viewMode === "kanban" && (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 overflow-x-auto pb-4">
              {STAGES.map((stage) => {
                const stageItems = listFiltered.filter(s => s.status === stage.id);
                return (
                  <div key={stage.id} className="flex flex-col rounded-xl bg-slate-900/40 border border-slate-800/80 min-w-[260px] h-[calc(100vh-280px)]">
                    {/* Stage Header */}
                    <div className={`p-3 border-b flex items-center justify-between rounded-t-xl ${stage.color}`}>
                      <span className="font-semibold text-xs text-white tracking-wide">{stage.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${stage.badge}`}>
                        {stageItems.length}
                      </span>
                    </div>

                    {/* Stage Items */}
                    <div className="flex-1 p-2 space-y-3 overflow-y-auto">
                      {stageItems.length === 0 ? (
                        <div className="h-32 flex flex-col items-center justify-center text-center p-3 border border-dashed border-slate-800/60 rounded-lg">
                          <p className="text-[11px] text-slate-600 font-medium">Nenhuma solicitação</p>
                        </div>
                      ) : (
                        stageItems.map((item) => (
                          <div
                            key={item.id}
                            onClick={() => handleOpenDetailModal(item)}
                            className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-emerald-500/50 transition-all cursor-pointer group shadow-sm hover:shadow-emerald-950/20"
                          >
                            <div className="flex items-center justify-between gap-1 text-[10px] text-slate-500 font-mono">
                              <span className="text-emerald-400 font-bold">{item.codigo}</span>
                              <span>{item.data_solicitacao}</span>
                            </div>

                            <h4 className="font-bold text-sm text-white mt-1 group-hover:text-emerald-400 transition-colors line-clamp-1">
                              {item.cliente_nome}
                            </h4>

                            <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-1">
                              <MapPin className="w-3 h-3 text-slate-500" />
                              <span>{item.cidade}/{item.estado}</span>
                              {item.volume_estimado_diario && (
                                <>
                                  <span className="text-slate-600">•</span>
                                  <span className="text-emerald-400 font-medium">{item.volume_estimado_diario} pac/dia</span>
                                </>
                              )}
                            </div>

                            {item.parecer_gestor_decisao && item.parecer_gestor_decisao !== "Pendente" && (
                              <div className="mt-2 text-[10px] px-2 py-0.5 rounded font-semibold bg-purple-500/10 border border-purple-500/20 text-purple-300 flex items-center justify-between">
                                <span>Gestor FM:</span>
                                <span>{item.parecer_gestor_decisao}</span>
                              </div>
                            )}

                            {item.data_go_live_prevista && (
                              <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                <Calendar className="w-3 h-3" />
                                <span>Go-Live: {item.data_go_live_prevista}</span>
                              </div>
                            )}

                            <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                              <span>Comercial: {item.vendedor_comercial}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW MODE 2: TABELA GERAL */}
          {viewMode === "tabela" && (
            <div className="rounded-xl bg-slate-900/60 border border-slate-800 overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Código / Data</th>
                      <th className="px-4 py-3">Cliente / Segmento</th>
                      <th className="px-4 py-3">Localização / Volume</th>
                      <th className="px-4 py-3">Status do Fluxo</th>
                      <th className="px-4 py-3">Parecer do Gestor</th>
                      <th className="px-4 py-3">Go-Live Previsto</th>
                      <th className="px-4 py-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/20">
                    {listFiltered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                          Nenhuma solicitação encontrada para os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      listFiltered.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-mono">
                            <span className="font-bold text-emerald-400">{item.codigo}</span>
                            <div className="text-[10px] text-slate-500">{item.data_solicitacao}</div>
                          </td>

                          <td className="px-4 py-3">
                            <span className="font-bold text-white text-sm block">{item.cliente_nome}</span>
                            <span className="text-[10px] text-slate-400">{item.segmento || "Geral"} • {item.vendedor_comercial}</span>
                          </td>

                          <td className="px-4 py-3">
                            <div>{item.cidade}/{item.estado}</div>
                            <div className="text-[10px] text-emerald-400 font-medium">
                              {item.volume_estimado_diario ? `${item.volume_estimado_diario} pacotes/dia` : "Vol. não especificado"}
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${STAGES.find(s => s.id === item.status)?.color || "border-slate-700 bg-slate-800 text-slate-300"}`}>
                              {item.status}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            <span className="font-semibold text-purple-300">
                              {item.parecer_gestor_decisao || "Pendente"}
                            </span>
                          </td>

                          <td className="px-4 py-3">
                            {item.data_go_live_prevista ? (
                              <span className="font-bold text-emerald-400 flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                {item.data_go_live_prevista}
                              </span>
                            ) : (
                              <span className="text-slate-500 italic text-[11px]">A definir</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleOpenDetailModal(item)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs font-medium transition-all"
                            >
                              Gerenciar Fluxo
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW MODE 3: RELATÓRIO DE QUARTA-FEIRA */}
          {viewMode === "relatorio" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-400" />
                      Atualização Semanal de Status (Toda Quarta-feira)
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Relatório gerado automaticamente para alinhamento oficial com a diretoria, comercial e operação.
                    </p>
                  </div>
                  <button
                    onClick={copyRelatorioText}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs transition-all shadow-lg shadow-blue-900/30"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copiado!" : "Copiar Relatório Formatado"}
                  </button>
                </div>

                <div className="p-6 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed shadow-inner">
                  {relatorioQuarta?.texto_formatado || "Carregando relatório..."}
                </div>
              </div>

              {/* Sidebar Info */}
              <div className="space-y-4">
                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                  <h4 className="font-bold text-sm text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    Regra da Atualização Semanal
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Conforme o fluxo padrão FM, toda quarta-feira o setor de Projetos (<span className="text-blue-400 font-medium">@Diego Mandarino</span>) consolida e compartilha o status atualizado das implantações em andamento com a Operação (<span className="text-emerald-400 font-medium">@Thatiane Santos</span>) e a Gestão da Área.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 4: GUIA E REGRAS DO FLUXO */}
          {viewMode === "guia" && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-xl space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <HelpCircle className="w-6 h-6 text-purple-400" />
                    Diretrizes do Fluxo de Implantação FM
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Garantindo alinhamento de expectativas, avaliação prévia de viabilidade, validação operacional e a opinião do gestor da área.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* MODAL 1: CADASTRAR NOVA SOLICITAÇÃO (Etapa 1 - Comercial -> Projetos) */}
      {isNovoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                Nova Solicitação de Implantação FM (Comercial)
              </h3>
              <button onClick={() => setIsNovoModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Nome do Cliente / Merchant *</label>
                  <input
                    type="text"
                    required
                    value={formNovo.cliente_nome}
                    onChange={(e) => setFormNovo({...formNovo, cliente_nome: e.target.value})}
                    placeholder="Ex: Shein Hub SP, Magazine Luiza, etc."
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Vendedor / Responsável Comercial *</label>
                  <input
                    type="text"
                    required
                    value={formNovo.vendedor_comercial}
                    onChange={(e) => setFormNovo({...formNovo, vendedor_comercial: e.target.value})}
                    placeholder="Ex: Carlos Eduardo (Comercial)"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Cidade *</label>
                  <input
                    type="text"
                    required
                    value={formNovo.cidade}
                    onChange={(e) => setFormNovo({...formNovo, cidade: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Estado (UF) *</label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    value={formNovo.estado}
                    onChange={(e) => setFormNovo({...formNovo, estado: e.target.value.toUpperCase()})}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Volume Diário Estimado (pacotes)</label>
                  <input
                    type="number"
                    value={formNovo.volume_estimado_diario}
                    onChange={(e) => setFormNovo({...formNovo, volume_estimado_diario: parseInt(e.target.value) || 0})}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Janela de Coleta Esperada</label>
                  <input
                    type="text"
                    value={formNovo.horario_coleta_janela}
                    onChange={(e) => setFormNovo({...formNovo, horario_coleta_janela: e.target.value})}
                    placeholder="Ex: 14:00 - 18:00"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Endereço Completo de Coleta</label>
                <input
                  type="text"
                  value={formNovo.endereco_coleta}
                  onChange={(e) => setFormNovo({...formNovo, endereco_coleta: e.target.value})}
                  placeholder="Rua, Número, Bairro, CEP"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Observações Comerciais / Detalhes da Demanda</label>
                <textarea
                  rows={3}
                  value={formNovo.observacoes_comercial}
                  onChange={(e) => setFormNovo({...formNovo, observacoes_comercial: e.target.value})}
                  placeholder="Observações importantes sobre o contrato, restrições do cliente ou prioridade..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsNovoModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/30"
                >
                  Cadastrar e Enviar ao Projetos
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: INSPECTOR & GESTÃO DO FLUXO (COM ABA DA OPINIÃO DO GESTOR E DIAGNÓSTICO D-1) */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-emerald-400">{selectedItem.codigo}</span>
                  <span className="text-slate-600">•</span>
                  <span className="text-xs text-slate-400">Solicitado em: {selectedItem.data_solicitacao}</span>
                </div>
                <h3 className="text-lg font-bold text-white mt-0.5">{selectedItem.cliente_nome}</h3>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">Status Atual:</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${STAGES.find(s => s.id === selectedItem.status)?.color}`}>
                    {selectedItem.status}
                  </span>
                </div>
                <button onClick={() => setSelectedItem(null)} className="text-slate-400 hover:text-white p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Stepper Tabs Bar */}
            <div className="flex border-b border-slate-800 bg-slate-950/60 overflow-x-auto text-xs shrink-0">
              <button
                onClick={() => setActiveTabModal("diagnostico")}
                className={`px-4 py-3 font-semibold border-b-2 whitespace-nowrap flex items-center gap-1.5 transition-all ${activeTabModal === "diagnostico" ? "border-emerald-500 text-emerald-400 bg-slate-900" : "border-transparent text-slate-400 hover:text-white"}`}
              >
                <BrainCircuit className="w-3.5 h-3.5" />
                Diagnóstico D-1 (14 Perguntas)
              </button>
              <button
                onClick={() => setActiveTabModal("gestor")}
                className={`px-4 py-3 font-semibold border-b-2 whitespace-nowrap flex items-center gap-1.5 transition-all ${activeTabModal === "gestor" ? "border-purple-500 text-purple-400 bg-slate-900" : "border-transparent text-slate-400 hover:text-white"}`}
              >
                <UserCog className="w-3.5 h-3.5" />
                Parecer do Gestor da Área 👔
              </button>
              <button
                onClick={() => setActiveTabModal("solicitacao")}
                className={`px-4 py-3 font-semibold border-b-2 whitespace-nowrap transition-all ${activeTabModal === "solicitacao" ? "border-blue-500 text-blue-400 bg-slate-900" : "border-transparent text-slate-400 hover:text-white"}`}
              >
                1. Solicitação
              </button>
              <button
                onClick={() => setActiveTabModal("viabilidade")}
                className={`px-4 py-3 font-semibold border-b-2 whitespace-nowrap transition-all ${activeTabModal === "viabilidade" ? "border-purple-500 text-purple-400 bg-slate-900" : "border-transparent text-slate-400 hover:text-white"}`}
              >
                2. Viabilidade Operacional
              </button>
              <button
                onClick={() => setActiveTabModal("visita")}
                className={`px-4 py-3 font-semibold border-b-2 whitespace-nowrap transition-all ${activeTabModal === "visita" ? "border-amber-500 text-amber-400 bg-slate-900" : "border-transparent text-slate-400 hover:text-white"}`}
              >
                3. Visita Técnica (@Thatiane)
              </button>
              <button
                onClick={() => setActiveTabModal("recursos")}
                className={`px-4 py-3 font-semibold border-b-2 whitespace-nowrap transition-all ${activeTabModal === "recursos" ? "border-emerald-500 text-emerald-400 bg-slate-900" : "border-transparent text-slate-400 hover:text-white"}`}
              >
                4. Recursos & Go-Live
              </button>
              <button
                onClick={() => setActiveTabModal("comercial")}
                className={`px-4 py-3 font-semibold border-b-2 whitespace-nowrap transition-all ${activeTabModal === "comercial" ? "border-blue-500 text-blue-400 bg-slate-900" : "border-transparent text-slate-400 hover:text-white"}`}
              >
                5. Alinhamento Comercial
              </button>
              <button
                onClick={() => setActiveTabModal("historico")}
                className={`px-4 py-3 font-semibold border-b-2 whitespace-nowrap transition-all ${activeTabModal === "historico" ? "border-slate-400 text-white bg-slate-900" : "border-transparent text-slate-400 hover:text-white"}`}
              >
                6. Histórico
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              
              {/* TAB 0: DIAGNÓSTICO AUTOMÁTICO D-1 (14 PERGUNTAS) */}
              {activeTabModal === "diagnostico" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center">
                    <div>
                      <h4 className="font-bold text-sm text-emerald-400 flex items-center gap-2">
                        <BrainCircuit className="w-5 h-5" />
                        Diagnóstico Inteligente por Cruzamento de Dados D-1
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Respostas automáticas extraídas do histórico de planilhas D-1 importadas no banco SQLite.
                      </p>
                    </div>
                    {loadingDiag && <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />}
                  </div>

                  {diagnosticoD1?.perguntas_respostas ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {Object.entries(diagnosticoD1.perguntas_respostas).map(([key, item]: [string, any]) => {
                        if (key === "11_recursos_sugeridos") {
                          const r = item.resposta;
                          return (
                            <div key={key} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 md:col-span-2">
                              <span className="text-slate-400 font-bold block">{item.pergunta}</span>
                              <div className="text-emerald-300 font-semibold mt-1">
                                Dimensionamento Sugerido: {typeof r === "string" ? r : `${r.pda_qtd} PDA(s), ${r.auxiliares} Auxiliar(es), Veículo: ${r.veiculo}, ${r.sacas} Sacas, ${r.lacres} Lacres.`}
                              </div>
                            </div>
                          );
                        }
                        if (key === "14_pos_golive_performance") {
                          return (
                            <div key={key} className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-1 md:col-span-2">
                              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                                <TrendingUp className="w-4 h-4" />
                                14. Performance Pós-Go-Live (Acompanhamento Rampa D+1 a D+30)
                              </span>
                              <div className="grid grid-cols-3 gap-2 mt-2">
                                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                                  <span className="text-[10px] text-slate-500 block">Status Rampa</span>
                                  <span className="font-bold text-white">{item.status_rampa}</span>
                                </div>
                                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                                  <span className="text-[10px] text-slate-500 block">Volume Real D-1</span>
                                  <span className="font-bold text-emerald-400">{item.volume_real_d1} pac/dia</span>
                                </div>
                                <div className="p-2 rounded bg-slate-900 border border-slate-800">
                                  <span className="text-[10px] text-slate-500 block">SLA de Coleta Real</span>
                                  <span className="font-bold text-emerald-400">{item.sla_real_d1}%</span>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={key} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                            <div className="flex justify-between items-start">
                              <span className="text-slate-400 font-semibold">{item.pergunta}</span>
                              {item.status_badge && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  {item.status_badge}
                                </span>
                              )}
                            </div>
                            <p className="text-white font-medium mt-1">
                              {typeof item.resposta === "object" ? JSON.stringify(item.resposta) : item.resposta}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-500 italic">
                      Carregando perguntas e respostas do diagnóstico D-1...
                    </div>
                  )}
                </div>
              )}

              {/* TAB ESPECIAL: PARECER E OPINIÃO DO GESTOR DA ÁREA FM */}
              {activeTabModal === "gestor" && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-950/40 via-slate-950 to-slate-950 border border-purple-800/40 space-y-4">
                    <div>
                      <h4 className="font-bold text-base text-purple-300 flex items-center gap-2">
                        <UserCog className="w-5 h-5 text-purple-400" />
                        Parecer e Avaliação Qualitativa do Gestor da Área FM
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Mesmo com o diagnóstico e dimensionamento automáticos por D-1, a opinião estratégica do gestor da área é decisiva para o prosseguimento da implantação.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Nome do Gestor Responsável *</label>
                        <input
                          type="text"
                          value={formGestor.gestor_nome}
                          onChange={(e) => setFormGestor({...formGestor, gestor_nome: e.target.value})}
                          placeholder="Ex: Gestor FM / Projetos"
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Decisão do Gestor *</label>
                        <select
                          value={formGestor.parecer_gestor_decisao}
                          onChange={(e) => setFormGestor({...formGestor, parecer_gestor_decisao: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white font-bold"
                        >
                          <option value="Aprovado">🟢 Aprovado (Seguir para Go-Live)</option>
                          <option value="Aprovado com Ressalvas">🟡 Aprovado com Ressalvas (Condicionantes)</option>
                          <option value="Reprovado / Reavaliar">🔴 Reprovado / Reavaliar (Restrição Impeditiva)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Opinião Qualitativa e Diretrizes do Gestor</label>
                      <textarea
                        rows={4}
                        value={formGestor.parecer_gestor_texto}
                        onChange={(e) => setFormGestor({...formGestor, parecer_gestor_texto: e.target.value})}
                        placeholder="Insira a avaliação qualitativa, justificativas de negócio, análise de risco estratégica ou observações do gestor sobre o cliente/praça..."
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Ressalvas ou Condicionantes Estratégicas</label>
                      <textarea
                        rows={2}
                        value={formGestor.parecer_gestor_ressalvas}
                        onChange={(e) => setFormGestor({...formGestor, parecer_gestor_ressalvas: e.target.value})}
                        placeholder="Ex: Exigir contratação prévia de 1 motorista reserva; Validar credenciamento de entrada na doca..."
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <button
                      onClick={handleSaveGestor}
                      className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-900/30 transition-all"
                    >
                      Registrar Parecer do Gestor da Área
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 1: SOLICITAÇÃO COMERCIAL */}
              {activeTabModal === "solicitacao" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                    <div>
                      <span className="text-slate-500 block">Vendedor Comercial:</span>
                      <span className="font-bold text-white">{selectedItem.vendedor_comercial}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Focal Projetos:</span>
                      <span className="font-bold text-blue-400">{selectedItem.focal_projetos}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Focal Operação:</span>
                      <span className="font-bold text-emerald-400">{selectedItem.focal_operacao}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Cidade / Estado:</span>
                      <span className="font-bold text-white">{selectedItem.cidade} / {selectedItem.estado}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Volume Estimado:</span>
                      <span className="font-bold text-emerald-400">{selectedItem.volume_estimado_diario} pacotes/dia</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Janela de Coleta:</span>
                      <span className="font-bold text-white">{selectedItem.horario_coleta_janela}</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-xs">
                    <span className="text-slate-500 font-semibold block">Endereço Completo de Coleta:</span>
                    <p className="text-slate-200">{selectedItem.endereco_coleta || "Não especificado"}</p>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1 text-xs">
                    <span className="text-slate-500 font-semibold block">Observações do Comercial:</span>
                    <p className="text-slate-200">{selectedItem.observacoes_comercial || "Sem observações adicionais."}</p>
                  </div>
                </div>
              )}

              {/* TAB 2: ANÁLISE DE VIABILIDADE (PROJETOS -> OPERAÇÃO) */}
              {activeTabModal === "viabilidade" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <h4 className="font-bold text-sm text-purple-400">Condição Indicada pela Operação</h4>
                    
                    <div className="space-y-2">
                      {[
                        "① Início imediato",
                        "② Necessidade de prazo para implantação",
                        "③ Baixa aderência / restrição operacional"
                      ].map((cond) => (
                        <label key={cond} className="flex items-center gap-3 p-3 rounded-lg border border-slate-800 bg-slate-900/60 cursor-pointer hover:border-purple-500/50">
                          <input
                            type="radio"
                            name="condicao"
                            value={cond}
                            checked={formViabilidade.condicao_viabilidade === cond}
                            onChange={(e) => setFormViabilidade({...formViabilidade, condicao_viabilidade: e.target.value})}
                            className="text-purple-600 focus:ring-purple-500"
                          />
                          <span className="text-xs font-semibold text-white">{cond}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Checklist Toggles */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <h4 className="font-bold text-sm text-slate-200">Checklist de Capacidade & Recursos</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <label className="flex items-center gap-2 p-2 rounded bg-slate-900 border border-slate-800">
                        <input
                          type="checkbox"
                          checked={formViabilidade.capacidade_operacional_ok === 1}
                          onChange={(e) => setFormViabilidade({...formViabilidade, capacidade_operacional_ok: e.target.checked ? 1 : 0})}
                        />
                        <span>Capacidade Operacional Atual OK</span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded bg-slate-900 border border-slate-800">
                        <input
                          type="checkbox"
                          checked={formViabilidade.disponibilidade_frota_ok === 1}
                          onChange={(e) => setFormViabilidade({...formViabilidade, disponibilidade_frota_ok: e.target.checked ? 1 : 0})}
                        />
                        <span>Disponibilidade de Frota OK</span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded bg-slate-900 border border-slate-800">
                        <input
                          type="checkbox"
                          checked={formViabilidade.atendimento_regiao_ok === 1}
                          onChange={(e) => setFormViabilidade({...formViabilidade, atendimento_regiao_ok: e.target.checked ? 1 : 0})}
                        />
                        <span>Atendimento da Região OK</span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded bg-slate-900 border border-slate-800">
                        <input
                          type="checkbox"
                          checked={formViabilidade.necessidade_contratacao_equipe === 1}
                          onChange={(e) => setFormViabilidade({...formViabilidade, necessidade_contratacao_equipe: e.target.checked ? 1 : 0})}
                        />
                        <span>Requer Contratação de Equipe</span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded bg-slate-900 border border-slate-800">
                        <input
                          type="checkbox"
                          checked={formViabilidade.necessidade_novas_rotas === 1}
                          onChange={(e) => setFormViabilidade({...formViabilidade, necessidade_novas_rotas: e.target.checked ? 1 : 0})}
                        />
                        <span>Requer Novas Rotas</span>
                      </label>

                      <label className="flex items-center gap-2 p-2 rounded bg-slate-900 border border-slate-800">
                        <input
                          type="checkbox"
                          checked={formViabilidade.estrutura_equipamentos_ok === 1}
                          onChange={(e) => setFormViabilidade({...formViabilidade, estrutura_equipamentos_ok: e.target.checked ? 1 : 0})}
                        />
                        <span>Estrutura e Equipamentos OK</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Parecer Detalhado da Operação / Restrições</label>
                    <textarea
                      rows={3}
                      value={formViabilidade.parecer_operacional}
                      onChange={(e) => setFormViabilidade({...formViabilidade, parecer_operacional: e.target.value})}
                      placeholder="Descreva justificativas, restrições operacionais ou precondições..."
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <button
                    onClick={handleSaveViabilidade}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-900/30 transition-all"
                  >
                    Salvar Parecer de Viabilidade Operacional
                  </button>
                </div>
              )}

              {/* TAB 3: VISITA TÉCNICA (THATIANE) */}
              {activeTabModal === "visita" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="font-bold text-sm text-amber-400 flex items-center gap-2">
                        <UserCheck className="w-4 h-4" />
                        Visita Técnica no Cliente (Focal: @Thatiane Silva Santos)
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Status da Visita</label>
                        <select
                          value={formVisita.status_visita}
                          onChange={(e) => setFormVisita({...formVisita, status_visita: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                        >
                          <option value="Pendente">Pendente</option>
                          <option value="Agendada">Agendada</option>
                          <option value="Realizada">Realizada</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Data da Visita Técnica</label>
                        <input
                          type="date"
                          value={formVisita.data_visita_tecnica}
                          onChange={(e) => setFormVisita({...formVisita, data_visita_tecnica: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Relatório / Observações da Visita Técnica</label>
                      <textarea
                        rows={4}
                        value={formVisita.relatorio_visita}
                        onChange={(e) => setFormVisita({...formVisita, relatorio_visita: e.target.value})}
                        placeholder="Condições das docas, conferência de sacas, horário de expedição do cliente, requisitos de TI/Impressora..."
                        className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSaveVisita}
                    className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-lg shadow-amber-900/30 transition-all"
                  >
                    Salvar Status da Visita Técnica
                  </button>
                </div>
              )}

              {/* TAB 4: RECURSOS & GO-LIVE (OPERAÇÃO) */}
              {activeTabModal === "recursos" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                    <h4 className="font-bold text-sm text-emerald-400">Recursos Operacionais Necessários</h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div>
                        <label className="block text-slate-300 font-medium mb-1">Quantidade de PDAs</label>
                        <input
                          type="number"
                          value={formRecursos.pda_qtd}
                          onChange={(e) => setFormRecursos({...formRecursos, pda_qtd: parseInt(e.target.value) || 0})}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-medium mb-1">Mesa / Posto Operacional</label>
                        <input
                          type="text"
                          value={formRecursos.mesa_posto_operacional}
                          onChange={(e) => setFormRecursos({...formRecursos, mesa_posto_operacional: e.target.value})}
                          placeholder="Ex: Mesa 02 - Galpão Principal"
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-medium mb-1">Equipamentos (Impressoras/Leitores)</label>
                        <input
                          type="text"
                          value={formRecursos.equipamentos_desc}
                          onChange={(e) => setFormRecursos({...formRecursos, equipamentos_desc: e.target.value})}
                          placeholder="Ex: 1 Zebra ZD421"
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-medium mb-1">Rotas & Frota Alocada</label>
                        <input
                          type="text"
                          value={formRecursos.rotas_frota_desc}
                          onChange={(e) => setFormRecursos({...formRecursos, rotas_frota_desc: e.target.value})}
                          placeholder="Ex: 1 Van dedicada turno tarde"
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-medium mb-1">Insumos (Sacas, Lacres, Etiquetas)</label>
                        <input
                          type="text"
                          value={formRecursos.insumos_desc}
                          onChange={(e) => setFormRecursos({...formRecursos, insumos_desc: e.target.value})}
                          placeholder="Ex: 300 Sacas + 500 Lacres"
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-medium mb-1">Equipe Operacional / Contratação</label>
                        <input
                          type="text"
                          value={formRecursos.equipe_contratacao_desc}
                          onChange={(e) => setFormRecursos({...formRecursos, equipe_contratacao_desc: e.target.value})}
                          placeholder="Ex: 2 Auxiliares contratados"
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 space-y-3">
                    <h4 className="font-bold text-sm text-emerald-400">Validação da Data do Go-Live</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Data Prevista de Go-Live *</label>
                        <input
                          type="text"
                          placeholder="DD/MM/AAAA ou YYYY-MM-DD"
                          value={formRecursos.data_go_live_prevista}
                          onChange={(e) => setFormRecursos({...formRecursos, data_go_live_prevista: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-emerald-600/40 text-xs text-white font-bold"
                        />
                      </div>

                      <label className="flex items-center gap-2 p-3 rounded-lg bg-slate-950 border border-emerald-600/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formRecursos.go_live_validado_operacao === 1}
                          onChange={(e) => setFormRecursos({...formRecursos, go_live_validado_operacao: e.target.checked ? 1 : 0})}
                        />
                        <span className="text-xs font-bold text-emerald-300">Data e Capacidade Validadas pela Operação</span>
                      </label>
                    </div>
                  </div>

                  <button
                    onClick={handleSaveRecursos}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/30 transition-all"
                  >
                    Salvar Recursos & Definir Go-Live
                  </button>
                </div>
              )}

              {/* TAB 5: ALINHAMENTO COMERCIAL */}
              {activeTabModal === "comercial" && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
                    <h4 className="font-bold text-sm text-blue-400">Comunicação Oficial ao Comercial (Etapa 5)</h4>
                    <p className="text-slate-400">
                      Após a validação final da Operação, Projetos comunica formalmente ao Comercial a data validada de Go-Live para alinhamento com o cliente.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <div>
                        <label className="block font-semibold text-slate-300 mb-1">Data da Comunicação ao Comercial</label>
                        <input
                          type="date"
                          value={formComercial.comunicado_comercial_em}
                          onChange={(e) => setFormComercial({...formComercial, comunicado_comercial_em: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white"
                        />
                      </div>

                      <label className="flex items-center gap-2 p-3 rounded-lg bg-slate-900 border border-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formComercial.comercial_ciente === 1}
                          onChange={(e) => setFormComercial({...formComercial, comercial_ciente: e.target.checked ? 1 : 0})}
                        />
                        <span className="font-semibold text-white">Comercial e Cliente Cientes da Data Validada</span>
                      </label>
                    </div>
                  </div>

                  <button
                    onClick={handleSaveComercial}
                    className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-900/30 transition-all"
                  >
                    Confirmar Comunicação ao Comercial
                  </button>
                </div>
              )}

              {/* TAB 6: HISTÓRICO DE AUDITORIA */}
              {activeTabModal === "historico" && (
                <div className="space-y-4 text-xs">
                  <h4 className="font-bold text-sm text-slate-200">Trilha Auditável de Mudanças de Status</h4>
                  
                  {selectedItem.historico_status ? (
                    <div className="space-y-2">
                      {JSON.parse(selectedItem.historico_status).map((h: any, idx: number) => (
                        <div key={idx} className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500 font-mono">{h.data_hora}</span>
                              <span className="text-slate-400">De: <strong>{h.de_status}</strong> → Para: <strong className="text-emerald-400">{h.para_status}</strong></span>
                            </div>
                            {h.observacao && (
                              <p className="text-slate-300 mt-1">{h.observacao}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 italic">Nenhum registro histórico disponível.</p>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Modal de Viabilidade Rápida 100% Data-Driven */}
      <ViabilidadeModal
        isOpen={isViabilidadeModalOpen}
        onClose={() => setIsViabilidadeModalOpen(false)}
        onLocalizarNoMapa={(cid) => {
          window.location.href = `/mapa?q=${encodeURIComponent(cid)}`;
        }}
      />

    </div>
  );
}
