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
  X,
  Package,
  Store,
  Navigation
} from "lucide-react";

interface VtagItem {
  tag_number: string;
  imagem_url: string | null;
  pdf_url?: string | null;
}

interface PontoItem {
  ponto_nome: string;
  canal: string;
  endereco: string;
  quantidade: number;
  vtags: VtagItem[];
}

interface MotoristaPickupDetalhe {
  motorista: string;
  rota: string;
  placa: string;
  contato: string;
  telefone_wpp: string;
  canal: string;
  pontos: PontoItem[];
  total_vtags: number;
  card_imagem_url?: string;
  status_envio?: string;
}

function MotoristaPickupContent() {
  const searchParams = useSearchParams();
  const diaParam = searchParams.get("dia") || new Date().toLocaleDateString("pt-BR");
  const motoristaParam = searchParams.get("motorista") || "";
  const canalParam = searchParams.get("canal") || "";

  const [loading, setLoading] = useState(true);
  const [motoristaInfo, setMotoristaInfo] = useState<MotoristaPickupDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [zoomModal, setZoomModal] = useState<{ url: string; titulo: string; subtitulo?: string } | null>(null);

  useEffect(() => {
    if (!motoristaParam) {
      setErro("Nome do motorista não informado no link.");
      setLoading(false);
      return;
    }

    const carregar = async () => {
      try {
        setLoading(true);
        const url = `/api/vtags-pickup/motoristas?dia_base=${encodeURIComponent(diaParam)}&search=${encodeURIComponent(motoristaParam)}${canalParam ? `&canal=${encodeURIComponent(canalParam)}` : ""}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Não foi possível carregar as informações do motorista.");
        const data = await res.json();
        const lista = data.motoristas || [];
        const mot = lista.find(
          (m: MotoristaPickupDetalhe) => m.motorista.trim().toUpperCase() === motoristaParam.trim().toUpperCase()
        ) || lista[0];

        if (!mot) {
          setErro(`Nenhuma coleta encontrada para o motorista "${motoristaParam}" na data ${diaParam}.`);
        } else {
          setMotoristaInfo(mot);
        }
      } catch (err: any) {
        setErro(err.message || "Erro de conexão ao buscar VTAGs de Coleta.");
      } finally {
        setLoading(false);
      }
    };

    carregar();
  }, [diaParam, motoristaParam, canalParam]);

  const getCanalBadge = (canal: string) => {
    const c = (canal || "").toUpperCase();
    if (c === "C&A") return "bg-rose-500/20 text-rose-300 border-rose-500/40";
    if (c === "TIKTOK") return "bg-pink-500/20 text-pink-300 border-pink-500/40";
    if (c === "TEMU") return "bg-amber-500/20 text-amber-300 border-amber-500/40";
    return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 rounded-full border-4 border-emerald-500/30 border-t-emerald-400 animate-spin mb-4" />
        <h2 className="text-base font-bold text-slate-200">Carregando VTAGs de Coleta...</h2>
        <p className="text-xs text-slate-400 mt-1">Torre de Controle Anjun Express (First Mile)</p>
      </div>
    );
  }

  if (erro || !motoristaInfo) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center mb-4 text-2xl font-bold">
          ⚠️
        </div>
        <h2 className="text-lg font-bold text-slate-100">Coleta Não Localizada</h2>
        <p className="text-sm text-slate-400 mt-2 max-w-sm">{erro}</p>
        <div className="mt-6 text-xs text-slate-500">
          Entre em contato com o Suporte da Torre de Controle da Anjun.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070A11] text-slate-100 pb-16">
      {/* Barra Superior Mobile */}
      <header className="sticky top-0 z-40 bg-slate-950/95 backdrop-blur-md border-b border-slate-800/80 px-4 py-3.5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/30 to-teal-500/20 text-emerald-400 flex items-center justify-center font-black text-sm border border-emerald-500/40 shadow-sm">
              FM
            </div>
            <div>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest block leading-none">
                ANJUN EXPRESS • PICKUP
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
        <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-emerald-500/30 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Motorista de Coleta
              </span>
              <h2 className="text-lg font-black text-white tracking-tight">
                {motoristaInfo.motorista}
              </h2>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/80">
            <div className="p-2 rounded-xl bg-slate-950 border border-slate-800/80">
              <span className="text-[10px] text-slate-400 block font-medium">Rota:</span>
              <span className="font-bold text-emerald-300 font-mono text-sm">
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

          <div className="p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex items-center justify-between text-xs">
            <span className="text-emerald-300 font-medium">
              Total: <strong>{motoristaInfo.pontos.length} Ponto(s) de Coleta</strong>
            </span>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              Liberadas
            </span>
          </div>

          {/* Botão de Baixar Cartão Completo Consolidado */}
          {motoristaInfo.card_imagem_url && (
            <a
              href={motoristaInfo.card_imagem_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-850 border border-slate-700 text-xs font-bold text-emerald-300 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Ver Imagem Completa da Rota (Cartão Geral)</span>
            </a>
          )}
        </div>

        {/* Dica de Iluminação */}
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
          <Smartphone className="w-4 h-4 shrink-0 text-amber-400" />
          <span>
            <strong>Dica para o bipe:</strong> Aumente o brilho da tela do celular para o leitor ótico biper com facilidade no seller/loja.
          </span>
        </div>

        {/* Lista de Pontos de Coleta e Etiquetas */}
        <div className="space-y-4">
          {motoristaInfo.pontos.map((ponto, pIdx) => {
            const canalBadgeClass = getCanalBadge(ponto.canal);

            return (
              <div
                key={`${ponto.ponto_nome}-${pIdx}`}
                className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-lg"
              >
                {/* Cabeçalho do Ponto de Coleta */}
                <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                      {pIdx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-black text-white font-mono leading-snug">
                          {ponto.ponto_nome}
                        </h3>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${canalBadgeClass}`}>
                          {ponto.canal}
                        </span>
                      </div>
                      {ponto.endereco && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-1">
                          <MapPin className="w-3 h-3 shrink-0 text-slate-500" />
                          <span className="line-clamp-2">{ponto.endereco}</span>
                        </div>
                      )}
                      {ponto.quantidade > 0 && (
                        <div className="flex items-center gap-1 text-[11px] text-cyan-300 font-medium mt-0.5">
                          <Package className="w-3 h-3 shrink-0 text-cyan-400" />
                          <span>Previsão: {ponto.quantidade} volume(s)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* VTAGs do Ponto */}
                <div className="p-4 space-y-4">
                  {ponto.vtags.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500 italic bg-slate-950/50 rounded-xl border border-slate-800/50">
                      ⏳ VTAG ainda em processamento na Torre de Controle.
                    </div>
                  ) : (
                    ponto.vtags.map((v, vIdx) => {
                      const imgUrl = v.imagem_url || "";
                      return (
                        <div
                          key={v.tag_number}
                          className="p-3 rounded-xl bg-slate-950 border border-slate-800/90 space-y-2.5"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              VTAG Oficial de Coleta
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
                                  titulo: ponto.ponto_nome,
                                  subtitulo: `VTAG: ${v.tag_number} • Canal: ${ponto.canal}`
                                })
                              }
                              className="bg-white rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer hover:ring-2 hover:ring-emerald-400 transition-all shadow-inner relative group"
                            >
                              <img
                                src={imgUrl}
                                alt={`Código de barras ${v.tag_number}`}
                                className="max-h-60 w-auto object-contain"
                              />
                              <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl">
                                <span className="px-3 py-1.5 rounded-lg bg-slate-900/90 text-emerald-300 text-xs font-bold flex items-center gap-1.5 shadow-lg">
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
                                  titulo: ponto.ponto_nome,
                                  subtitulo: `VTAG: ${v.tag_number} • Canal: ${ponto.canal}`
                                })
                              }
                              className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Tela Cheia (Zoom)</span>
                            </button>

                            <a
                              href={imgUrl}
                              download={`VTAG_PICKUP_${ponto.ponto_nome}_${v.tag_number}.png`}
                              className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 transition-colors"
                              title="Salvar esta imagem no celular"
                            >
                              <Download className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Salvar</span>
                            </a>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Modal Tela Cheia (Zoom Máximo para o Bipe) */}
      {zoomModal && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-4">
          <div className="w-full max-w-md flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-black text-white">{zoomModal.titulo}</h3>
              {zoomModal.subtitulo && (
                <p className="text-[11px] text-emerald-400">{zoomModal.subtitulo}</p>
              )}
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
              className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-black text-sm cursor-pointer shadow-lg"
            >
              Voltar à Lista de Coletas
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MotoristaPickupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 text-white flex items-center justify-center">Carregando...</div>}>
      <MotoristaPickupContent />
    </Suspense>
  );
}
