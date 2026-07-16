"use client";

import React, { useState, useEffect } from "react";
import { Package, Upload, Loader2, Download, MapPin } from "lucide-react";
import * as XLSX from "xlsx";

import { API_URL } from "../../lib/api";

export default function MisscanPage() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 1. Load saved results from sessionStorage after mounting
  useEffect(() => {
    const savedResults = sessionStorage.getItem("misscan_results");
    if (savedResults) {
      try {
        setResults(JSON.parse(savedResults));
      } catch (e) {
        console.error("Error parsing saved misscan results:", e);
      }
    }
  }, []);

  // 2. Persist results on changes
  useEffect(() => {
    if (results && results.length > 0) {
      sessionStorage.setItem("misscan_results", JSON.stringify(results));
    } else {
      sessionStorage.removeItem("misscan_results");
    }
  }, [results]);

  const handleProcessar = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/misscan/analyze`, {
        method: "POST"
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Erro ao analisar");
      }
      const data = await res.json();
      setResults(data.data || []);
      alert("Planilha processada com sucesso da pasta C:\\ANJUN\\misscan!");
    } catch (e: any) {
      alert(`Erro: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (results.length === 0) return;
    try {
      // Map to friendly Portuguese column headers for Excel
      const formattedResults = results.map(r => ({
        "Código / Tracking": r.codigo,
        "Estado": r.estado,
        "Cidade": r.cidade,
        "CEP": r.cep,
        "MD Sugerido": r.md_sugerido,
        "Status MD": r.md_status || "N/A"
      }));

      const ws = XLSX.utils.json_to_sheet(formattedResults);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Misscan");
      
      // Generate XLSX binary data array
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      
      // Create a blob and trigger browser download
      const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resultado_misscan.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(`Erro ao exportar planilha: ${e.message || e}`);
    }
  };

  return (
    <main className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package className="w-7 h-7 text-primary" />
            MISSCAN
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inteligência de cruzamento: encontre o Minidrop provável de pacotes sem origem registrada.
          </p>
        </div>
        
      </div>

      {/* Upload Box */}
      <div className="glass-panel p-6 rounded-2xl border border-border">
        <h3 className="text-md font-bold text-white mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5 text-blue-400" />
          Analisar Planilha do Cliente
        </h3>
        
        <div className="flex flex-col md:flex-row gap-4">
          <button
            onClick={handleProcessar}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 text-sm font-semibold transition-all shadow-lg shadow-blue-500/20"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            Processar C:\ANJUN\misscan
          </button>
          
          <button
            onClick={handleDownload}
            disabled={results.length === 0}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 text-sm font-semibold transition-all shadow-lg shadow-emerald-500/20"
          >
            <Download className="w-5 h-5" />
            Exportar Resultados
          </button>
        </div>
      </div>

      {/* Results Table */}
      {results.length > 0 && (
        <div className="glass-panel rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-[#131926] text-slate-400 uppercase text-xs">
                <tr>
                  <th className="px-6 py-4">Código / Tracking</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4">Cidade</th>
                  <th className="px-6 py-4">CEP</th>
                  <th className="px-6 py-4 text-amber-400 flex items-center gap-1">
                    <MapPin className="w-4 h-4" /> MD Sugerido
                  </th>
                  <th className="px-6 py-4">Status MD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-800/50">
                    <td className="px-6 py-4 font-medium text-white">{r.codigo}</td>
                    <td className="px-6 py-4">{r.estado}</td>
                    <td className="px-6 py-4">{r.cidade}</td>
                    <td className="px-6 py-4">{r.cep}</td>
                    <td className="px-6 py-4 font-bold text-emerald-400">{r.md_sugerido}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        r.md_status === "Ativo" 
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                          : "bg-red-500/10 text-red-400 border border-red-500/20"
                      }`}>
                        {r.md_status || "N/A"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
