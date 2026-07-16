"use client";

import React, { useState } from "react";
import { Clipboard, Check, RefreshCw } from "lucide-react";

interface ResumoNumericoProps {
  diaBase: string;
  volumeTotal: number;
  volumeBacklog: number;
  taxaColeta: number;
  errosLacre: number;
  selectedRegional: string | null;
}

export default function ResumoNumerico({
  diaBase,
  volumeTotal,
  volumeBacklog,
  taxaColeta,
  errosLacre,
  selectedRegional,
}: ResumoNumericoProps) {
  const [copied, setCopied] = useState(false);

  const formatVolume = (vol: number) => {
    if (vol >= 1000) {
      return `${(vol / 1000).toFixed(1)}k`;
    }
    return vol.toString();
  };

  const getResumoText = () => {
    const scope = selectedRegional ? `REGIONAL ${selectedRegional}` : "MALHA NACIONAL";
    return `*ANJUN LOGÍSTICA - TORRE DE CONTROLE FIRST MILE*
*Resumo Executivo (${scope})*
📅 *Dia Base:* ${diaBase}

📊 *Volume Previsto:* ${volumeTotal.toLocaleString()} pacotes (${formatVolume(volumeTotal)})
📦 *Backlog Retido:* ${volumeBacklog.toLocaleString()} pacotes (${formatVolume(volumeBacklog)})
📈 *Eficiência (OTR):* ${taxaColeta.toFixed(2)}%
🔒 *Erros de Lacre (Sacaria):* ${errosLacre.toLocaleString()} divergências`;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getResumoText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <div className="glass-panel p-6 rounded-2xl border border-border space-y-4">
      <div className="flex justify-between items-center border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Resumo Executivo Copiável</h2>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-all cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Copiado!</span>
            </>
          ) : (
            <>
              <Clipboard className="w-3.5 h-3.5" />
              <span>Copiar</span>
            </>
          )}
        </button>
      </div>

      <div className="relative">
        <pre className="w-full p-4 bg-[#0C101B] border border-border rounded-xl text-slate-300 text-xs font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
          {getResumoText()}
        </pre>
      </div>
    </div>
  );
}
