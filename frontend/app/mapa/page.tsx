"use client";

import React, { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { 
  Map as MapIcon, 
  MapPin, 
  Building2, 
  Store, 
  Search, 
  RefreshCw, 
  Layers, 
  ArrowLeft, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  Users, 
  Package, 
  ExternalLink,
  ChevronRight,
  Filter,
  Maximize2,
  SlidersHorizontal,
  X,
  Check,
  Sparkles,
  GitFork,
  BarChart3
} from "lucide-react";
import { fetchCockpitD1, CockpitD1Data, CockpitD1MD, salvarClassificacaoPonto, removerClassificacaoPonto, geocodificarEndereco } from "@/lib/api";
import ViabilidadeModal from "@/components/ViabilidadeModal";
import type { SearchedLocation } from "@/components/CockpitMap";

const CockpitMap = dynamic(() => import("@/components/CockpitMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[650px] rounded-2xl border border-slate-800 bg-[#090D16] flex flex-col items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-3" />
      <span className="text-sm text-slate-400 font-medium">Carregando mapa interativo da malha...</span>
    </div>
  ),
});

export default function MapaPage() {
  const [cockpitData, setCockpitData] = useState<CockpitD1Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDia, setSelectedDia] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<"TODOS" | "MD" | "HUB">("TODOS");
  const [selectedPonto, setSelectedPonto] = useState<CockpitD1MD | null>(null);
  const [activeSideTab, setActiveSideTab] = useState<"hubs" | "mds">("hubs");
  const [updatingClassificacao, setUpdatingClassificacao] = useState(false);
  const [isGerenciarModalOpen, setIsGerenciarModalOpen] = useState(false);
  const [isViabilidadeModalOpen, setIsViabilidadeModalOpen] = useState(false);
  const [gerenciarSearch, setGerenciarSearch] = useState("");
  const [searchedLocation, setSearchedLocation] = useState<SearchedLocation | null>(null);

  const loadData = async (dia?: string) => {
    setLoading(true);
    try {
      const data = await fetchCockpitD1(dia);
      setCockpitData(data);
      if (data.dia_selecionado && (!dia || dia === "")) {
        setSelectedDia(data.dia_selecionado);
      }
    } catch (err) {
      console.error("Erro ao carregar dados da malha para o mapa:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q");
      if (q) {
        geocodificarEndereco(q).then((res) => {
          if (res.encontrado && res.latitude && res.longitude) {
            setSearchedLocation({
              latitude: res.latitude,
              longitude: res.longitude,
              display_name: res.display_name || q,
              tipo: res.tipo || "endereco",
              cidade: res.cidade,
              estado: res.estado,
              hub_mais_proximo: res.hub_mais_proximo,
              md_mais_proximo: res.md_mais_proximo,
            });
          }
        });
      }
    }
  }, []);

  const handleToggleClassificacao = async (pontoCodigo: string, novoTipo: "MD" | "HUB") => {
    setUpdatingClassificacao(true);
    try {
      await salvarClassificacaoPonto(pontoCodigo, novoTipo);
      await loadData(selectedDia);
      setSelectedPonto((prev) =>
        prev && prev.ponto_colecao === pontoCodigo
          ? {
              ...prev,
              tipo_ponto: novoTipo,
              tipo_label: novoTipo === "HUB" ? "HUB Operacional ANJUN" : "Minidrop Parceiro (MD)",
              operacao: novoTipo === "HUB" ? "Recepção / Pickup / Transferência" : "Ponto de Coleta Dropoff",
              manual_override: true,
            }
          : prev
      );
    } catch (err: any) {
      alert("Erro ao salvar classificação: " + (err.message || err));
    } finally {
      setUpdatingClassificacao(false);
    }
  };

  const handleResetClassificacao = async (pontoCodigo: string) => {
    setUpdatingClassificacao(true);
    try {
      await removerClassificacaoPonto(pontoCodigo);
      await loadData(selectedDia);
      setSelectedPonto((prev) =>
        prev && prev.ponto_colecao === pontoCodigo
          ? {
              ...prev,
              manual_override: false,
            }
          : prev
      );
    } catch (err: any) {
      alert("Erro ao resetar classificação: " + (err.message || err));
    } finally {
      setUpdatingClassificacao(false);
    }
  };

  const handleDiaChange = (novoDia: string) => {
    setSelectedDia(novoDia);
    loadData(novoDia);
  };

  // Pontos disponíveis com coordenadas para plotar
  const todosPontos = useMemo(() => {
    if (!cockpitData) return [];
    return cockpitData.mapa_pontos_plotaveis || [];
  }, [cockpitData]);

  // Filtro por termo de busca e tipo
  const pontosFiltrados = useMemo(() => {
    return todosPontos.filter((p) => {
      const matchTipo = tipoFiltro === "TODOS" || p.tipo_ponto === tipoFiltro;
      if (!matchTipo) return false;

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        (p.ponto_colecao && p.ponto_colecao.toLowerCase().includes(term)) ||
        (p.nome_display && p.nome_display.toLowerCase().includes(term)) ||
        (p.cidade && p.cidade.toLowerCase().includes(term)) ||
        (p.estado && p.estado.toLowerCase().includes(term))
      );
    });
  }, [todosPontos, tipoFiltro, searchTerm]);

  // Agrupamentos para o painel lateral
  const hubsList = useMemo(() => {
    return todosPontos
      .filter((p) => p.tipo_ponto === "HUB")
      .sort((a, b) => b.volume - a.volume);
  }, [todosPontos]);

  const mdsList = useMemo(() => {
    return todosPontos
      .filter((p) => p.tipo_ponto === "MD")
      .sort((a, b) => b.volume - a.volume);
  }, [todosPontos]);

  const totais = cockpitData?.totais;

  return (
    <div className="space-y-6 pb-12">
      {/* Header com Navegação e Controles */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 mb-1">
            <Link href="/" className="hover:underline flex items-center gap-1 text-slate-400 hover:text-white">
              <ArrowLeft className="w-3.5 h-3.5" />
              Cockpit First Mile
            </Link>
            <span className="text-slate-600">/</span>
            <span className="flex items-center gap-1 text-blue-400">
              <MapPin className="w-3.5 h-3.5" />
              Mapa da Malha
            </span>
          </div>

          <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <span className="p-2 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-emerald-400">
              <MapIcon className="w-7 h-7" />
            </span>
            Mapa Operacional da Malha First Mile
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Visão geográfica integrada dos Minidrops parceiros (MD) e HUBs ANJUN com status de coleta e volumetria do dia.
          </p>
        </div>

        {/* Date Selector & Action Buttons */}
        <div className="flex flex-wrap items-center gap-3">
          {cockpitData?.dias_disponiveis && cockpitData.dias_disponiveis.length > 0 && (
            <div className="flex items-center gap-2 bg-[#0C101B] border border-slate-800 px-3 py-1.5 rounded-xl">
              <span className="text-xs text-slate-400 font-medium">Data Operacional:</span>
              <select
                value={selectedDia}
                onChange={(e) => handleDiaChange(e.target.value)}
                className="bg-transparent text-sm font-bold text-white focus:outline-none cursor-pointer"
              >
                <option value="GERAL" className="bg-slate-900 text-amber-400 font-bold">
                  📊 Acumulado Geral (Todos os Dias)
                </option>
                {cockpitData.dias_disponiveis.map((d) => (
                  <option key={d} value={d} className="bg-slate-900 text-white">
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => loadData(selectedDia)}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
            title="Atualizar dados do mapa"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-400" : ""}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={() => setIsViabilidadeModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition-all shadow-md cursor-pointer"
            title="Checar viabilidade operacional de abertura de ponto ou atendimento de cliente"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>⚡ Viabilidade da Malha</span>
          </button>

          <button
            onClick={() => setIsGerenciarModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold transition-all shadow-md cursor-pointer"
            title="Ajustar e classificar manualmente pontos (Minidrop vs HUB)"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Ajustar MDs vs HUBs</span>
          </button>

          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white transition-all shadow-lg shadow-emerald-900/30"
          >
            <span>Ver Cockpit D-1</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Top Metric Cards */}
      {totais && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-[#0C101B] p-4 rounded-xl border border-slate-800/80">
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
              Total de Pontos
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black text-white">{totais.total_pontos_todos}</span>
            </div>
            <p className="text-[10px] text-emerald-400 font-medium mt-1">
              {totais.total_mds_biparam} MDs • {totais.total_hubs_biparam} HUBs
            </p>
          </div>

          <div className="bg-[#0C101B] p-4 rounded-xl border border-slate-800/80">
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
              {cockpitData?.is_modo_geral ? "Volume Acumulado" : "Volume Total"}
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black text-white">
                {totais.total_pedidos.toLocaleString("pt-BR")}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              {cockpitData?.is_modo_geral 
                ? `Média: ~${totais.media_diaria_pedidos?.toLocaleString("pt-BR")} pcts/dia (${totais.dias_contabilizados} dias)` 
                : "pacotes bipados no dia"}
            </p>
          </div>

          <div className="bg-[#0C101B] p-4 rounded-xl border border-slate-800/80">
            <span className="text-[11px] font-semibold text-emerald-400 block uppercase tracking-wider">
              Coletados (Circuito)
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black text-emerald-400">
                {(totais.coletados ?? totais.total_coletado ?? 0).toLocaleString("pt-BR")}
              </span>
            </div>
            <p className="text-[10px] text-emerald-500 font-medium mt-1">
              {totais.taxa_coleta ?? totais.taxa_coleta_geral ?? 0}% taxa de coleta
            </p>
          </div>

          <div className="bg-[#0C101B] p-4 rounded-xl border border-slate-800/80">
            <span className="text-[11px] font-semibold text-amber-400 block uppercase tracking-wider">
              Backlog Pendente
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black text-amber-400">
                {(totais.backlog ?? totais.total_backlog ?? 0).toLocaleString("pt-BR")}
              </span>
            </div>
            <p className="text-[10px] text-amber-500 font-medium mt-1">
              {(100 - (totais.taxa_coleta ?? totais.taxa_coleta_geral ?? 0)).toFixed(1)}% em espera
            </p>
          </div>

          <div className="bg-[#0C101B] p-4 rounded-xl border border-slate-800/80">
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider">
              Sellers Ativos
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black text-white">{totais.total_sellers}</span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">atendidos na data</p>
          </div>

          <div className="bg-[#0C101B] p-4 rounded-xl border border-slate-800/80">
            <span className="text-[11px] font-semibold text-purple-400 block uppercase tracking-wider">
              HUBs Operacionais
            </span>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl font-black text-purple-400">{totais.total_hubs_biparam}</span>
            </div>
            <p className="text-[10px] text-purple-300 font-medium mt-1">bases Anjun ativas</p>
          </div>
        </div>
      )}

      {/* Main Grid: Map + Side Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Map */}
        <div className="xl:col-span-8 space-y-4">
          {/* Map Filters & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0C101B] p-3 rounded-2xl border border-slate-800">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por IATA (ex: SC-W-H001), nome do ponto ou cidade..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Filter Buttons */}
            <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800 shrink-0">
              <button
                onClick={() => setTipoFiltro("TODOS")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  tipoFiltro === "TODOS"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                Todos ({todosPontos.length})
              </button>

              <button
                onClick={() => setTipoFiltro("MD")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  tipoFiltro === "MD"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-emerald-400 hover:bg-emerald-950/40"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Minidrops ({mdsList.length})
              </button>

              <button
                onClick={() => setTipoFiltro("HUB")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  tipoFiltro === "HUB"
                    ? "bg-purple-600 text-white shadow-sm"
                    : "text-purple-400 hover:bg-purple-950/40"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-purple-400" />
                HUBs ({hubsList.length})
              </button>
            </div>
          </div>

          {/* Leaflet Map Card */}
          <div className="bg-[#0C101B] p-2 rounded-2xl border border-slate-800/80 shadow-2xl relative">
            <CockpitMap
              pontos={pontosFiltrados}
              sellers={cockpitData?.sellers_mapa || []}
              height="650px"
              selectedPonto={selectedPonto}
              onSelectPonto={(p) => setSelectedPonto(p)}
              filtroTipo={tipoFiltro}
              onFiltroTipoChange={(t) => setTipoFiltro(t)}
              searchedLocation={searchedLocation}
              onClearSearchedLocation={() => setSearchedLocation(null)}
              onConsultarViabilidade={(cid, uf) => {
                setIsViabilidadeModalOpen(true);
              }}
            />
          </div>

          {/* Evolução Histórica dos Dias (se houver dados de múltiplos dias) */}
          {cockpitData?.evolucao_temporal && cockpitData.evolucao_temporal.length > 1 && (
            <div className="bg-[#0C101B] p-4 rounded-2xl border border-slate-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Evolução Diária da Malha (Volume & Avanço)
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 font-mono">
                  {cockpitData.evolucao_temporal.length} dias registrados
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                {cockpitData.evolucao_temporal.map((ev, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleDiaChange(ev.dia)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedDia === ev.dia
                        ? "bg-amber-500/10 border-amber-500/50 shadow-md shadow-amber-500/10"
                        : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <div className="text-[10px] text-slate-400 font-medium truncate">{ev.dia}</div>
                    <div className="text-sm font-black text-white font-mono mt-0.5">
                      {ev.volume.toLocaleString("pt-BR")}
                    </div>
                    <div className="flex items-center justify-between text-[10px] mt-1 pt-1 border-t border-slate-800/60 font-mono">
                      <span className="text-emerald-400">{ev.taxa_coleta}%</span>
                      <span className="text-slate-500">{ev.qtd_pontos} pts</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Info Footer */}
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 px-2">
            <span>
              Mostrando <strong className="text-white">{pontosFiltrados.length}</strong> de{" "}
              <strong className="text-white">{todosPontos.length}</strong> pontos geolocalizados.
              {cockpitData?.sellers_mapa && cockpitData.sellers_mapa.length > 0 && (
                <span className="text-cyan-400 font-semibold ml-2">
                  • {cockpitData.sellers_mapa.length} Sellers mapeados no Spoke-Hub
                </span>
              )}
            </span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                Minidrop Parceiro (Dropoff)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block" />
                HUB ANJUN (Pickup/Transbordo)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" />
                Seller Ativo (Origem)
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Side Panel (HUBs & MDs Ranking) */}
        <div className="xl:col-span-4 space-y-4">
          {/* Card Detalhe do Ponto Selecionado */}
          {selectedPonto ? (
            <div className="bg-gradient-to-b from-[#131926] to-[#0C101B] p-4 rounded-2xl border border-blue-500/40 shadow-xl space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase ${
                      selectedPonto.tipo_ponto === "HUB"
                        ? "bg-purple-600/30 text-purple-300 border border-purple-500/30"
                        : "bg-emerald-600/30 text-emerald-300 border border-emerald-500/30"
                    }`}
                  >
                    {selectedPonto.tipo_label}
                  </span>
                  <h3 className="text-base font-bold text-white mt-1 leading-snug">
                    {selectedPonto.nome_display || selectedPonto.ponto_colecao}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    IATA: <span className="text-white font-semibold">{selectedPonto.ponto_colecao}</span>
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPonto(null)}
                  className="text-xs text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase">Volume Bipado</span>
                  <span className="text-lg font-mono font-bold text-white">
                    {selectedPonto.volume.toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase">Sellers</span>
                  <span className="text-lg font-mono font-bold text-white">
                    {selectedPonto.qtd_sellers}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-xs">
                <div className="flex justify-between items-center text-emerald-400">
                  <span>Coletados (Circuito/Carreg.):</span>
                  <span className="font-mono font-bold">{selectedPonto.coletados.toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex justify-between items-center text-amber-400">
                  <span>Backlog (Coleta/Saco/Assin.):</span>
                  <span className="font-mono font-bold">{selectedPonto.backlog.toLocaleString("pt-BR")}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-white font-bold">
                  <span>Taxa de Coleta:</span>
                  <span className="font-mono text-emerald-400">{selectedPonto.taxa_coleta}%</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center justify-between">
                <span>Finalidade: {selectedPonto.operacao}</span>
                <span>{selectedPonto.cidade} - {selectedPonto.estado}</span>
              </div>

              {/* Controles de Classificação Manual MD vs HUB */}
              <div className="pt-2.5 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 font-semibold flex items-center gap-1">
                    <span>Ajustar Tipo do Ponto:</span>
                  </span>
                  {selectedPonto.manual_override && (
                    <span className="text-[10px] text-amber-400 font-bold bg-amber-950/40 border border-amber-500/30 px-1.5 py-0.5 rounded">
                      ✏️ Manual
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleToggleClassificacao(selectedPonto.ponto_colecao, "MD")}
                    disabled={updatingClassificacao}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                      selectedPonto.tipo_ponto === "MD"
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/40 border border-emerald-400/50"
                        : "bg-slate-900/80 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 border border-slate-800"
                    }`}
                  >
                    <Store className="w-3.5 h-3.5" />
                    <span>É Minidrop (MD)</span>
                  </button>

                  <button
                    onClick={() => handleToggleClassificacao(selectedPonto.ponto_colecao, "HUB")}
                    disabled={updatingClassificacao}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                      selectedPonto.tipo_ponto === "HUB"
                        ? "bg-purple-600 text-white shadow-md shadow-purple-900/40 border border-purple-400/50"
                        : "bg-slate-900/80 text-slate-400 hover:text-purple-400 hover:bg-slate-800 border border-slate-800"
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>É HUB ANJUN</span>
                  </button>
                </div>

                {selectedPonto.manual_override && (
                  <button
                    onClick={() => handleResetClassificacao(selectedPonto.ponto_colecao)}
                    disabled={updatingClassificacao}
                    className="w-full text-center text-[10px] text-slate-500 hover:text-slate-300 py-1 transition-all cursor-pointer"
                  >
                    ↺ Restaurar detecção automática
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[#0C101B] p-4 rounded-2xl border border-slate-800 text-center space-y-2">
              <MapPin className="w-8 h-8 text-blue-400/60 mx-auto" />
              <h4 className="text-sm font-bold text-white">Selecione um ponto no mapa ou na lista</h4>
              <p className="text-xs text-slate-400">
                Clique em qualquer marcador ou item abaixo para dar zoom, inspecionar e alterar se é Minidrop ou HUB.
              </p>
            </div>
          )}

          {/* Tabs for Point List */}
          <div className="bg-[#0C101B] rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="flex border-b border-slate-800">
              <button
                onClick={() => setActiveSideTab("hubs")}
                className={`flex-1 py-3 px-4 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeSideTab === "hubs"
                    ? "bg-purple-950/30 text-purple-300 border-b-2 border-purple-500"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Building2 className="w-4 h-4 text-purple-400" />
                <span>HUBs ANJUN ({hubsList.length})</span>
              </button>

              <button
                onClick={() => setActiveSideTab("mds")}
                className={`flex-1 py-3 px-4 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeSideTab === "mds"
                    ? "bg-emerald-950/30 text-emerald-300 border-b-2 border-emerald-500"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Store className="w-4 h-4 text-emerald-400" />
                <span>Minidrops ({mdsList.length})</span>
              </button>
            </div>

            {/* List Body with Scroll */}
            <div className="p-3 max-h-[460px] overflow-y-auto space-y-2">
              {activeSideTab === "hubs" ? (
                hubsList.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">Nenhum HUB encontrado.</p>
                ) : (
                  hubsList.map((hub, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedPonto(hub)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        selectedPonto?.ponto_colecao === hub.ponto_colecao
                          ? "bg-purple-950/40 border-purple-500 shadow-md shadow-purple-900/20"
                          : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-900/60 text-purple-300 border border-purple-700/50">
                              HUB #{idx + 1}
                            </span>
                            <span className="font-mono text-xs font-bold text-white">
                              {hub.ponto_colecao}
                            </span>
                          </div>
                          <h4 className="text-xs font-semibold text-slate-200 mt-1 line-clamp-1">
                            {hub.nome_display || hub.ponto_colecao}
                          </h4>
                          <p className="text-[10px] text-slate-400">{hub.cidade} - {hub.estado}</p>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-mono font-bold text-purple-300 block">
                            {hub.volume.toLocaleString("pt-BR")}
                          </span>
                          <span className="text-[10px] text-slate-400">{hub.qtd_sellers} sellers</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] pt-2 mt-2 border-t border-slate-800/60 text-slate-400">
                        <span className="text-emerald-400 font-medium">{hub.taxa_coleta}% coletado</span>
                        <span className="text-amber-400">{hub.backlog.toLocaleString("pt-BR")} backlog</span>
                      </div>
                    </div>
                  ))
                )
              ) : (
                mdsList.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">Nenhum Minidrop encontrado.</p>
                ) : (
                  mdsList.map((md, idx) => (
                    <div
                      key={idx}
                      onClick={() => setSelectedPonto(md)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        selectedPonto?.ponto_colecao === md.ponto_colecao
                          ? "bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-900/20"
                          : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">
                              MD #{idx + 1}
                            </span>
                            <span className="font-mono text-xs font-bold text-white">
                              {md.ponto_colecao}
                            </span>
                          </div>
                          <h4 className="text-xs font-semibold text-slate-200 mt-1 line-clamp-1">
                            {md.nome_display || md.ponto_colecao}
                          </h4>
                          <p className="text-[10px] text-slate-400">{md.cidade} - {md.estado}</p>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-mono font-bold text-emerald-300 block">
                            {md.volume.toLocaleString("pt-BR")}
                          </span>
                          <span className="text-[10px] text-slate-400">{md.qtd_sellers} sellers</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[10px] pt-2 mt-2 border-t border-slate-800/60 text-slate-400">
                        <span className="text-emerald-400 font-medium">{md.taxa_coleta}% coletado</span>
                        <span className="text-amber-400">{md.backlog.toLocaleString("pt-BR")} backlog</span>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Gerenciar e Ajustar Classificação dos Pontos */}
      {isGerenciarModalOpen && (
        <div className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0C101B] border border-slate-800 rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-purple-400" />
                  Gerenciar Classificação dos Pontos (Minidrop vs HUB)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Defina o tipo real de cada ponto da rede. Seus ajustes têm prioridade absoluta sobre o cálculo automático e ficam salvos no banco.
                </p>
              </div>
              <button
                onClick={() => setIsGerenciarModalOpen(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Search */}
            <div className="p-4 border-b border-slate-800/80 bg-slate-900/40">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Pesquisar ponto por IATA, nome ou cidade (ex: MD-HAV, SC-W-H001)..."
                  value={gerenciarSearch}
                  onChange={(e) => setGerenciarSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-all"
                />
              </div>
            </div>

            {/* Modal Table / List */}
            <div className="p-4 overflow-y-auto flex-1 divide-y divide-slate-800/60 custom-scrollbar">
              {(cockpitData?.mds_breakdown || [])
                .filter((p) => {
                  if (!gerenciarSearch.trim()) return true;
                  const t = gerenciarSearch.toLowerCase();
                  return (
                    p.ponto_colecao.toLowerCase().includes(t) ||
                    (p.nome_display && p.nome_display.toLowerCase().includes(t)) ||
                    (p.cidade && p.cidade.toLowerCase().includes(t))
                  );
                })
                .map((p, idx) => (
                  <div key={idx} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white">
                          {p.ponto_colecao}
                        </span>
                        {p.manual_override ? (
                          <span className="text-[9px] bg-amber-950/60 text-amber-400 border border-amber-500/40 px-1.5 py-0.5 rounded font-bold">
                            Personalizado
                          </span>
                        ) : (
                          <span className="text-[9px] text-slate-500 font-mono">
                            Auto
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 truncate max-w-sm">
                        {p.nome_display || p.ponto_colecao}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {p.cidade || "N/A"} - {p.estado || "N/A"} • Volume: {p.volume.toLocaleString("pt-BR")} pacotes
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleToggleClassificacao(p.ponto_colecao, "MD")}
                        disabled={updatingClassificacao}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                          p.tipo_ponto === "MD"
                            ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/40 border border-emerald-400/50"
                            : "bg-slate-900 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 border border-slate-800"
                        }`}
                      >
                        <Store className="w-3.5 h-3.5" />
                        <span>É Minidrop</span>
                      </button>

                      <button
                        onClick={() => handleToggleClassificacao(p.ponto_colecao, "HUB")}
                        disabled={updatingClassificacao}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                          p.tipo_ponto === "HUB"
                            ? "bg-purple-600 text-white shadow-md shadow-purple-900/40 border border-purple-400/50"
                            : "bg-slate-900 text-slate-400 hover:text-purple-400 hover:bg-slate-800 border border-slate-800"
                        }`}
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        <span>É HUB ANJUN</span>
                      </button>

                      {p.manual_override && (
                        <button
                          onClick={() => handleResetClassificacao(p.ponto_colecao)}
                          title="Voltar ao padrão automático"
                          className="p-1.5 text-slate-500 hover:text-slate-300 rounded hover:bg-slate-800 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 flex justify-end bg-slate-950/60">
              <button
                onClick={() => setIsGerenciarModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-white transition-all cursor-pointer"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Viabilidade Rápida 100% Data-Driven */}
      <ViabilidadeModal
        isOpen={isViabilidadeModalOpen}
        onClose={() => setIsViabilidadeModalOpen(false)}
        onLocalizarNoMapa={(cidade, estado, lat, lng, hubProximo) => {
          if (lat && lng) {
            setSearchedLocation({
              latitude: lat,
              longitude: lng,
              display_name: `${cidade}${estado ? ` - ${estado}` : ""}`,
              tipo: "cidade",
              cidade: cidade,
              estado: estado,
              hub_mais_proximo: hubProximo,
            });
            setIsViabilidadeModalOpen(false);
          } else {
            geocodificarEndereco(`${cidade}, ${estado || ""}`).then((res) => {
              if (res.encontrado && res.latitude && res.longitude) {
                setSearchedLocation({
                  latitude: res.latitude,
                  longitude: res.longitude,
                  display_name: res.display_name || `${cidade} - ${estado || "BR"}`,
                  tipo: res.tipo || "cidade",
                  cidade: res.cidade || cidade,
                  estado: res.estado || estado,
                  hub_mais_proximo: res.hub_mais_proximo || hubProximo,
                  md_mais_proximo: res.md_mais_proximo,
                });
              }
              setIsViabilidadeModalOpen(false);
            });
          }
        }}
      />
    </div>
  );
}
