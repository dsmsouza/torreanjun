"use client";

import React, { useEffect, useState } from "react";
import { Clock, Search, Loader2, ArrowUpDown, Filter, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useAuth } from "../../hooks/use-auth";

import { API_URL } from "../../lib/api";

export default function PacotesAbertoPage() {
  const { role, activeRegional } = useAuth();
  
  const [pacotes, setPacotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRegional, setSelectedRegional] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [selectedMD, setSelectedMD] = useState("ALL");
  
  const loadPacotes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/sla/abertos`);
      const data = await res.json();
      setPacotes(data.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPacotes();
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_URL}/api/sla/importar_abertos`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      alert(`Importados com sucesso!`);
      loadPacotes();
    } catch (e) {
      alert("Erro ao importar planilha");
    } finally {
      setUploading(false);
    }
  };

  const filtered = pacotes.filter(p => {
    if (searchQuery && !p.barcode?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (selectedRegional !== "ALL" && p.regional !== selectedRegional) return false;
    if (selectedStatus !== "ALL" && p.status !== selectedStatus) return false;
    if (selectedMD !== "ALL" && p.md !== selectedMD) return false;
    
    // Auth filter
    if (role === "Regional" && activeRegional !== "ALL" && p.regional !== activeRegional) return false;
    
    return true;
  });

  const regionais = Array.from(new Set(pacotes.map(p => p.regional).filter(Boolean))).sort();
  const statuses = Array.from(new Set(pacotes.map(p => p.status).filter(Boolean))).sort();
  const mds = Array.from(new Set(filtered.map(p => p.md).filter(Boolean))).sort();

  return (
    <main className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto pb-24">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Clock className="w-7 h-7 text-amber-500" />
            Pacotes em Aberto
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitoramento de pacotes parados no MD (Saco selado/coletado vs Foi assinado).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
            className="text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/20 file:text-primary hover:file:bg-primary/30"
          />
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50 text-sm font-semibold"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Importar Planilha"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel p-4 rounded-xl border border-border flex flex-wrap gap-4 items-center">
        <Filter className="w-5 h-5 text-muted-foreground" />
        
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Buscar por Barcode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#0C101B]/40 border border-border rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none"
          />
        </div>

        <select 
          value={selectedRegional} 
          onChange={(e) => setSelectedRegional(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 outline-none"
          disabled={role === "Regional" && activeRegional !== "ALL"}
        >
          <option value="ALL">Todas as Regionais</option>
          {regionais.map(r => <option key={r as string} value={r as string}>{r as string}</option>)}
        </select>

        <select 
          value={selectedStatus} 
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 outline-none"
        >
          <option value="ALL">Todos os Status</option>
          {statuses.map(s => <option key={s as string} value={s as string}>{s as string}</option>)}
        </select>
        
        <select 
          value={selectedMD} 
          onChange={(e) => setSelectedMD(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 outline-none max-w-[200px]"
        >
          <option value="ALL">Todos os MDs</option>
          {mds.map(m => <option key={m as string} value={m as string}>{m as string}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : (
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-[#131926] text-slate-400 uppercase text-xs">
                <tr>
                  <th className="px-6 py-4">Barcode</th>
                  <th className="px-6 py-4">Regional</th>
                  <th className="px-6 py-4">MD / Ponto</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Data/Hora (Coleta/Status)</th>
                  <th className="px-6 py-4 text-amber-400">Aging (Dias Parados)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-800/50">
                    <td className="px-6 py-4 font-medium text-white">{p.barcode}</td>
                    <td className="px-6 py-4">{p.regional}</td>
                    <td className="px-6 py-4">{p.md}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs ${
                        p.status.toLowerCase().includes('assinado') ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">{p.data_hora}</td>
                    <td className="px-6 py-4 font-bold text-rose-400">
                      {p.dias_parados !== null ? `${p.dias_parados} dias` : "N/A"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
