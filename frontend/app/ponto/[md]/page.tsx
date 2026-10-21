"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  ArrowLeft, MapPin, Clock, Building, TrendingUp, AlertTriangle, 
  CheckCircle2, Package, SearchX, Activity, AlertCircle, Filter, PlusCircle, Trash2, Loader2, ShieldAlert
} from "lucide-react";
import dynamic from "next/dynamic";
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from "recharts";
import { useAuth } from "../../../hooks/use-auth";
import { savePenalidade, deletePenalidade, saveAlertaFixo } from "../../../lib/api";

// Map needs to be loaded dynamically without SSR for Leaflet
const MDMap = dynamic(() => import("../../../components/ponto/MDMap"), { 
  ssr: false,
  loading: () => <div className="w-full h-full min-h-[300px] bg-slate-800 animate-pulse rounded-xl" />
});

// Types from our backend
interface MDDashboardData {
  md_codigo: string;
  nome_ponto: string;
  endereco: string;
  cep: string;
  cidade: string;
  estado: string;
  regional: string;
  divisao: string;
  horario_trabalho: string;
  funcionando: string;
  latitude: number;
  longitude: number;
  taxa_coleta_atual: number;
  volume_total_atual: number;
  backlog_atual: number;
  historico_volume: {
    dia_base: string;
    total: number;
    backlog: number;
    taxa_coleta: number;
  }[];
  penalidades: {
    id: number;
    data_penalidade: string;
    motivo: string;
    pontos: number;
  }[];
  ocorrencias: {
    data_registro: string;
    motivo: string;
    observacao: string;
  }[];
  backlog_pendente: {
    codigo_barras: string;
    status: string;
    dias_parado: number;
  }[];
}

export default function PontoDashboard() {
  const params = useParams();
  const router = useRouter();
  const mdCode = params.md as string;
  const { isMaster } = useAuth();

  const [data, setData] = useState<MDDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [agrupamento, setAgrupamentoState] = useState("DIA");
  const [selectedMes, setSelectedMesState] = useState("ALL");

  useEffect(() => {
    const savedAgrup = sessionStorage.getItem("ponto_agrupamento");
    const savedMes = sessionStorage.getItem("ponto_selectedMes");
    if (savedAgrup) setAgrupamentoState(savedAgrup);
    if (savedMes) setSelectedMesState(savedMes);
  }, []);

  const setAgrupamento = (val: string) => {
    setAgrupamentoState(val);
    sessionStorage.setItem("ponto_agrupamento", val);
  };

  const setSelectedMes = (val: string) => {
    setSelectedMesState(val);
    sessionStorage.setItem("ponto_selectedMes", val);
  };

  // Admin Control States
  const [formPenalty, setFormPenalty] = useState({ motivo: "", pontos: 5 });
  const [formAlert, setFormAlert] = useState({ observacao: "" });
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${url}/api/md/${mdCode}/dashboard`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error("Ponto de Coleta não encontrado");
        }
        throw new Error("Erro ao carregar dados do ponto");
      }
      const jsonData = await res.json();
      setData(jsonData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [mdCode]);

  useEffect(() => {
    if (mdCode) {
      loadData();
    }
  }, [mdCode, loadData]);

  // Handlers for Admin actions
  const handleAddPenalty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPenalty.motivo || formPenalty.pontos <= 0) return;
    
    setActionLoading(true);
    setMessage(null);
    try {
      const today = new Date().toISOString().split("T")[0];
      await savePenalidade(today, mdCode, formPenalty.motivo, formPenalty.pontos);
      setMessage({ text: "Penalidade gravada com sucesso!", type: "success" });
      setFormPenalty({ motivo: "", pontos: 5 });
      await loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ text: err.message || "Erro ao gravar penalidade.", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formAlert.observacao.trim()) return;

    setActionLoading(true);
    setMessage(null);
    try {
      await saveAlertaFixo(mdCode, formAlert.observacao.trim());
      setMessage({ text: "Alerta permanente fixado com sucesso!", type: "success" });
      setFormAlert({ observacao: "" });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      setMessage({ text: err.message || "Erro ao fixar alerta.", type: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePenalty = async (id: number) => {
    if (!window.confirm("Confirmar exclusão desta penalidade?")) return;
    try {
      await deletePenalidade(id);
      await loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const getNomeMes = (ym: string) => {
    if (!ym) return "";
    const parts = ym.split("-");
    if (parts.length !== 2) return ym;
    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const mIndex = parseInt(parts[1], 10) - 1;
    if (mIndex >= 0 && mIndex < 12) return `${meses[mIndex]} ${parts[0]}`;
    return ym;
  };

  const processedData = React.useMemo(() => {
    if (!data?.historico_volume) return [];
    
    const enriched = data.historico_volume.map(d => {
      let day, month, year;
      if (d.dia_base.includes('/')) {
        [day, month, year] = d.dia_base.split('/');
      } else {
        [year, month, day] = d.dia_base.split('-');
      }
      
      const mes = `${year}-${month}`;
      
      const dt = new Date(`${year}-${month}-${day}T00:00:00Z`);
      dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay()||7));
      const yearStart = new Date(Date.UTC(dt.getUTCFullYear(),0,1));
      const weekNo = Math.ceil(( ( (dt.getTime() - yearStart.getTime()) / 86400000) + 1)/7);
      const semana = `${dt.getUTCFullYear()}-W${weekNo.toString().padStart(2, '0')}`;
      
      return { ...d, mes, semana };
    });

    const filtered = enriched.filter(d => {
      if (selectedMes !== "ALL" && d.mes !== selectedMes) return false;
      return true;
    });

    if (agrupamento === "DIA") {
      return filtered;
    }
    
    const chartMap = new Map();
    filtered.forEach(d => {
      let timeKey = agrupamento === "MES" ? d.mes : d.semana;
      if (!chartMap.has(timeKey)) {
        chartMap.set(timeKey, { timeKey, total: 0, backlog: 0 });
      }
      const curr = chartMap.get(timeKey);
      curr.total += d.total;
      curr.backlog += d.backlog;
    });

    return Array.from(chartMap.values()).map(d => {
      const taxa = d.total > 0 ? (d.total - d.backlog) / d.total : 0;
      return { ...d, taxa_coleta: taxa, dia_base: d.timeKey };
    }).sort((a, b) => a.timeKey.localeCompare(b.timeKey));
  }, [data, agrupamento, selectedMes]);

  const mesesOptions = Array.from(new Set(data?.historico_volume?.map(d => {
      let month, year;
      if (d.dia_base.includes('/')) {
        const parts = d.dia_base.split('/');
        month = parts[1];
        year = parts[2];
      } else {
        const parts = d.dia_base.split('-');
        year = parts[0];
        month = parts[1];
      }
      return `${year}-${month}`;
  }) || [])).sort((a, b) => b.localeCompare(a));

  if (loading) {
    return (
      <div className="flex h-[80vh] w-full items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col h-[80vh] w-full items-center justify-center space-y-4">
        <SearchX className="h-20 w-20 text-slate-500" />
        <h1 className="text-2xl font-bold text-white">{error || "Não encontrado"}</h1>
        <button 
          onClick={() => router.back()}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Voltar</span>
        </button>
      </div>
    );
  }

  const isActive = data.funcionando?.toUpperCase() === "ATIVADO";
  
  // Calculate health score (100 - sum of recent penalties points)
  const totalPenaltyPoints = data.penalidades.reduce((acc, curr) => acc + curr.pontos, 0);
  const healthScore = Math.max(0, 100 - totalPenaltyPoints);
  
  let scoreColor = "text-success";
  if (healthScore < 70) scoreColor = "text-warning";
  if (healthScore < 40) scoreColor = "text-destructive";

  return (
    <div className="space-y-6 pb-12">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0C101B]/40 p-6 rounded-2xl border border-border">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => router.back()}
            className="p-2 bg-[#0C101B] border border-border rounded-full hover:bg-slate-800 transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 text-slate-400" />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              {data.nome_ponto}
            </h1>
            <p className="text-muted-foreground flex items-center space-x-2 text-sm mt-1">
              <span className="font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-300">{data.md_codigo}</span>
              <span>•</span>
              <span>{data.regional}</span>
              {data.divisao && (
                <>
                  <span>•</span>
                  <span>{data.divisao}</span>
                </>
              )}
            </p>
          </div>
        </div>
        
        <div className="flex space-x-3">
          <div className={`px-4 py-2 rounded-full flex items-center space-x-2 font-medium border ${isActive ? 'bg-success/10 text-success border-success/20' : 'bg-destructive/10 text-destructive border-destructive/20'}`}>
            {isActive ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            <span>{data.funcionando || "DESCONHECIDO"}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Profile & Health */}
        <div className="space-y-6">
          
          {/* Profile Card */}
          <div className="glass-panel p-6 rounded-2xl border border-border">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center">
              <MapPin className="w-5 h-5 mr-2 text-blue-500" />
              Perfil do Ponto
            </h2>
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <MapPin className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-white">Endereço</p>
                  <p className="text-sm text-slate-400">{data.endereco}</p>
                  <p className="text-sm text-slate-400">{data.cidade} - {data.estado}, CEP {data.cep}</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Clock className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-white">Horário de Funcionamento</p>
                  <p className="text-sm text-slate-400">{data.horario_trabalho || "Não informado"}</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Building className="w-5 h-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-white">Regional / Divisão</p>
                  <p className="text-sm text-slate-400">{data.regional} {data.divisao ? `/ ${data.divisao}` : ''}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Health Score */}
          <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col items-center justify-center py-8">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Health Score</h2>
            <div className="relative flex items-center justify-center">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle cx="64" cy="64" r="56" fill="transparent" stroke="#1e293b" strokeWidth="12" />
                <circle 
                  cx="64" cy="64" r="56" fill="transparent" 
                  stroke={healthScore >= 70 ? "#10b981" : healthScore >= 40 ? "#f59e0b" : "#ef4444"} 
                  strokeWidth="12" 
                  strokeDasharray={351.8} 
                  strokeDashoffset={351.8 - (351.8 * healthScore) / 100}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className={`text-4xl font-bold ${scoreColor}`}>{healthScore}</span>
                <span className="text-xs text-slate-500">/ 100</span>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-400 text-center px-4">
              {healthScore >= 70 ? "Ponto saudável e com poucas infrações recentes." : 
               healthScore >= 40 ? "Atenção: Ponto apresenta histórico recente de penalidades." : 
               "Crítico: Ponto com graves problemas de qualidade."}
            </p>
          </div>

          {/* Key Metrics Mini Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-panel p-4 rounded-2xl border border-border">
              <p className="text-sm text-slate-400 mb-1">Taxa de Coleta</p>
              <div className="flex items-end space-x-2">
                <span className="text-2xl font-bold text-white">
                  {data.taxa_coleta_atual ? (data.taxa_coleta_atual * 100).toFixed(1) : 0}%
                </span>
                <TrendingUp className="w-4 h-4 text-emerald-400 mb-1" />
              </div>
            </div>
            <div className="glass-panel p-4 rounded-2xl border border-border">
              <p className="text-sm text-slate-400 mb-1">Volume Diário</p>
              <div className="flex items-end space-x-2">
                <span className="text-2xl font-bold text-white">{data.volume_total_atual || 0}</span>
                <Package className="w-4 h-4 text-blue-400 mb-1" />
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Charts, Map and Tables */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Main Chart */}
          <div className="glass-panel p-6 rounded-2xl border border-border">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
              <h2 className="text-lg font-bold text-white flex items-center">
                <Activity className="w-5 h-5 mr-2 text-blue-500" />
                Evolução de Volume
              </h2>
              
              <div className="flex gap-2 items-center bg-[#0C101B] p-1.5 rounded-xl border border-border">
                <Filter className="w-4 h-4 text-muted-foreground ml-2" />
                <select 
                  value={agrupamento} 
                  onChange={(e) => setAgrupamento(e.target.value)}
                  className="bg-transparent text-blue-400 font-semibold text-xs rounded-lg px-2 py-1 outline-none cursor-pointer"
                >
                  <option className="bg-[#0f172a] text-blue-400" value="DIA">Ver por Dia</option>
                  <option className="bg-[#0f172a] text-blue-400" value="SEMANA">Ver por Semana</option>
                  <option className="bg-[#0f172a] text-blue-400" value="MES">Ver por Mês</option>
                </select>
                <div className="w-px h-4 bg-border mx-1"></div>
                <select 
                  value={selectedMes} 
                  onChange={(e) => setSelectedMes(e.target.value)}
                  className="bg-transparent text-slate-300 text-xs rounded-lg px-2 py-1 outline-none cursor-pointer"
                >
                  <option className="bg-[#0f172a] text-slate-300" value="ALL">Todos os Meses</option>
                  {mesesOptions.map(m => <option className="bg-[#0f172a] text-slate-300" key={m} value={m}>{getNomeMes(m)}</option>)}
                </select>
              </div>
            </div>
            <div className="h-[300px] w-full">
              {processedData && processedData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={processedData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                    <XAxis 
                      dataKey="dia_base" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      tickFormatter={(val) => {
                        const parts = val.split('-');
                        if(parts.length === 3) return `${parts[2]}/${parts[1]}`;
                        if(parts.length === 2 && val.includes('W')) return `Sem ${parts[1].replace('W','')} (${parts[0]})`;
                        if(parts.length === 2) return getNomeMes(val);
                        return val;
                      }}
                    />
                    <YAxis 
                      yAxisId="left"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      tickFormatter={(val) => `${(val * 100).toFixed(0)}%`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b', color: '#f8fafc' }}
                      formatter={(value: any, name: any) => {
                        if (name === "Taxa de Coleta") return [`${(value * 100).toFixed(1)}%`, name];
                        return [value, name];
                      }}
                    />
                    <Legend iconType="circle" />
                    <Line yAxisId="left" type="monotone" name="Total (Sacos)" dataKey="total" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                    <Line yAxisId="left" type="monotone" name="Backlog" dataKey="backlog" stroke="#ef4444" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" name="Taxa de Coleta" dataKey="taxa_coleta" stroke="#10b981" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-slate-500">
                  Sem dados históricos disponíveis para o filtro.
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Map Section */}
            <div className="glass-panel p-1 rounded-2xl border border-border h-[350px]">
              <MDMap 
                latitude={data.latitude} 
                longitude={data.longitude} 
                nome={data.nome_ponto} 
                codigo={data.md_codigo} 
              />
            </div>

            {/* Penalties & Events */}
            <div className="glass-panel p-6 rounded-2xl border border-border overflow-hidden flex flex-col h-[350px]">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center">
                <AlertCircle className="w-5 h-5 mr-2 text-warning" />
                Últimas Ocorrências
              </h2>
              <div className="overflow-y-auto flex-1 pr-2 space-y-4">
                {data.penalidades.length === 0 && data.ocorrencias.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center mt-10">Nenhuma ocorrência registrada.</p>
                ) : (
                  <>
                    {data.penalidades.map((p, i) => (
                      <div key={`pen-${i}`} className="p-3 border border-destructive/20 bg-destructive/10 rounded-xl">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-semibold text-destructive bg-destructive/20 px-2 py-0.5 rounded">Penalidade ({p.pontos} pts)</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">{p.data_penalidade}</span>
                            {isMaster && p.id && (
                              <button 
                                onClick={() => handleDeletePenalty(p.id)}
                                className="text-slate-500 hover:text-red-500 transition cursor-pointer"
                                title="Excluir Penalidade"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-slate-300 mt-2">{p.motivo}</p>
                      </div>
                    ))}
                    {data.ocorrencias.map((o, i) => (
                      <div key={`oco-${i}`} className="p-3 border border-warning/20 bg-warning/10 rounded-xl">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-xs font-semibold text-warning bg-warning/20 px-2 py-0.5 rounded">Ocorrência</span>
                          <span className="text-xs text-slate-500">{o.data_registro}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-200 mt-2">{o.motivo}</p>
                        {o.observacao && <p className="text-xs text-slate-400 mt-1">{o.observacao}</p>}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

          </div>

          {/* Backlog Table */}
          <div className="glass-panel rounded-2xl border border-border overflow-hidden">
            <div className="p-6 border-b border-border bg-[#0C101B]/40">
              <h2 className="text-lg font-bold text-white flex items-center">
                <Package className="w-5 h-5 mr-2 text-destructive" />
                Backlog Parado Atualmente ({data.backlog_pendente.length})
              </h2>
            </div>
            <div className="overflow-x-auto max-h-[300px]">
              {data.backlog_pendente.length > 0 ? (
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-400 bg-[#0C101B]/60 sticky top-0">
                    <tr>
                      <th className="px-6 py-3 font-medium">Código de Barras</th>
                      <th className="px-6 py-3 font-medium">Status Atual</th>
                      <th className="px-6 py-3 font-medium">Dias Parado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {data.backlog_pendente.map((b, i) => (
                      <tr key={i} className="hover:bg-slate-800/30 transition">
                        <td className="px-6 py-4 font-mono text-slate-300">{b.codigo_barras}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-xs border border-border">{b.status}</span>
                        </td>
                        <td className="px-6 py-4">
                          {b.dias_parado > 3 ? (
                            <span className="text-destructive font-bold">{b.dias_parado} dias</span>
                          ) : (
                            <span className="text-slate-400">{b.dias_parado} dias</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center text-slate-500">
                  Não há backlog registrado neste ponto no momento.
                </div>
              )}
            </div>
          </div>
          
          {/* Admin Control Panel */}
          {isMaster && (
            <div className="glass-panel rounded-2xl border border-border overflow-hidden mt-6">
              <div className="p-6 border-b border-border bg-[#0C101B]/40">
                <h2 className="text-lg font-bold text-white flex items-center">
                  <ShieldAlert className="w-5 h-5 mr-2 text-indigo-400" />
                  Painel de Controle Operacional
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Gerencie penalidades e alertas de monitoramento para este ponto. (Apenas Admin)
                </p>
              </div>
              
              <div className="p-6">
                {message && (
                  <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                    <p className="text-sm font-medium">{message.text}</p>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Form Penalidade */}
                  <form onSubmit={handleAddPenalty} className="space-y-4">
                    <h3 className="text-md font-semibold text-slate-200">Adicionar Penalidade</h3>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Motivo / Infração</label>
                      <input 
                        type="text" 
                        required
                        value={formPenalty.motivo}
                        onChange={e => setFormPenalty({...formPenalty, motivo: e.target.value})}
                        className="w-full bg-[#0C101B] border border-border text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-blue-500"
                        placeholder="Ex: Ponto fechado no horário comercial"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Pontos a deduzir</label>
                      <input 
                        type="number" 
                        required
                        min={1}
                        max={100}
                        value={formPenalty.pontos}
                        onChange={e => setFormPenalty({...formPenalty, pontos: parseInt(e.target.value) || 0})}
                        className="w-full bg-[#0C101B] border border-border text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-blue-500"
                      />
                    </div>
                    <button 
                      disabled={actionLoading}
                      type="submit"
                      className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition disabled:opacity-50 cursor-pointer"
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                      <span>Registrar Penalidade</span>
                    </button>
                  </form>
                  
                  {/* Form Alerta */}
                  <form onSubmit={handleAddAlert} className="space-y-4">
                    <h3 className="text-md font-semibold text-slate-200">Fixar Alerta Permanente</h3>
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Observação do Alerta</label>
                      <textarea 
                        required
                        rows={4}
                        value={formAlert.observacao}
                        onChange={e => setFormAlert({...formAlert, observacao: e.target.value})}
                        className="w-full bg-[#0C101B] border border-border text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-amber-500 resize-none"
                        placeholder="Ex: Monitorar este ponto de perto pois..."
                      />
                    </div>
                    <button 
                      disabled={actionLoading}
                      type="submit"
                      className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition disabled:opacity-50 cursor-pointer"
                    >
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                      <span>Fixar Alerta</span>
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
