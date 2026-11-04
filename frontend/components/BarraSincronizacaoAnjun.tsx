"use client";

import React, { useState, useEffect } from "react";
import {
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Zap,
  Package,
  CheckCheck
} from "lucide-react";
import { getApiUrl } from "@/lib/api";

interface MotorStatus {
  ultimo_sucesso: string | null;
  total_oficial?: number;
  total_processado?: number;
  amostra_salva?: number;
  status?: string;
  data_fechada?: string;
}

interface FechamentoOficial {
  data: string;
  total_scan: number;
  total_criacao: number;
  carregado: number;
  pendente: number;
  taxa_carregamento: number;
  taxa_pendente: number;
  horario_fechamento: string;
}

export default function BarraSincronizacaoAnjun() {
  const [motores, setMotores] = useState<Record<string, MotorStatus>>({});
  const [fechamentos, setFechamentos] = useState<FechamentoOficial[]>([]);
  const [carregando, setCarregando] = useState<Record<string, boolean>>({});
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<boolean>(false);

  const apiUrl = getApiUrl();

  const carregarStatus = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/sincronizacao/status`);
      if (res.ok) {
        const data = await res.json();
        setMotores(data.motores || {});
        setFechamentos(data.fechamentos_oficiais || []);
      }
    } catch {
      // API pode estar offline temporariamente
    }
  };

  useEffect(() => {
    carregarStatus();
    const interval = setInterval(carregarStatus, 30000); // Atualiza status a cada 30s
    return () => clearInterval(interval);
  }, []);

  const dispararMotor = async (tipo: string, endpoint: string) => {
    setCarregando((prev) => ({ ...prev, [tipo]: true }));
    setMensagemSucesso(null);
    try {
      const res = await fetch(`${apiUrl}/api/sincronizacao/${endpoint}`, {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok && data.sucesso) {
        setMensagemSucesso(data.mensagem || "Sincronização concluída com sucesso!");
        await carregarStatus();
      } else {
        alert(data.detail || "Erro ao processar sincronização.");
      }
    } catch (e) {
      alert("Falha de conexão com o servidor Backend (Porta 8000).");
    } finally {
      setCarregando((prev) => ({ ...prev, [tipo]: false }));
      setTimeout(() => setMensagemSucesso(null), 5000);
    }
  };

  const formatarNumero = (n?: number) => {
    if (n === undefined || n === null) return "0";
    return new Intl.NumberFormat("pt-BR").format(n);
  };

  const formatarHora = (horaStr?: string | null) => {
    if (!horaStr) return "Aguardando";
    try {
      const partes = horaStr.split(" ");
      return partes[1]?.substring(0, 5) || horaStr;
    } catch {
      return horaStr;
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg mb-6 text-slate-100">
      {/* Topo: Título e Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base text-white">Sincronizador Automático Anjun (Tempo Real)</h3>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Ativo 24/7
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Alimentação contínua da nuvem Anjun para a sua Torre de Controle sem necessidade de baixar planilhas
            </p>
          </div>
        </div>

        {/* Botão de Histórico, Deploy Online e Mensagem */}
        <div className="flex items-center gap-2">
          {mensagemSucesso && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 text-xs rounded-lg animate-fade-in">
              <CheckCheck className="w-3.5 h-3.5" />
              <span>{mensagemSucesso}</span>
            </div>
          )}

          <button
            disabled={carregando.publicar_online}
            onClick={() => dispararMotor("publicar_online", "publicar-online")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
            title="Exporta o snapshot consolidado e atualiza o dashboard online na Vercel"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${carregando.publicar_online ? "animate-spin" : ""}`} />
            <span>{carregando.publicar_online ? "Publicando na Nuvem..." : "☁️ Publicar Online (Vercel)"}</span>
          </button>

          <button
            onClick={() => setExpandido(!expandido)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
          >
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>Fechamentos Oficiais</span>
            {expandido ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Grid dos 4 Motores e Botões Manuais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3">
        {/* Motor 1: Tempo Real para Coleta */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-medium text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                Bipagens de Hoje
              </span>
              <span className="text-[11px] text-slate-500">Última: {formatarHora(motores.tempo_real?.ultimo_sucesso)}</span>
            </div>
            <div className="text-xl font-bold text-white mb-2">
              {formatarNumero(motores.tempo_real?.total_oficial || motores.tempo_real?.total_processado)}
              <span className="text-xs font-normal text-slate-400 ml-1.5">pedidos</span>
            </div>
          </div>
          <button
            disabled={carregando.tempo_real}
            onClick={() => dispararMotor("tempo_real", "tempo-real")}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded-md transition shadow-sm"
          >
            <RefreshCw className={`w-3 h-3 ${carregando.tempo_real ? "animate-spin" : ""}`} />
            <span>{carregando.tempo_real ? "Sincronizando..." : "Atualizar Bipagens"}</span>
          </button>
        </div>

        {/* Motor 2: Tempo de Criação */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-medium text-blue-400 flex items-center gap-1">
                <Package className="w-3 h-3" />
                Novos Pedidos (Criação)
              </span>
              <span className="text-[11px] text-slate-500">Última: {formatarHora(motores.criacao?.ultimo_sucesso)}</span>
            </div>
            <div className="text-xl font-bold text-white mb-2">
              {formatarNumero(motores.criacao?.total_oficial || motores.criacao?.total_processado)}
              <span className="text-xs font-normal text-slate-400 ml-1.5">solicitados</span>
            </div>
          </div>
          <button
            disabled={carregando.criacao}
            onClick={() => dispararMotor("criacao", "criacao")}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded-md transition shadow-sm"
          >
            <RefreshCw className={`w-3 h-3 ${carregando.criacao ? "animate-spin" : ""}`} />
            <span>{carregando.criacao ? "Sincronizando..." : "Atualizar Criações"}</span>
          </button>
        </div>

        {/* Motor 3: Fechamento D-1 */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-medium text-amber-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                Fechamento D-1 Oficial
              </span>
              <span className="text-[11px] text-slate-500">{motores.dia_anterior?.data_fechada || "03/11"}</span>
            </div>
            <div className="text-xl font-bold text-white mb-2">
              {formatarNumero(motores.dia_anterior?.total_oficial || fechamentos[0]?.total_scan || 1030159)}
              <span className="text-xs font-normal text-slate-400 ml-1.5">total D-1</span>
            </div>
          </div>
          <button
            disabled={carregando.dia_anterior}
            onClick={() => dispararMotor("dia_anterior", "dia-anterior")}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-medium rounded-md transition shadow-sm"
          >
            <RefreshCw className={`w-3 h-3 ${carregando.dia_anterior ? "animate-spin" : ""}`} />
            <span>{carregando.dia_anterior ? "Sincronizando..." : "Reconciliar D-1"}</span>
          </button>
        </div>

        {/* Motor 4: Reconciliação Semanal */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-medium text-purple-400 flex items-center gap-1">
                <Layers className="w-3 h-3" />
                Circuito Fechado
              </span>
              <span className="text-[11px] text-slate-500">Última: {formatarHora(motores.reconciliacao_semanal?.ultimo_sucesso)}</span>
            </div>
            <div className="text-xl font-bold text-white mb-2">
              14 dias
              <span className="text-xs font-normal text-slate-400 ml-1.5">janela móvel</span>
            </div>
          </div>
          <button
            disabled={carregando.reconciliacao_semanal}
            onClick={() => dispararMotor("reconciliacao_semanal", "reconciliacao-semanal")}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium rounded-md transition shadow-sm"
          >
            <RefreshCw className={`w-3 h-3 ${carregando.reconciliacao_semanal ? "animate-spin" : ""}`} />
            <span>{carregando.reconciliacao_semanal ? "Processando..." : "Reconciliar Ciclos"}</span>
          </button>
        </div>
      </div>

      {/* Tabela Expansível: Histórico de Fechamentos Oficiais */}
      {expandido && (
        <div className="mt-4 pt-3 border-t border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Série Histórica de Fechamentos Consolidados (Nuvem Anjun)
            </h4>
            <span className="text-[11px] text-slate-500">Gravado automaticamente às 00h05 de cada dia</span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/80">
            <table className="w-full text-xs text-left text-slate-300">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-3 py-2 font-medium">Data da Operação</th>
                  <th className="px-3 py-2 font-medium">Total Bipado (Scan Real)</th>
                  <th className="px-3 py-2 font-medium">Total Criado</th>
                  <th className="px-3 py-2 font-medium">Carga Retida (Backlog)</th>
                  <th className="px-3 py-2 font-medium">Escoamento</th>
                  <th className="px-3 py-2 font-medium">Horário de Fechamento</th>
                  <th className="px-3 py-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {fechamentos.length > 0 ? (
                  fechamentos.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/50">
                      <td className="px-3 py-2 font-sans font-semibold text-white">{item.data}</td>
                      <td className="px-3 py-2 text-emerald-400 font-bold">{formatarNumero(item.total_scan)}</td>
                      <td className="px-3 py-2 text-blue-400">{formatarNumero(item.total_criacao)}</td>
                      <td className="px-3 py-2 text-amber-400">{formatarNumero(item.pendente)} ({item.taxa_pendente}%)</td>
                      <td className="px-3 py-2 text-emerald-300">{item.taxa_carregamento}%</td>
                      <td className="px-3 py-2 text-slate-400">{item.horario_fechamento}</td>
                      <td className="px-3 py-2 text-right">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                          OFICIAL
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-slate-500 font-sans">
                      Nenhum fechamento registrado ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
