"use client";

import React, { useState } from "react";
import { consultarViabilidadeRapida, ViabilidadeRapidaResult } from "@/lib/api";
import { 
  Search, 
  MapPin, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Truck, 
  Store, 
  Package, 
  ArrowRight, 
  Clock, 
  Compass, 
  X, 
  Loader2,
  Sparkles,
  Building2,
  Copy,
  Check,
  Map
} from "lucide-react";

interface ViabilidadeModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onLocalizarNoMapa?: (
    cidade: string,
    estado?: string,
    lat?: number | null,
    lng?: number | null,
    hubProximo?: any
  ) => void;
  cidade?: string;
  estado?: string;
  bairro?: string;
  periodoTipo?: string;
  rotulo?: string;
  onAddProposta?: (dados: any) => void;
}

export default function ViabilidadeModal({ 
  isOpen = true, 
  onClose, 
  onLocalizarNoMapa,
  cidade: initCidade = "",
  estado: initEstado = ""
}: ViabilidadeModalProps) {
  const [cidade, setCidade] = useState(initCidade);
  const [estado, setEstado] = useState(initEstado);
  const [cliente, setCliente] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ViabilidadeRapidaResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (isOpen === false) return null;

  async function handleBuscar(e?: React.FormEvent, customCidade?: string, customUf?: string) {
    if (e) e.preventDefault();
    const queryCidade = customCidade || cidade;
    const queryEstado = customUf !== undefined ? customUf : estado;

    if (!queryCidade.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const data = await consultarViabilidadeRapida(queryCidade.trim(), queryEstado.trim() || undefined, cliente.trim() || undefined);
      setResult(data);
    } catch (err: any) {
      setError(err?.message || "Erro ao consultar viabilidade.");
    } finally {
      setLoading(false);
    }
  }

  function handleQuickSearch(cid: string, uf: string) {
    setCidade(cid);
    setEstado(uf);
    handleBuscar(undefined, cid, uf);
  }

  function handleCopiarRelatorio() {
    if (!result) return;
    const vizinhasTexto =
      result.cidades_proximas && result.cidades_proximas.length > 0
        ? result.cidades_proximas
            .slice(0, 6)
            .map(
              (c) =>
                `  • ${c.cidade}/${c.estado} (~${c.distancia_km} km): ${c.qtd_sellers} sellers, ${c.qtd_pontos} pontos (${c.sinergia_rota})`
            )
            .join("\n")
        : "  • Nenhuma cidade com sellers ativos em raio de 85 km";

    const sellersTexto =
      result.top_sellers && result.top_sellers.length > 0
        ? result.top_sellers.map((s) => `  • ${s.nome}: ${s.volume.toLocaleString("pt-BR")} pacotes`).join("\n")
        : "  • Nenhum seller nominal registrado";

    const texto = `📦 *PARECER DE VIABILIDADE OPERACIONAL - REDE ANJUN* 📦
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 *Município Avaliado:* ${result.cidade} / ${result.estado}
🎯 *Veredito Operacional:* ${result.veredito_label} (${result.veredito})
⏱️ *Prazo Estimado de Go-Live:* ${result.prazo_estimado}

📊 *Dados Operacionais da Cidade:*
• Status: ${result.ja_operamos ? "JÁ ATIVA NA MALHA" : "NOVA LOCALIDADE (Sem operação direta)"}
• Volume Registrado: ${result.volume_historico.toLocaleString("pt-BR")} pacotes
• Embarcadores Ativos: ${result.qtd_sellers_ativos} sellers
• Minidrops (MDs) Locais: ${result.mds_locais.length}

🏢 *HUB ANJUN Mais Próximo:*
${
  result.hub_proximo
    ? `• ${result.hub_proximo.nome} (${result.hub_proximo.iata}) a ~${result.hub_proximo.distancia_km} km em ${result.hub_proximo.cidade}/${result.hub_proximo.estado}`
    : "• Nenhum HUB cadastrado na região"
}

🚛 *Cidades Vizinhas com Sellers/Pontos (Sinergia de Rota):*
${vizinhasTexto}

🏪 *Principais Embarcadores em ${result.cidade}:*
${sellersTexto}

💡 *Recomendação Operacional:*
${result.recomendacao_operacional}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Fonte: Torre de Controle ANJUN (Dados 100% Auditados em SQLite)_`;

    navigator.clipboard.writeText(texto);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-emerald-500 p-0.5 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-amber-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  Motor de Viabilidade Operacional
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  100% Data-Driven
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Respostas instantâneas baseadas estritamente no histórico real e malha física ANJUN (Zero Alucinação).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-6 border-b border-slate-800/80 bg-slate-900/50">
          <form onSubmit={handleBuscar} className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Qual cidade deseja abrir ou atender? (ex: Gaspar, Brusque, Santos...)"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/50 transition-all font-medium"
              />
            </div>
            <div className="w-24">
              <input
                type="text"
                maxLength={2}
                placeholder="UF (ex: SC)"
                value={estado}
                onChange={(e) => setEstado(e.target.value.toUpperCase())}
                className="w-full px-3 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/50 transition-all text-center uppercase font-bold"
              />
            </div>
            <div className="w-36">
              <input
                type="text"
                placeholder="Cliente (Opcional)"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-950/80 border border-slate-700 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/70 focus:ring-1 focus:ring-amber-500/50 transition-all font-medium"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !cidade.trim()}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50 text-slate-950 font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all shrink-0"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
              ) : (
                <Search className="w-4 h-4 text-slate-950" />
              )}
              <span>Analisar</span>
            </button>
          </form>

          {/* Quick suggestions */}
          <div className="flex items-center gap-2 mt-3 text-xs text-slate-400 flex-wrap">
            <span className="text-slate-500">Sugestões rápidas:</span>
            {[
              { cid: "Gaspar", uf: "SC" },
              { cid: "Brusque", uf: "SC" },
              { cid: "Itajaí", uf: "SC" },
              { cid: "Blumenau", uf: "SC" },
              { cid: "Santos", uf: "SP" },
              { cid: "Franca", uf: "SP" },
            ].map((s) => (
              <button
                key={s.cid}
                type="button"
                onClick={() => handleQuickSearch(s.cid, s.uf)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/50 transition-colors text-[11px] font-medium"
              >
                {s.cid}/{s.uf}
              </button>
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex items-center gap-3">
              <XCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!result && !loading && !error && (
            <div className="py-12 flex flex-col items-center justify-center text-center text-slate-500 space-y-3">
              <Compass className="w-12 h-12 text-slate-600 animate-pulse" />
              <div>
                <p className="text-sm font-medium text-slate-300">
                  Consulte a malha ANJUN instantaneamente
                </p>
                <p className="text-xs text-slate-500 max-w-md mt-1">
                  Digite qualquer município brasileiro ou marketplace para saber se a ANJUN já opera, quais sellers estão ativos, distância ao HUB mais próximo e prazos de início.
                </p>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-5 animate-in fade-in duration-300">
              {/* Verdict Card */}
              <div
                className={`p-5 rounded-2xl border transition-all ${
                  result.veredito === "ALTA"
                    ? "bg-emerald-950/20 border-emerald-500/30 shadow-lg shadow-emerald-500/5"
                    : result.veredito === "MEDIA"
                    ? "bg-amber-950/20 border-amber-500/30 shadow-lg shadow-amber-500/5"
                    : "bg-rose-950/20 border-rose-500/30 shadow-lg shadow-rose-500/5"
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Veredito Operacional para {result.cidade}
                    </span>
                    <h3 className="text-xl font-black text-white mt-0.5 flex items-center gap-2">
                      {result.veredito === "ALTA" && <CheckCircle2 className="w-6 h-6 text-emerald-400" />}
                      {result.veredito === "MEDIA" && <AlertTriangle className="w-6 h-6 text-amber-400" />}
                      {result.veredito === "BAIXA" && <XCircle className="w-6 h-6 text-rose-400" />}
                      {result.veredito_label}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-700/60 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <div>
                        <div className="text-[10px] text-slate-400 leading-none">Prazo de Go-Live</div>
                        <div className="text-xs font-bold text-slate-200 mt-0.5">{result.prazo_estimado}</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleCopiarRelatorio}
                      className="px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/70 text-slate-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                      title="Copiar relatório formatado para WhatsApp ou e-mail"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          <span>Copiar</span>
                        </>
                      )}
                    </button>

                    {onLocalizarNoMapa && (
                      <button
                        type="button"
                        onClick={() =>
                          onLocalizarNoMapa(
                            result.cidade,
                            result.estado,
                            result.latitude,
                            result.longitude,
                            result.hub_proximo
                          )
                        }
                        className="px-3 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                        title={`Localizar ${result.cidade} com Ponto Vermelho no mapa`}
                      >
                        <Map className="w-3.5 h-3.5 text-blue-400" />
                        <span>Ver no Mapa</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Recommendation */}
                <div className="mt-4 pt-3.5 border-t border-slate-800/80 text-sm text-slate-300 leading-relaxed bg-slate-950/40 p-3.5 rounded-xl border border-slate-800/50">
                  <span className="font-bold text-amber-400">Recomendação Operacional: </span>
                  {result.recomendacao_operacional}
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-400 text-xs">
                    <Truck className="w-3.5 h-3.5 text-blue-400" />
                    <span>Status na Cidade</span>
                  </div>
                  <div className="text-base font-black text-white mt-1">
                    {result.ja_operamos ? "Ativa na Malha" : "Sem Operação"}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {result.ja_operamos ? "Com histórico de bipagem" : "Nova localidade"}
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-400 text-xs">
                    <Package className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Volume Registrado</span>
                  </div>
                  <div className="text-base font-black text-emerald-400 mt-1">
                    {result.volume_historico.toLocaleString("pt-BR")}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">pacotes históricos</div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-400 text-xs">
                    <Store className="w-3.5 h-3.5 text-purple-400" />
                    <span>Sellers Ativos</span>
                  </div>
                  <div className="text-base font-black text-purple-400 mt-1">
                    {result.qtd_sellers_ativos}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">embarcadores na cidade</div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl">
                  <div className="flex items-center gap-2 text-slate-400 text-xs">
                    <Building2 className="w-3.5 h-3.5 text-amber-400" />
                    <span>Minidrops (MDs)</span>
                  </div>
                  <div className="text-base font-black text-amber-400 mt-1">
                    {result.mds_locais.length}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">pontos no município</div>
                </div>
              </div>

              {/* Closest HUB & Data Facts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nearest HUB */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800/80">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-purple-400" />
                      HUB ANJUN Mais Próximo
                    </span>
                    {result.hub_proximo && (
                      <span className="text-xs font-black px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        ~{result.hub_proximo.distancia_km} km
                      </span>
                    )}
                  </div>

                  {result.hub_proximo ? (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Identificador / IATA:</span>
                        <span className="font-mono font-bold text-white">{result.hub_proximo.iata}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Nome:</span>
                        <span className="font-medium text-slate-200">{result.hub_proximo.nome}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Localização:</span>
                        <span className="font-medium text-slate-200">{result.hub_proximo.cidade} - {result.hub_proximo.estado}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">Nenhum HUB com coordenadas mapeadas na região.</p>
                  )}
                </div>

                {/* Top Sellers */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800/80">
                    <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Store className="w-4 h-4 text-amber-400" />
                      Principais Sellers em {result.cidade}
                    </span>
                    <span className="text-[10px] text-slate-500">por volume</span>
                  </div>

                  {result.top_sellers.length > 0 ? (
                    <div className="space-y-1.5">
                      {result.top_sellers.map((s, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-slate-900/60">
                          <span className="text-slate-300 truncate max-w-[180px] font-medium">{s.nome}</span>
                          <span className="font-mono font-bold text-amber-400">{s.volume.toLocaleString("pt-BR")} pcts</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">Nenhum seller com bipagem nominal identificado.</p>
                  )}
                </div>
              </div>

              {/* Cidades Vizinhas com Operação Ativa para Montagem de Rotas */}
              {result.cidades_proximas && result.cidades_proximas.length > 0 && (
                <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-cyan-400" />
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                        Cidades Vizinhas com Sellers ou Pontos (Sinergia para Rotas)
                      </h4>
                    </div>
                    <span className="text-[11px] text-cyan-400 font-medium">
                      {result.cidades_proximas.length} cidades ativas em raio de até 85 km
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {result.cidades_proximas.map((viz, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between space-y-2 group"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sm text-slate-100 group-hover:text-cyan-400 transition-colors">
                                {viz.cidade}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-bold">
                                {viz.estado}
                              </span>
                            </div>
                            <span className="text-[11px] font-mono text-cyan-400 font-bold block mt-0.5">
                              ~{viz.distancia_km} km de distância
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleQuickSearch(viz.cidade, viz.estado)}
                            title={`Consultar viabilidade de ${viz.cidade}`}
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-cyan-600 text-slate-300 hover:text-white text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1"
                          >
                            <span>Checar</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="grid grid-cols-3 gap-1 pt-1.5 border-t border-slate-800/60 text-[10px]">
                          <div>
                            <span className="text-slate-500 block">Sellers:</span>
                            <strong className="text-purple-400 font-mono text-xs">{viz.qtd_sellers}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Pontos/MDs:</span>
                            <strong className="text-amber-400 font-mono text-xs">{viz.qtd_pontos}</strong>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Volume:</span>
                            <strong className="text-emerald-400 font-mono text-xs">
                              {viz.volume_historico.toLocaleString("pt-BR")}
                            </strong>
                          </div>
                        </div>

                        <div className="pt-1 border-t border-slate-800/40">
                          <span
                            className={`text-[10px] font-semibold block truncate ${
                              viz.distancia_km <= 25 ? "text-emerald-400" : "text-amber-400"
                            }`}
                            title={viz.sinergia_rota}
                          >
                            {viz.sinergia_rota}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Justificativas Baseadas em Fatos Reais */}
              <div className="bg-slate-950/40 border border-slate-800/60 rounded-xl p-4">
                <div className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Evidências e Fatos Extraídos do Banco de Dados:
                </div>
                <ul className="space-y-1.5">
                  {result.motivos.map((m, idx) => (
                    <li key={idx} className="text-xs text-slate-400 flex items-start gap-2">
                      <span className="text-emerald-500 font-bold">•</span>
                      <span>{m}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between">
          <div className="text-[11px] text-slate-500">
            Torre ANJUN • Inteligência de Rede e Viabilidade de Malha
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
