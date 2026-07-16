"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../hooks/use-auth";
import { 
  fetchMDScores, 
  fetchPenalidades, 
  fetchAlertasFixos, 
  savePenalidade, 
  deletePenalidade, 
  saveAlertaFixo, 
  deleteAlertaFixo, 
  MDScore, 
  Penalidade, 
  AlertaFixo 
} from "../../lib/api";
import { 
  Activity, 
  ShieldAlert, 
  PlusCircle, 
  Trash2, 
  Loader2, 
  CheckCircle,
  FileSpreadsheet
} from "lucide-react";

export default function ScoreMDPage() {
  const { role, isMaster } = useAuth();
  
  // Tab control
  const [activeTab, setActiveTab] = useState<"ranking" | "admin">("ranking");

  // Data States
  const [scores, setScores] = useState<MDScore[]>([]);
  const [penalties, setPenalties] = useState<Penalidade[]>([]);
  const [alerts, setAlerts] = useState<AlertaFixo[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form States
  const [formPenalty, setFormPenalty] = useState({ md: "", motivo: "", pontos: 5, date: "" });
  const [formAlert, setFormAlert] = useState({ md: "", observacao: "" });
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!isMaster) {
      setActiveTab("ranking");
    }
  }, [isMaster]);

  const loadData = async () => {
    setLoading(true);
    try {
      const scoresData = await fetchMDScores();
      setScores(scoresData);
      
      if (isMaster) {
        const penData = await fetchPenalidades();
        setPenalties(penData);
        
        const alertsData = await fetchAlertasFixos();
        setAlerts(alertsData);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [isMaster]);

  // Handle Recording Penalty
  const handleAddPenalty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPenalty.md || !formPenalty.motivo || formPenalty.pontos <= 0) return;
    
    setActionLoading(true);
    setMessage(null);
    try {
      const today = formPenalty.date || new Date().toISOString().split("T")[0];
      await savePenalidade(today, formPenalty.md, formPenalty.motivo, formPenalty.pontos);
      setMessage({ text: "Penalidade gravada com sucesso!", type: "success" });
      setFormPenalty({ md: "", motivo: "", pontos: 5, date: "" });
      await loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ text: err.message || "Erro ao gravar penalidade.", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Recording Permanent Alert
  const handleAddAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAlert.md || !formAlert.observacao.trim()) return;

    setActionLoading(true);
    setMessage(null);
    try {
      await saveAlertaFixo(formAlert.md, formAlert.observacao.trim());
      setMessage({ text: "Alerta permanente fixado com sucesso!", type: "success" });
      setFormAlert({ md: "", observacao: "" });
      await loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ text: err.message || "Erro ao fixar alerta.", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Delete Penalty
  const handleDeletePenalty = async (id: number) => {
    if (!window.confirm("Confirmar exclusão desta penalidade?")) return;
    try {
      await deletePenalidade(id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Delete Alert
  const handleDeleteAlert = async (md: string) => {
    if (!window.confirm(`Remover alerta permanente do MD ${md}?`)) return;
    try {
      await deleteAlertaFixo(md);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  // Get semantic colors
  const getRecBadge = (rec: string) => {
    if (rec.trim() === "Estável") {
      return "text-success bg-success/10 border-success/20";
    }
    if (rec.trim() === "Monitorar") {
      return "text-warning bg-warning/10 border-warning/20";
    }
    return "text-destructive bg-destructive/10 border-destructive/20";
  };

  // List of unique MD names for form dropdown selectors
  const mdListOptions = Array.from(new Set(scores.map(s => s.md))).sort();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center bg-[#0C101B]/40 p-6 rounded-2xl border border-border gap-4">
        <div className="flex items-center gap-3">
          <Activity className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Saúde dos MDs</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Score operacional contínuo baseado em volumetria, penalidades e ocorrências na malha.
            </p>
          </div>
        </div>
        
        {/* Navigation Tabs for Master */}
        {isMaster && (
          <div className="flex bg-[#0C101B] p-1 rounded-xl border border-border">
            <button
              onClick={() => setActiveTab("ranking")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === "ranking"
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-white"
              }`}
            >
              Ranking & Scores
            </button>
            <button
              onClick={() => setActiveTab("admin")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                activeTab === "admin"
                  ? "bg-primary text-white"
                  : "text-muted-foreground hover:text-white"
              }`}
            >
              Painel de Controle
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2.5 py-12 justify-center text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          <span>Carregando dados operacionais...</span>
        </div>
      ) : activeTab === "ranking" ? (
        <div className="space-y-6">
          {/* Main Health Ranking Table */}
          <div className="glass-panel rounded-2xl border border-border overflow-hidden">
            <div className="p-6 border-b border-border bg-[#0C101B]/40">
              <h2 className="text-lg font-semibold text-white">Score de Conformidade dos Micro-Distribuidores</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Pontuação baseada em score inicial de 500 pontos com abatimento por ocorrências.</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-[#0C101B]/20 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <th className="py-4 px-6">MD (Ponto de Bipagem)</th>
                    <th className="py-4 px-6">Regional</th>
                    <th className="py-4 px-6 text-right">Penalidades</th>
                    <th className="py-4 px-6 text-right">Score Final</th>
                    <th className="py-4 px-6 text-center">Status / Recomendação</th>
                    {isMaster && <th className="py-4 px-6">Alertas Permanentes</th>}
                  </tr>
                </thead>

                <tbody className="divide-y divide-border/60 text-xs text-slate-300">
                  {scores.map((row) => {
                    // Find active alert for this MD if any
                    const activeAlert = alerts.find(a => a.md === row.md);
                    return (
                      <tr key={row.md} className="hover:bg-slate-800/30 transition-all">
                        <td className="py-3.5 px-6 font-bold text-white">{row.md}</td>
                        <td className="py-3.5 px-6">{row.regional}</td>
                        <td className="py-3.5 px-6 text-right font-mono text-destructive">
                          {row.pontos_desconto > 0 ? `-${row.pontos_desconto} pts` : "0 pts"}
                        </td>
                        <td className="py-3.5 px-6 text-right font-mono font-bold text-white">{row.score_final} / 500</td>
                        <td className="py-3.5 px-6 text-center">
                          <span className={`px-2.5 py-0.5 font-bold rounded-full border ${getRecBadge(row.recomendacao)}`}>
                            {row.recomendacao}
                          </span>
                        </td>
                        {isMaster && (
                          <td className="py-3.5 px-6 max-w-xs truncate text-muted-foreground">
                            {activeAlert ? (
                              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded font-semibold text-[10px]">
                                {activeAlert.observacao}
                              </span>
                            ) : (
                              "--"
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Admin Panel Tab */
        <div className="space-y-6">
          
          {/* Notification Messages */}
          {message && (
            <div className={`p-4 rounded-xl text-sm font-semibold border ${
              message.type === "success" 
                ? "bg-success/10 text-success border-success/20" 
                : "bg-destructive/10 text-destructive border-destructive/20"
            }`}>
              {message.text}
            </div>
          )}

          {/* Form grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Penalty record form */}
            <div className="glass-panel p-6 rounded-2xl border border-border space-y-4">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <ShieldAlert className="w-5 h-5 text-destructive" />
                <h2 className="text-lg font-semibold text-white">Cadastrar Penalidade Operacional</h2>
              </div>
              
              <form onSubmit={handleAddPenalty} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">MD Infrator:</label>
                  <select
                    value={formPenalty.md}
                    onChange={(e) => setFormPenalty({...formPenalty, md: e.target.value})}
                    className="w-full px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none"
                    required
                  >
                    <option value="">Selecione o MD...</option>
                    {mdListOptions.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">Pontos de Desconto:</label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={formPenalty.pontos}
                      onChange={(e) => setFormPenalty({...formPenalty, pontos: parseInt(e.target.value) || 0})}
                      className="w-full px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">Data Ocorrência:</label>
                    <input
                      type="date"
                      value={formPenalty.date}
                      onChange={(e) => setFormPenalty({...formPenalty, date: e.target.value})}
                      className="w-full px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">Motivo (Curto):</label>
                  <input
                    type="text"
                    maxLength={50}
                    value={formPenalty.motivo}
                    onChange={(e) => setFormPenalty({...formPenalty, motivo: e.target.value})}
                    placeholder="Ex: Atraso bipagem / Lacre rompido"
                    className="w-full px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-destructive hover:bg-destructive-hover rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-50 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Gravar Penalidade</span>
                </button>
              </form>
            </div>

            {/* Permanent Alerts form */}
            <div className="glass-panel p-6 rounded-2xl border border-border space-y-4">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <PlusCircle className="w-5 h-5 text-blue-400" />
                <h2 className="text-lg font-semibold text-white">Fixar Alerta Permanente no Ponto</h2>
              </div>
              
              <form onSubmit={handleAddAlert} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">Selecione o MD:</label>
                  <select
                    value={formAlert.md}
                    onChange={(e) => setFormAlert({...formAlert, md: e.target.value})}
                    className="w-full px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none"
                    required
                  >
                    <option value="">Selecione o MD...</option>
                    {mdListOptions.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase mb-1">Observação Fixa (Curta):</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={formAlert.observacao}
                    onChange={(e) => setFormAlert({...formAlert, observacao: e.target.value})}
                    placeholder="Ex: Coleta D+1 pela distância / Área de risco"
                    className="w-full px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex items-center justify-center gap-1.5 w-full py-2.5 bg-primary hover:bg-blue-600 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-50 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Fixar Alerta Permanente</span>
                </button>
              </form>
            </div>

          </div>

          {/* Lists layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Penalties history */}
            <div className="glass-panel p-6 rounded-2xl border border-border space-y-4">
              <div className="border-b border-border pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Histórico de Penalidades Ativas</h3>
              </div>
              <div className="overflow-y-auto max-h-96 space-y-2 text-xs">
                {penalties.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Nenhuma penalidade operacional gravada no histórico.</p>
                ) : (
                  penalties.map(p => (
                    <div key={p.id} className="flex justify-between items-center p-3 rounded-xl bg-[#0C101B]/60 border border-border">
                      <div className="space-y-1">
                        <p className="font-bold text-white">{p.md} <span className="text-[10px] text-muted-foreground font-normal ml-2">{p.data_penalidade}</span></p>
                        <p className="text-muted-foreground text-[11px]">{p.motivo}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-destructive">-{p.pontos} pts</span>
                        <button
                          onClick={() => handleDeletePenalty(p.id)}
                          className="p-1 hover:bg-slate-800 rounded-lg text-muted-foreground hover:text-white transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive/80" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Permanent Alerts Active */}
            <div className="glass-panel p-6 rounded-2xl border border-border space-y-4">
              <div className="border-b border-border pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Alertas Ativos na Malha</h3>
              </div>
              <div className="overflow-y-auto max-h-96 space-y-2 text-xs">
                {alerts.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">Nenhum alerta permanente ativo.</p>
                ) : (
                  alerts.map(a => (
                    <div key={a.md} className="flex justify-between items-center p-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                      <div>
                        <p className="font-bold text-white">{a.md}</p>
                        <p className="text-blue-400 text-[11px] font-semibold mt-1">{a.observacao}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteAlert(a.md)}
                        className="p-1 hover:bg-slate-800 rounded-lg text-muted-foreground hover:text-white transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive/80" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
}
