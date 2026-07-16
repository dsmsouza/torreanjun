"use client";

import React, { useState, useEffect } from "react";
import { Map as MapIcon, Upload, Loader2, Filter } from "lucide-react";
import dynamic from "next/dynamic";

// Dynamic import with SSR disabled for Leaflet
const LeafletMap = dynamic(() => import("../../components/LeafletMap"), { ssr: false });

import { API_URL } from "../../lib/api";

export default function MapPage() {
  const [points, setPoints] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  // Filters
  const [selectedEstado, setSelectedEstado] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const loadPoints = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/map/points`);
      const data = await res.json();
      setPoints(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPoints();
  }, []);

  const handleProcessar = async () => {
    setProcessing(true);
    try {
      const res = await fetch(`${API_URL}/api/map/processar`, {
        method: "POST"
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Erro desconhecido");
      }
      const data = await res.json();
      alert(`Importados ${data.rows_imported} pontos com sucesso!`);
      loadPoints();
    } catch (e: any) {
      alert(`Erro ao processar planilha: ${e.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleUpdateObservacao = async (id: number, observacao: string) => {
    try {
      await fetch(`${API_URL}/api/map/points/${id}/observacao`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observacao })
      });
      setPoints(points.map(p => p.id === id ? { ...p, observacao } : p));
    } catch (e) {
      console.error("Erro ao atualizar observacao", e);
    }
  };

  const filteredPoints = points.filter(p => {
    if (selectedEstado !== "ALL" && p.estado !== selectedEstado) return false;
    if (selectedStatus !== "ALL" && p.status !== selectedStatus) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const nome = String(p.nome || "").toLowerCase();
      const iata = String(p.iata || "").toLowerCase();
      const cidade = String(p.cidade || "").toLowerCase();
      const cep = String(p.cep || "").toLowerCase();
      const endereco = String(p.endereco || "").toLowerCase();
      const provedor = String(p.provedor || "").toLowerCase();
      
      if (!nome.includes(q) && 
          !iata.includes(q) && 
          !cidade.includes(q) && 
          !cep.includes(q) &&
          !endereco.includes(q) &&
          !provedor.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const estados = Array.from(new Set(points.map(p => p.estado).filter(Boolean))).sort();
  const statuses = Array.from(new Set(points.map(p => p.status).filter(Boolean))).sort();

  return (
    <main className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto pb-24 h-screen flex flex-col">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <MapIcon className="w-7 h-7 text-primary" />
            MAPA DA MALHA
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visualização geográfica de todos os pontos da rede ANJUN.
          </p>
        </div>

        {/* Upload Action */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleProcessar}
            disabled={processing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50 text-sm font-semibold"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Processar C:\ANJUN\mapa
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel p-4 rounded-xl border border-border flex flex-wrap gap-4 items-center flex-shrink-0">
        <Filter className="w-5 h-5 text-muted-foreground" />
        <span className="text-sm font-semibold text-white">Filtros:</span>
        
        <select 
          value={selectedEstado} 
          onChange={(e) => setSelectedEstado(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-primary"
        >
          <option value="ALL">Todos os Estados</option>
          {estados.map(est => <option key={est as string} value={est as string}>{est as string}</option>)}
        </select>

        <select 
          value={selectedStatus} 
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="bg-[#0f172a] border border-slate-700 text-white text-sm rounded-lg px-3 py-2 outline-none"
        >
          <option value="ALL">Todos os Status</option>
          {statuses.map(s => <option key={s as string} value={s as string}>{s as string}</option>)}
        </select>
        
        {/* Campo de Busca */}
        <input 
          type="text"
          placeholder="Buscar por Nome, Cidade ou CEP..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-[#0f172a] border border-slate-700 text-white text-sm rounded-lg px-4 py-2 outline-none w-full md:w-[250px] placeholder:text-slate-500"
        />

        <span className="ml-auto text-xs text-muted-foreground">
          Mostrando {filteredPoints.length} pontos
        </span>
      </div>

      {/* Map Area */}
      <div className="flex-grow rounded-2xl overflow-hidden border border-border bg-[#0a0d14] relative z-0">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : (
          <LeafletMap points={filteredPoints} onUpdateObservacao={handleUpdateObservacao} />
        )}
      </div>
    </main>
  );
}
