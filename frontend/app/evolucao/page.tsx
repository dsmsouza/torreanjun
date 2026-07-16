"use client";

import React, { useEffect, useState } from "react";
import { TrendingUp, Loader2, Filter } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  LabelList,
} from "recharts";
import { useAuth } from "../../hooks/use-auth";

import { API_URL } from "../../lib/api";

export default function EvolucaoPage() {
  const { role, activeRegional } = useAuth();
  
  const [dados, setDados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedRegional, setSelectedRegional] = useState("ALL");
  const [selectedMes, setSelectedMes] = useState("ALL");
  const [selectedSemana, setSelectedSemana] = useState("ALL");
  const [agrupamento, setAgrupamento] = useState("SEMANA"); // SEMANA ou MES

  useEffect(() => {
    const fetchDados = async () => {
      try {
        const res = await fetch(`${API_URL}/api/evolucao/dados`);
        const data = await res.json();
        
        // Enrich data with month extracted from semana_base
        const enriched = (data.data || []).map((d: any) => {
          const parts = (d.semana_base || "").split("-");
          const mes = parts.length > 1 ? parts[1].trim() : "Outros";
          return { ...d, mes };
        });
        
        setDados(enriched);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchDados();
  }, []);

  // Filter data
  const filtered = dados.filter(d => {
    if (selectedRegional !== "ALL" && d.regional !== selectedRegional) return false;
    if (role === "Regional" && activeRegional !== "ALL" && d.regional !== activeRegional) return false;
    if (selectedMes !== "ALL" && d.mes !== selectedMes) return false;
    if (selectedSemana !== "ALL" && d.semana_base !== selectedSemana) return false;
    return true;
  });

  // Aggregate by chosen timeframe (Semana or Mes)
  const chartDataMap = new Map();
  filtered.forEach(d => {
    let timeKey = "";
    if (agrupamento === "MES") timeKey = d.mes;
    else if (agrupamento === "SEMANA") timeKey = d.semana_base || "Sem Data";
    else timeKey = d.dia_base || "Sem Data";

    if (!chartDataMap.has(timeKey)) {
      chartDataMap.set(timeKey, {
        timeKey: timeKey,
        total_pacotes: 0,
        total_backlog: 0,
      });
    }
    const curr = chartDataMap.get(timeKey);
    curr.total_pacotes += d.total_pacotes;
    curr.total_backlog += d.total_backlog;
  });

  const chartData = Array.from(chartDataMap.values()).map(d => {
    // Calculate global SLA for the aggregated period
    const sla = d.total_pacotes > 0 ? ((d.total_pacotes - d.total_backlog) / d.total_pacotes) * 100 : 0;
    return {
      ...d,
      sla_coleta: parseFloat(sla.toFixed(2))
    };
  }).sort((a, b) => a.timeKey.localeCompare(b.timeKey));

  const regionais = Array.from(new Set(dados.map(d => d.regional).filter(Boolean))).sort();
  const meses = Array.from(new Set(dados.map(d => d.mes).filter(Boolean))).sort();
  const semanas = Array.from(new Set(dados.filter(d => selectedMes === "ALL" || d.mes === selectedMes).map(d => d.semana_base).filter(Boolean))).sort();

  return (
    <main className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-7 h-7 text-emerald-400" />
            Evolução Histórica
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análise temporal do SLA, Volumes e Backlog da malha.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel p-4 rounded-xl border border-border flex flex-wrap gap-4 items-center">
        <Filter className="w-5 h-5 text-muted-foreground" />
        
        <select 
          value={agrupamento} 
          onChange={(e) => setAgrupamento(e.target.value)}
          className="bg-[#0f172a] border border-blue-500/30 text-blue-400 font-semibold text-sm rounded-lg px-3 py-2 outline-none"
        >
          <option value="DIA">Ver por Dia</option>
          <option value="SEMANA">Ver por Semana</option>
          <option value="MES">Ver por Mês</option>
        </select>

        <select 
          value={selectedRegional} 
          onChange={(e) => setSelectedRegional(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 outline-none"
          disabled={role === "Regional" && activeRegional !== "ALL"}
        >
          <option value="ALL">Todas as Regionais</option>
          {regionais.map(r => <option key={r as string} value={r as string}>{r as string}</option>)}
        </select>

        <select 
          value={selectedMes} 
          onChange={(e) => { setSelectedMes(e.target.value); setSelectedSemana("ALL"); }}
          className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 outline-none"
        >
          <option value="ALL">Todos os Meses</option>
          {meses.map(m => <option key={m as string} value={m as string}>{m as string}</option>)}
        </select>

        <select 
          value={selectedSemana} 
          onChange={(e) => setSelectedSemana(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 outline-none max-w-[200px]"
          disabled={agrupamento === "MES"}
        >
          <option value="ALL">Todas as Semanas</option>
          {semanas.map(s => <option key={s as string} value={s as string}>{s as string}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="glass-panel min-h-[400px] rounded-2xl border border-border flex items-center justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="glass-panel min-h-[400px] rounded-2xl border border-border flex items-center justify-center">
          <p className="text-muted-foreground">Não há dados suficientes para os filtros selecionados.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Evolução SLA */}
          <div className="glass-panel p-6 rounded-2xl border border-border">
            <h2 className="text-lg font-bold text-white mb-4">Evolução do SLA de Coleta (%)</h2>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="timeKey" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px", color: "#f8fafc" }}
                    itemStyle={{ color: "#10b981" }}
                  />
                  <Line type="monotone" dataKey="sla_coleta" name="SLA (%)" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }}>
                    <LabelList dataKey="sla_coleta" position="top" fill="#10b981" fontSize={11} formatter={(val: any) => val + '%'} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Evolução Total Pacotes */}
            <div className="glass-panel p-6 rounded-2xl border border-border">
              <h2 className="text-lg font-bold text-white mb-4">Volume Total Bipado</h2>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="timeKey" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px", color: "#f8fafc" }}
                      itemStyle={{ color: "#3b82f6" }}
                      cursor={{ fill: '#1e293b' }}
                    />
                    <Bar dataKey="total_pacotes" name="Vol. Bipado" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="total_pacotes" position="top" fill="#3b82f6" fontSize={11} formatter={(val: any) => val >= 1000 ? (val/1000).toFixed(1) + 'k' : val} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Evolução Backlog */}
            <div className="glass-panel p-6 rounded-2xl border border-border">
              <h2 className="text-lg font-bold text-white mb-4">Volume de Backlog</h2>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="timeKey" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px", color: "#f8fafc" }}
                      itemStyle={{ color: "#ef4444" }}
                      cursor={{ fill: '#1e293b' }}
                    />
                    <Bar dataKey="total_backlog" name="Backlog" fill="#ef4444" radius={[4, 4, 0, 0]}>
                      <LabelList dataKey="total_backlog" position="top" fill="#ef4444" fontSize={11} formatter={(val: any) => val >= 1000 ? (val/1000).toFixed(1) + 'k' : val} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
