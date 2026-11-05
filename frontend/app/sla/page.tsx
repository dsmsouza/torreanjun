"use client";
import Sidebar from "@/components/Sidebar";

import React, { useEffect, useState } from "react";
import { 
  Clock, 
  Search, 
  Loader2, 
  Filter, 
  Download, 
  AlertTriangle, 
  CheckCircle2, 
  Truck, 
  Package, 
  ShieldAlert, 
  RefreshCw,
  TrendingUp,
  Calendar,
  Layers
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAuth } from "../../hooks/use-auth";
import { safeFetch } from "../../lib/api";

export default function SLAOperacionalPage() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (localStorage.getItem("anjun_perfil") === "operador") {
        window.location.href = "/vtag";
      }
    }
  }, []);

  const { role, activeRegional } = useAuth();

  // Estados principais
  const [diasDisponiveis, setDiasDisponiveis] = useState<string[]>([]);
  const [selectedDia, setSelectedDia] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Dados do Resumo de SLA e Anomalias
  const [resumo, setResumo] = useState<any>(null);
  const [aging, setAging] = useState<any>(null);
  const [anomalias, setAnomalias] = useState<any[]>([]);
  const [hubs, setHubs] = useState<any[]>([]);
  const [d2dDrop, setD2dDrop] = useState<any>(null);
  const [pacotes, setPacotes] = useState<any[]>([]);

  // Filtros da tabela
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegional, setSelectedRegional] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedMD, setSelectedMD] = useState("ALL");
  const [abaAtiva, setAbaAtiva] = useState<"anomalias" | "hubs" | "pacotes">("anomalias");


  // 1. Carregar calendário de datas operacionais
  useEffect(() => {
    async function carregarDias() {
      try {
        const res = await safeFetch("/api/coletas/dias");
        if (res.ok) {
          const data = await res.json();
          const dias = data.dias || [];
          setDiasDisponiveis(dias);
          if (dias.length > 0 && !selectedDia) {
            setSelectedDia(data.dia_recente || dias[0]);
          }
        }
      } catch (e) {
        console.error("Erro ao carregar dias:", e);
      }
    }
    carregarDias();
  }, []);

  // 2. Carregar painel de SLA do dia selecionado
  const carregarPainelSLA = async (dia: string) => {
    if (!dia) return;
    setLoading(true);
    try {
      const res = await safeFetch(`/api/sla/resumo?dia=${encodeURIComponent(dia)}`);
      if (res.ok) {
        const data = await res.json();
        setResumo(data.resumo || null);
        setAging(data.aging || null);
        setAnomalias(data.anomalias || []);
        setHubs(data.hubs_monitoramento || []);
        setD2dDrop(data.d2d_drop_analise || null);
        setPacotes(data.pacotes_abertos || []);

      }
    } catch (e) {
      console.error("Erro ao carregar painel SLA:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDia) {
      carregarPainelSLA(selectedDia);
    }
  }, [selectedDia]);

  // Sincronização sob demanda com a API oficial da Anjun
  const handleSincronizarManual = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/sla/sincronizar?dia=${encodeURIComponent(selectedDia)}`, {
        method: "POST"
      });
      if (res.ok) {
        await carregarPainelSLA(selectedDia);
      }
    } catch (e) {
      console.error("Erro na sincronização manual:", e);
    } finally {
      setSyncing(false);
    }
  };

  // Filtragem dos pacotes
  const pacotesFiltrados = pacotes.filter(p => {
    if (searchQuery && !p.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) && !p.seller?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (selectedRegional !== "ALL" && p.regional !== selectedRegional) return false;
    if (selectedStatus !== "ALL" && p.status !== selectedStatus) return false;
    if (selectedMD !== "ALL" && p.md !== selectedMD) return false;
    if (role === "Regional" && activeRegional !== "ALL" && p.regional !== activeRegional) return false;
    return true;
  });

  const regionais = Array.from(new Set(pacotes.map(p => p.regional).filter(Boolean))).sort();
  const statuses = Array.from(new Set(pacotes.map(p => p.status).filter(Boolean))).sort();
  const mds = Array.from(new Set(pacotesFiltrados.map(p => p.md).filter(Boolean))).sort();

  // Exportar Excel
  const exportarExcel = () => {
    const dadosExportar = pacotesFiltrados.map(p => ({
      "Código de Barras": p.barcode,
      "MD / Ponto": p.md,
      "Regional": p.regional,
      "Cidade": p.cidade || "",
      "Seller": p.seller || "",
      "Status": p.status,
      "Data/Hora Coleta": p.data_hora,
      "Horas Parado": p.horas_parado,
      "Dias Parados": p.dias_parados
    }));
    const ws = XLSX.utils.json_to_sheet(dadosExportar);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pacotes_Criticos_SLA");
    XLSX.writeFile(wb, `SLA_Pacotes_${selectedDia.replace(/\//g, "-")}.xlsx`);
  };

  return (
    <div className="flex h-screen bg-[#090D16] text-slate-100 font-sans overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto pl-16 md:pl-64 flex flex-col p-3 sm:p-6 lg:p-8 space-y-6 max-w-full pb-24">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <Clock className="w-7 h-7 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                Painel de SLA & Anomalias nos MDs
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  OFICIAL ANJUN
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Monitoramento ponta a ponta: volumetria macro, divisão D2D, aging de coleta e anomalias de retenção física.
              </p>
            </div>
          </div>
        </div>

        {/* Seleção de Data & Atualização */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            <select
              value={selectedDia}
              onChange={(e) => setSelectedDia(e.target.value)}
              className="bg-transparent text-white text-xs font-semibold outline-none cursor-pointer"
            >
              {diasDisponiveis.map(d => (
                <option key={d} value={d} className="bg-slate-900 text-white">
                  {d} {d === diasDisponiveis[0] ? "(Hoje / Recente)" : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSincronizarManual}
            disabled={syncing}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 rounded-xl text-xs font-semibold transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar"}
          </button>
        </div>
      </div>

      {loading && !resumo ? (
        <div className="flex flex-col items-center justify-center p-16 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          <p className="text-xs text-slate-400">Carregando indicadores de SLA e anomalias...</p>
        </div>
      ) : (
        <>
          {/* 1. CARDS MACRO DA OPERAÇÃO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Geral de Pedidos */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-slate-900/80 to-slate-950/90 backdrop-blur-md border border-white/[0.08] shadow-xl shadow-black/20 hover:border-blue-500/30 transition-all duration-300 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total de Pedidos</span>
                <Package className="w-5 h-5 text-blue-400" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-white">
                {resumo?.total_pedidos ? resumo.total_pedidos.toLocaleString("pt-BR") : "0"}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800/60 flex justify-between text-[11px] text-slate-400">
                <span>Entrega D2D: <b className="text-slate-200">{resumo?.entrega_d2d?.toLocaleString("pt-BR") || 0}</b></span>
                <span>Coleta D2D: <b className="text-slate-200">{resumo?.coleta_d2d?.toLocaleString("pt-BR") || 0}</b></span>
              </div>
            </div>

            {/* Circuito Fechado / Concluídos */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-emerald-950/30 to-slate-950/90 backdrop-blur-md border border-emerald-500/20 shadow-xl shadow-black/20 hover:border-emerald-500/40 transition-all duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Circuito Fechado</span>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-white">
                {resumo?.circuito_fechado ? resumo.circuito_fechado.toLocaleString("pt-BR") : "0"}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-emerald-400/80">
                Finalizados com sucesso no destino
              </div>
            </div>

            {/* Backlog Represado nos MDs */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-amber-950/30 to-slate-950/90 backdrop-blur-md border border-amber-500/20 shadow-xl shadow-black/20 hover:border-amber-500/40 transition-all duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">Backlog nos MDs</span>
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-white">
                {resumo?.backlog_md ? resumo.backlog_md.toLocaleString("pt-BR") : "0"}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-amber-400/80">
                Aguardando carregamento no caminhão
              </div>
            </div>

            {/* Anomalias Físicas Detectadas */}
            <div className="p-4 rounded-2xl bg-gradient-to-b from-rose-950/30 to-slate-950/90 backdrop-blur-md border border-rose-500/20 shadow-xl shadow-black/20 hover:border-rose-500/40 transition-all duration-300">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-rose-400 uppercase tracking-wider">Anomalias nos MDs</span>
                <ShieldAlert className="w-5 h-5 text-rose-400" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums text-white">
                {anomalias.length}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-rose-400/80">
                Pontos com retenção crítica ou taxa &lt; 80%
              </div>
            </div>
          </div>

          {/* 2. AGING OPERACIONAL & CUMPRIMENTO DE SLA */}
          {aging && (
            <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                    Faixas de Aging da Operação (Tempo de Trânsito / SLA)
                  </h2>
                </div>
                <div className="text-xs text-slate-400">
                  Cumprimento estimado: <span className="font-bold text-emerald-400">{aging.pct_dentro_sla}% dentro de 24h</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="p-3 rounded-xl bg-slate-950/60 border border-emerald-900/40">
                  <span className="text-[11px] text-emerald-400 font-medium">Até 24 Horas (No Prazo)</span>
                  <div className="text-lg font-bold text-white mt-1">
                    {aging.faixa_ate_24h?.toLocaleString("pt-BR") || 0}
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full" style={{ width: "95%" }}></div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-amber-900/40">
                  <span className="text-[11px] text-amber-400 font-medium">24h a 48h (Atenção)</span>
                  <div className="text-lg font-bold text-white mt-1">
                    {aging.faixa_24_48h?.toLocaleString("pt-BR") || 0}
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-amber-500 h-full rounded-full" style={{ width: "5%" }}></div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-orange-900/40">
                  <span className="text-[11px] text-orange-400 font-medium">48h a 72h (Risco Alto)</span>
                  <div className="text-lg font-bold text-white mt-1">
                    {aging.faixa_48_72h?.toLocaleString("pt-BR") || 0}
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-orange-500 h-full rounded-full" style={{ width: "2%" }}></div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/60 border border-rose-900/40">
                  <span className="text-[11px] text-rose-400 font-medium">Acima de 72h (Crítico / Fora SLA)</span>
                  <div className="text-lg font-bold text-white mt-1">
                    {aging.faixa_acima_72h?.toLocaleString("pt-BR") || 0}
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div className="bg-rose-500 h-full rounded-full" style={{ width: "1%" }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 3. COMPORTAMENTO D2D & SHEIN DROPADOS NOS MINIDROPS */}
          {d2dDrop && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/30 via-slate-900 to-indigo-950/30 border border-blue-900/40 shadow-lg space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Comportamento D2D: Pedidos Dropados nos MiniDrops (MD)
                  </h3>
                </div>
                <span className="text-[11px] text-blue-300 font-medium bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                  Sellers levam pedidos D2D ao balcão do MD para agilizar
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Shein D2D */}
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-200">Operação Shein (Amostra do Dia)</span>
                    <span className="text-emerald-400 font-bold">{d2dDrop.shein_pct_dropado_md}% Dropado em MD</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                    <div 
                      className="bg-emerald-500 h-full transition-all" 
                      style={{ width: `${d2dDrop.shein_pct_dropado_md}%` }}
                      title="Dropado em MiniDrop"
                    />
                    <div 
                      className="bg-blue-500 h-full transition-all" 
                      style={{ width: `${100 - d2dDrop.shein_pct_dropado_md}%` }}
                      title="Coleta Porta a Porta"
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                    <span>🟢 Dropado no Balcão MD: <b className="text-white">{d2dDrop.shein_dropado_em_md?.toLocaleString("pt-BR")}</b></span>
                    <span>🔵 Coleta na Porta do Seller: <b className="text-white">{d2dDrop.shein_coleta_porta?.toLocaleString("pt-BR")}</b></span>
                  </div>
                </div>

                {/* D2D Geral */}
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-200">Total D2D Operacional (Amostra)</span>
                    <span className="text-blue-400 font-bold">{d2dDrop.d2d_pct_dropado_md}% Dropado em MD</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                    <div 
                      className="bg-amber-500 h-full transition-all" 
                      style={{ width: `${d2dDrop.d2d_pct_dropado_md}%` }}
                      title="Dropado em MiniDrop"
                    />
                    <div 
                      className="bg-indigo-500 h-full transition-all" 
                      style={{ width: `${100 - d2dDrop.d2d_pct_dropado_md}%` }}
                      title="Coleta na Porta"
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                    <span>🟡 Dropado no Balcão MD: <b className="text-white">{d2dDrop.d2d_dropado_em_md?.toLocaleString("pt-BR")}</b></span>
                    <span>🟣 Coletado na Porta: <b className="text-white">{d2dDrop.d2d_coleta_porta?.toLocaleString("pt-BR")}</b></span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. SELETOR DE ABAS: ANOMALIAS EM MDS vs HUB CENTRAL GLP vs PACOTES EM ABERTO */}
          <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-2 gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAbaAtiva("anomalias")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  abaAtiva === "anomalias"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                Anomalias em MiniDrops ({anomalias.length})
              </button>

              <button
                onClick={() => setAbaAtiva("hubs")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  abaAtiva === "hubs"
                    ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Truck className="w-4 h-4 text-purple-400" />
                HUB Central GLP & Transferência ({hubs.length})
              </button>

              <button
                onClick={() => setAbaAtiva("pacotes")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                  abaAtiva === "pacotes"
                    ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Layers className="w-4 h-4 text-blue-400" />
                Auditoria de Pacotes em Aberto ({pacotesFiltrados.length})
              </button>
            </div>

            {abaAtiva === "pacotes" && (
              <button
                onClick={exportarExcel}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-semibold transition"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar Excel
              </button>
            )}
          </div>

          {/* ABA 1: ANOMALIAS NOS MDS (ESTRITAMENTE MINIDROPS) */}
          {abaAtiva === "anomalias" && (
            <div className="space-y-3">
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                <span className="font-bold text-amber-300">Regra de Malha:</span>
                Esta aba monitora exclusivamente MiniDrops legítimos (prefixos <code className="text-white">UF-W-MDxxx</code> e <code className="text-white">MD-XXX-01</code>). HUBs como o GLP Guarulhos estão na aba dedicada de HUBs.
              </div>

              {anomalias.length === 0 ? (
                <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 text-xs">
                  ✅ Nenhum MiniDrop com retenção física crítica detectado para {selectedDia}.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {anomalias.map((ano, idx) => (
                    <div 
                      key={idx}
                      className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition space-y-2 relative overflow-hidden"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white text-sm flex items-center gap-1.5">
                          <Package className="w-4 h-4 text-amber-400" />
                          {ano.md}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          ano.gravidade === "CRITICO"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        }`}>
                          {ano.gravidade}
                        </span>
                      </div>

                      <div className="text-xs font-semibold text-slate-300">
                        {ano.tipo}
                      </div>

                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        {ano.detalhe}
                      </p>

                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Regional: <b className="text-slate-200">{ano.regional}</b> {ano.cidade ? `• ${ano.cidade}` : ""}</span>
                        <span>Expedição: <b className="text-amber-400">{ano.taxa_expedicao}</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ABA 2: HUB CENTRAL ANJUN (GLP) & TRANSFERÊNCIA */}
          {abaAtiva === "hubs" && (
            <div className="space-y-3">
              <div className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-800/40 text-[11px] text-purple-200 flex items-center gap-2">
                <span className="font-bold text-white">HUBs Operacionais:</span>
                O <b className="text-white">WR-GLP-01</b> é o HUB Central Anjun de Triagem / Cross-docking. Não faz atendimento de balcão e opera com recebimento e transferência em massa.
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {hubs.map((h, idx) => (
                  <div 
                    key={idx}
                    className="p-4 rounded-xl bg-slate-900/80 border border-purple-900/30 hover:border-purple-700/50 transition space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm flex items-center gap-1.5">
                        <Truck className="w-4 h-4 text-purple-400" />
                        {h.hub}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        {h.classificacao}
                      </span>
                    </div>

                    <div className="text-xs text-slate-300">
                      Regional: <b className="text-white">{h.regional}</b> {h.cidade ? `• ${h.cidade}` : ""}
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-center">
                      <div className="p-1.5 rounded-lg bg-slate-950/60">
                        <div className="text-[10px] text-slate-400">Total</div>
                        <div className="text-xs font-bold text-white">{h.total?.toLocaleString("pt-BR")}</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-slate-950/60">
                        <div className="text-[10px] text-slate-400">Carregado</div>
                        <div className="text-xs font-bold text-emerald-400">{h.carregamento?.toLocaleString("pt-BR")}</div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-slate-950/60">
                        <div className="text-[10px] text-slate-400">Backlog</div>
                        <div className="text-xs font-bold text-amber-400">{h.backlog?.toLocaleString("pt-BR")}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}


          {/* ABA 2: TABELA DE PACOTES EM ABERTO */}
          {abaAtiva === "pacotes" && (
            <div className="space-y-4">
              {/* Filtros da Tabela */}
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap gap-3 items-center">
                <Filter className="w-4 h-4 text-slate-400" />
                
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Buscar Barcode ou Seller..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500/50"
                  />
                </div>

                <select 
                  value={selectedRegional} 
                  onChange={(e) => setSelectedRegional(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
                >
                  <option value="ALL">Todas Regionais</option>
                  {regionais.map(r => <option key={r} value={r}>{r}</option>)}
                </select>

                <select 
                  value={selectedStatus} 
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
                >
                  <option value="ALL">Todos os Status</option>
                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                
                <select 
                  value={selectedMD} 
                  onChange={(e) => setSelectedMD(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none cursor-pointer max-w-[180px]"
                >
                  <option value="ALL">Todos os MDs</option>
                  {mds.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              {/* Tabela de Pacotes */}
              <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/60 shadow-xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-semibold tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Código de Barras</th>
                        <th className="px-4 py-3">MD / Ponto</th>
                        <th className="px-4 py-3">Regional / Cidade</th>
                        <th className="px-4 py-3">Seller</th>
                        <th className="px-4 py-3">Status Atual</th>
                        <th className="px-4 py-3">Data / Hora</th>
                        <th className="px-4 py-3 text-right">Tempo Parado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {pacotesFiltrados.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-slate-500">
                            Nenhum pacote pendente encontrado com os filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        pacotesFiltrados.slice(0, 100).map((p, i) => (
                          <tr key={i} className="hover:bg-slate-800/40 transition">
                            <td className="px-4 py-2.5 font-mono font-medium text-white">{p.barcode}</td>
                            <td className="px-4 py-2.5 font-semibold text-amber-300">{p.md}</td>
                            <td className="px-4 py-2.5">{p.regional} {p.cidade ? `• ${p.cidade}` : ""}</td>
                            <td className="px-4 py-2.5 max-w-[160px] truncate" title={p.seller}>{p.seller || "N/D"}</td>
                            <td className="px-4 py-2.5">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                {p.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-400">{p.data_hora}</td>
                            <td className="px-4 py-2.5 text-right font-bold text-rose-400">
                              {p.horas_parado > 0 ? `${p.horas_parado}h (${p.dias_parados}d)` : "N/D"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      </main>
    </div>
  );
}
