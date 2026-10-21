"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Route,
  RefreshCw,
  Search,
  MapPin,
  Package,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Flame,
  TrendingUp,
  Warehouse,
  Calendar,
  Sparkles,
  PlusCircle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  ArrowRight,
  ShieldCheck,
  Table2,
  LayoutGrid,
  Truck,
  XCircle
} from "lucide-react";
import {
  fetchD2dSpAnalise,
  promoverMdD2dSp,
  removerMdD2dSp,
  D2dSpResponse,
  D2dSpMdItem
} from "../../lib/api";

export default function D2dSpPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<D2dSpResponse | null>(null);
  const [periodo, setPeriodo] = useState<string>("DIA");
  const [diaSelecionado, setDiaSelecionado] = useState<string>("");
  const [searchExpansao, setSearchExpansao] = useState<string>("");
  const [filtroExpansao, setFiltroExpansao] = useState<string>("TODOS");
  const [filtroRastreio, setFiltroRastreio] = useState<"TODOS" | "COM_COLETA" | "SEM_COLETA" | "DESTINO_SP">("TODOS");
  const [visaoFase1, setVisaoFase1] = useState<"cards" | "tabela" | "matriz">("cards");
  const [paginaCandidatos, setPaginaCandidatos] = useState<number>(1);
  const itensPorPagina = 25;
  const [promovendoMd, setPromovendoMd] = useState<string | null>(null);

  const carregarAnalise = async (diaOverride?: string, periodoOverride?: string) => {
    setLoading(true);
    try {
      const dUsar = diaOverride !== undefined ? diaOverride : diaSelecionado;
      const pUsar = periodoOverride !== undefined ? periodoOverride : periodo;
      const res = await fetchD2dSpAnalise({
        periodo: pUsar,
        dia: dUsar || undefined,
        filtro_expansao: filtroExpansao
      });
      setData(res);
      if (!diaSelecionado && res.dia_referencia) {
        setDiaSelecionado(res.dia_referencia);
      }
    } catch (err) {
      console.warn("Aviso ao carregar D2D SP:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarAnalise();
  }, [periodo, diaSelecionado, filtroExpansao]);

  const handlePromoverMd = async (mdCodigo: string) => {
    try {
      setPromovendoMd(mdCodigo);
      await promoverMdD2dSp(mdCodigo);
      await carregarAnalise();
    } catch (e: any) {
      alert(e.message || "Erro ao promover MD.");
    } finally {
      setPromovendoMd(null);
    }
  };

  const handleRemoverPromovido = async (codigoCurto: string) => {
    try {
      await removerMdD2dSp(codigoCurto);
      await carregarAnalise();
    } catch (e: any) {
      alert(e.message || "Erro ao remover MD promovido.");
    }
  };

  
  const kpis = data?.kpis_pilotos;
  const pilotos = data?.pilotos || [];
  const todosDias = data?.todos_dias_disponiveis || [];
  const diasMatriz = data?.dias_historico_matriz || [];

  const getStatusRastreioItem = (p: D2dSpMdItem): string => {
    if (p.status_rastreio) return p.status_rastreio;
    const isPerusConf = (p.qtd_confirmado_perus || 0) > 0 || (p.iatas_descarga || "").includes("SP-RR-001");
    if (!p.teve_visita && (p.qtd_recebida || 0) === 0) return "SEM_VISITA";
    if (isPerusConf) return "CONFIRMADO_PERUS";
    if ((p.qtd_destino_sp || 0) === 0 && (p.qtd_destino_outros || 0) > 0) return "INTERESTADUAL";
    if ((p.qtd_destino_sp || 0) > 0) return "AGUARDANDO_CONCILIACAO";
    return "SEM_VISITA";
  };

  const pilotosFiltrados = useMemo(() => {
    if (filtroRastreio === "COM_COLETA") {
      return pilotos.filter((p) => p.teve_visita && (p.qtd_recebida || 0) > 0);
    }
    if (filtroRastreio === "SEM_COLETA") {
      return pilotos.filter((p) => !p.teve_visita || (p.qtd_recebida || 0) === 0);
    }
    if (filtroRastreio === "DESTINO_SP") {
      return pilotos.filter((p) => (p.qtd_destino_sp || 0) > 0);
    }
    return pilotos;
  }, [pilotos, filtroRastreio]);

  // Filtro local por busca na Fase 2
  const candidatosFiltrados = useMemo(() => {
    const lista = data?.candidatos_expansao || [];
    if (!searchExpansao.trim()) return lista;
    const q = searchExpansao.toLowerCase();
    return lista.filter(
      (c) =>
        c.codigo_curto.toLowerCase().includes(q) ||
        c.md_codigo.toLowerCase().includes(q) ||
        c.cidade.toLowerCase().includes(q) ||
        (c.status_expansao || "").toLowerCase().includes(q)
    );
  }, [data?.candidatos_expansao, searchExpansao]);

  const totalPaginasCandidatos = Math.ceil(candidatosFiltrados.length / itensPorPagina) || 1;
  const candidatosPaginados = useMemo(() => {
    const ini = (paginaCandidatos - 1) * itensPorPagina;
    return candidatosFiltrados.slice(ini, ini + itensPorPagina);
  }, [candidatosFiltrados, paginaCandidatos]);

  const getCorTempoPerus = (horas: number | null) => {
    if (horas === null || horas <= 0) return "text-slate-400 bg-slate-800/70 border-slate-700";
    if (horas <= 10) return "text-emerald-300 bg-emerald-500/10 border-emerald-500/30";
    if (horas <= 16) return "text-amber-300 bg-amber-500/10 border-amber-500/30";
    return "text-rose-300 bg-rose-500/10 border-rose-500/30";
  };

  return (
    <div className="space-y-6">
      {/* ── CABEÇALHO DO PROJETO D2D SP ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#0C101B] border border-slate-800 p-5 rounded-2xl shadow-xl">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
              <Route className="w-3.5 h-3.5 text-indigo-400" /> PROJETO ESTRATÉGICO SP
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Exclusivo D2D (Shein D2D & Temu D2D)
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
              Sorter Perus ANJUN: Descarregamento + Circuito Fechado
            </span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-wide flex items-center gap-2.5 mt-1.5">
            D2D SP — Monitoramento de Pilotos & Expansão de Malha
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-3xl">
            Visão exclusiva de pacotes <strong className="text-slate-200">D2D</strong> nos 8 MDs piloto e na malha SP. Os pacotes são integrados via <strong className="text-emerald-400">Central de Coletas</strong>; nesta tela, suba a planilha diária de <strong className="text-blue-400">Monitoramento de Caminhões</strong> para conciliar romaneios (AJV), placas e validar a chegada física em Perus (<strong className="text-teal-300">SP-RR-001</strong>).
          </p>
        </div>

        {/* CONTROLES DE PERÍODO E UPLOAD */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Seletor de Período */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
            {[
              { id: "DIA", label: "No Dia" },
              { id: "7D", label: "Últimos 7 Dias" },
              { id: "15D", label: "Últimos 15 Dias" },
              { id: "TODOS", label: "Acumulado Geral" }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPeriodo(p.id);
                  setPaginaCandidatos(1);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  periodo === p.id
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Seletor de Data Base */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[11px] text-slate-400 font-semibold">Data Ref.:</span>
            <select
              value={diaSelecionado}
              onChange={(e) => {
                setDiaSelecionado(e.target.value);
                setPaginaCandidatos(1);
              }}
              className="bg-transparent text-xs text-indigo-300 font-bold focus:outline-none cursor-pointer"
            >
              {todosDias.map((d, idx) => (
                <option key={d} value={d} className="bg-slate-900 text-white">
                  {d} {idx === 0 ? "(Mais Recente)" : ""}
                </option>
              ))}
            </select>
          </div>

          

          {/* Recarregar */}
          <button
            onClick={() => carregarAnalise()}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Recarregar análise D2D SP"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          FASE 1: DESTAQUE DOS 8 MDs PILOTO QUE STARTARAM O PROJETO
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-[#0C101B] border border-indigo-500/30 rounded-2xl p-5 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                FASE 1 • SQUAD INICIAL (SOMENTE D2D)
              </span>
              <span className="text-xs text-slate-400">
                HAV-01 • CAN-01 • GAS-02 • RLM-01 • CAR-01 • JUU-01 • CMS-01 • POE-01
              </span>
            </div>
            <h2 className="text-base md:text-lg font-bold text-white mt-1 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              Desempenho dos MDs Piloto D2D SP
              <span className="text-xs font-normal text-slate-400">
                ({periodo === "DIA" ? `Dia ${diaSelecionado}` : `${data?.dias_considerados?.length || 1} dias analisados`})
              </span>
            </h2>
          </div>

          {/* Alternador de Visão da Fase 1 e Filtro de Conformidade */}
          <div className="flex flex-wrap items-center gap-2 self-start">
            {/* Filtro Quem Fez Certo */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
              <button
                onClick={() => setFiltroRastreio("TODOS")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  filtroRastreio === "TODOS" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                Todos ({pilotos.length})
              </button>
              <button
                onClick={() => setFiltroRastreio("COM_COLETA")}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  filtroRastreio === "COM_COLETA" ? "bg-emerald-600 text-white" : "text-emerald-400 hover:bg-emerald-500/10"
                }`}
                title="MDs com pacotes D2D coletados/bipados no período"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Com Coleta ({pilotos.filter(p => p.teve_visita && (p.qtd_recebida || 0) > 0).length})
              </button>
              <button
                onClick={() => setFiltroRastreio("SEM_COLETA")}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  filtroRastreio === "SEM_COLETA" ? "bg-rose-600 text-white" : "text-rose-400 hover:bg-rose-500/10"
                }`}
                title="MDs sem nenhuma coleta no período selecionado"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Sem Coleta ({pilotos.filter(p => !p.teve_visita || (p.qtd_recebida || 0) === 0).length})
              </button>
              <button
                onClick={() => setFiltroRastreio("DESTINO_SP")}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  filtroRastreio === "DESTINO_SP" ? "bg-indigo-600 text-white" : "text-indigo-400 hover:bg-indigo-500/10"
                }`}
                title="MDs com pacotes destinados ao Estado de São Paulo"
              >
                <MapPin className="w-3.5 h-3.5" /> Com Carga SP ({pilotos.filter(p => (p.qtd_destino_sp || 0) > 0).length})
              </button>
            </div>

            {/* Alternador de visualização */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 gap-1">
              <button
                onClick={() => setVisaoFase1("cards")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  visaoFase1 === "cards" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Cards
              </button>
              <button
                onClick={() => setVisaoFase1("tabela")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  visaoFase1 === "tabela" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                <Table2 className="w-3.5 h-3.5" /> Tabela
              </button>
              <button
                onClick={() => setVisaoFase1("matriz")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  visaoFase1 === "matriz" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                <Calendar className="w-3.5 h-3.5" /> Matriz
              </button>
            </div>
          </div>
        </div>

        {/* KPIS ESTRATÉGICOS DOS PILOTOS (INCLUINDO CONFORMIDADE) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-3">
          {/* Confirmação Perus (SP-RR-001) */}
          <div className="bg-teal-950/30 border border-teal-500/40 p-3.5 rounded-xl shadow-lg shadow-teal-950/20">
            <div className="flex items-center justify-between text-teal-300 text-[11px] mb-1 font-bold">
              <span>🎯 Validado Perus</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
            </div>
            <div className="text-lg font-extrabold text-teal-300">
              {kpis ? `${kpis.pilotos_confirmados_perus || 0}/${kpis.total_pilotos}` : "..."}
            </div>
            <div className="text-[10px] text-teal-400 font-medium mt-0.5">
              {kpis ? `${kpis.taxa_confirmacao_perus || 0}% comprovado` : "..."}
            </div>
          </div>

          {/* MDs com Visita */}
          <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
              <span>Visita D2D</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-white">
              {kpis ? `${kpis.pilotos_com_visita}/${kpis.total_pilotos}` : "..."}
            </div>
            <div className="text-[10px] text-emerald-400 mt-0.5">MDs ativos</div>
          </div>

          {/* Quantidade Recebida Efetiva D2D */}
          <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
              <span>Total Recebido D2D</span>
              <Package className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-lg font-bold text-white">
              {kpis ? kpis.qtd_recebida_total.toLocaleString("pt-BR") : "..."}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">exc. cancel./assinado</div>
          </div>

          {/* 🎯 Alvo Perus (Destino SP) */}
          <div className="bg-emerald-950/20 border border-emerald-500/30 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-emerald-300 text-[11px] mb-1">
              <span>🎯 Destino SP (Perus)</span>
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-lg font-bold text-emerald-300">
              {kpis ? (kpis.qtd_destino_sp_total || 0).toLocaleString("pt-BR") : "..."}
            </div>
            <div className="text-[10px] text-emerald-400 mt-0.5">
              {kpis ? `${kpis.pct_destino_sp_geral || 0}% da carga` : "..."}
            </div>
          </div>

          {/* ✈️ Alvo G3/GLP (Interestadual) */}
          <div className="bg-blue-950/20 border border-blue-500/30 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-blue-300 text-[11px] mb-1">
              <span>✈️ Outros Estados</span>
              <Route className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="text-lg font-bold text-blue-300">
              {kpis ? (kpis.qtd_destino_outros_total || 0).toLocaleString("pt-BR") : "..."}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Rota G3 / GLP</div>
          </div>

          {/* ✅ Confirmado Perus (Caminhões SP-RR-001) */}
          <div className="bg-teal-950/20 border border-teal-500/40 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-teal-300 text-[11px] mb-1">
              <span>✅ Conf. Perus (Caminhão)</span>
              <Truck className="w-3.5 h-3.5 text-teal-400" />
            </div>
            <div className="text-lg font-bold text-teal-300">
              {kpis ? (kpis.qtd_confirmado_perus_total || 0).toLocaleString("pt-BR") : "..."}
            </div>
            <div className="text-[10px] text-teal-400 mt-0.5">IATA SP-RR-001</div>
          </div>

          {/* Sorter Perus Concluído */}
          <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
              <span>Sorter Concluído</span>
              <Warehouse className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="text-lg font-bold text-cyan-300">
              {kpis ? kpis.qtd_perus_total.toLocaleString("pt-BR") : "..."}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Circ. Fechado ({kpis?.perus_pct_geral || 0}%)
            </div>
          </div>

          {/* Quantidade de Backlog */}
          <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
              <span>Backlog MD</span>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="text-lg font-bold text-amber-400">
              {kpis ? kpis.qtd_backlog_total.toLocaleString("pt-BR") : "..."}
            </div>
            <div className="text-[10px] text-amber-300/80 mt-0.5">
              {kpis ? `${kpis.backlog_pct_geral}% retido` : "..."}
            </div>
          </div>

          {/* Tempo Médio até Perus */}
          <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1">
              <span>Tempo Médio Perus</span>
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="text-lg font-bold text-indigo-300">
              {kpis ? kpis.tempo_medio_perus_fmt : "..."}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Col. M → Col. U</div>
          </div>
        </div>

        {/* ── VISÃO 1: CARDS DE DESTAQUE DOS PILOTOS ── */}
        {visaoFase1 === "cards" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {pilotosFiltrados.map((p) => {
              const temColeta = p.teve_visita && (p.qtd_recebida || 0) > 0;
              return (
                <div
                  key={p.codigo_curto}
                  className={`rounded-2xl border p-4 transition-all flex flex-col justify-between space-y-3.5 relative overflow-hidden ${
                    temColeta
                      ? "bg-[#111726] border-emerald-500/40 shadow-lg shadow-emerald-950/20"
                      : "bg-slate-900/40 border-slate-800"
                  }`}
                >
                  {/* Topo do Card: Código + Identificador MD */}
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-extrabold text-white tracking-tight">
                          {p.codigo_curto}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          {p.md_codigo}
                        </span>
                      </div>

                      {!p.is_piloto_original && (
                        <button
                          onClick={() => handleRemoverPromovido(p.codigo_curto)}
                          title="Remover da lista de pilotos"
                          className="text-slate-500 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* DESTAQUE PRINCIPAL: TEVE OU NÃO COLETA DE PACOTES */}
                    <div className="mt-2.5 mb-2">
                      {temColeta ? (
                        <div className="flex items-center justify-between bg-emerald-500/15 border border-emerald-500/40 px-3 py-2 rounded-xl">
                          <span className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-300">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            TEVE COLETA D2D
                          </span>
                          <span className="text-xs font-bold text-emerald-200 font-mono">
                            {p.qtd_recebida.toLocaleString("pt-BR")} pcts
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between bg-slate-800/70 border border-slate-700 px-3 py-2 rounded-xl">
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400">
                            <AlertTriangle className="w-4 h-4 text-rose-400" />
                            SEM COLETA D2D
                          </span>
                          <span className="text-xs font-medium text-slate-500 font-mono">
                            0 pacotes
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Presença no Período & Streak */}
                    <div className="flex items-center justify-between mt-1 text-[11px]">
                      {p.teve_visita ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          Visita ({p.dias_com_visita}/{p.total_dias_periodo}d)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          Sem Visita D2D
                        </span>
                      )}

                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300"
                        title="Dias consecutivos recebendo e bipando pacotes D2D"
                      >
                        <Flame className="w-3.5 h-3.5 text-orange-400" />
                        {p.streak_consecutivo}d seguidos
                      </span>
                    </div>
                  </div>

                  {/* DESTAQUE SOLICITADO: PACOTES D2D DESTINO SP VS OUTRAS UFs */}
                  {(p.qtd_destino_sp || 0) > 0 || (p.qtd_destino_outros || 0) > 0 ? (
                    <div className="grid grid-cols-2 gap-2 bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                      <div>
                        <span className="text-[10px] text-emerald-400 font-bold block flex items-center gap-1">
                          🎯 Destino SP
                        </span>
                        <span className="text-lg font-black text-white">
                          {(p.qtd_destino_sp || 0).toLocaleString("pt-BR")}
                        </span>
                        <span className="text-[9px] text-slate-400 block font-medium">
                          {p.pct_destino_sp || 0}% dos bipados
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-blue-400 font-bold block flex items-center gap-1">
                          ✈️ Outras UFs
                        </span>
                        <span className="text-lg font-black text-white">
                          {(p.qtd_destino_outros || 0).toLocaleString("pt-BR")}
                        </span>
                        <span className="text-[9px] text-slate-400 block font-medium">
                          Interestadual
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-900/70 p-2.5 rounded-xl border border-slate-800 text-center">
                      <span className="text-[11px] text-slate-400 font-medium block">
                        Destino SP / Outras UFs
                      </span>
                      <span className="text-[10px] text-amber-400 font-semibold block mt-0.5">
                        {p.qtd_recebida > 0 ? "Aguardando planilha de romaneio do dia" : "Sem movimentação no dia"}
                      </span>
                    </div>
                  )}

                  {/* Métricas Operacionais: Total Coletado, Backlog, Tempo Perus */}
                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/80">
                    <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800 text-center">
                      <span className="text-[9px] text-slate-400 block font-medium">Total D2D</span>
                      <span className="text-xs font-black text-white">
                        {p.qtd_recebida.toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div
                      className={`p-2 rounded-xl border text-center ${
                        p.qtd_backlog > 0
                          ? "bg-amber-950/25 border-amber-500/30"
                          : "bg-slate-900/80 border-slate-800"
                      }`}
                    >
                      <span className="text-[9px] text-slate-400 block font-medium">Backlog MD</span>
                      <span
                        className={`text-xs font-black ${
                          p.qtd_backlog > 0 ? "text-amber-400" : "text-emerald-400"
                        }`}
                      >
                        {p.qtd_backlog.toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800 text-center">
                      <span className="text-[9px] text-slate-400 block font-medium">Tempo Perus</span>
                      <span className={`text-xs font-black ${p.tempo_perus_horas ? "text-teal-300" : "text-slate-500"}`}>
                        {p.tempo_perus_fmt}
                      </span>
                    </div>
                  </div>

                  {/* Informações de Caminhão & IATA (Informativo Técnico) */}
                  {(p.iatas_descarga || p.placas_veiculos) && (
                    <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                      <span className="truncate flex items-center gap-1" title={p.iatas_descarga}>
                        <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{p.iatas_descarga || "IATA em conciliação"}</span>
                      </span>
                      {p.placas_veiculos && (
                        <span className="font-mono text-slate-300 font-semibold shrink-0 ml-1">
                          {p.placas_veiculos}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Mini Linha do Tempo (Últimos dias) */}
                  <div className="pt-2 border-t border-slate-800/60">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5 font-medium">
                      <span>Histórico recente:</span>
                      <span className="text-slate-300 font-mono font-bold">
                        {p.dias_ativos_historico}/{p.total_dias_historico} dias
                      </span>
                    </div>
                    <div className="grid grid-cols-10 gap-1">
                      {p.historico_diario.map((h) => (
                        <div
                          key={h.dia}
                          title={`${h.dia}: ${
                            h.teve_visita
                              ? `${h.qtd_recebida} rec. D2D | ${h.qtd_backlog} bkl | Perus: ${h.tempo_perus_fmt}`
                              : "Sem coleta D2D (0 pacotes)"
                          }`}
                          className={`h-2 rounded-sm ${
                            !h.teve_visita
                              ? "bg-slate-800"
                              : h.qtd_backlog > 0
                              ? "bg-amber-400"
                              : "bg-emerald-500"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── VISÃO 2: TABELA COMPARATIVA DOS PILOTOS ── */}
        {visaoFase1 === "tabela" && (
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase">
                  <th className="py-3 px-4">MD Piloto</th>
                  <th className="py-3 px-3 text-center">Status Coleta D2D</th>
                  <th className="py-3 px-2 text-center">Visita?</th>
                  <th className="py-3 px-2 text-center">Streak</th>
                  <th className="py-3 px-3 text-right">Total Coletado</th>
                  <th className="py-3 px-3 text-right text-emerald-400">🎯 Destino SP</th>
                  <th className="py-3 px-3 text-right text-blue-400">✈️ Outras UFs</th>
                  <th className="py-3 px-3 text-center text-indigo-400">🔒 Sacas / Lacres</th>
                  <th className="py-3 px-3 text-right">Backlog MD</th>
                  <th className="py-3 px-3 text-right">Circuito Fechado</th>
                  <th className="py-3 px-3 text-center">Tempo até Perus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {pilotosFiltrados.map((p) => (
                  <tr key={p.codigo_curto} className="hover:bg-slate-900/40">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white">{p.codigo_curto}</span>
                        <span className="text-[11px] font-mono text-slate-400">({p.md_codigo})</span>
                      </div>
                      <span className="text-[10px] text-slate-500">{p.cidade} - {p.estado}</span>
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {p.teve_visita && (p.qtd_recebida || 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          TEVE COLETA ({p.qtd_recebida.toLocaleString("pt-BR")})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          SEM COLETA
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-center">
                      {p.teve_visita ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          SIM ({p.dias_com_visita}/{p.total_dias_periodo}d)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          NÃO
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-center font-bold text-amber-300 whitespace-nowrap">
                      {p.streak_consecutivo}d
                    </td>
                    <td className="py-3 px-3 text-right font-extrabold text-white">
                      {p.qtd_recebida.toLocaleString("pt-BR")}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-emerald-300">
                      {(p.qtd_destino_sp || 0).toLocaleString("pt-BR")}
                      <span className="block text-[9px] text-emerald-400/80">{p.pct_destino_sp || 0}%</span>
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-blue-300">
                      {(p.qtd_destino_outros || 0).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-teal-300">
                      {(p.qtd_confirmado_perus || 0).toLocaleString("pt-BR")}
                      <span className="block text-[9px] text-teal-400/80">
                        {p.qtd_destino_sp ? Math.round(((p.qtd_confirmado_perus || 0) / p.qtd_destino_sp) * 100) : 0}% de SP
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <div className="text-[11px] font-semibold text-slate-200">
                        {p.iatas_descarga || "Aguardando"}
                      </div>
                      {p.placas_veiculos && (
                        <span className="font-mono text-[10px] text-slate-400">{p.placas_veiculos}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className={`font-bold ${p.qtd_backlog > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                        {p.qtd_backlog.toLocaleString("pt-BR")}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-teal-300">
                      {p.qtd_perus.toLocaleString("pt-BR")}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getCorTempoPerus(p.tempo_perus_horas)}`}>
                        {p.tempo_perus_fmt}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── VISÃO 3: MATRIZ DIA A DIA DE VISITAS DOS 8 PILOTOS ── */}
        {visaoFase1 === "matriz" && (
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-bold text-slate-400">
                  <th className="py-3 px-4">MD Piloto</th>
                  <th className="py-3 px-2 text-center">Streak</th>
                  {diasMatriz.map((dm) => (
                    <th key={dm} className="py-3 px-2 text-center font-mono">
                      {dm}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {pilotos.map((p) => (
                  <tr key={p.codigo_curto} className="hover:bg-slate-900/40">
                    <td className="py-3 px-4 font-extrabold text-white whitespace-nowrap">
                      {p.codigo_curto}
                      <span className="block text-[10px] font-normal text-slate-400">{p.md_codigo}</span>
                    </td>
                    <td className="py-3 px-2 text-center font-bold text-amber-300 whitespace-nowrap">
                      🔥 {p.streak_consecutivo}d
                    </td>
                    {p.historico_diario.map((h) => (
                      <td key={h.dia} className="py-2.5 px-2 text-center">
                        {h.teve_visita ? (
                          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-1.5">
                            <div className="font-bold text-emerald-300 text-[11px]">
                              {h.qtd_recebida.toLocaleString("pt-BR")}
                            </div>
                            <div className="text-[9px] text-slate-400">
                              {h.qtd_backlog > 0 ? `Bkl: ${h.qtd_backlog}` : h.tempo_perus_fmt}
                            </div>
                          </div>
                        ) : (
                          <div className="bg-rose-950/20 border border-rose-500/20 rounded-lg p-1.5 text-[10px] text-rose-400 font-semibold">
                            Sem Visita
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          FASE 2: EXPANSÃO DO PROJETO PARA OUTROS MINIDROPS DE SP
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-[#0C101B] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider bg-teal-500/15 text-teal-300 border border-teal-500/30">
                FASE 2 • RADAR DE EXPANSÃO SP
              </span>
              <span className="text-xs text-slate-400">
                {candidatosFiltrados.length} Minidrops de SP avaliados
              </span>
            </div>
            <h2 className="text-base md:text-lg font-bold text-white mt-1 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-teal-400" />
              Candidatos à Expansão D2D SP (Bipagem Consecutiva, Backlog e Tempo até Perus)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Identifique quais MDs vêm bipando de maneira consecutiva todos os dias, se retêm backlog (Coletado / Saco selado) e em quanto tempo a carga chega em Perus.
            </p>
          </div>

          {/* Filtros Rápidos e Busca da Fase 2 */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: "TODOS", label: "Todos MDs SP" },
              { id: "PRONTOS", label: "🌟 Prontos p/ Expansão" },
              { id: "CONSECUTIVOS", label: "🔥 Bipagem Consecutiva (3d+)" },
              { id: "COM_BACKLOG", label: "⚠️ Com Backlog Retido" }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  setFiltroExpansao(f.id);
                  setPaginaCandidatos(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  filtroExpansao === f.id
                    ? "bg-teal-600/20 text-teal-300 border-teal-500/40"
                    : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                }`}
              >
                {f.label}
              </button>
            ))}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchExpansao}
                onChange={(e) => {
                  setSearchExpansao(e.target.value);
                  setPaginaCandidatos(1);
                }}
                placeholder="Buscar MD ou cidade..."
                className="bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>
        </div>

        {/* TABELA DE RANKING DE EXPANSÃO (FASE 2) */}
        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/90 border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase">
                <th className="py-3 px-4">Minidrop (MD) & Cidade</th>
                <th className="py-3 px-3 text-center">Bipagem Consecutiva</th>
                <th className="py-3 px-3 text-center">Frequência Recente</th>
                <th className="py-3 px-3 text-right">Recebidos Efetivos D2D</th>
                <th className="py-3 px-3 text-right">Fica Backlog? (Coletado/Selado)</th>
                <th className="py-3 px-3 text-right">Chegou em Perus</th>
                <th className="py-3 px-4 text-center">Tempo até Perus (Col. U)</th>
                <th className="py-3 px-3 text-center">Diagnóstico Expansão</th>
                <th className="py-3 px-3 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Analisando consistência consecutiva e tempos de Perus na malha SP...
                  </td>
                </tr>
              ) : candidatosPaginados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Nenhum MD encontrado para o filtro selecionado.
                  </td>
                </tr>
              ) : (
                candidatosPaginados.map((c) => {
                  const isPronto = c.status_expansao === "Pronto para Expansão";
                  const temBkl = c.qtd_backlog > 0;
                  return (
                    <tr key={c.md_codigo} className="hover:bg-slate-900/40 transition-colors">
                      {/* MD & Cidade */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{c.codigo_curto}</span>
                          <span className="text-[11px] font-mono text-slate-400">{c.md_codigo}</span>
                        </div>
                        <span className="text-[11px] text-slate-400">{c.cidade} - {c.estado}</span>
                      </td>

                      {/* Streak Consecutivo */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            c.streak_consecutivo >= 4
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                              : c.streak_consecutivo >= 2
                              ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                              : "bg-slate-800 text-slate-400 border-slate-700"
                          }`}
                        >
                          <Flame className="w-3 h-3 text-orange-400" />
                          {c.streak_consecutivo}d seguidos
                        </span>
                      </td>

                      {/* Frequência + Mini barras */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[11px] text-slate-300 font-semibold">
                            {c.dias_ativos_historico}/{c.total_dias_historico} dias ativos
                          </span>
                          <div className="flex items-center gap-0.5">
                            {c.historico_diario.map((h) => (
                              <span
                                key={h.dia}
                                title={`${h.dia}: ${h.qtd_recebida} pacotes D2D`}
                                className={`w-2 h-2 rounded-xs ${
                                  h.teve_visita ? "bg-emerald-400" : "bg-slate-800"
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      </td>

                      {/* Qtd Recebida Efetiva D2D */}
                      <td className="py-3 px-3 text-right">
                        <div className="font-bold text-white">{c.qtd_recebida.toLocaleString("pt-BR")}</div>
                        <div className="text-[10px] text-slate-500">
                          média {c.media_diaria.toLocaleString("pt-BR")}/dia
                        </div>
                        {c.qtd_assinado > 0 && (
                          <div className="text-[10px] text-rose-400 font-semibold mt-0.5">
                            ⚠️ {c.qtd_assinado} Foi Assinado
                          </div>
                        )}
                      </td>

                      {/* Backlog */}
                      <td className="py-3 px-3 text-right">
                        {temBkl ? (
                          <div>
                            <span className="font-bold text-amber-400">
                              {c.qtd_backlog.toLocaleString("pt-BR")}
                            </span>
                            <span className="block text-[10px] text-amber-300/80">
                              {c.backlog_pct}% retido no ponto
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="font-bold text-emerald-400">0</span>
                            <span className="block text-[10px] text-emerald-400/70">Sem retenção</span>
                          </div>
                        )}
                      </td>

                      {/* Chegou em Perus */}
                      <td className="py-3 px-3 text-right">
                        <span className="font-bold text-teal-300">{c.qtd_perus.toLocaleString("pt-BR")}</span>
                        <span className="block text-[10px] text-slate-500">{c.perus_pct}% do total</span>
                      </td>

                      {/* Tempo até Perus */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${getCorTempoPerus(
                            c.tempo_perus_horas
                          )}`}
                        >
                          {c.tempo_perus_fmt}
                        </span>
                        {c.hora_media_bipagem && c.hora_media_perus && (
                          <span className="block text-[10px] text-slate-500 mt-0.5 font-mono">
                            {c.hora_media_bipagem} → {c.hora_media_perus}
                          </span>
                        )}
                      </td>

                      {/* Diagnóstico */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            isPronto
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                              : c.status_expansao === "Atenção: Retém Backlog"
                              ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                              : "bg-slate-800 text-slate-300 border-slate-700"
                          }`}
                        >
                          {c.status_expansao}
                        </span>
                      </td>

                      {/* Botão Promover para Fase 1 */}
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => handlePromoverMd(c.md_codigo)}
                          disabled={promovendoMd === c.md_codigo}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                          title="Adicionar este MD ao painel de destaque D2D SP"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>Incluir D2D</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINAÇÃO DA FASE 2 */}
        {totalPaginasCandidatos > 1 && (
          <div className="flex items-center justify-between pt-2 text-xs text-slate-400">
            <div>
              Página <span className="text-white font-bold">{paginaCandidatos}</span> de{" "}
              <span className="text-white font-bold">{totalPaginasCandidatos}</span> ({candidatosFiltrados.length} MDs de SP)
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPaginaCandidatos((p) => Math.max(1, p - 1))}
                disabled={paginaCandidatos === 1}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 disabled:opacity-40 hover:bg-slate-800 text-white cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPaginaCandidatos((p) => Math.min(totalPaginasCandidatos, p + 1))}
                disabled={paginaCandidatos === totalPaginasCandidatos}
                className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 disabled:opacity-40 hover:bg-slate-800 text-white cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      </div>
  );
}
