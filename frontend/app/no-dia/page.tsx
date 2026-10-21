"use client";

import React, { useState, useEffect, useMemo } from "react";
import { 
  Activity, 
  RefreshCw, 
  UploadCloud, 
  Search, 
  MapPin, 
  Building2, 
  Package, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  TrendingUp, 
  ChevronLeft, 
  ChevronRight,
  Filter,
  Layers,
  Sparkles,
  Store,
  Warehouse,
  ArrowUpDown,
  Navigation,
  X
} from "lucide-react";
import { 
  fetchColetasNoDia, 
  fetchDiasColetas, 
  otimizarPlanilha,
  ColetasNoDiaResponse, 
  ColetasNoDiaPonto,
  DropoffSemMd,
  AlertaOperacionalNoDia
} from "../../lib/api";
import IngestaoLogPanel from "../../components/IngestaoLogPanel";

export default function NoDiaPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ColetasNoDiaResponse | null>(null);
  const [listaDias, setListaDias] = useState<string[]>([]);
  const [diaSelecionado, setDiaSelecionado] = useState<string>("");
  
  // Abas de Visualização
  const [abaAtiva, setAbaAtiva] = useState<"pontos" | "dropoffs">("pontos");

  // Filtros
  const [search, setSearch] = useState("");
  const [filtroRegional, setFiltroRegional] = useState("TODOS");
  const [filtroTipo, setFiltroTipo] = useState("TODOS");
  const [filtroStatus, setFiltroStatus] = useState("TODOS");

  // Paginação
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [paginaDropoffs, setPaginaDropoffs] = useState(1);
  const itensPorPagina = 50;

  

  // Inicializar datas (com auto-recuperação caso o backend esteja iniciando)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    async function init() {
      try {
        const resDias = await fetchDiasColetas();
        if (!unmounted && resDias.dias && resDias.dias.length > 0) {
          setListaDias(resDias.dias);
          setDiaSelecionado(resDias.dia_recente || resDias.dias[0]);
        }
      } catch (err) {
        console.warn("Aguardando conexão com o Backend para carregar datas...", err);
        if (!unmounted) {
          timer = setTimeout(init, 3000);
        }
      }
    }
    init();

    return () => {
      unmounted = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Carregar dados da página "No Dia"
  const carregarDados = async (diaAlvo?: string) => {
    setLoading(true);
    try {
      const res = await fetchColetasNoDia({
        dia: diaAlvo || diaSelecionado,
        regional: filtroRegional,
        tipo_ponto: filtroTipo,
        status_filtro: filtroStatus,
        search: search
      });
      setData(res);
      if (res.dia_selecionado && !diaSelecionado) {
        setDiaSelecionado(res.dia_selecionado);
      }
    } catch (err) {
      console.warn("Aviso ao carregar dados do dia:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (diaSelecionado) {
      carregarDados(diaSelecionado);
    }
  }, [diaSelecionado, filtroRegional, filtroTipo, filtroStatus]);

  // Busca com debounce leve
  useEffect(() => {
    const timer = setTimeout(() => {
      carregarDados();
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Lista de pontos paginada
  const pontos = data?.mds || [];
  const totalPaginas = Math.ceil(pontos.length / itensPorPagina) || 1;
  const pontosPaginados = useMemo(() => {
    const inicio = (paginaAtual - 1) * itensPorPagina;
    return pontos.slice(inicio, inicio + itensPorPagina);
  }, [pontos, paginaAtual]);

  // Lista de drop-offs sem ponto definida
  const dropoffs = data?.dropoffs_sem_md || [];
  const dropoffsFiltrados = useMemo(() => {
    if (!search.trim()) return dropoffs;
    const q = search.toLowerCase();
    return dropoffs.filter((d) => 
      d.merchant_nome.toLowerCase().includes(q) ||
      d.cep.includes(q) ||
      d.cidade.toLowerCase().includes(q) ||
      d.estado.toLowerCase().includes(q) ||
      d.md_provavel_codigo.toLowerCase().includes(q) ||
      d.md_provavel_nome.toLowerCase().includes(q)
    );
  }, [dropoffs, search]);

  const totalPaginasDropoffs = Math.ceil(dropoffsFiltrados.length / itensPorPagina) || 1;
  const dropoffsPaginados = useMemo(() => {
    const inicio = (paginaDropoffs - 1) * itensPorPagina;
    return dropoffsFiltrados.slice(inicio, inicio + itensPorPagina);
  }, [dropoffsFiltrados, paginaDropoffs]);

  // Regionais únicas
  const regionaisUnicas = useMemo(() => {
    if (!data?.mds) return [];
    const setR = new Set(data.mds.map((m) => m.regional).filter(Boolean));
    return Array.from(setR).sort();
  }, [data]);

  
  const kpis = data?.kpis;

  return (
    <div className="space-y-6">
      {/* ── CABEÇALHO DA PÁGINA ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0C101B] border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-wide flex items-center gap-2.5">
              <Activity className="w-6 h-6 text-emerald-400" />
              No Dia — Operação em Tempo Real (D0)
            </h1>
            <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> TEMPO REAL
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Monitoramento vivo da rede completa ANJUN. Pontos vazios são preservados para indicar previsão e pacotes criados são alocados aos MDs mais próximos via inteligência de CEP.
          </p>
        </div>

        {/* CONTROLES DO CABEÇALHO */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Seletor de Data */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
            <span className="text-[11px] text-slate-400 font-semibold">Data Base:</span>
            <select
              value={diaSelecionado}
              onChange={(e) => {
                setDiaSelecionado(e.target.value);
                setPaginaAtual(1);
              }}
              className="bg-transparent text-xs text-emerald-400 font-bold focus:outline-none cursor-pointer"
            >
              {listaDias.map((d) => (
                <option key={d} value={d} className="bg-slate-900 text-white">
                  {d} {d === listaDias[0] ? "(Mais Recente)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Botão de Atualizar Foto Operacional */}
          

          {/* Botão de Recarregar */}
          <button
            onClick={() => carregarDados()}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Recarregar dados"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── CARDS DE KPIS EXECUTIVOS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Previsto */}
        <div className="bg-[#0C101B] border border-slate-800/80 p-4 rounded-xl shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1 font-medium">
            <span>Total Previsto (D0)</span>
            <Package className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight">
            {kpis ? kpis.total_previstos.toLocaleString("pt-BR") : "..."}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Criação Direta + Preditiva</div>
        </div>

        {/* Bipados */}
        <div className="bg-[#0C101B] border border-slate-800/80 p-4 rounded-xl shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1 font-medium">
            <span>Bipados Agora</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400 tracking-tight">
            {kpis ? kpis.total_bipados.toLocaleString("pt-BR") : "..."}
          </div>
          <div className="text-[10px] text-emerald-300/80 mt-1">
            {kpis ? `${kpis.ritmo_geral_pct}% da meta total` : "..."}
          </div>
        </div>

        {/* Pendentes */}
        <div className="bg-[#0C101B] border border-slate-800/80 p-4 rounded-xl shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1 font-medium">
            <span>Pendentes</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-400 tracking-tight">
            {kpis ? kpis.total_pendentes.toLocaleString("pt-BR") : "..."}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Aguardando chegada no MD</div>
        </div>

        {/* Backlog */}
        <div className="bg-[#0C101B] border border-slate-800/80 p-4 rounded-xl shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1 font-medium">
            <span>Backlog Acumulado</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-rose-400 tracking-tight">
            {kpis ? kpis.total_backlog.toLocaleString("pt-BR") : "..."}
          </div>
          <div className="text-[10px] text-rose-300/80 mt-1">
            {kpis ? `${kpis.mds_alerta} MDs em alerta` : "..."}
          </div>
        </div>

        {/* Rede Cadastrada */}
        <div className="bg-[#0C101B] border border-slate-800/80 p-4 rounded-xl shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1 font-medium">
            <span>Rede Cadastrada</span>
            <Building2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-indigo-300 tracking-tight">
            {kpis ? kpis.total_mds_rede : "..."}
          </div>
          <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5">
            <span className="text-emerald-400 font-semibold">{kpis?.mds_operando || 0} ativos</span>
            <span>•</span>
            <span className="text-amber-400 font-semibold">{kpis?.mds_aguardando || 0} aguard.</span>
          </div>
        </div>

        {/* Drop-off Preditivo por CEP */}
        <div className="bg-[#0C101B] border border-slate-800/80 p-4 rounded-xl shadow-md">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1 font-medium">
            <span>Drop-off CEP</span>
            <Sparkles className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-xl font-bold text-teal-300 tracking-tight">
            {kpis ? kpis.vol_dropoff_preditivo_cep.toLocaleString("pt-BR") : "..."}
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Alocados por proximidade</div>
        </div>
      </div>

      {/* ── PAINEL DE ALERTAS OPERACIONAIS VIVOS (D0) ── */}
      {data?.alertas_operacionais && data.alertas_operacionais.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Alertas Operacionais & Roteirização em Tempo Real</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">
              {data.alertas_operacionais.length} notificações ativas
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.alertas_operacionais.map((alerta, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl border flex items-start gap-3 shadow-md transition-all ${
                  alerta.tipo === "COLETA_PENDENTE"
                    ? "bg-amber-950/20 border-amber-500/30 text-amber-200"
                    : "bg-teal-950/20 border-teal-500/30 text-teal-200"
                }`}
              >
                <div className={`p-2 rounded-lg shrink-0 ${
                  alerta.tipo === "COLETA_PENDENTE"
                    ? "bg-amber-500/20 text-amber-400"
                    : "bg-teal-500/20 text-teal-400"
                }`}>
                  {alerta.tipo === "COLETA_PENDENTE" ? (
                    <Clock className="w-4 h-4" />
                  ) : (
                    <Navigation className="w-4 h-4" />
                  )}
                </div>
                <div className="space-y-1 text-xs flex-1 min-w-0">
                  <div className="font-bold flex items-center justify-between gap-2">
                    <span className="truncate">{alerta.titulo}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-900/80 border border-slate-700 whitespace-nowrap">
                      {alerta.volume.toLocaleString("pt-BR")} pacotes
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">{alerta.mensagem}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SELETOR DE ABAS OPERACIONAIS ── */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => {
            setAbaAtiva("pontos");
            setPaginaAtual(1);
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            abaAtiva === "pontos"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-950/30"
              : "bg-slate-900/40 text-slate-400 hover:text-white border border-transparent"
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Rede de MDs & HUBs</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 font-semibold">
            {pontos.length}
          </span>
        </button>

        <button
          onClick={() => {
            setAbaAtiva("dropoffs");
            setPaginaDropoffs(1);
          }}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            abaAtiva === "dropoffs"
              ? "bg-teal-500/15 text-teal-400 border border-teal-500/30 shadow-lg shadow-teal-950/30"
              : "bg-slate-900/40 text-slate-400 hover:text-white border border-transparent"
          }`}
        >
          <Sparkles className="w-4 h-4 text-teal-400" />
          <span>Drop-offs sem Ponto & Roteirização Preditiva</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-teal-500/20 text-teal-300 font-semibold border border-teal-500/30">
            {dropoffs.length} agrup. ({kpis?.total_dropoffs_sem_md ? kpis.total_dropoffs_sem_md.toLocaleString("pt-BR") : 0} pacotes)
          </span>
        </button>
      </div>

      {/* ── BARRA DE FILTROS ── */}
      <div className="bg-[#0C101B] border border-slate-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[300px]">
          {/* Campo de Busca */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPaginaAtual(1);
                setPaginaDropoffs(1);
              }}
              placeholder={
                abaAtiva === "pontos"
                  ? "Buscar por código MD, nome, cidade ou UF..."
                  : "Buscar por seller, CEP, cidade, UF ou MD provável..."
              }
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          {/* Filtro Regional */}
          <select
            value={filtroRegional}
            onChange={(e) => {
              setFiltroRegional(e.target.value);
              setPaginaAtual(1);
            }}
            className="bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="TODOS">Todas Regionais</option>
            {regionaisUnicas.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          {abaAtiva === "pontos" && (
            <>
              {/* Filtro Tipo de Ponto */}
              <select
                value={filtroTipo}
                onChange={(e) => {
                  setFiltroTipo(e.target.value);
                  setPaginaAtual(1);
                }}
                className="bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="TODOS">Todos os Tipos</option>
                <option value="MD">Minidrops (MDs)</option>
                <option value="HUB">HUBs de Transferência</option>
                <option value="GALPAO">Galpões / CDs</option>
              </select>

              {/* Filtro Status Operacional */}
              <select
                value={filtroStatus}
                onChange={(e) => {
                  setFiltroStatus(e.target.value);
                  setPaginaAtual(1);
                }}
                className="bg-slate-900 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="TODOS">Todos os Status</option>
                <option value="Operação Ativa">🟢 Operação Ativa</option>
                <option value="Aguardando 1ª Bipagem">🟡 Aguardando 1ª Bipagem</option>
                <option value="Alerta de Backlog">🔴 Alerta de Backlog</option>
                <option value="Sem Previsão Hoje">⚪ Sem Previsão Hoje</option>
              </select>
            </>
          )}
        </div>

        {/* Contador de Registros */}
        <div className="text-xs text-slate-400 font-medium">
          {abaAtiva === "pontos" ? (
            <>Exibindo <span className="text-white font-bold">{pontos.length}</span> unidades na malha</>
          ) : (
            <>Exibindo <span className="text-teal-400 font-bold">{dropoffsFiltrados.length}</span> grupos de drop-offs sem ponto</>
          )}
        </div>
      </div>

      {/* ── ABA 1: TABELA OPERACIONAL DE MDS E PONTOS (SEM EXCLUIR VAZIOS) ── */}
      {abaAtiva === "pontos" && (
        <div className="bg-[#0C101B] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-300 border-b border-slate-800 font-semibold tracking-wide">
                  <th className="py-3 px-4">Unidade / Ponto</th>
                  <th className="py-3 px-3">Tipo</th>
                  <th className="py-3 px-3">Localização</th>
                  <th className="py-3 px-3 text-right">Previsto Total</th>
                  <th className="py-3 px-3 text-right">Bipados Agora</th>
                  <th className="py-3 px-3 text-right">Pendentes</th>
                  <th className="py-3 px-4 text-center">Ritmo da Operação</th>
                  <th className="py-3 px-4 text-center">Status Operacional</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                        <span className="text-xs font-semibold">Carregando dados em tempo real da malha...</span>
                      </div>
                    </td>
                  </tr>
                ) : pontosPaginados.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      Nenhuma unidade encontrada para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  pontosPaginados.map((m) => {
                    const statusCor = {
                      "Operação Ativa": "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                      "Aguardando 1ª Bipagem": "bg-amber-500/10 text-amber-400 border-amber-500/30",
                      "Alerta de Backlog": "bg-rose-500/10 text-rose-400 border-rose-500/30",
                      "Sem Previsão Hoje": "bg-slate-800/60 text-slate-400 border-slate-700/50"
                    }[m.status_operacional] || "bg-slate-800 text-slate-400 border-slate-700";

                    const tipoIcone = m.tipo_ponto.includes("HUB") ? (
                      <Warehouse className="w-3 h-3 text-cyan-400" />
                    ) : m.tipo_ponto.includes("Galpão") ? (
                      <Building2 className="w-3 h-3 text-indigo-400" />
                    ) : (
                      <Store className="w-3 h-3 text-emerald-400" />
                    );

                    return (
                      <tr key={m.md_codigo} className="hover:bg-slate-900/60 transition-colors">
                        {/* Código e Nome */}
                        <td className="py-3 px-4 font-medium">
                          <div className="flex flex-col">
                            <span className="font-bold text-white tracking-wide">{m.md_codigo}</span>
                            <span className="text-[11px] text-slate-400 truncate max-w-xs">{m.nome_ponto}</span>
                          </div>
                        </td>

                        {/* Tipo */}
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-900 border border-slate-800 text-slate-300">
                            {tipoIcone}
                            {m.tipo_ponto.includes("HUB") ? "HUB" : m.tipo_ponto.includes("Galpão") ? "Galpão" : "MD"}
                          </span>
                        </td>

                        {/* Localização */}
                        <td className="py-3 px-3 text-[11px]">
                          <div className="flex flex-col">
                            <span className="text-slate-200 font-medium">{m.cidade} - {m.estado}</span>
                            <span className="text-slate-500">{m.regional}</span>
                          </div>
                        </td>

                        {/* Previsto Total */}
                        <td className="py-3 px-3 text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-bold text-white text-xs">
                              {m.total_previstos.toLocaleString("pt-BR")}
                            </span>
                            {m.previstos_dropoff_cep > 0 && (
                              <span className="text-[10px] text-teal-400" title="Atribuído por proximidade de CEP">
                                +{m.previstos_dropoff_cep.toLocaleString("pt-BR")} CEP
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Bipados Agora */}
                        <td className="py-3 px-3 text-right">
                          <span className="font-bold text-emerald-400 text-xs">
                            {m.bipados.toLocaleString("pt-BR")}
                          </span>
                        </td>

                        {/* Pendentes */}
                        <td className="py-3 px-3 text-right">
                          <span className={`font-semibold text-xs ${m.pendentes > 0 ? "text-amber-400" : "text-slate-500"}`}>
                            {m.pendentes.toLocaleString("pt-BR")}
                          </span>
                        </td>

                        {/* Ritmo com Barra */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col items-center gap-1 w-28 mx-auto">
                            <div className="flex justify-between w-full text-[10px] font-semibold text-slate-300">
                              <span>{m.ritmo_pct}%</span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  m.ritmo_pct >= 90
                                    ? "bg-emerald-500"
                                    : m.ritmo_pct >= 50
                                    ? "bg-amber-500"
                                    : m.ritmo_pct > 0
                                    ? "bg-rose-500"
                                    : "bg-slate-700"
                                }`}
                                style={{ width: `${Math.min(m.ritmo_pct, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Status Operacional */}
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusCor}`}>
                            {m.status_operacional}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINAÇÃO REDE DE MDS */}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80 border-t border-slate-800 text-xs text-slate-400">
              <div>
                Página <span className="text-white font-bold">{paginaAtual}</span> de <span className="text-white font-bold">{totalPaginas}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                  disabled={paginaAtual === 1}
                  className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 disabled:opacity-40 hover:bg-slate-800 text-white cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPaginaAtual((p) => Math.min(totalPaginas, p + 1))}
                  disabled={paginaAtual === totalPaginas}
                  className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 disabled:opacity-40 hover:bg-slate-800 text-white cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ABA 2: TABELA DE DROPOFFS SEM PONTO & ROTEIRIZAÇÃO PREDITIVA ── */}
      {abaAtiva === "dropoffs" && (
        <div className="bg-[#0C101B] border border-slate-800 rounded-2xl overflow-hidden shadow-xl space-y-0">
          <div className="p-4 bg-teal-950/20 border-b border-teal-500/20 text-xs text-teal-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-400" />
              <span>
                <strong>Inteligência Logística:</strong> Pacotes criados na modalidade Drop-off que ainda não foram bipados em nenhum MD são mapeados pelo CEP de origem até o MD mais próximo da ANJUN para prever a rota e o destino de recolhimento.
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900/90 text-slate-300 border-b border-slate-800 font-semibold tracking-wide">
                  <th className="py-3 px-4">Seller / Remetente</th>
                  <th className="py-3 px-3">Cliente / Marketplace</th>
                  <th className="py-3 px-3">CEP & Origem</th>
                  <th className="py-3 px-3 text-right">Volume Criado</th>
                  <th className="py-3 px-3 text-center">Ponto Atual</th>
                  <th className="py-3 px-4">MD Provável (Sugerido)</th>
                  <th className="py-3 px-3 text-center">Distância Estimada</th>
                  <th className="py-3 px-4 text-center">Status de Roteirização</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-slate-200">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-teal-400" />
                        <span className="text-xs font-semibold">Calculando distâncias e rotas preditivas...</span>
                      </div>
                    </td>
                  </tr>
                ) : dropoffsPaginados.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400">
                      Nenhum pacote sem ponto de coleta identificado para os filtros atuais.
                    </td>
                  </tr>
                ) : (
                  dropoffsPaginados.map((d) => {
                    const cepFormatado = d.cep && d.cep.length === 8 
                      ? `${d.cep.slice(0, 5)}-${d.cep.slice(5)}` 
                      : (d.cep || "N/A");

                    const isCurto = d.distancia_km !== null && d.distancia_km <= 5.0;

                    return (
                      <tr key={d.id} className="hover:bg-slate-900/60 transition-colors">
                        {/* Seller */}
                        <td className="py-3 px-4 font-medium">
                          <div className="flex flex-col">
                            <span className="font-bold text-white tracking-wide truncate max-w-xs">{d.merchant_nome}</span>
                            <span className="text-[11px] text-slate-500">{d.maneira_coleta}</span>
                          </div>
                        </td>

                        {/* Cliente */}
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-900 border border-slate-800 text-slate-300">
                            {d.nome_cliente}
                          </span>
                        </td>

                        {/* CEP & Origem */}
                        <td className="py-3 px-3 text-[11px]">
                          <div className="flex flex-col">
                            <span className="text-teal-400 font-mono font-bold">{cepFormatado}</span>
                            <span className="text-slate-300">{d.cidade} - {d.estado}</span>
                            {d.bairro && <span className="text-slate-500 text-[10px]">{d.bairro}</span>}
                          </div>
                        </td>

                        {/* Volume Criado */}
                        <td className="py-3 px-3 text-right">
                          <span className="font-bold text-white text-xs">
                            {d.volume.toLocaleString("pt-BR")}
                          </span>
                        </td>

                        {/* Ponto Atual */}
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800/80 text-slate-400 border border-slate-700">
                            {d.ponto_atual}
                          </span>
                        </td>

                        {/* MD Provável */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                              <span className="font-bold text-teal-300">{d.md_provavel_codigo}</span>
                            </div>
                            <span className="text-[11px] text-slate-400 truncate max-w-xs">{d.md_provavel_nome}</span>
                          </div>
                        </td>

                        {/* Distância */}
                        <td className="py-3 px-3 text-center">
                          {d.distancia_km !== null ? (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isCurto 
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" 
                                : "bg-blue-500/10 text-blue-400 border-blue-500/30"
                            }`}>
                              {d.distancia_km} km
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500">N/A</span>
                          )}
                        </td>

                        {/* Status de Roteirização */}
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isCurto
                              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                              : d.md_provavel_codigo !== "N/A"
                              ? "bg-teal-500/10 text-teal-300 border-teal-500/30"
                              : "bg-slate-800 text-slate-400 border-slate-700"
                          }`}>
                            {d.status_roteirizacao}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINAÇÃO DROPOFFS */}
          {totalPaginasDropoffs > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80 border-t border-slate-800 text-xs text-slate-400">
              <div>
                Página <span className="text-white font-bold">{paginaDropoffs}</span> de <span className="text-white font-bold">{totalPaginasDropoffs}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPaginaDropoffs((p) => Math.max(1, p - 1))}
                  disabled={paginaDropoffs === 1}
                  className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 disabled:opacity-40 hover:bg-slate-800 text-white cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPaginaDropoffs((p) => Math.min(totalPaginasDropoffs, p + 1))}
                  disabled={paginaDropoffs === totalPaginasDropoffs}
                  className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 disabled:opacity-40 hover:bg-slate-800 text-white cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      </div>
  );
}
