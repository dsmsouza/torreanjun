"use client";

import React, { useEffect } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

interface Stop {
  seq: number;
  iata: string;
  endereco: string;
  bairro: string;
  cidade: string;
  cep: string;
  janela1: string;
  janela2: string;
  horario_limite: string;
  vol_d0: number;
  bipada_d0: number;
  backlog_d0: number;
  vol_d1: number;
  sacas: number;
  lat: number | null;
  lng: number | null;
}

interface SaturacaoMapProps {
  stops: Stop[];
  coordsPath: [number, number][];
  corHex: string;
  rotaNome: string;
}

// Componente para reajustar o zoom automaticamente para a rota selecionada
function ChangeMapView({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coords && coords.length > 0) {
      if (coords.length === 1) {
        map.setView(coords[0], 14, { animate: true });
      } else {
        const bounds = L.latLngBounds(coords);
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: true });
      }
    }
  }, [coords, map]);
  return null;
}

export default function SaturacaoMap({ stops, coordsPath, corHex, rotaNome }: SaturacaoMapProps) {
  const validStops = stops.filter((s) => s.lat !== null && s.lng !== null);
  const defaultCenter: [number, number] = coordsPath.length > 0 ? coordsPath[0] : [-23.5489, -46.6388];

  return (
    <div className="relative w-full h-[500px] rounded-2xl overflow-hidden border border-border/60 shadow-xl bg-[#0B0F19]">
      {/* Badge da Rota no Mapa */}
      <div className="absolute top-4 left-4 z-[1000] bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 shadow-lg flex items-center gap-3">
        <span className="w-3.5 h-3.5 rounded-full shadow" style={{ backgroundColor: corHex }} />
        <div>
          <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Itinerário em Exibição</span>
          <span className="text-sm font-bold text-white">{rotaNome} ({validStops.length} paradas com GPS)</span>
        </div>
      </div>

      <MapContainer
        center={defaultCenter}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
        preferCanvas={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ChangeMapView coords={coordsPath} />

        {/* Linha de Traçado da Rota (Trajetória Conectando Parada 1 -> 2 -> 3) */}
        {coordsPath.length > 1 && (
          <>
            {/* Glow / Halo Externo Branco para Alto Contraste */}
            <Polyline
              positions={coordsPath}
              pathOptions={{
                color: "#ffffff",
                weight: 9,
                opacity: 0.9,
                lineCap: "round",
                lineJoin: "round"
              }}
            />
            {/* Linha Central Colorida com a Cor do Nível de Saturação */}
            <Polyline
              positions={coordsPath}
              pathOptions={{
                color: corHex || "#3b82f6",
                weight: 5,
                opacity: 1.0,
                lineCap: "round",
                lineJoin: "round"
              }}
            />
          </>
        )}

        {/* Marcadores das Paradas Numeradas */}
        {validStops.map((stop) => {
          const pos: [number, number] = [stop.lat!, stop.lng!];
          return (
            <CircleMarker
              key={`${stop.iata}-${stop.seq}`}
              center={pos}
              radius={13}
              pathOptions={{
                color: "#ffffff",
                fillColor: corHex || "#3b82f6",
                fillOpacity: 1.0,
                weight: 3
              }}
            >
              {/* Tooltip com a identificação rápida ao passar o mouse */}
              <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                <div className="text-xs font-semibold">
                  <span className="text-emerald-400 font-bold">#{stop.seq}</span> {stop.iata}
                  <div className="text-[11px] font-normal text-slate-300">{stop.endereco}</div>
                  <div className="text-[11px] text-amber-300">D-0: {stop.vol_d0} pct | D-1: {stop.vol_d1} pct</div>
                </div>
              </Tooltip>

              {/* Popup detalhado com cards ao clicar */}
              <Popup>
                <div className="p-1 space-y-2 text-slate-800 text-xs min-w-[240px]">
                  <div className="flex items-center justify-between border-b pb-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold text-white shadow-sm" style={{ backgroundColor: corHex }}>
                      Parada #{stop.seq}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{stop.iata}</span>
                  </div>

                  <p className="text-slate-600 leading-tight">
                    <strong>Endereço:</strong> {stop.endereco}
                  </p>
                  <p className="text-slate-600">
                    <strong>Bairro/Cidade:</strong> {stop.bairro} - {stop.cidade}
                  </p>
                  {stop.janela2 && (
                    <p className="text-slate-700 font-semibold">
                      <strong>Horário Limite:</strong> {stop.janela2}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200">
                    <div className="bg-slate-100 p-2 rounded text-center">
                      <span className="text-[10px] uppercase text-slate-500 font-bold block">Volume D-0 (Hoje)</span>
                      <span className="text-sm font-extrabold text-blue-600">{stop.vol_d0} pct</span>
                      <span className="text-[10px] text-slate-400 block">Bip: {stop.bipada_d0} | Bk: {stop.backlog_d0}</span>
                    </div>
                    <div className="bg-slate-100 p-2 rounded text-center">
                      <span className="text-[10px] uppercase text-slate-500 font-bold block">Volume D-1 (Ontem)</span>
                      <span className="text-sm font-extrabold text-slate-800">{stop.vol_d1} pct</span>
                      <span className="text-[10px] text-slate-400 block">{stop.vol_d1 > 0 ? "Realizado" : "Sem Bipagem"}</span>
                    </div>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
