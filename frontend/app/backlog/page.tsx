"use client";

import React, { useEffect, useState } from "react";
import { PackageSearch, Loader2, Filter, Search, Info } from "lucide-react";
import { useAuth } from "../../hooks/use-auth";
import { API_URL } from "../../lib/api";

interface BacklogItem {
  codigo_barras: string;
  status: string;
  dias_parado: number;
  data_bipagem: string;
  md: string;
  regional: string;
  cidade: string;
}

export default function BacklogPage() {
  const { role, activeRegional } = useAuth();
  
  const [backlog, setBacklog] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedRegional, setSelectedRegional] = useState("ALL");
  const [searchMD, setSearchMD] = useState("");
  const [selectedData, setSelectedData] = useState(""); // Filtro simples de data

  useEffect(() => {
    const fetchBacklog = async () => {
      try {
        const res = await fetch(`${API_URL}/api/backlog/geral`);
        const data = await res.json();
        setBacklog(data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchBacklog();
  }, []);

  // Obter lista única de regionais
  const regionais = Array.from(new Set(backlog.map(b => b.regional).filter(Boolean))).sort();

  // Filter data
  const filtered = backlog.filter(b => {
    if (selectedRegional !== "ALL" && b.regional !== selectedRegional) return false;
    if (role === "Regional" && activeRegional !== "ALL" && b.regional !== activeRegional) return false;
    if (searchMD && !b.md.toLowerCase().includes(searchMD.toLowerCase())) return false;
    if (selectedData && b.data_bipagem && !b.data_bipagem.startsWith(selectedData)) return false;
    return true;
  });

  // Group data
  const groupedData = React.useMemo(() => {
    const groups: Record<string, any> = {};
    filtered.forEach(b => {
      const dataBipagem = b.data_bipagem ? b.data_bipagem.split(' ')[0] : 'N/A';
      const key = `${b.md}_${dataBipagem}`;
      
      if (!groups[key]) {
        groups[key] = {
          md: b.md,
          regional: b.regional,
          cidade: b.cidade,
          data_bipagem: dataBipagem,
          dias_parado: b.dias_parado,
          quantidade: 0,
          codigos_barras: [],
          status_set: new Set()
        };
      }
      
      groups[key].quantidade += 1;
      groups[key].codigos_barras.push(b.codigo_barras);
      groups[key].status_set.add(b.status);
      
      // If any dias_parado is larger, take it
      if (b.dias_parado > groups[key].dias_parado) {
        groups[key].dias_parado = b.dias_parado;
      }
    });
    
    return Object.values(groups).map(g => {
      const statusArr = Array.from(g.status_set);
      return {
        ...g,
        status: statusArr.length > 1 ? "Vários Status" : statusArr[0]
      };
    }).sort((a: any, b: any) => b.dias_parado - a.dias_parado);
  }, [filtered]);

  return (
    <div className="p-8 pb-32 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1400px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <PackageSearch className="w-8 h-8 text-primary" />
            Backlog Parado Atualmente
          </h1>
          <p className="text-slate-400 mt-2">Visão geral de todos os pacotes retidos na operação.</p>
        </div>
      </div>

      <div className="glass-panel p-6 rounded-2xl border border-border mb-8">
        <div className="flex flex-wrap items-end gap-6">
          {(role === "Master" || role === "Guest" || activeRegional === "ALL") && (
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-2">
                <Filter className="w-3 h-3" />
                Regional
              </label>
              <select
                value={selectedRegional}
                onChange={(e) => setSelectedRegional(e.target.value)}
                className="w-full bg-[#0C101B]/60 border border-border rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
              >
                <option value="ALL">Todas as Regionais</option>
                {regionais.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          )}
          
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-2">
              <Search className="w-3 h-3" />
              Buscar MD
            </label>
            <input
              type="text"
              placeholder="Digite o código do MD..."
              value={searchMD}
              onChange={(e) => setSearchMD(e.target.value)}
              className="w-full bg-[#0C101B]/60 border border-border rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-slate-600"
            />
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-2">
              <Filter className="w-3 h-3" />
              Data (Opcional)
            </label>
            <input
              type="date"
              value={selectedData}
              onChange={(e) => setSelectedData(e.target.value)}
              className="w-full bg-[#0C101B]/60 border border-border rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 glass-panel rounded-2xl border border-border">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <div className="glass-panel rounded-2xl border border-border overflow-hidden">
          <div className="p-6 border-b border-border bg-[#0C101B]/40 flex justify-between items-center">
            <h2 className="text-lg font-bold text-white flex items-center">
              <PackageSearch className="w-5 h-5 mr-2 text-destructive" />
              Total de Pacotes Pendentes ({filtered.length})
            </h2>
          </div>
          <div className="overflow-x-auto max-h-[600px]">
            {groupedData.length > 0 ? (
              <table className="w-full text-sm text-left relative">
                <thead className="text-xs text-slate-400 bg-[#0C101B] sticky top-0 z-10 shadow-md">
                  <tr>
                    <th className="px-6 py-4 font-medium">Regional</th>
                    <th className="px-6 py-4 font-medium">MD</th>
                    <th className="px-6 py-4 font-medium">Cidade</th>
                    <th className="px-6 py-4 font-medium">Pacotes Retidos</th>
                    <th className="px-6 py-4 font-medium">Status Atual</th>
                    <th className="px-6 py-4 font-medium">Data Bipagem</th>
                    <th className="px-6 py-4 font-medium">Dias Parado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {groupedData.map((g: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-800/30 transition group">
                      <td className="px-6 py-4 font-medium text-slate-200">{g.regional}</td>
                      <td className="px-6 py-4 font-mono text-primary">{g.md}</td>
                      <td className="px-6 py-4 text-slate-300">{g.cidade}</td>
                      <td className="px-6 py-4 font-mono text-slate-300">
                        <div className="flex items-center gap-2 group/tooltip relative">
                          <span className="font-bold text-white bg-slate-800 px-2 py-1 rounded">{g.quantidade} pacotes</span>
                          <Info className="w-4 h-4 text-slate-400 cursor-help hover:text-white transition-colors" />
                          
                          {/* Tooltip */}
                          <div className="absolute left-0 bottom-full mb-2 w-64 max-h-48 overflow-y-auto bg-slate-800 border border-slate-600 shadow-xl rounded-xl p-3 text-xs text-slate-300 opacity-0 group-hover/tooltip:opacity-100 pointer-events-none group-hover/tooltip:pointer-events-auto transition-opacity z-50">
                            <div className="font-bold text-white mb-2 pb-2 border-b border-slate-700">Códigos de Barras</div>
                            <div className="space-y-1">
                              {g.codigos_barras.map((cb: string, idx: number) => (
                                <div key={idx} className="font-mono bg-slate-900 px-2 py-1 rounded">{cb}</div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-xs border border-border whitespace-nowrap">{g.status}</span>
                      </td>
                      <td className="px-6 py-4 text-slate-300">{g.data_bipagem}</td>
                      <td className="px-6 py-4">
                        {g.dias_parado > 3 ? (
                          <span className="text-destructive font-bold">{g.dias_parado} dias</span>
                        ) : (
                          <span className="text-slate-400">{g.dias_parado} dias</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-12 text-center text-slate-500 flex flex-col items-center">
                <PackageSearch className="w-12 h-12 mb-4 text-slate-700" />
                <p>Nenhum pacote encontrado com os filtros selecionados.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
