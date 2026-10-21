"use client";

import React, { useEffect, useState, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import dynamic from "next/dynamic";
import { 
  Truck, 
  MapPin, 
  Search, 
  RefreshCw,
  Calendar,
  Store,
  ChevronLeft,
  ChevronRight,
  Globe,
  Layers,
  Package,
  AlertTriangle,
  Download,
  X,
  Sparkles
} from "lucide-react";

import { API_URL, fetchPickupPendentesAtraso } from "@/lib/api";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false });

interface SellersFeedState {
  total: number;
  pages: number;
  items: any[];
}

export default function RadarPickupPage() {
  // Modal de Coletas Pendentes / Em Atraso no Seller
  const [atrasoModalOpen, setAtrasoModalOpen] = useState(false);
  const [atrasoData, setAtrasoData] = useState<any[]>([]);
  const [atrasoLoading, setAtrasoLoading] = useState(false);

  const handleOpenAtrasoModal = async () => {
    setAtrasoModalOpen(true);
    setAtrasoLoading(true);
    try {
      const res = await fetchPickupPendentesAtraso(ufFiltro, marketplaceFiltro);
      setAtrasoData(res.pendentes || []);
    } catch (err: any) {
      alert("Erro ao carregar solicitações em atraso: " + err.message);
    } finally {
      setAtrasoLoading(false);
    }
  };

  const exportarAtrasoCSV = () => {
    if (!atrasoData || atrasoData.length === 0) return;
    const headers = ["Merchant ID", "Seller", "Marketplace", "Estado", "Cidade", "Bairro", "Endereco", "Volume Solicitado", "Data Solicitação", "Status Coleta"];
    const rows = atrasoData.map(r => [
      `"${r.merchant_id}"`,
      `"${r.merchant_nome}"`,
      `"${r.marketplace}"`,
      `"${r.estado}"`,
      `"${r.cidade}"`,
      `"${r.bairro}"`,
      `"${r.endereco}"`,
      r.volume_solicitado,
      `"${r.data_solicitacao}"`,
      `"${r.status_coleta}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `pickup_pendentes_atraso_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Global options
  const [options, setOptions] = useState<{ dias: string[], semanas: string[], cidades?: string[] }>({ dias: [], semanas: [], cidades: [] });
  const [optionsLoading, setOptionsLoading] = useState(true);

  // Filters
  const [periodoTipo, setPeriodoTipo] = useState<string>("Diário");
  const [rotulo, setRotulo] = useState<string>("Carregando...");
  const [marketplaceFiltro, setMarketplaceFiltro] = useState<string>("TODOS");
  const [cidadeFiltro, setCidadeFiltro] = useState<string>("todas");
  const [ufFiltro, setUfFiltro] = useState<string>("SP"); // Foco padrão em SP (São Paulo)
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  // Map state
  const [mapaPontos, setMapaPontos] = useState<any[]>([]);
  const [mapaTotais, setMapaTotais] = useState<{ total_pacotes: number, qtd_sellers: number, qtd_cidades: number, estado: string }>({
    total_pacotes: 0,
    qtd_sellers: 0,
    qtd_cidades: 0,
    estado: "SP"
  });
  const [mapaLoading, setMapaLoading] = useState<boolean>(false);

  const [sellersFeed, setSellersFeed] = useState<SellersFeedState>({
    total: 0,
    pages: 1,
    items: []
  });

  // Column sorting state
  const [sortKey, setSortKey] = useState<string>("volume_primeiro_dia");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    fetch(`${API_URL}/api/opcoes`)
      .then(res => res.json())
      .then(data => {
        setOptions(data);
        if (data.dias && data.dias.length > 0) {
          setRotulo(data.dias[0]);
        } else {
          setRotulo("latest");
        }
      })
      .catch(err => {
        console.error(err);
        setRotulo("latest");
      })
      .finally(() => setOptionsLoading(false));
  }, []);

  const fetchMapa = async () => {
    setMapaLoading(true);
    try {
      const qParams = new URLSearchParams();
      qParams.set("periodo_tipo", periodoTipo);
      qParams.set("rotulo", rotulo);
      qParams.set("uf", ufFiltro);
      if (marketplaceFiltro !== "TODOS") qParams.set("marketplace", marketplaceFiltro);
      if (searchTerm.trim()) qParams.set("search", searchTerm.trim());

      const res = await fetch(`${API_URL}/api/pickup/radar/mapa?${qParams.toString()}`).then(r => r.json());
      if (res.status === "success") {
        setMapaPontos(res.pontos || []);
        if (res.totais) setMapaTotais(res.totais);
      }
    } catch (e) {
      console.error("Erro ao carregar mapa de pickup:", e);
    } finally {
      setMapaLoading(false);
    }
  };

  const fetchFeed = async () => {
    setLoading(true);
    try {
      const qParams = new URLSearchParams();
      qParams.set("periodo_tipo", periodoTipo);
      qParams.set("rotulo", rotulo);
      if (marketplaceFiltro !== "TODOS") qParams.set("marketplace", marketplaceFiltro);
      if (searchTerm.trim()) qParams.set("search", searchTerm.trim());
      qParams.set("page", page.toString());
      qParams.set("limit", "20");

      const res = await fetch(`${API_URL}/api/pickup/radar/novos-sellers?${qParams.toString()}`).then(r => r.json());
      if (res.status === "success") {
        setSellersFeed({
          total: res.total ?? res.pagination?.total_items ?? 0,
          pages: res.pages ?? res.pagination?.total_pages ?? 1,
          items: res.items || res.data || []
        });
      }
    } catch (e) {
      console.error("Erro ao carregar feed de sellers:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (rotulo !== "Carregando...") {
      fetchFeed();
      fetchMapa();
    }
  }, [periodoTipo, rotulo, marketplaceFiltro, ufFiltro, searchTerm, page]);

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

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedItems = useMemo(() => sortData(sellersFeed.items, sortKey, sortDir), [sellersFeed.items, sortKey, sortDir]);

  const renderSortableHeader = (label: string, colKey: string, align: "left" | "right" | "center" = "left") => (
    <th 
      onClick={() => handleSort(colKey)} 
      className={`py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors text-${align}`}
    >
      <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
        <span>{label}</span>
        <span className="text-[10px] font-bold text-emerald-400">
          {sortKey === colKey ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </div>
    </th>
  );

  const getClientBadgeColor = (cli: string) => {
    const c = (cli || "").toLowerCase();
    if (c.includes("tiktok")) return "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
    if (c.includes("shein")) return "bg-pink-500/10 text-pink-400 border-pink-500/30";
    if (c.includes("temu")) return "bg-amber-500/10 text-amber-400 border-amber-500/30";
    if (c.includes("kwai")) return "bg-orange-500/10 text-orange-400 border-orange-500/30";
    if (c.includes("cea") || c.includes("c&a")) return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    return "bg-slate-700/30 text-slate-300 border-slate-600/30";
  };

  return (
    <div className="flex h-screen bg-[#07090E] text-slate-100 font-sans overflow-hidden">
      <Sidebar />

      <main className="flex-1 ml-16 md:ml-64 overflow-y-auto p-4 md:p-8 space-y-6">
        {/* Header Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 text-emerald-400">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-2">
                  Radar de Pickup & Sellers Ativos
                </h1>
                <p className="text-xs md:text-sm text-slate-400 mt-0.5">
                  Detecção de sellers de coleta porta-a-porta, polos de crescimento e volume acumulado.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenAtrasoModal}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-xs font-bold text-rose-300 transition-all hover:scale-105 active:scale-95 shadow-sm"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              Coletas Pendentes / Em Atraso
            </button>
            <button
              onClick={fetchFeed}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#131926] hover:bg-[#1A2234] border border-border text-xs font-medium text-slate-200 transition-all hover:scale-105 active:scale-95 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>

        </div>

        {/* Global Filter Bar */}
        <div className="bg-[#0C101B] p-4 rounded-2xl border border-border/60 shadow-lg flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <select
                value={periodoTipo}
                onChange={(e) => setPeriodoTipo(e.target.value)}
                className="px-3 py-1.5 bg-[#131926] border border-border/60 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="Diário">Visão Diária</option>
                <option value="Semanal">Visão Semanal</option>
              </select>
            </div>

            {!optionsLoading && (
              <select
                value={rotulo}
                onChange={(e) => setRotulo(e.target.value)}
                className="px-3 py-1.5 bg-[#131926] border border-border/60 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50 font-mono"
              >
                {periodoTipo === "Diário" && options.dias.map(d => <option key={d} value={d}>{d}</option>)}
                {periodoTipo === "Semanal" && options.semanas.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            )}

            <div className="flex items-center gap-2 border-l border-border/40 pl-3">
              <Store className="w-4 h-4 text-emerald-400" />
              <select
                value={marketplaceFiltro}
                onChange={(e) => setMarketplaceFiltro(e.target.value)}
                className="px-3 py-1.5 bg-[#131926] border border-border/60 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="TODOS">Todos os Clientes</option>
                <option value="Shein">Shein / Shein D2D</option>
                <option value="tiktok">TikTok</option>
                <option value="temud2d">Temu (D2D / W2D)</option>
              </select>
            </div>

            {/* UF State Select */}
            <div className="flex items-center gap-2 border-l border-border/40 pl-3">
              <Globe className="w-4 h-4 text-emerald-400" />
              <select
                value={ufFiltro}
                onChange={(e) => setUfFiltro(e.target.value)}
                className="px-3 py-1.5 bg-[#131926] border border-border/60 rounded-xl text-xs font-bold text-emerald-400 focus:outline-none focus:border-emerald-500/50"
              >
                <option value="SP">📍 São Paulo (SP)</option>
                <option value="RJ">Rio de Janeiro (RJ)</option>
                <option value="MG">Minas Gerais (MG)</option>
                <option value="PR">Paraná (PR)</option>
                <option value="SC">Santa Catarina (SC)</option>
                <option value="RS">Rio Grande do Sul (RS)</option>
                <option value="BA">Bahia (BA)</option>
                <option value="TODOS">Todos os Estados</option>
              </select>
            </div>

            {/* Cidade Select */}
            <select
              value={cidadeFiltro}
              onChange={(e) => {
                setCidadeFiltro(e.target.value);
                if (e.target.value !== "todas") {
                  setSearchTerm(e.target.value);
                } else {
                  setSearchTerm("");
                }
                setPage(1);
              }}
              className="bg-[#131926] border border-border/60 text-xs text-emerald-400 font-semibold rounded-xl px-3 py-1.5 outline-none focus:border-emerald-500"
            >
              <option value="todas">Todas Cidades</option>
              {(options.cidades || []).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por seller ou ID..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-1.5 bg-[#131926] border border-border/60 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50"
            />
          </div>
        </div>

        {/* Dynamic Leaflet Pickup Map Card */}
        <div className="bg-[#0C101B] p-6 rounded-2xl border border-border/60 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <MapPin className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  🗺️ Mapa Interativo de Pickup ({ufFiltro === "SP" ? "São Paulo - SP" : ufFiltro})
                </h3>
                <p className="text-xs text-slate-400">
                  Pontos de coleta bipados no dia <span className="text-emerald-400 font-bold">{rotulo}</span> ({ufFiltro}). Clique nos pins para ver detalhes dos sellers.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="px-3 py-1.5 rounded-xl bg-[#131926] border border-border/60 text-xs font-semibold text-slate-300 flex items-center gap-2">
                <Package className="w-4 h-4 text-emerald-400" />
                <span><strong className="text-white">{mapaTotais.total_pacotes.toLocaleString()}</strong> pacotes</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-[#131926] border border-border/60 text-xs font-semibold text-slate-300 flex items-center gap-2">
                <Store className="w-4 h-4 text-teal-400" />
                <span><strong className="text-white">{mapaTotais.qtd_sellers}</strong> sellers ativos</span>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-[#131926] border border-border/60 text-xs font-semibold text-slate-300 flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-400" />
                <span><strong className="text-white">{mapaTotais.qtd_cidades}</strong> cidades</span>
              </div>
            </div>
          </div>

          <div className="h-[420px] rounded-xl overflow-hidden border border-border/60 relative">
            {mapaLoading ? (
              <div className="w-full h-full bg-[#0F172A] flex items-center justify-center text-slate-400 text-xs gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
                <span>Carregando mapa de pickup em {ufFiltro}...</span>
              </div>
            ) : (
              <LeafletMap points={mapaPontos} onUpdateObservacao={() => {}} />
            )}
          </div>
        </div>

        {/* Feeding Table Panel */}
        <div className="bg-[#0C101B] p-6 rounded-2xl border border-border/60 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3">
            <h3 className="font-bold text-white text-base">Sellers Ativos de Pickup</h3>
            <span className="text-xs text-slate-400">
              Clique nos cabeçalhos para ordenar (▲/▼). Total: {sellersFeed.total} sellers
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/50">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-[#131926] text-slate-400 uppercase tracking-wider font-semibold border-b border-border/60">
                <tr>
                  {renderSortableHeader("Seller / Merchant ID", "merchant_nome")}
                  {renderSortableHeader("Endereço Completo (Envio/Coleta)", "endereco")}
                  {renderSortableHeader("Marketplace", "primeiro_cliente")}
                  {renderSortableHeader("Data 1ª Coleta", "primeira_data")}
                  {renderSortableHeader("Última Coleta", "ultima_data")}
                  {renderSortableHeader("Vol. Inicial", "volume_primeiro_dia", "right")}
                  {renderSortableHeader("Frequência", "total_dias_ativos", "center")}
                  {renderSortableHeader("Status", "status_seller", "center")}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Carregando dados dos sellers de pickup...
                    </td>
                  </tr>
                ) : sortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Nenhum seller encontrado com os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  sortedItems.map((s, idx) => (
                    <tr key={idx} className="hover:bg-[#131926]/50 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-white">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-100 font-bold">{s.merchant_nome || s.merchant_id}</span>
                          {(s.status_seller === "Novo" || s.is_inedito) && (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">
                              🆕 INÉDITO
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">ID: {s.merchant_id}</span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        <p className="font-semibold text-white">{s.cidade || "N/A"} / {s.estado || "SP"}</p>
                        <p className="text-[11px] text-slate-400 truncate max-w-xs">
                          {s.endereco ? `${s.endereco}, ${s.bairro || ''}` : `${s.bairro || s.cidade || ''}`} {s.cep ? `(CEP: ${s.cep})` : ''}
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border capitalize ${getClientBadgeColor(s.primeiro_cliente)}`}>
                          {s.primeiro_cliente}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-emerald-400 font-semibold">{s.primeira_data || "N/A"}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">{s.ultima_data || s.primeira_data}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-emerald-400 font-mono">{s.volume_primeiro_dia || 0}</td>
                      <td className="py-3.5 px-4 text-center font-mono text-slate-300 font-semibold">{s.total_dias_ativos || 1} dias</td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          s.status_seller === "Novo" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                        }`}>
                          {s.status_seller === "Novo" ? "🆕 Inédito" : "🔄 Recorrente"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
            <div>
              Mostrando <strong className="text-white">{sortedItems.length}</strong> de <strong className="text-white">{sellersFeed.total}</strong> sellers
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-2 rounded-lg bg-[#131926] border border-border disabled:opacity-30 hover:bg-[#1A2234]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-slate-300 font-mono">
                Pág {page} de {sellersFeed.pages || 1}
              </span>
              <button
                disabled={page >= sellersFeed.pages}
                onClick={() => setPage(p => Math.min(sellersFeed.pages, p + 1))}
                className="p-2 rounded-lg bg-[#131926] border border-border disabled:opacity-30 hover:bg-[#1A2234]"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        {/* MODAL SOLICITAÇÕES PICKUP EM ATRASO NO SELLER */}
        {atrasoModalOpen && (
          <div className="fixed inset-0 z-[5000] bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-[#0C101B] border border-border/80 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
              <div className="p-4 bg-slate-900 border-b border-border flex justify-between items-center">
                <div className="flex items-center gap-2 text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                  <h2 className="text-base font-bold text-white">Coletas Pendentes & Em Atraso no Seller</h2>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={exportarAtrasoCSV}
                    disabled={atrasoData.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl disabled:opacity-40 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar CSV</span>
                  </button>
                  <button onClick={() => setAtrasoModalOpen(false)} className="text-slate-400 hover:text-white p-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-5 overflow-y-auto flex-1 custom-scrollbar space-y-4">
                {atrasoLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-3">
                    <RefreshCw className="w-8 h-8 text-rose-400 animate-spin" />
                    <p className="text-slate-400 text-sm font-medium">Buscando solicitações de recolhimento em atraso nos sellers...</p>
                  </div>
                ) : atrasoData.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm">
                    Nenhuma solicitação de pick-up pendente/em atraso no momento para esta região.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/50 bg-[#07090E]">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-[#131926] text-slate-400 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-3">Seller (Merchant ID)</th>
                          <th className="p-3">Marketplace</th>
                          <th className="p-3">Localização (Bairro/Cidade/UF)</th>
                          <th className="p-3 text-right">Volume Solicitado</th>
                          <th className="p-3 text-center">Status Recolhimento</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {atrasoData.map((r, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/60 transition-colors">
                            <td className="p-3">
                              <p className="font-bold text-white">{r.merchant_nome}</p>
                              <p className="text-[10px] font-mono text-slate-400">{r.merchant_id}</p>
                            </td>
                            <td className="p-3 font-semibold text-emerald-400">{r.marketplace}</td>
                            <td className="p-3">
                              <p className="text-slate-200">{r.bairro} - {r.cidade} / {r.estado}</p>
                              <p className="text-[10px] text-slate-400">{r.endereco}</p>
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-amber-400">{r.volume_solicitado.toLocaleString()}</td>
                            <td className="p-3 text-center">
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                🔴 Pendente / Atraso
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

