"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "../../hooks/use-auth";
import { 
  fetchOptions, 
  OptionsData, 
  ClienteRegionalDetalhe, 
  ClienteEvolucao,
  fetchClienteDetalhe,
  fetchClienteEvolucao 
} from "../../lib/api";
import StitchCard from "../../components/StitchCard";
import { 
  Users, 
  Calendar, 
  Loader2, 
  TrendingUp, 
  ArrowUpDown,
  ShoppingBag,
  Activity
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from "recharts";

export default function ClientesPage() {
  const { role, activeRegional, isMaster } = useAuth();
  
  // Filter States
  const [periodoTipo, setPeriodoTipo] = useState<string>("Diário");
  const [rotulo, setRotulo] = useState<string>("");
  const [dtInicio, setDtInicio] = useState<string>("");
  const [dtFim, setDtFim] = useState<string>("");
  const [selectedCliente, setSelectedCliente] = useState<string>("SHEIN");
  const [selectedRegional, setSelectedRegional] = useState<string>("TODAS");
  const [modalidade, setModalidade] = useState<string>("TODOS");

  // Data States
  const [options, setOptions] = useState<OptionsData>({ dias: [], semanas: [], regionais: [] });
  const [sellersData, setSellersData] = useState<any[]>([]);
  const [evolucaoData, setEvolucaoData] = useState<ClienteEvolucao[]>([]);
  
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  // Sorting
  const [sortField, setSortField] = useState<string>("total_pacotes");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Load options on mount
  useEffect(() => {
    const loadInit = async () => {
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
    loadInit();
  }, []);

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

  // Fetch client details and evolution
  useEffect(() => {
    if (optionsLoading || !rotulo) return;
    if (periodoTipo === "Período" && (!dtInicio || !dtFim)) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const rParam = selectedRegional === "TODAS" ? null : selectedRegional;
        
        const qParams = new URLSearchParams();
        qParams.set("cliente", selectedCliente);
        qParams.set("periodo_tipo", periodoTipo);
        qParams.set("rotulo", rotulo);
        if (dtInicio) qParams.set("dt_inicio", dtInicio);
        if (dtFim) qParams.set("dt_fim", dtFim);
        if (rParam) qParams.set("regional", rParam);
        qParams.set("modalidade", modalidade);

        const [sellersRes, evolucaoRes] = await Promise.all([
          fetch(`http://localhost:8000/api/clientes/sellers?${qParams.toString()}`).then(r => r.json()),
          fetchClienteEvolucao(
            selectedCliente,
            periodoTipo,
            rotulo,
            periodoTipo === "Período" ? dtInicio : null,
            periodoTipo === "Período" ? dtFim : null,
            rParam,
            modalidade
          )
        ]);
        
        setSellersData(Array.isArray(sellersRes) ? sellersRes : []);
        setEvolucaoData(evolucaoRes);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [periodoTipo, rotulo, dtInicio, dtFim, selectedCliente, selectedRegional, modalidade, optionsLoading]);

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

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedSellers = useMemo(() => {
    return [...sellersData].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortOrder === "asc" 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      return sortOrder === "asc" 
        ? ((aVal as number) || 0) - ((bVal as number) || 0)
        : ((bVal as number) || 0) - ((aVal as number) || 0);
    });
  }, [sellersData, sortField, sortOrder]);

  // Aggregated totals for the cards
  const totaisGlobais = useMemo(() => {
    const vol = sellersData.reduce((acc, r) => acc + (r.total_pacotes || 0), 0);
    const back = sellersData.reduce((acc, r) => acc + (r.total_backlog || 0), 0);
    const sla = vol > 0 ? ((vol - back) / vol) * 100 : 100;
    return { vol, back, sla };
  }, [sellersData]);

  // SLA Chart Tooltip Custom
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#0C101B] border border-border p-3 rounded-xl shadow-xl">
          <p className="text-white font-bold mb-2">{label}</p>
          {payload.map((p: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-sm mb-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}></div>
              <span className="text-muted-foreground">{p.name}:</span>
              <span className="text-white font-semibold">{p.value}{p.name.includes("SLA") ? "%" : ""}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const calculateEvolutionDiff = () => {
    if (evolucaoData.length < 2) return null;
    const start = evolucaoData[0].taxa_coleta;
    const end = evolucaoData[evolucaoData.length - 1].taxa_coleta;
    const diff = end - start;
    return diff;
  };

  const evDiff = calculateEvolutionDiff();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center bg-[#0C101B]/40 p-6 rounded-2xl border border-border gap-4">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Painel do Marketplace</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Análise profunda de performance por Cliente, quebrado por regionais.
            </p>
          </div>
        </div>

        {/* Toolbar selectors */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Marketplace:</span>
            <select
              value={selectedCliente}
              onChange={(e) => setSelectedCliente(e.target.value)}
              className="px-4 py-2 bg-[#0C101B] border border-border rounded-xl text-sm font-semibold text-blue-400 focus:outline-none"
            >
              <option value="TODOS">TODOS</option>
              <option value="SHEIN">SHEIN</option>
              <option value="TEMU D2D">TEMU D2D</option>
              <option value="TIKTOK">TIKTOK</option>
              <option value="KWAI">KWAI</option>
              <option value="OUTROS">OUTROS</option>
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Regional:</span>
            <select
              value={selectedRegional}
              onChange={(e) => setSelectedRegional(e.target.value)}
              className="px-4 py-2 bg-[#0C101B] border border-border rounded-xl text-sm font-semibold text-white focus:outline-none"
            >
              <option value="TODAS">TODAS AS REGIONAIS</option>
              {options.regionais?.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Date/Period Toolbar */}
      <div className="glass-panel p-6 rounded-2xl border border-border flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-3">
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

          <div className="flex bg-[#0C101B] p-1 rounded-xl border border-border">
            {[
              { id: "TODOS", label: "Todos" },
              { id: "DROPOFF", label: "Dropoff" },
              { id: "PICKUP", label: "Pickup" },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setModalidade(m.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  modalidade === m.id
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
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
            <span>Atualizando {selectedCliente}...</span>
          </div>
        )}
      </div>

      {/* Overview Cards for the Selected Client */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StitchCard
          title={`Volume Total (${selectedCliente})`}
          value={`${totaisGlobais.vol.toLocaleString()}`}
          icon={ShoppingBag}
        />
        <StitchCard
          title={`Backlog Total (${selectedCliente})`}
          value={`${totaisGlobais.back.toLocaleString()}`}
          icon={Activity}
          indicator={totaisGlobais.back > 0 ? "Atenção" : "Zerado"}
          indicatorType={totaisGlobais.back > 0 ? "warning" : "success"}
        />
        <StitchCard
          title={`Eficiência OTR (${selectedCliente})`}
          value={`${totaisGlobais.sla.toFixed(2)}%`}
          icon={TrendingUp}
          indicatorType={totaisGlobais.sla >= 98 ? "success" : totaisGlobais.sla >= 90 ? "warning" : "danger"}
        />
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Table of Sellers */}
        <div className="xl:col-span-2 glass-panel rounded-2xl border border-border overflow-hidden flex flex-col h-full">
          <div className="p-6 border-b border-border bg-[#0C101B]/40 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold text-white">Desempenho por Sellers (Lojas)</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Lista de lojas e pontos de coleta do marketplace {selectedCliente}.</p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
              {sellersData.length} Sellers Encontrados
            </span>
          </div>

          <div className="flex-1 overflow-x-auto min-h-[300px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-[#0C101B]/20 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  <th className="py-4 px-6 cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("merchant_nome")}>
                    <div className="flex items-center gap-1"><span>Seller / Loja</span><ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="py-4 px-6 cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("endereco_completo")}>
                    <div className="flex items-center gap-1"><span>Endereço de Coleta / Envio</span><ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="py-4 px-6 text-right cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("total_pacotes")}>
                    <div className="flex items-center justify-end gap-1"><span>Volume</span><ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="py-4 px-6 text-right cursor-pointer hover:text-white transition-all select-none" onClick={() => handleSort("taxa_coleta")}>
                    <div className="flex items-center justify-end gap-1"><span>SLA (%)</span><ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/60 text-xs text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                      <span>Carregando sellers do marketplace {selectedCliente}...</span>
                    </td>
                  </tr>
                ) : sortedSellers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-muted-foreground">
                      Nenhum seller encontrado para {selectedCliente} neste período.
                    </td>
                  </tr>
                ) : (
                  sortedSellers.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-all">
                      <td className="py-3.5 px-6 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">{row.merchant_nome}</span>
                          {row.is_inedito && (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              🆕 SELLER INÉDITO
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground font-mono mt-0.5">ID: {row.merchant_id}</p>
                      </td>
                      <td className="py-3.5 px-6 text-slate-300">
                        <p className="font-medium text-white">{row.cidade} / {row.estado}</p>
                        <p className="text-[11px] text-slate-400 truncate max-w-xs">{row.endereco_completo}</p>
                      </td>
                      <td className="py-3.5 px-6 text-right font-mono font-semibold text-white">{row.total_pacotes.toLocaleString()}</td>
                      <td className="py-3.5 px-6 text-right font-semibold">
                        <span className={row.taxa_coleta >= 98 ? "text-success font-bold" : row.taxa_coleta >= 90 ? "text-warning" : "text-destructive font-bold"}>
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

        {/* SLA Evolution Chart */}
        <div className="glass-panel rounded-2xl border border-border p-6 flex flex-col h-full min-h-[400px]">
          <h2 className="text-lg font-semibold text-white mb-1">Evolução do SLA</h2>
          <p className="text-xs text-muted-foreground mb-6">Histórico diário de eficiência ({selectedCliente}).</p>
          
          <div className="flex-1 w-full relative">
            {loading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500 mb-2" />
              </div>
            ) : evolucaoData.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                Sem dados evolutivos
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolucaoData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                  <XAxis 
                    dataKey="dia_base" 
                    stroke="#64748B" 
                    fontSize={11} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => {
                      if(val.includes("/")) return val.substring(0, 5); // Ex: 20/07
                      return val;
                    }}
                  />
                  <YAxis 
                    stroke="#64748B" 
                    fontSize={11} 
                    tickLine={false}
                    axisLine={false}
                    domain={['auto', 100]}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Line 
                    type="monotone" 
                    name="SLA Coleta"
                    dataKey="taxa_coleta" 
                    stroke="#3B82F6" 
                    strokeWidth={3}
                    dot={{ r: 4, fill: "#0C101B", strokeWidth: 2 }}
                    activeDot={{ r: 6, stroke: "#60A5FA" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          
          {evDiff !== null && (
            <div className="mt-4 flex items-center justify-center">
              <div className={`px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 ${evDiff > 0 ? 'bg-success/10 text-success' : evDiff < 0 ? 'bg-destructive/10 text-destructive' : 'bg-slate-800 text-slate-300'}`}>
                {evDiff > 0 ? <TrendingUp className="w-4 h-4" /> : evDiff < 0 ? <TrendingUp className="w-4 h-4 rotate-180" /> : <Activity className="w-4 h-4" />}
                Evolução no período: {evDiff > 0 ? "+" : ""}{evDiff.toFixed(2)}%
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
