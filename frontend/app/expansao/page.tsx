"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "../../hooks/use-auth";
import { 
  getExpansaoOportunidades, 
  getExpansaoResumo, 
  OportunidadeExpansao, 
  ResumoCriacao,
  perguntarCopilotoGeral,
  fetchOptions,
  OptionsData
} from "../../lib/api";
import ViabilidadeModal from "../../components/ViabilidadeModal";
import PropostasPanel from "../../components/PropostasPanel";
import SimuladorMD from "../../components/SimuladorMD";
import { 
  TrendingUp, 
  Sparkles, 
  MapPin, 
  Building, 
  AlertCircle, 
  CheckCircle, 
  Layers, 
  Search, 
  Send, 
  Bot, 
  User, 
  RefreshCw, 
  ArrowUpRight, 
  Target, 
  Flame, 
  ShieldCheck, 
  ShoppingBag,
  Store,
  ChevronRight,
  Filter,
  Calendar,
  FileText,
  ClipboardList,
  Download
} from "lucide-react";
import dynamic from "next/dynamic";

const MapComponent = dynamic(() => import("../../components/MapComponent"), { 
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[420px] flex flex-col items-center justify-center bg-[#0C101B]/50 rounded-2xl border border-border">
      <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mb-3"></div>
      <p className="text-xs text-muted-foreground">Carregando mapa espacial de expansão...</p>
    </div>
  )
});

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export default function ExpansaoPage() {
  const { role, isMaster } = useAuth();
  
  // Main tab
  const [mainTab, setMainTab] = useState<"mapa" | "propostas" | "simulador" | "ia">("mapa");

  // Data filters
  const [periodoTipo, setPeriodoTipo] = useState<string>("Diário");
  const [rotulo, setRotulo] = useState<string>("latest");
  const [options, setOptions] = useState<OptionsData>({ dias: [], semanas: [] });
  const [optionsLoading, setOptionsLoading] = useState<boolean>(true);
  const [estadoFilter, setEstadoFilter] = useState<string>("");
  const [cidadeFilter, setCidadeFilter] = useState<string>("");
  const [minPedidos, setMinPedidos] = useState<number>(10);
  const [prioridadeFilter, setPrioridadeFilter] = useState<string>("TODAS");

  // Data states
  const [oportunidades, setOportunidades] = useState<OportunidadeExpansao[]>([]);
  const [resumo, setResumo] = useState<ResumoCriacao | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Viabilidade modal
  const [viabilidadeTarget, setViabilidadeTarget] = useState<{ cidade: string; estado: string; bairro?: string } | null>(null);

  // Propostas prefill
  const [propostaPrefill, setPropostaPrefill] = useState<any>(null);

  // Map state
  const [mapCenter, setMapCenter] = useState<[number, number]>([-23.5505, -46.6333]);
  const [mapZoom, setMapZoom] = useState<number>(10);
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);

  // PDF export
  const handleExportPDF = useCallback(async () => {
    const element = document.getElementById("expansao-report-area");
    if (!element) return;
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const opt = {
        margin: 10,
        filename: `Relatorio_Expansao_${new Date().toISOString().split("T")[0]}.pdf`,
        image: { type: "jpeg" as const, quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#0F172A" },
        jsPDF: { unit: "mm" as const, format: "a4", orientation: "landscape" as const }
      };
      await (html2pdf() as any).set(opt).from(element).save();
    } catch (e) {
      console.error("Erro ao exportar PDF:", e);
      alert("Erro ao gerar PDF. Tente novamente.");
    }
  }, []);

  // AI Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Olá! Sou o **Copiloto Estratégico de Expansão e Operações da ANJUN**. Como posso te ajudar hoje? Posso sugerir novos locais para MDs, analisar áreas com alto volume de sellers desatendidos ou projetar crescimento por marketplace.",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [chatInput, setChatInput] = useState<string>("");
  const [chatLoading, setChatLoading] = useState<boolean>(false);

  // Load available dates
  useEffect(() => {
    const loadOps = async () => {
      try {
        const data = await fetchOptions();
        setOptions(data);
        if (data.dias && data.dias.length > 0) {
          setRotulo(data.dias[0]);
        }
      } catch (e) {
        console.error("Erro ao carregar opções:", e);
      } finally {
        setOptionsLoading(false);
      }
    };
    loadOps();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    setError(null);
    try {
      const [opsData, resData] = await Promise.all([
        getExpansaoOportunidades(
          periodoTipo,
          rotulo || "latest",
          undefined,
          undefined,
          estadoFilter || undefined,
          cidadeFilter || undefined,
          minPedidos
        ),
        getExpansaoResumo(
          periodoTipo,
          rotulo || "latest",
          undefined,
          undefined,
          undefined,
          estadoFilter || undefined
        )
      ]);
      setOportunidades(opsData);
      setResumo(resData);
    } catch (err: any) {
      console.error("Erro ao carregar dados de expansão:", err);
      setError(err.message || "Erro ao carregar análise de expansão.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, [periodoTipo, rotulo, estadoFilter, minPedidos]);

  // Handle AI question
  const handleSendQuestion = async (perguntaPersonalizada?: string) => {
    const q = (perguntaPersonalizada || chatInput).trim();
    if (!q || chatLoading) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, userMsg]);
    if (!perguntaPersonalizada) setChatInput("");
    setChatLoading(true);

    try {
      // Build smart contextual prompt with top opportunities
      const topOpsStr = oportunidades.slice(0, 8).map(o => 
        `- CEP: ${o.cep} (${o.cidade}/${o.estado} - ${o.bairro}): ${o.total_pedidos} pedidos, ${o.qtd_sellers} sellers | Distância MD mais próx: ${o.distancia_km_md_proximo ? o.distancia_km_md_proximo + 'km (' + o.md_mais_proximo + ')' : 'Sem MD cadastrado'} | Prioridade: ${o.prioridade}`
      ).join("\n");

      const promptContext = `
[CONTEXTO ATUAL DE EXPANSÃO & CRIAÇÃO DE PEDIDOS]
- Total de Pedidos Criados na Base: ${resumo?.total_pedidos?.toLocaleString() || 'N/D'}
- Total de Sellers Ativos: ${resumo?.total_sellers?.toLocaleString() || 'N/D'}
- Top Polos de Demanda Identificados:
${topOpsStr}

[PERGUNTA DO USUÁRIO]
${q}
`;

      const token = typeof window !== "undefined" ? localStorage.getItem("anjun_token") : null;
      const res = await perguntarCopilotoGeral(promptContext);
      
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: res.resposta || "Análise concluída com sucesso.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: `Desculpe, ocorreu um erro ao consultar a IA: ${err.message || 'Verifique se a chave de API do Gemini está configurada em Configurações'}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setChatLoading(false);
    }
  };

  const filteredOportunidades = oportunidades.filter(op => {
    if (prioridadeFilter === "ALTA" && op.prioridade !== "ALTA_PRIORIDADE") return false;
    if (prioridadeFilter === "MEDIA" && op.prioridade !== "MEDIA_PRIORIDADE") return false;
    if (cidadeFilter && !op.cidade.toLowerCase().includes(cidadeFilter.toLowerCase()) && !op.bairro.toLowerCase().includes(cidadeFilter.toLowerCase())) return false;
    return true;
  });

  const altaPrioridadeCount = oportunidades.filter(o => o.prioridade === "ALTA_PRIORIDADE").length;
  const mediaPrioridadeCount = oportunidades.filter(o => o.prioridade === "MEDIA_PRIORIDADE").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#0C101B]/60 p-6 rounded-2xl border border-border backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Expansão & Copiloto IA</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inteligência geoespacial cruzando Criação de Pedidos (D-1) vs Malha de MDs para abertura de novos pontos.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-[#131926] border border-border rounded-xl p-1">
            <button
              onClick={() => {
                setPeriodoTipo("Diário");
                if (options.dias.length > 0) setRotulo(options.dias[0]);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                periodoTipo === "Diário" ? "bg-primary text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Diário (D-1)
            </button>
            <button
              onClick={() => {
                setPeriodoTipo("Semanal");
                if (options.semanas.length > 0) setRotulo(options.semanas[0]);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                periodoTipo === "Semanal" ? "bg-primary text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Semanal
            </button>
          </div>

          {/* Date Selector Dropdown */}
          <div className="relative">
            <select
              value={rotulo}
              onChange={(e) => setRotulo(e.target.value)}
              className="bg-[#131926] border border-border text-white text-xs rounded-xl px-3 py-2 pr-8 appearance-none cursor-pointer focus:outline-none focus:border-primary"
            >
              <option value="latest">🌟 Mais Recente (Auto)</option>
              {periodoTipo === "Diário" ? (
                options.dias.map((d) => (
                  <option key={d} value={d}>
                    📅 {d}
                  </option>
                ))
              ) : (
                options.semanas.map((s) => (
                  <option key={s} value={s}>
                    📆 Semana {s}
                  </option>
                ))
              )}
            </select>
            <Calendar className="w-3.5 h-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <button
            onClick={() => carregarDados()}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-border text-xs font-semibold text-white rounded-xl transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-700/80 hover:bg-emerald-600 border border-emerald-500/30 text-xs font-semibold text-white rounded-xl transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar PDF</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-2xl border border-border relative overflow-hidden">
          <div className="flex justify-between items-start">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Demanda Criada (Pedidos)</p>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-3 font-mono">
            {resumo?.total_pedidos ? resumo.total_pedidos.toLocaleString() : "0"}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Total de pacotes criados por sellers</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-border relative overflow-hidden">
          <div className="flex justify-between items-start">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sellers Ativos</p>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white mt-3 font-mono">
            {resumo?.total_sellers ? resumo.total_sellers.toLocaleString() : "0"}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Lojistas postando pedidos no período</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-purple-500/30 relative overflow-hidden">
          <div className="flex justify-between items-start">
            <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider">Vácuos Críticos (&lt; 3 KM)</p>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-purple-300 mt-3 font-mono">
            {altaPrioridadeCount} <span className="text-xs text-muted-foreground font-normal">polos sem MD &lt; 3km</span>
          </p>
          <p className="text-[11px] text-purple-400/80 mt-1">Sem nenhum MD num raio de 3.0 km</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-border relative overflow-hidden">
          <div className="flex justify-between items-start">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Polos Atendidos (&lt; 3 KM)</p>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-3 font-mono">
            {oportunidades.length - altaPrioridadeCount} <span className="text-xs text-muted-foreground font-normal">polos cobertos</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Possuem MD ativo em até 3.0 km</p>
        </div>
      </div>

      {/* Main Grid: Opportunities Table + Copilot AI Chat */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Col (7 cols): Opportunities List & Filters */}
        <div className="lg:col-span-7 space-y-4">
          <div className="glass-panel p-5 rounded-2xl border border-border space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold text-white">Oportunidades de Expansão (Regra de 3 KM)</h2>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {filteredOportunidades.length} polos analisados
              </span>
            </div>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-border">
              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Filtro de Cobertura:</label>
                <select
                  value={prioridadeFilter}
                  onChange={(e) => setPrioridadeFilter(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 bg-[#0C101B] border border-border rounded-lg text-xs text-slate-200 focus:outline-none"
                >
                  <option value="TODAS">Todas as Prioridades</option>
                  <option value="ALTA">🚨 Vácuos Críticos (Sem MD &lt; 3 KM)</option>
                  <option value="MEDIA">⚡ Polos em Alerta (&gt; 2 KM)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Estado (UF):</label>
                <select
                  value={estadoFilter}
                  onChange={(e) => setEstadoFilter(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 bg-[#0C101B] border border-border rounded-lg text-xs text-slate-200 focus:outline-none"
                >
                  <option value="">Todos os Estados</option>
                  <option value="SP">São Paulo (SP)</option>
                  <option value="RJ">Rio de Janeiro (RJ)</option>
                  <option value="MG">Minas Gerais (MG)</option>
                  <option value="PR">Paraná (PR)</option>
                  <option value="SC">Santa Catarina (SC)</option>
                  <option value="RS">Rio Grande do Sul (RS)</option>
                  <option value="BA">Bahia (BA)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-semibold text-muted-foreground uppercase">Busca Cidade/Bairro:</label>
                <input
                  type="text"
                  placeholder="Ex: Guarulhos, Brás..."
                  value={cidadeFilter}
                  onChange={(e) => setCidadeFilter(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 bg-[#0C101B] border border-border rounded-lg text-xs text-slate-200 focus:outline-none placeholder:text-slate-600"
                />
              </div>
            </div>

            {/* Opportunities Table */}
            <div className="overflow-x-auto max-h-[460px] overflow-y-auto pr-1">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#0C101B] text-muted-foreground text-[10px] uppercase font-semibold border-b border-border">
                  <tr>
                    <th className="py-2.5 px-3">CEP / Localidade</th>
                    <th className="py-2.5 px-2 text-right">Criados (Pickup / Dropoff)</th>
                    <th className="py-2.5 px-2 text-right">Sellers</th>
                    <th className="py-2.5 px-3">MD Mais Próximo</th>
                    <th className="py-2.5 px-3 text-center">Status 3 KM</th>
                    <th className="py-2.5 px-2 text-center">Ações IA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {filteredOportunidades.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        Nenhuma oportunidade encontrada com os filtros selecionados.
                      </td>
                    </tr>
                  ) : (
                    filteredOportunidades.map((op, idx) => {
                      const isSemMD3km = !op.tem_md_raio_3km;
                      return (
                        <tr key={idx}
                          className="hover:bg-purple-900/20 transition-colors group"
                        >
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-white group-hover:text-purple-300 transition-colors">{op.cidade} - {op.bairro}</div>
                            <div className="text-[11px] text-slate-400 font-mono">CEP: {op.cep} ({op.estado})</div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-white">
                            <span className="font-bold">{op.total_pedidos.toLocaleString()}</span>
                            <div className="text-[10px] text-slate-400">
                              <span className="text-emerald-400 font-semibold" title="Coleta Porta a Porta">Coleta: {op.total_pickup?.toLocaleString() || 0}</span> | 
                              <span className="text-amber-400 font-semibold ml-1" title="Entrega Porta a Porta"> Entrega: {op.total_dropoff?.toLocaleString() || 0}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono text-slate-300 font-bold">
                            {op.qtd_sellers}
                          </td>
                          <td className="py-2.5 px-3">
                            {op.md_mais_proximo ? (
                              <div>
                                <span className="text-xs font-semibold text-slate-200">{op.md_mais_proximo}</span>
                                <span className="text-[10px] text-slate-400 ml-1">({op.distancia_km_md_proximo} km)</span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-rose-400 font-semibold">Sem MD na região</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isSemMD3km 
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30" 
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            }`}>
                              {isSemMD3km ? "🚨 Sem MD < 3 KM" : "✅ Coberto"}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <button
                              onClick={() => {
                                const q = `Elabore um Plano Executivo de Implantação de Ponto Parceiro MD para o polo de ${op.bairro || op.cidade} - ${op.estado} (CEP: ${op.cep}).
Volume Criado Não Coletado: ${op.total_pedidos.toLocaleString()} pacotes (${op.qtd_sellers} sellers).
Modalidade: Coleta Porta a Porta (${op.total_pickup.toLocaleString()}) vs Entrega Porta a Porta (${op.total_dropoff.toLocaleString()}).
MD mais próximo: ${op.md_mais_proximo} (${op.distancia_km_md_proximo} km).
Status: Sem MD num raio de 3 KM.
Por favor, forneça o plano estruturado em tópicos:
1. Diagnóstico do Polo de Demanda
2. Perfil de Atendimento Recomendado (Coleta vs Entrega)
3. Localização Estratégica Sugerida
4. Viabilidade Operacional e Próximos Passos de Captação`;
                                handleSendQuestion(q);
                              }}
                              className="px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 mx-auto"
                              title="Gerar Plano de Implantação com a IA"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>Plano IA</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

          </div>
        </div>

        {/* Right Col (5 cols): AI Strategic Copilot Widget */}
        <div className="lg:col-span-5 flex flex-col">
          <div className="glass-panel p-5 rounded-2xl border border-purple-500/30 flex flex-col h-[580px] relative overflow-hidden">
            
            {/* Copilot Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>Copiloto de Expansão IA</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono">Gemini</span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground">Tire dúvidas sobre polos de sellers e abertura de MDs</p>
                </div>
              </div>
            </div>

            {/* Quick Prompt Chips */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={() => handleSendQuestion("Quais são os 3 melhores locais para abrir novos MDs hoje e por quê?")}
                className="px-2.5 py-1 bg-[#131926] hover:bg-purple-950/40 border border-purple-500/20 hover:border-purple-500/40 rounded-lg text-[10px] text-purple-300 transition-all text-left"
              >
                📍 Top 3 locais para novos MDs
              </button>
              <button
                onClick={() => handleSendQuestion("Analise a concentração de sellers em São Paulo comparando com o raio de atendimento.")}
                className="px-2.5 py-1 bg-[#131926] hover:bg-purple-950/40 border border-purple-500/20 hover:border-purple-500/40 rounded-lg text-[10px] text-purple-300 transition-all text-left"
              >
                📊 Raio de atendimento em SP
              </button>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              {chatMessages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={`flex items-start gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                >
                  <div className={`w-6 h-6 rounded-lg shrink-0 flex items-center justify-center text-[10px] ${
                    msg.role === "user" ? "bg-blue-600 text-white" : "bg-purple-600 text-white"
                  }`}>
                    {msg.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>
                  <div className={`max-w-[85%] rounded-2xl p-3.5 ${
                    msg.role === "user" 
                      ? "bg-blue-600/20 border border-blue-500/30 text-white rounded-tr-none" 
                      : "bg-[#0C101B] border border-border text-slate-200 rounded-tl-none leading-relaxed"
                  }`}>
                    <div className="whitespace-pre-wrap leading-relaxed font-sans text-xs">
                      {msg.content}
                    </div>
                    <div className="text-[9px] text-slate-500 mt-1.5 text-right font-mono">
                      {msg.timestamp}
                    </div>
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-2 text-xs text-purple-400 py-2">
                  <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
                  <span>O copiloto está analisando a volumetria e a malha espacial...</span>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="pt-3 border-t border-border mt-2">
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSendQuestion(); }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="Ex: Onde temos maior volume sem cobertura de MD?"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={chatLoading}
                  className="flex-1 px-3.5 py-2.5 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500/50"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || chatLoading}
                  className="p-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl transition-all cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>

          </div>
        </div>

      </div>

      {/* Breakdown by Marketplace */}
      {resumo?.clientes && resumo.clientes.length > 0 && (
        <div className="glass-panel p-5 rounded-2xl border border-border space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white">Demanda Criada por Marketplace / Cliente</h2>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {resumo.clientes.map((c, idx) => (
              <div key={idx} className="bg-[#0C101B] p-3.5 rounded-xl border border-border space-y-1">
                <p className="text-[11px] font-bold text-slate-300 truncate">{c.cliente}</p>
                <p className="text-lg font-bold text-white font-mono">{c.volume.toLocaleString()}</p>
                <p className="text-[10px] text-blue-400 font-semibold">{c.percentual.toFixed(1)}% do total</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Main Bottom Tabs: Mapa/Análise | Propostas | Copiloto IA ─── */}
      <div className="space-y-4">
        {/* Tab Selector */}
        <div className="flex bg-[#0C101B]/60 p-1 rounded-2xl border border-border shadow-md">
          {[
            { key: "mapa", label: "🗺️ Mapa & Análise", icon: MapPin },
            { key: "simulador", label: "🔮 Simulador de Ponto", icon: Target },
            { key: "propostas", label: "📋 Minhas Propostas", icon: ClipboardList },
            { key: "ia", label: "🤖 Copiloto IA", icon: Sparkles },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setMainTab(key as any)}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center ${
                mainTab === key
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-500/10"
                  : "text-muted-foreground hover:text-white hover:bg-slate-800/20"
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Tab: Simulador */}
        {mainTab === "simulador" && (
          <div className="glass-panel rounded-2xl border border-border p-6">
            <SimuladorMD />
          </div>
        )}

        {/* Tab: Propostas */}
        {mainTab === "propostas" && (
          <div className="glass-panel rounded-2xl border border-border p-6">
            <PropostasPanel
              prefillData={propostaPrefill}
              onPrefillConsumed={() => setPropostaPrefill(null)}
            />
          </div>
        )}

        {/* Tab: Copiloto IA — already rendered above inside the page; here we show a teaser if on other tab */}
        {mainTab === "ia" && (
          <div className="glass-panel rounded-2xl border border-border p-4 text-center py-8">
            <Sparkles className="w-8 h-8 text-purple-400 mx-auto mb-3 animate-pulse" />
            <p className="text-sm text-muted-foreground">Copiloto IA disponível no painel acima.</p>
            <p className="text-xs text-slate-600 mt-1">Role para cima para interagir com o chat.</p>
          </div>
        )}
      </div>

      {/* Viabilidade Modal */}
      {viabilidadeTarget && (
        <ViabilidadeModal
          cidade={viabilidadeTarget.cidade}
          estado={viabilidadeTarget.estado}
          bairro={viabilidadeTarget.bairro}
          periodoTipo={periodoTipo}
          rotulo={rotulo}
          onClose={() => setViabilidadeTarget(null)}
          onAddProposta={(dados) => {
            setPropostaPrefill(dados);
            setMainTab("propostas");
          }}
        />
      )}

    </div>
  );
}
