"use client";

import React, { useEffect, useState, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import { 
  Route, 
  Truck, 
  User, 
  MapPin, 
  Calendar, 
  Upload, 
  AlertTriangle, 
  CheckCircle, 
  Package, 
  Sparkles,
  RefreshCw,
  Clock,
  Layers,
  ChevronRight
} from "lucide-react";

export default function RotasSPPage() {
  const [dataOperacao, setDataOperacao] = useState<string>(
    new Date().toISOString().split("T")[0] // YYYY-MM-DD
  );

  const [loading, setLoading] = useState<boolean>(true);
  
  const [dados, setDados] = useState<any>(null);

  // Sorting state for Motoristas table
  const [sortKey, setSortKey] = useState<string>("volume_bipado");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Sorting state for MDs sem motorista table
  const [sortSemKey, setSortSemKey] = useState<string>("volume_total");
  const [sortSemDir, setSortSemDir] = useState<"asc" | "desc">("desc");

  const fetchData = async () => {
    setLoading(true);
    try {
      const parts = dataOperacao.split("-");
      const dtFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;
      
      const res = await fetch(`http://localhost:8000/api/rotas/dashboard?data=${dtFormatted}`);
      const json = await res.json();
      setDados(json);
    } catch (e) {
      console.error("Erro ao carregar Rotas SP:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dataOperacao]);

  

  // Sort helper function
  const sortData = (items: any[], key: string, dir: "asc" | "desc") => {
    if (!items || !Array.isArray(items)) return [];
    return [...items].sort((a, b) => {
      let valA = a[key];
      let valB = b[key];

      if (typeof valA === "string") valA = (valA || "").toLowerCase();
      if (typeof valB === "string") valB = (valB || "").toLowerCase();

      if (valA < valB) return dir === "asc" ? -1 : 1;
      if (valA > valB) return dir === "asc" ? 1 : -1;
      return 0;
    });
  };

  const handleMotoristaSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const handleSemSort = (key: string) => {
    if (sortSemKey === key) {
      setSortSemDir(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortSemKey(key);
      setSortSemDir("desc");
    }
  };

  const sortedMotoristas = useMemo(() => sortData(dados?.motoristas || [], sortKey, sortDir), [dados?.motoristas, sortKey, sortDir]);
  const sortedMdsSemMotorista = useMemo(() => sortData(dados?.mds_sem_motorista || [], sortSemKey, sortSemDir), [dados?.mds_sem_motorista, sortSemKey, sortSemDir]);

  const renderSortableHeader = (label: string, colKey: string, currentKey: string, currentDir: "asc" | "desc", onSort: (key: string) => void, align: "left" | "right" | "center" = "left") => (
    <th 
      onClick={() => onSort(colKey)} 
      className={`py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors text-${align}`}
    >
      <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
        <span>{label}</span>
        <span className="text-[10px] font-bold text-emerald-400">
          {currentKey === colKey ? (currentDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </div>
    </th>
  );

  return (
    <div className="flex h-screen bg-[#07090E] text-slate-100 font-sans overflow-hidden">
      <Sidebar />

      <main className="flex-1 ml-16 md:ml-64 overflow-y-auto p-4 md:p-8 space-y-6">
        {/* Header Title */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/50 pb-5">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 mb-1">
              <Route className="w-5 h-5" />
              <span className="text-sm font-semibold tracking-wider uppercase">Logística & Otimização de Frota</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Inteligência de Rotas SP & Motoristas
            </h1>
            <p className="text-slate-400 mt-1 max-w-3xl text-sm">
              Gestão de escalas de coleta dos motoristas em São Paulo, acompanhamento de capacidade dos veículos e cruzamento com o volume real dos MDs.
            </p>
          </div>

          {/* Control Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-[#0C101B] p-2 rounded-xl border border-border/60 shadow-lg">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-400">Data:</span>
              <input
                type="date"
                value={dataOperacao}
                onChange={(e) => setDataOperacao(e.target.value)}
                className="px-3 py-1.5 bg-[#131926] border border-border/60 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500/50 font-mono"
              />
            </div>

            
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-20">
            <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
          </div>
        ) : dados ? (
          <>
            {/* KPIs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Motoristas Escalados */}
              <div className="bg-[#0C101B] p-5 rounded-2xl border border-border/60 shadow-lg flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Motoristas Escalados</span>
                  <User className="w-5 h-5 text-emerald-400 opacity-80" />
                </div>
                <div>
                  <span className="text-2xl font-black text-white">{dados.summary?.total_motoristas || 0}</span>
                  <p className="text-[11px] text-slate-400 mt-1">Motoristas ativos em SP</p>
                </div>
              </div>

              {/* MDs Atribuídos */}
              <div className="bg-[#0C101B] p-5 rounded-2xl border border-border/60 border-l-4 border-l-blue-500 shadow-lg flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">MDs Atribuídos</span>
                  <MapPin className="w-5 h-5 text-blue-400 opacity-80" />
                </div>
                <div>
                  <span className="text-2xl font-black text-white">{dados.summary?.total_mds_escalados || 0}</span>
                  <p className="text-[11px] text-slate-400 mt-1">Pontos de coleta na rota</p>
                </div>
              </div>

              {/* Total Paradas */}
              <div className="bg-[#0C101B] p-5 rounded-2xl border border-border/60 border-l-4 border-l-purple-500 shadow-lg flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total de Paradas</span>
                  <Truck className="w-5 h-5 text-purple-400 opacity-80" />
                </div>
                <div>
                  <span className="text-2xl font-black text-white">{dados.summary?.total_paradas || 0}</span>
                  <p className="text-[11px] text-slate-400 mt-1">Visitas programadas no dia</p>
                </div>
              </div>

              {/* Alerta de MDs Sem Motorista */}
              <div className="bg-[#0C101B] p-5 rounded-2xl border border-border/60 border-l-4 border-l-rose-500 shadow-lg flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-rose-400 text-xs font-bold uppercase tracking-wider">MDs Sem Coleta Escalada</span>
                  <AlertTriangle className="w-5 h-5 text-rose-400 opacity-80" />
                </div>
                <div>
                  <span className="text-2xl font-black text-rose-400">{dados.summary?.mds_sem_motorista_count || 0}</span>
                  <p className="text-[11px] text-rose-400/80 mt-1">MDs em SP sem motorista atribuído</p>
                </div>
              </div>
            </div>

            {/* Section: Tabela Desempenho dos Motoristas & Ocupação de Veículos */}
            <div className="bg-[#0C101B] p-6 rounded-2xl border border-border/60 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-white text-base">Escala de Rotas dos Motoristas em SP</h3>
                </div>
                <span className="text-xs text-slate-400">
                  Clique nos cabeçalhos para ordenar (▲/▼). Total: {sortedMotoristas.length} motoristas
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/50 max-h-[400px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-[#131926] text-slate-400 uppercase tracking-wider font-semibold border-b border-border/60">
                    <tr>
                      {renderSortableHeader("Motorista / Nome", "motorista_nome", sortKey, sortDir, handleMotoristaSort)}
                      {renderSortableHeader("Placa / Veículo", "placa", sortKey, sortDir, handleMotoristaSort)}
                      {renderSortableHeader("Janela de Horário", "horario_previsto", sortKey, sortDir, handleMotoristaSort)}
                      {renderSortableHeader("Qtd MDs Escalados", "qtd_mds", sortKey, sortDir, handleMotoristaSort, "center")}
                      {renderSortableHeader("Volume Bipado Real", "volume_bipado", sortKey, sortDir, handleMotoristaSort, "right")}
                      {renderSortableHeader("Backlog nos MDs", "backlog_acumulado", sortKey, sortDir, handleMotoristaSort, "right")}
                      <th className="py-3 px-4 text-center">Ocupação Estimada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {sortedMotoristas.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          Nenhuma rota de motorista cadastrada para esta data. Suba uma planilha pelo botão acima.
                        </td>
                      </tr>
                    ) : (
                      sortedMotoristas.map((m: any, idx: number) => (
                        <tr key={idx} className="hover:bg-[#131926]/50 transition-colors">
                          <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                            <User className="w-4 h-4 text-emerald-400" />
                            <span>{m.motorista_nome}</span>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-300">
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                              {m.placa}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-300">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span>{m.horario_previsto}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-indigo-400">
                            {m.qtd_mds} MDs
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-400">
                            {m.volume_bipado.toLocaleString("pt-BR")}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-rose-400">
                            {m.backlog_acumulado.toLocaleString("pt-BR")}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex flex-col items-center">
                              <span className={`text-[11px] font-bold ${m.alerta_gargalo ? "text-rose-400" : "text-emerald-400"}`}>
                                {m.capacidade_ocupada_pct}%
                              </span>
                              <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                                <div 
                                  style={{ width: `${m.capacidade_ocupada_pct}%` }} 
                                  className={`h-full ${m.alerta_gargalo ? "bg-rose-500" : "bg-emerald-500"}`}
                                ></div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section: MDs de SP Sem Motorista Escalado (Alertas) */}
            <div className="bg-[#0C101B] p-6 rounded-2xl border border-border/60 border-l-4 border-l-rose-500 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-400" />
                  <h3 className="font-bold text-white text-base">Alerta: MDs de SP com Volume sem Motorista Atribuído</h3>
                </div>
                <span className="text-xs text-rose-300 font-semibold">
                  {sortedMdsSemMotorista.length} Pontos necessitando de escala de coleta
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/50 max-h-[300px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-[#131926] text-slate-400 uppercase tracking-wider font-semibold border-b border-border/60">
                    <tr>
                      {renderSortableHeader("Ponto / Código MD", "md", sortSemKey, sortSemDir, handleSemSort)}
                      {renderSortableHeader("Cidade", "cidade", sortSemKey, sortSemDir, handleSemSort)}
                      {renderSortableHeader("Regional", "regional", sortSemKey, sortSemDir, handleSemSort)}
                      {renderSortableHeader("Volume Bipado", "volume_total", sortSemKey, sortSemDir, handleSemSort, "right")}
                      {renderSortableHeader("Backlog Acumulado", "backlog_total", sortSemKey, sortSemDir, handleSemSort, "right")}
                      <th className="py-3 px-4 text-center">Ação Recomendada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {sortedMdsSemMotorista.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-emerald-400 font-semibold">
                          Excelente! Todos os MDs ativos de São Paulo possuem motorista atribuído na planilha.
                        </td>
                      </tr>
                    ) : (
                      sortedMdsSemMotorista.map((m: any, idx: number) => (
                        <tr key={idx} className="hover:bg-rose-500/5 transition-colors">
                          <td className="py-3 px-4 font-bold text-rose-300 flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-rose-400" />
                            <span>{m.md}</span>
                          </td>
                          <td className="py-3 px-4 text-slate-200">{m.cidade}</td>
                          <td className="py-3 px-4 text-slate-300 font-semibold">{m.regional}</td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-400">{m.volume_total.toLocaleString("pt-BR")}</td>
                          <td className="py-3 px-4 text-right font-bold text-rose-400">{m.backlog_total.toLocaleString("pt-BR")}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                              Escalar Coleta Urgentemente
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center p-20 text-slate-400">
            Nenhum dado de rotas encontrado para a data selecionada.
          </div>
        )}
      </main>
    </div>
  );
}
