"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles, Trash2, Download, FileWarning } from "lucide-react";
import { generateIAReport } from "../lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatIAProps {
  filial: string;
  contextoData: any; // Can be total/backlog metrics or string context for weekly
  isWeeklyMode?: boolean;
}

export default function ChatIA({ filial, contextoData, isWeeklyMode = false }: ChatIAProps) {
  const initialMessage = isWeeklyMode
    ? `Olá! Sou o Assistente IA da **Torre de Controle ANJUN**. Posso gerar a **Tabela Executiva de Desvios Semanais (WBR)** para a **${filial}** cruzando dados operacionais com justificativas de todas as regionais. Como posso te ajudar?`
    : `Olá! Sou o Assistente IA da **Torre de Controle ANJUN**. Escolha um relatório de atalho ou envie sua pergunta sobre a filial **${filial}** abaixo.`;

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: initialMessage,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Clean chat
  const handleClear = () => {
    setMessages([
      {
        role: "assistant",
        content: initialMessage,
      },
    ]);
  };

  const handleAction = async (type: "wbr" | "qualidade" | "cobranca" | "free", customInput?: string) => {
    let userMsg = "";
    
    if (isWeeklyMode) {
      if (type === "wbr") {
        userMsg = "Compilar Tabela Executiva de Desvios (WBR) da semana.";
      } else {
        userMsg = customInput || "";
      }
    } else {
      if (type === "wbr") {
        userMsg = "Gerar relatório executivo para apresentação de WBR (Weekly Business Review) para esta filial.";
      } else if (type === "qualidade") {
        userMsg = "Gerar varredura de dados com foco em qualidade (Analista Jr) para esta filial.";
      } else if (type === "cobranca") {
        userMsg = "Escrever uma mensagem corporativa e profissional de cobrança de SLA para esta filial.";
      } else {
        userMsg = customInput || "";
      }
    }

    if (!userMsg.trim()) return;

    // Add user message
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      let apiType = type;
      let contextString = "";

      if (isWeeklyMode) {
        apiType = type === "wbr" ? ("wbr_semanal" as any) : "free";
        contextString = contextoData?.contexto || "";
      } else {
        const vol = contextoData?.total || 0;
        const bk = contextoData?.backlog || 0;
        const eff = vol > 0 ? ((vol - bk) / vol * 100).toFixed(2) : "100.0";
        
        let mdsBreakdown = "";
        if (contextoData?.mds && Array.isArray(contextoData.mds)) {
          mdsBreakdown = "\nDETALHAMENTO DE PERFORMANCE DOS MDS VINCULADOS A ESTA FILIAL:\n";
          contextoData.mds.forEach((m: any) => {
            mdsBreakdown += `- MD: ${m.md} / Cidade: ${m.cidade || "N/A"} | Volume Bipado: ${m.total} | Volume Retido (Backlog): ${m.backlog} | Eficiência: ${m.taxa_coleta?.toFixed(2) || "100"}%`;
            if (m.observacao_fixa) {
              mdsBreakdown += ` | Alerta Permanente: ${m.observacao_fixa}`;
            }
            mdsBreakdown += "\n";
          });
        }
        
        contextString = `Volume Total Bipado: ${vol.toLocaleString()}\nVolume Retido (Backlog): ${bk.toLocaleString()}\nEficiência de Carregamento (SLA OTR): ${eff}%\n${mdsBreakdown}\n${
          type === "free" ? `Pergunta livre do usuário: ${userMsg}` : ""
        }`;
      }
      
      const res = await generateIAReport(apiType, filial, contextString);
      setMessages((prev) => [...prev, { role: "assistant", content: res.resultado }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev, 
        { 
          role: "assistant", 
          content: `⚠️ **Erro ao consultar o serviço de IA:** ${err.message || err}. Por favor, verifique se a API do backend está ativa.` 
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const exportToPDF = async (messageIndex: number) => {
    try {
      const element = document.getElementById(`msg-content-${messageIndex}`);
      if (!element) return;
      
      setPdfLoadingId(messageIndex);
      
      // Dynamic import to avoid SSR window errors
      const html2pdf = (await import("html2pdf.js")).default;
      
      const opt = {
        margin:       10,
        filename:     `Relatorio_WBR_${filial.replace(/[^a-z0-9]/gi, '_')}.pdf`,
        image:        { type: 'jpeg' as const, quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#0F172A' },
        jsPDF:        { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const }
      };
      
      const pdfBlob = await (html2pdf() as any).set(opt).from(element).output('blob');
      
      try {
        if ('showSaveFilePicker' in window) {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: opt.filename,
            types: [{ description: 'PDF Document', accept: {'application/pdf': ['.pdf']} }],
          });
          const writable = await handle.createWritable();
          await writable.write(pdfBlob);
          await writable.close();
        } else {
          // Fallback if browser doesn't support File System Access API
          const blobUrl = URL.createObjectURL(pdfBlob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = opt.filename;
          a.click();
          URL.revokeObjectURL(blobUrl);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error("Erro ao salvar:", err);
        }
      }
    } catch (e) {
      console.error("Erro ao gerar PDF:", e);
    } finally {
      setPdfLoadingId(null);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    handleAction("free", input);
    setInput("");
  };

  // Simple Markdown and Table Parser
  const parseInlineStyles = (text: string) => {
    if (!text) return "";
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={idx} className="text-white font-bold">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  const parseMarkdown = (content: string) => {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      
      // Check if it's a table block
      if (line.trim().startsWith("|")) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          const currentLine = lines[i].trim();
          // Skip separator lines like | :--- | :--- | or |---|
          if (!/^[|:\-\s]+$/.test(currentLine)) {
            tableLines.push(currentLine);
          }
          i++;
        }
        
        // Parse table rows
        const rows = tableLines.map(l => {
          const parts = l.split("|").map(p => p.trim());
          if (parts[0] === "") parts.shift();
          if (parts[parts.length - 1] === "") parts.pop();
          return parts;
        }).filter(r => r.length > 0);
        
        if (rows.length > 0) {
          const headers = rows[0];
          const bodyRows = rows.slice(1);
          
          elements.push(
            <div key={`table-${i}`} className="overflow-x-auto my-3 border border-slate-700/60 rounded-xl bg-slate-950/60 shadow-inner">
              <table className="w-full text-left text-[11px] md:text-xs border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-slate-800/80 text-slate-100 border-b border-slate-700">
                    {headers.map((h, idx) => (
                      <th key={idx} className="p-2 md:p-3 font-semibold uppercase tracking-wider text-[10px] text-slate-200">
                        {parseInlineStyles(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-slate-300">
                  {bodyRows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-slate-800/20 transition-colors">
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className="p-2 md:p-3 leading-relaxed">
                          {parseInlineStyles(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        continue;
      }
      
      // Headers and lists
      if (line.startsWith("### ")) {
        elements.push(<h3 key={i} className="font-bold text-white text-sm mt-3 mb-1.5 border-b border-border pb-1">{parseInlineStyles(line.replace("### ", ""))}</h3>);
      } else if (line.startsWith("#### ")) {
        elements.push(<h4 key={i} className="font-bold text-white text-xs mt-2.5 mb-1">{parseInlineStyles(line.replace("#### ", ""))}</h4>);
      } else if (line.startsWith("*   **") || line.startsWith("* ") || line.startsWith("- ")) {
        const cleanLine = line.replace(/^[\*\-]\s+/, "");
        elements.push(
          <div key={i} className="pl-3 py-0.5 flex items-start gap-2 text-slate-300">
            <span className="text-primary mt-1 shrink-0 text-xs">•</span>
            <span>{parseInlineStyles(cleanLine)}</span>
          </div>
        );
      } else if (line.trim() !== "") {
        elements.push(<p key={i} className="mb-1.5 leading-relaxed text-slate-300">{parseInlineStyles(line)}</p>);
      }
      
      i++;
    }
    
    return elements;
  };

  return (
    <div className="glass-panel rounded-2xl border border-border flex flex-col h-[500px]">
      {/* Header */}
      <div className="p-4 border-b border-border flex justify-between items-center bg-[#0C101B]/40 rounded-t-2xl">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-400" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">
            {isWeeklyMode ? `IA WBR: ${filial}` : `Assistente IA: Filial ${filial}`}
          </h2>
        </div>
        <button
          onClick={handleClear}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-muted-foreground hover:text-white transition-all cursor-pointer"
          title="Limpar Conversa"
        >
          <Trash2 className="w-4 h-4 text-destructive/80" />
        </button>
      </div>

      {/* Shortcuts buttons */}
      <div className="p-3 border-b border-border bg-[#0C101B]/20 flex flex-wrap gap-2">
        {isWeeklyMode ? (
          <>
            <button
              onClick={() => handleAction("wbr")}
              disabled={loading}
              className="px-3 py-1.5 text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Gerar Resumo Executivo da Semana</span>
            </button>
            <button
              onClick={() => handleAction("qualidade")}
              disabled={loading}
              className="px-3 py-1.5 text-[10px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-lg hover:bg-purple-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1"
            >
              <FileWarning className="w-3.5 h-3.5" />
              <span>Analista de Qualidade Jr.</span>
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => handleAction("wbr")}
              disabled={loading}
              className="px-2.5 py-1 text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              Relatório WBR
            </button>
            <button
              onClick={() => handleAction("qualidade")}
              disabled={loading}
              className="px-2.5 py-1 text-[10px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-lg hover:bg-purple-500/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              Qualidade Jr.
            </button>
            <button
              onClick={() => handleAction("cobranca")}
              disabled={loading}
              className="px-2.5 py-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-all disabled:opacity-50 cursor-pointer"
            >
              Cobrança SLA
            </button>
          </>
        )}
      </div>

      {/* Chat Messages Log */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm text-slate-200">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex items-start gap-2.5 ${
              msg.role === "user" ? "ml-auto flex-row-reverse max-w-[85%]" : "max-w-[100%]"
            }`}
          >
            <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border ${
              msg.role === "user" 
                ? "bg-blue-500/15 border-blue-500/30 text-blue-400" 
                : "bg-amber-500/15 border-amber-500/30 text-amber-400"
            }`}>
              {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            
            <div className={`px-4 py-3 rounded-xl border leading-relaxed overflow-x-auto w-full ${
              msg.role === "user"
                ? "bg-[#1E293B] border-border text-slate-200 rounded-tr-none max-w-fit ml-auto"
                : "bg-[#131926] border-border text-slate-300 rounded-tl-none text-xs"
            }`}>
              <div id={`msg-content-${index}`}>
                {parseMarkdown(msg.content)}
              </div>
              
              {msg.role === "assistant" && msg.content.includes("|") && !loading && (
                <div className="mt-4 flex justify-end">
                  <button 
                    onClick={() => exportToPDF(index)}
                    disabled={pdfLoadingId === index}
                    className="text-[10px] flex items-center gap-1.5 text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 px-3 py-1.5 rounded-md transition-all cursor-pointer border border-slate-600 disabled:opacity-50"
                  >
                    {pdfLoadingId === index ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Gerando Arquivo...
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        Salvar como PDF
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
            </div>
            <span>{isWeeklyMode ? "Analisando justificativas semanais e calculando volumes..." : "Analisando dados da filial e justificativas históricas..."}</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-3 border-t border-border bg-[#0C101B]/40 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder={isWeeklyMode ? "Pergunte sobre os desvios da semana..." : "Tire dúvidas sobre a filial..."}
          className="flex-1 px-4 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500/50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-3 py-2 bg-primary hover:bg-blue-600 rounded-xl text-white disabled:opacity-50 transition-all cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
