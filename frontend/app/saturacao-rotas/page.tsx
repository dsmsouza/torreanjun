"use client";

import React, { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Sidebar from "@/components/Sidebar";
import { 
  Gauge, 
  Truck, 
  User, 
  MapPin, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Package, 
  Clock, 
  Layers, 
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Filter,
  Search,
  RefreshCw,
  Loader2,
  FileSpreadsheet
} from "lucide-react";
import { getApiUrl } from "@/lib/api";

const SaturacaoMap = dynamic(() => import("@/components/rotas/SaturacaoMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[500px] flex flex-col items-center justify-center bg-[#0B0F19] rounded-2xl border border-border/60 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
      <span className="text-xs text-slate-400">Carregando mapa interativo da malha...</span>
    </div>
  ),
});

export default function SaturacaoRotasPage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [dataPayload, setDataPayload] = useState<any>(null);
  const [capacidadeVuc, setCapacidadeVuc] = useState<number>(2500);
  const [filtroStatus, setFiltroStatus] = useState<string>("TODOS");
  const [searchRota, setSearchRota] = useState<string>("");
  const [selectedRotaNome, setSelectedRotaNome] = useState<string>("Rota 34");

  // Sorting state for the main routes overview table
  const [sortKey, setSortKey] = useState<string>("total_volume_d0");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchData = async () => {
    setLoading(true);
    try {
      // Usa rota com fallback automático para snapshot estático na Vercel
      const url = `${getApiUrl()}/api/rotas/saturacao?capacidade_vuc=${capacidadeVuc}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setDataPayload(json);
        if (json.rotas && json.rotas.length > 0) {
          // Se rota atual não existe no novo resultado, seleciona a primeira
          const exists = json.rotas.some((r: any) => r.rota === selectedRotaNome);
          if (!exists) {
            setSelectedRotaNome(json.rotas[0].rota);
          }
        }
      } else {
        // Fallback direto para o snapshot se a API local não responder
        const fallbackRes = await fetch("/snapshot/rotas_saturacao.json");
        if (fallbackRes.ok) {
          const json = await fallbackRes.json();
          setDataPayload(json);
        }
      }
    } catch (err) {
      console.warn("Erro ao buscar API local, buscando snapshot estático:", err);
      try {
        const fallbackRes = await fetch("/snapshot/rotas_saturacao.json");
        if (fallbackRes.ok) {
          const json = await fallbackRes.json();
          setDataPayload(json);
        }
      } catch (e2) {
        console.error("Falha ao carregar dados de saturação:", e2);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [capacidadeVuc]);

  // Rota selecionada
  const rotas = dataPayload?.rotas || [];
  const summary = dataPayload?.summary || null;

  const rotaAtual = useMemo(() => {
    return rotas.find((r: any) => r.rota === selectedRotaNome) || rotas[0] || null;
  }, [rotas, selectedRotaNome]);

  // Filtragem de Rotas para a Tabela e Dropdown
  const rotasFiltradas = useMemo(() => {
    return rotas.filter((r: any) => {
      const matchStatus = filtroStatus === "TODOS" || r.status_d0 === filtroStatus;
      const matchSearch = searchRota === "" || 
        r.rota.toLowerCase().includes(searchRota.toLowerCase()) ||
        r.motorista.toLowerCase().includes(searchRota.toLowerCase()) ||
        r.placa.toLowerCase().includes(searchRota.toLowerCase()) ||
        r.regiao.toLowerCase().includes(searchRota.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [rotas, filtroStatus, searchRota]);

  // Ordenação da Tabela
  const rotasOrdenadas = useMemo(() => {
    return [...rotasFiltradas].sort((a, b) => {
      let valA = a[sortKey];
      let valB = b[sortKey];
      if (typeof valA === "string") valA = (valA || "").toLowerCase();
      if (typeof valB === "string") valB = (valB || "").toLowerCase();
      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rotasFiltradas, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="flex h-screen bg-[#07090E] text-slate-100 font-sans overflow-hidden">
      <Sidebar />

      <main className="flex-1 ml-16 md:ml-64 overflow-y-auto p-4 md:p-8 space-y-6">
        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/50 pb-5">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 mb-1">
              <Gauge className="w-5 h-5" />
              <span className="text-sm font-semibold tracking-wider uppercase">Controle Operacional & Capacidade VUC</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Saturação de Rotas & Cruzamento D-1
            </h1>
            <p className="text-slate-400 mt-1 max-w-3xl text-sm">
              Análise preditiva da taxa de ocupação dos veículos VUC cruzando o planejamento de hoje ({summary?.dia_planejado || "D-0"}) com os pacotes reais bipados no dia anterior ({summary?.dia_anterior || "D-1"}).
            </p>
          </div>

          {/* Barra de Parâmetros Rápidos */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-[#0C101B] px-3 py-2 rounded-xl border border-border/60 shadow-lg">
              <Truck className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-400">Capacidade VUC:</span>
              <input
                type="number"
                min={500}
                max={5000}
                step={100}
                value={capacidadeVuc}
                onChange={(e) => setCapacidadeVuc(Number(e.target.value))}
                className="w-20 bg-slate-900 text-white text-xs px-2 py-1 rounded border border-slate-700 font-bold focus:border-emerald-500 outline-none"
              />
              <span className="text-[11px] text-slate-500 font-bold">pct</span>
            </div>

            <button
              onClick={fetchData}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-2.5 rounded-xl transition-all shadow-lg active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Quadro Resumo Geral da Frota */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <div className="bg-[#0C101B] p-4 rounded-xl border border-red-500/20 shadow-md">
              <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider block">🔴 Rotas Críticas</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-white">{summary.rotas_criticas_d0}</span>
                <span className="text-xs text-red-400/80 font-bold">&gt;100% VUC</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Ontem: {summary.rotas_criticas_d1} rotas</span>
            </div>

            <div className="bg-[#0C101B] p-4 rounded-xl border border-orange-500/20 shadow-md">
              <span className="text-[11px] font-bold text-orange-400 uppercase tracking-wider block">🟠 Rotas em Alerta</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-white">{summary.rotas_alerta_d0}</span>
                <span className="text-xs text-orange-400/80 font-bold">80-100%</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Ontem: {summary.rotas_alerta_d1} rotas</span>
            </div>

            <div className="bg-[#0C101B] p-4 rounded-xl border border-emerald-500/20 shadow-md">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">🟢 Rotas Ideais</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-white">{summary.rotas_equilibradas_d0}</span>
                <span className="text-xs text-emerald-400/80 font-bold">50-80%</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Equilibradas</span>
            </div>

            <div className="bg-[#0C101B] p-4 rounded-xl border border-slate-700/40 shadow-md">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">⚪ Baixa Demanda</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-white">{summary.rotas_baixa_demanda_d0}</span>
                <span className="text-xs text-slate-400/80 font-bold">&lt;50%</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Capacidade ociosa</span>
            </div>

            <div className="bg-[#0C101B] p-4 rounded-xl border border-blue-500/20 shadow-md">
              <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider block">📦 Volume Hoje (D-0)</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-white">{summary.volume_total_d0.toLocaleString("pt-BR")}</span>
                <span className="text-xs text-blue-400/80 font-bold">pct</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Média: {summary.taxa_ocupacao_media_d0}%</span>
            </div>

            <div className="bg-[#0C101B] p-4 rounded-xl border border-purple-500/20 shadow-md">
              <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block">🔄 Volume Ontem (D-1)</span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-black text-white">{summary.volume_total_d1.toLocaleString("pt-BR")}</span>
                <span className="text-xs text-purple-400/80 font-bold">pct</span>
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">Realizado no D-1</span>
            </div>
          </div>
        )}

        {/* Seletor da Rota em Foco */}
        <div className="bg-[#0C101B] p-4 rounded-2xl border border-border/60 shadow-lg space-y-4">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Selecione a Rota:</span>
              <select
                value={selectedRotaNome}
                onChange={(e) => setSelectedRotaNome(e.target.value)}
                className="bg-slate-900 text-white font-bold text-sm px-3 py-2 rounded-xl border border-slate-700 hover:border-emerald-500 focus:border-emerald-500 outline-none cursor-pointer"
              >
                {rotas.map((r: any) => (
                  <option key={r.rota} value={r.rota}>
                    {r.rota} — {r.badge_d0} | {r.total_volume_d0} pct | {r.motorista} ({r.regiao})
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Status Pill da Rota Atual */}
            {rotaAtual && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold text-slate-400">
                  Veículo: <b className="text-white">{rotaAtual.tipo_carro}</b> ({rotaAtual.placa})
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  Motorista: <b className="text-emerald-400">{rotaAtual.motorista}</b>
                </span>
              </div>
            )}
          </div>

          {/* Cards de Métricas Detalhadas da Rota Selecionada */}
          {rotaAtual && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-border/40">
              <div className="bg-[#121826] p-3 rounded-xl border border-border/40">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Ocupação Estimada (D-0)</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-2xl font-black" style={{ color: rotaAtual.cor_hex }}>
                    {rotaAtual.ocupacao_d0_pct}%
                  </span>
                  <span className="text-xs text-slate-400">({rotaAtual.total_volume_d0} pct)</span>
                </div>
                <span className="text-[11px] font-bold block mt-0.5" style={{ color: rotaAtual.cor_hex }}>
                  {rotaAtual.badge_d0}
                </span>
              </div>

              <div className="bg-[#121826] p-3 rounded-xl border border-border/40">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Bipados Ontem (D-1 Real)</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-2xl font-black text-purple-400">
                    {rotaAtual.total_volume_d1}
                  </span>
                  <span className="text-xs text-slate-400">pct ({rotaAtual.ocupacao_d1_pct}%)</span>
                </div>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  {rotaAtual.badge_d1}
                </span>
              </div>

              <div className="bg-[#121826] p-3 rounded-xl border border-border/40">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Variação D-0 vs D-1</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className={`text-2xl font-black ${rotaAtual.variacao_vol >= 0 ? "text-emerald-400" : "text-amber-400"}`}>
                    {rotaAtual.variacao_vol > 0 ? `+${rotaAtual.variacao_vol}` : rotaAtual.variacao_vol}
                  </span>
                  <span className="text-xs text-slate-400">pct</span>
                </div>
                <span className="text-[11px] font-semibold text-slate-400 block mt-0.5">
                  {rotaAtual.variacao_pct > 0 ? `+${rotaAtual.variacao_pct}%` : `${rotaAtual.variacao_pct}%`} vs ontem
                </span>
              </div>

              <div className="bg-[#121826] p-3 rounded-xl border border-border/40">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Composição D-0</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-xl font-black text-white">{rotaAtual.bipada_d0}</span>
                  <span className="text-xs text-red-400 font-bold">+ {rotaAtual.backlog_d0} bk</span>
                </div>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  {rotaAtual.total_sacas > 0 ? `${rotaAtual.total_sacas} sacas` : "Sem sacas"}
                </span>
              </div>

              <div className="bg-[#121826] p-3 rounded-xl border border-border/40">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Paradas Agendadas</span>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-2xl font-black text-white">{rotaAtual.num_mds}</span>
                  <span className="text-xs text-slate-400">MDs</span>
                </div>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Região: {rotaAtual.regiao}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* MAPA COM TRAÇADO DO ITINERÁRIO */}
        {rotaAtual && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-400" />
                Traçado Vetorial da Rota: {rotaAtual.rota}
              </h2>
              <span className="text-xs text-slate-400 font-semibold">
                Mostrando sequência de paradas (#1 ➔ #{rotaAtual.stops.length})
              </span>
            </div>

            <SaturacaoMap
              stops={rotaAtual.stops}
              coordsPath={rotaAtual.coords_path}
              corHex={rotaAtual.cor_hex}
              rotaNome={rotaAtual.rota}
            />
          </div>
        )}

        {/* TABELA DE PARADAS DA ROTA SELECIONADA */}
        {rotaAtual && (
          <div className="bg-[#0C101B] rounded-2xl border border-border/60 shadow-xl overflow-hidden space-y-3 p-4">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                Itinerário & Comparativo Ponto a Ponto ({rotaAtual.rota})
              </h3>
              <span className="text-xs text-slate-400">
                Total de {rotaAtual.stops.length} pontos de coleta
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900/80 text-slate-400 border-b border-border/60 uppercase font-semibold">
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">IATA MD</th>
                    <th className="py-2.5 px-3">Endereço Completo</th>
                    <th className="py-2.5 px-3">Bairro / Cidade</th>
                    <th className="py-2.5 px-3">Horário Limite</th>
                    <th className="py-2.5 px-3 text-right">D-0 Hoje (pct)</th>
                    <th className="py-2.5 px-3 text-right">Bipados D-0</th>
                    <th className="py-2.5 px-3 text-right">Backlog D-0</th>
                    <th className="py-2.5 px-3 text-right text-purple-400">D-1 Ontem Real</th>
                    <th className="py-2.5 px-3 text-center">Status GPS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {rotaAtual.stops.map((stop: any) => (
                    <tr key={stop.seq} className="hover:bg-slate-900/50 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-emerald-400">#{stop.seq}</td>
                      <td className="py-2.5 px-3 font-bold text-white">{stop.iata}</td>
                      <td className="py-2.5 px-3 text-slate-300 max-w-[260px] truncate" title={stop.endereco}>
                        {stop.endereco}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{stop.bairro} - {stop.cidade}</td>
                      <td className="py-2.5 px-3 font-semibold text-amber-300">{stop.janela2 || stop.horario_limite || "—"}</td>
                      <td className="py-2.5 px-3 text-right font-black text-white">{stop.vol_d0}</td>
                      <td className="py-2.5 px-3 text-right text-slate-400">{stop.bipada_d0}</td>
                      <td className="py-2.5 px-3 text-right text-red-400 font-semibold">{stop.backlog_d0}</td>
                      <td className="py-2.5 px-3 text-right font-black text-purple-400">{stop.vol_d1}</td>
                      <td className="py-2.5 px-3 text-center">
                        {stop.lat && stop.lng ? (
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                            OK
                          </span>
                        ) : (
                          <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full font-bold">
                            Sem GPS
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TABELA GERAL DA FROTA (TODAS AS 90 ROTAS) */}
        <div className="bg-[#0C101B] rounded-2xl border border-border/60 shadow-xl overflow-hidden space-y-4 p-4 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                Quadro Geral de Saturação da Frota ({rotasFiltradas.length} de {rotas.length} rotas)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Classificação completa das rotas segundo a capacidade nominal de {capacidadeVuc.toLocaleString("pt-BR")} pacotes por VUC.
              </p>
            </div>

            {/* Filtros da Tabela */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar motorista, placa, rota..."
                  value={searchRota}
                  onChange={(e) => setSearchRota(e.target.value)}
                  className="bg-slate-900 text-xs text-white pl-9 pr-3 py-2 rounded-xl border border-slate-700 focus:border-emerald-500 outline-none w-56"
                />
              </div>

              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="bg-slate-900 text-xs text-white px-3 py-2 rounded-xl border border-slate-700 focus:border-emerald-500 outline-none font-semibold cursor-pointer"
              >
                <option value="TODOS">Todos os Níveis</option>
                <option value="CRÍTICO">🔴 Crítico (&gt;100%)</option>
                <option value="ALERTA">🟠 Alerta (80-100%)</option>
                <option value="EQUILIBRADO">🟢 Equilibrado (50-80%)</option>
                <option value="MODERADO">🔵 Moderado (20-50%)</option>
                <option value="BAIXA_DEMANDA">⚪ Baixa Demanda (&lt;20%)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900/80 text-slate-400 border-b border-border/60 uppercase font-semibold">
                  <th onClick={() => handleSort("rota")} className="py-3 px-3 cursor-pointer hover:text-white">
                    Rota {sortKey === "rota" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => handleSort("regiao")} className="py-3 px-3 cursor-pointer hover:text-white">
                    Região {sortKey === "regiao" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => handleSort("motorista")} className="py-3 px-3 cursor-pointer hover:text-white">
                    Motorista / Placa {sortKey === "motorista" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => handleSort("total_volume_d0")} className="py-3 px-3 text-right cursor-pointer hover:text-white">
                    Volume D-0 (Hoje) {sortKey === "total_volume_d0" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => handleSort("ocupacao_d0_pct")} className="py-3 px-3 text-right cursor-pointer hover:text-white">
                    % Ocupação D-0 {sortKey === "ocupacao_d0_pct" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => handleSort("total_volume_d1")} className="py-3 px-3 text-right cursor-pointer text-purple-400 hover:text-white">
                    Volume D-1 (Ontem) {sortKey === "total_volume_d1" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => handleSort("ocupacao_d1_pct")} className="py-3 px-3 text-right cursor-pointer text-purple-400 hover:text-white">
                    % Ocupação D-1 {sortKey === "ocupacao_d1_pct" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th onClick={() => handleSort("num_mds")} className="py-3 px-3 text-center cursor-pointer hover:text-white">
                    MDs {sortKey === "num_mds" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-center">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {rotasOrdenadas.map((r: any) => {
                  const isSelected = r.rota === selectedRotaNome;
                  return (
                    <tr
                      key={r.rota}
                      className={`hover:bg-slate-900/60 transition-colors ${isSelected ? "bg-slate-800/40 border-l-4 border-emerald-400" : ""}`}
                    >
                      <td className="py-3 px-3 font-bold text-white">{r.rota}</td>
                      <td className="py-3 px-3 text-slate-300">{r.regiao}</td>
                      <td className="py-3 px-3">
                        <span className="font-semibold text-white block">{r.motorista}</span>
                        <span className="text-[11px] text-slate-400">{r.tipo_carro} • {r.placa}</span>
                      </td>
                      <td className="py-3 px-3 text-right font-black text-white text-sm">
                        {r.total_volume_d0.toLocaleString("pt-BR")}
                        <span className="text-[10px] text-slate-400 block font-normal">
                          Bip: {r.bipada_d0} | Bk: {r.backlog_d0}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-black" style={{ color: r.cor_hex }}>
                        {r.ocupacao_d0_pct}%
                      </td>
                      <td className="py-3 px-3 text-right font-black text-purple-400 text-sm">
                        {r.total_volume_d1.toLocaleString("pt-BR")}
                      </td>
                      <td className="py-3 px-3 text-right font-black text-purple-300">
                        {r.ocupacao_d1_pct}%
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-slate-300">{r.num_mds}</td>
                      <td className="py-3 px-3 text-center">
                        <span
                          className="px-2.5 py-1 rounded-full text-[10px] font-bold shadow-sm inline-block"
                          style={{
                            backgroundColor: `${r.cor_hex}25`,
                            color: r.cor_hex,
                            border: `1px solid ${r.cor_hex}50`
                          }}
                        >
                          {r.status_d0}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => {
                            setSelectedRotaNome(r.rota);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                          className={`text-xs font-bold px-3 py-1 rounded-lg transition-all ${
                            isSelected
                              ? "bg-emerald-500 text-slate-950 shadow"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                          }`}
                        >
                          {isSelected ? "Em Foco" : "Ver Traçado"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
