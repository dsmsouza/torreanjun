import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup, useMap, Polyline, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Ruler, Trash2, Sparkles, MapPin, Flame, Building2, CheckCircle2, ShieldAlert } from "lucide-react";

interface MapComponentProps {
  pontos: any[];
  center: [number, number];
  zoom: number;
  onUpdate?: () => void;
  onMarkerClick?: (p: any) => void;
  isMeasuring?: boolean;
  oportunidades?: any[];
  mostrarOportunidades?: boolean;
  activeMD?: any;
  setActiveMD?: (p: any) => void;
}

// Sub-component to handle map flying (panning)
function MapController({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.5 });
  }, [center, zoom, map]);
  return null;
}

// Sub-component to handle free clicks anywhere on map for ruler
function MapClickHandler({ isMeasuring, onMapClick }: { isMeasuring: boolean, onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (isMeasuring) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    }
  });
  return null;
}

export default function MapComponent({ 
  pontos, 
  center, 
  zoom, 
  onUpdate, 
  onMarkerClick, 
  isMeasuring = false,
  oportunidades = [],
  mostrarOportunidades = false,
  activeMD,
  setActiveMD
}: MapComponentProps) {
  
  const [measurePoints, setMeasurePoints] = useState<any[]>([]);
  const [totalDistance, setTotalDistance] = useState(0);

  // Clear measurement when toggled off
  useEffect(() => {
    if (!isMeasuring) {
      setMeasurePoints([]);
      setTotalDistance(0);
    }
  }, [isMeasuring]);

  const addPointToMeasurement = (lat: number, lng: number, label?: string) => {
    const point = { latitude: lat, longitude: lng, label: label || `Ponto ${measurePoints.length + 1}` };
    const newPoints = [...measurePoints, point];
    setMeasurePoints(newPoints);
    
    if (newPoints.length > 1) {
      let dist = 0;
      for (let i = 0; i < newPoints.length - 1; i++) {
        const latlng1 = L.latLng(newPoints[i].latitude, newPoints[i].longitude);
        const latlng2 = L.latLng(newPoints[i+1].latitude, newPoints[i+1].longitude);
        dist += latlng1.distanceTo(latlng2) / 1000; // in km
      }
      setTotalDistance(dist);
    }
  };

  const handleMarkerClick = (p: any) => {
    if (isMeasuring) {
      addPointToMeasurement(p.latitude, p.longitude, p.iata);
    } else {
      if (setActiveMD) setActiveMD(p);
      if (onMarkerClick) onMarkerClick(p);
    }
  };

  const getColor = (p: any) => {
    // 1. Manual observation overrides everything
    if (p.status_cor) {
      switch (p.status_cor) {
        case 'verde': return '#10B981'; // emerald-500
        case 'amarelo': return '#F59E0B'; // amber-500
        case 'vermelho': return '#F43F5E'; // rose-500
      }
    }
    
    // 2. Novo MD (Ramp-up <= 60 dias) -> Distinctive Orange/Amber color!
    if (p.is_novo_md || (p.dias_operacao !== undefined && p.dias_operacao <= 60 && p.dias_operacao >= 0)) {
      return '#FF6B00'; // Vibrant Orange-Amber for Novo MD
    }

    // 3. Default logic based on shein status
    const sheinStatus = p.shein ? p.shein.toString().toLowerCase() : '';
    if (sheinStatus === 'enable') return '#10B981'; // emerald-500
    if (sheinStatus === 'disable') return '#F43F5E'; // rose-500
    
    // 4. Absolute fallback
    return '#3b82f6'; // blue-500
  };

  return (
    <MapContainer 
      center={center} 
      zoom={zoom} 
      style={{ width: "100%", height: "100%", background: "#0F172A", zIndex: 10 }}
    >
      <MapController center={center} zoom={zoom} />
      <MapClickHandler 
        isMeasuring={isMeasuring} 
        onMapClick={(lat, lng) => addPointToMeasurement(lat, lng)} 
      />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Measurement Polyline */}
      {isMeasuring && measurePoints.length > 0 && (
        <Polyline 
          positions={measurePoints.map(p => [p.latitude, p.longitude])} 
          color="#10B981" 
          weight={3}
          dashArray="5, 10" 
        />
      )}

      {/* Measurement Points Markers */}
      {isMeasuring && measurePoints.map((mp, idx) => (
        <CircleMarker
          key={`measure-${idx}`}
          center={[mp.latitude, mp.longitude]}
          radius={7}
          pathOptions={{
            color: "#10B981",
            fillColor: "#ffffff",
            fillOpacity: 1,
            weight: 2
          }}
        >
          <Tooltip permanent direction="top" className="bg-[#0C101B] border-emerald-500 text-emerald-400 font-mono text-[10px] px-1.5 py-0.5">
            {mp.label || `P${idx + 1}`}
          </Tooltip>
        </CircleMarker>
      ))}

      {/* Measurement Floating Panel */}
      {isMeasuring && (
        <div className="absolute top-4 right-4 z-[1000] bg-slate-900/95 border border-emerald-500/30 rounded-xl p-4 shadow-2xl backdrop-blur-md min-w-[220px]">
          <div className="flex items-center justify-between mb-2 border-b border-slate-700/60 pb-2">
            <div className="flex items-center gap-2 text-emerald-400">
              <Ruler className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Régua de Medição</span>
            </div>
            <button 
              onClick={() => { setMeasurePoints([]); setTotalDistance(0); }} 
              className="text-slate-400 hover:text-rose-400 transition-colors p-1 rounded hover:bg-slate-800"
              title="Limpar medição"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase font-bold text-slate-400">Distância Linear Acumulada</p>
            <p className="text-2xl font-black text-white">{totalDistance.toFixed(2)} <span className="text-sm font-bold text-emerald-400">km</span></p>
            <p className="text-[11px] text-slate-400 mt-2 leading-tight">
              {measurePoints.length === 0 && "Clique no mapa ou nos MDs para começar a medir."}
              {measurePoints.length === 1 && "Clique em outro ponto para calcular a distância."}
              {measurePoints.length > 1 && `${measurePoints.length} pontos conectados.`}
            </p>
          </div>
        </div>
      )}

      {/* Oportunidades / Vácuos de Expansão */}
      {mostrarOportunidades && oportunidades.map((op, idx) => {
        if (!op.latitude || !op.longitude) return null;
        return (
          <CircleMarker
            key={`op-${idx}`}
            center={[op.latitude, op.longitude]}
            radius={9}
            pathOptions={{
              color: "#A855F7",
              fillColor: "#A855F7",
              fillOpacity: 0.85,
              weight: 2
            }}
          >
            <Tooltip direction="top" className="bg-[#0C101B] border-purple-500 text-white text-xs px-2 py-1">
              <div className="font-bold text-purple-300">⚡ Oportunidade de Expansão</div>
              <div>{op.cidade} - {op.bairro}</div>
              <div className="text-slate-300">{op.total_pedidos?.toLocaleString()} pedidos ({op.qtd_sellers} sellers)</div>
            </Tooltip>
          </CircleMarker>
        );
      })}

      {/* Pontos MDs Cadastrados */}
      {pontos.map((p, idx) => {
        if (!p.latitude || !p.longitude) return null;
        const color = getColor(p);
        const isNovo = p.is_novo_md || (p.dias_operacao !== undefined && p.dias_operacao <= 60 && p.dias_operacao >= 0);
        
        // Highlight marker if it's part of the measurement route
        const isMeasured = isMeasuring && measurePoints.some(mp => mp.latitude === p.latitude && mp.longitude === p.longitude);
        const finalColor = isMeasured ? "#10B981" : color;
        const finalRadius = isNovo ? 9 : (isMeasured ? 10 : (p.status_cor ? 8 : 7));
        const finalWeight = isNovo ? 3 : (isMeasured ? 3 : (p.status_cor ? 2 : 1.5));
        
        return (
          <CircleMarker
            key={idx}
            center={[p.latitude, p.longitude]}
            radius={finalRadius} 
            eventHandlers={{
              click: () => handleMarkerClick(p)
            }}
            pathOptions={{
              color: isNovo ? "#FFA500" : finalColor,
              fillColor: finalColor,
              fillOpacity: isNovo ? 0.95 : (isMeasured ? 1 : 0.85),
              weight: finalWeight
            }}
          >
            <Tooltip 
              direction="right" 
              offset={[12, 0]} 
              opacity={0.9} 
              className="bg-[#0C101B] border-slate-700 text-white font-mono text-xs px-2 py-1"
            >
              {p.iata} {isNovo ? "🔥" : ""}
            </Tooltip>

            {/* Click Popup with rich MD details */}
            <Popup className="custom-md-popup">
              <div className="p-2 min-w-[240px] max-w-[280px] space-y-2.5 text-slate-100 font-sans">
                <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
                  <span className="font-mono font-bold text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    {p.iata}
                  </span>
                  {isNovo ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                      <Flame className="w-3 h-3 text-amber-400 animate-pulse" />
                      Novo MD ({p.dias_operacao || 0}d)
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" />
                      Ativo
                    </span>
                  )}
                </div>

                <div>
                  <h4 className="font-bold text-sm text-white leading-tight">
                    {p.collection_point_name || p.nome || "Ponto de Coleta ANJUN"}
                  </h4>
                  <p className="text-xs text-slate-300 mt-1 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{p.cidade || "Cidade não cadastrada"} - {p.estado || "SP"}</span>
                  </p>
                  {p.endere_o && (
                    <p className="text-[11px] text-slate-400 mt-1 pl-4 leading-tight">
                      {p.endere_o}
                    </p>
                  )}
                </div>

                {p.observacao && (
                  <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 text-[11px] text-slate-300">
                    <span className="font-bold text-slate-400 block mb-0.5">Observação:</span>
                    {p.observacao}
                  </div>
                )}

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-medium">Status Shein:</span>
                  <span className={`font-bold px-2 py-0.5 rounded ${p.shein === 'disable' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'}`}>
                    {p.shein === 'disable' ? 'Desativado' : 'Habilitado'}
                  </span>
                </div>
              </div>
            </Popup>

          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

