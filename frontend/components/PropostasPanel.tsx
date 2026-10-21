"use client";

import React, { useState, useEffect } from "react";
import {
  getPropostas, criarProposta, atualizarProposta, deletarProposta,
  PropostaExpansao, perguntarCopilotoGeral
} from "../lib/api";
import {
  Plus, Trash2, CheckCircle, XCircle, Clock, Wrench,
  Bot, ChevronDown, ChevronUp, MapPin, Package, Users, Sparkles, Loader2
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any; bg: string }> = {
  "Em Análise":      { label: "Em Análise",      color: "text-yellow-400",  icon: Clock,        bg: "bg-yellow-500/10 border-yellow-500/30" },
  "Aprovada":        { label: "Aprovada",         color: "text-emerald-400", icon: CheckCircle,  bg: "bg-emerald-500/10 border-emerald-500/30" },
  "Recusada":        { label: "Recusada",         color: "text-red-400",     icon: XCircle,      bg: "bg-red-500/10 border-red-500/30" },
  "Em Implantação":  { label: "Em Implantação",   color: "text-blue-400",    icon: Wrench,       bg: "bg-blue-500/10 border-blue-500/30" },
};

const PRIORIDADE_COLORS: Record<string, string> = {
  ALTA: "text-red-400 bg-red-500/10",
  MEDIA: "text-yellow-400 bg-yellow-500/10",
  BAIXA: "text-slate-400 bg-slate-500/10",
};

interface NovaPropostaForm {
  cidade: string; estado: string; bairro: string; cep_alvo: string;
  volume_estimado: number; qtd_sellers_estimada: number;
  justificativa: string; prioridade: "ALTA" | "MEDIA" | "BAIXA";
  observacoes: string;
}

const FORM_VAZIO: NovaPropostaForm = {
  cidade: "", estado: "", bairro: "", cep_alvo: "",
  volume_estimado: 0, qtd_sellers_estimada: 0,
  justificativa: "", prioridade: "MEDIA", observacoes: "",
};

interface PropostasPanelProps {
  prefillData?: Partial<NovaPropostaForm> | null;
  onPrefillConsumed?: () => void;
}

export default function PropostasPanel({ prefillData, onPrefillConsumed }: PropostasPanelProps) {
  const [propostas, setPropostas] = useState<PropostaExpansao[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NovaPropostaForm>(FORM_VAZIO);
  const [saving, setSaving] = useState(false);
  const [iaLoading, setIaLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("TODAS");

  const loadPropostas = async () => {
    try {
      const data = await getPropostas(statusFilter !== "TODAS" ? statusFilter : undefined);
      setPropostas(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPropostas(); }, [statusFilter]);

  // Handle prefill from ViabilidadeModal
  useEffect(() => {
    if (prefillData) {
      setForm((prev) => ({ ...prev, ...prefillData }));
      setShowForm(true);
      onPrefillConsumed?.();
    }
  }, [prefillData]);

  const handleSave = async () => {
    if (!form.cidade || !form.estado) return;
    setSaving(true);
    try {
      await criarProposta({ ...form });
      setForm(FORM_VAZIO);
      setShowForm(false);
      await loadPropostas();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: number, status: PropostaExpansao["status"]) => {
    try {
      await atualizarProposta(id, { status });
      setPropostas((prev) => prev.map((p) => p.id === id ? { ...p, status } : p));
    } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir esta proposta?")) return;
    try {
      await deletarProposta(id);
      setPropostas((prev) => prev.filter((p) => p.id !== id));
    } catch (e: any) { alert(e.message); }
  };

  const handleGerarJustificativaIA = async () => {
    if (!form.cidade || !form.estado) { alert("Preencha a cidade e estado antes de gerar com IA."); return; }
    setIaLoading(true);
    try {
      const prompt = `Você é um analista especialista em expansão logística. Gere uma justificativa técnica e profissional, com no máximo 3 parágrafos, para a abertura de um novo ponto de coleta (MD) com os seguintes dados:

- Cidade/Estado: ${form.cidade}/${form.estado}${form.bairro ? ` - Bairro: ${form.bairro}` : ""}
- Volume estimado de pedidos por dia: ${form.volume_estimado}
- Quantidade estimada de sellers: ${form.qtd_sellers_estimada}
- Prioridade: ${form.prioridade}

Inclua: impacto operacional esperado, potencial de volume capturável, e recomendação final objetiva.`;
      const res = await perguntarCopilotoGeral(prompt);
      setForm((prev) => ({ ...prev, justificativa: res.resposta || "" }));
    } catch (e: any) {
      alert("Erro ao gerar justificativa com IA: " + e.message);
    } finally {
      setIaLoading(false);
    }
  };

  const filtered = propostas;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          {["TODAS", ...Object.keys(STATUS_CONFIG)].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer border ${
                statusFilter === s
                  ? "bg-purple-600 border-purple-500 text-white"
                  : "border-border text-muted-foreground hover:text-white"
              }`}>
              {s}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer">
          <Plus className="w-3.5 h-3.5" />
          Nova Proposta
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="glass-panel rounded-2xl border border-purple-500/20 p-6 space-y-4">
          <h3 className="text-sm font-bold text-white">Nova Proposta de Expansão</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: "cidade", label: "Cidade *", type: "text", placeholder: "São Paulo" },
              { key: "estado", label: "Estado *", type: "text", placeholder: "SP" },
              { key: "bairro", label: "Bairro", type: "text", placeholder: "Mooca" },
              { key: "cep_alvo", label: "CEP Alvo", type: "text", placeholder: "01234-567" },
              { key: "volume_estimado", label: "Volume Estimado (pedidos/dia)", type: "number", placeholder: "0" },
              { key: "qtd_sellers_estimada", label: "Sellers Estimados", type: "number", placeholder: "0" },
            ].map(({ key, label, type, placeholder }) => (
              <div key={key}>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">{label}</label>
                <input
                  type={type}
                  value={(form as any)[key]}
                  placeholder={placeholder}
                  onChange={(e) => setForm((prev) => ({ ...prev, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
                  className="w-full bg-slate-900/60 border border-border text-white text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-purple-500"
                />
              </div>
            ))}
          </div>

          {/* Prioridade */}
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-2">Prioridade</label>
            <div className="flex gap-2">
              {(["ALTA", "MEDIA", "BAIXA"] as const).map((p) => (
                <button key={p} onClick={() => setForm((prev) => ({ ...prev, prioridade: p }))}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                    form.prioridade === p ? PRIORIDADE_COLORS[p] + " border-current" : "border-border text-muted-foreground"
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Justificativa */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-semibold text-muted-foreground uppercase">Justificativa</label>
              <button onClick={handleGerarJustificativaIA} disabled={iaLoading}
                className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-lg hover:bg-purple-500/20 transition-all cursor-pointer disabled:opacity-50">
                {iaLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Gerar com IA
              </button>
            </div>
            <textarea
              rows={5}
              value={form.justificativa}
              onChange={(e) => setForm((prev) => ({ ...prev, justificativa: e.target.value }))}
              placeholder="Descreva o motivo da expansão, potencial de volume, sellers ativos, etc..."
              className="w-full bg-slate-900/60 border border-border text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          {/* Observações */}
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase mb-1">Observações Internas</label>
            <textarea
              rows={2}
              value={form.observacoes}
              onChange={(e) => setForm((prev) => ({ ...prev, observacoes: e.target.value }))}
              placeholder="Notas internas, pendências, contatos..."
              className="w-full bg-slate-900/60 border border-border text-white text-xs rounded-xl px-3 py-2.5 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => { setShowForm(false); setForm(FORM_VAZIO); }}
              className="px-4 py-2 text-xs text-muted-foreground border border-border rounded-xl hover:text-white transition-all cursor-pointer">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || !form.cidade || !form.estado}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer disabled:opacity-50">
              {saving ? "Salvando..." : "Salvar Proposta"}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-7 h-7 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <MapPin className="w-10 h-10 text-muted-foreground mx-auto opacity-40" />
          <p className="text-sm text-muted-foreground">Nenhuma proposta encontrada.</p>
          <p className="text-xs text-slate-600">Clique em "Nova Proposta" ou em um CEP no mapa para criar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => {
            const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG["Em Análise"];
            const StatusIcon = sc.icon;
            const isExpanded = expandedId === p.id;
            return (
              <div key={p.id} className={`rounded-2xl border overflow-hidden transition-all ${sc.bg}`}>
                <div className="p-4 flex items-start gap-3">
                  <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center ${sc.bg}`}>
                    <StatusIcon className={`w-4 h-4 ${sc.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{p.cidade}{p.bairro ? ` • ${p.bairro}` : ""} — {p.estado}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${PRIORIDADE_COLORS[p.prioridade]}`}>{p.prioridade}</span>
                      <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold ${sc.bg} ${sc.color}`}>{p.status}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Package className="w-3 h-3" />{p.volume_estimado} ped/dia</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{p.qtd_sellers_estimada} sellers</span>
                      <span>{p.criado_em}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Status change */}
                    <select value={p.status}
                      onChange={(e) => handleStatusChange(p.id, e.target.value as any)}
                      className="bg-slate-900 border border-border text-white text-[10px] rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none">
                      {Object.keys(STATUS_CONFIG).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      className="text-muted-foreground hover:text-white transition-colors cursor-pointer">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button onClick={() => handleDelete(p.id)}
                      className="text-red-400/50 hover:text-red-400 transition-colors cursor-pointer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expandido */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 border-t border-white/5 space-y-3">
                    {p.cep_alvo && <p className="text-xs text-slate-400">CEP: {p.cep_alvo}</p>}
                    {p.justificativa && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Justificativa</p>
                        <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{p.justificativa}</p>
                      </div>
                    )}
                    {p.clientes_principais && p.clientes_principais.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Clientes</p>
                        <div className="flex flex-wrap gap-2">
                          {p.clientes_principais.map((c: any) => (
                            <span key={c.cliente} className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] rounded-lg">
                              {c.cliente}: {c.volume?.toLocaleString()} ({c.percentual}%)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {p.observacoes && (
                      <div>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Observações</p>
                        <p className="text-xs text-slate-400 italic">{p.observacoes}</p>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-600">Atualizado em: {p.atualizado_em}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
