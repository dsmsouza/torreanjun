"use client";

import React, { useEffect, useState, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import {
  Truck,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Building2,
  Sparkles,
  Calendar,
  Plus,
  X,
  Store,
  Package,
  BarChart3,
  Layers,
  MapPin,
  TrendingUp,
  Activity,
  ArrowUpRight,
  Filter,
  Check,
  ChevronRight,
  ShieldAlert,
  SlidersHorizontal,
  Flame,
  Info,
  Zap,
  UploadCloud,
  Loader2
} from "lucide-react";
import IngestaoLogPanel from "@/components/IngestaoLogPanel";
import {
  fetchDiasColetas,
  fetchResumoColetas,
  fetchMdsColetas,
  fetchSellersColetas,
  fetchHorariosColetas,
  cadastrarPontoColeta,
  otimizarPlanilha
} from "@/lib/api";

type TabType = "visao_geral" | "mds" | "sellers" | "horarios";

export default function CentralColetasPage() {
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState<string[]>([]);
  const [selectedDia, setSelectedDia] = useState<string>("");
  const [selectedCliente, setSelectedCliente] = useState<string>("");
  const [selectedRegional, setSelectedRegional] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TabType>("visao_geral");

  // Dados do Resumo
  const [resumo, setResumo] = useState<any>(null);

  // Aba 2: MDs
  const [mdsList, setMdsList] = useState<any[]>([]);
  const [loadingMds, setLoadingMds] = useState(false);
  const [mdsSearch, setMdsSearch] = useState("");
  const [mdsFiltro, setMdsFiltro] = useState<string>("todos");

  // Aba 3: Sellers
  const [sellersList, setSellersList] = useState<any[]>([]);
  const [loadingSellers, setLoadingSellers] = useState(false);
  const [sellersSearch, setSellersSearch] = useState("");

  // Aba 4: Horários
  const [horariosData, setHorariosData] = useState<any>(null);
  const [loadingHorarios, setLoadingHorarios] = useState(false);
  const [selectedMdHorario, setSelectedMdHorario] = useState<string>("");

  // Modal de Cadastro Completo de Ponto / HUB / Galpão
  const [modalCadastroOpen, setModalCadastroOpen] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  const [geocodingCadastro, setGeocodingCadastro] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [formCadastro, setFormCadastro] = useState({
    md_codigo: "",
    nome_ponto: "",
    tipo_ponto: "MD (Ponto de Coleta)",
    cep: "",
    endereco: "",
    horario_trabalho: "08:00 - 18:00",
    cidade: "São Paulo",
    estado: "SP",
    regional: "GRANDE SP",
    latitude: "",
    longitude: "",
  });
  const [sucessoMsg, setSucessoMsg] = useState<string | null>(null);

  
  // 1. Carrega lista de datas disponíveis (com auto-recuperação caso o backend esteja iniciando)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    async function initDias() {
      try {
        const res = await fetchDiasColetas();
        if (!unmounted && res.dias && res.dias.length > 0) {
          setDias(res.dias);
          setSelectedDia(res.dia_recente || res.dias[0]);
        }
      } catch (err) {
        console.warn("Aguardando conexão com o Backend para carregar datas...", err);
        if (!unmounted) {
          timer = setTimeout(initDias, 3000);
        }
      }
    }
    initDias();

    return () => {
      unmounted = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // 2. Carrega Resumo Executivo quando muda data/cliente/regional
  const carregarResumo = async () => {
    if (!selectedDia) return;
    setLoading(true);
    try {
      const data = await fetchResumoColetas(selectedDia, selectedCliente, selectedRegional);
      setResumo(data);
    } catch (err) {
      console.warn("Aviso ao carregar resumo de coletas:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarResumo();
  }, [selectedDia, selectedCliente, selectedRegional]);

  // 3. Carrega Aba de MDs
  useEffect(() => {
    if (activeTab === "mds" && selectedDia) {
      carregarMds();
    }
  }, [activeTab, selectedDia, selectedCliente, selectedRegional, mdsFiltro]);

  const carregarMds = async () => {
    setLoadingMds(true);
    try {
      const data = await fetchMdsColetas(
        selectedDia,
        selectedCliente,
        selectedRegional,
        mdsSearch,
        mdsFiltro !== "todos" ? mdsFiltro : undefined
      );
      setMdsList(data.mds || []);
    } catch (err) {
      console.warn("Aviso ao carregar MDs:", err);
    } finally {
      setLoadingMds(false);
    }
  };

  // 4. Carrega Aba de Sellers
  useEffect(() => {
    if (activeTab === "sellers" && selectedDia) {
      carregarSellers();
    }
  }, [activeTab, selectedDia, selectedCliente, selectedRegional]);

  const carregarSellers = async () => {
    setLoadingSellers(true);
    try {
      const data = await fetchSellersColetas(
        selectedDia,
        selectedCliente,
        selectedRegional,
        sellersSearch
      );
      setSellersList(data.sellers || []);
    } catch (err) {
      console.warn("Aviso ao carregar sellers:", err);
    } finally {
      setLoadingSellers(false);
    }
  };

  // 5. Carrega Aba de Horários
  useEffect(() => {
    if (activeTab === "horarios" && selectedDia) {
      carregarHorarios();
    }
  }, [activeTab, selectedDia, selectedMdHorario]);

  const carregarHorarios = async () => {
    setLoadingHorarios(true);
    try {
      const data = await fetchHorariosColetas(selectedDia, selectedMdHorario);
      setHorariosData(data);
    } catch (err) {
      console.warn("Aviso ao carregar horários:", err);
    } finally {
      setLoadingHorarios(false);
    }
  };

  // Abrir modal de cadastro completo para ponto/HUB/Galpão
  const abrirCadastroPonto = (mdCodigo: string) => {
    let ufSugerida = "SP";
    let tipoSugerido = "MD (Ponto de Coleta)";
    const cdUpper = mdCodigo.toUpperCase();

    if (cdUpper.startsWith("RJ-")) ufSugerida = "RJ";
    else if (cdUpper.startsWith("MG-")) ufSugerida = "MG";
    else if (cdUpper.startsWith("PR-")) ufSugerida = "PR";
    else if (cdUpper.startsWith("SC-")) ufSugerida = "SC";
    else if (cdUpper.startsWith("RS-")) ufSugerida = "RS";
    else if (cdUpper.startsWith("GO-")) ufSugerida = "GO";
    else if (cdUpper.startsWith("BA-")) ufSugerida = "BA";
    else if (cdUpper.startsWith("PE-")) ufSugerida = "PE";
    else if (cdUpper.startsWith("CE-")) ufSugerida = "CE";

    if (cdUpper.includes("-H") || cdUpper.includes("HUB")) {
      tipoSugerido = "HUB (Transferência)";
    } else if (cdUpper.includes("GLP") || cdUpper.includes("-CD") || cdUpper.includes("WR-")) {
      tipoSugerido = "Galpão / CD (Distribuição)";
    } else if (cdUpper.includes("CROSS")) {
      tipoSugerido = "Crossdocking";
    }

    setFormCadastro({
      md_codigo: mdCodigo,
      nome_ponto: mdCodigo,
      tipo_ponto: tipoSugerido,
      cep: "",
      endereco: "",
      horario_trabalho: "08:00 - 18:00",
      cidade: ufSugerida === "SP" ? "São Paulo" : ufSugerida === "RJ" ? "Rio de Janeiro" : "Belo Horizonte",
      estado: ufSugerida,
      regional: ufSugerida === "SP" ? "GRANDE SP" : ufSugerida === "RJ" ? "RIO DE JANEIRO" : "MINAS GERAIS",
      latitude: "",
      longitude: "",
    });
    setModalCadastroOpen(true);
  };

  const handleBuscarViaCep = async () => {
    const cepLimpo = formCadastro.cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) {
      alert("Por favor, digite um CEP válido com 8 dígitos.");
      return;
    }
    setBuscandoCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await res.json();
      if (data.erro) {
        alert("CEP não encontrado.");
      } else {
        const novoEnd = `${data.logradouro || ""}, ${data.bairro || ""}`.trim();
        const cid = data.localidade || formCadastro.cidade;
        const uf = data.uf || formCadastro.estado;
        setFormCadastro(prev => ({
          ...prev,
          endereco: novoEnd,
          cidade: cid,
          estado: uf,
        }));
        // Tenta obter coordenadas automaticamente após encontrar o endereço
        handleBuscarCoordenadasAuto(`${novoEnd}, ${cid}, ${uf}, Brasil`);
      }
    } catch (e) {
      console.error("Erro ao consultar ViaCEP:", e);
    } finally {
      setBuscandoCep(false);
    }
  };

  const handleBuscarCoordenadasAuto = async (customQuery?: string) => {
    const busca = customQuery || `${formCadastro.endereco} ${formCadastro.cidade} ${formCadastro.estado} Brasil`.trim();
    if (!busca || busca === "Brasil") {
      alert("Insira ao menos a cidade ou endereço completo para buscar coordenadas.");
      return;
    }
    setGeocodingCadastro(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(busca)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        setFormCadastro(prev => ({
          ...prev,
          latitude: data[0].lat,
          longitude: data[0].lon,
        }));
      } else {
        alert("Coordenadas exatas não localizadas. Você pode digitar a Latitude e Longitude manualmente.");
      }
    } catch (e) {
      console.error("Erro ao buscar coordenadas:", e);
    } finally {
      setGeocodingCadastro(false);
    }
  };

  const handleCadastrarPonto = async (e: React.FormEvent) => {
    e.preventDefault();
    setCadastrando(true);
    try {
      await cadastrarPontoColeta({
        ...formCadastro,
        latitude: formCadastro.latitude ? parseFloat(formCadastro.latitude) : null,
        longitude: formCadastro.longitude ? parseFloat(formCadastro.longitude) : null,
      });
      setSucessoMsg(`${formCadastro.tipo_ponto} '${formCadastro.md_codigo}' cadastrado e integrado à malha!`);
      setModalCadastroOpen(false);
      setTimeout(() => setSucessoMsg(null), 4000);
      // Recarrega resumo e mds
      carregarResumo();
      if (activeTab === "mds") carregarMds();
    } catch (err: any) {
      alert("Erro ao cadastrar ponto: " + err.message);
    } finally {
      setCadastrando(false);
    }
  };

  const kpis = resumo?.kpis || resumo?.totais;
  const alertas = resumo?.alertas;
  const clientesBreakdown = resumo?.clientes_breakdown || [];

  return (
    <div className="flex h-screen bg-[#090D16] text-slate-100 font-sans overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-y-auto pl-16 md:pl-64 flex flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-20 bg-[#0C101B]/95 backdrop-blur-md border-b border-slate-800/80 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" /> Operação & Coleta
              </span>
              <span className="text-xs text-slate-400">• Torre ANJUN</span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2 mt-1">
              Central de Coletas
              <span className="text-xs font-normal text-slate-400 px-2 py-0.5 rounded bg-slate-800/70 border border-slate-700/60">
                Dropoff & Coletas Ativas
              </span>
            </h1>
          </div>

          {/* Filtros de Topo */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Seletor de Data */}
            <div className="flex items-center gap-2 bg-[#131926] px-3 py-1.5 rounded-xl border border-slate-700/80 text-xs">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-400 hidden sm:inline">Data da Coleta:</span>
              <select
                value={selectedDia}
                onChange={(e) => setSelectedDia(e.target.value)}
                className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
              >
                {dias.map((d) => (
                  <option key={d} value={d} className="bg-slate-900 text-white">
                    {d}
                  </option>
                ))}
              </select>
            </div>

            {/* Seletor de Regional */}
            <div className="flex items-center gap-2 bg-[#131926] px-3 py-1.5 rounded-xl border border-slate-700/80 text-xs">
              <MapPin className="w-4 h-4 text-cyan-400" />
              <select
                value={selectedRegional}
                onChange={(e) => setSelectedRegional(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
              >
                <option value="" className="bg-slate-900 text-white">Todas as Regionais</option>
                <option value="GRANDE SP" className="bg-slate-900 text-white">Grande SP</option>
                <option value="INTERIOR SP" className="bg-slate-900 text-white">Interior SP</option>
                <option value="RIO DE JANEIRO" className="bg-slate-900 text-white">Rio de Janeiro</option>
                <option value="MINAS GERAIS" className="bg-slate-900 text-white">Minas Gerais</option>
                <option value="SUL" className="bg-slate-900 text-white">Sul</option>
                <option value="NORDESTE" className="bg-slate-900 text-white">Nordeste</option>
              </select>
            </div>

            

            {/* Botão Atualizar */}
            <button
              onClick={() => {
                carregarResumo();
                if (activeTab === "mds") carregarMds();
                if (activeTab === "sellers") carregarSellers();
                if (activeTab === "horarios") carregarHorarios();
              }}
              title="Recarregar Dados"
              className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 text-slate-300 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-400" : ""}`} />
            </button>
          </div>
        </header>

        {/* Notificação de Sucesso */}
        {sucessoMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl flex items-center justify-between text-xs animate-in fade-in duration-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{sucessoMsg}</span>
            </div>
            <button onClick={() => setSucessoMsg(null)} className="text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* BANNER DE ALERTAS INTELIGENTES */}
        {alertas && (alertas.primeira_bipagem?.length > 0 || alertas.nao_cadastrados?.length > 0) && (
          <div className="px-6 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Alerta: Primeira Bipagem na História */}
            {alertas.primeira_bipagem?.length > 0 && (
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      🌟 {alertas.primeira_bipagem.length} {alertas.primeira_bipagem.length === 1 ? "Ponto Ativado" : "Pontos Ativados"} (1ª Bipagem)
                    </p>
                    <span className="text-[10px] text-amber-400/80 bg-amber-500/15 px-2 py-0.5 rounded-full font-mono">
                      Novo na Rede
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Estes pontos registraram a primeira movimentação de pacotes de sua história hoje:
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {alertas.primeira_bipagem.slice(0, 5).map((p: any) => (
                      <span
                        key={p.md_codigo}
                        className="px-2 py-0.5 bg-amber-500/15 border border-amber-500/30 text-amber-200 rounded-md text-[11px] font-mono flex items-center gap-1"
                      >
                        {p.md_codigo}
                        <span className="text-[10px] text-amber-400/80 font-sans">({p.volume} pctes)</span>
                      </span>
                    ))}
                    {alertas.primeira_bipagem.length > 5 && (
                      <button
                        onClick={() => {
                          setActiveTab("mds");
                          setMdsFiltro("primeira_bipagem");
                        }}
                        className="text-[11px] text-amber-400 hover:underline px-1 font-medium"
                      >
                        +{alertas.primeira_bipagem.length - 5} ver todos
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Alerta: Pontos Não Cadastrados */}
            {alertas.nao_cadastrados?.length > 0 && (
              <div className="p-3.5 rounded-xl bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent border border-rose-500/30 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-4 h-4 animate-bounce" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                      ⚠️ {alertas.nao_cadastrados.length} {alertas.nao_cadastrados.length === 1 ? "Ponto Não Cadastrado" : "Pontos Não Cadastrados"}
                    </p>
                    <span className="text-[10px] text-rose-400/80 bg-rose-500/15 px-2 py-0.5 rounded-full font-mono">
                      Ação Necessária
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Biparam pacotes na planilha, mas ainda não constam na lista oficial da malha:
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {alertas.nao_cadastrados.slice(0, 4).map((p: any) => (
                      <button
                        key={p.md_codigo}
                        onClick={() => abrirCadastroPonto(p.md_codigo)}
                        className="px-2 py-0.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 rounded-md text-[11px] font-mono flex items-center gap-1 cursor-pointer transition-colors"
                        title="Clique para cadastrar este ponto"
                      >
                        <span>{p.md_codigo}</span>
                        <span className="text-[10px] text-rose-400/90 font-sans">({p.volume})</span>
                        <Plus className="w-3 h-3 text-rose-300 ml-0.5" />
                      </button>
                    ))}
                    {alertas.nao_cadastrados.length > 4 && (
                      <button
                        onClick={() => {
                          setActiveTab("mds");
                          setMdsFiltro("nao_cadastrado");
                        }}
                        className="text-[11px] text-rose-400 hover:underline px-1 font-medium"
                      >
                        +{alertas.nao_cadastrados.length - 4} ver todos
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* NAVEGAÇÃO DE ABAS */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-2 border-b border-slate-800">
            <button
              onClick={() => setActiveTab("visao_geral")}
              className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === "visao_geral"
                  ? "border-emerald-500 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              1. Visão Geral Executiva
            </button>

            <button
              onClick={() => setActiveTab("mds")}
              className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === "mds"
                  ? "border-emerald-500 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Store className="w-4 h-4 text-cyan-400" />
              2. Pontos de Coleta (MDs)
              {alertas && (alertas.primeira_bipagem?.length > 0 || alertas.nao_cadastrados?.length > 0) && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              )}
            </button>

            <button
              onClick={() => setActiveTab("sellers")}
              className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === "sellers"
                  ? "border-emerald-500 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Building2 className="w-4 h-4 text-indigo-400" />
              3. Sellers & Embarcadores
            </button>

            <button
              onClick={() => setActiveTab("horarios")}
              className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === "horarios"
                  ? "border-emerald-500 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Clock className="w-4 h-4 text-amber-400" />
              4. Horários de Bipagem (Coluna M)
              <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 text-[10px] rounded font-mono">
                Picos & Rota
              </span>
            </button>
          </div>
        </div>

        {/* CONTEÚDO DAS ABAS */}
        <div className="p-6 space-y-6">
          {/* ============================================================ */}
          {/* ABA 1: VISÃO GERAL */}
          {/* ============================================================ */}
          {activeTab === "visao_geral" && (
            <div className="space-y-6">
              {/* 🚨 ALERTA MATINAL DE BACKLOG DO DIA ANTERIOR */}
              {kpis?.backlog_md > 0 && (
                <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-4 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      <AlertTriangle className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          PRIORIDADE MATINAL DE COLETA
                        </span>
                        <span className="text-xs text-amber-200/80 font-medium">
                          Dia {selectedDia}
                        </span>
                      </div>
                      <h4 className="text-sm md:text-base font-bold text-white mt-1">
                        Existem <span className="text-amber-400 underline font-extrabold">{kpis.backlog_md.toLocaleString("pt-BR")} pacotes</span> retidos aguardando o caminhão da ANJUN passar
                      </h4>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Estes pontos devem ser priorizados na primeira rota de recolhimento de hoje cedo para evitar estouro de SLA.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setActiveTab("mds");
                      setMdsFiltro("backlog");
                    }}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
                  >
                    Ver MDs com Carga Retida
                  </button>
                </div>
              )}

              {/* Cards de Métricas Principais */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total de Pedidos */}
                <div className="p-4 rounded-xl bg-[#131926]/90 border border-slate-800 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                    <span>Volume Total Movimentado</span>
                    <Package className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="mt-3">
                    <p className="text-2xl font-bold text-white tracking-tight">
                      {kpis?.total_pedidos ? kpis.total_pedidos.toLocaleString("pt-BR") : "0"}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Pacotes registrados na data
                    </p>
                  </div>
                </div>

                {/* Coletados ANJUN */}
                <div className="p-4 rounded-xl bg-[#131926]/90 border border-emerald-500/30 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-emerald-400 text-xs font-medium">
                    <span>Coletados ANJUN (Sucesso)</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="mt-3">
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-bold text-emerald-400 tracking-tight">
                        {kpis?.total_coletados ? kpis.total_coletados.toLocaleString("pt-BR") : "0"}
                      </p>
                      <span className="text-xs font-bold text-emerald-300">
                        {kpis?.taxa_coleta_pct || 0}%
                      </span>
                    </div>
                    {/* Barra de Progresso */}
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, kpis?.taxa_coleta_pct || 0)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Backlog no MD */}
                <div className="p-4 rounded-xl bg-[#131926]/90 border border-amber-500/30 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-amber-400 text-xs font-medium">
                    <span>Backlog Retido nos MDs</span>
                    <Clock className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="mt-3">
                    <p className="text-2xl font-bold text-amber-400 tracking-tight">
                      {kpis?.backlog_md ? kpis.backlog_md.toLocaleString("pt-BR") : "0"}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Aguardando coleta física do caminhão
                    </p>
                  </div>
                </div>

                {/* Modalidade Dropoff vs Pickup */}
                <div className="p-4 rounded-xl bg-[#131926]/90 border border-slate-800 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                    <span>Mix de Modalidade</span>
                    <Layers className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="mt-3 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300 flex items-center gap-1.5">
                        <Store className="w-3 h-3 text-cyan-400" /> Dropoff (Balcão):
                      </span>
                      <span className="font-bold text-white">
                        {kpis?.dropoff_volume?.toLocaleString("pt-BR") || 0}{" "}
                        <span className="text-slate-400 font-normal">({kpis?.dropoff_pct || 0}%)</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-300 flex items-center gap-1.5">
                        <Truck className="w-3 h-3 text-indigo-400" /> Pickup (Coleta):
                      </span>
                      <span className="font-bold text-white">
                        {kpis?.pickup_volume?.toLocaleString("pt-BR") || 0}{" "}
                        <span className="text-slate-400 font-normal">({kpis?.pickup_pct || 0}%)</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção de Clientes Breakdown */}
              <div className="p-5 rounded-2xl bg-[#131926]/80 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-wide">
                      Distribuição por Embarcador / Cliente
                    </h3>
                    <p className="text-xs text-slate-400">
                      Volume de coletas e taxa de atendimento segregados por conta comercial
                    </p>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    {clientesBreakdown.length} Contas Ativas
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {clientesBreakdown.map((cli: any, idx: number) => {
                    const nomeCli = cli.cliente || cli.nome_cliente || `Cliente ${idx + 1}`;
                    const volCli = Number(cli.volume) || 0;
                    const colCli = cli.coletados !== undefined ? Number(cli.coletados) : volCli;
                    const bklCli = Number(cli.backlog) || 0;
                    const taxaCli = cli.taxa_pct !== undefined ? Number(cli.taxa_pct) : 100;
                    const pctCli = cli.pct_total !== undefined ? Number(cli.pct_total) : (cli.share_pct !== undefined ? Number(cli.share_pct) : 0);

                    return (
                      <div
                        key={nomeCli + idx}
                        className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-xs tracking-wide">
                            {nomeCli}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            {pctCli}% do total
                          </span>
                        </div>

                        <div className="my-3 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-400">Volume Total:</span>
                            <span className="font-semibold text-white">
                              {volCli.toLocaleString("pt-BR")}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-emerald-400">Coletados:</span>
                            <span className="font-semibold text-emerald-400">
                              {colCli.toLocaleString("pt-BR")} ({taxaCli}%)
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-amber-400">Backlog no MD:</span>
                            <span className="font-semibold text-amber-400">
                              {bklCli.toLocaleString("pt-BR")}
                            </span>
                          </div>
                        </div>

                        {/* Barra de Progresso */}
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full"
                            style={{ width: `${Math.min(100, taxaCli)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* ABA 2: PONTOS DE COLETA (MDs) */}
          {/* ============================================================ */}
          {activeTab === "mds" && (
            <div className="space-y-4">
              {/* Barra de Filtros e Busca */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {/* Filtros Rápidos */}
                <div className="flex items-center gap-1.5 p-1 bg-[#131926] rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setMdsFiltro("todos")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      mdsFiltro === "todos"
                        ? "bg-slate-700 text-white font-bold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setMdsFiltro("bipando")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      mdsFiltro === "bipando"
                        ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🟢 Bipando Constante
                  </button>
                  <button
                    onClick={() => setMdsFiltro("sem_bipagem")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      mdsFiltro === "sem_bipagem"
                        ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    ⚠️ Sem Bipagem (5+ dias)
                  </button>
                  <button
                    onClick={() => setMdsFiltro("backlog")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      mdsFiltro === "backlog"
                        ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Com Backlog
                  </button>
                  <button
                    onClick={() => setMdsFiltro("primeira_bipagem")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      mdsFiltro === "primeira_bipagem"
                        ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🌟 1ª Bipagem
                  </button>
                  <button
                    onClick={() => setMdsFiltro("desvio_pickup")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      mdsFiltro === "desvio_pickup"
                        ? "bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🚨 Pickups em MD
                  </button>
                  <button
                    onClick={() => setMdsFiltro("nao_cadastrado")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      mdsFiltro === "nao_cadastrado"
                        ? "bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    ⚠️ Não Cadastrados
                  </button>
                </div>

                {/* Input de Busca */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={mdsSearch}
                    onChange={(e) => setMdsSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") carregarMds();
                    }}
                    placeholder="Buscar por código MD, cidade..."
                    className="w-full bg-[#131926] border border-slate-800 rounded-xl pl-9 pr-20 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                  <button
                    onClick={carregarMds}
                    className="absolute right-2 top-1.5 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold cursor-pointer"
                  >
                    Filtrar
                  </button>
                </div>
              </div>

              {/* Tabela de MDs */}
              <div className="rounded-2xl border border-slate-800 bg-[#131926]/70 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                        <th className="py-3 px-4">Ponto (MD)</th>
                        <th className="py-3 px-4">Localização / Regional</th>
                        <th className="py-3 px-4 text-center">Alertas / Status</th>
                        <th className="py-3 px-4 text-right">Volume Bipado</th>
                        <th className="py-3 px-4 text-right">Coletado ANJUN</th>
                        <th className="py-3 px-4 text-right">Backlog no MD</th>
                        <th className="py-3 px-4 text-center">Taxa de Coleta</th>
                        <th className="py-3 px-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {loadingMds ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-400">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
                              <span>Carregando pontos de coleta...</span>
                            </div>
                          </td>
                        </tr>
                      ) : mdsList.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-400">
                            Nenhum ponto de coleta encontrado para os filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        mdsList.map((md: any) => (
                          <tr key={md.md_codigo} className="hover:bg-slate-800/30 transition-colors">
                            {/* Código MD */}
                            <td className="py-3 px-4 font-mono font-bold text-white flex items-center gap-2">
                              <Store className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span>{md.md_codigo}</span>
                            </td>

                            {/* Cidade / Regional */}
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-200">
                                {md.cidade} {md.estado ? `- ${md.estado}` : ""}
                              </div>
                              <div className="text-[10px] text-slate-400 uppercase font-mono">
                                {md.regional}
                              </div>
                            </td>

                            {/* Alertas */}
                            <td className="py-3 px-4 text-center">
                              <div className="flex flex-wrap items-center justify-center gap-1">
                                                                {md.is_desvio_pickup && (
                                  <span 
                                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40"
                                    title={`${md.vol_pickup || 0} pacotes de coleta/pickup foram dropados neste MD indevidamente`}
                                  >
                                    🚨 {md.vol_pickup} Pickups no MD
                                  </span>
                                )}
{md.is_primeira_bipagem && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    🌟 1ª Bipagem
                                  </span>
                                )}
                                {!md.is_cadastrado && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                    ⚠️ Não Cadastrado
                                  </span>
                                )}
                                {md.is_sem_bipagem ? (
                                  <span 
                                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                    title={`Última bipagem registrada em: ${md.data_ultima_bipagem || "N/D"}`}
                                  >
                                    ⚠️ Sem Bipagem ({md.dias_sem_bipar}d)
                                  </span>
                                ) : (
                                  md.is_cadastrado && !md.is_primeira_bipagem && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                      🟢 Ativo
                                    </span>
                                  )
                                )}
                              </div>
                            </td>

                            {/* Volume */}
                            <td className="py-3 px-4 text-right font-semibold text-white font-mono">
                              {(md.volume || 0).toLocaleString("pt-BR")}
                            </td>

                            {/* Coletado */}
                            <td className="py-3 px-4 text-right font-semibold text-emerald-400 font-mono">
                              {(md.coletados || 0).toLocaleString("pt-BR")}
                            </td>

                            {/* Backlog */}
                            <td className="py-3 px-4 text-right font-semibold text-amber-400 font-mono">
                              {Number(md.backlog) > 0 ? Number(md.backlog).toLocaleString("pt-BR") : "-"}
                            </td>

                            {/* Taxa */}
                            <td className="py-3 px-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="font-semibold text-xs text-white">
                                  {md.taxa_coleta_pct}%
                                </span>
                                <div className="w-12 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      md.taxa_coleta_pct === 100
                                        ? "bg-emerald-500"
                                        : md.taxa_coleta_pct > 50
                                        ? "bg-cyan-500"
                                        : "bg-amber-500"
                                    }`}
                                    style={{ width: `${Math.min(100, md.taxa_coleta_pct)}%` }}
                                  />
                                </div>
                              </div>
                            </td>

                            {/* Ações */}
                            <td className="py-3 px-4 text-center">
                              {!md.is_cadastrado ? (
                                <button
                                  onClick={() => abrirCadastroPonto(md.md_codigo)}
                                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 mx-auto cursor-pointer transition-colors"
                                >
                                  <Plus className="w-3 h-3" /> Cadastrar
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setSelectedMdHorario(md.md_codigo);
                                    setActiveTab("horarios");
                                  }}
                                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[10px] flex items-center gap-1 mx-auto cursor-pointer transition-colors"
                                  title="Ver horários de bipagem deste ponto"
                                >
                                  <Clock className="w-3 h-3 text-amber-400" /> Horários
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* ABA 3: SELLERS & EMBARCADORES */}
          {/* ============================================================ */}
          {activeTab === "sellers" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">
                    Top Sellers da Operação
                  </h3>
                  <p className="text-xs text-slate-400">
                    Sellers com maior volumetria no dia, modalidade de entrega e localização
                  </p>
                </div>

                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={sellersSearch}
                    onChange={(e) => setSellersSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") carregarSellers();
                    }}
                    placeholder="Buscar seller, loja, bairro..."
                    className="w-full bg-[#131926] border border-slate-800 rounded-xl pl-9 pr-20 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                  />
                  <button
                    onClick={carregarSellers}
                    className="absolute right-2 top-1.5 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-semibold cursor-pointer"
                  >
                    Filtrar
                  </button>
                </div>
              </div>

              {/* Tabela de Sellers */}
              <div className="rounded-2xl border border-slate-800 bg-[#131926]/70 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                        <th className="py-3 px-4">Seller / Embarcador</th>
                        <th className="py-3 px-4">Modalidade</th>
                        <th className="py-3 px-4">Ponto MD / Destino</th>
                        <th className="py-3 px-4">Bairro / Cidade</th>
                        <th className="py-3 px-4 text-right">Volume de Pacotes</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      {loadingSellers ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <RefreshCw className="w-5 h-5 animate-spin text-indigo-400" />
                              <span>Carregando sellers...</span>
                            </div>
                          </td>
                        </tr>
                      ) : sellersList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400">
                            Nenhum seller encontrado para a data ou pesquisa selecionada.
                          </td>
                        </tr>
                      ) : (
                        sellersList.map((s: any, idx: number) => {
                          const nomeSeller = s.seller_nome || s.merchant_nome || "Seller Sem Nome";
                          const contaCliente = s.nome_cliente || s.cliente || "";
                          const modalidadeText = s.modalidade || (s.maneira_coleta && s.maneira_coleta.toLowerCase().includes("coleta") ? "Pickup (Coleta)" : "Dropoff (Balcão)");
                          const pontoDestino = s.ponto_md || s.ponto_colecao || "N/A";
                          const statusText = s.status_coleta || (Number(s.backlog) > 0 ? `${s.taxa_coleta || 0}% Coletado` : "100% Coletado");
                          const isPickup = modalidadeText.toLowerCase().includes("pickup") || modalidadeText.toLowerCase().includes("coleta");

                          return (
                            <tr key={`${nomeSeller}-${idx}`} className="hover:bg-slate-800/30 transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                  <span className="font-semibold text-white">{nomeSeller}</span>
                                  {contaCliente && (
                                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                      {contaCliente}
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    isPickup
                                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                      : "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                                  }`}
                                >
                                  {modalidadeText}
                                </span>
                              </td>

                              <td className="py-3 px-4 font-mono text-slate-300 text-xs">
                                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300">
                                  {pontoDestino}
                                </span>
                              </td>

                              <td className="py-3 px-4 text-slate-300">
                                {s.bairro ? `${s.bairro}, ` : ""}{s.cidade || "São Paulo"}{s.estado ? ` - ${s.estado}` : ""}
                              </td>

                              <td className="py-3 px-4 text-right font-bold text-white font-mono">
                                {(s.volume || 0).toLocaleString("pt-BR")}
                              </td>

                              <td className="py-3 px-4 text-center">
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                                  Number(s.backlog) > 0 
                                    ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                                    : "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                                }`}>
                                  {statusText}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* ABA 4: HORÁRIOS DE BIPAGEM (COLUNA M) */}
          {/* ============================================================ */}
          {activeTab === "horarios" && (
            <div className="space-y-6">
              {/* Header da Aba com Seletor de MD */}
              <div className="p-5 rounded-2xl bg-[#131926]/90 border border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-400" />
                    <h3 className="text-base font-bold text-white tracking-wide">
                      Análise de Horário de Bipagem (Coluna M)
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                    A Coluna M ("Tempo real para a coleta") registra o momento exato em que o ponto de coleta bipou o pacote. Essa curva identifica os horários de pico e orienta a logística da ANJUN na definição da janela ideal de recolhimento por caminhão/van.
                  </p>
                </div>

                {/* Seletor de Ponto Específico */}
                <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-xl border border-slate-700 text-xs shrink-0">
                  <Store className="w-4 h-4 text-cyan-400" />
                  <span className="text-slate-400">Filtrar Ponto:</span>
                  <select
                    value={selectedMdHorario}
                    onChange={(e) => setSelectedMdHorario(e.target.value)}
                    className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer max-w-[160px]"
                  >
                    <option value="" className="bg-slate-900 text-white">
                      Toda a Rede (Geral)
                    </option>
                    {horariosData?.mds_disponiveis?.map((mdCode: string) => (
                      <option key={mdCode} value={mdCode} className="bg-slate-900 text-white font-mono">
                        {mdCode}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* CARD DE DESTAQUE: HORÁRIO DE PICO & JANELA RECOMENDADA */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Horário de Pico */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-[#131926] border border-amber-500/30">
                  <div className="flex items-center justify-between text-amber-400 text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-amber-400" /> Horário de Pico de Bipagem
                    </span>
                    <span className="text-[10px] bg-amber-500/20 px-2 py-0.5 rounded-full font-mono">
                      Máxima Entrada
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-white mt-3 font-mono">
                    {horariosData?.horario_pico || "Calculando..."}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Faixa horária de maior fluxo de entrega pelos sellers no balcão.
                  </p>
                </div>

                {/* Janela Recomendada da ANJUN */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-[#131926] border border-emerald-500/30">
                  <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-emerald-400" /> Janela Recomendada de Coleta
                    </span>
                    <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
                      Rota Otimizada
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-300 mt-3 font-mono">
                    {horariosData?.janela_recomendada_anjun || "Calculando..."}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Janela ideal para o caminhão/van da ANJUN recolher o volume acumulado.
                  </p>
                </div>

                {/* Total Analisado */}
                <div className="p-4 rounded-xl bg-[#131926] border border-slate-800">
                  <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                    <span>Pacotes com Timestamp Válido</span>
                    <Activity className="w-4 h-4 text-cyan-400" />
                  </div>
                  <p className="text-2xl font-bold text-white mt-3 font-mono">
                    {horariosData?.total_com_horario?.toLocaleString("pt-BR") || 0}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {selectedMdHorario ? `No ponto ${selectedMdHorario}` : "Em toda a malha operacional"}
                  </p>
                </div>
              </div>

              {/* Racional Operacional */}
              {horariosData?.recomendacao_texto && (
                <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start gap-3 text-xs text-slate-300">
                  <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white">Estratégia Operacional: </span>
                    {horariosData.recomendacao_texto}
                  </div>
                </div>
              )}

              {/* GRÁFICO / TIMELINE DE DISTRIBUIÇÃO HORÁRIA */}
              <div className="p-6 rounded-2xl bg-[#131926]/80 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-white tracking-wide">
                      Curva de Distribuição por Hora (08h às 22h+)
                    </h4>
                    <p className="text-xs text-slate-400">
                      Volume e percentual de pacotes bipados a cada hora do dia
                    </p>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    Fonte: Coluna M (Tempo real para a coleta)
                  </span>
                </div>

                {loadingHorarios ? (
                  <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
                    <span>Calculando curva horária...</span>
                  </div>
                ) : (
                  <div className="space-y-2.5 pt-2">
                    {horariosData?.distribuicao_horaria?.map((item: any) => {
                      const isPico = horariosData?.horario_pico?.includes(item.rotulo);
                      return (
                        <div key={item.hora} className="flex items-center gap-3 text-xs">
                          {/* Rótulo da Hora */}
                          <div className="w-14 font-mono font-bold text-slate-300 shrink-0 text-right">
                            {item.rotulo}
                          </div>

                          {/* Barra Visual */}
                          <div className="flex-1 bg-slate-800/80 h-7 rounded-lg overflow-hidden relative flex items-center px-3">
                            <div
                              className={`absolute left-0 top-0 bottom-0 rounded-lg transition-all duration-500 ${
                                isPico
                                  ? "bg-gradient-to-r from-amber-500 to-amber-400"
                                  : "bg-gradient-to-r from-emerald-600 to-teal-500"
                              }`}
                              style={{ width: `${Math.max(2, item.pct)}%` }}
                            />
                            {/* Texto sobre a Barra */}
                            <div className="relative z-10 flex items-center justify-between w-full font-mono text-[11px]">
                              <span className={`font-semibold ${item.pct > 25 ? "text-slate-900" : "text-white"}`}>
                                {item.volume.toLocaleString("pt-BR")} pctes
                              </span>
                              <div className="flex items-center gap-2">
                                {isPico && (
                                  <span className="px-1.5 py-0.2 rounded bg-black/40 text-amber-200 text-[10px] font-bold">
                                    🔥 PICO
                                  </span>
                                )}
                                <span className="font-bold text-white drop-shadow">
                                  {item.pct}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* MODAL: CADASTRO COMPLETO DE PONTO / HUB / GALPÃO NA MALHA */}
        {modalCadastroOpen && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0C101B] border border-slate-700 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <Store className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Cadastrar Unidade na Malha Operacional</h3>
                    <p className="text-[11px] text-slate-400">Classifique como Ponto de Coleta (MD), HUB de Transferência, Galpão/CD ou Crossdocking</p>
                  </div>
                </div>
                <button
                  onClick={() => setModalCadastroOpen(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCadastrarPonto} className="space-y-4 text-xs">
                {/* Linha 1: Código e Tipo de Estrutura */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Código da Unidade / MD *
                    </label>
                    <input
                      type="text"
                      required
                      value={formCadastro.md_codigo}
                      onChange={(e) => setFormCadastro({ ...formCadastro, md_codigo: e.target.value })}
                      placeholder="Ex: SP-Z-H005"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Tipo de Estrutura Operacional *
                    </label>
                    <select
                      value={formCadastro.tipo_ponto}
                      onChange={(e) => setFormCadastro({ ...formCadastro, tipo_ponto: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-medium focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="MD (Ponto de Coleta)">🏪 MD (Ponto de Coleta / Dropoff)</option>
                      <option value="HUB (Transferência)">🔄 HUB (Transferência / Sortation)</option>
                      <option value="Galpão / CD (Distribuição)">🏢 Galpão / CD (Centro de Distribuição)</option>
                      <option value="Crossdocking">⚡ Crossdocking / Transbordo</option>
                      <option value="Ponto de Apoio (P.A)">📍 Ponto de Apoio (P.A)</option>
                    </select>
                  </div>
                </div>

                {/* Linha 2: Nome Fantasia e Horário de Trabalho */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Nome Fantasia / Identificação da Unidade
                    </label>
                    <input
                      type="text"
                      value={formCadastro.nome_ponto}
                      onChange={(e) => setFormCadastro({ ...formCadastro, nome_ponto: e.target.value })}
                      placeholder="Ex: MiniDrop Sabollan Taboão"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Horário de Funcionamento / Janela
                    </label>
                    <input
                      type="text"
                      value={formCadastro.horario_trabalho}
                      onChange={(e) => setFormCadastro({ ...formCadastro, horario_trabalho: e.target.value })}
                      placeholder="Ex: 08:00 - 18:00"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Linha 3: CEP com busca automática e Endereço */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      CEP
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        maxLength={9}
                        value={formCadastro.cep}
                        onChange={(e) => setFormCadastro({ ...formCadastro, cep: e.target.value })}
                        placeholder="00000-000"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={handleBuscarViaCep}
                        disabled={buscandoCep}
                        className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold shrink-0 cursor-pointer disabled:opacity-50"
                        title="Buscar endereço e cidade pelo CEP"
                      >
                        {buscandoCep ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Buscar"}
                      </button>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-slate-300 font-semibold mb-1">
                      Endereço Completo (Rua, Número, Bairro)
                    </label>
                    <input
                      type="text"
                      value={formCadastro.endereco}
                      onChange={(e) => setFormCadastro({ ...formCadastro, endereco: e.target.value })}
                      placeholder="Ex: Av. Vida Nova, 140 - Chácara Agronômica"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Linha 4: Cidade, Estado e Regional */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Cidade *</label>
                    <input
                      type="text"
                      required
                      value={formCadastro.cidade}
                      onChange={(e) => setFormCadastro({ ...formCadastro, cidade: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Estado (UF) *</label>
                    <input
                      type="text"
                      required
                      maxLength={2}
                      value={formCadastro.estado}
                      onChange={(e) => setFormCadastro({ ...formCadastro, estado: e.target.value.toUpperCase() })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white uppercase focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Regional Operacional *</label>
                    <select
                      value={formCadastro.regional}
                      onChange={(e) => setFormCadastro({ ...formCadastro, regional: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="GRANDE SP">GRANDE SP</option>
                      <option value="INTERIOR SP">INTERIOR SP</option>
                      <option value="RIO DE JANEIRO">RIO DE JANEIRO</option>
                      <option value="MINAS GERAIS">MINAS GERAIS</option>
                      <option value="SUL">SUL</option>
                      <option value="NORDESTE">NORDESTE</option>
                      <option value="CENTRO-OESTE">CENTRO-OESTE</option>
                    </select>
                  </div>
                </div>

                {/* Linha 5: Geolocalização (Lat/Lng) e Auto-Obter */}
                <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-cyan-400" /> Coordenadas Geográficas (Mapa Interativo)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleBuscarCoordenadasAuto()}
                      disabled={geocodingCadastro}
                      className="flex items-center gap-1 text-[11px] px-2.5 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/30 rounded-lg font-semibold transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {geocodingCadastro ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Auto-Obter via Endereço
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <input
                        type="text"
                        value={formCadastro.latitude}
                        onChange={(e) => setFormCadastro({ ...formCadastro, latitude: e.target.value })}
                        placeholder="Latitude (ex: -23.5505)"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-[11px] focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={formCadastro.longitude}
                        onChange={(e) => setFormCadastro({ ...formCadastro, longitude: e.target.value })}
                        placeholder="Longitude (ex: -46.6333)"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-[11px] focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Botões do Rodapé */}
                <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setModalCadastroOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={cadastrando}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center gap-2 cursor-pointer transition-colors shadow-lg shadow-emerald-900/30"
                  >
                    {cadastrando ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Salvando na Malha...
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" /> Salvar e Integrar Unidade
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

              </main>
    </div>
  );
}
