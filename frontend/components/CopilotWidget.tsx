"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, 
  X, 
  Send, 
  ChevronDown, 
  ChevronUp, 
  Database, 
  Clock, 
  Copy, 
  Check, 
  Terminal, 
  RotateCcw,
  Zap,
  ShieldCheck,
  AlertCircle
} from "lucide-react";
import { 
  fetchStatusIA, 
  fetchPerguntasSugeridasIA, 
  consultarCopilotIA, 
  PerguntaSugeridaIA, 
  RespostaCopilotIA 
} from "../lib/api";

interface ChatMessage {
  id: string;
  sender: "user" | "copilot";
  timestamp: string;
  texto: string;
  sql?: string | null;
  totalRegistros?: number;
  tempoMs?: number;
  erro?: string | null;
}

export default function CopilotWidget() {
  const [aberto, setAberto] = useState(false);
  const [minimizado, setMinimizado] = useState(false);
  const [statusIA, setStatusIA] = useState<{ status: string; provider: string; modelo: string }>({
    status: "online",
    provider: "gemini",
    modelo: "gemini-2.5-flash",
  });
  const [perguntasSugeridas, setPerguntasSugeridas] = useState<PerguntaSugeridaIA[]>([]);
  const [mensagens, setMensagens] = useState<ChatMessage[]>([]);
  const [inputPergunta, setInputPergunta] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [etapaCarregamento, setEtapaCarregamento] = useState("Formulando consulta SQL...");
  const [sqlVisivelMap, setSqlVisivelMap] = useState<Record<string, boolean>>({});
  const [copiadoId, setCopiadoId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Carregar status e sugestões
    fetchStatusIA().then(setStatusIA).catch(() => {});
    fetchPerguntasSugeridasIA().then(setPerguntasSugeridas).catch(() => {});
  }, []);

  useEffect(() => {
    if (aberto && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [mensagens, carregando, aberto]);

  const handleEnviar = async (perguntaTexto?: string) => {
    const q = (perguntaTexto || inputPergunta).trim();
    if (!q || carregando) return;

    setInputPergunta("");
    const userMsgId = `user_${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      sender: "user",
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      texto: q,
    };

    setMensagens((prev) => [...prev, userMsg]);
    setCarregando(true);
    setEtapaCarregamento("Formulando query SQL analítica...");

    const t1 = setTimeout(() => {
      setEtapaCarregamento("Consultando banco SQLite (torre_anjun.db)...");
    }, 1200);

    const t2 = setTimeout(() => {
      setEtapaCarregamento("Consolidando métricas e insights executivos...");
    }, 2800);

    try {
      const res: RespostaCopilotIA = await consultarCopilotIA(q);
      clearTimeout(t1);
      clearTimeout(t2);

      const copilotMsg: ChatMessage = {
        id: `copilot_${Date.now()}`,
        sender: "copilot",
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        texto: res.resposta || "Nenhuma informação retornada para esta consulta.",
        sql: res.sql_executada,
        totalRegistros: res.total_registros,
        tempoMs: res.tempo_ms,
        erro: res.erro,
      };

      setMensagens((prev) => [...prev, copilotMsg]);
    } catch (err: any) {
      clearTimeout(t1);
      clearTimeout(t2);
      const erroMsg: ChatMessage = {
        id: `copilot_err_${Date.now()}`,
        sender: "copilot",
        timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        texto: `**Não foi possível concluir a consulta.**\n\n> *Detalhe:* ${err?.message || "Erro desconhecido ao conectar com a API."}`,
        erro: err?.message,
      };
      setMensagens((prev) => [...prev, erroMsg]);
    } finally {
      setCarregando(false);
    }
  };

  const handleCopiar = (id: string, texto: string) => {
    navigator.clipboard.writeText(texto);
    setCopiadoId(id);
    setTimeout(() => setCopiadoId(null), 2000);
  };

  const toggleSql = (id: string) => {
    setSqlVisivelMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const limparHistorico = () => {
    setMensagens([]);
  };

  // Renderizador simples de Markdown nativo (evita dependências externas pesadas)
  const renderMarkdown = (content: string) => {
    const lines = content.split("\n");
    let inTable = false;
    let tableRows: string[][] = [];

    const elements: React.ReactNode[] = [];

    const flushTable = (key: string) => {
      if (tableRows.length > 0) {
        const headers = tableRows[0];
        const bodyRows = tableRows.slice(2); // pula header e separador ---

        elements.push(
          <div key={key} className="my-3 overflow-x-auto rounded-lg border border-slate-700/80 bg-[#070A11] shadow-inner">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-800/80 text-slate-200 border-b border-slate-700 font-semibold">
                  {headers.map((h, i) => (
                    <th key={i} className="py-2 px-3 whitespace-nowrap">
                      {h.trim()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {bodyRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-800/40 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="py-2 px-3 whitespace-nowrap font-mono text-[11px]">
                        {cell.trim()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
      }
      inTable = false;
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      // Detecção de Tabela Markdown (| col1 | col2 |)
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        inTable = true;
        const cols = trimmed.slice(1, -1).split("|");
        tableRows.push(cols);
        return;
      } else if (inTable) {
        flushTable(`table_${idx}`);
      }

      // Headers (### Título)
      if (trimmed.startsWith("### ")) {
        elements.push(
          <h4 key={idx} className="text-sm font-bold text-emerald-400 mt-3 mb-1 flex items-center gap-1.5">
            {trimmed.replace("### ", "")}
          </h4>
        );
        return;
      }
      if (trimmed.startsWith("## ")) {
        elements.push(
          <h3 key={idx} className="text-base font-bold text-white mt-3 mb-1">
            {trimmed.replace("## ", "")}
          </h3>
        );
        return;
      }

      // Blockquotes (> Texto)
      if (trimmed.startsWith("> ")) {
        elements.push(
          <div key={idx} className="my-2 p-2 rounded-r border-l-2 border-emerald-500 bg-emerald-950/20 text-xs text-emerald-300/90 italic">
            {trimmed.replace("> ", "")}
          </div>
        );
        return;
      }

      // Listas (- Item ou * Item)
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        const itemText = trimmed.slice(2);
        elements.push(
          <li key={idx} className="ml-4 list-disc text-xs text-slate-300 leading-relaxed my-0.5">
            {formatBold(itemText)}
          </li>
        );
        return;
      }

      // Parágrafos normais
      if (trimmed.length > 0) {
        elements.push(
          <p key={idx} className="text-xs text-slate-200 leading-relaxed my-1.5">
            {formatBold(trimmed)}
          </p>
        );
      }
    });

    if (inTable) {
      flushTable("table_end");
    }

    return elements;
  };

  const formatBold = (text: string) => {
    // Substitui **texto** por <strong>
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  return (
    <>
      {/* ── BOTÃO FLUTUANTE (CANTO INFERIOR DIREITO) ── */}
      {!aberto && (
        <button
          onClick={() => {
            setAberto(true);
            setMinimizado(false);
          }}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-full bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 text-white font-semibold shadow-xl shadow-emerald-950/40 hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-200 border border-emerald-400/30 group"
          title="Abrir Copilot Inteligente ANJUN (Baseado no SQLite)"
        >
          <div className="relative">
            <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#090D16] animate-ping" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-xs font-bold tracking-wide">Copilot IA</span>
            <span className="text-[10px] text-emerald-100/90 font-medium -mt-0.5">SQLite Grounded</span>
          </div>
        </button>
      )}

      {/* ── JANELA DO COPILOT (WIDGET FLUTUANTE) ── */}
      {aberto && (
        <div 
          className={`fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl border border-slate-700/80 bg-[#0C101B]/95 backdrop-blur-xl shadow-2xl transition-all duration-300 overflow-hidden ${
            minimizado ? "w-80 h-14" : "w-[560px] max-w-[95vw] h-[690px] max-h-[88vh]"
          }`}
        >
          {/* CABEÇALHO */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <Sparkles className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white tracking-wide">Copilot Inteligente ANJUN</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <Database className="w-2.5 h-2.5" /> SQLite 100%
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">Zero alucinação • Respostas baseadas em dados reais</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {mensagens.length > 0 && !minimizado && (
                <button
                  onClick={limparHistorico}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  title="Limpar histórico da conversa"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setMinimizado(!minimizado)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title={minimizado ? "Expandir" : "Minimizar"}
              >
                {minimizado ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setAberto(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                title="Fechar Copilot"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {!minimizado && (
            <>
              {/* CHIPS DE PERGUNTAS SUGERIDAS (SE O CHAT ESTIVER LIMPO OU TOPO) */}
              {mensagens.length === 0 && (
                <div className="p-4 border-b border-slate-800/80 bg-[#090D16]/50">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 mb-2.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" /> Consultas Rápidas da Operação:
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {perguntasSugeridas.map((sug) => (
                      <button
                        key={sug.id}
                        onClick={() => handleEnviar(sug.pergunta)}
                        className="flex flex-col text-left p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800/80 hover:border-emerald-500/30 transition-all group"
                      >
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200 group-hover:text-emerald-300">
                          <span>{sug.icone}</span>
                          <span className="truncate">{sug.titulo}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 truncate mt-0.5">{sug.categoria}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* CORPO DE MENSAGENS */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {mensagens.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <Database className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-300">Pergunte qualquer coisa sobre a operação</p>
                      <p className="text-xs text-slate-500 max-w-sm mt-1">
                        O Copilot consulta diretamente o banco SQLite (`torre_anjun.db`) e retorna apenas dados reais com validação de segurança.
                      </p>
                    </div>
                  </div>
                )}

                {mensagens.map((msg) => (
                  <div key={msg.id} className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                    {/* BUBBLE */}
                    <div
                      className={`max-w-[90%] rounded-2xl p-3.5 shadow-md ${
                        msg.sender === "user"
                          ? "bg-emerald-600 text-white rounded-br-none"
                          : "bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none"
                      }`}
                    >
                      {/* HEADER DA MENSAGEM */}
                      <div className="flex items-center justify-between gap-3 text-[10px] text-slate-400 mb-1.5">
                        <span className="font-semibold text-slate-300 flex items-center gap-1">
                          {msg.sender === "user" ? "Você" : "Copilot ANJUN"}
                        </span>
                        <span>{msg.timestamp}</span>
                      </div>

                      {/* CONTEÚDO */}
                      <div className="text-xs">
                        {msg.sender === "user" ? msg.texto : renderMarkdown(msg.texto)}
                      </div>

                      {/* RODAPÉ DO COPILOT COM SQL & STATS */}
                      {msg.sender === "copilot" && msg.sql && (
                        <div className="mt-3 pt-2.5 border-t border-slate-800 flex flex-col gap-2">
                          <div className="flex items-center justify-between text-[11px] text-slate-400">
                            <div className="flex items-center gap-2">
                              {msg.tempoMs !== undefined && (
                                <span className="flex items-center gap-1 text-emerald-400">
                                  <Clock className="w-3 h-3" /> {msg.tempoMs}ms
                                </span>
                              )}
                              {msg.totalRegistros !== undefined && (
                                <span className="flex items-center gap-1 text-slate-300">
                                  <Database className="w-3 h-3 text-slate-400" /> {msg.totalRegistros} linhas
                                </span>
                              )}
                            </div>

                            <button
                              onClick={() => toggleSql(msg.id)}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium transition-colors"
                            >
                              <Terminal className="w-3 h-3" />
                              {sqlVisivelMap[msg.id] ? "Ocultar SQL" : "Ver SQL Executada"}
                            </button>
                          </div>

                          {/* ACCORDION SQL */}
                          {sqlVisivelMap[msg.id] && (
                            <div className="relative mt-1 p-2.5 rounded-lg bg-[#070A11] border border-slate-800 font-mono text-[11px] text-emerald-300/90 overflow-x-auto">
                              <pre className="whitespace-pre-wrap">{msg.sql}</pre>
                              <button
                                onClick={() => handleCopiar(msg.id, msg.sql || "")}
                                className="absolute top-2 right-2 p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1 transition-colors"
                                title="Copiar Query SQL"
                              >
                                {copiadoId === msg.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* LOADING ANIMADO */}
                {carregando && (
                  <div className="flex flex-col items-start gap-1">
                    <div className="rounded-2xl rounded-bl-none p-3.5 bg-slate-900 border border-slate-800 text-slate-300 shadow-md">
                      <div className="flex items-center gap-2.5">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span className="text-xs font-semibold text-emerald-400">{etapaCarregamento}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 pl-4.5">
                        Garantindo leitura estrita sem alucinação no banco de dados.
                      </p>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* BARRA DE INPUT */}
              <div className="p-3 bg-slate-900/90 border-t border-slate-800">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleEnviar();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={inputPergunta}
                    onChange={(e) => setInputPergunta(e.target.value)}
                    placeholder="Pergunte ex: qual MD bipa mais? onde tem mais sellers?"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
                    disabled={carregando}
                  />
                  <button
                    type="submit"
                    disabled={!inputPergunta.trim() || carregando}
                    className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-all shadow-md flex items-center justify-center"
                    title="Enviar pergunta"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
                <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1.5 px-1">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" /> Apenas consultas de leitura SELECT
                  </span>
                  <span>Pressione Enter para enviar</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
