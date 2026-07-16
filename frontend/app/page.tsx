"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../hooks/use-auth";
import { fetchOptions, fetchResumo, fetchContextoPeriodo, ResumoGeral, OptionsData } from "../lib/api";
import StitchCard from "../components/StitchCard";
import DataTable from "../components/DataTable";
import FormJustificativa from "../components/FormJustificativa";
import ResumoNumerico from "../components/ResumoNumerico";
import ChatIA from "../components/ChatIA";
import { 
  BarChart3, 
  Inbox, 
  TrendingUp, 
  AlertTriangle, 
  Calendar, 
  Loader2,
  Sparkles,
  Layers
} from "lucide-react";

export default function Home() {
  const { role, activeRegional, isMaster } = useAuth();
  
  // Filter States
  const [periodoTipo, setPeriodoTipo] = useState<string>("Diário");
  const [rotulo, setRotulo] = useState<string>("Carregando...");
  const [dtInicio, setDtInicio] = useState<string>("");
  const [dtFim, setDtFim] = useState<string>("");
  const [selectedRegional, setSelectedRegional] = useState<string | null>(null);
  const [regra5k, setRegra5k] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // UI Tabs State
  const [activeTab, setActiveTab] = useState<"operacional" | "ia">("operacional");

  // Data States
  const [options, setOptions] = useState<OptionsData>({ dias: [], semanas: [] });
  const [resumo, setResumo] = useState<ResumoGeral | null>(null);
  const [iaContext, setIaContext] = useState<any>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  // 1. Load filters from sessionStorage after mounting to prevent SSR hydration mismatch
  useEffect(() => {
    const savedPeriodo = sessionStorage.getItem("dashboard_periodoTipo");
    const savedRotulo = sessionStorage.getItem("dashboard_rotulo");
    const savedDtInicio = sessionStorage.getItem("dashboard_dtInicio");
    const savedDtFim = sessionStorage.getItem("dashboard_dtFim");
    const savedRegional = sessionStorage.getItem("dashboard_selectedRegional");
    const savedRegra5k = sessionStorage.getItem("dashboard_regra5k");

    if (savedPeriodo) setPeriodoTipo(savedPeriodo);
    if (savedRotulo) setRotulo(savedRotulo);
    if (savedDtInicio) setDtInicio(savedDtInicio);
    if (savedDtFim) setDtFim(savedDtFim);
    if (savedRegional) setSelectedRegional(savedRegional);
    if (savedRegra5k) setRegra5k(savedRegra5k === "true");
    
    setIsLoaded(true);
  }, []);

  // 2. Persist filters on changes
  useEffect(() => {
    if (isLoaded) {
      sessionStorage.setItem("dashboard_periodoTipo", periodoTipo);
    }
  }, [periodoTipo, isLoaded]);

  useEffect(() => {
    if (isLoaded && rotulo && rotulo !== "Carregando...") {
      sessionStorage.setItem("dashboard_rotulo", rotulo);
      sessionStorage.setItem(`dashboard_rotulo_${periodoTipo}`, rotulo);
    }
  }, [rotulo, periodoTipo, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      sessionStorage.setItem("dashboard_dtInicio", dtInicio);
    }
  }, [dtInicio, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      sessionStorage.setItem("dashboard_dtFim", dtFim);
    }
  }, [dtFim, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      if (selectedRegional) {
        sessionStorage.setItem("dashboard_selectedRegional", selectedRegional);
      } else {
        sessionStorage.removeItem("dashboard_selectedRegional");
      }
    }
  }, [selectedRegional, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      sessionStorage.setItem("dashboard_regra5k", String(regra5k));
    }
  }, [regra5k, isLoaded]);

  // Enforce regional constraints based on user role
  useEffect(() => {
    if (activeRegional) {
      setSelectedRegional(activeRegional);
    }
  }, [activeRegional]);

  // Load available dates and weeks
  useEffect(() => {
    const loadOptions = async () => {
      setOptionsLoading(true);
      try {
        const data = await fetchOptions();
        setOptions(data);
        const savedPeriodo = sessionStorage.getItem("dashboard_periodoTipo") || "Diário";
        const savedRotulo = sessionStorage.getItem(`dashboard_rotulo_${savedPeriodo}`);
        if (savedRotulo && savedRotulo !== "Carregando...") {
          setRotulo(savedRotulo);
        } else if (data.dias && data.dias.length > 0) {
          setRotulo(data.dias[0]);
        }
      } catch (err) {
        console.error("Error loading options:", err);
      } finally {
        setOptionsLoading(false);
      }
    };
    loadOptions();
  }, []);

  // Update default label when switching view types
  useEffect(() => {
    if (optionsLoading) return;

    const savedRotulo = sessionStorage.getItem(`dashboard_rotulo_${periodoTipo}`);
    if (savedRotulo && savedRotulo !== "Carregando...") {
      setRotulo(savedRotulo);
      return;
    }

    if (periodoTipo === "Diário" && options.dias.length > 0) {
      setRotulo(options.dias[0]);
    } else if (periodoTipo === "Semanal" && options.semanas.length > 0) {
      setRotulo(options.semanas[0]);
    } else if (periodoTipo === "Mensal") {
      const meses = Array.from(new Set(options.dias.map(d => {
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

  // Fetch summary data and IA context on filters change
  useEffect(() => {
    if (optionsLoading || !rotulo || rotulo === "Carregando...") return;
    if (periodoTipo === "Período" && (!dtInicio || !dtFim)) return;

    const loadResumo = async () => {
      setLoading(true);
      try {
        // 1. Fetch metrics
        const data = await fetchResumo(
          periodoTipo,
          rotulo,
          selectedRegional,
          periodoTipo === "Período" ? dtInicio : null,
          periodoTipo === "Período" ? dtFim : null,
          regra5k
        );
        setResumo(data);

        // 2. Fetch IA context
        try {
          const ctx = await fetchContextoPeriodo(
            periodoTipo,
            rotulo,
            periodoTipo === "Período" ? dtInicio : null,
            periodoTipo === "Período" ? dtFim : null
          );
          setIaContext(ctx);
        } catch (ctxErr) {
          console.error("Error loading IA context:", ctxErr);
          setIaContext({ contexto: "Erro ao compilar dados operacionais do período." });
        }
      } catch (err) {
        console.error("Error loading resumo:", err);
      } finally {
        setLoading(false);
      }
    };

    loadResumo();
  }, [periodoTipo, rotulo, dtInicio, dtFim, selectedRegional, optionsLoading, regra5k]);

  // Format month label YYYY-MM to pt-BR (e.g. Junho/2026)
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

  const handleRowSelect = (reg: string | null) => {
    if (isMaster) {
      setSelectedRegional(reg);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex justify-between items-center bg-[#0C101B]/40 p-6 rounded-2xl border border-border">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Visão Geral</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Dashboard consolidado de coletas, backlogs e conformidades operacionais.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-slate-800/80 border border-border text-xs font-semibold text-blue-400">
            Perfil: {role} {activeRegional ? `(${activeRegional})` : ""}
          </div>
          {selectedRegional && isMaster && (
            <div className="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400">
              Filtro Ativo: {selectedRegional}
            </div>
          )}
        </div>
      </div>

      {/* Filters Control Toolbar */}
      <div className="glass-panel p-6 rounded-2xl border border-border flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap items-center gap-4">
          {/* Period Type Radio Buttons */}
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

          {/* Dynamic Selectors */}
          {!optionsLoading && (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              
              {periodoTipo === "Diário" && options.dias.length > 0 && (
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

              {periodoTipo === "Semanal" && options.semanas.length > 0 && (
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
          <div className="flex items-center gap-2 border-l border-border/80 pl-4 ml-2">
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
        </div>

        {/* Global Loading Spinner */}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            <span>Atualizando painel...</span>
          </div>
        )}
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StitchCard
          title="Volume Previsto"
          value={resumo ? (resumo.volume_total ?? 0).toLocaleString() : "0"}
          icon={BarChart3}
          indicator={resumo ? `${((resumo.volume_total ?? 0) / 1000).toFixed(1)}k pacotes` : ""}
          loading={loading || optionsLoading}
        />
        <StitchCard
          title="Backlog Retido"
          value={resumo ? (resumo.volume_backlog ?? 0).toLocaleString() : "0"}
          icon={Inbox}
          indicator={resumo ? `${(resumo.taxa_backlog ?? 0).toFixed(2)}% do previsto` : ""}
          indicatorType={resumo && (resumo.volume_backlog ?? 0) > 0 ? "warning" : "neutral"}
          loading={loading || optionsLoading}
        />
        <StitchCard
          title="Eficiência Coletas"
          value={resumo ? `${(resumo.taxa_coleta ?? 0).toFixed(2)}%` : "0%"}
          icon={TrendingUp}
          indicator={resumo && (resumo.taxa_coleta ?? 0) >= 98 ? "🟢 SLA Conforme" : (resumo && (resumo.taxa_coleta ?? 0) >= 90 ? "🟡 SLA Aceitável" : "🔴 SLA Desvio")}
          indicatorType={resumo && (resumo.taxa_coleta ?? 0) >= 98 ? "success" : (resumo && (resumo.taxa_coleta ?? 0) >= 90 ? "warning" : "danger")}
          loading={loading || optionsLoading}
        />
        <StitchCard
          title="Erros de Lacre"
          value={resumo ? (resumo.erros_lacre ?? 0).toLocaleString() : "0"}
          icon={AlertTriangle}
          indicator={resumo && (resumo.erros_lacre ?? 0) > 0 ? "🔒 Divergências" : "✅ Sem erros"}
          indicatorType={resumo && (resumo.erros_lacre ?? 0) > 0 ? "danger" : "success"}
          loading={loading || optionsLoading}
        />
      </div>

      {/* Main Content Layout (Table + Side widgets) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Regionals Performance Table */}
        <div className="lg:col-span-2">
          <DataTable
            data={resumo ? resumo.regionais : []}
            selectedRegional={selectedRegional}
            onSelectRegional={handleRowSelect}
            loading={loading || optionsLoading}
          />
        </div>

        {/* Side Panel: Tabbed Panel (Operational Forms vs AI Copilot) */}
        <div className="space-y-6">
          {/* Tab Selector Buttons */}
          <div className="flex bg-[#0C101B]/60 p-1 rounded-2xl border border-border shadow-md">
            <button
              onClick={() => setActiveTab("operacional")}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                activeTab === "operacional"
                  ? "bg-primary text-white shadow-lg shadow-blue-500/10"
                  : "text-muted-foreground hover:text-white hover:bg-slate-800/20"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Painel Operacional</span>
            </button>
            <button
              onClick={() => setActiveTab("ia")}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center flex items-center justify-center gap-1.5 ${
                activeTab === "ia"
                  ? "bg-primary text-white shadow-lg shadow-blue-500/10"
                  : "text-muted-foreground hover:text-white hover:bg-slate-800/20"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Assistente IA (WBR)</span>
            </button>
          </div>

          {/* Tab Content Display */}
          {activeTab === "operacional" ? (
            <div className="space-y-6">
              <FormJustificativa
                diaBase={periodoTipo === "Diário" ? rotulo : "Vários Dias"}
                regionalsList={resumo ? resumo.regionais.map(r => r.regional) : []}
              />
              
              {resumo && rotulo && rotulo !== "Carregando..." && (
                <ResumoNumerico
                  diaBase={periodoTipo === "Diário" ? rotulo : `${periodoTipo} (${rotulo})`}
                  volumeTotal={resumo.volume_total}
                  volumeBacklog={resumo.volume_backlog}
                  taxaColeta={resumo.taxa_coleta}
                  errosLacre={resumo.erros_lacre}
                  selectedRegional={selectedRegional}
                />
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <ChatIA
                filial={periodoTipo === "Diário" ? `Dia: ${rotulo}` : `${periodoTipo}: ${rotulo}`}
                contextoData={iaContext}
                isWeeklyMode={true}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
