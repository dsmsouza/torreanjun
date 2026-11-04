"use client";

import React, { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, Popup, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { CockpitD1MD, CockpitD1SellerMapa } from "@/lib/api";
import { 
  Store, 
  Building2, 
  Layers, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  ShoppingBag, 
  GitFork, 
  X, 
  Maximize2,
  AlertTriangle,
  Compass,
  Sparkles,
  ExternalLink,
  Ban
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
  searchedLocation?: SearchedLocation | null;
  onClearSearchedLocation?: () => void;
  onConsultarViabilidade?: (cidade: string, estado?: string) => void;
  modoVisaoLabel?: string;
  modoVisaoCount?: number;
}

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
        const bounds = pontosValidos.slice(0, 300).map((p) => [p.latitude!, p.longitude!] as [number, number]);
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
  height = "650px",
  selectedPonto,
  onSelectPonto,
  searchedLocation,
  onClearSearchedLocation,
  onConsultarViabilidade,
  modoVisaoLabel = "Operação do Dia",
  modoVisaoCount,
}: CockpitMapProps) {
  const [mostrarSellers, setMostrarSellers] = useState<boolean>(false);
  const [selectedSeller, setSelectedSeller] = useState<CockpitD1SellerMapa | null>(null);
  const [mapStyle, setMapStyle] = useState<"esri_dark" | "osm" | "esri_sat">("esri_dark");

  const googleMapsRedPin = useMemo(() => createGoogleMapsPinIcon(), []);

  const pontosValidos = useMemo(() => {
    return pontos.filter(
      (p) => p.latitude !== null && p.latitude !== undefined && p.longitude !== null && p.longitude !== undefined
    );
  }, [pontos]);

  const sellersValidos = useMemo(() => {
    return sellers.filter(
      (s) => s.latitude !== null && s.latitude !== undefined && s.longitude !== null && s.longitude !== undefined
    );
  }, [sellers]);

  return (
    <div 
      style={{ height }}
      className="relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-[#090D16] shadow-2xl"
    >
      {/* Top Floating Info & Active Location (Left) */}
      <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2 max-w-[calc(100%-240px)] pointer-events-none">
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-2 bg-slate-900/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/80 shadow-xl text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-bold text-white">{modoVisaoLabel}:</span>
            <span className="font-mono text-emerald-400 font-bold">
              {(modoVisaoCount !== undefined ? modoVisaoCount : pontosValidos.length).toLocaleString("pt-BR")} pontos
            </span>
          </div>

          {searchedLocation && (
            <div className="flex items-center gap-2 bg-rose-950/95 border border-rose-500/60 text-rose-200 px-3 py-1.5 rounded-xl shadow-xl backdrop-blur-md text-xs animate-in fade-in">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span className="font-bold truncate max-w-[200px] sm:max-w-xs" title={searchedLocation.display_name}>
                📍 {searchedLocation.display_name}
              </span>
              {searchedLocation.cidade && onConsultarViabilidade && (
                <button
                  type="button"
                  onClick={() => onConsultarViabilidade(searchedLocation.cidade!, searchedLocation.estado)}
                  className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded text-[10px] flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Viabilidade</span>
                </button>
              )}
              {onClearSearchedLocation && (
                <button
                  type="button"
                  onClick={onClearSearchedLocation}
                  className="hover:text-white p-0.5 rounded cursor-pointer"
                  title="Remover ponto de busca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Top Floating Controls (Right) */}
      <div className="absolute top-4 right-4 z-[1000] flex items-center gap-2 pointer-events-auto">
        {sellersValidos.length > 0 && (
          <button
            onClick={() => setMostrarSellers(!mostrarSellers)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all border backdrop-blur-md shadow-xl cursor-pointer ${
              mostrarSellers
                ? "bg-cyan-600 text-white border-cyan-400/60 shadow-cyan-500/20"
                : "bg-slate-900/90 text-cyan-400 border-slate-700/80 hover:bg-slate-800"
            }`}
            title="Exibir conexões dos Sellers (origem) com os pontos de triagem"
          >
            <GitFork className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Spoke-Hub Sellers ({sellersValidos.length})</span>
          </button>
        )}

        {/* Map Tile Switcher */}
        <div className="flex items-center gap-1 bg-slate-900/95 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-xl">
          <button
            onClick={() => setMapStyle("esri_dark")}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              mapStyle === "esri_dark" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
            }`}
            title="Visualização Escura Operacional"
          >
            Escuro
          </button>
          <button
            onClick={() => setMapStyle("osm")}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              mapStyle === "osm" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
            }`}
            title="Mapa Padrão de Ruas"
          >
            Ruas
          </button>
          <button
            onClick={() => setMapStyle("esri_sat")}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
              mapStyle === "esri_sat" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
            }`}
            title="Visão de Satélite"
          >
            Satélite
          </button>
        </div>
      </div>

      {/* Bottom Floating Legend (Right) */}
      <div className="absolute bottom-4 right-4 z-[1000] hidden md:flex flex-col gap-1.5 bg-slate-900/95 backdrop-blur-md p-3 rounded-xl border border-slate-700/80 shadow-2xl text-[11px] pointer-events-auto">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
          Legenda da Malha
        </span>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
          <span className="text-white font-medium">MiniDrop Parceiro (Drop-off)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm shadow-amber-500/50" />
          <span className="text-white font-medium">Ponto Avançado (PA / Ship-from-Store)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-sm shadow-purple-500/50" />
          <span className="text-white font-medium">HUB Central ANJUN (GLP / Transferência)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
          <span className="text-slate-300 font-medium">Ponto de Rede Conveniada</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full border-2 border-red-500 bg-red-500/30 animate-pulse" />
          <span className="text-red-400 font-semibold">🚨 Alerta de Backlog Retido</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-600 border border-slate-500" />
          <span className="text-slate-400">⛔ Inativo / Desativado</span>
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
          searchedLocation={searchedLocation}
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

        {/* Spoke-Hub Sellers Lines */}
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
                click: () => setSelectedSeller(isSelected ? null : s),
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
            </CircleMarker>
          );
        })}

        {/* Pontos de Coleta da Malha (MD, PA, HUB, Rede) */}
        {pontosValidos.map((p, idx) => {
          const isHub = p.tipo_ponto === "HUB";
          const isPa = p.tipo_ponto === "PA";
          const isRede = p.tipo_ponto === "PONTO_REDE";
          const isMd = !isHub && !isPa && !isRede;
          const isSelected = selectedPonto?.ponto_colecao === p.ponto_colecao;
          const isInactive = p.status_cadastro === "INATIVO";
          const hasBacklogAlert = Boolean(p.alerta_backlog);

          // Raio proporcional ao volume (se tiver volume)
          let baseRadius = 6;
          if (p.volume > 0) {
            baseRadius = isHub 
              ? Math.min(26, Math.max(12, Math.log10(p.volume + 1) * 5.2))
              : isPa
              ? Math.min(22, Math.max(9, Math.log10(p.volume + 1) * 4.2))
              : Math.min(20, Math.max(7.5, Math.log10(p.volume + 1) * 3.8));
          } else {
            baseRadius = isInactive ? 4.5 : 5.5;
          }

          // Cores oficiais
          let strokeColor = "#10b981"; // MD
          let fillColor = "#059669";

          if (isInactive) {
            strokeColor = "#94a3b8";
            fillColor = "#475569";
          } else if (hasBacklogAlert) {
            strokeColor = "#ef4444";
            fillColor = p.grau_backlog === "CRITICO" ? "#dc2626" : "#f97316";
          } else if (isHub) {
            strokeColor = "#c084fc";
            fillColor = "#9333ea";
          } else if (isPa) {
            strokeColor = "#fbbf24";
            fillColor = "#d97706";
          } else if (isRede) {
            strokeColor = "#38bdf8";
            fillColor = "#0284c7";
          }

          if (isSelected) {
            strokeColor = "#ffffff";
            fillColor = "#38bdf8";
          }

          return (
            <CircleMarker
              key={`pt-${p.ponto_colecao}-${idx}`}
              center={[p.latitude!, p.longitude!]}
              radius={isSelected ? baseRadius + 4 : baseRadius}
              eventHandlers={{
                click: () => {
                  if (onSelectPonto) onSelectPonto(p);
                },
              }}
              pathOptions={{
                color: strokeColor,
                fillColor: fillColor,
                fillOpacity: isSelected ? 1 : (isInactive ? 0.45 : (isHub ? 0.92 : 0.82)),
                weight: isSelected ? 3.5 : (hasBacklogAlert ? 3 : (isHub ? 2.5 : 1.5)),
                dashArray: isInactive ? "3, 3" : undefined,
              }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={0.96}>
                <div className="text-xs font-sans p-0.5">
                  <div className="font-bold flex items-center gap-1.5 text-white">
                    {isInactive ? (
                      <Ban className="w-3.5 h-3.5 text-slate-400" />
                    ) : isHub ? (
                      <Building2 className="w-3.5 h-3.5 text-purple-400" />
                    ) : isPa ? (
                      <Store className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Store className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>{p.ponto_colecao}</span>
                    {p.cidade && <span className="text-[10px] text-slate-300 font-normal">({p.cidade})</span>}
                  </div>
                  <div className="text-[10px] text-slate-300 font-medium">
                    {isInactive ? "⛔ Ponto Inativo / Desativado" : p.tipo_label}
                  </div>
                  
                  {p.volume > 0 ? (
                    <div className="text-[11px] font-mono text-emerald-400 font-bold mt-1">
                      {p.volume.toLocaleString("pt-BR")} pcts • Taxa: {p.taxa_coleta}%
                    </div>
                  ) : (
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                      Sem movimento na data
                    </div>
                  )}

                  {hasBacklogAlert && (
                    <div className="text-[10px] font-bold text-rose-400 flex items-center gap-1 mt-0.5 animate-pulse">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Backlog Retido: {p.backlog.toLocaleString("pt-BR")} pacotes!</span>
                    </div>
                  )}
                </div>
              </Tooltip>

              <Popup>
                <div className="p-2 min-w-[240px] font-sans text-slate-900 space-y-2">
                  <div className="border-b pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-black text-white ${
                          isInactive
                            ? "bg-slate-600"
                            : isHub
                            ? "bg-purple-600"
                            : isPa
                            ? "bg-amber-600"
                            : isRede
                            ? "bg-sky-600"
                            : "bg-emerald-600"
                        }`}
                      >
                        {isInactive ? "INATIVO / EXCLUÍDO" : p.tipo_label}
                      </span>
                      {hasBacklogAlert && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-600 text-white animate-pulse">
                          🚨 ALERTA BACKLOG
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 mt-1 leading-tight">
                      {p.nome_display || p.ponto_colecao}
                    </h3>
                    <p className="text-[11px] text-slate-500 font-mono">Código: {p.ponto_colecao}</p>
                    <p className="text-xs text-slate-600">
                      {p.cidade || "N/A"}{p.estado ? ` - ${p.estado}` : ""} {p.cep ? `(CEP ${p.cep})` : ""}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="bg-slate-100 p-1.5 rounded">
                      <span className="text-[10px] text-slate-500 block">Volume do Dia:</span>
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
                      <span className="font-mono font-bold text-rose-600">{p.backlog.toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="flex justify-between items-center text-slate-700">
                      <span>Taxa de Coleta:</span>
                      <span className="font-mono font-bold">{p.taxa_coleta}%</span>
                    </div>
                  </div>

                  {p.latitude && p.longitude && (
                    <div className="pt-2 border-t mt-2">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full text-center py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-xs flex items-center justify-center gap-1 transition-all"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Abrir no Google Maps</span>
                      </a>
                    </div>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}

        {/* Marcador do Endereço Pesquisado (Google Maps Red Pin) */}
        {searchedLocation && googleMapsRedPin && (
          <Marker
            position={[searchedLocation.latitude, searchedLocation.longitude]}
            icon={googleMapsRedPin}
          >
            <Popup>
              <div className="p-2 min-w-[240px] font-sans text-slate-900 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-black text-rose-600 border-b pb-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Localização Pesquisada</span>
                </div>
                <p className="text-xs font-bold text-slate-900 leading-snug">
                  {searchedLocation.display_name}
                </p>
                {searchedLocation.cidade && (
                  <p className="text-[11px] text-slate-600">
                    {searchedLocation.cidade} - {searchedLocation.estado}
                  </p>
                )}
                {searchedLocation.md_mais_proximo && (
                  <div className="bg-emerald-50 border border-emerald-200 p-1.5 rounded text-[11px] mt-1">
                    <span className="text-emerald-800 font-bold block">MiniDrop mais próximo:</span>
                    <span className="font-semibold">{searchedLocation.md_mais_proximo.codigo}</span> ({searchedLocation.md_mais_proximo.distancia_km} km)
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
