"use client";

import React, { useEffect, useState, useMemo } from "react";
import { fetchMalha, MalhaPacote, fetchResumo } from "../../lib/api";
import { Package, Search, Download, Loader2, ArrowUpDown, AlertCircle } from "lucide-react";
import { useAuth } from "../../hooks/use-auth";

export default function RadarTab() {
  const { role, activeRegional, isMaster } = useAuth();

  // ================= STATES =================
  const [selectedRegional, setSelectedRegional] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [regionalsList, setRegionalsList] = useState<string[]>([]);
  const [packages, setPackages] = useState<MalhaPacote[]>([]);
  const [loading, setLoading] = useState(false);
  const [regionalsLoading, setRegionalsLoading] = useState(true);
  const [sortField, setSortField] = useState<keyof MalhaPacote>("dias_parado");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // ================= EFFECTS =================
  // 1. Load filters from sessionStorage after mounting
  useEffect(() => {
    const savedRegional = sessionStorage.getItem("radar_selectedRegional");
    const savedSearch = sessionStorage.getItem("radar_searchQuery");
    const savedSortField = sessionStorage.getItem("radar_sortField");
    const savedSortOrder = sessionStorage.getItem("radar_sortOrder");

    if (savedRegional) setSelectedRegional(savedRegional);
    if (savedSearch) setSearchQuery(savedSearch);
    if (savedSortField) setSortField(savedSortField as keyof MalhaPacote);
    if (savedSortOrder) setSortOrder(savedSortOrder as "asc" | "desc");
  }, []);

  // 2. Persist filters on changes
  useEffect(() => {
    if (selectedRegional) {
      sessionStorage.setItem("radar_selectedRegional", selectedRegional);
    }
  }, [selectedRegional]);

  useEffect(() => {
    sessionStorage.setItem("radar_searchQuery", searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    sessionStorage.setItem("radar_sortField", sortField);
  }, [sortField]);

  useEffect(() => {
    sessionStorage.setItem("radar_sortOrder", sortOrder);
  }, [sortOrder]);

  useEffect(() => {
    const loadRegionals = async () => {
      setRegionalsLoading(true);
      try {
        const globalRes = await fetchResumo("Diário", "latest");
        const list = globalRes.regionais.map(r => r.regional).filter(Boolean);
        setRegionalsList(list);

        const savedRegional = sessionStorage.getItem("radar_selectedRegional");
        if (savedRegional) {
          setSelectedRegional(savedRegional);
        } else if (activeRegional) {
          setSelectedRegional(activeRegional);
        } else if (list.length > 0) {
          setSelectedRegional("TODAS");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setRegionalsLoading(false);
      }
    };
    loadRegionals();
  }, [activeRegional]);

  useEffect(() => {
    if (regionalsLoading) return;

    const loadPackages = async () => {
      setLoading(true);
      try {
        const regionalParam = selectedRegional === "TODAS" ? null : selectedRegional;
        const data = await fetchMalha(regionalParam);
        setPackages(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadPackages();
  }, [selectedRegional, regionalsLoading]);

  // ================= COMPUTATIONS =================
  const filteredPackages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return packages;

    return packages.filter(p =>
      (p.barcode && p.barcode.toLowerCase().includes(query)) ||
      (p.saca && p.saca.toLowerCase().includes(query)) ||
      (p.md && p.md.toLowerCase().includes(query)) ||
      (p.cidade && p.cidade.toLowerCase().includes(query)) ||
      (p.status && p.status.toLowerCase().includes(query))
    );
  }, [packages, searchQuery]);

  const sortedPackages = useMemo(() => {
    return [...filteredPackages].sort((a, b) => {
      const aVal = a[sortField] ?? "";
      const bVal = b[sortField] ?? "";

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortOrder === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return sortOrder === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [filteredPackages, sortField, sortOrder]);

  const avgAging = useMemo(() => {
    if (filteredPackages.length === 0) return 0;
    const sum = filteredPackages.reduce((acc, curr) => acc + curr.dias_parado, 0);
    return sum / filteredPackages.length;
  }, [filteredPackages]);

  // ================= HANDLERS =================
  const handleSort = (field: keyof MalhaPacote) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleExportCSV = () => {
    if (filteredPackages.length === 0) return;

    const headers = ["Codigo de Barras", "Saca", "MD", "Regional", "Cidade", "Status", "Dias Parado", "Tempo Coleta"];
    const rows = filteredPackages.map(p => [
      p.barcode || "",
      p.saca || "",
      p.md || "",
      p.regional || "",
      p.cidade || "",
      p.status || "",
      p.dias_parado.toString(),
      p.tempo_coleta || ""
    ]);

    const csvContent = "\ufeff" + [
      headers.map(h => `"${h}"`).join(","),
      ...rows.map(row => row.map(val => `"${val.replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `radar_malha_${selectedRegional}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ================= RENDER =================
  return (
    <div className="space-y-6">
      {/* Filters Toolbar */}
      <div className="glass-panel p-6 rounded-2xl border border-border flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Regional:</span>
          {isMaster ? (
            <select
              value={selectedRegional}
              onChange={(e) => setSelectedRegional(e.target.value)}
              className="px-4 py-2 bg-[#0C101B] border border-border rounded-xl text-sm font-semibold text-blue-400 focus:outline-none"
            >
              <option value="TODAS">TODAS AS REGIONAIS</option>
              {regionalsList.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          ) : (
            <div className="px-4 py-2 bg-[#0C101B] border border-border rounded-xl text-sm font-bold text-blue-400">
              {activeRegional || "Aguardando..."}
            </div>
          )}
        </div>

        <button
          onClick={handleExportCSV}
          disabled={filteredPackages.length === 0}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-blue-600 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>Exportar CSV</span>
        </button>
      </div>

      {/* Stats Summary Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="glass-card p-6 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">Pacotes Retidos</span>
            <p className="text-3xl font-bold text-white mt-1">{filteredPackages.length.toLocaleString()}</p>
          </div>
          <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
            <Package className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-card p-6 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">Envelhecimento Médio (Aging)</span>
            <p className="text-3xl font-bold text-warning mt-1">{avgAging.toFixed(1)} dias</p>
          </div>
          <div className="w-12 h-12 bg-warning/10 border border-warning/20 rounded-xl flex items-center justify-center text-warning">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Table Panel */}
      <div className="glass-panel rounded-2xl border border-border overflow-hidden">
        {/* Table Search Header */}
        <div className="p-6 border-b border-border bg-[#0C101B]/40 flex flex-wrap gap-4 items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Pacotes e Sacas</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Listagem consolidada da malha operacional.</p>
          </div>

          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 text-muted-foreground absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquise por código de barras, MD, saca, status..."
              className="w-full pl-11 pr-4 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500/50"
            />
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-[#0C101B]/20 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <th className="py-4 px-6 cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("barcode")}>
                  <div className="flex items-center gap-1"><span>Código de Barras</span><ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="py-4 px-6 cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("saca")}>
                  <div className="flex items-center gap-1"><span>Saca</span><ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="py-4 px-6 cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("md")}>
                  <div className="flex items-center gap-1"><span>MD</span><ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="py-4 px-6 cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("regional")}>
                  <div className="flex items-center gap-1"><span>Regional</span><ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="py-4 px-6 cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("cidade")}>
                  <div className="flex items-center gap-1"><span>Cidade</span><ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="py-4 px-6 cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("status")}>
                  <div className="flex items-center gap-1"><span>Status</span><ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="py-4 px-6 text-right cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("dias_parado")}>
                  <div className="flex items-center justify-end gap-1"><span>Dias Parado</span><ArrowUpDown className="w-3 h-3" /></div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border/60 text-xs text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                    <span>Rastreando pacotes na malha...</span>
                  </td>
                </tr>
              ) : sortedPackages.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    Nenhum pacote retido encontrado para o filtro selecionado.
                  </td>
                </tr>
              ) : (
                sortedPackages.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-all">
                    <td className="py-3.5 px-6 font-mono font-semibold text-white">{row.barcode || "N/A"}</td>
                    <td className="py-3.5 px-6 font-mono">{row.saca || "N/A"}</td>
                    <td className="py-3.5 px-6 font-semibold">{row.md || "N/A"}</td>
                    <td className="py-3.5 px-6">{row.regional || "N/A"}</td>
                    <td className="py-3.5 px-6">{row.cidade || "N/A"}</td>
                    <td className="py-3.5 px-6">
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                        row.status && row.status.toLowerCase().includes("atrasado")
                          ? "bg-destructive/10 text-destructive border border-destructive/20"
                          : "bg-warning/10 text-warning border border-warning/20"
                      }`}>
                        {row.status || "Pendente"}
                      </span>
                    </td>
                    <td className="py-3.5 px-6 text-right font-mono font-bold text-warning">{row.dias_parado} dias</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
