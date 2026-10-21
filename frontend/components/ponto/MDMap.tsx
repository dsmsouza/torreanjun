"use client";

import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";

// Fix leaflet icon issue in Next.js
const customIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface MDMapProps {
  latitude: number;
  longitude: number;
  nome: string;
  codigo: string;
}

export default function MDMap({ latitude, longitude, nome, codigo }: MDMapProps) {
  useEffect(() => {
    // This forces a re-render of leaflet maps to avoid gray tiles when hidden/shown
    window.dispatchEvent(new Event("resize"));
  }, []);

  if (!latitude || !longitude) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 rounded-xl border border-slate-200">
        <p className="text-slate-500">Coordenadas não disponíveis</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full rounded-xl overflow-hidden shadow-sm border border-slate-200 z-0 relative">
      <MapContainer 
        center={[latitude, longitude]} 
        zoom={14} 
        style={{ height: "100%", width: "100%", zIndex: 0 }}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        <Circle 
          center={[latitude, longitude]} 
          radius={500} // 500 meters radius
          pathOptions={{ color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 1 }}
        />
        <Marker position={[latitude, longitude]} icon={customIcon}>
          <Popup>
            <div className="text-center">
              <strong className="block text-sm">{nome}</strong>
              <span className="text-xs text-slate-500">{codigo}</span>
            </div>
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
