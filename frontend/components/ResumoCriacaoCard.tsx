"use client";
import React, { useEffect, useState, useMemo } from "react";
import { 
  TrendingUp, X, MapPin, Store, Package, Layers, 
  Filter, Search, RotateCcw, FileText, CheckCircle, Sparkles
} from "lucide-react";

interface RawDataRow {
  vol: number;
  uf: string;
  cli: string;
  mod: string;
  sell: string;
  tipo?: string;
  status?: string;
}

interface UltimaIngestao {
  status: string;
  message?: string;
  dia_base?: string;
  ultima_ingestao_horario?: string;
  total_pedidos?: number;
  total_sellers?: number;
  estados?: { nome: string; valor: number }[];
  clientes?: { nome: string; valor: number }[];
  sellers?: { nome: string; valor: number }[];
  modalidades?: { nome: string; valor: number }[];
  tipos_pedido?: { nome: string; valor: number }[];
  status_counts?: { nome: string; valor: number }[];
  raw_data?: RawDataRow[];
}

export default function ResumoCriacaoCard() {
  const [data, setData] = useState<UltimaIngestao | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Estados de Filtros Interativos
  const [filtroModalidade, setFiltroModalidade] = useState<string | null>(null);
  const [filtroCliente, setFiltroCliente] = useState<string | null>(null);
  const [filtroTipoPedido, setFiltroTipoPedido] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string | null>(null);
  const [filtroSeller, setFiltroSeller] = useState<string | null>(null);
  const [searchSeller, setSearchSeller] = useState<string>("");

  const carregar = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/api/config/ultima-ingestao");
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
    const interval = setInterval(carregar, 300000);
    return () => clearInterval(interval);
  }, []);

  const raw = useMemo(() => data?.raw_data || [], [data]);

  // Aplicação dos filtros em tempo real
  const filteredRaw = useMemo(() => {
    return raw.filter((r) => {
      if (filtroModalidade && r.mod.toLowerCase() !== filtroModalidade.toLowerCase()) return false;
      if (filtroCliente && r.cli.toLowerCase() !== filtroCliente.toLowerCase()) return false;
      if (filtroTipoPedido && (r.tipo || "Normal").toLowerCase() !== filtroTipoPedido.toLowerCase()) return false;
      if (filtroStatus && (r.status || "Criado").toLowerCase() !== filtroStatus.toLowerCase()) return false;
      if (filtroEstado && r.uf.toUpperCase() !== filtroEstado.toUpperCase()) return false;
      if (filtroSeller && r.sell.toLowerCase() !== filtroSeller.toLowerCase()) return false;
      return true;
    });
  }, [raw, filtroModalidade, filtroCliente, filtroTipoPedido, filtroStatus, filtroEstado, filtroSeller]);

  // Função genérica de agregação
  const getAggregated = (key: keyof RawDataRow, defaultFallback: string = "Outros", excludeInvalid: boolean = false) => {
    const counts: Record<string, number> = {};
    filteredRaw.forEach((r) => {
      let val = (r[key] as string) || defaultFallback;
      if (excludeInvalid) {
        const vLow = val.toLowerCase().trim();
        if (!val || vLow === "nan" || vLow === "n/a" || vLow === "desconhecido" || vLow === "") {
          return;
        }
      }
      counts[val] = (counts[val] || 0) + r.vol;
    });
    return Object.entries(counts)
      .map(([nome, valor]) => ({ nome, valor }))
      .sort((a, b) => b.valor - a.valor);
  };

  const modalidadesList = useMemo(() => getAggregated("mod", "Não Informada"), [filteredRaw]);
  const clientesList = useMemo(() => getAggregated("cli", "Outros"), [filteredRaw]);
  const tiposPedidoList = useMemo(() => getAggregated("tipo", "Normal"), [filteredRaw]);
  const statusList = useMemo(() => getAggregated("status", "Criado"), [filteredRaw]);
  const estadosList = useMemo(() => getAggregated("uf", "Outros"), [filteredRaw]);
  const sellersList = useMemo(() => {
    const list = getAggregated("sell", "Desconhecido", true);
    if (!searchSeller.trim()) return list;
    const term = searchSeller.toLowerCase().trim();
    return list.filter((s) => s.nome.toLowerCase().includes(term));
  }, [filteredRaw, searchSeller]);

  const totalPedidosFiltrados = useMemo(() => {
    return filteredRaw.reduce((acc, r) => acc + r.vol, 0);
  }, [filteredRaw]);

  const totalSellersFiltrados = useMemo(() => {
    const valid = new Set(
      filteredRaw
        .map((r) => r.sell)
        .filter((s) => s && !["nan", "n/a", "desconhecido", ""].includes(s.toLowerCase().trim()))
    );
    return valid.size;
  }, [filteredRaw]);

  const temFiltroAtivo = Boolean(
    filtroModalidade || filtroCliente || filtroTipoPedido || filtroStatus || filtroEstado || filtroSeller
  );

  const limparTodosFiltros = () => {
    setFiltroModalidade(null);
    setFiltroCliente(null);
    setFiltroTipoPedido(null);
    setFiltroStatus(null);
    setFiltroEstado(null);
    setFiltroSeller(null);
    setSearchSeller("");
  };

  if (loading && !data) return null;
  if (!data || data.status === "empty") return null;

  return (
    <>
      {/* Banner Principal do Card */}
      <div
        onClick={() => setIsModalOpen(true)}
        className="bg-gradient-to-r from-blue-600/20 via-indigo-600/20 to-purple-600/20 border border-blue-500/30 hover:border-blue-500/60 rounded-2xl p-4.5 flex items-center justify-between cursor-pointer hover:from-blue-600/30 hover:to-purple-600/30 transition-all shadow-lg backdrop-blur-md group mt-4 mb-3"
      >
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-tr from-blue-600 to-indigo-500 p-3 rounded-xl group-hover:scale-105 transition-transform shadow-md">
            <TrendingUp className="text-white" size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-white font-bold text-base md:text-lg flex items-center gap-2">
                Última Ingestão de Criação ({data.dia_base})
              </h3>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                Intraday Ativo
              </span>
            </div>
            <p className="text-slate-300 text-xs md:text-sm mt-1 flex flex-wrap items-center gap-2">
              <span>
                <strong className="text-white font-bold">{data.total_pedidos?.toLocaleString("pt-BR")}</strong> pedidos criados
              </span>
              <span className="text-slate-600">•</span>
              <span>
                <strong className="text-white font-bold">{data.total_sellers?.toLocaleString("pt-BR")}</strong> sellers únicos
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-slate-400 text-xs">Atualizado às {data.ultima_ingestao_horario}</span>
            </p>
          </div>
        </div>
        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs md:text-sm font-semibold rounded-xl transition-all shadow-md flex items-center gap-1.5 group-hover:shadow-blue-500/25">
          <Sparkles size={15} />
          <span>Ver Detalhes & Filtros</span>
        </button>
      </div>

      {/* MODAL EXPANDIDO COM MULTI-FILTRO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/75 z-[100] flex items-center justify-center p-3 md:p-6 backdrop-blur-md animate-fadeIn">
          <div className="bg-[#0f1422] border border-slate-700/60 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            
            {/* Header do Modal */}
            <div className="p-5 border-b border-slate-800/80 bg-slate-900/60 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2.5">
                      <TrendingUp className="text-blue-400" size={24} />
                      Detalhes da Criação de Pedidos
                    </h2>
                    <span className="px-2.5 py-0.5 bg-blue-500/20 border border-blue-500/40 text-blue-300 rounded-lg text-xs font-semibold">
                      {data.dia_base}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs md:text-sm mt-1">
                    Clique em qualquer item (Modalidade, Cliente, Tipo, Status, Estado ou Seller) para filtrar dinamicamente todas as métricas.
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700 p-2 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Barra de Filtros Ativos & Estatísticas Filtradas */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/50">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <Filter size={13} className="text-blue-400" />
                    Filtros:
                  </span>
                  {!temFiltroAtivo && (
                    <span className="text-xs text-slate-500 italic">Nenhum filtro ativo (exibindo total geral)</span>
                  )}
                  {filtroModalidade && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-500/20 border border-blue-500/40 text-blue-300">
                      Modalidade: <strong className="text-white">{filtroModalidade}</strong>
                      <button onClick={() => setFiltroModalidade(null)} className="hover:text-red-400 ml-1"><X size={12} /></button>
                    </span>
                  )}
                  {filtroCliente && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-purple-500/20 border border-purple-500/40 text-purple-300">
                      Cliente: <strong className="text-white">{filtroCliente}</strong>
                      <button onClick={() => setFiltroCliente(null)} className="hover:text-red-400 ml-1"><X size={12} /></button>
                    </span>
                  )}
                  {filtroTipoPedido && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500/20 border border-amber-500/40 text-amber-300">
                      Tipo: <strong className="text-white">{filtroTipoPedido}</strong>
                      <button onClick={() => setFiltroTipoPedido(null)} className="hover:text-red-400 ml-1"><X size={12} /></button>
                    </span>
                  )}
                  {filtroStatus && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                      Status: <strong className="text-white">{filtroStatus}</strong>
                      <button onClick={() => setFiltroStatus(null)} className="hover:text-red-400 ml-1"><X size={12} /></button>
                    </span>
                  )}
                  {filtroEstado && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-500/20 border border-cyan-500/40 text-cyan-300">
                      UF: <strong className="text-white">{filtroEstado}</strong>
                      <button onClick={() => setFiltroEstado(null)} className="hover:text-red-400 ml-1"><X size={12} /></button>
                    </span>
                  )}
                  {filtroSeller && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-pink-500/20 border border-pink-500/40 text-pink-300">
                      Seller: <strong className="text-white">{filtroSeller}</strong>
                      <button onClick={() => setFiltroSeller(null)} className="hover:text-red-400 ml-1"><X size={12} /></button>
                    </span>
                  )}
                  {temFiltroAtivo && (
                    <button
                      onClick={limparTodosFiltros}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition-colors ml-2 cursor-pointer"
                    >
                      <RotateCcw size={12} />
                      Limpar Todos
                    </button>
                  )}
                </div>

                {/* Métricas do recorte atual */}
                <div className="flex items-center gap-3 text-xs bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/50">
                  <span className="text-slate-400">
                    Volume: <strong className="text-white text-sm font-bold">{totalPedidosFiltrados.toLocaleString("pt-BR")}</strong>
                    {data.total_pedidos && (
                      <span className="text-slate-500 text-[11px] ml-1">
                        ({((totalPedidosFiltrados / (data.total_pedidos || 1)) * 100).toFixed(1)}%)
                      </span>
                    )}
                  </span>
                  <span className="text-slate-600">|</span>
                  <span className="text-slate-400">
                    Sellers: <strong className="text-white text-sm font-bold">{totalSellersFiltrados.toLocaleString("pt-BR")}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Conteúdo com os Grids de Filtros Interativos */}
            <div className="p-5 overflow-y-auto custom-scrollbar flex-1 space-y-5 bg-[#0b0e18]">
              
              {/* LINHA 1: 4 Cards Principais (Modalidade, Cliente, Tipo do Pedido BH, Status) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* 1. Modalidade de Coleta */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col shadow-sm">
                  <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800/60">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Package size={14} className="text-blue-400" />
                      Modalidade
                    </h3>
                    <span className="text-[10px] text-slate-500">clique p/ filtrar</span>
                  </div>
                  <div className="space-y-1.5 overflow-y-auto max-h-52 pr-1 custom-scrollbar flex-1">
                    {modalidadesList.map((item, i) => {
                      const isSelected = filtroModalidade?.toLowerCase() === item.nome.toLowerCase();
                      const perc = totalPedidosFiltrados > 0 ? (item.valor / totalPedidosFiltrados) * 100 : 0;
                      return (
                        <div
                          key={i}
                          onClick={() => setFiltroModalidade(isSelected ? null : item.nome)}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all border ${
                            isSelected
                              ? "bg-blue-600/30 border-blue-500/80 text-white font-bold shadow-sm"
                              : "bg-slate-800/30 hover:bg-slate-800/70 border-transparent text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {isSelected && <CheckCircle size={13} className="text-blue-400 shrink-0" />}
                            <span className="truncate capitalize" title={item.nome}>{item.nome}</span>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <span className="font-semibold text-white">{item.valor.toLocaleString("pt-BR")}</span>
                            <span className="text-[10px] text-slate-500 block">{perc.toFixed(0)}%</span>
                          </div>
                        </div>
                      );
                    })}
                    {modalidadesList.length === 0 && (
                      <p className="text-xs text-slate-500 py-3 text-center">Nenhum dado encontrado</p>
                    )}
                  </div>
                </div>

                {/* 2. Volume por Cliente / Marketplace */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col shadow-sm">
                  <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800/60">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers size={14} className="text-purple-400" />
                      Cliente / Canal
                    </h3>
                    <span className="text-[10px] text-slate-500">{clientesList.length} canais</span>
                  </div>
                  <div className="space-y-1.5 overflow-y-auto max-h-52 pr-1 custom-scrollbar flex-1">
                    {clientesList.map((item, i) => {
                      const isSelected = filtroCliente?.toLowerCase() === item.nome.toLowerCase();
                      const perc = totalPedidosFiltrados > 0 ? (item.valor / totalPedidosFiltrados) * 100 : 0;
                      return (
                        <div
                          key={i}
                          onClick={() => setFiltroCliente(isSelected ? null : item.nome)}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all border ${
                            isSelected
                              ? "bg-purple-600/30 border-purple-500/80 text-white font-bold shadow-sm"
                              : "bg-slate-800/30 hover:bg-slate-800/70 border-transparent text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {isSelected && <CheckCircle size={13} className="text-purple-400 shrink-0" />}
                            <span className="truncate font-medium" title={item.nome}>{item.nome}</span>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <span className="font-semibold text-white">{item.valor.toLocaleString("pt-BR")}</span>
                            <span className="text-[10px] text-slate-500 block">{perc.toFixed(0)}%</span>
                          </div>
                        </div>
                      );
                    })}
                    {clientesList.length === 0 && (
                      <p className="text-xs text-slate-500 py-3 text-center">Nenhum dado</p>
                    )}
                  </div>
                </div>

                {/* 3. Tipo de Pedido (Coluna BH) */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col shadow-sm">
                  <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800/60">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText size={14} className="text-amber-400" />
                      Tipo do Pedido (BH)
                    </h3>
                    <span className="text-[10px] text-slate-500">clique p/ filtrar</span>
                  </div>
                  <div className="space-y-1.5 overflow-y-auto max-h-52 pr-1 custom-scrollbar flex-1">
                    {tiposPedidoList.map((item, i) => {
                      const isSelected = filtroTipoPedido?.toLowerCase() === item.nome.toLowerCase();
                      const perc = totalPedidosFiltrados > 0 ? (item.valor / totalPedidosFiltrados) * 100 : 0;
                      return (
                        <div
                          key={i}
                          onClick={() => setFiltroTipoPedido(isSelected ? null : item.nome)}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all border ${
                            isSelected
                              ? "bg-amber-600/30 border-amber-500/80 text-white font-bold shadow-sm"
                              : "bg-slate-800/30 hover:bg-slate-800/70 border-transparent text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {isSelected && <CheckCircle size={13} className="text-amber-400 shrink-0" />}
                            <span className="truncate" title={item.nome}>{item.nome}</span>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <span className="font-semibold text-white">{item.valor.toLocaleString("pt-BR")}</span>
                            <span className="text-[10px] text-slate-500 block">{perc.toFixed(0)}%</span>
                          </div>
                        </div>
                      );
                    })}
                    {tiposPedidoList.length === 0 && (
                      <p className="text-xs text-slate-500 py-3 text-center">Nenhum tipo listado</p>
                    )}
                  </div>
                </div>

                {/* 4. Status dos Pacotes */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col shadow-sm">
                  <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800/60">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle size={14} className="text-emerald-400" />
                      Status Pacotes
                    </h3>
                    <span className="text-[10px] text-slate-500">clique p/ filtrar</span>
                  </div>
                  <div className="space-y-1.5 overflow-y-auto max-h-52 pr-1 custom-scrollbar flex-1">
                    {statusList.map((item, i) => {
                      const isSelected = filtroStatus?.toLowerCase() === item.nome.toLowerCase();
                      const perc = totalPedidosFiltrados > 0 ? (item.valor / totalPedidosFiltrados) * 100 : 0;
                      return (
                        <div
                          key={i}
                          onClick={() => setFiltroStatus(isSelected ? null : item.nome)}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all border ${
                            isSelected
                              ? "bg-emerald-600/30 border-emerald-500/80 text-white font-bold shadow-sm"
                              : "bg-slate-800/30 hover:bg-slate-800/70 border-transparent text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {isSelected && <CheckCircle size={13} className="text-emerald-400 shrink-0" />}
                            <span className="truncate" title={item.nome}>{item.nome}</span>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <span className="font-semibold text-white">{item.valor.toLocaleString("pt-BR")}</span>
                            <span className="text-[10px] text-slate-500 block">{perc.toFixed(0)}%</span>
                          </div>
                        </div>
                      );
                    })}
                    {statusList.length === 0 && (
                      <p className="text-xs text-slate-500 py-3 text-center">Nenhum status</p>
                    )}
                  </div>
                </div>

              </div>

              {/* LINHA 2: 2 Cards Amplos (Estados e Top Sellers com Busca) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Top Estados (UF) - 1 Coluna */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col shadow-sm md:col-span-1">
                  <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800/60">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <MapPin size={14} className="text-cyan-400" />
                      Top Estados (UF)
                    </h3>
                    <span className="text-[10px] text-slate-500">{estadosList.length} estados</span>
                  </div>
                  <div className="space-y-1.5 overflow-y-auto max-h-72 pr-1 custom-scrollbar flex-1">
                    {estadosList.map((item, i) => {
                      const isSelected = filtroEstado?.toUpperCase() === item.nome.toUpperCase();
                      const perc = totalPedidosFiltrados > 0 ? (item.valor / totalPedidosFiltrados) * 100 : 0;
                      return (
                        <div
                          key={i}
                          onClick={() => setFiltroEstado(isSelected ? null : item.nome)}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all border ${
                            isSelected
                              ? "bg-cyan-600/30 border-cyan-500/80 text-white font-bold shadow-sm"
                              : "bg-slate-800/30 hover:bg-slate-800/70 border-transparent text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            {isSelected && <CheckCircle size={13} className="text-cyan-400 shrink-0" />}
                            <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded text-[11px] border border-slate-700">
                              {item.nome}
                            </span>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <span className="font-semibold text-white">{item.valor.toLocaleString("pt-BR")}</span>
                            <span className="text-[10px] text-slate-500 block">{perc.toFixed(1)}%</span>
                          </div>
                        </div>
                      );
                    })}
                    {estadosList.length === 0 && (
                      <p className="text-xs text-slate-500 py-3 text-center">Nenhum estado listado</p>
                    )}
                  </div>
                </div>

                {/* Top Sellers / Remetentes com Busca - 2 Colunas */}
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col shadow-sm md:col-span-2">
                  <div className="flex flex-wrap items-center justify-between pb-3 mb-2 border-b border-slate-800/60 gap-2">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Store size={14} className="text-pink-400" />
                      Top Sellers / Remetentes ({sellersList.length})
                    </h3>
                    
                    {/* Campo de Busca Rápida de Sellers */}
                    <div className="relative min-w-[220px]">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        placeholder="Buscar seller por nome..."
                        value={searchSeller}
                        onChange={(e) => setSearchSeller(e.target.value)}
                        className="w-full bg-slate-800/80 border border-slate-700/70 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500/70"
                      />
                      {searchSeller && (
                        <button
                          onClick={() => setSearchSeller("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 overflow-y-auto max-h-72 pr-1 custom-scrollbar flex-1">
                    {sellersList.map((item, i) => {
                      const isSelected = filtroSeller?.toLowerCase() === item.nome.toLowerCase();
                      const perc = totalPedidosFiltrados > 0 ? (item.valor / totalPedidosFiltrados) * 100 : 0;
                      return (
                        <div
                          key={i}
                          onClick={() => setFiltroSeller(isSelected ? null : item.nome)}
                          className={`flex items-center justify-between p-2.5 rounded-xl text-xs cursor-pointer transition-all border ${
                            isSelected
                              ? "bg-pink-600/30 border-pink-500/80 text-white font-bold shadow-sm"
                              : "bg-slate-800/30 hover:bg-slate-800/70 border-transparent text-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate max-w-[70%]">
                            <span className="text-[10px] text-slate-500 font-mono w-5 shrink-0 text-right">
                              #{i + 1}
                            </span>
                            {isSelected && <CheckCircle size={13} className="text-pink-400 shrink-0" />}
                            <span className="truncate font-medium text-slate-200 hover:text-white" title={item.nome}>
                              {item.nome}
                            </span>
                          </div>
                          <div className="text-right shrink-0 ml-2 flex items-center gap-3">
                            <div className="w-20 hidden sm:block bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="bg-pink-500 h-full rounded-full"
                                style={{ width: `${Math.min(100, perc * 5)}%` }}
                              />
                            </div>
                            <div>
                              <span className="font-semibold text-white">{item.valor.toLocaleString("pt-BR")}</span>
                              <span className="text-[10px] text-slate-500 block">{perc.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {sellersList.length === 0 && (
                      <p className="text-xs text-slate-500 py-6 text-center">
                        {searchSeller ? `Nenhum seller encontrado para "${searchSeller}"` : "Nenhum seller disponível com os filtros atuais"}
                      </p>
                    )}
                  </div>
                </div>

              </div>

            </div>

            {/* Rodapé do Modal */}
            <div className="p-4 border-t border-slate-800/80 bg-slate-900/60 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                Filtragem instantânea reativa em memória com base nos dados ingeridos
              </span>
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl transition-colors"
              >
                Fechar
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
