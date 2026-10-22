"use client";

import React, { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, Popup, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { CockpitD1MD, CockpitD1SellerMapa, geocodificarEndereco } from "@/lib/api";
import { 
  Store, 
  Building2, 
  Layers, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  ZoomIn, 
  ShoppingBag, 
  GitFork, 
  Search, 
  X, 
  Loader2,
  Navigation,
  Compass
} from "lucide-react";

export interface SearchedLocation {
  latitude: number;
  longitude: number;
  display_name: string;
  tipo?: "endereco" | "cidade" | "ponto_anjun";
  cidade?: string;
  estado?: string;
  hub_mais_proximo?: {
    iata: string;
    nome: string;
    cidade: string;
    estado: string;
    distancia_km: number;
    latitude?: number;
    longitude?: number;
  } | null;
  md_mais_proximo?: {
    codigo: string;
    nome: string;
    cidade: string;
    estado: string;
    distancia_km: number;
    latitude?: number;
    longitude?: number;
  } | null;
}

interface CockpitMapProps {
  pontos: CockpitD1MD[];
  sellers?: CockpitD1SellerMapa[];
  height?: string;
  selectedPonto?: CockpitD1MD | null;
  onSelectPonto?: (p: CockpitD1MD) => void;
  filtroTipo?: "TODOS" | "MD" | "HUB" | "PONTO_APOIO" | "PONTO_REDE";
  onFiltroTipoChange?: (tipo: "TODOS" | "MD" | "HUB" | "PONTO_APOIO" | "PONTO_REDE") => void;
  searchedLocation?: SearchedLocation | null;
  onClearSearchedLocation?: () => void;
  onConsultarViabilidade?: (cidade: string, estado?: string) => void;
}

// Custom Google Maps Red Pin Icon generator
function createGoogleMapsPinIcon() {
  if (typeof window === "undefined") return null;
  return L.divIcon({
    className: "google-maps-pin-marker",
    html: `
      <div style="position: relative; width: 38px; height: 50px; transform: translate(-19px, -50px); filter: drop-shadow(0 6px 12px rgba(0,0,0,0.6));">
        <svg viewBox="0 0 384 512" width="38" height="50" style="display: block;">
          <defs>
            <linearGradient id="gRedPin" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#ff4b4b" />
              <stop offset="100%" stop-color="#b91c1c" />
            </linearGradient>
          </defs>
          <path fill="url(#gRedPin)" stroke="#ffffff" stroke-width="14" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
          <circle cx="192" cy="192" r="76" fill="#ffffff"/>
          <circle cx="192" cy="192" r="46" fill="#dc2626"/>
        </svg>
        <div style="position: absolute; bottom: 0px; left: 19px; width: 14px; height: 5px; background: rgba(0,0,0,0.4); border-radius: 50%; transform: translateX(-50%); filter: blur(1.5px);"></div>
      </div>
    `,
    iconSize: [38, 50],
    iconAnchor: [19, 50],
    popupAnchor: [0, -50],
  });
}

function MapController({
  selectedPonto,
  searchedLocation,
  pontosValidos,
}: {
  selectedPonto?: CockpitD1MD | null;
  searchedLocation?: SearchedLocation | null;
  pontosValidos: CockpitD1MD[];
}) {
  const map = useMap();

  useEffect(() => {
    if (searchedLocation && searchedLocation.latitude && searchedLocation.longitude) {
      const zoom = searchedLocation.tipo === "endereco" ? 15 : 13;
      map.flyTo([searchedLocation.latitude, searchedLocation.longitude], zoom, { duration: 1.4 });
    }
  }, [searchedLocation, map]);

  useEffect(() => {
    if (!searchedLocation && selectedPonto && selectedPonto.latitude && selectedPonto.longitude) {
      map.flyTo([selectedPonto.latitude, selectedPonto.longitude], 14, { duration: 1.2 });
    }
  }, [selectedPonto, searchedLocation, map]);

  useEffect(() => {
    if (!searchedLocation && !selectedPonto && pontosValidos.length > 0) {
      try {
        const bounds = pontosValidos.map((p) => [p.latitude!, p.longitude!] as [number, number]);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      } catch (e) {
        console.error("Erro ao ajustar bounds do mapa:", e);
      }
    }
  }, [pontosValidos.length, map]);

  return null;
}

export default function CockpitMap({
  pontos,
  sellers = [],
  height = "620px",
  selectedPonto,
  onSelectPonto,
  filtroTipo: propFiltroTipo,
  onFiltroTipoChange,
  searchedLocation: propSearchedLocation,
  onClearSearchedLocation,
  onConsultarViabilidade,
}: CockpitMapProps) {
  const [internalFiltro, setInternalFiltro] = useState<"TODOS" | "MD" | "HUB" | "PONTO_APOIO" | "PONTO_REDE">("TODOS");
  const [mostrarSellers, setMostrarSellers] = useState<boolean>(true);
  const [selectedSeller, setSelectedSeller] = useState<CockpitD1SellerMapa | null>(null);

  // Address & City Search State (Google Maps Pin feature)
  const [enderecoBusca, setEnderecoBusca] = useState("");
  const [loadingBusca, setLoadingBusca] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [internalSearchedLocation, setInternalSearchedLocation] = useState<SearchedLocation | null>(null);

  const activeLocation = propSearchedLocation !== undefined ? propSearchedLocation : internalSearchedLocation;
  const googleMapsRedPin = useMemo(() => createGoogleMapsPinIcon(), []);

  const handleClearLocation = () => {
    setInternalSearchedLocation(null);
    setEnderecoBusca("");
    setErroBusca(null);
    if (onClearSearchedLocation) onClearSearchedLocation();
  };

  const handleBuscarEndereco = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!enderecoBusca.trim()) return;
    setLoadingBusca(true);
    setErroBusca(null);
    try {
      const res = await geocodificarEndereco(enderecoBusca.trim());
      if (res.encontrado && res.latitude && res.longitude) {
        const loc: SearchedLocation = {
          latitude: res.latitude,
          longitude: res.longitude,
          display_name: res.display_name || enderecoBusca,
          tipo: res.tipo || "endereco",
          cidade: res.cidade,
          estado: res.estado,
          hub_mais_proximo: res.hub_mais_proximo,
          md_mais_proximo: res.md_mais_proximo,
        };
        setInternalSearchedLocation(loc);
      } else {
        setErroBusca(res.mensagem || "Endereço ou município não localizado.");
      }
    } catch (err: any) {
      setErroBusca(err?.message || "Erro ao consultar endereço.");
    } finally {
      setLoadingBusca(false);
    }
  };

  const tipoFiltro = propFiltroTipo !== undefined ? propFiltroTipo : internalFiltro;

  const setTipoFiltro = (novo: "TODOS" | "MD" | "HUB" | "PONTO_APOIO" | "PONTO_REDE") => {
    if (onFiltroTipoChange) onFiltroTipoChange(novo);
    setInternalFiltro(novo);
  };

  const pontosValidos = pontos.filter(
    (p) => p.latitude !== null && p.latitude !== undefined && p.longitude !== null && p.longitude !== undefined
  );

  const sellersValidos = sellers.filter(
    (s) => s.latitude !== null && s.latitude !== undefined && s.longitude !== null && s.longitude !== undefined
  );

  const pontosFiltrados = pontosValidos.filter((p) => {
    if (tipoFiltro === "TODOS") return true;
    return p.tipo_ponto === tipoFiltro;
  });

  const totalMDs = pontosValidos.filter((p) => p.tipo_ponto === "MD").length;
  const totalHUBs = pontosValidos.filter((p) => p.tipo_ponto === "HUB").length;
  const totalApoio = pontosValidos.filter((p) => p.tipo_ponto === "PONTO_APOIO").length;
  const totalRede = pontosValidos.filter((p) => p.tipo_ponto === "PONTO_REDE").length;
  const [mapStyle, setMapStyle] = useState<"osm" | "esri_dark" | "esri_sat">("osm");

  return (
    <div 
      style={{ height }}
      className="relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-[#090D16]"
    >
      {/* Top Floating Controls Bar */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2 max-w-[calc(100%-190px)]">
        {/* Row 1: Malha Filters & Spoke-Hub */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-900/95 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/80 shadow-2xl">
          <div className="flex items-center gap-1.5 px-2 text-xs font-bold text-white border-r border-slate-700 pr-3">
            <MapPin className="w-4 h-4 text-blue-400" />
            <span>Malha ({pontosFiltrados.length})</span>
          </div>

          <button
            onClick={() => setTipoFiltro("TODOS")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              tipoFiltro === "TODOS"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            Todos ({pontosValidos.length})
          </button>

          <button
            onClick={() => setTipoFiltro("MD")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              tipoFiltro === "MD"
                ? "bg-emerald-600 text-white shadow-sm"
                : "text-emerald-400 hover:bg-emerald-950/40"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Minidrops ({totalMDs})
          </button>

          <button
            onClick={() => setTipoFiltro("HUB")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              tipoFiltro === "HUB"
                ? "bg-purple-600 text-white shadow-sm"
                : "text-purple-400 hover:bg-purple-950/40"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            HUBs ANJUN ({totalHUBs})
          </button>

          <button
            onClick={() => setTipoFiltro("PONTO_APOIO")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              tipoFiltro === "PONTO_APOIO"
                ? "bg-amber-600 text-white shadow-sm"
                : "text-amber-400 hover:bg-amber-950/40"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Ponto de Apoio ({totalApoio})
          </button>

          <button
            onClick={() => setTipoFiltro("PONTO_REDE")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              tipoFiltro === "PONTO_REDE"
                ? "bg-blue-600 text-white shadow-sm"
                : "text-blue-400 hover:bg-blue-950/40"
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            Ponto de Rede ({totalRede})
          </button>

          {sellersValidos.length > 0 && (
            <button
              onClick={() => setMostrarSellers(!mostrarSellers)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
                mostrarSellers
                  ? "bg-cyan-600 text-white border-cyan-400/50 shadow-md shadow-cyan-500/20"
                  : "bg-slate-800/80 text-cyan-400 border-cyan-500/30 hover:bg-slate-800"
              }`}
            >
              <GitFork className="w-3.5 h-3.5" />
              <span>Spoke-Hub Sellers ({sellersValidos.length})</span>
            </button>
          )}
        </div>

        {/* Row 2: Google Maps Search Bar (Endereço, Rua, CEP ou Cidade) */}
        <div className="flex flex-wrap items-center gap-2">
          <form
            onSubmit={handleBuscarEndereco}
            className="flex items-center gap-1.5 bg-slate-900/95 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/80 shadow-2xl"
          >
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-rose-400 absolute left-2.5 pointer-events-none" />
              <input
                type="text"
                value={enderecoBusca}
                onChange={(e) => setEnderecoBusca(e.target.value)}
                placeholder="Pesquisar endereço, CEP ou cidade..."
                className="w-56 sm:w-72 bg-slate-950/80 border border-slate-700/80 text-white text-xs pl-8 pr-7 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 placeholder-slate-500 transition-all"
              />
              {enderecoBusca && (
                <button
                  type="button"
                  onClick={() => setEnderecoBusca("")}
                  className="absolute right-2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={loadingBusca || !enderecoBusca.trim()}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
              title="Localizar endereço/cidade com Ponto Vermelho estilo Google Maps"
            >
              {loadingBusca ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Localizar</span>
                </>
              )}
            </button>
          </form>

          {/* Active Searched Location Red Chip */}
          {activeLocation && (
            <div className="flex items-center gap-2 bg-rose-950/90 border border-rose-500/50 text-rose-200 px-3 py-1.5 rounded-xl shadow-lg backdrop-blur-md text-xs animate-in fade-in">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping inline-block" />
              <span className="font-bold text-white truncate max-w-[220px]">
                📍 {activeLocation.display_name.split(",")[0]}
              </span>
              {activeLocation.hub_mais_proximo && (
                <span className="hidden sm:inline text-[11px] text-rose-300 border-l border-rose-800 pl-2">
                  HUB: ~{activeLocation.hub_mais_proximo.distancia_km} km
                </span>
              )}
              <button
                type="button"
                onClick={handleClearLocation}
                className="text-rose-400 hover:text-white transition-colors cursor-pointer ml-1"
                title="Remover ponto vermelho do mapa"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {erroBusca && (
            <div className="flex items-center gap-1.5 bg-amber-950/90 border border-amber-500/50 text-amber-200 px-2.5 py-1 rounded-xl shadow-lg text-[11px] animate-in fade-in">
              <span>{erroBusca}</span>
              <button onClick={() => setErroBusca(null)} className="text-amber-400 hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Top Right: Map Tile Layer Style Switcher */}
      <div className="absolute top-4 right-4 z-[1000] flex items-center gap-1 bg-slate-900/95 backdrop-blur-md p-1.5 rounded-xl border border-slate-700/80 shadow-2xl">
        <button
          onClick={() => setMapStyle("osm")}
          className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
            mapStyle === "osm"
              ? "bg-emerald-600 text-white shadow"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
          title="Mapa padrão com ruas e avenidas detalhadas"
        >
          🗺️ Ruas (OSM)
        </button>
        <button
          onClick={() => setMapStyle("esri_dark")}
          className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
            mapStyle === "esri_dark"
              ? "bg-blue-600 text-white shadow"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
          title="Tema escuro limpo (Esri Dark Gray)"
        >
          🌙 Dark
        </button>
        <button
          onClick={() => setMapStyle("esri_sat")}
          className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
            mapStyle === "esri_sat"
              ? "bg-purple-600 text-white shadow"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
          title="Visão aérea por satélite (Esri World Imagery)"
        >
          🛰️ Satélite
        </button>
      </div>

      {/* Legend Bottom Floating */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-slate-900/95 backdrop-blur-md p-3 rounded-xl border border-slate-700/80 shadow-2xl space-y-1.5 text-[11px] text-slate-300">
        <div className="font-bold text-white uppercase text-[10px] tracking-wider mb-1 flex items-center gap-1">
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          Legenda Operacional
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-emerald-500 border border-white/50" />
          <span><strong>Minidrop Parceiro (MD)</strong> — Ponto Dropoff</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full bg-purple-500 border-2 border-white" />
          <span><strong>HUB Operacional ANJUN</strong> — Recepção Pickup</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-amber-500 border border-white/70" />
          <span><strong>Ponto de Apoio ANJUN</strong> — Base de Apoio</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-blue-500 border border-white/70" />
          <span><strong>Ponto de Rede Parceiro</strong> — Rede Credenciada</span>
        </div>
        {mostrarSellers && sellersValidos.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 border border-white/60 shadow-sm" />
            <span><strong>Seller Ativo (Origem)</strong> — Conectado ao Ponto</span>
          </div>
        )}
        {activeLocation && (
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full bg-rose-600 border-2 border-white shadow-sm" />
            <span><strong className="text-rose-400">Ponto Pesquisado (Alvo)</strong></span>
          </div>
        )}
        <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800">
          *Linhas tracejadas ligam o Seller ao MD ou HUB de bipagem
        </div>
      </div>

      <MapContainer
        center={[-23.5505, -46.6333]}
        zoom={10}
        style={{ height: "100%", width: "100%", background: "#0a0e17" }}
        attributionControl={false}
      >
        <MapController 
          selectedPonto={selectedPonto} 
          searchedLocation={activeLocation}
          pontosValidos={pontosValidos} 
        />

        {mapStyle === "osm" && (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
            attribution='&copy; OpenStreetMap contributors'
          />
        )}
        {mapStyle === "esri_dark" && (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            maxZoom={16}
            attribution='Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ'
          />
        )}
        {mapStyle === "esri_sat" && (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={18}
            attribution='Tiles &copy; Esri'
          />
        )}

        {/* Spoke-Hub: Conexões entre Sellers e Pontos de Coleta (MD / HUB) */}
        {mostrarSellers && sellersValidos.map((s, idx) => {
          if (!s.dest_latitude || !s.dest_longitude) return null;
          const isSelected = selectedSeller?.merchant_nome === s.merchant_nome;
          return (
            <Polyline
              key={`spoke-line-${idx}`}
              positions={[
                [s.latitude, s.longitude],
                [s.dest_latitude, s.dest_longitude]
              ]}
              pathOptions={{
                color: isSelected ? "#38bdf8" : "#06b6d4",
                weight: isSelected ? 3 : 1.2,
                opacity: isSelected ? 0.9 : 0.35,
                dashArray: isSelected ? "6, 6" : "3, 6",
              }}
            />
          );
        })}

        {/* Marcadores de Sellers (Origem) */}
        {mostrarSellers && sellersValidos.map((s, idx) => {
          const isSelected = selectedSeller?.merchant_nome === s.merchant_nome;
          const radius = Math.min(12, Math.max(4.5, Math.log10(s.volume + 1) * 2.8));

          return (
            <CircleMarker
              key={`seller-${idx}`}
              center={[s.latitude, s.longitude]}
              radius={isSelected ? radius + 3 : radius}
              eventHandlers={{
                click: () => {
                  setSelectedSeller(isSelected ? null : s);
                },
              }}
              pathOptions={{
                color: isSelected ? "#ffffff" : "#22d3ee",
                fillColor: isSelected ? "#38bdf8" : "#06b6d4",
                fillOpacity: isSelected ? 1 : 0.85,
                weight: isSelected ? 2.5 : 1,
              }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                <div className="text-xs font-sans">
                  <div className="font-bold flex items-center gap-1 text-cyan-400">
                    <ShoppingBag className="w-3 h-3" />
                    <span>{s.merchant_nome}</span>
                  </div>
                  <div className="text-[10px] text-slate-300">
                    {s.cidade} - {s.estado} • {s.nome_cliente}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono font-bold">
                    {s.volume.toLocaleString("pt-BR")} pacotes ➔ {s.dest_nome || s.ponto_colecao}
                  </div>
                </div>
              </Tooltip>

              <Popup>
                <div className="p-2 min-w-[210px] font-sans text-slate-800 space-y-2">
                  <div className="border-b pb-1.5">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold text-white bg-cyan-600 mb-1">
                      Seller Embarcador (Spoke)
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 leading-tight">
                      {s.merchant_nome}
                    </h4>
                    <p className="text-xs text-slate-600">
                      {s.cidade} - {s.estado} {s.cep ? `(CEP: ${s.cep})` : ""}
                    </p>
                    <p className="text-[11px] text-purple-700 font-semibold mt-0.5">
                      Canal / Cliente: {s.nome_cliente}
                    </p>
                  </div>

                  <div className="bg-slate-100 p-2 rounded text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Volume Embarcado:</span>
                      <strong className="text-slate-900 font-mono">{s.volume.toLocaleString("pt-BR")} pcts</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Ponto Destino:</span>
                      <strong className="text-blue-700 font-mono">{s.dest_nome || s.ponto_colecao}</strong>
                    </div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* Pontos de Coleta (Minidrops e HUBs) */}
        {pontosFiltrados.map((p, idx) => {
          const isHub = p.tipo_ponto === "HUB";
          const isApoio = p.tipo_ponto === "PONTO_APOIO";
          const isRede = p.tipo_ponto === "PONTO_REDE";
          const isSelected = selectedPonto?.ponto_colecao === p.ponto_colecao;
          const radius = isHub
            ? Math.min(24, Math.max(10, Math.log10(p.volume + 1) * 5))
            : Math.min(20, Math.max(7, Math.log10(p.volume + 1) * 3.5));

          const color = isSelected
            ? "#38bdf8"
            : isHub
            ? "#a855f7"
            : isApoio
            ? "#f59e0b"
            : isRede
            ? "#3b82f6"
            : "#10b981";
          const fillColor = isSelected
            ? "#0284c7"
            : isHub
            ? "#9333ea"
            : isApoio
            ? "#d97706"
            : isRede
            ? "#2563eb"
            : "#059669";

          return (
            <CircleMarker
              key={idx}
              center={[p.latitude!, p.longitude!]}
              radius={isSelected ? radius + 4 : radius}
              eventHandlers={{
                click: () => {
                  if (onSelectPonto) onSelectPonto(p);
                },
              }}
              pathOptions={{
                color: color,
                fillColor: fillColor,
                fillOpacity: isSelected ? 1 : (isHub ? 0.9 : 0.75),
                weight: isSelected ? 3.5 : (isHub ? 2.5 : 1.5),
              }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                <div className="text-xs font-sans">
                  <div className="font-bold flex items-center gap-1.5">
                    {isHub ? <Building2 className="w-3.5 h-3.5 text-purple-400" /> : <Store className="w-3.5 h-3.5 text-emerald-400" />}
                    <span>{p.ponto_colecao}</span>
                  </div>
                  <div className="text-[10px] text-slate-300">{p.tipo_label}</div>
                  <div className="text-[10px] font-mono text-emerald-400 font-bold mt-0.5">
                    Volume: {p.volume.toLocaleString("pt-BR")} pacotes
                  </div>
                </div>
              </Tooltip>

              <Popup>
                <div className="p-2 min-w-[220px] font-sans text-slate-800 space-y-2">
                  <div className="border-b pb-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold text-white mb-1 ${
                        isHub ? "bg-purple-600" : "bg-emerald-600"
                      }`}
                    >
                      {p.tipo_label}
                    </span>
                    <h3 className="font-bold text-sm text-slate-900 leading-tight">
                      {p.nome_display || p.ponto_colecao}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-mono">IATA: {p.ponto_colecao}</p>
                    <p className="text-xs text-slate-600">
                      {p.cidade || "N/A"}{p.estado ? ` - ${p.estado}` : ""}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="bg-slate-100 p-1.5 rounded">
                      <span className="text-[10px] text-slate-500 block">Volume Total:</span>
                      <strong className="text-slate-900 font-mono text-sm">{p.volume.toLocaleString("pt-BR")}</strong>
                    </div>
                    <div className="bg-slate-100 p-1.5 rounded">
                      <span className="text-[10px] text-slate-500 block">Sellers:</span>
                      <strong className="text-slate-900 font-mono text-sm">{p.qtd_sellers}</strong>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs pt-1">
                    <div className="flex justify-between items-center text-emerald-700 font-semibold">
                      <span>Coletados:</span>
                      <span className="font-mono">{p.coletados.toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="flex justify-between items-center text-amber-700 font-semibold">
                      <span>Backlog:</span>
                      <span className="font-mono">{p.backlog.toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t text-slate-900 font-bold">
                      <span>Taxa de Coleta:</span>
                      <span className="font-mono text-emerald-600">{p.taxa_coleta}%</span>
                    </div>
                  </div>

                  <div className="text-[10px] text-slate-500 italic pt-1 border-t">
                    Finalidade: {p.operacao}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* Marcador do Endereço / Cidade Pesquisado (Google Maps Red Pin) */}
        {activeLocation && activeLocation.latitude && activeLocation.longitude && (
          <>
            {/* Radar Pulsing Rings */}
            <CircleMarker
              center={[activeLocation.latitude, activeLocation.longitude]}
              radius={30}
              pathOptions={{
                color: "#ef4444",
                fillColor: "#ef4444",
                fillOpacity: 0.12,
                weight: 1.5,
                dashArray: "5, 5",
              }}
            />
            <CircleMarker
              center={[activeLocation.latitude, activeLocation.longitude]}
              radius={14}
              pathOptions={{
                color: "#dc2626",
                fillColor: "#dc2626",
                fillOpacity: 0.28,
                weight: 2,
              }}
            />

            {/* Linha Conectora ao HUB Mais Próximo */}
            {activeLocation.hub_mais_proximo &&
              activeLocation.hub_mais_proximo.latitude &&
              activeLocation.hub_mais_proximo.longitude && (
                <Polyline
                  positions={[
                    [activeLocation.latitude, activeLocation.longitude],
                    [activeLocation.hub_mais_proximo.latitude, activeLocation.hub_mais_proximo.longitude],
                  ]}
                  pathOptions={{
                    color: "#c084fc",
                    weight: 2.5,
                    dashArray: "6, 6",
                    opacity: 0.85,
                  }}
                >
                  <Tooltip direction="center" offset={[0, 0]} opacity={0.95}>
                    <div className="text-xs font-mono font-bold text-purple-300 bg-slate-900/90 border border-purple-500/40 px-2 py-0.5 rounded shadow">
                      HUB {activeLocation.hub_mais_proximo.iata}: ~{activeLocation.hub_mais_proximo.distancia_km} km
                    </div>
                  </Tooltip>
                </Polyline>
              )}

            {/* Linha Conectora ao Minidrop (MD) Mais Próximo */}
            {activeLocation.md_mais_proximo &&
              activeLocation.md_mais_proximo.latitude &&
              activeLocation.md_mais_proximo.longitude && (
                <Polyline
                  positions={[
                    [activeLocation.latitude, activeLocation.longitude],
                    [activeLocation.md_mais_proximo.latitude, activeLocation.md_mais_proximo.longitude],
                  ]}
                  pathOptions={{
                    color: "#34d399",
                    weight: 2,
                    dashArray: "4, 4",
                    opacity: 0.85,
                  }}
                >
                  <Tooltip direction="center" offset={[0, 0]} opacity={0.95}>
                    <div className="text-xs font-mono font-bold text-emerald-300 bg-slate-900/90 border border-emerald-500/40 px-2 py-0.5 rounded shadow">
                      MD {activeLocation.md_mais_proximo.codigo}: ~{activeLocation.md_mais_proximo.distancia_km} km
                    </div>
                  </Tooltip>
                </Polyline>
              )}

            {/* Google Maps Pin Icon */}
            {googleMapsRedPin ? (
              <Marker
                position={[activeLocation.latitude, activeLocation.longitude]}
                icon={googleMapsRedPin}
                zIndexOffset={1000}
              >
                <Tooltip direction="top" offset={[0, -48]} permanent opacity={0.95}>
                  <div className="font-bold text-xs text-rose-600 flex items-center gap-1 bg-white px-2 py-0.5 rounded shadow">
                    <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping inline-block" />
                    <span>{activeLocation.display_name.split(",")[0]}</span>
                  </div>
                </Tooltip>

                <Popup>
                  <div className="p-2 min-w-[260px] font-sans text-slate-800 space-y-2">
                    <div className="border-b pb-2">
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-black text-white bg-red-600 mb-1 tracking-wider uppercase">
                        📍 Ponto Pesquisado no Mapa
                      </span>
                      <h4 className="font-bold text-sm text-slate-900 leading-tight">
                        {activeLocation.display_name}
                      </h4>
                      {activeLocation.cidade && (
                        <p className="text-xs text-slate-600 mt-0.5 font-medium">
                          {activeLocation.cidade}{activeLocation.estado ? ` - ${activeLocation.estado}` : ""}
                        </p>
                      )}
                    </div>

                    <div className="bg-slate-100 p-2.5 rounded-lg text-xs space-y-1.5">
                      {activeLocation.hub_mais_proximo && (
                        <div className="flex justify-between items-center">
                          <span className="text-purple-700 font-bold">HUB ANJUN Mais Próximo:</span>
                          <span className="font-mono font-bold text-purple-950">
                            ~{activeLocation.hub_mais_proximo.distancia_km} km ({activeLocation.hub_mais_proximo.iata})
                          </span>
                        </div>
                      )}
                      {activeLocation.md_mais_proximo && (
                        <div className="flex justify-between items-center">
                          <span className="text-emerald-700 font-bold">Minidrop (MD) Mais Próximo:</span>
                          <span className="font-mono font-bold text-emerald-950">
                            ~{activeLocation.md_mais_proximo.distancia_km} km ({activeLocation.md_mais_proximo.codigo})
                          </span>
                        </div>
                      )}
                      {!activeLocation.hub_mais_proximo && !activeLocation.md_mais_proximo && (
                        <p className="text-slate-500 italic text-[11px]">Nenhum ponto ANJUN mapeado nas imediações.</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t">
                      {onConsultarViabilidade && activeLocation.cidade && (
                        <button
                          type="button"
                          onClick={() => onConsultarViabilidade(activeLocation.cidade!, activeLocation.estado)}
                          className="flex-1 py-1.5 px-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] rounded-lg transition-colors flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Viabilidade</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleClearLocation}
                        className="py-1.5 px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-[11px] rounded-lg transition-colors cursor-pointer"
                      >
                        Limpar Ponto
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ) : (
              <CircleMarker
                center={[activeLocation.latitude, activeLocation.longitude]}
                radius={12}
                pathOptions={{
                  color: "#ffffff",
                  fillColor: "#ea4335",
                  fillOpacity: 1,
                  weight: 3.5,
                }}
              />
            )}
          </>
        )}
      </MapContainer>
    </div>
  );
}
