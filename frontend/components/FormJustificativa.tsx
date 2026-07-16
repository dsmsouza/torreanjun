"use client";

import React, { useEffect, useState } from "react";
import { fetchJustificativas, saveJustificativa, deleteJustification } from "../lib/api";
import { FileText, Save, Loader2, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "../hooks/use-auth";

interface FormJustificativaProps {
  diaBase: string;
  regionalsList?: string[];
}

export default function FormJustificativa({
  diaBase,
  regionalsList = []
}: FormJustificativaProps) {
  const { isMaster, activeRegional } = useAuth();
  
  // States
  const [selectedRefRegional, setSelectedRefRegional] = useState("GERAL");
  const [justText, setJustText] = useState("");
  const [justList, setJustList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Compile regionals select list
  // If Master: can select GERAL or any regional
  // If Regional: locked to their own activeRegional
  const selectOptions = isMaster 
    ? ["GERAL", ...Array.from(new Set(regionalsList.filter(Boolean)))]
    : [activeRegional || "GERAL"];

  // Determine target regional for saving
  const targetRegional = isMaster ? selectedRefRegional : (activeRegional || "GERAL");

  // Determine if user can write/save
  const isEditable = isMaster || (activeRegional && targetRegional === activeRegional);

  // Set default selected regional based on role
  useEffect(() => {
    if (!isMaster && activeRegional) {
      setSelectedRefRegional(activeRegional);
    } else {
      setSelectedRefRegional("GERAL");
    }
  }, [isMaster, activeRegional]);

  // Load justifications history
  const loadHistory = async () => {
    if (!diaBase || diaBase === "Vários Dias" || diaBase === "Carregando...") {
      setJustList([]);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchJustificativas(diaBase, targetRegional);
      setJustList(list || []);
    } catch (err) {
      console.error("Error loading justifications history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
    setJustText("");
    setMessage(null);
  }, [diaBase, targetRegional]);

  // Handle Save Justification
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEditable || !diaBase || diaBase === "Vários Dias" || !justText.trim()) return;

    setSaving(true);
    setMessage(null);
    try {
      await saveJustificativa(diaBase, targetRegional, justText);
      setJustText("");
      setMessage({ text: "Justificativa gravada com sucesso!", type: "success" });
      setTimeout(() => setMessage(null), 3000);
      await loadHistory();
    } catch (err: any) {
      setMessage({ text: err.message || "Erro ao salvar a justificativa.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  // Handle Delete Justification
  const handleDelete = async (id: number) => {
    if (!isEditable) return;
    if (!window.confirm("Deseja realmente excluir esta justificativa do histórico?")) return;

    try {
      await deleteJustification(id);
      await loadHistory();
    } catch (err: any) {
      alert(err.message || "Erro ao deletar justificativa.");
    }
  };

  const isFormDisabled = diaBase === "Vários Dias" || diaBase === "Carregando..." || !isEditable;

  return (
    <div className="glass-panel p-6 rounded-2xl border border-border space-y-4">
      {/* Title Header */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <FileText className="w-5 h-5 text-blue-400" />
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Causa Raiz & Justificativas</h2>
      </div>

      {/* Form Fields */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Data da Coleta */}
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Data da Coleta:
            </label>
            <input
              type="text"
              value={diaBase}
              className="w-full px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-400 font-mono focus:outline-none"
              readOnly
            />
          </div>

          {/* Regional Referencia Dropdown */}
          <div>
            <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Regional Referência:
            </label>
            {isMaster ? (
              <select
                value={selectedRefRegional}
                onChange={(e) => setSelectedRefRegional(e.target.value)}
                className="w-full px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none"
              >
                {selectOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={targetRegional}
                className="w-full px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-400 focus:outline-none"
                readOnly
              />
            )}
          </div>
        </div>

        {/* Text Area */}
        <div>
          <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
            Justificativa (Causa raiz reportada):
          </label>
          <textarea
            value={justText}
            onChange={(e) => setJustText(e.target.value)}
            disabled={isFormDisabled || saving}
            placeholder={
              diaBase === "Vários Dias"
                ? "Selecione uma visão 'Diário' para poder adicionar novas justificativas."
                : isEditable
                ? "Ex: A regional SP informou que o caminhão quebrou na rota e atrasou o carregamento..."
                : `Apenas leitura. Você só pode cadastrar justificativas da sua própria regional (${activeRegional}).`
            }
            className="w-full h-24 px-4 py-3 bg-[#0C101B] border border-border rounded-xl text-slate-200 text-xs focus:outline-none focus:border-blue-500/50 transition-all resize-none disabled:opacity-60"
            required
          />
        </div>

        {message && (
          <div className={`p-3 rounded-lg text-xs font-semibold ${
            message.type === "success" 
              ? "bg-success/10 text-success border border-success/20" 
              : "bg-destructive/10 text-destructive border border-destructive/20"
          }`}>
            {message.text}
          </div>
        )}

        {isEditable && diaBase !== "Vários Dias" && (
          <button
            type="submit"
            disabled={saving || loading || !justText.trim()}
            className="flex items-center justify-center gap-2 w-full py-2 bg-[#1E293B] border border-border rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-xs font-semibold text-slate-200"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>💾 Salvar Justificativa</span>}
          </button>
        )}
      </form>

      {/* History Collapsible Panel */}
      {diaBase !== "Vários Dias" && (
        <div className="border-t border-border pt-4 space-y-3">
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className="w-full flex justify-between items-center text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <div className="flex items-center gap-1.5">
              <span>📋 Histórico de Retornos ({targetRegional})</span>
            </div>
            {historyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {historyOpen && (
            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
              {loading ? (
                <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground text-[10px]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                  <span>Carregando histórico...</span>
                </div>
              ) : justList.length === 0 ? (
                <p className="text-[10px] text-muted-foreground italic text-center py-2">
                  Nenhuma justificativa salva para este dia.
                </p>
              ) : (
                justList.map((item) => (
                  <div 
                    key={item.id} 
                    className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-3 flex justify-between items-start gap-2 shadow-inner"
                  >
                    <p className="text-[11px] text-blue-400 leading-relaxed whitespace-pre-wrap font-sans">
                      <strong className="text-blue-300">{item.dia_base}: </strong>
                      {item.justificativa}
                    </p>
                    {isEditable && (
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-destructive/80 hover:text-destructive cursor-pointer shrink-0 transition-all"
                        title="Deletar Justificativa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
