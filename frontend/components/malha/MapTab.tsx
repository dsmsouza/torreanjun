import React, { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import Toast from "../Toast";
import { useAuth } from "../../hooks/use-auth";
import { 
  fetchOptions, 
  fetchMalhaPontos, 
  simularOtimizacaoMalha,
  fetchContextoPeriodo,
  generateIAReport
} from "../../lib/api";
import { 
  Search, 
  MapPin, 
  Layers, 
  Map, 
  Route, 
  ArrowRight, 
  TrendingUp, 
  Clock, 
  Navigation, 
  Calendar, 
  Sparkles, 
  Send, 
  Bot, 
  User,
  Loader2
} from "lucide-react";

// Load Leaflet Map dynamically
const MalhaMap = dynamic(() => import("../../components/MalhaMap"), { ssr: false });

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

export default function MapTab() {
  const { role, activeRegional, isMaster } = useAuth();

  // ================= TAB 2: MAPA DE CALOR & OTIMIZADOR STATES =================
  const [options, setOptions] = useState<{ dias: string[]; semanas: string[] }>({ dias: [], semanas: [] });
  const [periodoTipoMap, setPeriodoTipoMap] = useState<string>("Diário");
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [toast, setToast] = useState<{message: string, type: "success"|"error"} | null>(null);
  const [rotuloMap, setRotuloMap] = useState<string>("");
  const [rawPoints, setRawPoints] = useState<Point[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  
  // Map Filters
  const [onlyOfensores, setOnlyOfensores] = useState<boolean>(false);
  const [minVolume, setMinVolume] = useState<number>(0);
  const [mapSearch, setMapSearch] = useState<string>("");
  const [mapRegionalFilter, setMapRegionalFilter] = useState<string>("" );
  const [mapCidadeFilter, setMapCidadeFilter] = useState<string>("");
  const [mapFuncionandoFilter, setMapFuncionandoFilter] = useState<string>("TODOS");

  // Map Selection & Simulation
  const [selectedPoint, setSelectedPoint] = useState<Point | null>(null);
  const [simulationRadius, setSimulationRadius] = useState<number>(5.0);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [activeTransfer, setActiveTransfer] = useState<{ source: Point; target: Point } | null>(null);

  // Map Sidebar Permanent Alerts (Observations) States
  const [iataInput, setIataInput] = useState<string>("");
  const [obsInput, setObsInput] = useState<string>("");
  const [obsSaving, setObsSaving] = useState<boolean>(false);

  // MD Decision/Valuation States
  const [decisaoInput, setDecisaoInput] = useState<string>("manter");
  const [motivoInput, setMotivoInput] = useState<string>("");
  const [decisaoSaving, setDecisaoSaving] = useState<boolean>(false);

  // AI Cross-Analysis States
  const [iaOtimizarLoading, setIaOtimizarLoading] = useState<boolean>(false);
  const [iaOtimizarRelatorio, setIaOtimizarRelatorio] = useState<string>("");

  // ================= SIDEBAR TABS & COPILOT STATES =================
  const [sidebarTab, setSidebarTab] = useState<"inspector" | "copilot">("inspector");
  const [copilotPeriodoTipo, setCopilotPeriodoTipo] = useState<string>("Semanal");
  const [copilotRotulo, setCopilotRotulo] = useState<string>("");
  const [chatMessages, setChatMessages] = useState<any[]>([
    { 
      role: "assistant", 
      content: "Olá! Sou o seu **Copiloto de Malha**. Escolha um período semanal ou mensal para consolidar os dados operacionais e faça perguntas como: 'A proposta de Gaspar é viável?' ou 'Quais são os piores MDs da regional SUL?'." 
    }
  ]);
  const [chatInput, setChatInput] = useState<string>("");
  const [chatLoading, setChatLoading] = useState<boolean>(false);

  // Sync copilot default period reference
  useEffect(() => {
    if (!options.dias || options.dias.length === 0) return;
    
    if (copilotPeriodoTipo === "Semanal" && options.semanas.length > 0) {
      setCopilotRotulo(options.semanas[0]);
    } else if (copilotPeriodoTipo === "Mensal") {
      const months = Array.from(new Set(options.dias.map(d => {
        const p = d.split("/");
        return p.length === 3 ? `${p[2]}-${p[1]}` : "";
      }))).filter(Boolean);
      if (months.length > 0) {
        setCopilotRotulo(months[0]);
      }
    }
  }, [copilotPeriodoTipo, options]);



  // 1. Load filters from sessionStorage after mounting
  useEffect(() => {
    const savedPeriodo = sessionStorage.getItem("map_periodoTipoMap");
    const savedRotulo = sessionStorage.getItem("map_rotuloMap");
    const savedOnlyOfensores = sessionStorage.getItem("map_onlyOfensores");
    const savedMinVolume = sessionStorage.getItem("map_minVolume");
    const savedSearch = sessionStorage.getItem("map_mapSearch");
    const savedRegional = sessionStorage.getItem("map_mapRegionalFilter");
    const savedCidade = sessionStorage.getItem("map_mapCidadeFilter");
    const savedFuncionando = sessionStorage.getItem("map_mapFuncionandoFilter");
    const savedRadius = sessionStorage.getItem("map_simulationRadius");

    if (savedPeriodo) setPeriodoTipoMap(savedPeriodo);
    if (savedRotulo) setRotuloMap(savedRotulo);
    if (savedOnlyOfensores) setOnlyOfensores(savedOnlyOfensores === "true");
    if (savedMinVolume) setMinVolume(parseInt(savedMinVolume) || 0);
    if (savedSearch) setMapSearch(savedSearch);
    if (savedRegional) setMapRegionalFilter(savedRegional);
    if (savedCidade) setMapCidadeFilter(savedCidade);
    if (savedFuncionando) setMapFuncionandoFilter(savedFuncionando);
    if (savedRadius) setSimulationRadius(parseFloat(savedRadius) || 5.0);
    
    setIsLoaded(true);
  }, []);

  // 2. Persist filters on changes
  useEffect(() => {
    if (isLoaded) {
      sessionStorage.setItem("map_periodoTipoMap", periodoTipoMap);
    }
  }, [periodoTipoMap, isLoaded]);

  useEffect(() => {
    if (isLoaded && rotuloMap && rotuloMap !== "") {
      sessionStorage.setItem("map_rotuloMap", rotuloMap);
      sessionStorage.setItem(`map_rotuloMap_${periodoTipoMap}`, rotuloMap);
    }
  }, [rotuloMap, periodoTipoMap, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      sessionStorage.setItem("map_onlyOfensores", String(onlyOfensores));
    }
  }, [onlyOfensores, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      sessionStorage.setItem("map_minVolume", String(minVolume));
    }
  }, [minVolume, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      sessionStorage.setItem("map_mapSearch", mapSearch);
    }
  }, [mapSearch, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      sessionStorage.setItem("map_mapRegionalFilter", mapRegionalFilter);
    }
  }, [mapRegionalFilter, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      sessionStorage.setItem("map_mapCidadeFilter", mapCidadeFilter);
    }
  }, [mapCidadeFilter, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      sessionStorage.setItem("map_mapFuncionandoFilter", mapFuncionandoFilter);
    }
  }, [mapFuncionandoFilter, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      sessionStorage.setItem("map_simulationRadius", String(simulationRadius));
    }
  }, [simulationRadius, isLoaded]);

  // Initial load for options list
  useEffect(() => {
    const loadMapOptions = async () => {
      try {
        const opts = await fetchOptions();
        setOptions(opts);
        const savedPeriodo = sessionStorage.getItem("map_periodoTipoMap") || "Diário";
        const savedRotulo = sessionStorage.getItem(`map_rotuloMap_${savedPeriodo}`);
        if (savedRotulo && savedRotulo !== "") {
          setRotuloMap(savedRotulo);
        } else if (opts.dias && opts.dias.length > 0) {
          setRotuloMap(opts.dias[0]);
        }
      } catch (err) {
        console.error("Error loading map options:", err);
      }
    };
    loadMapOptions();
  }, []);

  // Synchronize rotuloMap default value when periodoTipoMap changes
  useEffect(() => {
    if (!options.dias || options.dias.length === 0) return;
    
    const savedRotulo = sessionStorage.getItem(`map_rotuloMap_${periodoTipoMap}`);
    if (savedRotulo && savedRotulo !== "") {
      setRotuloMap(savedRotulo);
      return;
    }

    if (periodoTipoMap === "Diário") {
      setRotuloMap(options.dias[0]);
    } else if (periodoTipoMap === "Semanal" && options.semanas.length > 0) {
      setRotuloMap(options.semanas[0]);
    } else if (periodoTipoMap === "Mensal") {
      const months = Array.from(new Set(options.dias.map(d => {
        const p = d.split("/");
        return p.length === 3 ? `${p[2]}-${p[1]}` : "";
      }))).filter(Boolean);
      if (months.length > 0) {
        setRotuloMap(months[0]);
      }
    }
  }, [periodoTipoMap, options]);

  // Synchronize inputs when selectedPoint changes
  useEffect(() => {
    if (selectedPoint) {
      setIataInput(selectedPoint.nome_ponto || "");
      setObsInput(selectedPoint.observacao_fixa || "");
      setDecisaoInput(selectedPoint.decisao || "manter");
      setMotivoInput("");
      setIaOtimizarRelatorio("");
    } else {
      setIataInput("");
      setObsInput("");
      setDecisaoInput("manter");
      setMotivoInput("");
      setIaOtimizarRelatorio("");
    }
  }, [selectedPoint]);

  // Fetch geolocalized points when period or reference changes
  useEffect(() => {
    if (!rotuloMap) return;

    const loadPoints = async () => {
      setMapLoading(true);
      setSelectedPoint(null);
      setActiveTransfer(null);
      setCandidates([]);
      try {
        const data = await fetchMalhaPontos(periodoTipoMap, rotuloMap);
        setRawPoints(data);
      } catch (err) {
        console.error(err);
      } finally {
        setMapLoading(false);
      }
    };
    loadPoints();
  }, [rotuloMap, periodoTipoMap]);

  // Load candidates for consolidation when selectedPoint or radius changes
  useEffect(() => {
    if (!selectedPoint) return;

    const loadCandidates = async () => {
      setCandidatesLoading(true);
      try {
        const res = await simularOtimizacaoMalha(
          selectedPoint.md_codigo, 
          simulationRadius, 
          periodoTipoMap, 
          rotuloMap
        );
        if (res && res.status === "success") {
          setCandidates(res.alternativas || []);
        } else {
          setCandidates([]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setCandidatesLoading(false);
      }
    };
    loadCandidates();
  }, [selectedPoint, simulationRadius, periodoTipoMap, rotuloMap]);
  // ================= TAB 2: GEOLOCATION MAP & SIMULATOR COMPUTATIONS =================
  // Unique lists computed from rawPoints
  const mapRegionalsList = useMemo(() => {
    const list = rawPoints.map(p => p.regional).filter(Boolean);
    return Array.from(new Set(list)).sort();
  }, [rawPoints]);

  const mapCidadesList = useMemo(() => {
    const filteredPoints = mapRegionalFilter 
      ? rawPoints.filter(p => p.regional === mapRegionalFilter) 
      : rawPoints;
    const list = filteredPoints.map(p => p.cidade).filter(Boolean);
    return Array.from(new Set(list)).sort();
  }, [rawPoints, mapRegionalFilter]);

  // Filter points dynamically on client side
  const mapFilteredPoints = useMemo(() => {
    return rawPoints.filter(p => {
      // 1. Filter by decision = trocar
      if (onlyOfensores && p.decisao !== "trocar") return false;
      
      // 2. Minimum volume filter
      const vol = p.volume || 0;
      if (vol < minVolume) return false;

      // 3. Search query filter
      const q = mapSearch.trim().toLowerCase();
      if (q) {
        const matchesSearch = (
          p.md_codigo.toLowerCase().includes(q) ||
          p.nome_ponto.toLowerCase().includes(q) ||
          p.cidade.toLowerCase().includes(q) ||
          p.endereco.toLowerCase().includes(q) ||
          p.regional.toLowerCase().includes(q)
        );
        if (!matchesSearch) return false;
      }

      // 4. Regional filter
      if (mapRegionalFilter && p.regional !== mapRegionalFilter) return false;

      // 5. City filter
      if (mapCidadeFilter && p.cidade !== mapCidadeFilter) return false;

      // 6. Funcionando filter
      if (mapFuncionandoFilter !== "TODOS" && p.funcionando !== mapFuncionandoFilter) return false;

      return true;
    });
  }, [rawPoints, onlyOfensores, minVolume, mapSearch, mapRegionalFilter, mapCidadeFilter, mapFuncionandoFilter]);

  // Adjust volume representation if simulation active
  const pointsWithSimulation = useMemo(() => {
    if (!activeTransfer) return mapFilteredPoints;
    
    return mapFilteredPoints.map(p => {
      if (p.md_codigo === activeTransfer.source.md_codigo) {
        return { ...p, volume: 0, backlog: 0, taxa_coleta: 100.0 }; // marked as empty/transferred
      }
      if (p.md_codigo === activeTransfer.target.md_codigo) {
        return { 
          ...p, 
          volume: p.volume + activeTransfer.source.volume, 
          backlog: p.backlog + activeTransfer.source.backlog 
        }; // volume transferred here
      }
      return p;
    });
  }, [mapFilteredPoints, activeTransfer]);

  // Global Map Stats
  const mapStats = useMemo(() => {
    const total = mapFilteredPoints.length;
    const ofensores = mapFilteredPoints.filter(p => p.decisao === "trocar").length;
    const volTotal = mapFilteredPoints.reduce((acc, curr) => acc + (curr.volume || 0), 0);
    const bkTotal = mapFilteredPoints.reduce((acc, curr) => acc + (curr.backlog || 0), 0);
    const avgSla = total > 0 
      ? mapFilteredPoints.reduce((acc, curr) => acc + (curr.taxa_coleta ?? 100.0), 0) / total 
      : 100.0;

    return { total, ofensores, volTotal, bkTotal, avgSla };
  }, [mapFilteredPoints]);

  // Handle simulation trigger
  const handleSimulateTransfer = (target: Point) => {
    if (!selectedPoint) return;
    setActiveTransfer({
      source: selectedPoint,
      target: target
    });
  };

  const handleCancelSimulation = () => {
    setActiveTransfer(null);
  };

  const handleSaveFullForm = async () => {
    if (!selectedPoint) return;
    setObsSaving(true);
    try {
      const { saveMDFullForm } = await import("../../lib/api");
      await saveMDFullForm(
        selectedPoint.md_codigo,
        iataInput,
        obsInput,
        decisaoInput
      );
      
      setRawPoints(prev => prev.map(p => {
        if (p.md_codigo === selectedPoint.md_codigo) {
          return { 
            ...p, 
            nome_ponto: iataInput,
            observacao_fixa: obsInput,
            decisao: decisaoInput
          };
        }
        return p;
      }));
      
      setSelectedPoint(prev => prev ? { 
        ...prev, 
        nome_ponto: iataInput,
        observacao_fixa: obsInput,
        decisao: decisaoInput
      } : null);
      
      setToast({ message: "Informações do MD salvas com sucesso!", type: "success" });
    } catch (err) {
      console.error("Error saving MD form:", err);
      setToast({ message: "Erro ao salvar informações do MD.", type: "error" });
    } finally {
      setObsSaving(false);
    }
  };

  const handleGenerateIAOtimizacao = async () => {
    if (!selectedPoint) return;
    setIaOtimizarLoading(true);
    setIaOtimizarRelatorio("");
    try {
      const { generateIAOtimizacao } = await import("../../lib/api");
      const res = await generateIAOtimizacao(
        selectedPoint.md_codigo, 
        periodoTipoMap, 
        rotuloMap
      );
      setIaOtimizarRelatorio(res.relatorio || "Nenhum plano gerado.");
    } catch (err) {
      console.error("Error generating AI optimization:", err);
      setIaOtimizarRelatorio(`[Erro no Copiloto IA]: ${err}`);
    } finally {
      setIaOtimizarLoading(false);
    }
  };

  const formatMonth = (mStr: string) => {
    if (!mStr || !mStr.includes("-")) return mStr;
    const [ano, mes] = mStr.split("-");
    const mesesPt: Record<string, string> = {
      "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
      "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
      "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro"
    };
    return `${mesesPt[mes] || mes}/${ano}`;
  };

  const handleSendCopilotChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setChatLoading(true);

    try {
      const ctxRes = await fetchContextoPeriodo(copilotPeriodoTipo, copilotRotulo);
      const dbContext = ctxRes.contexto || "";

      const reportRes = await generateIAReport(
        "free", 
        `${copilotPeriodoTipo}: ${copilotRotulo}`, 
        dbContext + `\n\nPERGUNTA DO OPERADOR: ${userMessage}`
      );

      setChatMessages(prev => [...prev, { role: "assistant", content: reportRes.resultado }]);
    } catch (err: any) {
      console.error("Error calling copilot chat:", err);
      setChatMessages(prev => [...prev, { 
        role: "assistant", 
        content: `⚠️ **Erro ao consultar o Copiloto:** ${err.message || err}. Verifique se a API do backend está ativa.` 
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="space-y-6">
          {/* Map Filters Toolbar */}
          <div className="glass-panel p-6 rounded-2xl border border-border flex flex-wrap gap-6 items-center justify-between">
            <div className="flex flex-wrap items-center gap-6">
              {/* Select Vision */}
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Visão:</span>
                <select
                  value={periodoTipoMap}
                  onChange={(e) => setPeriodoTipoMap(e.target.value)}
                  className="px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none"
                >
                  <option value="Diário">Diário</option>
                  <option value="Semanal">Semanal</option>
                  <option value="Mensal">Mensal</option>
                </select>
              </div>

              {/* Select Period / Reference */}
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Período:</span>
                
                {periodoTipoMap === "Diário" && options.dias.length > 0 && (
                  <select
                    value={rotuloMap}
                    onChange={(e) => setRotuloMap(e.target.value)}
                    className="px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none"
                  >
                    {options.dias.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                )}

                {periodoTipoMap === "Semanal" && options.semanas.length > 0 && (
                  <select
                    value={rotuloMap}
                    onChange={(e) => setRotuloMap(e.target.value)}
                    className="px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none"
                  >
                    {options.semanas.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                )}

                {periodoTipoMap === "Mensal" && (
                  <select
                    value={rotuloMap}
                    onChange={(e) => setRotuloMap(e.target.value)}
                    className="px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none"
                  >
                    {Array.from(new Set(options.dias.map(d => {
                      const p = d.split("/");
                      return p.length === 3 ? `${p[2]}-${p[1]}` : "";
                    }))).filter(Boolean).map(m => (
                      <option key={m} value={m}>{formatMonth(m)}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Filtros por Regional e Cidade */}
              <div className="flex items-center gap-2 border-l border-border/80 pl-4">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Local:</span>
                
                {/* Regional select */}
                <select
                  value={mapRegionalFilter}
                  onChange={(e) => {
                    setMapRegionalFilter(e.target.value);
                    setMapCidadeFilter(""); // reset city
                  }}
                  className="px-3 py-1.5 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none"
                >
                  <option value="">Todas Regionais</option>
                  {mapRegionalsList.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>

                {/* City select */}
                <select
                  value={mapCidadeFilter}
                  onChange={(e) => setMapCidadeFilter(e.target.value)}
                  className="px-3 py-1.5 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none"
                  disabled={!mapRegionalFilter}
                >
                  <option value="">Todas Cidades</option>
                  {mapCidadesList.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Status Funcionando Select */}
              <div className="flex items-center gap-2 border-l border-border/80 pl-4">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status:</span>
                <select
                  value={mapFuncionandoFilter}
                  onChange={(e) => setMapFuncionandoFilter(e.target.value)}
                  className="px-3 py-1.5 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none"
                >
                  <option value="TODOS">Ver Malha Toda</option>
                  <option value="ATIVO">Somente Ativos</option>
                  <option value="DESATIVADO">Somente Desativados</option>
                </select>
              </div>

              {/* Checkbox: Show only trocar decisions */}
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyOfensores}
                  onChange={(e) => setOnlyOfensores(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded bg-[#0C101B] border-border"
                />
                <span>Mostrar MDs a Trocar</span>
              </label>

              {/* Volume filter slider */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vol. Mínimo:</span>
                <input
                  type="range"
                  min="0"
                  max="5000"
                  step="100"
                  value={minVolume}
                  onChange={(e) => setMinVolume(parseInt(e.target.value))}
                  className="w-32 accent-emerald-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-slate-200 font-mono">{minVolume} pacotes</span>
              </div>
            </div>

            {/* Quick map search */}
            <div className="relative w-full max-w-xs">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={mapSearch}
                onChange={(e) => setMapSearch(e.target.value)}
                placeholder="Pesquise MD, cidade, regional ou endereço..."
                className="w-full pl-9 pr-3 py-1.5 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none"
              />
            </div>
          </div>

          {/* Active Simulation Notification Banner */}
          {activeTransfer && (
            <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-between text-blue-400">
              <div className="flex items-center gap-3">
                <Route className="w-6 h-6 animate-pulse" />
                <div className="text-xs">
                  <strong className="font-bold text-white uppercase block mb-0.5">Simulação de Transferência Ativa</strong>
                  Volume de coletas de <span className="font-bold text-blue-300">{activeTransfer.source.md_codigo}</span> ({activeTransfer.source.volume} pct) transferido com sucesso para <span className="font-bold text-blue-300">{activeTransfer.target.md_codigo}</span>.
                </div>
              </div>
              <button
                onClick={handleCancelSimulation}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg transition-all cursor-pointer"
              >
                Limpar Simulação
              </button>
            </div>
          )}

          {/* Grid Layout: Map + Sidebar details */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Map Area */}
            <div className="lg:col-span-2 relative h-[550px]">
              {mapLoading ? (
                <div className="w-full h-full rounded-2xl border border-border bg-[#0C101B]/40 flex flex-col items-center justify-center text-muted-foreground text-sm">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mb-2" />
                  <span>Carregando pontos da malha...</span>
                </div>
              ) : (
                <MalhaMap
                  points={pointsWithSimulation}
                  selectedPoint={selectedPoint}
                  onSelectPoint={setSelectedPoint}
                  activeTransfer={activeTransfer}
                />
              )}
            </div>

            {/* Right Sidebar: MD Inspector / Copilot IA */}
            <div className="space-y-6">
              
              {/* Tab Selector for Sidebar */}
              <div className="flex bg-[#0C101B] border border-border p-1 rounded-xl">
                <button
                  onClick={() => setSidebarTab("inspector")}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    sidebarTab === "inspector" 
                      ? "bg-primary text-white" 
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  Inspetor MD
                </button>
                <button
                  onClick={() => setSidebarTab("copilot")}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    sidebarTab === "copilot" 
                      ? "bg-purple-600/80 text-white" 
                      : "text-muted-foreground hover:text-white"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Copiloto de Malha</span>
                </button>
              </div>

              {sidebarTab === "inspector" ? (
                <>
                  {/* MD Inspector Detail Card */}
                  {selectedPoint ? (
                    <div className="glass-panel p-6 rounded-2xl border border-border space-y-4">
                      {/* Card Title */}
                      <div className="border-b border-border pb-3 flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-4 h-4 text-emerald-400" />
                            <h2 className="text-md font-bold text-white">{selectedPoint.md_codigo}</h2>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">{selectedPoint.cep} | {selectedPoint.cidade} - {selectedPoint.estado}</span>
                        </div>
                        
                        <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full flex items-center gap-1 uppercase ${
                          selectedPoint.fecha_cedo 
                            ? "bg-red-500/10 text-red-400 border border-red-500/20" 
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        }`}>
                          <Clock className="w-3 h-3" />
                          <span>{selectedPoint.horario_trabalho}</span>
                        </span>
                      </div>

                      {/* Metadata and Stats */}
                      <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/40">
                        <div className="text-center p-2 rounded-xl bg-[#0C101B]/80 border border-border">
                          <span className="text-[9px] text-muted-foreground uppercase block font-semibold">Volume Bipado</span>
                          <strong className="text-sm font-bold text-white">{selectedPoint.volume}</strong>
                        </div>
                        <div className="text-center p-2 rounded-xl bg-[#0C101B]/80 border border-border">
                          <span className="text-[9px] text-muted-foreground uppercase block font-semibold">Backlog Retido</span>
                          <strong className="text-sm font-bold text-warning">{selectedPoint.backlog}</strong>
                        </div>
                        <div className="text-center p-2 rounded-xl bg-[#0C101B]/80 border border-border">
                          <span className="text-[9px] text-muted-foreground uppercase block font-semibold">SLA Coleta</span>
                          <strong className="text-sm font-bold text-blue-400">{selectedPoint.taxa_coleta.toFixed(0)}%</strong>
                        </div>
                      </div>

                      {/* Address */}
                      <div>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Localização e Endereço:</span>
                        <p className="text-xs text-slate-300 leading-relaxed font-sans">{selectedPoint.endereco}</p>
                      </div>

                      {/* Form Formulário Operacional */}
                      <div className="bg-[#0C101B]/40 p-4 rounded-xl border border-border/80 space-y-4">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase block border-b border-border/30 pb-1">
                          Formulário Operacional do MD
                        </span>
                        
                        {/* IATA Input */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-muted-foreground uppercase block">
                            IATA (Nome do MD):
                          </label>
                          <input
                            type="text"
                            value={iataInput}
                            onChange={(e) => setIataInput(e.target.value)}
                            placeholder="Ex: Gaspar Centro"
                            className="w-full px-3 py-2 bg-[#0C101B] border border-border rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500/50"
                          />
                        </div>

                        {/* Observacao Input */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-muted-foreground uppercase block">
                            Observação (Informação do Ponto):
                          </label>
                          <textarea
                            value={obsInput}
                            onChange={(e) => setObsInput(e.target.value)}
                            placeholder="Informações operacionais sobre o ponto..."
                            className="w-full px-3 py-2 bg-[#0C101B] border border-border rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500/50 resize-none h-14"
                          />
                        </div>

                        {/* Status Selection */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-muted-foreground uppercase block">
                            Status da Decisão:
                          </label>
                          <select
                            value={decisaoInput}
                            onChange={(e) => setDecisaoInput(e.target.value)}
                            className="w-full px-3 py-2 bg-[#0C101B] border border-border rounded-lg text-xs text-slate-200 focus:outline-none focus:border-blue-500/50"
                          >
                            <option value="manter">🟢 manter (Verde)</option>
                            <option value="observar">🟡 observar (Amarela)</option>
                            <option value="trocar">🔴 trocar (Vermelha)</option>
                          </select>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end pt-1">
                          <button
                            onClick={handleSaveFullForm}
                            disabled={obsSaving}
                            className="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {obsSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                            <span>Salvar Informações</span>
                          </button>
                        </div>
                      </div>

                      {/* AI Copilot Cross-Analysis Button */}
                      {selectedPoint.decisao === "trocar" && (
                        <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl space-y-3">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-400 animate-pulse" />
                            <span className="text-xs font-bold text-purple-300">Copiloto IA Otimizador</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-relaxed">
                            Este MD está marcado para substituição. O Copiloto fará um cruzamento com os vizinhos para transferir a volumetria.
                          </p>
                          
                          <button
                            onClick={handleGenerateIAOtimizacao}
                            disabled={iaOtimizarLoading}
                            className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            {iaOtimizarLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            <span>Cruzar Vizinhos com IA</span>
                          </button>

                          {iaOtimizarRelatorio && (
                            <div className="mt-3 p-3 bg-[#0C101B]/85 border border-purple-500/30 rounded-lg max-h-[220px] overflow-y-auto text-[10px] text-slate-300 leading-relaxed font-sans prose prose-invert select-text whitespace-pre-wrap">
                              {iaOtimizarRelatorio}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Histogram Chart */}
                      {selectedPoint.histograma && Object.keys(selectedPoint.histograma).length > 0 && (
                        <div className="space-y-2">
                          <span className="text-[9px] font-bold text-muted-foreground uppercase block">Distribuição Horária de Bipagem:</span>
                          <div className="flex items-end justify-between gap-1 h-16 pt-2 bg-[#0C101B]/40 border border-border/40 rounded-xl px-2">
                            {Object.entries(selectedPoint.histograma).map(([hour, val]) => {
                              const maxVal = Math.max(...Object.values(selectedPoint.histograma), 1);
                              const heightPct = (val / maxVal) * 100;
                              return (
                                <div key={hour} className="flex-1 flex flex-col items-center gap-1 group relative">
                                  {/* Hover tooltip for hist */}
                                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-slate-900 border border-border text-[9px] px-1 rounded shadow opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                                    {hour}: {val}
                                  </div>
                                  <div 
                                    style={{ height: `${Math.max(heightPct, 5)}%` }} 
                                    className={`w-full rounded-t-sm transition-all duration-300 ${
                                      val > 0 ? "bg-emerald-500 group-hover:bg-emerald-400" : "bg-slate-800"
                                    }`}
                                  />
                                  <span className="text-[8px] text-muted-foreground font-mono leading-none">{hour.split(":")[0]}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Transfer Tool */}
                      <div className="border-t border-border pt-4 space-y-4">
                        <div className="flex justify-between items-center">
                          <h3 className="text-xs font-bold text-white flex items-center gap-1.5 uppercase tracking-wider">
                            <Navigation className="w-3.5 h-3.5 text-blue-400" />
                            <span>Consolidar Cargas</span>
                          </h3>
                          
                          <div className="flex items-center gap-1">
                            <span className="text-[9px] text-muted-foreground uppercase font-bold">Raio:</span>
                            <select
                              value={simulationRadius}
                              onChange={(e) => setSimulationRadius(parseFloat(e.target.value))}
                              className="px-2 py-1 bg-[#0C101B] border border-border rounded text-[10px] focus:outline-none"
                            >
                              <option value="2.0">2 km</option>
                              <option value="5.0">5 km</option>
                              <option value="10.0">10 km</option>
                              <option value="15.0">15 km</option>
                            </select>
                          </div>
                        </div>

                        {/* Alternatives list */}
                        <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                          {candidatesLoading ? (
                            <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground text-[10px]">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                              <span>Buscando alternativas próximas...</span>
                            </div>
                          ) : candidates.length === 0 ? (
                            <p className="text-[10px] text-muted-foreground italic text-center py-2">
                              Nenhum ponto regular (que aguarda até 18h+) encontrado a menos de {simulationRadius}km.
                            </p>
                          ) : (
                            candidates.map((c) => (
                              <div 
                                key={c.md_codigo} 
                                className="bg-[#0C101B] border border-border rounded-xl p-3 flex items-center justify-between gap-4 hover:border-blue-500/30 transition-all text-xs"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    <strong className="text-white">{c.md_codigo}</strong>
                                    <span className="text-[10px] text-slate-400 font-mono">({c.distancia_km} km)</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                                    <span>Volume: {c.volume}</span>
                                    <span>•</span>
                                    <span className="text-emerald-400">Fecha às {c.horario_fechamento}</span>
                                  </div>
                                </div>
                                
                                <button
                                  onClick={() => handleSimulateTransfer(c)}
                                  className="px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded text-[9px] font-bold transition-all cursor-pointer flex items-center gap-1"
                                >
                                  <span>Simular</span>
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="glass-panel p-6 rounded-2xl border border-border space-y-4">
                      <div className="flex items-center gap-2 border-b border-border pb-3">
                        <Map className="w-5 h-5 text-emerald-400" />
                        <h2 className="text-sm font-bold text-white uppercase tracking-wider">Painel da Malha</h2>
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Clique em um ponto de coleta (MD) no mapa para inspecionar seus dados de bipagem horária, identificar o horário de fechamento e simular consolidar cargas operacionais.
                      </p>

                      {/* Summary Metric list */}
                      <div className="space-y-3 pt-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Total MDs no Mapa:</span>
                          <strong className="text-white font-mono">{mapStats.total}</strong>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">MDs a Trocar:</span>
                          <strong className="text-red-400 font-mono">{mapStats.ofensores} ({mapStats.total > 0 ? ((mapStats.ofensores / mapStats.total)*100).toFixed(0) : 0}%)</strong>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Volume Total Mapeado:</span>
                          <strong className="text-white font-mono">{mapStats.volTotal.toLocaleString()} pct</strong>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Backlog Total Mapeado:</span>
                          <strong className="text-warning font-mono">{mapStats.bkTotal.toLocaleString()} pct</strong>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-400">Eficiência Média da Malha:</span>
                          <strong className="text-emerald-400 font-mono">{mapStats.avgSla.toFixed(1)}%</strong>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col h-[580px] bg-[#0A0D16]/50">
                  <div className="border-b border-border pb-3 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      <h2 className="text-sm font-bold text-white">Copiloto IA</h2>
                    </div>
                  </div>

                  {/* Period config for context */}
                  <div className="bg-[#0C101B]/80 p-3 rounded-xl border border-border/80 space-y-3 mb-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Contexto por:</span>
                        <select
                          value={copilotPeriodoTipo}
                          onChange={(e) => setCopilotPeriodoTipo(e.target.value)}
                          className="w-full px-2 py-1.5 bg-[#0C101B] border border-border rounded-lg text-[11px] text-slate-200 focus:outline-none"
                        >
                          <option value="Semanal">Semanal</option>
                          <option value="Mensal">Mensal</option>
                        </select>
                      </div>

                      <div>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase block mb-1">Referência:</span>
                        {copilotPeriodoTipo === "Semanal" && options.semanas.length > 0 && (
                          <select
                            value={copilotRotulo}
                            onChange={(e) => setCopilotRotulo(e.target.value)}
                            className="w-full px-2 py-1.5 bg-[#0C101B] border border-border rounded-lg text-[11px] text-slate-200 focus:outline-none"
                          >
                            {options.semanas.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        )}

                        {copilotPeriodoTipo === "Mensal" && (
                          <select
                            value={copilotRotulo}
                            onChange={(e) => setCopilotRotulo(e.target.value)}
                            className="w-full px-2 py-1.5 bg-[#0C101B] border border-border rounded-lg text-[11px] text-slate-200 focus:outline-none"
                          >
                            {Array.from(new Set(options.dias.map(d => {
                              const p = d.split("/");
                              return p.length === 3 ? `${p[2]}-${p[1]}` : "";
                            }))).filter(Boolean).map(m => (
                              <option key={m} value={m}>{formatMonth(m)}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Chat message history list */}
                  <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1 scrollbar-thin select-text">
                    {chatMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex gap-2.5 p-3 rounded-xl border text-xs leading-relaxed ${
                          msg.role === "user"
                            ? "bg-[#1E293B]/20 border-slate-700/40 ml-6 flex-row-reverse"
                            : "bg-purple-950/10 border-purple-500/10 mr-6"
                        }`}
                      >
                        <div className={`w-6.5 h-6.5 rounded-lg flex items-center justify-center shrink-0 ${
                          msg.role === "user" ? "bg-slate-700 text-slate-300" : "bg-purple-600/20 text-purple-400 border border-purple-500/20"
                        }`}>
                          {msg.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                        </div>
                        <div className="whitespace-pre-wrap flex-1 prose prose-invert max-w-none text-slate-300 select-text">
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="flex gap-2.5 p-3 rounded-xl border border-purple-500/10 bg-purple-950/10 mr-6 items-center">
                        <div className="w-6.5 h-6.5 rounded-lg bg-purple-600/20 text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0">
                          <Bot className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
                          <span>Analisando dados do período...</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Chat input box */}
                  <form onSubmit={handleSendCopilotChat} className="flex gap-2 border-t border-border/40 pt-3">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Faça perguntas sobre a malha de Gaspar..."
                      className="flex-1 px-3 py-2 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none focus:border-purple-500/50"
                    />
                    <button
                      type="submit"
                      disabled={chatLoading || !chatInput.trim()}
                      className="px-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-55 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-all cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              )}
          </div>
        </div>
      
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
}
