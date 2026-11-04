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
  ArrowLeft, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  Users, 
  Package, 
  ExternalLink,
  ChevronRight,
  Filter,
  SlidersHorizontal,
  X,
  Check,
  Sparkles,
  GitFork,
  BarChart3,
  AlertTriangle,
  Flame,
  Globe,
  Ban,
  ShieldCheck,
  Navigation
} from "lucide-react";
import { fetchCockpitD1, CockpitD1Data, CockpitD1MD, salvarClassificacaoPonto, removerClassificacaoPonto, geocodificarEndereco } from "@/lib/api";
import ViabilidadeModal from "@/components/ViabilidadeModal";
import type { SearchedLocation } from "@/components/CockpitMap";

const CockpitMap = dynamic(() => import("@/components/CockpitMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[650px] rounded-2xl border border-slate-800 bg-[#090D16] flex flex-col items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-3" />
      <span className="text-sm text-slate-400 font-medium">Carregando mapa operacional da malha...</span>
    </div>
  ),
});

export default function MapaPage() {
  const [cockpitData, setCockpitData] = useState<CockpitD1Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDia, setSelectedDia] = useState<string>("");
  
  // 1. Modos de Visao Principais (Toggle Solicitado)
  const [modoVisao, setModoVisao] = useState<"OPERACAO_DIA" | "MALHA_ATIVA" | "INATIVOS_EXCLUIDOS">("OPERACAO_DIA");
  
  // 2. Filtro de Categorias Oficiais
  const [tipoFiltro, setTipoFiltro] = useState<"TODOS" | "MD" | "PA" | "HUB" | "PONTO_REDE">("TODOS");
  
  // 3. Filtro de Urgencia (Backlog)
  const [somenteBacklog, setSomenteBacklog] = useState(false);
  
  // 4. Busca Unificada (Ponto, Cidade, Endereço ou CEP)
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingGeocodificacao, setLoadingGeocodificacao] = useState(false);
  const [searchedLocation, setSearchedLocation] = useState<SearchedLocation | null>(null);

  // 5. Ponto Selecionado e Painel Lateral
  const [selectedPonto, setSelectedPonto] = useState<CockpitD1MD | null>(null);
  const [activeSideTab, setActiveSideTab] = useState<"volume" | "backlog" | "pas">("volume");
  
  // 6. Modais de Ação
  const [isGerenciarModalOpen, setIsGerenciarModalOpen] = useState(false);
  const [isViabilidadeModalOpen, setIsViabilidadeModalOpen] = useState(false);
  const [gerenciarSearch, setGerenciarSearch] = useState("");
  const [updatingClassificacao, setUpdatingClassificacao] = useState(false);

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
        setSearchTerm(q);
        handleGeocodificar(q);
      }
    }
  }, []);

  const handleGeocodificar = async (queryTexto?: string) => {
    const alvo = (queryTexto || searchTerm).trim();
    if (!alvo) return;
    setLoadingGeocodificacao(true);
    try {
      const res = await geocodificarEndereco(alvo);
      if (res.encontrado && res.latitude && res.longitude) {
        setSearchedLocation({
          latitude: res.latitude,
          longitude: res.longitude,
          display_name: res.display_name || alvo,
          tipo: res.tipo || "endereco",
          cidade: res.cidade,
          estado: res.estado,
          hub_mais_proximo: res.hub_mais_proximo,
          md_mais_proximo: res.md_mais_proximo,
        });
      }
    } catch (err) {
      console.error("Erro na geocodificacao:", err);
    } finally {
      setLoadingGeocodificacao(false);
    }
  };

  const handleDiaChange = (novoDia: string) => {
    setSelectedDia(novoDia);
    loadData(novoDia);
  };

  const handleToggleClassificacao = async (pontoCodigo: string, novoTipo: "MD" | "HUB" | "PA" | "PONTO_REDE") => {
    setUpdatingClassificacao(true);
    try {
      await salvarClassificacaoPonto(pontoCodigo, novoTipo as any);
      await loadData(selectedDia);
      setSelectedPonto((prev) =>
        prev && prev.ponto_colecao === pontoCodigo
          ? {
              ...prev,
              tipo_ponto: novoTipo,
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

  // Base completa de pontos recebida da API
  const todosPontos = useMemo(() => {
    return cockpitData?.mapa_pontos_plotaveis || [];
  }, [cockpitData]);

  // Contagens para os botões de modo de visão
  const countsVisao = useMemo(() => {
    const comVol = todosPontos.filter(p => p.status_operacao === "COM_VOLUME").length;
    const malhaAtiva = todosPontos.filter(p => p.status_cadastro === "ATIVO").length;
    const inativos = todosPontos.filter(p => p.status_cadastro === "INATIVO").length;
    return { comVol, malhaAtiva, inativos };
  }, [todosPontos]);

  // Filtro Inteligente Unificado
  const pontosFiltrados = useMemo(() => {
    return todosPontos.filter((p) => {
      // 1. Modo de Visao (Toggle)
      if (modoVisao === "OPERACAO_DIA") {
        if (p.status_operacao !== "COM_VOLUME") return false;
      } else if (modoVisao === "MALHA_ATIVA") {
        if (p.status_cadastro !== "ATIVO") return false;
      } else if (modoVisao === "INATIVOS_EXCLUIDOS") {
        if (p.status_cadastro !== "INATIVO") return false;
      }

      // 2. Categoria Oficial
      if (tipoFiltro !== "TODOS") {
        if (tipoFiltro === "PA") {
          if (p.tipo_ponto !== "PA" && p.tipo_ponto !== "PONTO_APOIO") return false;
        } else if (p.tipo_ponto !== tipoFiltro) {
          return false;
        }
      }

      // 3. Somente Alerta de Backlog
      if (somenteBacklog && !p.alerta_backlog) {
        return false;
      }

      // 4. Termo de Busca
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const match =
          (p.ponto_colecao || "").toLowerCase().includes(q) ||
          (p.nome_display || "").toLowerCase().includes(q) ||
          (p.cidade || "").toLowerCase().includes(q) ||
          (p.estado || "").toLowerCase().includes(q) ||
          (p.cep || "").includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [todosPontos, modoVisao, tipoFiltro, somenteBacklog, searchTerm]);

  // Contagens dinâmicas por categoria no escopo do modo de visão atual
  const countsCategorias = useMemo(() => {
    const escopo = todosPontos.filter(p => {
      if (modoVisao === "OPERACAO_DIA") return p.status_operacao === "COM_VOLUME";
      if (modoVisao === "MALHA_ATIVA") return p.status_cadastro === "ATIVO";
      if (modoVisao === "INATIVOS_EXCLUIDOS") return p.status_cadastro === "INATIVO";
      return true;
    });

    const mds = escopo.filter(p => p.tipo_ponto === "MD").length;
    const pas = escopo.filter(p => p.tipo_ponto === "PA" || p.tipo_ponto === "PONTO_APOIO").length;
    const hubs = escopo.filter(p => p.tipo_ponto === "HUB").length;
    const rede = escopo.filter(p => p.tipo_ponto === "PONTO_REDE").length;
    const alertas = escopo.filter(p => p.alerta_backlog).length;

    return { total: escopo.length, mds, pas, hubs, rede, alertas };
  }, [todosPontos, modoVisao]);

  // Agrupamentos para o Painel Lateral
  const rankingVolume = useMemo(() => {
    return [...pontosFiltrados]
      .filter(p => p.volume > 0)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 30);
  }, [pontosFiltrados]);

  const rankingBacklog = useMemo(() => {
    return [...pontosFiltrados]
      .filter(p => p.backlog > 0)
      .sort((a, b) => b.backlog - a.backlog)
      .slice(0, 30);
  }, [pontosFiltrados]);

  const listaPas = useMemo(() => {
    return [...pontosFiltrados]
      .filter(p => p.tipo_ponto === "PA" || p.tipo_ponto === "PONTO_APOIO")
      .sort((a, b) => b.volume - a.volume);
  }, [pontosFiltrados]);

  const totais = cockpitData?.totais;

  const modoLabelAtual = 
    modoVisao === "OPERACAO_DIA"
      ? "Operação do Dia"
      : modoVisao === "MALHA_ATIVA"
      ? "Malha Completa Cadastrada"
      : "Pontos Inativos / Excluídos";

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header com Navegação e Controles */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
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
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Visualização geográfica de MiniDrops (MD), Pontos Avançados (PAs Renner/Camicado/C&A) e HUBs centrais com status de backlog e coleta.
          </p>
        </div>

        {/* Data Operacional e Botões de Ação */}
        <div className="flex flex-wrap items-center gap-2.5">
          {cockpitData?.dias_disponiveis && cockpitData.dias_disponiveis.length > 0 && (
            <div className="flex items-center gap-2 bg-[#0C101B] border border-slate-800 px-3 py-1.5 rounded-xl">
              <span className="text-xs text-slate-400 font-medium">Data:</span>
              <select
                value={selectedDia}
                onChange={(e) => handleDiaChange(e.target.value)}
                className="bg-transparent text-xs sm:text-sm font-bold text-white focus:outline-none cursor-pointer"
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
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
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
            <span>⚡ Viabilidade</span>
          </button>

          <button
            onClick={() => setIsGerenciarModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold transition-all shadow-md cursor-pointer"
            title="Ajustar e classificar manualmente pontos"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Classificar</span>
          </button>
        </div>
      </div>

      {/* 2. Top Metric Cards */}
      {totais && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-[#0C101B] p-3.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wider">
              Total de Pedidos
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl lg:text-2xl font-black text-white font-mono">
                {totais.total_pedidos.toLocaleString("pt-BR")}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5" title="Total oficial auditado Anjun">
              {totais.total_pedidos_amostra && totais.total_pedidos_amostra !== totais.total_pedidos
                ? `Mapeados: ${totais.total_pedidos_amostra.toLocaleString("pt-BR")} pcts`
                : "volume oficial na data"}
            </p>
          </div>

          <div className="bg-[#0C101B] p-3.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] font-bold text-emerald-400 block uppercase tracking-wider">
              Coletados (Circuito)
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl lg:text-2xl font-black text-emerald-400 font-mono">
                {(totais.coletados ?? totais.total_coletado ?? 0).toLocaleString("pt-BR")}
              </span>
            </div>
            <p className="text-[10px] text-emerald-400 font-medium mt-0.5">
              {totais.taxa_coleta ?? totais.taxa_coleta_geral ?? 0}% taxa de coleta
            </p>
          </div>

          <div className="bg-[#0C101B] p-3.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] font-bold text-amber-400 block uppercase tracking-wider">
              Backlog Retido
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl lg:text-2xl font-black text-amber-400 font-mono">
                {(totais.backlog ?? totais.total_backlog ?? 0).toLocaleString("pt-BR")}
              </span>
            </div>
            <p className="text-[10px] text-amber-500 font-medium mt-0.5">
              {(100 - (totais.taxa_coleta ?? totais.taxa_coleta_geral ?? 0)).toFixed(1)}% aguardando van
            </p>
          </div>

          <div className="bg-[#0C101B] p-3.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] font-bold text-emerald-400 block uppercase tracking-wider">
              MiniDrops (MD)
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl lg:text-2xl font-black text-white font-mono">
                {countsCategorias.mds}
              </span>
            </div>
            <p className="text-[10px] text-emerald-400 mt-0.5">parceiros de balcão</p>
          </div>

          <div className="bg-[#0C101B] p-3.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] font-bold text-amber-400 block uppercase tracking-wider">
              PAs (Varejo / Mall)
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl lg:text-2xl font-black text-amber-400 font-mono">
                {countsCategorias.pas}
              </span>
            </div>
            <p className="text-[10px] text-amber-300 mt-0.5">Renner, Camicado, C&A</p>
          </div>

          <div className="bg-[#0C101B] p-3.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] font-bold text-purple-400 block uppercase tracking-wider">
              HUBs Centrais
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl lg:text-2xl font-black text-purple-400 font-mono">
                {countsCategorias.hubs}
              </span>
            </div>
            <p className="text-[10px] text-purple-300 mt-0.5">WR-GLP-01 e regionais</p>
          </div>
        </div>
      )}

      {/* 3. Painel de Controle Unificado do Mapa */}
      <div className="bg-[#0C101B] p-4 rounded-2xl border border-slate-800 space-y-3 shadow-xl">
        {/* Linha A: Toggle de Modo de Visão Principal + Busca Inteligente */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Toggle de Modos de Visão (3 Estados Solicitados) */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setModoVisao("OPERACAO_DIA")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modoVisao === "OPERACAO_DIA"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
              title="Exibe somente os pontos com volume movimentado no dia selecionado (mapa limpo e focado)"
            >
              <Flame className="w-3.5 h-3.5 text-emerald-300" />
              <span>Operação do Dia</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 font-mono">
                {countsVisao.comVol}
              </span>
            </button>

            <button
              onClick={() => setModoVisao("MALHA_ATIVA")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modoVisao === "MALHA_ATIVA"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
              title="Exibe todos os pontos cadastrados e ativos na rede (com ou sem volume)"
            >
              <Globe className="w-3.5 h-3.5 text-blue-300" />
              <span>Malha Ativa Completa</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 font-mono">
                {countsVisao.malhaAtiva}
              </span>
            </button>

            <button
              onClick={() => setModoVisao("INATIVOS_EXCLUIDOS")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modoVisao === "INATIVOS_EXCLUIDOS"
                  ? "bg-slate-700 text-rose-300 border border-rose-500/40 shadow-md"
                  : "text-slate-400 hover:text-rose-300 hover:bg-slate-800"
              }`}
              title="Exibe pontos que foram desativados, descredenciados ou excluídos da malha"
            >
              <Ban className="w-3.5 h-3.5 text-rose-400" />
              <span>Inativos / Excluídos</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30 font-mono">
                {countsVisao.inativos}
              </span>
            </button>
          </div>

          {/* Busca Multifuncional (IATA, Nome, Cidade, Endereço ou CEP) */}
          <div className="flex items-center gap-2 flex-1 lg:max-w-md">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por código MD, nome, cidade, endereço ou CEP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleGeocodificar();
                }}
                className="w-full pl-9 pr-8 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setSearchedLocation(null);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={() => handleGeocodificar()}
              disabled={loadingGeocodificacao || !searchTerm.trim()}
              className="px-3 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer shrink-0 shadow-md"
              title="Localizar endereço/CEP no mapa com marcador Google Maps"
            >
              <MapPin className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Localizar</span>
            </button>
          </div>
        </div>

        {/* Linha B: Filtros por Categoria Oficial Anjun + Alerta de Backlog */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
              Filtrar Tipo:
            </span>

            <button
              onClick={() => setTipoFiltro("TODOS")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                tipoFiltro === "TODOS"
                  ? "bg-slate-700 text-white shadow"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              Todos ({countsCategorias.total})
            </button>

            <button
              onClick={() => setTipoFiltro("MD")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                tipoFiltro === "MD"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/30"
                  : "text-emerald-400 hover:bg-emerald-950/40"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>MiniDrops ({countsCategorias.mds})</span>
            </button>

            <button
              onClick={() => setTipoFiltro("PA")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                tipoFiltro === "PA"
                  ? "bg-amber-600 text-white shadow-md shadow-amber-900/30"
                  : "text-amber-400 hover:bg-amber-950/40"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Pontos Avançados ({countsCategorias.pas})</span>
            </button>

            <button
              onClick={() => setTipoFiltro("HUB")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                tipoFiltro === "HUB"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-900/30"
                  : "text-purple-400 hover:bg-purple-950/40"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span>HUBs ANJUN ({countsCategorias.hubs})</span>
            </button>

            <button
              onClick={() => setTipoFiltro("PONTO_REDE")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                tipoFiltro === "PONTO_REDE"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
                  : "text-blue-400 hover:bg-blue-950/40"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>Rede ({countsCategorias.rede})</span>
            </button>
          </div>

          {/* Botão de Alerta Rápido de Backlog */}
          <button
            onClick={() => setSomenteBacklog(!somenteBacklog)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
              somenteBacklog
                ? "bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-900/30"
                : "bg-slate-900 text-rose-400 border-rose-500/30 hover:bg-rose-950/30"
            }`}
            title="Filtrar apenas pontos que estão com pacotes retidos precisando de coleta"
          >
            <AlertTriangle className={`w-3.5 h-3.5 ${somenteBacklog ? "animate-bounce" : ""}`} />
            <span>🚨 Apenas com Backlog ({countsCategorias.alertas})</span>
          </button>
        </div>
      </div>

      {/* 4. Grid Principal: Mapa Interativo + Painel Lateral de Raio-X */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Coluna Esquerda: Mapa Leaflet */}
        <div className="xl:col-span-8 space-y-3">
          <div className="bg-[#0C101B] p-2 rounded-2xl border border-slate-800 shadow-2xl relative">
            <CockpitMap
              pontos={pontosFiltrados}
              sellers={cockpitData?.sellers_mapa || []}
              height="650px"
              selectedPonto={selectedPonto}
              onSelectPonto={(p) => setSelectedPonto(p)}
              searchedLocation={searchedLocation}
              onClearSearchedLocation={() => setSearchedLocation(null)}
              onConsultarViabilidade={(cid, uf) => setIsViabilidadeModalOpen(true)}
              modoVisaoLabel={modoLabelAtual}
              modoVisaoCount={pontosFiltrados.length}
            />
          </div>

          {/* Rodapé Informativo do Mapa */}
          <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 px-1">
            <span>
              Mostrando <strong className="text-white">{pontosFiltrados.length}</strong> de{" "}
              <strong className="text-white">{todosPontos.length}</strong> pontos mapeados na malha.
            </span>
            <span className="text-[11px] text-slate-500">
              *Clique em qualquer ponto do mapa para abrir os detalhes e traçar rotas
            </span>
          </div>
        </div>

        {/* Coluna Direita: Raio-X Operacional da Malha */}
        <div className="xl:col-span-4 space-y-4">
          {/* Card Detalhe do Ponto Selecionado */}
          {selectedPonto ? (
            <div className="bg-gradient-to-b from-[#131926] to-[#0C101B] p-4 rounded-2xl border border-blue-500/40 shadow-2xl space-y-3 animate-in fade-in">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase ${
                        selectedPonto.status_cadastro === "INATIVO"
                          ? "bg-slate-700 text-slate-300 border border-slate-600"
                          : selectedPonto.tipo_ponto === "HUB"
                          ? "bg-purple-600/30 text-purple-300 border border-purple-500/30"
                          : selectedPonto.tipo_ponto === "PA"
                          ? "bg-amber-600/30 text-amber-300 border border-amber-500/30"
                          : "bg-emerald-600/30 text-emerald-300 border border-emerald-500/30"
                      }`}
                    >
                      {selectedPonto.status_cadastro === "INATIVO"
                        ? "⛔ Ponto Inativo / Excluído"
                        : selectedPonto.tipo_label}
                    </span>
                    {selectedPonto.alerta_backlog && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600/30 text-rose-300 border border-rose-500/40 animate-pulse">
                        🚨 ALERTA BACKLOG
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-white mt-1 leading-snug">
                    {selectedPonto.nome_display || selectedPonto.ponto_colecao}
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">
                    IATA / Código: <span className="text-white font-semibold">{selectedPonto.ponto_colecao}</span>
                  </p>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {selectedPonto.cidade || "N/A"}{selectedPonto.estado ? ` - ${selectedPonto.estado}` : ""} {selectedPonto.cep ? `(CEP ${selectedPonto.cep})` : ""}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedPonto(null)}
                  className="text-xs text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
                >
                  ✕
                </button>
              </div>

              {/* Grid de Métricas do Ponto */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase">Volume Bipado</span>
                  <span className="text-lg font-mono font-bold text-white">
                    {selectedPonto.volume.toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 block uppercase">Sellers Atendidos</span>
                  <span className="text-lg font-mono font-bold text-white">
                    {selectedPonto.qtd_sellers}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-emerald-400 block uppercase">Coletados (Circuito)</span>
                  <span className="text-lg font-mono font-bold text-emerald-400">
                    {selectedPonto.coletados.toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-rose-400 block uppercase">Backlog Retido</span>
                  <span className="text-lg font-mono font-bold text-rose-400">
                    {selectedPonto.backlog.toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>

              {/* Barra de Taxa de Coleta */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Taxa de Coleta do Ponto</span>
                  <span className="font-bold text-white">{selectedPonto.taxa_coleta}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      selectedPonto.taxa_coleta >= 80
                        ? "bg-emerald-500"
                        : selectedPonto.taxa_coleta >= 50
                        ? "bg-amber-500"
                        : "bg-rose-500"
                    }`}
                    style={{ width: `${Math.min(100, selectedPonto.taxa_coleta)}%` }}
                  />
                </div>
              </div>

              {/* Botões de Ação do Ponto */}
              <div className="flex items-center gap-2 pt-1">
                {selectedPonto.latitude && selectedPonto.longitude && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedPonto.latitude},${selectedPonto.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir Google Maps</span>
                  </a>
                )}
                <button
                  onClick={() => setIsGerenciarModalOpen(true)}
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all"
                  title="Alterar se este ponto é MD, PA ou HUB"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Classificação</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#0C101B] p-4 rounded-2xl border border-slate-800 text-center space-y-2">
              <MapPin className="w-8 h-8 text-blue-400/60 mx-auto" />
              <h4 className="text-sm font-bold text-white">Nenhum ponto selecionado</h4>
              <p className="text-xs text-slate-400">
                Clique em qualquer marcador do mapa ou escolha um ponto na lista abaixo para inspecionar os detalhes operacionais.
              </p>
            </div>
          )}

          {/* Abas da Lista Lateral: Top Volume, Alertas de Backlog, PAs */}
          <div className="bg-[#0C101B] rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
            <div className="flex border-b border-slate-800">
              <button
                onClick={() => setActiveSideTab("volume")}
                className={`flex-1 py-2.5 px-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeSideTab === "volume"
                    ? "bg-blue-950/40 text-blue-300 border-b-2 border-blue-500"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Top Volume ({rankingVolume.length})</span>
              </button>

              <button
                onClick={() => setActiveSideTab("backlog")}
                className={`flex-1 py-2.5 px-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeSideTab === "backlog"
                    ? "bg-rose-950/40 text-rose-300 border-b-2 border-rose-500"
                    : "text-slate-400 hover:text-rose-300"
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>Fila Backlog ({rankingBacklog.length})</span>
              </button>

              <button
                onClick={() => setActiveSideTab("pas")}
                className={`flex-1 py-2.5 px-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeSideTab === "pas"
                    ? "bg-amber-950/40 text-amber-300 border-b-2 border-amber-500"
                    : "text-slate-400 hover:text-amber-300"
                }`}
              >
                <Store className="w-3.5 h-3.5 text-amber-400" />
                <span>PAs & Lojas ({listaPas.length})</span>
              </button>
            </div>

            {/* Corpo da Lista Rolável */}
            <div className="p-3 max-h-[460px] overflow-y-auto space-y-2">
              {activeSideTab === "volume" && (
                rankingVolume.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">Nenhum ponto com volume no filtro.</p>
                ) : (
                  rankingVolume.map((p, idx) => (
                    <div
                      key={`vol-${p.ponto_colecao}-${idx}`}
                      onClick={() => setSelectedPonto(p)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        selectedPonto?.ponto_colecao === p.ponto_colecao
                          ? "bg-blue-950/40 border-blue-500 shadow-md shadow-blue-900/20"
                          : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] font-bold text-slate-400">#{idx + 1}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                p.tipo_ponto === "HUB"
                                  ? "bg-purple-900/60 text-purple-300"
                                  : p.tipo_ponto === "PA"
                                  ? "bg-amber-900/60 text-amber-300"
                                  : "bg-emerald-900/60 text-emerald-300"
                              }`}
                            >
                              {p.tipo_ponto}
                            </span>
                            <span className="font-mono text-xs font-bold text-white">{p.ponto_colecao}</span>
                          </div>
                          <h4 className="text-xs font-semibold text-slate-200 mt-0.5 line-clamp-1">
                            {p.nome_display || p.ponto_colecao}
                          </h4>
                          <p className="text-[10px] text-slate-400">{p.cidade} - {p.estado}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-mono font-bold text-white block">
                            {p.volume.toLocaleString("pt-BR")}
                          </span>
                          <span className="text-[10px] text-emerald-400 font-bold">{p.taxa_coleta}%</span>
                        </div>
                      </div>
                    </div>
                  ))
                )
              )}

              {activeSideTab === "backlog" && (
                rankingBacklog.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">Nenhum ponto com backlog pendente!</p>
                ) : (
                  rankingBacklog.map((p, idx) => (
                    <div
                      key={`bk-${p.ponto_colecao}-${idx}`}
                      onClick={() => setSelectedPonto(p)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        selectedPonto?.ponto_colecao === p.ponto_colecao
                          ? "bg-rose-950/40 border-rose-500 shadow-md shadow-rose-900/20"
                          : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-900/60 text-rose-300 border border-rose-700/50">
                              🚨 #{idx + 1}
                            </span>
                            <span className="font-mono text-xs font-bold text-white">{p.ponto_colecao}</span>
                          </div>
                          <h4 className="text-xs font-semibold text-slate-200 mt-0.5 line-clamp-1">
                            {p.nome_display || p.ponto_colecao}
                          </h4>
                          <p className="text-[10px] text-slate-400">{p.cidade} - {p.estado}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-mono font-bold text-rose-400 block">
                            {p.backlog.toLocaleString("pt-BR")}
                          </span>
                          <span className="text-[10px] text-slate-400">retidos</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] pt-1.5 mt-1.5 border-t border-slate-800/60">
                        <span className="text-slate-400">Total: {p.volume.toLocaleString("pt-BR")} pcts</span>
                        <span className="text-amber-400 font-bold">{p.taxa_coleta}% coletado</span>
                      </div>
                    </div>
                  ))
                )
              )}

              {activeSideTab === "pas" && (
                listaPas.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">Nenhum Ponto Avançado no filtro.</p>
                ) : (
                  listaPas.map((p, idx) => (
                    <div
                      key={`pa-${p.ponto_colecao}-${idx}`}
                      onClick={() => setSelectedPonto(p)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        selectedPonto?.ponto_colecao === p.ponto_colecao
                          ? "bg-amber-950/40 border-amber-500 shadow-md shadow-amber-900/20"
                          : "bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-900/60 text-amber-300 border border-amber-700/50">
                              PA #{idx + 1}
                            </span>
                            <span className="font-mono text-xs font-bold text-white">{p.ponto_colecao}</span>
                          </div>
                          <h4 className="text-xs font-semibold text-slate-200 mt-0.5 line-clamp-1">
                            {p.nome_display || p.ponto_colecao}
                          </h4>
                          <p className="text-[10px] text-slate-400">{p.cidade} - {p.estado}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-mono font-bold text-amber-300 block">
                            {p.volume.toLocaleString("pt-BR")}
                          </span>
                          <span className="text-[10px] text-emerald-400 font-bold">{p.taxa_coleta}%</span>
                        </div>
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
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-purple-400" />
                  Gerenciar Classificação dos Pontos (MD, PA, HUB)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Defina o tipo real de cada ponto da rede. Seus ajustes têm prioridade absoluta sobre o cálculo automático e ficam salvos no banco.
                </p>
              </div>
              <button
                onClick={() => setIsGerenciarModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-800 bg-slate-900/40">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Pesquisar ponto por IATA, nome ou cidade para classificar..."
                  value={gerenciarSearch}
                  onChange={(e) => setGerenciarSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>

            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {todosPontos
                .filter((p) => {
                  if (!gerenciarSearch.trim()) return true;
                  const term = gerenciarSearch.toLowerCase();
                  return (
                    (p.ponto_colecao || "").toLowerCase().includes(term) ||
                    (p.nome_display || "").toLowerCase().includes(term) ||
                    (p.cidade || "").toLowerCase().includes(term)
                  );
                })
                .slice(0, 50)
                .map((p, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-white">{p.ponto_colecao}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.tipo_ponto === "HUB"
                              ? "bg-purple-900/60 text-purple-300"
                              : p.tipo_ponto === "PA"
                              ? "bg-amber-900/60 text-amber-300"
                              : "bg-emerald-900/60 text-emerald-300"
                          }`}
                        >
                          {p.tipo_label}
                        </span>
                        {p.manual_override && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-900/60 text-blue-300 border border-blue-700/50">
                            Ajuste Manual
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 mt-1 font-medium">{p.nome_display || p.ponto_colecao}</p>
                      <p className="text-[10px] text-slate-400">{p.cidade} - {p.estado} • {p.volume.toLocaleString("pt-BR")} pcts</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleToggleClassificacao(p.ponto_colecao, "MD")}
                        disabled={updatingClassificacao}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          p.tipo_ponto === "MD"
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-800 text-emerald-400 hover:bg-emerald-950/40"
                        }`}
                      >
                        MD
                      </button>

                      <button
                        onClick={() => handleToggleClassificacao(p.ponto_colecao, "PA")}
                        disabled={updatingClassificacao}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          p.tipo_ponto === "PA"
                            ? "bg-amber-600 text-white"
                            : "bg-slate-800 text-amber-400 hover:bg-amber-950/40"
                        }`}
                      >
                        PA
                      </button>

                      <button
                        onClick={() => handleToggleClassificacao(p.ponto_colecao, "HUB")}
                        disabled={updatingClassificacao}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          p.tipo_ponto === "HUB"
                            ? "bg-purple-600 text-white"
                            : "bg-slate-800 text-purple-400 hover:bg-purple-950/40"
                        }`}
                      >
                        HUB
                      </button>

                      {p.manual_override && (
                        <button
                          onClick={() => handleResetClassificacao(p.ponto_colecao)}
                          disabled={updatingClassificacao}
                          className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
                          title="Restaurar padrão automático"
                        >
                          Restaurar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Viabilidade Operacional */}
      <ViabilidadeModal
        isOpen={isViabilidadeModalOpen}
        onClose={() => setIsViabilidadeModalOpen(false)}
        initialCidade={searchedLocation?.cidade || ""}
        initialEstado={searchedLocation?.estado || ""}
      />
    </div>
  );
}
