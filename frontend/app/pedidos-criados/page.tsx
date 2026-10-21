"use client";

import React, { useEffect, useState, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import { 
  Activity, 
  MapPin, 
  Package,
  Calendar,
  Store,
  TrendingUp,
  Award,
  Truck,
  UserCheck,
  Sparkles,
  Layers,
  Building,
  Search,
  RefreshCw,
  Clock,
  PlusCircle
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from "recharts";

export default function PedidosCriadosPage() {
  const [dataOperacao, setDataOperacao] = useState<string>(
    new Date().toISOString().split("T")[0] // YYYY-MM-DD
  );
  
  const [loading, setLoading] = useState<boolean>(true);
  const [dados, setDados] = useState<any>(null);
  const [cidades, setCidades] = useState<string[]>([]);
  const [cidadeFiltro, setCidadeFiltro] = useState<string>("todas");
  const [searchTerm, setSearchTerm] = useState<string>("");

  // Sorting state for Novos Sellers Pickup
  const [sortNovosKey, setSortNovosKey] = useState<string>("volume");
  const [sortNovosDir, setSortNovosDir] = useState<"asc" | "desc">("desc");

  // Sorting state for Top Sellers
  const [sortTopKey, setSortTopKey] = useState<string>("volume");
  const [sortTopDir, setSortTopDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    fetch("http://localhost:8000/api/opcoes")
      .then(res => res.json())
      .then(data => {
        if (data.cidades) setCidades(data.cidades);
      })
      .catch(console.error);
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const parts = dataOperacao.split("-");
      const dtFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
      
      const res = await fetch(`http://localhost:8000/api/pedidos-criados/dashboard?data=${dtFormatted}`);
      const json = await res.json();
      setDados(json);
    } catch (e) {
      console.error("Erro ao carregar Pedidos Criados:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dataOperacao]);

  const dropoff = dados?.modalidades?.["Entrega Porta a Porta (Dropoff)"] || dados?.modalidades?.["Entrega Porta a Porta"] || { volume: 0, sellers: 0, percentual: 0 };
  const pickup = dados?.modalidades?.["Coleta Porta a Porta (Pickup)"] || dados?.modalidades?.["Coleta Porta a Porta"] || { volume: 0, sellers: 0, percentual: 0 };

  // Sort helper function
  const sortData = (items: any[], key: string, dir: "asc" | "desc") => {
    if (!items || !Array.isArray(items)) return [];
    return [...items].sort((a, b) => {
      let valA = a[key];
      let valB = b[key];

      if (typeof valA === "string") valA = (valA || "").toLowerCase();
      if (typeof valB === "string") valB = (valB || "").toLowerCase();

      if (valA < valB) return dir === "asc" ? -1 : 1;
      if (valA > valB) return dir === "asc" ? 1 : -1;
      return 0;
    });
  };

  const handleNovosSort = (key: string) => {
    if (sortNovosKey === key) {
      setSortNovosDir(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortNovosKey(key);
      setSortNovosDir("desc");
    }
  };

  const handleTopSort = (key: string) => {
    if (sortTopKey === key) {
      setSortTopDir(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortTopKey(key);
      setSortTopDir("desc");
    }
  };

  // Filter Novos Sellers Pickup by Cidade & SearchTerm
  const filteredNovosSellers = useMemo(() => {
    if (!dados?.novos_sellers_pickup) return [];
    let list = dados.novos_sellers_pickup;

    if (cidadeFiltro !== "todas") {
      list = list.filter((item: any) => (item.cidade || "").toLowerCase() === cidadeFiltro.toLowerCase());
    }

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      list = list.filter((item: any) => 
        (item.merchant_nome || "").toLowerCase().includes(term) ||
        (item.merchant_id || "").toLowerCase().includes(term) ||
        (item.cidade || "").toLowerCase().includes(term) ||
        (item.bairro || "").toLowerCase().includes(term) ||
        (item.cliente || "").toLowerCase().includes(term)
      );
    }

    return sortData(list, sortNovosKey, sortNovosDir);
  }, [dados?.novos_sellers_pickup, cidadeFiltro, searchTerm, sortNovosKey, sortNovosDir]);

  // Filter Ranking Sellers by Cidade & SearchTerm
  const filteredRankingSellers = useMemo(() => {
    if (!dados?.ranking_sellers) return [];
    let list = dados.ranking_sellers;

    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      list = list.filter((item: any) => 
        (item.nome || "").toLowerCase().includes(term) ||
        (item.id || "").toLowerCase().includes(term) ||
        (item.cliente || "").toLowerCase().includes(term) ||
        (item.estado || "").toLowerCase().includes(term)
      );
    }

    return sortData(list, sortTopKey, sortTopDir);
  }, [dados?.ranking_sellers, searchTerm, sortTopKey, sortTopDir]);

  const renderSortableHeader = (label: string, colKey: string, currentKey: string, currentDir: "asc" | "desc", onSort: (key: string) => void, align: "left" | "right" | "center" = "left") => (
    <th 
      onClick={() => onSort(colKey)} 
      className={`py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors text-${align}`}
    >
      <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
        <span>{label}</span>
        <span className="text-[10px] font-bold text-emerald-400">
          {currentKey === colKey ? (currentDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </div>
    </th>
  );

  return (
    <div className="flex h-screen bg-[#07090E] text-slate-100 font-sans overflow-hidden">
      <Sidebar />

      <main className="flex-1 ml-16 md:ml-64 overflow-y-auto p-4 md:p-8 space-y-6">
        {/* Header Title */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/50 pb-5">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 mb-1">
              <Package className="w-5 h-5" />
              <span className="text-sm font-semibold tracking-wider uppercase">Entrada & Cargas</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Pedidos Criados no Dia
            </h1>
            <p className="text-slate-400 mt-1 max-w-3xl text-sm">
              Visão analítica dos pedidos gerados, separação entre **Entrega Porta a Porta** e **Coleta Porta a Porta**, acompanhamento de **Sellers Novos (Inéditos)** e **pesquisa por Cidade**.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-[#0C101B] border border-border/60 rounded-xl px-3 py-2 text-xs">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400 font-semibold">Data Base:</span>
              <input
                type="date"
                value={dataOperacao}
                onChange={(e) => setDataOperacao(e.target.value)}
                className="bg-transparent text-white font-bold outline-none font-mono cursor-pointer"
              />
            </div>

            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#131926] hover:bg-[#1A2234] border border-border text-xs font-medium text-slate-200 transition-all hover:scale-105 active:scale-95 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Info Banner: Horário da Última Atualização & Saldo Incremental */}
        {dados && (
          <div className="bg-[#0C101B] border border-emerald-500/30 bg-gradient-to-r from-emerald-950/20 via-[#0C101B] to-[#0C101B] p-4 rounded-2xl shadow-lg flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Última Atualização da Planilha</span>
                <span className="text-sm font-bold text-white font-mono">{dados.hora_ultima_atualizacao}</span>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Novos Pedidos (Desde a última carga)</span>
                  <span className="text-base font-black text-emerald-400">
                    +{dados.volume_incremental?.toLocaleString("pt-BR") || 0} pedidos
                  </span>
                </div>
              </div>

              <div className="hidden sm:block text-right text-xs text-slate-400 font-mono">
                Volume Anterior: <strong className="text-slate-200">{dados.volume_anterior?.toLocaleString("pt-BR") || 0}</strong>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar de Pesquisa por Cidade e Filtro Global */}
        <div className="bg-[#0C101B] p-4 rounded-2xl border border-border/60 shadow-lg flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Building className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Filtrar por Cidade:</span>
              <select
                value={cidadeFiltro}
                onChange={(e) => setCidadeFiltro(e.target.value)}
                className="bg-[#131926] border border-border/60 text-xs text-slate-200 rounded-xl px-3 py-1.5 outline-none focus:border-emerald-500 font-semibold"
              >
                <option value="todas">Todas as Cidades ({cidades.length})</option>
                {cidades.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Pesquisar por Cidade, Seller, Bairro ou Cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#131926] border border-border/60 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-20">
            <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
          </div>
        ) : dados ? (
          <>
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Volume Total Criado */}
              <div className="bg-[#0C101B] p-5 rounded-2xl border border-border/60 shadow-lg flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total Pedidos Criados</span>
                  <Package className="w-5 h-5 text-emerald-400 opacity-80" />
                </div>
                <div>
                  <span className="text-2xl font-black text-white">{dados.resumo?.volume_total?.toLocaleString("pt-BR")}</span>
                  <p className="text-[11px] text-slate-400 mt-1">Volume geral emitido no dia</p>
                </div>
              </div>

              {/* Sellers Ativos */}
              <div className="bg-[#0C101B] p-5 rounded-2xl border border-border/60 border-l-4 border-l-indigo-500 shadow-lg flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Sellers com Pedidos</span>
                  <Store className="w-5 h-5 text-indigo-400 opacity-80" />
                </div>
                <div>
                  <span className="text-2xl font-black text-indigo-400">{dados.resumo?.total_sellers?.toLocaleString("pt-BR")}</span>
                  <p className="text-[11px] text-slate-400 mt-1">Lojas ativas emitindo pacotes</p>
                </div>
              </div>

              {/* Coleta Porta a Porta (Pickup) */}
              <div className="bg-[#0C101B] p-5 rounded-2xl border border-border/60 border-l-4 border-l-amber-500 shadow-lg flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-amber-400 text-xs font-bold uppercase tracking-wider">Coleta Porta a Porta</span>
                  <Truck className="w-5 h-5 text-amber-400 opacity-80" />
                </div>
                <div>
                  <span className="text-2xl font-black text-amber-300">{pickup.volume?.toLocaleString("pt-BR")}</span>
                  <p className="text-[11px] text-amber-400/80 mt-1">
                    {pickup.sellers} sellers ({pickup.percentual}% do total)
                  </p>
                </div>
              </div>

              {/* Novos Sellers Pickup (Inéditos) */}
              <div className="bg-[#0C101B] p-5 rounded-2xl border border-border/60 border-l-4 border-l-rose-500 shadow-lg flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-rose-400 text-xs font-bold uppercase tracking-wider">Sellers Novos de Coleta</span>
                  <Sparkles className="w-5 h-5 text-rose-400 opacity-80" />
                </div>
                <div>
                  <span className="text-2xl font-black text-rose-300">{dados.resumo?.novos_sellers_pickup_count || 0}</span>
                  <p className="text-[11px] text-rose-400/80 mt-1">
                    {dados.resumo?.novos_sellers_pickup_volume?.toLocaleString("pt-BR")} pedidos de novos sellers
                  </p>
                </div>
              </div>
            </div>

            {/* TABELA: Sellers Novos de Coleta Porta a Porta (Inéditos) */}
            <div className="bg-[#0C101B] p-6 rounded-2xl border border-border/60 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-rose-400" />
                  <h3 className="font-bold text-white text-base">
                    Sellers Novos de Coleta Porta a Porta (Inéditos na Base)
                  </h3>
                </div>
                <span className="text-xs text-slate-400">
                  Lojas de coleta que **NUNCA** emitiram pedidos anteriormente. Mostrando: {filteredNovosSellers.length} sellers
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/50 max-h-[350px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-[#131926] text-slate-400 uppercase tracking-wider font-semibold border-b border-border/60">
                    <tr>
                      {renderSortableHeader("ID Merchant", "merchant_id", sortNovosKey, sortNovosDir, handleNovosSort)}
                      {renderSortableHeader("Nome da Loja / Seller", "merchant_nome", sortNovosKey, sortNovosDir, handleNovosSort)}
                      {renderSortableHeader("Endereço de Coleta (Pickup)", "endereco_completo", sortNovosKey, sortNovosDir, handleNovosSort)}
                      {renderSortableHeader("Canal / Cliente", "cliente", sortNovosKey, sortNovosDir, handleNovosSort)}
                      {renderSortableHeader("Volume Emitido", "volume", sortNovosKey, sortNovosDir, handleNovosSort, "right")}
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {filteredNovosSellers.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          Nenhum seller inédito encontrado para os filtros selecionados.
                        </td>
                      </tr>
                    ) : (
                      filteredNovosSellers.map((s: any, idx: number) => (
                        <tr key={idx} className="hover:bg-[#131926]/50 transition-colors">
                          <td className="py-3 px-4 font-mono font-semibold text-rose-400">{s.merchant_id}</td>
                          <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                            <Store className="w-4 h-4 text-amber-400 shrink-0" />
                            <span>{s.merchant_nome}</span>
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            <p className="font-semibold text-white">{s.cidade || 'N/A'} / {s.estado || 'SP'}</p>
                            <p className="text-[11px] text-slate-400 truncate max-w-xs">{s.endereco_completo || 'Endereço Não Informado'}</p>
                          </td>
                          <td className="py-3 px-4 text-slate-300 font-semibold">{s.cliente}</td>
                          <td className="py-3 px-4 text-right font-bold text-amber-300">{s.volume?.toLocaleString("pt-BR")}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              🆕 Inédito
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Breakdown de Novos Sellers por Estado */}
            {dados.novos_sellers_por_estado && dados.novos_sellers_por_estado.length > 0 && (
              <div className="bg-[#0C101B] p-6 rounded-2xl border border-border/60 shadow-lg space-y-4">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-indigo-400" />
                  Distribuição de Sellers Novos de Coleta por Estado (UF)
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {dados.novos_sellers_por_estado.map((item: any) => (
                    <div key={item.uf} className="bg-[#131926] p-3 rounded-xl border border-border/50 text-center">
                      <span className="text-xs font-bold text-indigo-400 font-mono block">{item.uf}</span>
                      <span className="text-lg font-black text-white">{item.sellers} sellers</span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">{item.volume?.toLocaleString("pt-BR")} pedidos</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TABELA: Ranking Geral de Sellers */}
            <div className="bg-[#0C101B] p-6 rounded-2xl border border-border/60 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3">
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  Ranking Geral de Sellers (Top Emitentes)
                </h3>
                <span className="text-xs text-slate-400">
                  Mostrando: {filteredRankingSellers.length} lojas
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/50 max-h-[350px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-[#131926] text-slate-400 uppercase tracking-wider font-semibold border-b border-border/60">
                    <tr>
                      {renderSortableHeader("Loja / Seller", "nome", sortTopKey, sortTopDir, handleTopSort)}
                      {renderSortableHeader("Endereço / Localização", "endereco_completo", sortTopKey, sortTopDir, handleTopSort)}
                      {renderSortableHeader("Canal", "cliente", sortTopKey, sortTopDir, handleTopSort)}
                      {renderSortableHeader("Modalidade", "modalidade", sortTopKey, sortTopDir, handleTopSort)}
                      {renderSortableHeader("Volume Emitido", "volume", sortTopKey, sortTopDir, handleTopSort, "right")}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {filteredRankingSellers.map((s: any, idx: number) => (
                      <tr key={idx} className="hover:bg-[#131926]/50 transition-colors">
                        <td className="py-3 px-4 font-bold text-white">
                          <p>{s.nome}</p>
                          <p className="text-[10px] text-slate-400 font-mono">ID: {s.id}</p>
                        </td>
                        <td className="py-3 px-4 text-slate-300">
                          <p className="font-semibold text-white">{s.cidade || "N/A"} / {s.estado || "SP"}</p>
                          <p className="text-[11px] text-slate-400 truncate max-w-xs">{s.endereco_completo || 'N/A'}</p>
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-200">{s.cliente}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${s.is_pickup ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-blue-500/20 text-blue-300 border-blue-500/40'}`}>
                            {s.modalidade}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">{s.volume?.toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center p-20 text-slate-400">
            Nenhum dado encontrado para a data selecionada.
          </div>
        )}
      </main>
    </div>
  );
}
