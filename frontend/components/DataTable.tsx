"use client";

import React from "react";
import { RegionalResumo } from "../lib/api";
import { ArrowUpDown } from "lucide-react";

interface DataTableProps {
  data: RegionalResumo[];
  selectedRegional: string | null;
  onSelectRegional: (regional: string | null) => void;
  loading?: boolean;
}

export default function DataTable({
  data,
  selectedRegional,
  onSelectRegional,
  loading = false,
}: DataTableProps) {
  const [sortField, setSortField] = React.useState<keyof RegionalResumo>("total");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");

  const handleSort = (field: keyof RegionalResumo) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const sortedData = React.useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortOrder === "asc" 
          ? aVal.localeCompare(bVal) 
          : bVal.localeCompare(aVal);
      }
      
      // Numbers with fallback to 0 to prevent NaN
      const numA = typeof aVal === "number" ? aVal : 0;
      const numB = typeof bVal === "number" ? bVal : 0;
      
      return sortOrder === "asc" 
        ? numA - numB 
        : numB - numA;
    });
  }, [data, sortField, sortOrder]);

  if (loading) {
    return (
      <div className="glass-panel p-6 rounded-2xl border border-border animate-pulse space-y-4">
        <div className="h-6 w-48 bg-slate-800 rounded"></div>
        <div className="space-y-2 mt-4">
          <div className="h-10 w-full bg-slate-800 rounded"></div>
          <div className="h-10 w-full bg-slate-800 rounded"></div>
          <div className="h-10 w-full bg-slate-800 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-2xl border border-border overflow-hidden">
      <div className="p-6 border-b border-border flex justify-between items-center bg-[#0C101B]/40">
        <div>
          <h2 className="text-lg font-semibold text-white">Performance por Regional</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Clique em uma linha para isolar dados da regional ou limpar filtros.
          </p>
        </div>
        {selectedRegional && (
          <button
            onClick={() => onSelectRegional(null)}
            className="px-3 py-1 text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-all"
          >
            Limpar Filtro ({selectedRegional})
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border bg-[#0C101B]/20 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              <th 
                className="py-4 px-6 cursor-pointer hover:text-white transition-all select-none"
                onClick={() => handleSort("regional")}
              >
                <div className="flex items-center gap-1">
                  <span>Regional</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th 
                className="py-4 px-6 text-right cursor-pointer hover:text-white transition-all select-none"
                onClick={() => handleSort("total")}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Total Pacotes</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th 
                className="py-4 px-6 text-right cursor-pointer hover:text-white transition-all select-none"
                onClick={() => handleSort("backlog")}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Backlog</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th 
                className="py-4 px-6 text-right cursor-pointer hover:text-white transition-all select-none"
                onClick={() => handleSort("taxa_coleta")}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Eficiência</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
              <th 
                className="py-4 px-6 text-right cursor-pointer hover:text-white transition-all select-none"
                onClick={() => handleSort("erros_lacre")}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Erros Lacre</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
              </th>
            </tr>
          </thead>
          
          <tbody className="divide-y divide-border/60 text-sm text-slate-300">
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground font-medium">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              sortedData.map((row) => {
                const isSelected = selectedRegional === row.regional;
                return (
                  <tr
                    key={row.regional}
                    onClick={() => onSelectRegional(isSelected ? null : row.regional)}
                    className={`cursor-pointer transition-all hover:bg-slate-800/30 ${
                      isSelected 
                        ? "bg-blue-500/5 text-white border-l-4 border-l-primary" 
                        : "border-l-4 border-l-transparent"
                    }`}
                  >
                    <td className="py-4 px-6 font-semibold">{row.regional}</td>
                    <td className="py-4 px-6 text-right font-mono">{(row.total ?? 0).toLocaleString()}</td>
                    <td className="py-4 px-6 text-right font-mono text-warning">{(row.backlog ?? 0).toLocaleString()}</td>
                    <td className="py-4 px-6 text-right font-semibold">
                      <span className={(row.taxa_coleta ?? 0) >= 98 ? "text-success" : (row.taxa_coleta ?? 0) >= 90 ? "text-warning" : "text-destructive"}>
                        {(row.taxa_coleta ?? 0).toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right font-mono text-destructive">{(row.erros_lacre ?? 0).toLocaleString()}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
