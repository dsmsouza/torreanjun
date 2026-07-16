"use client";

import React, { useEffect, useState } from "react";
import { Package, Layers, Map } from "lucide-react";
import RadarTab from "../../components/malha/RadarTab";

import dynamic from "next/dynamic";
const MapTab = dynamic(() => import("../../components/malha/MapTab"), { ssr: false });

export default function MalhaPage() {
  const [activeTab, setActiveTab] = useState<"radar" | "mapa">("radar");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab === "mapa") {
        setActiveTab("mapa");
      }
    }
  }, []);

  const handleTabChange = (tab: "radar" | "mapa") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("tab", tab);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.pushState({ path: newUrl }, "", newUrl);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap justify-between items-center bg-[#0C101B]/40 p-6 rounded-2xl border border-border gap-4">
        <div className="flex items-center gap-3">
          <Package className="w-8 h-8 text-blue-400" />
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Gestão & Auditoria de Malha</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Rastreabilidade de sacas paradas e otimização geográfica de pontos de coleta (MDs) da ANJUN.
            </p>
          </div>
        </div>

        {/* Dynamic Tab Switcher */}
        <div className="flex bg-[#0C101B] p-1 rounded-xl border border-border shrink-0">
          <button
            onClick={() => handleTabChange("radar")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "radar"
                ? "bg-primary text-white"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Radar de Pacotes Retidos</span>
          </button>
          <button
            onClick={() => handleTabChange("mapa")}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === "mapa"
                ? "bg-primary text-white"
                : "text-muted-foreground hover:text-white"
            }`}
          >
            <Map className="w-4 h-4" />
            <span>Mapa & Otimizador de Malha</span>
          </button>
        </div>
      </div>

      {activeTab === "radar" && <RadarTab />}
      {activeTab === "mapa" && <MapTab />}
    </div>
  );
}
