"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../hooks/use-auth";
import { fetchOptions, fetchClientes, ClienteRanking, fetchResumo, OptionsData } from "../../lib/api";
import StitchCard from "../../components/StitchCard";
import { 
  Users, 
  Calendar, 
  Loader2, 
  TrendingUp, 
  ArrowUpDown,
  ShoppingBag
} from "lucide-react";

export default function ClientesPage() {
  const { role, activeRegional, isMaster } = useAuth();
  
  // Filter States
  const [periodoTipo, setPeriodoTipo] = useState<string>("Diário");
  const [rotulo, setRotulo] = useState<string>("");
  const [dtInicio, setDtInicio] = useState<string>("");
  const [dtFim, setDtFim] = useState<string>("");
  const [selectedRegional, setSelectedRegional] = useState<string>("");

  // Data States
  const [options, setOptions] = useState<OptionsData>({ dias: [], semanas: [] });
  const [regionalsList, setRegionalsList] = useState<string[]>([]);
  const [clientesData, setClientesData] = useState<ClienteRanking[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<keyof ClienteRanking>("total_pacotes");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Load options and regionals on mount
  useEffect(() => {
    const loadInit = async () => {
      setOptionsLoading(true);
      try {
        // Load date filters
        const data = await fetchOptions();
        setOptions(data);
        if (data.dias && data.dias.length > 0) {
          setRotulo(data.dias[0]);
        }

        // Load regionals list
        const globalRes = await fetchResumo("Diário", "latest");
        const list = globalRes.regionais.map(r => r.regional).filter(Boolean);
        setRegionalsList(list);

        if (activeRegional) {
          setSelectedRegional(activeRegional);
        } else if (list.length > 0) {
          setSelectedRegional("TODAS");
        }
      } catch (err) {
        console.error(err);
      } finally {
        setOptionsLoading(false);
      }
    };
    loadInit();
  }, [activeRegional]);

  // Set default label when switching view types
  useEffect(() => {
    if (optionsLoading) return;

    if (periodoTipo === "Diário" && options.dias.length > 0) {
      setRotulo(options.dias[0]);
    } else if (periodoTipo === "Semanal" && options.semanas.length > 0) {
      setRotulo(options.semanas[0]);
    } else if (periodoTipo === "Mensal") {
      const meses = Array.from(new Set(options.dias.map((d: string) => {
        const p = d.split("/");
        return p.length === 3 ? `${p[2]}-${p[1]}` : "";
      }))).filter(Boolean) as string[];
      if (meses.length > 0) {
        setRotulo(meses[0]);
      }
    } else if (periodoTipo === "Período") {
      setRotulo("custom");
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 7);
      setDtFim(end.toISOString().split("T")[0]);
      setDtInicio(start.toISOString().split("T")[0]);
    }
  }, [periodoTipo, options, optionsLoading]);

  // Fetch client details
  useEffect(() => {
    if (optionsLoading || !rotulo) return;
    if (periodoTipo === "Período" && (!dtInicio || !dtFim)) return;

    const loadClientes = async () => {
      setLoading(true);
      try {
        const regionalParam = selectedRegional === "TODAS" ? null : selectedRegional;
        const data = await fetchClientes(
          periodoTipo,
          rotulo,
          regionalParam,
          periodoTipo === "Período" ? dtInicio : null,
          periodoTipo === "Período" ? dtFim : null
        );
        setClientesData(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadClientes();
  }, [periodoTipo, rotulo, dtInicio, dtFim, selectedRegional, optionsLoading]);

  const formatMonth = (mStr: string) => {
    if (!mStr || !mStr.includes("-")) return mStr;
    const [ano, mes] = mStr.split("-");
    const mesesPt: Record<string, string> = {
      "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
      "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
      "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro"
    };
    return `${mesesPt[mes] || mes}/${ano}`;
  };

  const handleSort = (field: keyof ClienteRanking) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedClientes = React.useMemo(() => {
    return [...clientesData].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortOrder === "asc" 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      return sortOrder === "asc" 
        ? (aVal as number) - (bVal as number) 
        : (bVal as number) - (aVal as number);
    });
  }, [clientesData, sortField, sortOrder]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center bg-[#0C101B]/40 p-6 rounded-2xl border border-border gap-4">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Clientes Marketplace</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Rastreamento de performance e eficiência de coletas por marketplaces integrados.
            </p>
          </div>
        </div>

        {/* Toolbar selectors */}
        <div className="flex items-center gap-4 flex-wrap">
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
        </div>
      </div>

      {/* Date/Period Toolbar */}
      <div className="glass-panel p-6 rounded-2xl border border-border flex flex-wrap gap-4 items-center justify-between">
        <div className="flex bg-[#0C101B] p-1 rounded-xl border border-border">
          {["Diário", "Semanal", "Mensal", "Período"].map((type) => (
            <button
              key={type}
              onClick={() => setPeriodoTipo(type)}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                periodoTipo === type
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-white"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {!optionsLoading && (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            {periodoTipo === "Diário" && (
              <select
                value={rotulo}
                onChange={(e) => setRotulo(e.target.value)}
                className="px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-sm text-slate-200 focus:outline-none"
              >
                {options.dias.map((d: string) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}

            {periodoTipo === "Semanal" && (
              <select
                value={rotulo}
                onChange={(e) => setRotulo(e.target.value)}
                className="px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-sm text-slate-200 focus:outline-none"
              >
                {options.semanas.map((s: string) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}

            {periodoTipo === "Mensal" && (
              <select
                value={rotulo}
                onChange={(e) => setRotulo(e.target.value)}
                className="px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-sm text-slate-200 focus:outline-none"
              >
                {Array.from(new Set(options.dias.map((d: string) => {
                  const p = d.split("/");
                  return p.length === 3 ? `${p[2]}-${p[1]}` : "";
                }))).filter(Boolean).map((m: any) => (
                  <option key={m} value={m}>{formatMonth(m)}</option>
                ))}
              </select>
            )}

            {periodoTipo === "Período" && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={dtInicio}
                  onChange={(e) => setDtInicio(e.target.value)}
                  className="px-3 py-1.5 bg-[#0C101B] border border-border rounded-xl text-sm text-slate-200 focus:outline-none"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <input
                  type="date"
                  value={dtFim}
                  onChange={(e) => setDtFim(e.target.value)}
                  className="px-3 py-1.5 bg-[#0C101B] border border-border rounded-xl text-sm text-slate-200 focus:outline-none"
                />
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span>Atualizando clientes...</span>
          </div>
        )}
      </div>

      {/* Grid of Client Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {loading ? (
          <>
            <div className="h-32 bg-slate-800/40 rounded-2xl animate-pulse"></div>
            <div className="h-32 bg-slate-800/40 rounded-2xl animate-pulse"></div>
            <div className="h-32 bg-slate-800/40 rounded-2xl animate-pulse"></div>
          </>
        ) : sortedClientes.slice(0, 3).map((client, idx) => (
          <StitchCard
            key={idx}
            title={client.nome_cliente}
            value={`${client.total_pacotes.toLocaleString()} pacotes`}
            icon={ShoppingBag}
            indicator={`SLA OTR: ${client.taxa_coleta.toFixed(2)}%`}
            indicatorType={client.taxa_coleta >= 98 ? "success" : client.taxa_coleta >= 90 ? "warning" : "danger"}
          />
        ))}
      </div>

      {/* Detail Table Panel */}
      <div className="glass-panel rounded-2xl border border-border overflow-hidden">
        <div className="p-6 border-b border-border bg-[#0C101B]/40">
          <h2 className="text-lg font-semibold text-white">Performance Detalhada por Marketplace</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Métricas consolidadas de pacotes bipartidos e taxas de conformidade.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-[#0C101B]/20 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                <th className="py-4 px-6 cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("nome_cliente")}>
                  <div className="flex items-center gap-1"><span>Marketplace</span><ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="py-4 px-6 text-right cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("total_pacotes")}>
                  <div className="flex items-center justify-end gap-1"><span>Total Previsto</span><ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="py-4 px-6 text-right cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("total_backlog")}>
                  <div className="flex items-center justify-end gap-1"><span>Backlog</span><ArrowUpDown className="w-3 h-3" /></div>
                </th>
                <th className="py-4 px-6 text-right cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("taxa_coleta")}>
                  <div className="flex items-center justify-end gap-1"><span>Eficiência (OTR)</span><ArrowUpDown className="w-3 h-3" /></div>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-border/60 text-xs text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                    <span>Calculando performance dos marketplaces...</span>
                  </td>
                </tr>
              ) : sortedClientes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    Nenhum registro encontrado para o filtro e período selecionados.
                  </td>
                </tr>
              ) : (
                sortedClientes.map((row) => (
                  <tr key={row.nome_cliente} className="hover:bg-slate-800/30 transition-all">
                    <td className="py-3.5 px-6 font-bold text-white">{row.nome_cliente}</td>
                    <td className="py-3.5 px-6 text-right font-mono">{row.total_pacotes.toLocaleString()}</td>
                    <td className="py-3.5 px-6 text-right font-mono text-warning">{row.total_backlog.toLocaleString()}</td>
                    <td className="py-3.5 px-6 text-right font-semibold">
                      <span className={row.taxa_coleta >= 98 ? "text-success" : row.taxa_coleta >= 90 ? "text-warning" : "text-destructive"}>
                        {row.taxa_coleta.toFixed(2)}%
                      </span>
                    </td>
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
