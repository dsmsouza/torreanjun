"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

export default function LeafletMap({ points, onUpdateObservacao }: any) {
  return (
    <MapContainer 
      center={[-15.7801, -47.9292]} 
      zoom={5} 
      style={{ height: "100%", width: "100%" }}
      preferCanvas={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {points.map((p: any) => {
        if (!p.latitude || !p.longitude) return null;
        
        const hasObs = p.observacao && p.observacao.trim() !== "";
        const isActive = p.status?.toLowerCase().includes("enable");
        
        // Define colors based on status and observation
        let fillColor = isActive ? "#3b82f6" : "#ef4444"; // Blue if active, Red if disabled
        if (hasObs) fillColor = "#f59e0b"; // Amber if it has observation
        
        return (
          <CircleMarker 
            key={p.id} 
            center={[p.latitude, p.longitude]}
            radius={isActive ? 6 : 4}
            fillColor={fillColor}
            color={fillColor}
            weight={1}
            opacity={0.8}
            fillOpacity={0.6}
          >
            <Popup>
              <div className="p-1 space-y-2 text-slate-800 text-sm min-w-[240px]">
                <h3 className="font-bold text-blue-600 border-b pb-1 text-base">IATA: {p.iata || p.nome}</h3>
                <p><strong>Nome:</strong> {p.nome}</p>
                <p><strong>Endereço:</strong> {p.endereco}</p>
                <p><strong>Cidade/Estado:</strong> {p.cidade} - {p.estado}</p>
                <p><strong>CEP:</strong> {p.cep}</p>
                <p><strong>Horário:</strong> {p.horario}</p>
                <p><strong>Provedor:</strong> {p.provedor}</p>
                <div className="flex justify-between items-center mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {p.status}
                  </span>
                </div>
                
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <p className="font-semibold text-xs mb-1 text-amber-600">Observação:</p>
                  <textarea 
                    className="w-full text-sm p-2 border border-slate-300 rounded focus:border-blue-500 outline-none"
                    rows={2}
                    defaultValue={p.observacao}
                    onBlur={(e) => onUpdateObservacao(p.id, e.target.value)}
                    placeholder="Ex: trocar esse ponto"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">Ao sair da caixa, a observação salva automaticamente.</p>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
