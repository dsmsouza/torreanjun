"use client";

import React, { useEffect, useState, memo } from "react";
import Link from "next/link";
import { API_URL, fetchWithCache } from "../lib/api";
import { Loader2, ArrowRight } from "lucide-react";

interface MDPerformance {
  md: string;
  cidade: string;
  total: number;
  backlog: number;
  taxa_coleta: number;
  status_saude: string;
}

interface MdsListWidgetProps {
  regional: string | null;
  periodoTipo: string;
  rotulo: string;
  dtInicio?: string;
  dtFim?: string;
}

function MdsListWidgetComponent({
  regional,
  periodoTipo,
  rotulo,
  dtInicio,
  dtFim,
}: MdsListWidgetProps) {
  const [mds, setMds] = useState<MDPerformance[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!regional || !rotulo || rotulo === "Carregando...") return;
    if (periodoTipo === "Período" && (!dtInicio || !dtFim)) return;

    let isMounted = true;
    const loadMds = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          periodo_tipo: periodoTipo,
          rotulo: rotulo,
          regional: regional,
        });
        if (periodoTipo === "Período" && dtInicio && dtFim) {
          params.append("dt_inicio", dtInicio);
          params.append("dt_fim", dtFim);
        }

        const data = await fetchWithCache<MDPerformance[]>(`${API_URL}/api/mds?${params.toString()}`);
        if (isMounted) {
          setMds(data || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadMds();
    return () => { isMounted = false; };
  }, [regional, periodoTipo, rotulo, dtInicio, dtFim]);

  if (!regional) return null;

  return (
    <div className="glass-panel p-6 rounded-2xl border border-border mt-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-bold text-white">MDs da Regional {regional}</h3>
          <p className="text-xs text-muted-foreground">Clique no MD para abrir o Dashboard 360º</p>
        </div>
        <Link 
          href={`/filial?filial=${regional}`}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-all"
        >
          Ver Análise Completa <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : mds.length === 0 ? (
        <div className="text-center text-sm text-slate-500 py-6">Nenhum MD encontrado.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
          {mds.map((md) => (
            <Link
              key={md.md}
              href={`/ponto/${md.md}`}
              className="flex flex-col p-3 rounded-xl border border-border bg-[#0C101B]/60 hover:bg-slate-800/60 hover:border-blue-500/50 transition-all group"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-white text-sm group-hover:text-blue-400 transition-colors">{md.md}</span>
                <div className={`w-2 h-2 rounded-full mt-1 ${
                  md.status_saude === "Aprovado" ? "bg-success" : md.status_saude === "Alerta" ? "bg-warning" : "bg-destructive"
                }`} />
              </div>
              <div className="text-[10px] text-muted-foreground truncate" title={md.cidade}>{md.cidade}</div>
              <div className="mt-2 flex justify-between items-end">
                <div className="text-xs font-mono font-medium text-slate-300">{(md.total ?? 0).toLocaleString()} <span className="text-[9px] text-slate-500">pcts</span></div>
                <div className={`text-[10px] font-bold ${
                  (md.taxa_coleta ?? 0) >= 98 ? "text-success" : (md.taxa_coleta ?? 0) >= 90 ? "text-warning" : "text-destructive"
                }`}>
                  {(md.taxa_coleta ?? 0).toFixed(1)}%
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const MdsListWidget = memo(MdsListWidgetComponent);
export default MdsListWidget;
