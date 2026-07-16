"use client";

import React, { useEffect, useState, useTransition } from "react";
import { useAuth } from "../../hooks/use-auth";
import { fetchOptions, fetchResumo, ResumoGeral, OptionsData, API_URL } from "../../lib/api";
import StitchCard from "../../components/StitchCard";
import ChatIA from "../../components/ChatIA";
import { 
  MapPin, 
  Calendar, 
  Loader2, 
  BarChart3, 
  Inbox, 
  TrendingUp, 
  AlertTriangle,
  ArrowUpDown
} from "lucide-react";

interface MDPerformance {
  md: string;
  regional: string;
  cidade: string;
  total: number;
  backlog: number;
  carregamento: number;
  descarregamento: number;
  erros_md: number;
  taxa_coleta: number;
  status_saude: string;
  observacao_fixa: string;
  divisao?: string;
}

export default function FilialPage() {
  const { role, activeRegional, isMaster } = useAuth();
  
  // Filter States
  const [periodoTipo, setPeriodoTipo] = useState<string>("Diário");
  const [rotulo, setRotulo] = useState<string>("");
  const [dtInicio, setDtInicio] = useState<string>("");
  const [dtFim, setDtFim] = useState<string>("");
  const [selectedFilial, setSelectedFilial] = useState<string>("");
  const [regra5k, setRegra5k] = useState<boolean>(false);

  // Data States
  const [options, setOptions] = useState<OptionsData>({ dias: [], semanas: [] });
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resumoFilial, setResumoFilial] = useState<ResumoGeral | null>(null);
  const [mdsData, setMdsData] = useState<MDPerformance[]>([]);
  const [filiaisList, setFiliaisList] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  // Sorting State for MDs table
  const [sortField, setSortField] = useState<keyof MDPerformance>("total");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // On mount, load options
  useEffect(() => {
    const loadOptions = async () => {
      setOptionsLoading(true);
      try {
        const data = await fetchOptions();
        setOptions(data);
        if (data.dias && data.dias.length > 0) {
          setRotulo(data.dias[0]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setOptionsLoading(false);
      }
    };
    loadOptions();
  }, []);

  // Set default label when switching period types
  useEffect(() => {
    if (optionsLoading) return;

    if (periodoTipo === "Diário" && options.dias.length > 0) {
      setRotulo(options.dias[0]);
    } else if (periodoTipo === "Semanal" && options.semanas.length > 0) {
      setRotulo(options.semanas[0]);
    } else if (periodoTipo === "Mensal") {
      const meses = Array.from(new Set(options.dias.map(d => {
        const p = d.split("/");
        return p.length === 3 ? `${p[2]}-${p[1]}` : "";
      }))).filter(Boolean);
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

  // Load the list of available filiais dynamically by fetching global resumo once
  useEffect(() => {
    if (optionsLoading || !rotulo) return;
    const loadFiliais = async () => {
      try {
        const globalRes = await fetchResumo(periodoTipo, rotulo, null, dtInicio, dtFim);
        const list = globalRes.regionais.map(r => r.regional).filter(Boolean);
        setFiliaisList(list);
        
        // Handle initial filial select selection
        if (activeRegional) {
          setSelectedFilial(activeRegional);
        } else if (list.length > 0 && !selectedFilial) {
          // If master, pre-select the first filial from the list, or check URL searchParams
          const urlParams = new URLSearchParams(window.location.search);
          const urlFilial = urlParams.get("filial");
          if (urlFilial && list.includes(urlFilial.toUpperCase())) {
            setSelectedFilial(urlFilial.toUpperCase());
          } else {
            setSelectedFilial(list[0]);
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadFiliais();
  }, [periodoTipo, rotulo, dtInicio, dtFim, optionsLoading, activeRegional]);

  // Fetch metrics and MD performance for the selected filial
  useEffect(() => {
    if (optionsLoading || !rotulo || !selectedFilial) return;
    if (periodoTipo === "Período" && (!dtInicio || !dtFim)) return;

    const loadFilialDetails = async () => {
      setLoading(true);
      try {
        // 1. Fetch metrics
        const resMetrics = await fetchResumo(
          periodoTipo,
          rotulo,
          selectedFilial,
          periodoTipo === "Período" ? dtInicio : null,
          periodoTipo === "Período" ? dtFim : null,
          regra5k
        );
        setResumoFilial(resMetrics);

        // 2. Fetch MDs performance
        const params = new URLSearchParams({
          periodo_tipo: periodoTipo,
          rotulo: rotulo,
          regional: selectedFilial
        });
        if (periodoTipo === "Período") {
          params.append("dt_inicio", dtInicio);
          params.append("dt_fim", dtFim);
        }
        if (regra5k) {
          params.append("regra5k", "true");
        }
        
        const mdsRes = await fetch(`${API_URL}/api/mds?${params.toString()}`);
        if (mdsRes.ok) {
          const mdsData: MDPerformance[] = await mdsRes.json();
          setMdsData(mdsData);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadFilialDetails();
  }, [periodoTipo, rotulo, dtInicio, dtFim, selectedFilial, optionsLoading, regra5k]);

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

  // Helper stats for Filial cards
  const vol = resumoFilial?.volume_total ?? 0;
  const bk = resumoFilial?.volume_backlog ?? 0;
  const eff = resumoFilial?.taxa_coleta ?? 100.0;
  const errLacre = resumoFilial?.erros_lacre ?? 0;
  const diffMeta = eff - 98.0;

  const totalMds = mdsData.length;
  const mdsComBk = mdsData.filter(m => m.backlog > 0).length;

  // Group MDs by division to calculate stats
  const divisionStats = React.useMemo(() => {
    const groups: Record<string, { total: number; backlog: number; mdCount: number; mdWithBk: number }> = {};
    
    mdsData.forEach(md => {
      const divName = md.divisao || "Sem Divisão";
      if (!groups[divName]) {
        groups[divName] = { total: 0, backlog: 0, mdCount: 0, mdWithBk: 0 };
      }
      groups[divName].total += md.total || 0;
      groups[divName].backlog += md.backlog || 0;
      groups[divName].mdCount += 1;
      if (md.backlog > 0) {
        groups[divName].mdWithBk += 1;
      }
    });

    return Object.entries(groups).map(([name, stats]) => {
      const eff = stats.total > 0 ? ((stats.total - stats.backlog) / stats.total * 100) : 100.0;
      return {
        name,
        ...stats,
        eff,
        diffMeta: eff - 98.0
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [mdsData]);

  // Sorting handler
  const handleSort = (field: keyof MDPerformance) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedMds = React.useMemo(() => {
    return [...mdsData].sort((a, b) => {
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
  }, [mdsData, sortField, sortOrder]);

  return (
    <div className="space-y-6">
      {/* Header toolbar */}
      <div className="flex flex-wrap justify-between items-center bg-[#0C101B]/40 p-6 rounded-2xl border border-border gap-4">
        <div className="flex items-center gap-3">
          <MapPin className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Filtro por Filial</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Painel analítico detalhado focado no Micro-Distribuidor (MD) e telemetria regional.
            </p>
          </div>
        </div>
        
        {/* Filial Select Box */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Selecionar Filial:</span>
          {isMaster ? (
            <select
              value={selectedFilial}
              onChange={(e) => setSelectedFilial(e.target.value)}
              className="px-4 py-2 bg-[#0C101B] border border-border rounded-xl text-sm font-semibold text-blue-400 focus:outline-none"
            >
              {filiaisList.map(f => (
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
                {options.dias.map(d => (
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
                {options.semanas.map(s => (
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
                {Array.from(new Set(options.dias.map(d => {
                  const p = d.split("/");
                  return p.length === 3 ? `${p[2]}-${p[1]}` : "";
                }))).filter(Boolean).map(m => (
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

        {/* SLA Rule Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRegra5k(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              regra5k
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : "bg-slate-800/40 border-border/80 text-muted-foreground hover:text-white"
            }`}
          >
            <div className={`w-2.5 h-2.5 rounded-full ${regra5k ? "bg-green-400 animate-pulse" : "bg-slate-600"}`} />
            <span>SLA Ajustado (Regra &gt; 5k)</span>
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span>Atualizando filial...</span>
          </div>
        )}
      </div>

      {/* Metric cards */}
      <div className="space-y-8">
        <div className="space-y-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Totais da Regional ({selectedFilial})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StitchCard
              title="Volume Filial"
              value={(vol ?? 0).toLocaleString()}
              icon={BarChart3}
              indicator="Total bipado"
              loading={loading || optionsLoading}
            />
            <StitchCard
              title="Backlog Filial"
              value={(bk ?? 0).toLocaleString()}
              icon={Inbox}
              indicator={(vol ?? 0) > 0 ? `${((bk ?? 0)/(vol ?? 1) * 100).toFixed(2)}% do volume` : "0%"}
              indicatorType={(bk ?? 0) > 0 ? "warning" : "neutral"}
              loading={loading || optionsLoading}
            />
            <StitchCard
              title="Eficiência Filial"
              value={`${eff.toFixed(2)}%`}
              icon={TrendingUp}
              indicator={`${diffMeta >= 0 ? "+" : ""}${diffMeta.toFixed(2)}% vs Meta`}
              indicatorType={diffMeta >= 0 ? "success" : "danger"}
              loading={loading || optionsLoading}
            />
            <StitchCard
              title="MDs com Backlog"
              value={`${mdsComBk} / ${totalMds}`}
              icon={AlertTriangle}
              indicator={mdsComBk > 0 ? "⚠️ Ofensores ativos" : "✅ Malha zerada"}
              indicatorType={mdsComBk > 0 ? "danger" : "success"}
              loading={loading || optionsLoading}
            />
          </div>
        </div>

        {/* Division Cards */}
        {divisionStats.length > 0 && divisionStats.some(d => d.name !== "Sem Divisão" && d.name !== "None" && d.name !== "null") && (
          <div className="space-y-6 pt-4 border-t border-border/40">
            {divisionStats.filter(d => d.name !== "Sem Divisão" && d.name !== "None" && d.name !== "null").map(div => (
              <div key={div.name} className="space-y-3">
                <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Divisão: {div.name}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <StitchCard
                    title="Volume Divisão"
                    value={div.total.toLocaleString()}
                    icon={BarChart3}
                    indicator="Bipado na divisão"
                    loading={loading || optionsLoading}
                  />
                  <StitchCard
                    title="Backlog Divisão"
                    value={div.backlog.toLocaleString()}
                    icon={Inbox}
                    indicator={div.total > 0 ? `${(div.backlog / div.total * 100).toFixed(2)}% do volume` : "0%"}
                    indicatorType={div.backlog > 0 ? "warning" : "neutral"}
                    loading={loading || optionsLoading}
                  />
                  <StitchCard
                    title="Eficiência Divisão"
                    value={`${div.eff.toFixed(2)}%`}
                    icon={TrendingUp}
                    indicator={`${div.diffMeta >= 0 ? "+" : ""}${div.diffMeta.toFixed(2)}% vs Meta`}
                    indicatorType={div.diffMeta >= 0 ? "success" : "danger"}
                    loading={loading || optionsLoading}
                  />
                  <StitchCard
                    title="MDs com Backlog"
                    value={`${div.mdWithBk} / ${div.mdCount}`}
                    icon={AlertTriangle}
                    indicator={div.mdWithBk > 0 ? "⚠️ Ofensores ativos" : "✅ Divisão zerada"}
                    indicatorType={div.mdWithBk > 0 ? "danger" : "success"}
                    loading={loading || optionsLoading}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main layout (MDs Table + IA Assistant) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* MDs Performance Table */}
        <div className="lg:col-span-2 glass-panel rounded-2xl border border-border overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-6 border-b border-border bg-[#0C101B]/40">
              <h2 className="text-lg font-semibold text-white">Desempenho dos Micro-Distribuidores (MDs)</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Monitoramento individual de pontos de bipagem vinculados à filial **{selectedFilial}**.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-[#0C101B]/20 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <th className="py-4 px-6 cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("md")}>
                      <div className="flex items-center gap-1"><span>MD</span><ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-4 px-6 cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("divisao")}>
                      <div className="flex items-center gap-1"><span>Divisão</span><ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-4 px-6 cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("cidade")}>
                      <div className="flex items-center gap-1"><span>Cidade</span><ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-4 px-6 text-right cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("total")}>
                      <div className="flex items-center justify-end gap-1"><span>Volume Total</span><ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-4 px-6 text-right cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("backlog")}>
                      <div className="flex items-center justify-end gap-1"><span>Backlog</span><ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-4 px-6 text-right cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("taxa_coleta")}>
                      <div className="flex items-center justify-end gap-1"><span>Eficiência</span><ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-4 px-6 text-left cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("observacao_fixa")}>
                      <div className="flex items-center gap-1"><span>Alerta Permanente</span><ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                    <th className="py-4 px-6 text-center cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("status_saude")}>
                      <div className="flex items-center justify-center gap-1"><span>Saúde</span><ArrowUpDown className="w-3 h-3" /></div>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border/60 text-xs text-slate-300">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                        <span>Carregando dados da malha...</span>
                      </td>
                    </tr>
                  ) : sortedMds.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        Nenhum MD registrado nesta regional para o período selecionado.
                      </td>
                    </tr>
                  ) : (
                    sortedMds.map((row) => (
                      <tr key={row.md} className="hover:bg-slate-800/30 transition-all">
                        <td className="py-3.5 px-6 font-semibold text-white">{row.md}</td>
                        <td className="py-3.5 px-6 font-medium text-slate-400">{row.divisao || "Sem Divisão"}</td>
                        <td className="py-3.5 px-6">{row.cidade}</td>
                        <td className="py-3.5 px-6 text-right font-mono">{(row.total ?? 0).toLocaleString()}</td>
                        <td className="py-3.5 px-6 text-right font-mono text-warning">{(row.backlog ?? 0).toLocaleString()}</td>
                        <td className="py-3.5 px-6 text-right font-semibold">
                          <span className={(row.taxa_coleta ?? 0) >= 98 ? "text-success" : (row.taxa_coleta ?? 0) >= 90 ? "text-warning" : "text-destructive"}>
                            {(row.taxa_coleta ?? 0).toFixed(2)}%
                          </span>
                        </td>
                        <td className="py-3.5 px-6 text-left text-xs max-w-[220px] truncate" title={row.observacao_fixa || ""}>
                          {row.observacao_fixa ? (
                            <span className="text-red-400 font-medium">⚠️ {row.observacao_fixa}</span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="py-3.5 px-6 text-center">
                          <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${
                            row.status_saude === "Aprovado" 
                              ? "text-success bg-success/10 border-success/20" 
                              : row.status_saude === "Alerta"
                              ? "text-warning bg-warning/10 border-warning/20"
                              : "text-destructive bg-destructive/10 border-destructive/20"
                          }`}>
                            {row.status_saude}
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

        {/* Dedicated IA Chat Widget */}
        <div>
          {selectedFilial && (
            <ChatIA
              filial={selectedFilial}
              contextoData={{ 
                total: vol, 
                backlog: bk,
                mds: sortedMds 
              }}
            />
          )}
        </div>

      </div>
    </div>
  );
}
