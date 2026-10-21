"use client";

import React, { useEffect, useState, memo } from "react";
import { fetchPickup, PickupDetalhe } from "../lib/api";
import { 
  Truck, 
  Store, 
  Search, 
  MapPin, 
  Package, 
  AlertCircle, 
  ArrowUpRight, 
  Building2, 
  Filter, 
  Layers,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

interface PickupListWidgetProps {
  regional: string | null;
  periodoTipo: string;
  rotulo: string;
  dtInicio?: string;
  dtFim?: string;
}

function PickupListWidgetComponent({
  regional,
  periodoTipo,
  rotulo,
  dtInicio,
  dtFim,
}: PickupListWidgetProps) {
  const [pickups, setPickups] = useState<PickupDetalhe[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [tipoFilter, setTipoFilter] = useState<string>("TODOS");
  const [sortConfig, setSortConfig] = useState<{ key: keyof PickupDetalhe, direction: "asc" | "desc" } | null>({ key: "total_pacotes", direction: "desc" });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (!rotulo || rotulo === "Carregando...") return;
    const loadData = async () => {
      setLoading(true);
      try {
        const data = await fetchPickup(
          periodoTipo,
          rotulo,
          periodoTipo === "Período" ? dtInicio : null,
          periodoTipo === "Período" ? dtFim : null,
          regional,
          tipoFilter
        );
        setPickups(data);
      } catch (err) {
        console.error("Erro ao carregar sellers de pickup:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [regional, periodoTipo, rotulo, dtInicio, dtFim, tipoFilter]);

  // Reset pagination when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search, tipoFilter]);

  const filtered = pickups.filter((item) => {
    const q = search.toLowerCase();
    return (
      (item.merchant_nome || "").toLowerCase().includes(q) ||
      (item.merchant_id || "").toLowerCase().includes(q) ||
      (item.cidade || "").toLowerCase().includes(q) ||
      (item.cep_remetente || "").toLowerCase().includes(q) ||
      (item.nome_cliente || "").toLowerCase().includes(q)
    );
  });

  const totalVol = filtered.reduce((acc, curr) => acc + curr.total_pacotes, 0);
  const totalBack = filtered.reduce((acc, curr) => acc + curr.total_backlog, 0);
  const puroCount = filtered.filter((p) => p.tipo_coleta === "PICKUP_PURO").length;
  const noMdCount = filtered.filter((p) => p.tipo_coleta === "PICKUP_NO_MD").length;

  const sortedData = React.useMemo(() => {
    let sortableItems = [...filtered];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: any = a[sortConfig.key] ?? "";
        let bValue: any = b[sortConfig.key] ?? "";
        
        if (typeof aValue === "string" && typeof bValue === "string") {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filtered, sortConfig]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const paginatedData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const requestSort = (key: keyof PickupDetalhe) => {
    let direction: "asc" | "desc" = "desc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "desc") {
      direction = "asc";
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: keyof PickupDetalhe) => {
    if (!sortConfig || sortConfig.key !== key) return null;
    return sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />;
  };

  return (
    <div className="glass-panel p-6 rounded-2xl border border-border mt-6 space-y-6">
      {/* Header & KPI Summary */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">
              Inteligência de Sellers Pickup &amp; Coleta Direta
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Análise detalhada de contas com modalidade porta-a-porta e consolidação logística.
          </p>
        </div>

        {/* Quick KPI Badges */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
            <span className="text-muted-foreground">Sellers Ativos: </span>
            <span className="font-bold text-amber-400">{filtered.length}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
            <span className="text-muted-foreground">Vol. Total: </span>
            <span className="font-bold text-blue-400">{totalVol.toLocaleString()}</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-xs">
            <span className="text-muted-foreground">Direto no MD: </span>
            <span className="font-bold text-purple-400">{noMdCount}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar seller, CEP, cidade ou ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none focus:border-amber-500/50"
          />
        </div>

        {/* Subtype Filter */}
        <div className="flex items-center gap-1.5 bg-[#0C101B] p-1 rounded-xl border border-border">
          {[
            { id: "TODOS", label: "Todos os Sellers" },
            { id: "PICKUP_PURO", label: "🚚 Frota de Rua" },
            { id: "PICKUP_NO_MD", label: "🏪 Dropou no MD" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTipoFilter(t.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                tipoFilter === t.id
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "text-muted-foreground hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sellers Grid/Table */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
          <span className="text-xs">Carregando inteligência de sellers pickup...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
          <Building2 className="w-10 h-10 text-slate-600 mb-1" />
          <p className="text-sm font-semibold text-slate-300">Nenhum seller de pickup localizado no filtro selecionado.</p>
          <p className="text-xs text-slate-500">Selecione outro período ou remova os filtros de busca.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/80 text-muted-foreground uppercase text-[10px] tracking-wider bg-slate-900/40">
                <th className="py-3 px-4 cursor-pointer hover:text-white transition-colors" onClick={() => requestSort("merchant_nome")}>Seller / Merchant {getSortIcon("merchant_nome")}</th>
                <th className="py-3 px-4 cursor-pointer hover:text-white transition-colors" onClick={() => requestSort("nome_cliente")}>Marketplace {getSortIcon("nome_cliente")}</th>
                <th className="py-3 px-4 cursor-pointer hover:text-white transition-colors" onClick={() => requestSort("cidade")}>Localização &amp; CEP {getSortIcon("cidade")}</th>
                <th className="py-3 px-4 cursor-pointer hover:text-white transition-colors" onClick={() => requestSort("tipo_coleta")}>Modalidade Efetiva {getSortIcon("tipo_coleta")}</th>
                <th className="py-3 px-4 text-right cursor-pointer hover:text-white transition-colors" onClick={() => requestSort("total_pacotes")}>Volume {getSortIcon("total_pacotes")}</th>
                <th className="py-3 px-4 text-right cursor-pointer hover:text-white transition-colors" onClick={() => requestSort("total_backlog")}>Backlog {getSortIcon("total_backlog")}</th>
                <th className="py-3 px-4 text-right cursor-pointer hover:text-white transition-colors" onClick={() => requestSort("taxa_coleta")}>Efic. Coleta {getSortIcon("taxa_coleta")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {paginatedData.map((item, idx) => (
                <tr
                  key={`${item.merchant_id}-${idx}`}
                  className="hover:bg-slate-800/30 transition-colors"
                >
                  {/* Seller Name & ID */}
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">
                      {item.merchant_nome || "Seller Não Nomeado"}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono">
                      ID: {item.merchant_id || "N/A"}
                    </div>
                  </td>

                  {/* Marketplace */}
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                      {item.nome_cliente || "OUTROS"}
                    </span>
                  </td>

                  {/* Location */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 text-slate-200">
                      <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>{item.cidade || "N/I"} - {item.estado || "SP"}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground pl-5 truncate max-w-xs">
                      {item.cep_remetente ? `CEP ${item.cep_remetente}` : ""} {item.bairro ? `• ${item.bairro}` : ""}
                    </div>
                  </td>

                  {/* Modality Tag */}
                  <td className="py-3 px-4">
                    {item.tipo_coleta === "PICKUP_NO_MD" ? (
                      <div className="flex flex-col">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-300">
                          <Store className="w-3 h-3 text-purple-400" />
                          Dropou no MD
                        </span>
                        <span className="text-[10px] text-purple-400/80 font-mono">
                          {item.md_vinculado || "MD Desconhecido"}
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300">
                        <Truck className="w-3 h-3 text-amber-400" />
                        Coleta Frota Pura
                      </span>
                    )}
                  </td>

                  {/* Volume */}
                  <td className="py-3 px-4 text-right font-bold text-white">
                    {item.total_pacotes.toLocaleString()}
                  </td>

                  {/* Backlog */}
                  <td className="py-3 px-4 text-right">
                    <span className={item.total_backlog > 0 ? "text-amber-400 font-semibold" : "text-muted-foreground"}>
                      {item.total_backlog.toLocaleString()}
                    </span>
                  </td>

                  {/* Rate */}
                  <td className="py-3 px-4 text-right">
                    <span
                      className={`font-semibold ${
                        item.taxa_coleta >= 98
                          ? "text-green-400"
                          : item.taxa_coleta >= 90
                          ? "text-yellow-400"
                          : "text-red-400"
                      }`}
                    >
                      {item.taxa_coleta.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/80 bg-slate-900/20">
              <span className="text-xs text-muted-foreground">
                Mostrando {(currentPage - 1) * itemsPerPage + 1} a {Math.min(currentPage * itemsPerPage, sortedData.length)} de {sortedData.length} registros
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-300" />
                </button>
                <div className="flex items-center px-2 text-xs font-semibold text-slate-300">
                  {currentPage} / {totalPages}
                </div>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const PickupListWidget = memo(PickupListWidgetComponent);
export default PickupListWidget;
