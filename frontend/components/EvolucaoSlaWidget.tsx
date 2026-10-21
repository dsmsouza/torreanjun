"use client";

import React, { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import { Loader2 } from "lucide-react";
import { API_URL } from "../lib/api";

interface EvolucaoSlaWidgetProps {
  selectedRegional: string | null;
  periodoTipo: string;
}

export default function EvolucaoSlaWidget({ selectedRegional, periodoTipo }: EvolucaoSlaWidgetProps) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDados = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/api/evolucao/dados`);
        if (!res.ok) throw new Error("Network response was not ok");
        const data = await res.json();
        
        let filtered = data.data || [];
        
        // Filter by regional if selected
        if (selectedRegional) {
          filtered = filtered.filter((d: any) => d.regional === selectedRegional);
        }

        // Determine grouping based on PeriodoTipo
        const agrupamento = periodoTipo === "Mensal" ? "MES" : periodoTipo === "Semanal" ? "SEMANA" : "DIA";

        // Enrich with month
        filtered = filtered.map((d: any) => {
          const parts = (d.semana_base || "").split("-");
          const mes = parts.length > 1 ? parts[1].trim() : "Outros";
          return { ...d, mes };
        });

        // Aggregate
        const chartDataMap = new Map();
        filtered.forEach((d: any) => {
          let timeKey = "";
          if (agrupamento === "MES") timeKey = d.mes;
          else if (agrupamento === "SEMANA") timeKey = d.semana_base || "Sem Data";
          else timeKey = d.dia_base || "Sem Data";

          // If day format is DD/MM/YYYY, convert to sortable YYYY-MM-DD for sorting only?
          let sortKey = timeKey;
          if (agrupamento === "DIA" && timeKey.includes("/")) {
              const [dia, mes, ano] = timeKey.split("/");
              sortKey = `${ano}-${mes}-${dia}`;
          }
          
          if (!chartDataMap.has(timeKey)) {
            chartDataMap.set(timeKey, {
              timeKey: timeKey,
              sortKey: sortKey,
              total_pacotes: 0,
              total_backlog: 0,
            });
          }
          const curr = chartDataMap.get(timeKey);
          curr.total_pacotes += d.total_pacotes;
          curr.total_backlog += d.total_backlog;
        });

        let finalData = Array.from(chartDataMap.values()).map(d => {
          const sla = d.total_pacotes > 0 ? ((d.total_pacotes - d.total_backlog) / d.total_pacotes) * 100 : 0;
          return {
            ...d,
            sla_coleta: parseFloat(sla.toFixed(2))
          };
        }).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
        
        // Limit to last 15 points if DIA to avoid crowding the chart
        if (agrupamento === "DIA" && finalData.length > 15) {
            finalData = finalData.slice(-15);
        }

        setChartData(finalData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDados();
  }, [selectedRegional, periodoTipo]);

  return (
    <div className="glass-panel p-6 rounded-2xl border border-border w-full mt-6">
      <h2 className="text-lg font-bold text-white mb-4">Evolução do SLA de Coleta (%)</h2>
      {loading ? (
        <div className="flex justify-center items-center h-[300px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : chartData.length === 0 ? (
          <div className="flex justify-center items-center h-[300px] text-muted-foreground">
              Sem dados históricos para a visualização
          </div>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="timeKey" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px", color: "#f8fafc" }}
                itemStyle={{ color: "#10b981" }}
              />
              <Line type="monotone" dataKey="sla_coleta" name="SLA (%)" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }}>
                <LabelList dataKey="sla_coleta" position="top" fill="#10b981" fontSize={11} formatter={(val: any) => val + '%'} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
