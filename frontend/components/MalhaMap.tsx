"use client";

import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
interface Point {
  md_codigo: string;
  nome_ponto: string;
  latitude: number;
  longitude: number;
  cep: string;
  endereco: string;
  horario_trabalho: string;
  horario_fechamento: string;
  fecha_cedo: boolean;
  cidade: string;
  estado: string;
  regional: string;
  volume: number;
  backlog: number;
  taxa_coleta: number;
  erros_lacre: number;
  histograma: Record<string, number>;
  observacao_fixa?: string;
  decisao?: string;
  funcionando?: string;
}

interface MalhaMapProps {
  points: Point[];
  selectedPoint: Point | null;
  onSelectPoint: (p: Point) => void;
  activeTransfer: { source: Point; target: Point } | null;
}

export default function MalhaMap({
  points,
  selectedPoint,
  onSelectPoint,
  activeTransfer
}: MalhaMapProps) {
  const mapRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);
  const [heatReady, setHeatReady] = useState<boolean>(false);
  const markersRef = useRef<Record<string, any>>({});
  const polylineRef = useRef<any>(null);
  const heatLayerRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const [isLight, setIsLight] = useState<boolean>(false);

  // Monitor theme changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsLight(localStorage.getItem("theme") === "light");
      const handleThemeChange = () => {
        setIsLight(localStorage.getItem("theme") === "light");
      };
      window.addEventListener("themechange", handleThemeChange);
      return () => window.removeEventListener("themechange", handleThemeChange);
    }
  }, []);

  // Load Leaflet.heat dynamically from CDN
  useEffect(() => {
    // Inject heatmap script if not already present
    const heatScriptId = "leaflet-heat-script";
    if (document.getElementById(heatScriptId) || (window as any).L?.heatLayer) {
        setHeatReady(true);
        return;
    }
    
    // Ensure L is globally available for the heat plugin
    (window as any).L = L;
    
    const heatScript = document.createElement("script");
    heatScript.id = heatScriptId;
    heatScript.src = "https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js";
    heatScript.async = true;
    heatScript.onload = () => {
      setHeatReady(true);
    };
    document.body.appendChild(heatScript);
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!L || !containerRef.current || mapRef.current) return;

    // Center on Brazil/SP coordinates by default
    const map = L.map(containerRef.current).setView([-23.5505, -46.6333], 11);
    mapRef.current = map;

    // Style override to match Leaflet popups and container to our theme
    const style = document.createElement("style");
    style.id = "leaflet-custom-popup-styles";
    style.innerHTML = `
      .leaflet-popup-content-wrapper, .leaflet-popup-tip {
        background: var(--card) !important;
        color: var(--card-foreground) !important;
        border: 1px solid var(--border) !important;
        border-radius: 12px !important;
      }
      .leaflet-popup-content {
        margin: 12px 16px !important;
      }
      .leaflet-container {
        font-family: inherit !important;
      }
    `;
    document.head.appendChild(style);

    return () => {
      const el = document.getElementById("leaflet-custom-popup-styles");
      if (el) {
        el.remove();
      }
    };
  }, []);

  // Reactive Tile Layer Switcher
  useEffect(() => {
    if (!L || !mapRef.current) return;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    const url = isLight
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    tileLayerRef.current = L.tileLayer(url, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(mapRef.current);
  }, [isLight]);

  // Update Markers
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove existing markers
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};

    if (points.length === 0) return;

    // Add markers for each point
    const markersList: any[] = [];
    points.forEach(p => {
      if (!p.latitude || !p.longitude) return;

      // Color coding based on operational decision status:
      // manter (default) -> green (#10B981)
      // observar -> yellow (#F59E0B)
      // trocar -> red (#EF4444)
      let color = "#10B981"; // default green
      const dec = p.decisao?.toLowerCase() || "manter";
      if (dec === "trocar") {
        color = "#EF4444"; // red
      } else if (dec === "observar") {
        color = "#F59E0B"; // yellow
      } else {
        color = "#10B981"; // green
      }

      // Check if selected
      const isSelected = selectedPoint && selectedPoint.md_codigo === p.md_codigo;
      const size = isSelected ? 16 : 10;
      const borderSize = isSelected ? 3 : 1.5;
      const borderStyle = "solid";
      const borderColor = "#fff";

      const customIcon = L.divIcon({
        className: 'custom-md-marker',
        html: `<div style="
          background-color: ${color}; 
          width: ${size}px; 
          height: ${size}px; 
          border-radius: 50%; 
          border: ${borderSize}px ${borderStyle} ${borderColor}; 
          box-shadow: 0 0 ${isSelected ? 14 : 6}px ${color};
          transition: all 0.2s ease;
        "></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2]
      });

      const marker = L.marker([p.latitude, p.longitude], { icon: customIcon })
        .addTo(mapRef.current)
        .on('click', () => {
          onSelectPoint(p);
        });

      // Bind simple tooltip
      // Bind simple tooltip
      const statusText = p.decisao ? `<br/><span style="color: #A78BFA;">🔄 Status: ${p.decisao}</span>` : "";
      const obsText = p.observacao_fixa ? `<br/><span style="color: #F87171;">⚠️ ${p.observacao_fixa}</span>` : "";
      marker.bindTooltip(`<strong>${p.md_codigo}</strong><br/>Vol: ${p.volume} | Fim: ${(p.horario_trabalho || "08:00-18:00").split("-")[1] || "18:00"}${statusText}${obsText}`, {
        direction: 'top',
        opacity: 0.9,
        className: 'border border-border bg-slate-900 text-slate-200 text-xs px-2 py-1 rounded shadow-md'
      });

      markersRef.current[p.md_codigo] = marker;
      markersList.push(marker);
    });

    // Zoom to fit bounds of SP area or all points on first load
    try {
      const group = L.featureGroup(markersList);
      mapRef.current.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 14 });
    } catch (e) {
      // Fallback center
      mapRef.current.setView([-23.5505, -46.6333], 10);
    }
  }, [points]);

  // Center Map on Selected Point when it changes
  useEffect(() => {
    if (!mapRef.current || !selectedPoint || !selectedPoint.latitude) return;
    mapRef.current.setView([selectedPoint.latitude, selectedPoint.longitude], 14, {
      animate: true,
      duration: 1.0
    });
  }, [selectedPoint]);

  // Draw Transfer Polyline
  useEffect(() => {
    if (!mapRef.current) return;

    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    if (activeTransfer) {
      const { source, target } = activeTransfer;
      
      // Draw transfer connection line (blue dashed)
      polylineRef.current = L.polyline(
        [[source.latitude, source.longitude], [target.latitude, target.longitude]],
        { 
          color: '#3B82F6', 
          weight: 3.5, 
          dashArray: '8, 12', 
          opacity: 0.85
        }
      ).addTo(mapRef.current);

      // Fit map to show the route
      mapRef.current.fitBounds(polylineRef.current.getBounds(), { padding: [80, 80] });
    }
  }, [activeTransfer]);

  // Update Heatmap Layer
  useEffect(() => {
    if (!mapRef.current) return;

    if (heatLayerRef.current) {
      heatLayerRef.current.remove();
      heatLayerRef.current = null;
    }

    if (!showHeatmap || points.length === 0) return;

    // Scale intensity based on the maximum volume among displayed points
    const maxVol = Math.max(...points.map(p => p.volume || 1), 1);
    const heatData = points
      .filter(p => p.latitude && p.longitude)
      .map(p => {
        const intensity = maxVol > 0 ? (p.volume || 0) / maxVol : 0.5;
        return [p.latitude, p.longitude, intensity];
      });

    if ((L as any).heatLayer) {
      heatLayerRef.current = (L as any).heatLayer(heatData, {
        radius: 25,
        blur: 15,
        maxZoom: 14,
        max: 1.0,
        gradient: {
          0.4: 'blue',
          0.6: 'cyan',
          0.7: 'lime',
          0.8: 'yellow',
          1.0: 'red'
        }
      }).addTo(mapRef.current);
    }
  }, [points, showHeatmap, heatReady]);

  return (
    <div className="relative w-full h-full min-h-[550px] rounded-2xl border border-border shadow-inner bg-slate-950 overflow-hidden">
      
      {/* Heatmap Toggle Overlay */}
      <div className="absolute top-4 right-4 z-[1000] bg-[#0C101B]/95 border border-border p-2.5 rounded-xl shadow-lg backdrop-blur">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showHeatmap}
            onChange={(e) => setShowHeatmap(e.target.checked)}
            className="w-4 h-4 rounded bg-[#0C101B] border-border text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
          />
          <span className="text-xs font-semibold text-slate-300">Exibir Mapa de Calor</span>
        </label>
      </div>
      <div ref={containerRef} className="w-full h-full min-h-[550px]" />
      
      {/* Small Map Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-[#0C101B]/95 border border-border p-3 rounded-xl shadow-lg text-[10px] space-y-1.5 backdrop-blur">
        <h4 className="font-semibold text-slate-300 uppercase tracking-wider mb-1">Legenda da Malha</h4>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white" />
          <span className="text-slate-400">Manter MD</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white" />
          <span className="text-slate-400">Observar MD</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 border border-white" />
          <span className="text-slate-400">Trocar MD</span>
        </div>
      </div>
    </div>
  );
}
