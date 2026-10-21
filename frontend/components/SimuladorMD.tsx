"use client";

import React, { useState } from "react";
import { simularViabilidadeMD, SimuladorViabilidadeResult } from "../lib/api";
import { 
  Search, MapPin, Store, AlertTriangle, ShieldCheck, Zap, 
  Map, Activity, Layers, ArrowRight, Loader2, Info
} from "lucide-react";

export default function SimuladorMD() {
  const [cep, setCep] = useState("");
  const [raio, setRaio] = useState<number>(5.0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimuladorViabilidadeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSimular = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cep || cep.length < 8) return;
    
    setLoading(true);
    setError(null);
    setResult(null);
    
    try {
      const data = await simularViabilidadeMD(cep, raio);
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Erro ao consultar viabilidade. Verifique o CEP digitado.");
    } finally {
      setLoading(false);
    }
  };

  const SCORE_UI = {
    VERDE: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: ShieldCheck, label: "Viável (Oceano Azul)" },
    AMARELO: { color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", icon: AlertTriangle, label: "Atenção (Avaliar)" },
    VERMELHO: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", icon: Zap, label: "Risco Elevado" },
  };

  return (
    <div className="space-y-6">
      
      {/* Search Header */}
      <div className="flex flex-col md:flex-row gap-5 items-end">
        <form onSubmit={handleSimular} className="flex-1 w-full flex items-end gap-3">
          <div className="flex-1 relative">
            <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1.5 ml-1">CEP do Ponto (Prospect)</label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Ex: 01310-100" 
                value={cep}
                onChange={(e) => setCep(e.target.value.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').substring(0, 9))}
                className="w-full bg-[#0C101B] border border-border text-white text-sm rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:border-purple-500 transition-colors"
                maxLength={9}
              />
            </div>
          </div>
          
          <div className="w-32 relative">
            <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-1.5 ml-1">Raio (km)</label>
            <div className="relative">
              <Map className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <select 
                value={raio} 
                onChange={(e) => setRaio(Number(e.target.value))}
                className="w-full bg-[#0C101B] border border-border text-white text-sm rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:border-purple-500 appearance-none cursor-pointer"
              >
                <option value={2}>2 km</option>
                <option value={3}>3 km</option>
                <option value={5}>5 km</option>
                <option value={10}>10 km</option>
              </select>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading || cep.length < 8}
            className="h-[42px] px-6 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-xl flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Simular
          </button>
        </form>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-4 rounded-xl flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Results Area */}
      {result && !loading && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* Main Score Card */}
          <div className={`p-6 rounded-2xl border ${SCORE_UI[result.analise.score].bg} ${SCORE_UI[result.analise.score].border}`}>
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl bg-white/10 ${SCORE_UI[result.analise.score].color}`}>
                {React.createElement(SCORE_UI[result.analise.score].icon, { className: "w-8 h-8" })}
              </div>
              <div>
                <h3 className={`text-xl font-bold ${SCORE_UI[result.analise.score].color}`}>
                  {SCORE_UI[result.analise.score].label}
                </h3>
                <p className="text-slate-300 text-sm mt-1 leading-relaxed">
                  {result.analise.parecer}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Contexto Geográfico & Demanda */}
            <div className="bg-[#131926]/50 border border-border rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <MapPin className="w-4 h-4 text-purple-400" />
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Região Alvo</h4>
              </div>
              
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-muted-foreground">Localização</p>
                  <p className="text-sm text-white font-medium">
                    {result.cep_info.bairro || "Centro"} • {result.cep_info.cidade} / {result.cep_info.estado}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{result.cep_info.endereco}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><Layers className="w-3 h-3" /> Demanda Estimada</p>
                    <p className="text-2xl font-bold text-white font-mono mt-1">{result.demanda.total_pedidos.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500">pedidos (ref: {result.demanda.dia_base})</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1"><Activity className="w-3 h-3" /> Sellers Ativos</p>
                    <p className="text-2xl font-bold text-white font-mono mt-1">{result.demanda.qtd_sellers.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-500">lojistas locais</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Canibalização (MDs próximos) */}
            <div className="bg-[#131926]/50 border border-border rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4 justify-between">
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-blue-400" />
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">Concorrência Interna (Raio {result.analise.raio_km}km)</h4>
                </div>
                <span className="text-xs font-bold bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-lg border border-blue-500/30">
                  {result.analise.mds_no_raio} MDs
                </span>
              </div>

              {result.analise.mds_no_raio === 0 ? (
                <div className="flex flex-col items-center justify-center h-24 text-center">
                  <ShieldCheck className="w-8 h-8 text-emerald-400/50 mb-2" />
                  <p className="text-xs font-semibold text-emerald-400">Nenhum MD da ANJUN neste raio.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {result.analise.mds_proximos.map((md, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2.5 bg-black/20 rounded-xl border border-white/5">
                      <div>
                        <p className="text-xs font-bold text-slate-200">{md.nome}</p>
                        <p className="text-[10px] text-muted-foreground">{md.codigo} • Status: {md.status}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold font-mono ${md.distancia_km < 1.5 ? "text-red-400" : "text-yellow-400"}`}>
                          {md.distancia_km} km
                        </p>
                      </div>
                    </div>
                  ))}
                  
                  {result.analise.mds_no_raio > 5 && (
                    <p className="text-[10px] text-center text-slate-500 pt-1">
                      + {result.analise.mds_no_raio - 5} outros MDs na região.
                    </p>
                  )}
                </div>
              )}
              
            </div>
          </div>
          
        </div>
      )}
      
      {!result && !loading && (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-[#131926]/30 border border-border rounded-2xl">
          <Map className="w-12 h-12 text-slate-600 mb-4" />
          <p className="text-slate-300 font-semibold mb-1">Simulador de Viabilidade</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Digite um CEP e escolha o raio de abrangência para descobrir se abrir um novo MD nessa localização é estratégico.
          </p>
        </div>
      )}
    </div>
  );
}
