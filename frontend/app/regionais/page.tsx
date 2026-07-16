"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../hooks/use-auth";
import { fetchOptions, fetchResumo, ResumoGeral, OptionsData } from "../../lib/api";
import { 
  Globe, 
  Calendar, 
  Loader2, 
  ArrowRight, 
  TrendingUp, 
  Inbox, 
  AlertTriangle 
} from "lucide-react";

export default function RegionaisPage() {
  const { role, activeRegional, searchParamsStr } = useAuth();
  
  // Filter States
  const [periodoTipo, setPeriodoTipo] = useState<string>("Diário");
  const [rotulo, setRotulo] = useState<string>("");
  const [dtInicio, setDtInicio] = useState<string>("");
  const [dtFim, setDtFim] = useState<string>("");
  const [regra5k, setRegra5k] = useState<boolean>(false);

  // Data States
  const [options, setOptions] = useState<OptionsData>({ dias: [], semanas: [] });
  const [resumo, setResumo] = useState<ResumoGeral | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  // Load options on mount
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

  // Update default label when switching view types
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

  // Fetch summary data
  useEffect(() => {
    if (optionsLoading || !rotulo) return;
    if (periodoTipo === "Período" && (!dtInicio || !dtFim)) return;

    const loadResumo = async () => {
      setLoading(true);
      try {
        const data = await fetchResumo(
          periodoTipo,
          rotulo,
          null, // always load globally for the ranking list
          periodoTipo === "Período" ? dtInicio : null,
          periodoTipo === "Período" ? dtFim : null,
          regra5k
        );
        setResumo(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadResumo();
  }, [periodoTipo, rotulo, dtInicio, dtFim, optionsLoading, regra5k]);

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

  const getProgressBarColor = (efficiency: number) => {
    if (efficiency >= 98) return "bg-success shadow-success/20";
    if (efficiency >= 90) return "bg-warning shadow-warning/20";
    return "bg-destructive shadow-destructive/20";
  };

  const getTextColor = (efficiency: number) => {
    if (efficiency >= 98) return "text-success";
    if (efficiency >= 90) return "text-warning";
    return "text-destructive";
  };

  // Sort regionais by total packages descending
  const regionaisSorted = resumo 
    ? [...resumo.regionais].sort((a, b) => b.total - a.total) 
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-[#0C101B]/40 p-6 rounded-2xl border border-border">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <Globe className="w-8 h-8 text-blue-400" />
            <span>Performance Regionais</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Lista de performance analítica e acompanhamento de SLAs por regional da ANJUN.
          </p>
        </div>
        <div className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-border text-xs font-semibold text-blue-400">
          Painel {role} {activeRegional ? `(${activeRegional})` : ""}
        </div>
      </div>

      {/* Toolbar */}
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
            <span>Atualizando regionais...</span>
          </div>
        )}
      </div>

      {/* Regionais Cards Layout */}
      {loading || optionsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
          <div className="h-44 bg-slate-800/40 rounded-2xl border border-border"></div>
          <div className="h-44 bg-slate-800/40 rounded-2xl border border-border"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {regionaisSorted.map((reg) => (
            <div 
              key={reg.regional}
              className="glass-panel p-6 rounded-2xl border border-border flex flex-col justify-between hover:border-blue-500/25 transition-all group"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    Regional: {reg.regional}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">ANJUN Logística</p>
                </div>
                
                {/* Visual Progress percentage */}
                <div className={`text-xl font-bold font-mono ${getTextColor(reg.taxa_coleta)}`}>
                  {reg.taxa_coleta.toFixed(2)}%
                </div>
              </div>

              {/* SLA Progress Bar */}
              <div className="mt-4">
                <div className="flex justify-between items-center text-[10px] font-semibold text-muted-foreground tracking-wide uppercase mb-1">
                  <span>Conformidade de SLA (Meta: 98%)</span>
                  <span>{reg.taxa_coleta.toFixed(0)}%</span>
                </div>
                <div className="w-full h-2.5 bg-[#0C101B] rounded-full overflow-hidden border border-border/50">
                  <div 
                    className={`h-full rounded-full transition-all shadow ${getProgressBarColor(reg.taxa_coleta)}`} 
                    style={{ width: `${Math.min(reg.taxa_coleta, 100)}%` }}
                  ></div>
                </div>
              </div>

              {/* Cards Metrics Row */}
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border/40 pt-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-400 shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase leading-none">Previsto</p>
                    <p className="text-xs font-bold text-white mt-1 leading-none">{(reg.total ?? 0).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-warning shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase leading-none">Backlog</p>
                    <p className="text-xs font-bold text-white mt-1 leading-none">{(reg.backlog ?? 0).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
                  <div>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase leading-none">Lacre Erros</p>
                    <p className="text-xs font-bold text-white mt-1 leading-none">{(reg.erros_lacre ?? 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Action Button to Filial Details */}
              <div className="mt-5 flex justify-end">
                {/* Prepend correct searchParamsStr based on user login status */}
                {/* If the regional matches user's active regional, or user is master, allow going into detail */}
                <Link
                  href={`/filial${searchParamsStr ? `${searchParamsStr}&filial=${reg.regional}` : `?regional=${reg.regional}`}`}
                  className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition-all"
                >
                  <span>Análise da Filial</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-all" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
