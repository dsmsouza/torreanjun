"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Truck,
  MapPin,
  Calendar,
  Layers,
  Download,
  Maximize2,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Smartphone,
  Eye,
  X
} from "lucide-react";

interface VtagItem {
  tag_number: string;
  imagem_url: string | null;
  pdf_url?: string | null;
}

interface MdItem {
  md_codigo: string;
  vtags: VtagItem[];
}

interface MotoristaDetalhe {
  motorista: string;
  rota: string;
  placa: string;
  contato: string;
  suporte: string;
  mds: MdItem[];
  total_vtags: number;
  card_imagem_url?: string;
}

function MotoristaVtagContent() {
  const searchParams = useSearchParams();
  const diaParam = searchParams.get("dia") || new Date().toLocaleDateString("pt-BR");
  const motoristaParam = searchParams.get("motorista") || "";

  const [loading, setLoading] = useState(true);
  const [motoristaInfo, setMotoristaInfo] = useState<MotoristaDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selectedVtag, setSelectedVtag] = useState<string | null>(null);
  const [zoomModal, setZoomModal] = useState<{ url: string; titulo: string } | null>(null);

  useEffect(() => {
    if (!motoristaParam) {
      setErro("Nome do motorista não informado no link.");
      setLoading(false);
      return;
    }

    const carregar = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/vtags/motoristas?dia_base=${encodeURIComponent(diaParam)}&search=${encodeURIComponent(motoristaParam)}`);
        if (!res.ok) throw new Error("Não foi possível carregar as informações do motorista.");
        const data = await res.json();
        const lista = data.motoristas || [];
        const mot = lista.find(
          (m: MotoristaDetalhe) => m.motorista.trim().toUpperCase() === motoristaParam.trim().toUpperCase()
        ) || lista[0];

        if (!mot) {
          setErro(`Nenhuma VTAG encontrada para o motorista "${motoristaParam}" na data ${diaParam}.`);
        } else {
          setMotoristaInfo(mot);
        }
      } catch (err: any) {
        setErro(err.message || "Erro de conexão ao buscar VTAGs.");
      } finally {
        setLoading(false);
      }
    };

    carregar();
  }, [diaParam, motoristaParam]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 rounded-full border-4 border-cyan-500/30 border-t-cyan-400 animate-spin mb-4" />
        <h2 className="text-base font-bold text-slate-200">Carregando suas VTAGs...</h2>
        <p className="text-xs text-slate-400 mt-1">Torre de Controle Anjun Express</p>
      </div>
    );
  }

  if (erro || !motoristaInfo) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-4 text-2xl font-bold">
          ⚠️
        </div>
        <h2 className="text-lg font-bold text-slate-100">VTAGs Não Localizadas</h2>
        <p className="text-sm text-slate-400 mt-2 max-w-sm">{erro}</p>
        <div className="mt-6 text-xs text-slate-500">
          Entre em contato com o Suporte da Torre de Controle da Anjun.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 pb-16">
      {/* Barra Superior Mobile */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3.5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-black text-sm border border-cyan-500/30">
              AJ
            </div>
            <div>
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest block leading-none">
                ANJUN EXPRESS
              </span>
              <h1 className="text-sm font-black text-white leading-tight mt-0.5">
                VTAGs Oficiais de Coleta
              </h1>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-slate-900 border border-slate-700 text-slate-300">
            {diaParam}
          </span>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        {/* Cartão de Identificação do Motorista */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-cyan-500/30 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Motorista
              </span>
              <h2 className="text-lg font-black text-white tracking-tight">
                {motoristaInfo.motorista}
              </h2>
            </div>
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/80">
            <div className="p-2 rounded-xl bg-slate-950 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 block font-medium">Rota:</span>
              <span className="font-bold text-cyan-300 font-mono text-sm">
                {motoristaInfo.rota || "Padrão"}
              </span>
            </div>
            <div className="p-2 rounded-xl bg-slate-950 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 block font-medium">Placa:</span>
              <span className="font-bold text-slate-200 font-mono text-sm">
                {motoristaInfo.placa || "-"}
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20 flex items-center justify-between text-xs">
            <span className="text-cyan-300 font-medium">
              Total: <strong>{motoristaInfo.mds.length} MiniDrop(s)</strong> • <strong>{motoristaInfo.total_vtags} VTAGs</strong>
            </span>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              Liberadas
            </span>
          </div>
        </div>

        {/* Dica de Iluminação */}
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
          <Smartphone className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            <strong>Dica para o bipe:</strong> Aumente o brilho da tela do celular para o leitor ótico biper com facilidade no ponto.
          </span>
        </div>

        {/* Lista de MiniDrops e Etiquetas Individuais */}
        <div className="space-y-4">
          {motoristaInfo.mds.map((md, mdIdx) => (
            <div
              key={md.md_codigo}
              className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg"
            >
              {/* Cabeçalho do MD */}
              <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 flex items-center justify-center font-bold text-xs">
                    {mdIdx + 1}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white font-mono">
                      {md.md_codigo}
                    </h3>
                    <span className="text-[11px] text-slate-400 block">
                      {md.vtags.length} Janela(s) de Coleta
                    </span>
                  </div>
                </div>
              </div>

              {/* VTAGs do MD */}
              <div className="p-4 space-y-4">
                {md.vtags.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500 italic">
                    ⏳ VTAGs ainda em processamento na Torre de Controle.
                  </div>
                ) : (
                  md.vtags.map((v, vIdx) => {
                    const imgUrl = v.imagem_url || "";
                    return (
                      <div
                        key={v.tag_number}
                        className="p-3 rounded-xl bg-slate-950 border border-slate-800/90 space-y-2.5"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-cyan-400" />
                            {vIdx + 1}ª Janela de Coleta
                          </span>
                          <span className="font-mono font-bold text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                            {v.tag_number}
                          </span>
                        </div>

                        {/* Imagem do Código de Barras */}
                        {imgUrl ? (
                          <div
                            onClick={() =>
                              setZoomModal({
                                url: imgUrl,
                                titulo: `${md.md_codigo} - ${vIdx + 1}ª Janela (${v.tag_number})`
                              })
                            }
                            className="bg-white rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer hover:ring-2 hover:ring-cyan-400 transition-all shadow-inner relative group"
                          >
                            <img
                              src={imgUrl}
                              alt={`Código de barras ${v.tag_number}`}
                              className="max-h-60 w-auto object-contain"
                            />
                            <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl">
                              <span className="px-3 py-1.5 rounded-lg bg-slate-900/90 text-cyan-300 text-xs font-bold flex items-center gap-1.5 shadow-lg">
                                <Maximize2 className="w-3.5 h-3.5" />
                                Tela Cheia
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="h-32 bg-slate-900 rounded-xl flex items-center justify-center text-xs text-slate-500">
                            Imagem não disponível
                          </div>
                        )}

                        {/* Botões de Ação para o Motorista */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              setZoomModal({
                                url: imgUrl,
                                titulo: `${md.md_codigo} - ${vIdx + 1}ª Janela (${v.tag_number})`
                              })
                            }
                            className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Tela Cheia (Zoom)</span>
                          </button>

                          <a
                            href={imgUrl}
                            download={`VTAG_${md.md_codigo}_${v.tag_number}.png`}
                            className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 transition-colors"
                            title="Salvar esta imagem no celular"
                          >
                            <Download className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Salvar</span>
                          </a>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Modal Tela Cheia (Zoom Máximo para o Bipe) */}
      {zoomModal && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4">
          <div className="w-full max-w-md flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-black text-white">{zoomModal.titulo}</h3>
              <p className="text-[11px] text-cyan-400">Pronto para leitura ótica no ponto</p>
            </div>
            <button
              onClick={() => setZoomModal(null)}
              className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 w-full max-w-md flex items-center justify-center my-4">
            <div className="bg-white p-4 rounded-2xl shadow-2xl w-full flex items-center justify-center">
              <img
                src={zoomModal.url}
                alt="VTAG em Tela Cheia"
                className="max-h-[65vh] w-full object-contain"
              />
            </div>
          </div>

          <div className="w-full max-w-md pb-2">
            <button
              onClick={() => setZoomModal(null)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black text-sm cursor-pointer shadow-lg"
            >
              Voltar à Lista de VTAGs
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MotoristaVtagPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Carregando...</div>}>
      <MotoristaVtagContent />
    </Suspense>
  );
}
