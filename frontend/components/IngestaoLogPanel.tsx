"use client";
import React, { useEffect, useRef } from "react";
import { Loader2, CheckCircle, XCircle, Terminal, Download, Calendar, Layers, FileSpreadsheet, ArrowDownRight } from "lucide-react";
import { API_URL, getDownloadOtimizadoUrl } from "../lib/api";

interface LogEntry {
  ts: string;
  msg: string;
  kind: "info" | "success" | "error";
}

interface JobStats {
  linhas_totais?: number;
  linhas_mantidas?: number;
  linhas_descartadas?: number;
  tamanho_original_mb?: number;
  tamanho_final_mb?: number;
  reducao_pct?: number;
  data_detectada?: string;
  distribuicao_datas?: Record<string, number>;
  arquivo_xlsx?: string;
  arquivo_csv?: string;
  tempo_total_segundos?: number;
  ingestao_sistema?: boolean;
}

interface Job {
  status: "running" | "done" | "error";
  progress?: number;
  logs: LogEntry[];
  error: string | null;
  result: Record<string, any> | null;
  stats?: JobStats;
}

interface Props {
  jobId: string | null;
  onDone?: (result: Record<string, any>) => void;
  onError?: (err: string) => void;
  onApplyDate?: (date: string) => void;
}

export default function IngestaoLogPanel({ jobId, onDone, onError, onApplyDate }: Props) {
  const [job, setJob] = React.useState<Job | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId) { 
      setJob(null); 
      return; 
    }

    setJob({ status: "running", progress: 0, logs: [], error: null, result: null, stats: {} });

    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}/api/config/ingestao-status/${jobId}`);
        if (!res.ok) return;
        const data: Job = await res.json();
        setJob(data);
        if (data.status === "done") {
          clearInterval(intervalRef.current!);
          onDone?.(data.result ?? {});
        } else if (data.status === "error") {
          clearInterval(intervalRef.current!);
          onError?.(data.error ?? "Erro desconhecido");
        }
      } catch { /* silenciar erros de rede */ }
    };

    poll();
    intervalRef.current = setInterval(poll, 1200);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [jobId]);

  // Auto-scroll para o final do log
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [job?.logs.length]);

  if (!jobId || !job) return null;

  const stats = job.result || job.stats || {};
  const dataDetectada = stats.data_detectada;

  return (
    <div className="mt-4 bg-[#080B12] border border-slate-700/60 rounded-xl overflow-hidden shadow-2xl transition-all">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/60 bg-slate-900/80">
        <Terminal className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-semibold text-slate-200 font-mono">Processamento em Streaming</span>
        
        <div className="ml-auto flex items-center gap-2">
          {job.status === "running" && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Em Execução...
            </span>
          )}
          {job.status === "done" && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <CheckCircle className="w-3.5 h-3.5" /> Concluído com Sucesso
            </span>
          )}
          {job.status === "error" && (
            <span className="flex items-center gap-1.5 text-xs text-red-400 font-medium">
              <XCircle className="w-3.5 h-3.5" /> Falha no Processamento
            </span>
          )}
        </div>
      </div>

      {/* Barra de Progresso Visual */}
      {job.status === "running" && (
        <div className="w-full bg-slate-950 h-2 relative overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 animate-pulse transition-all duration-300"
            style={{ width: `${Math.max(job.progress || 15, 10)}%` }}
          />
        </div>
      )}

      {/* Cards de Métricas em Tempo Real ou Concluído */}
      {(stats.linhas_totais || stats.linhas_mantidas || dataDetectada) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-900/40 border-b border-slate-800">
          <div className="bg-[#0e1424] p-3 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Linhas Lidas</span>
            <span className="text-sm font-bold text-white font-mono">
              {(stats.linhas_totais || 0).toLocaleString("pt-BR")}
            </span>
          </div>

          <div className="bg-[#0e1424] p-3 rounded-lg border border-emerald-500/20">
            <span className="text-[10px] text-emerald-400 uppercase font-semibold block">Linhas Mantidas</span>
            <span className="text-sm font-bold text-emerald-300 font-mono">
              {(stats.linhas_mantidas || 0).toLocaleString("pt-BR")}
            </span>
          </div>

          <div className="bg-[#0e1424] p-3 rounded-lg border border-red-500/20">
            <span className="text-[10px] text-red-400 uppercase font-semibold block">Linhas Descartadas</span>
            <span className="text-sm font-bold text-red-300 font-mono">
              {(stats.linhas_descartadas || 0).toLocaleString("pt-BR")}
            </span>
          </div>

          <div className="bg-[#0e1424] p-3 rounded-lg border border-blue-500/20">
            <span className="text-[10px] text-blue-400 uppercase font-semibold block">Data Detectada (Col M)</span>
            <span className="text-xs font-bold text-blue-200 font-mono flex items-center gap-1 mt-0.5">
              <Calendar className="w-3 h-3 text-blue-400" />
              {dataDetectada || "Identificando..."}
            </span>
          </div>
        </div>
      )}

      {/* Resumo de Redução de Peso (se disponível) */}
      {job.status === "done" && stats.tamanho_original_mb && (
        <div className="px-4 py-3 bg-emerald-950/20 border-b border-emerald-500/20 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-emerald-300 font-medium">
            <ArrowDownRight className="w-4 h-4 text-emerald-400" />
            <span>
              Tamanho reduzido de <strong>{stats.tamanho_original_mb} MB</strong> para <strong>{stats.tamanho_final_mb} MB</strong>
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold font-mono">
              -{stats.reducao_pct}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            {stats.ingestao_sistema && (
              <span className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 flex items-center gap-1.5 shadow-sm">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Torre ANJUN Atualizada!</span>
              </span>
            )}

            {dataDetectada && onApplyDate && (
              <button
                type="button"
                onClick={() => onApplyDate(dataDetectada)}
                className="px-3 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-500/30 font-medium transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Aplicar {dataDetectada} no Formulário</span>
              </button>
            )}

            <a
              href={getDownloadOtimizadoUrl(jobId, "xlsx")}
              download={`planilha_otimizada_${jobId}.xlsx`}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar Excel (.xlsx)</span>
            </a>

            <a
              href={getDownloadOtimizadoUrl(jobId, "csv")}
              download={`planilha_otimizada_${jobId}.csv`}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Baixar CSV</span>
            </a>
          </div>
        </div>
      )}

      {/* Log lines */}
      <div className="p-4 max-h-56 overflow-y-auto custom-scrollbar font-mono text-xs space-y-1.5">
        {job.logs.length === 0 && job.status === "running" && (
          <p className="text-slate-500 animate-pulse">Iniciando streaming e leitura das colunas...</p>
        )}
        {job.logs.map((entry, i) => (
          <div key={i} className="flex gap-2 items-start">
            <span className="text-slate-600 shrink-0 w-16 select-none">{entry.ts}</span>
            <span className={
              entry.kind === "success" ? "text-emerald-400 font-semibold" :
              entry.kind === "error"   ? "text-red-400 font-semibold" :
              "text-slate-300"
            }>
              {entry.msg}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Bottom Status bar */}
      {job.status === "done" && (
        <div className="h-1 bg-emerald-500/80" />
      )}
      {job.status === "error" && (
        <div className="h-1 bg-red-500/80" />
      )}
    </div>
  );
}
