"use client";

import React, { useEffect, useState, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import { 
  Rocket,
  Workflow,
  Tag,
  Hash,
  GitBranch,
  ArrowRightLeft,
  UserX, 
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
  Laptop, 
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
  SolicitacaoImplantacaoItem,
  fetchPAsAtivos,
  PAAtivoItem
} from "@/lib/api";
import ViabilidadeModal from "@/components/ViabilidadeModal";

const STAGES = [
  { id: "Em análise", title: "1. Em Análise", color: "border-blue-500/40 bg-blue-500/5 text-blue-400", badge: "bg-blue-500/20 text-blue-300" },
  { id: "Visita técnica", title: "2. Visita Técnica", color: "border-purple-500/40 bg-purple-500/5 text-purple-400", badge: "bg-purple-500/20 text-purple-300" },
  { id: "Em preparação", title: "3. Em Andamento / Prep.", color: "border-amber-500/40 bg-amber-500/5 text-amber-400", badge: "bg-amber-500/20 text-amber-300" },
  { id: "Go-Live definido", title: "4. Go-Live Definido", color: "border-emerald-500/40 bg-emerald-500/5 text-emerald-400", badge: "bg-emerald-500/20 text-emerald-300" },
  { id: "Concluído", title: "5. Concluído / Iniciado", color: "border-teal-500/40 bg-teal-500/5 text-teal-400", badge: "bg-teal-500/20 text-teal-300" },
  { id: "Suspenso", title: "6. Suspenso", color: "border-rose-500/40 bg-rose-500/5 text-rose-400", badge: "bg-rose-500/20 text-rose-300" },
  { id: "Restrição/Pendente", title: "7. Restrição / Pendente", color: "border-orange-500/40 bg-orange-500/5 text-orange-400", badge: "bg-orange-500/20 text-orange-300" },
];

const getStageInfo = (status: string) => {
  if (status === "Iniciado") return STAGES.find(s => s.id === "Concluído");
  if (status === "Em andamento") return STAGES.find(s => s.id === "Em preparação");
  return STAGES.find(s => s.id === status) || { id: status, title: status, color: "border-slate-700 bg-slate-800 text-slate-300", badge: "bg-slate-700 text-slate-300" };
};


interface StepperPhase {
  step: string;
  name: string;
  status: "done" | "warning" | "danger" | "paused" | "live";
  desc: string;
}

function getProjectExecutionStepper(item: SolicitacaoImplantacaoItem): StepperPhase[] {
  const nome = item.cliente_nome.toLowerCase();

  if (nome.includes("olist")) {
    return [
      { step: "1", name: "Comercial", status: "done", desc: "Contrato Fechado" },
      { step: "2", name: "Viabilidade", status: "done", desc: "Aprovada (Imediata)" },
      { step: "3", name: "Visita / Rota", status: "done", desc: "Alinhada e Aprovada" },
      { step: "4", name: "Equip. & Frota", status: "done", desc: "Coletores e Veículo OK" },
      { step: "5", name: "Go-Live", status: "live", desc: "EM OPERAÇÃO (16h)" },
    ];
  }
  if (nome.includes("bravium")) {
    return [
      { step: "1", name: "Comercial", status: "done", desc: "Acordo Formalizado" },
      { step: "2", name: "Viabilidade", status: "done", desc: "Aprovada c/ Prazo" },
      { step: "3", name: "Visita Técnica", status: "done", desc: "Checklist CLR Raposo" },
      { step: "4", name: "TI & RH (Gargalo)", status: "warning", desc: "Lark 2 func | TI até 45 d.ú." },
      { step: "5", name: "Go-Live", status: "paused", desc: "Reprogramado p/ TI" },
    ];
  }
  if (nome.includes("boticário") || nome.includes("boticario")) {
    return [
      { step: "1", name: "Comercial", status: "done", desc: "POP ANJUN 007" },
      { step: "2", name: "Viabilidade", status: "done", desc: "Aprovada c/ Ressalvas" },
      { step: "3", name: "Visita Técnica", status: "done", desc: "2 PAs (Cajamar/PR)" },
      { step: "4", name: "Segurança / SST", status: "danger", desc: "Bloqueado (Falta PGR/PCMSO)" },
      { step: "5", name: "Go-Live", status: "paused", desc: "Dez/2026 (Black Week Freeze)" },
    ];
  }
  if (nome.includes("renner")) {
    return [
      { step: "1", name: "1. Alinhamento", status: "done", desc: "Expansão 5.000 pac/dia" },
      { step: "2", name: "2. Recursos T3", status: "done", desc: "2 PDAs + 1 PC + 2 Funcs OK" },
      { step: "3", name: "3. Camicado Big Goods", status: "warning", desc: "Layout & POP p/ 28/10" },
      { step: "4", name: "4. Frota (21h e 06h)", status: "warning", desc: "2 Veículos Extras (21h/06h)" },
      { step: "5", name: "5. TI & Reversa", status: "danger", desc: "Tracking + Destravar Reversa" },
    ];
  }
  if (nome.includes("shopmult")) {
    return [
      { step: "1", name: "Comercial", status: "done", desc: "Modelo Itinerante" },
      { step: "2", name: "Viabilidade", status: "done", desc: "Aprovada c/ Prazo" },
      { step: "3", name: "Visita Técnica", status: "done", desc: "Validação Realizada" },
      { step: "4", name: "TI / Kits Móveis", status: "warning", desc: "TI até 45 dias úteis" },
      { step: "5", name: "Go-Live", status: "paused", desc: "Suspenso p/ TI" },
    ];
  }

  return [
    { step: "1", name: "Comercial", status: "done", desc: "Registrado" },
    { step: "2", name: "Viabilidade", status: item.condicao_viabilidade ? "done" : "warning", desc: item.condicao_viabilidade || "Em análise" },
    { step: "3", name: "Visita Técnica", status: item.status_visita === "Realizada" ? "done" : "warning", desc: item.status_visita || "Pendente" },
    { step: "4", name: "Infra & TI", status: item.status === "Suspenso" ? "danger" : "warning", desc: item.status === "Suspenso" ? "Com impedimento" : "Em preparação" },
    { step: "5", name: "Go-Live", status: item.status === "Concluído" ? "live" : "paused", desc: item.data_go_live_prevista || "A definir" },
  ];
}

export default function ImplantacaoFMPage() {
  const [loading, setLoading] = useState(true);
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoImplantacaoItem[]>([]);
  const [pasAtivos, setPasAtivos] = useState<PAAtivoItem[]>([]);
  const [selectedPAAtivo, setSelectedPAAtivo] = useState<PAAtivoItem | null>(null);
  const [executivoSubTab, setExecutivoSubTab] = useState<"todos" | "ativos" | "projetos">("todos");
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
  const [viewMode, setViewMode] = useState<"executivo" | "kanban" | "tabela" | "relatorio" | "guia">("executivo");
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
      const [sData, stData, pasData] = await Promise.all([
        fetchSolicitacoesImplantacao(),
        fetchImplantacaoStats(),
        fetchPAsAtivos().catch(() => [])
      ]);
      setSolicitacoes(sData);
      setStats(stData);
      if (pasData && pasData.length > 0) {
        setPasAtivos(pasData);
      }
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
      
      let matchStatus = selectedStatusFilter === "TODOS" || item.status === selectedStatusFilter;
      if (selectedStatusFilter === "Em preparação" && (item.status === "Em andamento" || item.status === "Em preparação")) {
        matchStatus = true;
      }
      if (selectedStatusFilter === "Restrição/Pendente" && (item.status === "Restrição/Pendente" || item.status === "Suspenso")) {
        matchStatus = true;
      }
      if (selectedStatusFilter === "Concluído" && (item.status === "Concluído" || item.status === "Iniciado")) {
        matchStatus = true;
      }

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
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800/60 overflow-x-auto">
              <button
                onClick={() => setViewMode("executivo")}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${
                  viewMode === "executivo"
                    ? "bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-lg shadow-amber-900/30 ring-1 ring-amber-400"
                    : "text-amber-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                🎯 Painel Executivo (P.As)
              </button>
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
                <Workflow className="w-3.5 h-3.5" />
                Governança & Regras
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

          {/* VIEW MODE 0: PAINEL EXECUTIVO DE POSTOS AVANÇADOS (DIRETORIA) */}
          {viewMode === "executivo" && (
            <div className="space-y-6">
              {/* Executive Overview Banner */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-amber-500/30 shadow-xl relative overflow-hidden">
                <div className="absolute right-0 top-0 bottom-0 w-96 bg-amber-500/5 blur-3xl pointer-events-none" />
                
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 relative z-10">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Visão Executiva Liderança
                      </span>
                      <button
                        onClick={() => setViewMode("guia")}
                        className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 transition-all flex items-center gap-1 cursor-pointer"
                        title="Ver regras e fluxograma oficial de governança"
                      >
                        <Workflow className="w-3 h-3 text-purple-400" />
                        Governança Oficial: Wagner ➔ Luzia ➔ Comercial
                      </button>
                      <span className="text-xs text-slate-400 font-mono">
                        Base: Mapeamento dos PAs.xlsx (Atualizado 23/10/2026)
                      </span>
                    </div>
                    <h2 className="text-xl md:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
                      <Rocket className="w-6 h-6 text-amber-400" />
                      Panorama Executivo dos Postos de Atendimento (P.As) & Implantações
                    </h2>
                    <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                      Visão unificada para Diretoria: acompanhamento dos <strong>5 P.As ativos em operação plena</strong> e das <strong>4 demandas em implantação/bloqueio</strong>.
                    </p>
                  </div>

                  {/* Summary Quick Badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-center min-w-[90px]">
                      <span className="text-[10px] text-slate-400 block font-medium">P.As Mapeados</span>
                      <span className="text-lg font-black text-white">7 P.As</span>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-center min-w-[90px]">
                      <span className="text-[10px] text-emerald-400 block font-medium">Ativos / Operando</span>
                      <span className="text-lg font-black text-emerald-300">5 Bases</span>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-purple-950/40 border border-purple-500/30 text-center min-w-[90px]">
                      <span className="text-[10px] text-purple-400 block font-medium">Capacidade Ativa</span>
                      <span className="text-lg font-black text-purple-300">24k pac/dia</span>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-amber-950/40 border border-amber-500/30 text-center min-w-[90px]">
                      <span className="text-[10px] text-amber-400 block font-medium">Em Implantação</span>
                      <span className="text-lg font-black text-amber-300">1 (Bravium)</span>
                    </div>
                    <div className="px-3 py-2 rounded-xl bg-rose-950/40 border border-rose-500/30 text-center min-w-[90px]">
                      <span className="text-[10px] text-rose-400 block font-medium">Suspensos</span>
                      <span className="text-lg font-black text-rose-300">2 (Boticário/Shop)</span>
                    </div>
                  </div>
                </div>

                {/* Sub-Tabs Pills */}
                <div className="mt-5 pt-4 border-t border-slate-800/80 flex items-center gap-2 flex-wrap relative z-10">
                  <button
                    onClick={() => setExecutivoSubTab("todos")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      executivoSubTab === "todos"
                        ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-900/30 font-black"
                        : "bg-slate-950/80 text-slate-400 hover:text-white border border-slate-800"
                    }`}
                  >
                    🌟 Todos os P.As & Projetos (9)
                  </button>
                  <button
                    onClick={() => setExecutivoSubTab("ativos")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      executivoSubTab === "ativos"
                        ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-900/30 font-black"
                        : "bg-slate-950/80 text-emerald-400 hover:text-emerald-300 border border-slate-800"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    🟢 P.As Ativos em Operação Plena (5)
                  </button>
                  <button
                    onClick={() => setExecutivoSubTab("projetos")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      executivoSubTab === "projetos"
                        ? "bg-rose-500 text-white shadow-md shadow-rose-900/30 font-black"
                        : "bg-slate-950/80 text-amber-400 hover:text-white border border-slate-800"
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    🟡/🔴 P.As em Implantação & Gargalos (4)
                  </button>
                </div>
              </div>

              {/* SEÇÃO 1: P.As ATIVOS EM OPERAÇÃO PLENA (5 BASES MAPEADAS) */}
              {(executivoSubTab === "todos" || executivoSubTab === "ativos") && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                        <Store className="w-4 h-4 text-emerald-400" />
                        P.As Ativos em Operação Plena — Malha First Mile (5 Bases)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Postos com supervisores dedicados, operadores em escala fixa, cortes sincronizados e infraestrutura instalada.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Capacidade Total: 24.000 pac/dia
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pasAtivos.filter(p => p.status_operacional === "Ativo").map((pa) => (
                      <div
                        key={pa.id}
                        onClick={() => setSelectedPAAtivo(pa)}
                        className="p-5 rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950/20 border border-emerald-500/30 hover:border-emerald-400 transition-all cursor-pointer group shadow-xl relative overflow-hidden flex flex-col justify-between"
                      >
                        <div>
                          {/* Card Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider">
                                Posto de Atendimento
                              </span>
                              <h4 className="text-lg font-black text-white group-hover:text-emerald-300 transition-colors mt-0.5">
                                {pa.nome}
                              </h4>
                              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                                <span className="truncate">{pa.cidade} / {pa.estado}</span>
                              </p>
                            </div>

                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-1 shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                              OPERANDO
                            </span>
                          </div>

                          {/* Operacional Box */}
                          <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                            <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                              <span className="text-[10px] text-slate-500 block">Volumetria Diária</span>
                              <span className="font-black text-emerald-400">{pa.volumetria} pac/dia</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                              <span className="text-[10px] text-slate-500 block">Horário de Corte</span>
                              <span className="font-bold text-slate-200 truncate block">{pa.horario_corte || "Regular"}</span>
                            </div>
                          </div>

                          {/* Equipe & Responsavel */}
                          <div className="mt-3 p-3 rounded-xl bg-slate-950/50 border border-slate-800/80 text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-400">Responsável:</span>
                              <span className="font-bold text-slate-200">{pa.responsavel || "Supervisor Designado"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-400">Operadores Dedicados:</span>
                              <span className="font-bold text-emerald-400">{pa.total_operadores} operadores escalados</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-400">Escala:</span>
                              <span className="text-[11px] text-slate-300 truncate max-w-[180px]">{pa.escala_operacao}</span>
                            </div>
                          </div>

                          {/* Equipamentos Alocados Resumo */}
                          <div className="mt-3 pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-400">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                              Inventário em Campo:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(pa.insumos).slice(0, 4).map(([k, v]: [string, any]) => (
                                <span key={k} className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-slate-300">
                                  {k}: <strong className="text-white">{v}</strong>
                                </span>
                              ))}
                              {Object.keys(pa.insumos).length > 4 && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] text-emerald-400">
                                  +{Object.keys(pa.insumos).length - 4} itens
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Card Footer */}
                        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-emerald-400 font-semibold group-hover:underline">
                          <span>Ver Ficha Técnica & Escalas</span>
                          <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SEÇÃO 2: P.As EM IMPLANTAÇÃO & PROJETOS COM GARGALOS */}
              {(executivoSubTab === "todos" || executivoSubTab === "projetos") && (
                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-400" />
                        P.As em Implantação, Projetos & Bloqueios Corporativos (4 Demandas)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Projetos novos em estruturação, com esteira de progresso, gargalos departamentais e cronograma de Go-Live.
                      </p>
                    </div>
                  </div>

                  {/* QUADRO EXECUTIVO: ACOMPANHAMENTO DE COLETAS & INTEGRAÇÃO TMS */}
                  <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950/30 border border-blue-500/30 shadow-xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/40 flex items-center gap-1">
                            <Tag className="w-3 h-3 text-blue-400" />
                            Auditoria & Rastreio Operacional
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            Códigos Oficiais TMS Anjun
                          </span>
                        </div>
                        <h4 className="text-sm md:text-base font-black text-white flex items-center gap-2">
                          <Truck className="w-4 h-4 text-blue-400" />
                          Acompanhamento do Andamento das Coletas de Projetos
                        </h4>
                        <p className="text-xs text-slate-400">
                          Monitoramento em tempo real das coletas ativas e status das demandas integradas ao TMS.
                        </p>
                      </div>

                      <a
                        href="/coletas"
                        className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-900/30 transition-all flex items-center gap-1.5 shrink-0 self-start sm:self-center"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        Abrir Central de Coletas
                      </a>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                      {/* Card Olist */}
                      <div className="p-4 rounded-xl bg-slate-950/90 border border-emerald-500/40 relative overflow-hidden flex flex-col justify-between space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                              <Tag className="w-2.5 h-2.5" />
                              TMS #24355
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                              COLETAS ATIVAS
                            </span>
                          </div>
                          <h5 className="font-black text-white text-sm">Olist (Marketplace)</h5>
                          <p className="text-xs text-slate-300 mt-1">
                            Coletas diárias pontuais às <strong className="text-emerald-400 font-mono">16:00</strong> rodando normalmente.
                          </p>
                        </div>
                        <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
                          <span>Volume: ~1.000 pac/dia</span>
                          <span className="text-emerald-400 font-bold">100% no Prazo</span>
                        </div>
                      </div>

                      {/* Card ShopMulti */}
                      <div className="p-4 rounded-xl bg-slate-950/90 border border-rose-500/40 relative overflow-hidden flex flex-col justify-between space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                              <Tag className="w-2.5 h-2.5" />
                              TMS #24596
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                              🔴 COLETAS SUSPENSAS
                            </span>
                          </div>
                          <h5 className="font-black text-white text-sm">ShopMulti (PA Itinerante)</h5>
                          <p className="text-xs text-rose-300 font-semibold mt-1">
                            Kits móveis de TI suspensos pelo T.I com prazo de até 45 dias úteis.
                          </p>
                        </div>
                        <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
                          <span>Base: Itapevi/SP (SP-RR-001)</span>
                          <span className="text-amber-400 font-medium">Aguardando TI</span>
                        </div>
                      </div>

                      {/* Card Demais Demandas */}
                      <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 relative overflow-hidden flex flex-col justify-between space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800">
                              Renner: #24503
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              EM CADASTRAMENTO
                            </span>
                          </div>
                          <h5 className="font-black text-white text-sm">Bravium & Grupo Boticário</h5>
                          <p className="text-xs text-slate-400 mt-1">
                            Códigos TMS sendo formalizados junto ao Comercial e TI para início do rastreamento.
                          </p>
                        </div>
                        <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-500 flex items-center justify-between">
                          <span>Renner Cabreúva: TMS #24503</span>
                          <span className="text-slate-400">Demais: Em breve</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Matriz Departamental de Bloqueios */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* TI & Equipamentos */}
                    <div className="p-4 rounded-xl bg-slate-900/80 border border-rose-500/30 relative overflow-hidden">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          💻 T.I & Equipamentos
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          2 PAs Impactados
                        </span>
                      </div>
                      <p className="text-xs text-rose-300 font-semibold">
                        Equipamentos suspensos pelo T.I com prazo de até 45 dias úteis.
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                        Afeta: <strong className="text-slate-200">Bravium</strong> (PCs/Coletores/Paleteira) e <strong className="text-slate-200">Shopmult</strong> (Kit itinerante).
                      </p>
                      <div className="mt-2.5 pt-2 border-t border-slate-800 text-[10px] text-amber-400 font-medium">
                        🎯 Ação: Alinhar com TI/Almoxarifado priorização de compras.
                      </div>
                    </div>

                    {/* Segurança do Trabalho / SST */}
                    <div className="p-4 rounded-xl bg-slate-900/80 border border-rose-500/30 relative overflow-hidden">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          🦺 Segurança & Black Week (BW)
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Reprogramado p/ Dezembro
                        </span>
                      </div>
                      <p className="text-xs text-rose-300 font-semibold">
                        Falta de documentação (PGR/PCMSO) + Freeze de Black Week.
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                        Afeta: <strong className="text-slate-200">Grupo Boticário</strong>. Retorno do cliente: inviável em Outubro e GB não inicia novos parceiros em Novembro (BW); início em <strong className="text-amber-300">Dezembro/2026</strong>.
                      </p>
                      <div className="mt-2.5 pt-2 border-t border-slate-800 text-[10px] text-rose-400 font-medium">
                        🎯 Ação: Sanar PGR/PCMSO com Segurança em Nov para garantir Go-Live em Dezembro.
                      </div>
                    </div>

                    {/* RH / Gente & Gestão */}
                    <div className="p-4 rounded-xl bg-slate-900/80 border border-amber-500/30 relative overflow-hidden">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          👥 RH & Contratação
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          1 Demanda Aberta
                        </span>
                      </div>
                      <p className="text-xs text-amber-300 font-semibold">
                        Solicitação via Lark aberta para 2 funcionários.
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                        Afeta: <strong className="text-slate-200">Bravium</strong> (alocação de equipe operacional e liberação de acessos).
                      </p>
                      <div className="mt-2.5 pt-2 border-t border-slate-800 text-[10px] text-amber-400 font-medium">
                        🎯 Ação: Acompanhar recrutamento para coincidir c/ entrega de TI.
                      </div>
                    </div>

                    {/* Operação First Mile */}
                    <div className="p-4 rounded-xl bg-slate-900/80 border border-emerald-500/30 relative overflow-hidden">
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          🚚 Operação First Mile
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          100% Operacional
                        </span>
                      </div>
                      <p className="text-xs text-emerald-300 font-semibold">
                        Coletas diárias ativas e rodando pontualmente às 16:00.
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                        Atende: <strong className="text-slate-200">Olist</strong> (Marketplace com coletas diárias estáveis).
                      </p>
                      <div className="mt-2.5 pt-2 border-t border-slate-800 text-[10px] text-emerald-400 font-medium">
                        🎯 Status: Operação fluindo dentro dos SLAs acordados.
                      </div>
                    </div>
                  </div>

                  {/* Cards dos 4 Projetos com Esteira e Diagnóstico */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {listFiltered.map((item) => {
                      const steppers = getProjectExecutionStepper(item);
                      const isSuspenso = item.status === "Suspenso" || item.status === "Restrição/Pendente";
                      const isIniciado = item.status === "Iniciado" || item.status === "Concluído";
                      const isAndamento = item.status === "Em andamento" || item.status === "Em preparação";

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleOpenDetailModal(item)}
                          className={`p-5 rounded-2xl border transition-all cursor-pointer group shadow-xl relative overflow-hidden ${
                            isSuspenso
                              ? "bg-gradient-to-b from-slate-900 via-slate-900 to-rose-950/20 border-rose-500/40 hover:border-rose-400"
                              : isIniciado
                              ? "bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950/20 border-emerald-500/40 hover:border-emerald-400"
                              : "bg-gradient-to-b from-slate-900 via-slate-900 to-amber-950/20 border-amber-500/40 hover:border-amber-400"
                          }`}
                        >
                          {/* Card Header */}
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-mono font-bold text-slate-400 group-hover:text-white transition-colors">
                                  {item.codigo}
                                </span>
                                <span className="text-[10px] text-slate-500 font-medium">
                                  • {item.segmento || "Posto Avançado / FM"}
                                </span>
                                {item.cliente_id ? (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 flex items-center gap-1 shadow-sm" title="Código de Integração no TMS Anjun">
                                    <Tag className="w-2.5 h-2.5 text-blue-400" />
                                    TMS #{item.cliente_id}
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-500 bg-slate-950 border border-slate-800" title="Código TMS em processamento">
                                    TMS: Pendente
                                  </span>
                                )}
                              </div>
                              <h4 className="text-lg font-black text-white mt-1 group-hover:text-amber-300 transition-colors">
                                {item.cliente_nome}
                              </h4>
                            </div>

                            {/* Big Status Badge */}
                            <div>
                              {isSuspenso && (
                                <div className="px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-300 text-xs font-black flex items-center gap-1.5 shadow-lg shadow-rose-950/50">
                                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                                  🔴 SUSPENSO
                                </div>
                              )}
                              {isIniciado && (
                                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-black flex items-center gap-1.5 shadow-lg shadow-emerald-950/50">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                  🟢 EM OPERAÇÃO
                                </div>
                              )}
                              {isAndamento && (
                                <div className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-black flex items-center gap-1.5 shadow-lg shadow-amber-950/50">
                                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                  🟡 EM ANDAMENTO
                                </div>
                              )}
                              {!isSuspenso && !isIniciado && !isAndamento && (
                                <div className="px-3 py-1.5 rounded-xl bg-blue-500/20 border border-blue-500/50 text-blue-300 text-xs font-black">
                                  {item.status}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Metadados Operacionais em Pílulas */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-xs">
                            <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80">
                              <span className="text-[10px] text-slate-500 block">Localização</span>
                              <span className="font-bold text-slate-200 truncate block">
                                {item.cidade}/{item.estado}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80">
                              <span className="text-[10px] text-slate-500 block">Volume Previsto</span>
                              <span className="font-bold text-emerald-400">
                                {item.volume_estimado_diario ? `${item.volume_estimado_diario} pcts/dia` : "Em definição"}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80">
                              <span className="text-[10px] text-slate-500 block">Janela Operacional</span>
                              <span className="font-bold text-slate-200">
                                {item.horario_coleta_janela || "Flexível"}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80">
                              <span className="text-[10px] text-slate-500 block">Prazo / Go-Live</span>
                              <span className={`font-bold ${isSuspenso ? "text-rose-400" : isIniciado ? "text-emerald-400" : "text-amber-400"}`}>
                                {item.data_go_live_prevista || "A definir"}
                              </span>
                            </div>
                          </div>

                          {/* Bloco Executivo "Em que pé estamos" (Gargalo Direto) */}
                          <div className={`mt-3.5 p-3.5 rounded-xl border text-xs ${
                            isSuspenso
                              ? "bg-rose-950/20 border-rose-500/30 text-rose-200"
                              : isIniciado
                              ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-200"
                              : "bg-amber-950/20 border-amber-500/30 text-amber-200"
                          }`}>
                            <div className="flex items-center gap-1.5 font-bold mb-1">
                              {isSuspenso ? (
                                <>
                                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                                  <span className="text-rose-400 uppercase tracking-wide text-[11px]">Em que pé estamos / Bloqueio:</span>
                                </>
                              ) : isIniciado ? (
                                <>
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                  <span className="text-emerald-400 uppercase tracking-wide text-[11px]">Em que pé estamos / Operação:</span>
                                </>
                              ) : (
                                <>
                                  <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                                  <span className="text-amber-400 uppercase tracking-wide text-[11px]">Em que pé estamos / Gargalo:</span>
                                </>
                              )}
                            </div>
                            <p className="leading-relaxed text-slate-200 font-medium">
                              {item.parecer_operacional || item.observacoes_comercial}
                            </p>

                            {item.parecer_gestor_ressalvas && (
                              <div className="mt-2 pt-2 border-t border-slate-800/80 text-[11px] text-slate-300">
                                <strong className="text-amber-400">Ressalva Estratégica: </strong>
                                {item.parecer_gestor_ressalvas}
                              </div>
                            )}
                          </div>

                          {/* Linha do Tempo Visual / Stepper de 5 Etapas */}
                          <div className="mt-4 pt-3.5 border-t border-slate-800/80">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2.5">
                              Esteira de Implantação & Progresso
                            </span>

                            <div className="grid grid-cols-5 gap-1.5 text-center">
                              {steppers.map((st, idx) => (
                                <div
                                  key={idx}
                                  className={`p-2 rounded-lg border flex flex-col items-center justify-between min-h-[58px] ${
                                    st.status === "done"
                                      ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                                      : st.status === "live"
                                      ? "bg-emerald-500 text-slate-950 font-black border-emerald-400 shadow-md shadow-emerald-500/30"
                                      : st.status === "warning"
                                      ? "bg-amber-950/40 border-amber-500/50 text-amber-300 font-bold"
                                      : st.status === "danger"
                                      ? "bg-rose-950/40 border-rose-500/50 text-rose-300 font-bold"
                                      : "bg-slate-950/60 border-slate-800 text-slate-500"
                                  }`}
                                >
                                  <div className="text-[9px] uppercase font-bold tracking-tight">
                                    {st.name}
                                  </div>
                                  <div className="text-[10px] leading-tight font-medium mt-1 line-clamp-2">
                                    {st.desc}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Card Footer */}
                          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-500">Comercial:</span>
                              <span className="font-semibold text-slate-300">{item.vendedor_comercial}</span>
                            </div>

                            <span className="text-emerald-400 font-semibold group-hover:underline flex items-center gap-1 text-[11px]">
                              Ver Dossiê Completo
                              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW MODE 1: KANBAN BOARD */}
          {viewMode === "kanban" && (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 overflow-x-auto pb-4">
              {STAGES.map((stage) => {
                const stageItems = listFiltered.filter(s => {
                  if (stage.id === "Suspenso") return s.status === "Suspenso";
                  if (stage.id === "Concluído") return s.status === "Concluído" || s.status === "Iniciado";
                  if (stage.id === "Em preparação") return s.status === "Em preparação" || s.status === "Em andamento";
                  return s.status === stage.id;
                });
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
                            <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${getStageInfo(item.status)?.color}`}>
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
            <div className="space-y-6 max-w-5xl mx-auto pb-10">
              
              {/* Banner de Cabeçalho da Governança */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-purple-950/30 border border-purple-500/30 shadow-2xl space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/40">
                        Diretriz Oficial de Governança
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        Aprovado em 26/10/2026 • Operação First Mile & Projetos
                      </span>
                    </div>
                    <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2.5">
                      <Workflow className="w-6 h-6 text-purple-400" />
                      Governança Oficial de Entrada de Solicitações (P.A & Pickup)
                    </h2>
                    <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
                      Protocolo mandatório de triagem, viabilidade operacional com <strong>Wagner</strong>, escalonamento com <strong>Luzia</strong>, devolução fundamentada ao Comercial e matriz de focais responsáveis.
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-center shrink-0 min-w-[160px]">
                    <span className="text-[10px] text-slate-400 block font-medium">Orquestrador do Fluxo</span>
                    <span className="text-xs font-bold text-blue-400 flex items-center justify-center gap-1 mt-0.5">
                      <UserCheck className="w-3.5 h-3.5" />
                      @Diego Mandarino
                    </span>
                    <span className="text-[10px] text-slate-500">Projetos First Mile</span>
                  </div>
                </div>

                {/* Pipeline Sequencial Visual do Fluxo */}
                <div className="pt-4 border-t border-slate-800/80">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 block mb-3">
                    Fluxograma Sequencial de Tomada de Decisão:
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 relative">
                    {/* Passo 1 */}
                    <div className="p-4 rounded-xl bg-slate-950/90 border border-blue-500/30 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            Passo 1 • Entrada
                          </span>
                          <span className="text-slate-500 text-[10px]">Comercial</span>
                        </div>
                        <h4 className="font-bold text-white text-xs">Nova Solicitação</h4>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                          Demanda emitida pelo Comercial (independente de ser P.A ou Pickup).
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-blue-400 font-mono">
                        ➔ Triagem: @Diego Mandarino
                      </div>
                    </div>

                    {/* Passo 2 */}
                    <div className="p-4 rounded-xl bg-slate-950/90 border border-emerald-500/30 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Passo 2 • 1º Estudo
                          </span>
                          <span className="text-emerald-400 font-bold text-[10px]">Wagner</span>
                        </div>
                        <h4 className="font-bold text-white text-xs">Viabilidade FM</h4>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                          Wagner faz o estudo técnico para verificar se a Operação FM consegue atender.
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-300 space-y-0.5">
                        <span className="text-emerald-400 block font-semibold">🟢 Se Viável: Segue p/ Implantação</span>
                        <span className="text-amber-400 block font-semibold">🔴 Se Negativo: Escala p/ Transporte</span>
                      </div>
                    </div>

                    {/* Passo 3 */}
                    <div className="p-4 rounded-xl bg-slate-950/90 border border-amber-500/30 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Passo 3 • Escalonamento
                          </span>
                          <span className="text-amber-400 font-bold text-[10px]">Luzia</span>
                        </div>
                        <h4 className="font-bold text-white text-xs">Estudo de Transporte</h4>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                          Luzia avalia encaixe na malha rodoviária, veículos parceiros e rotas de transferência.
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-300 space-y-0.5">
                        <span className="text-emerald-400 block font-semibold">🟢 Se Viável: Atendimento via Frota</span>
                        <span className="text-rose-400 block font-semibold">🔴 Se Negativo: Inviabilidade Total</span>
                      </div>
                    </div>

                    {/* Passo 4 */}
                    <div className="p-4 rounded-xl bg-slate-950/90 border border-rose-500/30 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            Passo 4 • Conclusão
                          </span>
                          <span className="text-rose-400 font-bold text-[10px]">Comercial</span>
                        </div>
                        <h4 className="font-bold text-white text-xs">Devolução ao Comercial</h4>
                        <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                          Caso Wagner e Luzia deem parecer negativo, Diego formaliza a devolução técnica ao Comercial.
                        </p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-rose-400 font-mono">
                        📝 Motivo técnico registrado no sistema
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Matriz de Critérios: PA vs. Pickup */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                
                {/* CARD 1: POSTO DE ATENDIMENTO (P.A) */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-purple-500/30 shadow-xl space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        Modelo de Operação Dedicado
                      </span>
                      <h3 className="text-lg font-black text-white mt-1 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-purple-400" />
                        P.A (Posto de Atendimento)
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Exige análise mandatória dos <strong>3 Pilares Estruturais</strong>:
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-purple-400 bg-purple-950/60 px-2 py-1 rounded border border-purple-500/30">
                      3 Pilares
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Pilar 1 */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          <Laptop className="w-4 h-4 text-emerald-400" />
                          1. ESTRUTURA (Equipamentos & Mobiliário)
                        </span>
                        <span className="text-[10px] text-slate-400">PDA, Desktop, Mesa, Impressora</span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        Verificar se a base possui computadores, coletores PDA, mesas de triagem e insumos.
                      </p>
                      <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-amber-300 flex items-center gap-1">
                        <span>⚠️ <strong>Caso NÃO tenhamos:</strong> Acionar e alinhar com</span>
                        <span className="text-white font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">@Ryan, @Link e @Gabriel</span>
                      </div>
                    </div>

                    {/* Pilar 2 */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          <Truck className="w-4 h-4 text-blue-400" />
                          2. FROTA (Veículo de Coleta / Transferência)
                        </span>
                        <span className="text-[10px] text-slate-400">VUC, Fiorino, Caminhão</span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        Verificar disponibilidade de veículo para coleta nas janelas acordadas e transferência ao CD.
                      </p>
                      <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-blue-300 flex items-center gap-1">
                        <span>🎯 <strong>Validação com:</strong></span>
                        <span className="text-white font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">@Wagner</span>
                        <span>ou</span>
                        <span className="text-white font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">@Luzia</span>
                      </div>
                    </div>

                    {/* Pilar 3 */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-purple-400" />
                          3. MÃO DE OBRA (Pessoas / Operadores)
                        </span>
                        <span className="text-[10px] text-slate-400">Escala & Turnos</span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        Dimensionar e alocar operadores dedicados para recebimento, conferência e expedição no P.A.
                      </p>
                      <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-purple-300 flex items-center gap-1">
                        <span>🎯 <strong>Validação e alocação com:</strong></span>
                        <span className="text-white font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">@Wallace</span>
                        <span>(Gente & Gestão / RH)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* CARD 2: PICKUP (COLETA EXTERNA / DROPOFF) */}
                <div className="p-5 rounded-2xl bg-slate-900 border border-emerald-500/30 shadow-xl space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Modelo de Coleta Externa
                      </span>
                      <h3 className="text-lg font-black text-white mt-1 flex items-center gap-2">
                        <Package className="w-5 h-5 text-emerald-400" />
                        Pickup (Coleta / Coletas Externas)
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Exige análise mandatória de <strong>2 Pilares Operacionais</strong>:
                      </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded border border-emerald-500/30">
                      2 Pilares
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Pilar 1 */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          <Laptop className="w-4 h-4 text-emerald-400" />
                          1. ESTRUTURA (Equipamento de Bipagem)
                        </span>
                        <span className="text-[10px] text-emerald-400 font-mono font-bold">PDA Obrigatório</span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        Validar disponibilidade de <strong>PDA (Coletor Zebra / Scanner Android)</strong> devidamente configurado com perfil de coleta e internet/chip ativo.
                      </p>
                      <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                        Caso não tenhamos coletor em estoque: alinhar suprimento com <strong>Ryan, Link e Gabriel</strong>.
                      </div>
                    </div>

                    {/* Pilar 2 */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          <Truck className="w-4 h-4 text-blue-400" />
                          2. FROTA (Veículo & Janela de Rota)
                        </span>
                        <span className="text-[10px] text-blue-400 font-mono font-bold">Encaixe em Malha</span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        Verificar se a rota do motorista comporta a janela horária solicitada pelo cliente e o volume diário estimado.
                      </p>
                      <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] text-blue-300 flex items-center gap-1">
                        <span>🎯 <strong>Validação com:</strong></span>
                        <span className="text-white font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">@Wagner</span>
                        <span>ou</span>
                        <span className="text-white font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">@Luzia</span>
                      </div>
                    </div>

                    {/* Box Comparativo Resumo */}
                    <div className="p-3.5 rounded-xl bg-slate-950/60 border border-emerald-500/20 text-xs space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">
                        Diferença Chave vs. P.A:
                      </span>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        Na modalidade <strong>Pickup</strong>, <em>não há necessidade de contratação de mão de obra fixa (Wallace)</em> nem montagem de posto físico (Desktop/Mesas) no galpão do cliente. O foco é estritamente <strong>PDA + Rota de Coleta</strong>.
                      </p>
                    </div>
                  </div>
                </div>

              </div>

              {/* Matriz de Focais e Papéis no Fluxo */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-400" />
                    Diretório Oficial de Focais & Escopos de Responsabilidade
                  </h3>
                  <span className="text-[10px] text-slate-500 font-mono">Governança Anjun</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                  {/* Diego */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="font-bold text-blue-400 block">@Diego Mandarino</span>
                    <span className="text-[10px] text-slate-400 block">Projetos First Mile</span>
                    <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                      Recepção comercial, triagem primária, orquestração do estudo e devolução técnica fundamentada.
                    </p>
                  </div>

                  {/* Wagner */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="font-bold text-emerald-400 block">@Wagner</span>
                    <span className="text-[10px] text-slate-400 block">Operação First Mile</span>
                    <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                      1º Estudo de viabilidade operacional e avaliação primária de frota para P.A e Pickup.
                    </p>
                  </div>

                  {/* Luzia */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="font-bold text-amber-400 block">@Luzia</span>
                    <span className="text-[10px] text-slate-400 block">Transportes & Malha</span>
                    <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                      2º Estudo de viabilidade: acionada em caso negativo do Wagner para buscar alternativas de frota e rotas.
                    </p>
                  </div>

                  {/* Ryan, Link e Gabriel */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="font-bold text-purple-400 block">@Ryan, @Link & @Gabriel</span>
                    <span className="text-[10px] text-slate-400 block">T.I & Infraestrutura / Compras</span>
                    <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                      Suprimento e disponibilização de hardware (PDAs, Desktops, PCs) e mobiliário (Mesas) para P.As.
                    </p>
                  </div>

                  {/* Wallace */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="font-bold text-indigo-400 block">@Wallace</span>
                    <span className="text-[10px] text-slate-400 block">Gente & Gestão / RH Operações</span>
                    <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                      Recrutamento, contratação, escala de trabalho e alocação de mão de obra para P.As.
                    </p>
                  </div>

                  {/* Comercial */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                    <span className="font-bold text-rose-400 block">Time Comercial</span>
                    <span className="text-[10px] text-slate-400 block">Vendas & Contratos</span>
                    <p className="text-[11px] text-slate-300 mt-1 leading-snug">
                      Origem da solicitação de demanda e receptor da aprovação final com Go-Live ou devolução técnica.
                    </p>
                  </div>
                </div>
              </div>

              {/* Caixa de Regra de Ouro */}
              <div className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider">
                    Regra de Ouro da Governança Anjun
                  </h4>
                  <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                    Nenhuma solicitação comercial pode ser devolvida ou dada como inviável sem antes passar pela validação de transporte na pessoa da <strong>Luzia</strong>. Somente se <strong>ambos (Wagner e Luzia)</strong> confirmarem que não temos como operar é que o fluxo encerra com a devolução formal ao Comercial contendo justificativa técnica registrada no sistema.
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
              {/* Seletor de Modelo de Operação conforme Governança */}
              <div className="p-3.5 rounded-xl bg-slate-950/80 border border-purple-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Workflow className="w-4 h-4 text-purple-400" />
                    Modelo de Operação (Governança FM)
                  </span>
                  <span className="text-[10px] text-purple-300 font-mono">
                    Triagem: @Diego ➔ Wagner (FM) ➔ Luzia (Transp.)
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setFormNovo({...formNovo, segmento: "PA"})}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      formNovo.segmento === "PA"
                        ? "bg-purple-950/40 border-purple-500 text-white font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="block font-black text-xs text-purple-300">🏢 P.A (Posto de Atendimento)</span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block leading-tight">
                      Pilares: Estrutura (Ryan/Link/Gabriel), Frota (Wagner/Luzia) e Mão de Obra (Wallace).
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormNovo({...formNovo, segmento: "Pickup"})}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      formNovo.segmento === "Pickup"
                        ? "bg-emerald-950/40 border-emerald-500 text-white font-bold"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="block font-black text-xs text-emerald-300">🚚 Pickup (Coleta)</span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block leading-tight">
                      Pilares: Estrutura (PDA) e Frota de Coleta (Wagner/Luzia).
                    </span>
                  </button>
                </div>
              </div>

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
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStageInfo(selectedItem.status)?.color}`}>
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
                      <span className="text-slate-500 block">Código TMS Anjun:</span>
                      {selectedItem.cliente_id ? (
                        <span className="font-mono font-bold text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-500/30 inline-flex items-center gap-1 mt-0.5">
                          <Tag className="w-3 h-3 text-blue-400" />
                          #{selectedItem.cliente_id}
                        </span>
                      ) : (
                        <span className="font-mono text-slate-500 italic">Pendente de Código</span>
                      )}
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
                  {/* Card Oficial de Governança */}
                  <div className="p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-slate-900 to-slate-950 border border-purple-500/30 text-xs space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <Workflow className="w-4 h-4 text-purple-400" />
                        Diretriz Oficial de Governança (FM & Transportes)
                      </span>
                      <span className="text-[10px] text-purple-300 font-mono">
                        Protocolo Aprovado
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                      <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                        <span className="text-[10px] text-emerald-400 block font-bold">1º Estudo: Wagner (FM)</span>
                        <span className="text-slate-300">Avalia viabilidade operacional e frota primária.</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                        <span className="text-[10px] text-amber-400 block font-bold">2º Estudo: Luzia (Transportes)</span>
                        <span className="text-slate-300">Se Wagner for negativo, busca encaixe em malha/rotas.</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                        <span className="text-[10px] text-rose-400 block font-bold">Inviabilidade Total:</span>
                        <span className="text-slate-300">Se ambos reprovarem, devolve com parecer ao Comercial.</span>
                      </div>
                    </div>
                    
                    {/* Alinhamento de Focais */}
                    <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-slate-400">
                      <div>
                        <strong className="text-purple-300">Se P.A: </strong>
                        Estrutura (se faltar, ver c/ <span className="text-slate-200 font-semibold">Ryan, Link, Gabriel</span>) • Frota (<span className="text-slate-200 font-semibold">Wagner / Luzia</span>) • Mão de Obra (<span className="text-slate-200 font-semibold">Wallace</span>).
                      </div>
                      <div>
                        <strong className="text-emerald-300">Se Pickup: </strong>
                        Estrutura (PDA) • Frota (<span className="text-slate-200 font-semibold">Wagner / Luzia</span>).
                      </div>
                    </div>
                  </div>

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

      
      {/* MODAL 3: FICHA TÉCNICA E ESCALAS DO P.A ATIVO */}
      {selectedPAAtivo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
            
            {/* Header */}
            <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase tracking-wider bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                      Posto de Atendimento Ativo
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-500" />
                      {selectedPAAtivo.local || `${selectedPAAtivo.cidade} / ${selectedPAAtivo.estado}`}
                    </span>
                  </div>
                  <h3 className="text-xl font-black text-white mt-0.5 flex items-center gap-2">
                    {selectedPAAtivo.nome}
                    {selectedPAAtivo.titulo_completo && selectedPAAtivo.titulo_completo !== selectedPAAtivo.nome && (
                      <span className="text-xs font-normal text-slate-400">({selectedPAAtivo.titulo_completo})</span>
                    )}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  {selectedPAAtivo.status_operacional.toUpperCase()}
                </span>
                <button 
                  onClick={() => setSelectedPAAtivo(null)} 
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              
              {/* 4 Indicadores Rápidos */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block font-medium">Volumetria Operada</span>
                  <span className="text-lg font-black text-emerald-400 mt-0.5 block">{selectedPAAtivo.volumetria}</span>
                  <span className="text-[10px] text-slate-500">pacotes / dia médio</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block font-medium">Horário de Corte</span>
                  <span className="text-lg font-black text-white mt-0.5 block truncate">{selectedPAAtivo.horario_corte || "Regular"}</span>
                  <span className="text-[10px] text-slate-500">cut-off de expedição</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block font-medium">Equipe Escalada</span>
                  <span className="text-lg font-black text-blue-400 mt-0.5 block">{selectedPAAtivo.total_operadores} colaboradores</span>
                  <span className="text-[10px] text-slate-500">efetivo dedicado</span>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block font-medium">Responsável</span>
                  <span className="text-sm font-bold text-slate-200 mt-1 block truncate">{selectedPAAtivo.responsavel || "Supervisor Designado"}</span>
                  <span className="text-[10px] text-slate-500">{selectedPAAtivo.cargo_responsavel || "Operações"}</span>
                </div>
              </div>

              {/* Escala Geral */}
              {selectedPAAtivo.escala_operacao && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/30 to-slate-950 border border-emerald-500/20 flex items-start gap-3">
                  <Clock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Regime & Escala de Atendimento</h4>
                    <p className="text-sm text-slate-200 font-semibold mt-0.5">{selectedPAAtivo.escala_operacao}</p>
                    {selectedPAAtivo.observacao_executiva && (
                      <p className="text-xs text-slate-400 mt-1 italic">{selectedPAAtivo.observacao_executiva}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Operadores e Turnos */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    Escala Detalhada de Operadores ({selectedPAAtivo.operadores?.length || 0})
                  </h4>
                  <span className="text-[11px] text-slate-500">Mapeamento Oficial de P.A</span>
                </div>

                {selectedPAAtivo.operadores && selectedPAAtivo.operadores.length > 0 ? (
                  <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-4">#</th>
                          <th className="py-2.5 px-4">Operador Alocado</th>
                          <th className="py-2.5 px-4">Escala / Turno de Trabalho</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {selectedPAAtivo.operadores.map((op, i) => (
                          <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-2.5 px-4 text-slate-500 font-mono text-[11px]">{i + 1}</td>
                            <td className="py-2.5 px-4 font-bold text-slate-200 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400/80" />
                              {op.nome}
                            </td>
                            <td className="py-2.5 px-4 text-slate-300 font-medium">
                              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                                {op.escala}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic p-3 rounded-lg bg-slate-950 border border-slate-800">
                    Equipe alocada em regime compartilhado ou conforme demanda diária.
                  </p>
                )}
              </div>

              {/* Equipamentos e EPIs Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Equipamentos & Insumos */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-emerald-400" />
                    Equipamentos & Insumos em Campo
                  </h4>
                  {selectedPAAtivo.insumos && Object.keys(selectedPAAtivo.insumos).length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(selectedPAAtivo.insumos).map(([k, v]) => (
                        <div key={k} className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-center justify-between text-xs">
                          <span className="text-slate-400 text-[11px] truncate">{k}</span>
                          <span className="font-bold text-emerald-400 font-mono ml-2 shrink-0">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">Sem equipamentos registrados na planilha.</p>
                  )}
                </div>

                {/* EPIs & Uniformes */}
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    Uniformes & EPIs Fornecidos
                  </h4>
                  {selectedPAAtivo.epis && Object.keys(selectedPAAtivo.epis).length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(selectedPAAtivo.epis).map(([k, v]) => (
                        <div key={k} className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 flex items-center justify-between text-xs">
                          <span className="text-slate-400 text-[11px] truncate">{k}</span>
                          <span className="font-bold text-blue-400 font-mono ml-2 shrink-0">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">Sem EPIs específicos registrados na planilha.</p>
                  )}
                </div>

              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-950 border-t border-slate-800 flex justify-between items-center shrink-0">
              <span className="text-xs text-slate-500 font-mono">
                Dados integrados da planilha operacional: Mapeamento dos PAs.xlsx
              </span>
              <button
                onClick={() => setSelectedPAAtivo(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition-colors"
              >
                Fechar Ficha Técnica
              </button>
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
