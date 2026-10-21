"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, MapPin, ArrowRight } from "lucide-react";

export default function PontoSearchPage() {
  const [mdCode, setMdCode] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (mdCode.trim()) {
      router.push(`/ponto/${mdCode.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
      <div className="w-full max-w-lg glass-panel p-8 md:p-12 rounded-3xl border border-border bg-[#0C101B]/40 shadow-2xl relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/10 blur-[80px]" />
        
        <div className="relative z-10 flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center">
            <MapPin className="w-8 h-8 text-blue-400" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-white tracking-tight">Consultar Ponto</h1>
            <p className="text-slate-400">
              Digite o código IATA ou identificador do MD para abrir o Dashboard 360º.
            </p>
          </div>

          <form onSubmit={handleSearch} className="w-full mt-4">
            <div className="relative flex items-center">
              <div className="absolute left-4 text-slate-500">
                <Search className="w-5 h-5" />
              </div>
              <input
                type="text"
                placeholder="Ex: MD-SP-01, JGS..."
                value={mdCode}
                onChange={(e) => setMdCode(e.target.value)}
                className="w-full pl-12 pr-16 py-4 bg-[#090D16] border border-slate-700/50 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-medium text-lg uppercase"
                autoFocus
              />
              <button
                type="submit"
                disabled={!mdCode.trim()}
                className="absolute right-2 p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </form>

          <div className="pt-8 flex flex-col items-center space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Acessos Recentes Sugeridos</p>
            <div className="flex flex-wrap justify-center gap-2">
              {['VCP', 'GRU', 'JGS'].map((md) => (
                <button
                  key={md}
                  type="button"
                  onClick={() => router.push(`/ponto/${md}`)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-lg transition-colors"
                >
                  {md}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
