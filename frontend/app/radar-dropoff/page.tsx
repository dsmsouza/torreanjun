"use client";

import React, { useEffect, useState, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import {
  TrendingUp,
  MapPin,
  Search,
  RefreshCw,
  Package,
  AlertCircle,
  Truck,
  Calendar,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Store,
  Pencil,
  X,
  Check,
  Navigation,
  Globe,
  BarChart3,
  LineChart as LineChartIcon,
  Download
} from "lucide-react";
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { API_URL, fetchWithCache, fetchDropoffNovosMDsReport } from "@/lib/api";
import { useAuth } from "../../hooks/use-auth";

interface DropoffKPIs {
  vol_total: number;
  backlog_total: number;
  taxa_media: number;
  total_novos_mds?: number;
  vol_novos_mds?: number;
  top_regional: {
    regional: string;
    volume: number;
    taxa: number;
  } | null;
}

interface DropoffRegional {
  regional: string;
  volume: number;
  backlog: number;
  taxa_coleta: number;
}

interface EvolucaoItem {
  data: string;
  volume: number;
  backlog: number;
  breakdown?: Record<string, { volume: number; backlog: number }>;
}

interface MDItem {
  md: string;
  regional: string;
  estado: string;
  cidade: string;
  volume: number;
  backlog: number;
  taxa_coleta: number;
  status?: string;
  latitude?: number;
  longitude?: number;
  endereco?: string;
  tem_coordenadas?: boolean;
}

export default function RadarDropoffPage() {
  const { isMaster } = useAuth();
  
  // Options
  const [options, setOptions] = useState<{ dias: string[], semanas: string[], regionais: string[], cidades?: string[] }>({ dias: [], semanas: [], regionais: [], cidades: [] });
  const [optionsLoading, setOptionsLoading] = useState(true);

  // Filters
  const [periodoTipo, setPeriodoTipo] = useState<string>("Diário");
  const [rotulo, setRotulo] = useState<string>("Carregando...");
  const [dtInicio, setDtInicio] = useState("");
  const [dtFim, setDtFim] = useState("");
  
  const [regionalFiltro, setRegionalFiltro] = useState<string>("todos");
  const [cidadeFiltro, setCidadeFiltro] = useState<string>("todas");
  const [marketplaceFiltro, setMarketplaceFiltro] = useState<string>("Todos");
  const [marketplaces, setMarketplaces] = useState<string[]>(["Todos"]);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [page, setPage] = useState<number>(1);

  // Data states
  const [loading, setLoading] = useState<boolean>(true);
  const [kpis, setKpis] = useState<DropoffKPIs | null>(null);
  const [regionais, setRegionais] = useState<DropoffRegional[]>([]);
  const [evolucao, setEvolucao] = useState<EvolucaoItem[]>([]);
  const [novosMds, setNovosMds] = useState<MDItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // Modal de edição de cidade e coordenadas
  const [editingMd, setEditingMd] = useState<MDItem | null>(null);
  const [editCidade, setEditCidade] = useState("");
  const [editEstado, setEditEstado] = useState("");
  const [editEndereco, setEditEndereco] = useState("");
  const [editLat, setEditLat] = useState("");
  const [editLng, setEditLng] = useState("");
  const [savingCidade, setSavingCidade] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  // Sorting state for main MD table
  const [sortKey, setSortKey] = useState<string>("volume");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Sorting state for Novos MDs table
  const [sortNovosKey, setSortNovosKey] = useState<string>("volume_total");
  const [sortNovosDir, setSortNovosDir] = useState<"asc" | "desc">("desc");

  // Modal do Relatório Diário de Novos MDs
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportData, setReportData] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [apenasNovosFiltro, setApenasNovosFiltro] = useState(false);

  const handleOpenReportModal = async () => {
    setReportModalOpen(true);
    setReportLoading(true);
    try {
      const res = await fetchDropoffNovosMDsReport(regionalFiltro);
      setReportData(res.relatorio || []);
    } catch (err: any) {
      alert("Erro ao carregar relatório diário: " + err.message);
    } finally {
      setReportLoading(false);
    }
  };

  const exportarRelatorioNovosCSV = () => {
    if (!reportData || reportData.length === 0) return;
    const headers = ["MD", "Regional", "Cidade", "Data Credenciamento", "Dias Operacao", "Volume Total", "Backlog", "Taxa Coleta (%)", "Erros Lacre", "Bipagens Fora SLA (08h-18h)"];
    const rows = reportData.map(r => [
      `"${r.md}"`,
      `"${r.regional}"`,
      `"${r.cidade}"`,
      `"${r.data_credenciamento}"`,
      r.dias_operacao,
      r.volume_total,
      r.backlog_total,
      r.taxa_coleta,
      r.erros_lacre,
      r.bipagens_fora_sla
    ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_diario_novos_mds_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const [mdsFeed, setMdsFeed] = useState<{ total: number; pages: number; items: MDItem[] }>({
    total: 0,
    pages: 1,
    items: []
  });

  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [novosPage, setNovosPage] = useState<number>(1);

  const cleanCidades = (arr: string[]): string[] => {
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const seen = new Map<string, string>();
    for (const c of arr) {
      const k = norm((c || "").trim());
      if (!k) continue;
      if (!seen.has(k)) seen.set(k, c.trim());
    }
    return Array.from(seen.values()).sort((a, b) => norm(a).localeCompare(norm(b)));
  };

  useEffect(() => {
    fetch(`${API_URL}/api/opcoes`)
      .then(res => res.json())
      .then(data => {
        setOptions({ ...data, cidades: cleanCidades(data.cidades || []) });
        if (data.dias && data.dias.length > 0) {
          setRotulo(data.dias[0]);
        } else {
          setRotulo("latest");
        }
      })
      .catch(err => {
        console.error(err);
        setRotulo("latest");
      })
      .finally(() => setOptionsLoading(false));
      
    fetch(`${API_URL}/api/dropoff/radar/marketplaces`)
      .then(res => res.json())
      .then(data => {
        if (data.marketplaces) setMarketplaces(data.marketplaces);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => { fetchData(); fetchFeed(); }, 60000);
    return () => clearInterval(id);
  }, [autoRefresh, periodoTipo, rotulo, dtInicio, dtFim, regionalFiltro, marketplaceFiltro, cidadeFiltro]);

  useEffect(() => {
    setNovosPage(1);
  }, [novosMds.length]);

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const qParams = new URLSearchParams();
      qParams.set("periodo_tipo", periodoTipo);
      qParams.set("rotulo", rotulo);
      if (dtInicio) qParams.set("dt_inicio", dtInicio);
      if (dtFim) qParams.set("dt_fim", dtFim);
      if (regionalFiltro !== "todos") qParams.set("regional", regionalFiltro);
      if (marketplaceFiltro !== "Todos") qParams.set("marketplace", marketplaceFiltro);
      if (cidadeFiltro !== "todas") qParams.set("cidade", cidadeFiltro);

      const [resKpis, resReg, resEvol, resNovos] = await Promise.all([
        fetchWithCache<any>(`${API_URL}/api/dropoff/radar/kpis?${qParams.toString()}`),
        fetchWithCache<any>(`${API_URL}/api/dropoff/radar/regionais?${qParams.toString()}`),
        fetchWithCache<any>(`${API_URL}/api/dropoff/radar/evolucao?${qParams.toString()}`),
        fetchWithCache<any>(`${API_URL}/api/dropoff/radar/novos-mds?${qParams.toString()}`)
      ]);

      if (resKpis.status === "success") setKpis(resKpis);
      if (resReg.status === "success") setRegionais(resReg.regionais || []);
      if (resEvol.status === "success") setEvolucao(resEvol.evolucao || []);
      if (resNovos.status === "success") setNovosMds(resNovos.novos_mds || resNovos.items || []);
    } catch (e) {
      console.error("Erro ao carregar dados do Radar Dropoff:", e);
      setErrorMsg("Falha ao carregar os dados do radar. Verifique se o backend está no ar.");
    } finally {
      setLoading(false);
    }
  };

  const fetchFeed = async () => {
    try {
      const qParams = new URLSearchParams();
      qParams.set("periodo_tipo", periodoTipo);
      qParams.set("rotulo", rotulo);
      if (dtInicio) qParams.set("dt_inicio", dtInicio);
      if (dtFim) qParams.set("dt_fim", dtFim);
      if (regionalFiltro !== "todos") qParams.set("regional", regionalFiltro);
      if (marketplaceFiltro !== "Todos") qParams.set("marketplace", marketplaceFiltro);
      if (cidadeFiltro !== "todas") qParams.set("cidade", cidadeFiltro);
      if (searchTerm.trim()) qParams.set("search", searchTerm.trim());
      qParams.set("sort_by", sortKey);
      qParams.set("sort_desc", sortDir === "desc" ? "true" : "false");
      qParams.set("page", page.toString());
      qParams.set("limit", "20");

      const res = await fetchWithCache<any>(`${API_URL}/api/dropoff/radar/mds?${qParams.toString()}`);
      if (res.status === "success") {
        setMdsFeed({
          total: res.pagination?.total_items || 0,
          pages: res.pagination?.total_pages || 1,
          items: res.data || []
        });
      }
    } catch (e) {
      console.error("Erro ao carregar feed de MDs:", e);
    }
  };

  useEffect(() => {
    if (rotulo !== "Carregando...") fetchData();
  }, [periodoTipo, rotulo, dtInicio, dtFim, regionalFiltro, marketplaceFiltro, cidadeFiltro]);

  useEffect(() => {
    if (rotulo !== "Carregando...") fetchFeed();
  }, [periodoTipo, rotulo, dtInicio, dtFim, regionalFiltro, marketplaceFiltro, cidadeFiltro, page, sortKey, sortDir]);

  const handleOpenEditModal = (item: MDItem) => {
    setEditingMd(item);
    setEditCidade(item.cidade === "Não Cadastrada" ? "" : item.cidade);
    setEditEstado(item.estado || "");
    setEditEndereco(item.endereco || "");
    setEditLat(item.latitude ? str(item.latitude) : "");
    setEditLng(item.longitude ? str(item.longitude) : "");
  };

  // Helper string safe
  const str = (v: any) => (v !== null && v !== undefined ? String(v) : "");

  // Compact number formatting for charts
  const compactNum = (v: any) => {
    const n = Number(v || 0);
    if (n >= 1000) return Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
    return n.toLocaleString("pt-BR");
  };

  const chartTooltipStyle = {
    background: "#0C101B",
    border: "1px solid #1E293B",
    borderRadius: 12,
    fontSize: 12
  };

  const toLocalISO = (d: Date) => {
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
  };

  const handlePeriodoTipo = (type: string) => {
    setPeriodoTipo(type);
    setPage(1);
    if (type === "Período" && (!dtInicio || !dtFim)) {
      const hoje = new Date();
      const inicio = new Date();
      inicio.setDate(hoje.getDate() - 7);
      setDtInicio(toLocalISO(inicio));
      setDtFim(toLocalISO(hoje));
    }
  };

  const handleAutoGeocode = async () => {
    if (!editCidade.trim()) {
      alert("Por favor, preencha o campo Cidade para buscar as coordenadas.");
      return;
    }
    setGeocoding(true);
    try {
      const query = `${editEndereco ? editEndereco + ", " : ""}${editCidade}, ${editEstado || "SP"}, Brasil`;
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
      const data = await res.json();
      if (data && data.length > 0) {
        setEditLat(data[0].lat);
        setEditLng(data[0].lon);
      } else {
        alert("Não foi possível encontrar as coordenadas exatas para essa cidade. Preencha a Lat/Lng manualmente se desejar.");
      }
    } catch (err) {
      console.error("Erro no auto-geocoding:", err);
      alert("Erro ao buscar coordenadas no mapa.");
    } finally {
      setGeocoding(false);
    }
  };

  const handleSaveCidade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMd || !editCidade.trim()) return;

    setSavingCidade(true);
    try {
      const res = await fetch(`${API_URL}/api/dropoff/radar/mds/cidade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          md_codigo: editingMd.md,
          cidade: editCidade.trim(),
          estado: editEstado.trim() || undefined,
          endereco: editEndereco.trim() || undefined,
          latitude: editLat.trim() ? parseFloat(editLat.trim()) : undefined,
          longitude: editLng.trim() ? parseFloat(editLng.trim()) : undefined
        })
      });
      const json = await res.json();
      if (json.status === "success") {
        setEditingMd(null);
        fetchData();
        fetchFeed();
      } else {
        alert("Erro ao salvar dados: " + (json.detail || "Falha na requisição"));
      }    } catch (err) {
      console.error("Erro ao salvar cidade e coordenadas:", err);
      alert("Erro ao comunicar com o servidor.");
    } finally {
      setSavingCidade(false);
    }
  };

  // Sort helper function
  const sortData = (items: any[], key: string, dir: "asc" | "desc") => {
    if (!items || !Array.isArray(items)) return [];
    return [...items].sort((a, b) => {
      let valA = a[key];
      let valB = b[key];

      if (typeof valA === "string") valA = (valA || "").toLowerCase();
      if (typeof valB === "string") valB = (valB || "").toLowerCase();

      if (valA < valB) return dir === "asc" ? -1 : 1;
      if (valA > valB) return dir === "asc" ? 1 : -1;
      return 0;
    });
  };

  const handleMainSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const handleNovosSort = (key: string) => {
    if (sortNovosKey === key) {
      setSortNovosDir(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortNovosKey(key);
      setSortNovosDir("desc");
    }
  };

  const sortedNovosMds = useMemo(() => sortData(novosMds, sortNovosKey, sortNovosDir), [novosMds, sortNovosKey, sortNovosDir]);

  const novosPaginated = useMemo(() => sortedNovosMds.slice((novosPage - 1) * 10, novosPage * 10), [sortedNovosMds, novosPage]);
  const novosTotalPages = Math.max(1, Math.ceil(sortedNovosMds.length / 10));

  const exportarCSV = async () => {
    try {
      const qParams = new URLSearchParams();
      qParams.set("periodo_tipo", periodoTipo);
      qParams.set("rotulo", rotulo);
      if (dtInicio) qParams.set("dt_inicio", dtInicio);
      if (dtFim) qParams.set("dt_fim", dtFim);
      if (regionalFiltro !== "todos") qParams.set("regional", regionalFiltro);
      if (marketplaceFiltro !== "Todos") qParams.set("marketplace", marketplaceFiltro);
      if (cidadeFiltro !== "todas") qParams.set("cidade", cidadeFiltro);
      if (searchTerm.trim()) qParams.set("search", searchTerm.trim());
      qParams.set("sort_by", sortKey);
      qParams.set("sort_desc", sortDir === "desc" ? "true" : "false");
      qParams.set("limit", "100");

      let rows: any[] = [];
      let page = 1;
      let total = Infinity;
      while (rows.length < total && page <= 20) {
        qParams.set("page", page.toString());
        const res = await fetch(`${API_URL}/api/dropoff/radar/mds?${qParams.toString()}`).then(r => r.json());
        if (res.status !== "success") break;
        total = res.pagination?.total_items || 0;
        rows = rows.concat(res.data || []);
        page += 1;
      }

      const esc = (v: any) => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = ["md", "regional", "estado", "cidade", "volume", "backlog", "taxa_coleta", "endereco", "latitude", "longitude"];
      const csv = [header.join(";"), ...rows.map(r => [r.md, r.regional, r.estado, r.cidade, r.volume, r.backlog, r.taxa_coleta, r.endereco, r.latitude, r.longitude].map(esc).join(";"))].join("\r\n");

      const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `radar_dropoff_${periodoTipo}_${rotulo.replace(/[/]/g, "-")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Erro ao exportar:", e);
      alert("Erro ao exportar os dados.");
    }
  };

  const renderSortableHeader = (label: string, colKey: string, currentKey: string, currentDir: "asc" | "desc", onSort: (key: string) => void, align: "left" | "right" | "center" = "left") => (
    <th 
      onClick={() => onSort(colKey)} 
      className={`py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors text-${align}`}
    >
      <div className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
        <span>{label}</span>
        <span className="text-[10px] font-bold text-emerald-400">
          {currentKey === colKey ? (currentDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </div>
    </th>
  );

  return (
    <div className="flex h-screen bg-[#07090E] text-slate-100 font-sans overflow-hidden">
      <Sidebar />

      <main className="flex-1 ml-16 md:ml-64 overflow-y-auto p-4 md:p-8 space-y-6">
        {/* Header Title */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border/50 pb-5">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 mb-1">
              <Package className="w-5 h-5" />
              <span className="text-sm font-semibold tracking-wider uppercase">Controle Operacional</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Radar de Dropoff & Novos MDs
            </h1>
            <p className="text-slate-400 mt-1 max-w-3xl text-sm">
              Performance de coleta, taxa de atendimento, volume de pacotes bipados e geolocalização integrada com o Mapa & Otimização.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { fetchData(); fetchFeed(); }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#131926] hover:bg-[#1A2234] border border-border text-xs font-medium text-slate-200 transition-all hover:scale-105 active:scale-95 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
            <button
              onClick={() => setAutoRefresh(v => !v)}
              title="Atualiza os dados automaticamente a cada 60s"
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-medium transition-all active:scale-95 shadow-sm ${
                autoRefresh
                  ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-300"
                  : "bg-[#131926] hover:bg-[#1A2234] border-border text-slate-200"
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? "text-emerald-300 animate-spin" : "text-slate-400"}`} />
              Auto 60s {autoRefresh ? "ON" : "OFF"}
            </button>
            <button
              onClick={handleOpenReportModal}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold text-amber-300 transition-all hover:scale-105 active:scale-95 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Relatório Diário Novos MDs
            </button>
            <button
              onClick={exportarCSV}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#131926] hover:bg-[#1A2234] border border-border text-xs font-medium text-slate-200 transition-all hover:scale-105 active:scale-95 shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              Exportar CSV
            </button>

          </div>
        </div>

        {/* Control Toolbar */}
        <div className="bg-[#0C101B] p-4 rounded-2xl border border-border/60 shadow-lg flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Period Type Buttons */}
            <div className="flex bg-[#131926] p-1 rounded-xl border border-border/50 text-xs">
              {["Diário", "Semanal", "Mensal", "Período"].map((type) => (
                <button
                  key={type}
                  onClick={() => handlePeriodoTipo(type)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                    periodoTipo === type
                      ? "bg-indigo-600 text-white font-bold shadow-md"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {!optionsLoading && (
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                {periodoTipo !== "Período" && periodoTipo === "Diário" && options.dias.length > 0 && (
                  <select
                    value={rotulo}
                    onChange={(e) => { setRotulo(e.target.value); setPage(1); }}
                    className="px-3 py-1.5 bg-[#131926] border border-border/60 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  >
                    {options.dias.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                )}
                {periodoTipo !== "Período" && periodoTipo === "Semanal" && options.semanas.length > 0 && (
                  <select
                    value={rotulo}
                    onChange={(e) => { setRotulo(e.target.value); setPage(1); }}
                    className="px-3 py-1.5 bg-[#131926] border border-border/60 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  >
                    {options.semanas.map(w => (
                      <option key={w} value={w}>{w}</option>
                    ))}
                  </select>
                )}
                {periodoTipo === "Período" && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={dtInicio}
                      onChange={(e) => { setDtInicio(e.target.value); setPage(1); }}
                      className="px-2.5 py-1.5 bg-[#131926] border border-border/60 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-slate-500">até</span>
                    <input
                      type="date"
                      value={dtFim}
                      onChange={(e) => { setDtFim(e.target.value); setPage(1); }}
                      className="px-2.5 py-1.5 bg-[#131926] border border-border/60 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Marketplace Select */}
            <select
              value={marketplaceFiltro}
              onChange={(e) => { setMarketplaceFiltro(e.target.value); setPage(1); }}
              className="bg-[#131926] border border-border/60 text-xs text-slate-200 rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500"
            >
              {marketplaces.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            {/* Regional Select */}
            <select
              value={regionalFiltro}
              onChange={(e) => {
                setRegionalFiltro(e.target.value);
                setPage(1);
              }}
              className="bg-[#131926] border border-border/60 text-xs text-slate-200 rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500"
            >
              <option value="todos">Todas Regionais</option>
              {options.regionais.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            {/* Cidade Select */}
            <select
              value={cidadeFiltro}
              onChange={(e) => {
                setCidadeFiltro(e.target.value);
                setPage(1);
              }}
              className="bg-[#131926] border border-border/60 text-xs text-emerald-400 font-semibold rounded-xl px-3 py-1.5 outline-none focus:border-emerald-500"
            >
              <option value="todas">Todas Cidades</option>
              {(options.cidades || []).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por código de MD ou cidade..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-3 py-1.5 bg-[#131926] border border-border/60 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs font-medium px-4 py-3 rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center p-20">
            <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
          </div>
        ) : kpis ? (
          <>
            {/* KPIs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Volume Total */}
              <div className="bg-[#0C101B] p-5 rounded-2xl border border-border/60 shadow-lg flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Volume Bipado</span>
                  <Package className="w-5 h-5 text-indigo-400 opacity-80" />
                </div>
                <div>
                  <span className="text-2xl font-black text-white">{kpis.vol_total.toLocaleString("pt-BR")}</span>
                  <p className="text-[11px] text-slate-400 mt-1">Pacotes coletados no período</p>
                </div>
              </div>

              {/* Taxa Média */}
              <div className="bg-[#0C101B] p-5 rounded-2xl border border-border/60 border-l-4 border-l-emerald-500 shadow-lg flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Taxa de Coleta</span>
                  <TrendingUp className="w-5 h-5 text-emerald-400 opacity-80" />
                </div>
                <div>
                  <span className="text-2xl font-black text-emerald-400">{kpis.taxa_media}%</span>
                  <p className="text-[11px] text-slate-400 mt-1">Média de atendimento</p>
                </div>
              </div>

              {/* Backlog */}
              <div className="bg-[#0C101B] p-5 rounded-2xl border border-border/60 border-l-4 border-l-rose-500 shadow-lg flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Backlog Retido</span>
                  <AlertCircle className="w-5 h-5 text-rose-400 opacity-80" />
                </div>
                <div>
                  <span className="text-2xl font-black text-rose-400">{kpis.backlog_total.toLocaleString("pt-BR")}</span>
                  <p className="text-[11px] text-slate-400 mt-1">Pacotes retidos nos MDs</p>
                </div>
              </div>

              {/* MDs Novos Inéditos */}
              <div className="bg-[#0C101B] p-5 rounded-2xl border border-border/60 border-l-4 border-l-amber-500 shadow-lg flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-amber-400 text-xs font-bold uppercase tracking-wider">MDs Novos Inéditos</span>
                  <Sparkles className="w-5 h-5 text-amber-400 opacity-80" />
                </div>
                <div>
                  <span className="text-2xl font-black text-amber-300">{kpis.total_novos_mds || 0}</span>
                  <p className="text-[11px] text-amber-400/80 mt-1">Pontos com 1ª bipagem na base</p>
                </div>
              </div>

              {/* Volume dos Novos MDs */}
              <div className="bg-[#0C101B] p-5 rounded-2xl border border-border/60 border-l-4 border-l-orange-500 shadow-lg flex flex-col justify-between">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-orange-400 text-xs font-bold uppercase tracking-wider">Vol. Novos MDs</span>
                  <Store className="w-5 h-5 text-orange-400 opacity-80" />
                </div>
                <div>
                  <span className="text-2xl font-black text-orange-300">{(kpis.vol_novos_mds || 0).toLocaleString("pt-BR")}</span>
                  <p className="text-[11px] text-slate-400 mt-1">Pacotes coletados por novos MDs</p>
                </div>
              </div>
            </div>

            {/* Charts: Evolução + Regionais */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-[#0C101B] p-5 rounded-2xl border border-border/60 shadow-lg space-y-3">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <div className="flex items-center gap-2">
                    <LineChartIcon className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-bold text-white text-base">Evolução de Volume & Backlog</h3>
                  </div>
                  <span className="text-[11px] text-slate-400">{evolucao.length} dia(s)</span>
                </div>
                {evolucao.length === 0 ? (
                  <div className="flex items-center justify-center h-[220px] text-slate-500 text-xs">
                    Sem dados de evolução para o período selecionado.
                  </div>
                ) : evolucao.length === 1 && evolucao[0].breakdown && Object.keys(evolucao[0].breakdown).length > 0 ? (
                  (() => {
                    const breakdown = Object.entries(evolucao[0].breakdown).map(([cliente, v]) => ({
                      cliente,
                      volume: v.volume,
                      backlog: v.backlog
                    }));
                    return (
                      <div className="space-y-3">
                        <ResponsiveContainer width="100%" height={240}>
                          <BarChart data={breakdown} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1A2234" vertical={false} />
                            <XAxis dataKey="cliente" stroke="#64748b" tick={{ fontSize: 10 }} interval={0} />
                            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={compactNum} width={60} />
                            <Tooltip contentStyle={chartTooltipStyle} formatter={(value: any, name: any) => [Number(value).toLocaleString("pt-BR"), name === "volume" ? "Volume" : "Backlog"]} labelFormatter={(label: any) => `Marketplace: ${label}`} />
                            <Legend formatter={(v: string) => <span style={{ color: "#CBD5E1", fontSize: 12 }}>{v === "volume" ? "Volume Bipado" : "Backlog Retido"}</span>} />
                            <Bar dataKey="volume" name="volume" fill="#34D399" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="backlog" name="backlog" fill="#FB7185" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                        <p className="text-[10px] text-slate-500 text-center">
                          Detalhamento por marketplace para {evolucao[0].data}
                        </p>
                      </div>
                    );
                  })()
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={evolucao} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gradVol" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34D399" stopOpacity={0.45} />
                          <stop offset="95%" stopColor="#34D399" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradBkl" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#FB7185" stopOpacity={0.45} />
                          <stop offset="95%" stopColor="#FB7185" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1A2234" />
                      <XAxis dataKey="data" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={compactNum} width={60} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(value: any, name: any) => [Number(value).toLocaleString("pt-BR"), name === "volume" ? "Volume" : "Backlog"]} labelFormatter={(label: any) => `Data: ${label}`} />
                      <Legend formatter={(v: string) => <span style={{ color: "#CBD5E1", fontSize: 12 }}>{v === "volume" ? "Volume Bipado" : "Backlog Retido"}</span>} />
                      <Area type="monotone" dataKey="volume" name="volume" stroke="#34D399" strokeWidth={2} fill="url(#gradVol)" />
                      <Area type="monotone" dataKey="backlog" name="backlog" stroke="#FB7185" strokeWidth={2} fill="url(#gradBkl)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-[#0C101B] p-5 rounded-2xl border border-border/60 shadow-lg space-y-3">
                <div className="flex items-center justify-between border-b border-border/40 pb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-bold text-white text-base">Volume por Regional</h3>
                  </div>
                  <span className="text-[11px] text-slate-400">{regionais.length} regional(is)</span>
                </div>
                {regionais.length === 0 ? (
                  <div className="flex items-center justify-center h-[220px] text-slate-500 text-xs">
                    Sem dados regionais para o período selecionado.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(regionais.length * 36 + 40, 240)}>
                    <BarChart data={regionais} layout="vertical" margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1A2234" horizontal={false} />
                      <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={compactNum} />
                      <YAxis type="category" dataKey="regional" stroke="#CBD5E1" tick={{ fontSize: 11 }} width={120} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(value: any, name: any) => [Number(value).toLocaleString("pt-BR"), "Volume"]} labelFormatter={(label: any) => `Regional: ${label}`} />
                      <Bar dataKey="volume" name="volume" radius={[0, 6, 6, 0]}>
                        {regionais.map((r, i) => (
                          <Cell key={i} fill={r.taxa_coleta >= 90 ? "#34D399" : r.taxa_coleta >= 70 ? "#FBBF24" : "#FB7185"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="flex flex-wrap gap-3 pt-1 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> Taxa ≥ 90%</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Taxa 70–90%</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" /> Taxa &lt; 70%</span>
                </div>
              </div>
            </div>

            {/* Section: MDs NOVOS em Operação (Inéditos) */}
            <div className="bg-[#0C101B] p-6 rounded-2xl border border-border/60 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-white text-base">Novos MDs em Operação (Primeira Bipagem na Base)</h3>
                </div>
                <span className="text-xs text-slate-400">
                  Cadastre Cidade e Coordenadas (Lat/Lng) para plotar o ponto no Mapa & Otimização.
                </span>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/50 max-h-[300px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-[#131926] text-slate-400 uppercase tracking-wider font-semibold border-b border-border/60">
                    <tr>
                      {renderSortableHeader("Ponto / Código MD", "md", sortNovosKey, sortNovosDir, handleNovosSort)}
                      {renderSortableHeader("Regional", "regional", sortNovosKey, sortNovosDir, handleNovosSort)}
                      {renderSortableHeader("Estado (UF)", "estado", sortNovosKey, sortNovosDir, handleNovosSort)}
                      {renderSortableHeader("Cidade", "cidade", sortNovosKey, sortNovosDir, handleNovosSort)}
                      {renderSortableHeader("Volume Bipado", "volume_total", sortNovosKey, sortNovosDir, handleNovosSort, "right")}
                      {renderSortableHeader("Backlog", "backlog_total", sortNovosKey, sortNovosDir, handleNovosSort, "right")}
                      <th className="py-3 px-4 text-center">Status Mapa</th>
                      <th className="py-3 px-4 text-center">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {sortedNovosMds.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-slate-500">
                          Nenhum MD inédito iniciou operatividade nesta data.
                        </td>
                      </tr>
                    ) : (
                      novosPaginated.map((m: any, idx: number) => (
                        <tr key={idx} className="hover:bg-[#131926]/50 transition-colors">
                          <td className="py-3 px-4 font-bold text-white flex items-center gap-2">
                            <Store className="w-4 h-4 text-amber-400" />
                            <span>{m.md}</span>
                          </td>
                          <td className="py-3 px-4 text-slate-300 font-semibold">{m.regional}</td>
                          <td className="py-3 px-4 font-bold text-amber-400">{m.estado}</td>
                          <td className="py-3 px-4 text-slate-300">
                            <div className="flex items-center gap-2">
                              <span className={m.cidade === "Não Cadastrada" ? "text-amber-400/90 italic" : "text-white"}>
                                {m.cidade}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-400">{m.volume_total.toLocaleString("pt-BR")}</td>
                          <td className="py-3 px-4 text-right font-bold text-rose-400">{m.backlog_total.toLocaleString("pt-BR")}</td>
                          <td className="py-3 px-4 text-center">
                            {m.tem_coordenadas ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center gap-1">
                                <Navigation className="w-3 h-3" />
                                Plotado
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                Sem Lat/Lng
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleOpenEditModal(m)}
                              className="px-2.5 py-1 rounded bg-[#131926] hover:bg-slate-800 text-slate-200 border border-border text-[11px] font-medium transition-colors flex items-center gap-1 mx-auto"
                            >
                              <Pencil className="w-3 h-3 text-emerald-400" />
                              <span>Editar</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {sortedNovosMds.length > 10 && (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-[11px] text-slate-500">
                    {novosPaginated.length} de {sortedNovosMds.length} MDs novos
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setNovosPage(p => Math.max(1, p - 1))}
                      disabled={novosPage === 1}
                      className="px-2.5 py-1 rounded-lg bg-[#131926] border border-border text-slate-300 text-[11px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:border-indigo-500 transition-colors cursor-pointer"
                    >
                      ← Anterior
                    </button>
                    <span className="text-[11px] text-slate-400">
                      Página {novosPage} / {novosTotalPages}
                    </span>
                    <button
                      onClick={() => setNovosPage(p => Math.min(novosTotalPages, p + 1))}
                      disabled={novosPage === novosTotalPages}
                      className="px-2.5 py-1 rounded-lg bg-[#131926] border border-border text-slate-300 text-[11px] font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:border-indigo-500 transition-colors cursor-pointer"
                    >
                      Próxima →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Section: Tabela Geral de MDs */}
            <div className="bg-[#0C101B] p-6 rounded-2xl border border-border/60 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-white text-base">Todos os Minidrops em Operação</h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {mdsFeed.total} MDs
                  </span>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-[#131926] px-3 py-1.5 rounded-xl border border-border/60">
                    <span className="text-xs font-semibold text-slate-400">Filtrar Regional:</span>
                    <select
                      value={regionalFiltro}
                      onChange={(e) => {
                        setRegionalFiltro(e.target.value);
                        setPage(1);
                      }}
                      className="bg-transparent text-xs font-bold text-emerald-400 outline-none cursor-pointer"
                    >
                      <option value="todos" className="bg-[#131926] text-slate-200">Todas Regionais</option>
                      {options.regionais.map(r => (
                        <option key={r} value={r} className="bg-[#131926] text-slate-200">{r}</option>
                      ))}
                    </select>
                  </div>
                  <span className="text-xs text-slate-400 hidden lg:inline">
                    Cadastre Cidade e Coordenadas para exibir no Mapa.
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-border/50">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-[#131926] text-slate-400 uppercase tracking-wider font-semibold border-b border-border/60">
                    <tr>
                      {renderSortableHeader("MD / Código", "md", sortKey, sortDir, handleMainSort)}
                      {renderSortableHeader("Regional", "regional", sortKey, sortDir, handleMainSort)}
                      {renderSortableHeader("Estado (UF)", "estado", sortKey, sortDir, handleMainSort)}
                      {renderSortableHeader("Cidade", "cidade", sortKey, sortDir, handleMainSort)}
                      {renderSortableHeader("Volume Total", "volume", sortKey, sortDir, handleMainSort, "right")}
                      {renderSortableHeader("Backlog Retido", "backlog", sortKey, sortDir, handleMainSort, "right")}
                      {renderSortableHeader("Taxa de Coleta", "taxa_coleta", sortKey, sortDir, handleMainSort, "center")}
                      <th className="py-3 px-4 text-center">Status Mapa</th>
                      <th className="py-3 px-4 text-center">Editar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {mdsFeed.items.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500">
                          Nenhum MD encontrado.
                        </td>
                      </tr>
                    ) : (
                      mdsFeed.items.map((m, idx) => (
                        <tr key={idx} className="hover:bg-[#131926]/50 transition-colors">
                          <td className="py-3 px-4 font-bold text-white">{m.md}</td>
                          <td className="py-3 px-4 text-slate-300 font-semibold">{m.regional}</td>
                          <td className="py-3 px-4 font-bold text-indigo-400">{m.estado || "SP"}</td>
                          <td className="py-3 px-4">
                            <span className={m.cidade === "Não Cadastrada" ? "text-amber-400/90 italic font-semibold" : "text-slate-200"}>
                              {m.cidade}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-emerald-400">{m.volume?.toLocaleString("pt-BR")}</td>
                          <td className="py-3 px-4 text-right font-bold text-rose-400">{m.backlog?.toLocaleString("pt-BR")}</td>
                          <td className="py-3 px-4 text-center font-bold text-emerald-400">{m.taxa_coleta}%</td>
                          <td className="py-3 px-4 text-center">
                            {m.tem_coordenadas ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center gap-1">
                                <Navigation className="w-3 h-3" />
                                Plotado
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                                Sem Lat/Lng
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleOpenEditModal(m)}
                              className="px-2.5 py-1 rounded bg-[#131926] hover:bg-slate-800 text-slate-300 border border-border text-[11px] font-medium transition-colors flex items-center gap-1 mx-auto"
                            >
                              <Pencil className="w-3 h-3 text-emerald-400" />
                              <span>Editar</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
                <div>
                  Mostrando <strong className="text-white">{mdsFeed.items.length}</strong> de <strong className="text-white">{mdsFeed.total}</strong> MDs
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    className="p-2 rounded-lg bg-[#131926] border border-border disabled:opacity-30 hover:bg-[#1A2234]"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-slate-300 font-mono">
                    Pág {page} de {mdsFeed.pages || 1}
                  </span>
                  <button
                    disabled={page >= mdsFeed.pages}
                    onClick={() => setPage(p => Math.min(mdsFeed.pages, p + 1))}
                    className="p-2 rounded-lg bg-[#131926] border border-border disabled:opacity-30 hover:bg-[#1A2234]"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center p-20 text-slate-400">
            Nenhum dado de Dropoff encontrado.
          </div>
        )}

        {/* MODAL DE EDIÇÃO DE CIDADE E GEOLOCALIZAÇÃO DO MD */}
        {editingMd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200">
            <div className="bg-[#0C101B] border border-border/80 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 relative">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div className="flex items-center gap-2.5">
                  <Globe className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-lg font-bold text-white">Cadastrar Cidade & Localização no Mapa</h3>
                </div>
                <button
                  onClick={() => setEditingMd(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCidade} className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Código do MD
                    </label>
                    <input
                      type="text"
                      readOnly
                      value={editingMd.md}
                      className="w-full px-3 py-2 bg-[#131926] border border-border/60 rounded-xl text-sm font-bold text-emerald-400 font-mono outline-none cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Estado (UF) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: SP, RJ, MG..."
                      maxLength={2}
                      value={editEstado}
                      onChange={(e) => setEditEstado(e.target.value.toUpperCase())}
                      className="w-full px-3 py-2 bg-[#131926] border border-border/60 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 font-mono uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Nome da Cidade *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: São Paulo, Campinas, Jaú, Franca..."
                    value={editCidade}
                    onChange={(e) => setEditCidade(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#131926] border border-border/60 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Endereço / Bairro / Referência (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Av. Paulista, 1000 - Centro"
                    value={editEndereco}
                    onChange={(e) => setEditEndereco(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[#131926] border border-border/60 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Auto Geocode Button */}
                <div className="bg-[#131926]/80 p-3 rounded-xl border border-border/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 flex items-center gap-1.5">
                      <Navigation className="w-4 h-4 text-emerald-400" />
                      Coordenadas de Geolocalização (Mapa)
                    </span>

                    <button
                      type="button"
                      onClick={handleAutoGeocode}
                      disabled={geocoding || !editCidade.trim()}
                      className="px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 font-bold transition-all text-[11px] disabled:opacity-40 flex items-center gap-1"
                    >
                      <Search className="w-3 h-3" />
                      <span>{geocoding ? "Buscando..." : "🔍 Auto-Obter Lat/Lng"}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Latitude</label>
                      <input
                        type="text"
                        placeholder="Ex: -23.55052"
                        value={editLat}
                        onChange={(e) => setEditLat(e.target.value)}
                        className="w-full px-3 py-1.5 bg-[#0C101B] border border-border/60 rounded-lg text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Longitude</label>
                      <input
                        type="text"
                        placeholder="Ex: -46.6333"
                        value={editLng}
                        onChange={(e) => setEditLng(e.target.value)}
                        className="w-full px-3 py-1.5 bg-[#0C101B] border border-border/60 rounded-lg text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => setEditingMd(null)}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 font-semibold text-slate-300 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={savingCidade || !editCidade.trim()}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold shadow-lg disabled:opacity-40 transition-all"
                  >
                    <Check className="w-4 h-4" />
                    <span>{savingCidade ? "Salvando..." : "Salvar & Integrar ao Mapa"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* MODAL RELATÓRIO DIÁRIO DE NOVOS MDS (<60 DIAS) */}
        {reportModalOpen && (
          <div className="fixed inset-0 z-[5000] bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-[#0C101B] border border-border/80 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
              <div className="p-4 bg-slate-900 border-b border-border flex justify-between items-center">
                <div className="flex items-center gap-2 text-amber-400">
                  <Sparkles className="w-5 h-5" />
                  <h2 className="text-base font-bold text-white">Relatório Diário de Performance - Novos MDs (&le; 60 dias)</h2>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={exportarRelatorioNovosCSV}
                    disabled={reportData.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl disabled:opacity-40 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar CSV</span>
                  </button>
                  <button onClick={() => setReportModalOpen(false)} className="text-slate-400 hover:text-white p-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-5 overflow-y-auto flex-1 custom-scrollbar space-y-4">
                {reportLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-3">
                    <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
                    <p className="text-slate-400 text-sm font-medium">Gerando relatório de auditoria diária dos novos MDs...</p>
                  </div>
                ) : reportData.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-sm">
                    Nenhum MD novo em ramp-up (&le; 60 dias) encontrado para esta regional.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/50 bg-[#07090E]">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-[#131926] text-slate-400 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="p-3">MD</th>
                          <th className="p-3">Regional / Cidade</th>
                          <th className="p-3">Credenciamento</th>
                          <th className="p-3 text-center">Dias Operação</th>
                          <th className="p-3 text-right">Volume Hoje</th>
                          <th className="p-3 text-right">Backlog</th>
                          <th className="p-3 text-right">Taxa Coleta</th>
                          <th className="p-3 text-center">Erros Lacre</th>
                          <th className="p-3 text-center">Fora SLA (08-18h)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {reportData.map((r, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/60 transition-colors">
                            <td className="p-3 font-bold text-white font-mono">{r.md}</td>
                            <td className="p-3">
                              <span className="font-semibold text-slate-200">{r.regional}</span> - <span className="text-slate-400">{r.cidade}</span>
                            </td>
                            <td className="p-3 font-mono text-slate-400">{r.data_credenciamento}</td>
                            <td className="p-3 text-center font-bold text-amber-400">
                              <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                                {r.dias_operacao}/60d
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-400">{r.volume_total.toLocaleString()}</td>
                            <td className="p-3 text-right font-mono text-slate-300">{r.backlog_total.toLocaleString()}</td>
                            <td className="p-3 text-right font-bold text-slate-200">{r.taxa_coleta}%</td>
                            <td className={`p-3 text-center font-bold ${r.erros_lacre > 0 ? "text-rose-400 font-bold" : "text-slate-500"}`}>{r.erros_lacre}</td>
                            <td className={`p-3 text-center font-bold ${r.bipagens_fora_sla > 0 ? "text-amber-400" : "text-slate-500"}`}>{r.bipagens_fora_sla}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

