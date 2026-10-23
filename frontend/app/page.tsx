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
  Loader2,
  FileText,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import IngestaoLogPanel from "@/components/IngestaoLogPanel";
import {
  fetchDiasColetas,
  fetchResumoColetas,
  fetchMdsColetas,
  fetchSellersColetas,
  fetchHorariosColetas,
  fetchClienteDetalhes,
  fetchEventosDia,
  fetchReconciliacaoPacotes,
  criarNotaDiarioBordo,
  removerNotaDiarioBordo,
  cadastrarPontoColeta,
  otimizarPlanilha
} from "@/lib/api";

type TabType = "visao_geral" | "mds" | "sellers" | "horarios" | "eventos" | "reconciliacao";


const ESTADOS_NOMES_MAP: Record<string, string> = {
  SP: "São Paulo", RJ: "Rio de Janeiro", MG: "Minas Gerais", ES: "Espírito Santo",
  PR: "Paraná", SC: "Santa Catarina", RS: "Rio Grande do Sul",
  GO: "Goiás", DF: "Distrito Federal", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  BA: "Bahia", PE: "Pernambuco", CE: "Ceará", RN: "Rio Grande do Norte",
  PB: "Paraíba", AL: "Alagoas", SE: "Sergipe", MA: "Maranhão", PI: "Piauí",
  AM: "Amazonas", PA: "Pará", RO: "Rondônia", TO: "Tocantins",
  AC: "Acre", AP: "Amapá", RR: "Roraima",
};

function gerarTextoDiagnosticoEstado(est: any, regiaoNome: string, dia: string) {
  const vol = Number(est.volume || 0);
  const nome = est.nome_estado || ESTADOS_NOMES_MAP[est.uf] || est.uf;
  const uf = est.uf;

  if (vol === 0) {
    return {
      titulo: `Operação Sem Movimentação — ${nome} (${uf})`,
      resumoNarrativo: `No dia ${dia}, não houve registro de coleta ou movimentação de pacotes no estado de ${nome} (${uf}). A rede de pontos e rotas da região permaneceu sem expedição nesta data.`,
      statusBadge: {
        label: "Sem Expedição",
        cor: "text-slate-400",
        bg: "bg-slate-800/80",
        border: "border-slate-700",
      },
    };
  }

  const txCol = Number(est.taxa_coleta || 0);
  const cf = Number(est.circuito_fechado || 0);
  const cfPct = Number(est.taxa_finalizacao_pct || (vol > 0 ? Math.round((cf / vol) * 1000) / 10 : 0));
  const tr = Number(est.em_transito || 0);
  const trPct = vol > 0 ? Math.round((tr / vol) * 1000) / 10 : 0;
  const bk = Number(est.backlog_coleta || est.backlog || 0);
  const bkPct = vol > 0 ? Math.round((bk / vol) * 1000) / 10 : 0;
  const fa = Number(est.foi_assinado || 0);
  const dp = Number(est.vol_dropoff || 0);
  const pk = Number(est.vol_pickup || 0);
  const ptsDp = Number(est.qtd_pontos_dropoff || 0);
  const ptsPk = Number(est.qtd_pontos_pickup || 0);
  const shareReg = Number(est.share_regiao_pct || 0);
  const shareNac = Number(est.share_nacional_pct || 0);

  let statusBadge = {
    label: "Alta Eficiência",
    cor: "text-emerald-300",
    bg: "bg-emerald-500/20",
    border: "border-emerald-500/40",
  };
  if (bkPct > 15 || txCol < 70) {
    statusBadge = {
      label: "Atenção a Backlog",
      cor: "text-amber-300",
      bg: "bg-amber-500/20",
      border: "border-amber-500/40",
    };
  } else if (txCol < 50 || bkPct > 35) {
    statusBadge = {
      label: "Gargalo Crítico",
      cor: "text-rose-300",
      bg: "bg-rose-500/20",
      border: "border-rose-500/40",
    };
  }

  const partes: string[] = [];

  let fraseVol = `No dia ${dia}, a operação no estado de ${nome} (${uf}) movimentou ${vol.toLocaleString("pt-BR")} pacote${vol > 1 ? "s" : ""}`;
  if (shareReg > 0 && regiaoNome) {
    fraseVol += `, concentrando ${shareReg}% de toda a carga da Região ${regiaoNome}`;
  }
  if (shareNac >= 1.0) {
    fraseVol += ` e ${shareNac}% do volume nacional`;
  }
  fraseVol += ".";
  partes.push(fraseVol);

  let frasePerf = `O índice de coleta atingiu ${txCol}%, com ${cf.toLocaleString("pt-BR")} pacote${cf > 1 ? "s" : ""} (${cfPct}%) totalmente concluído${cf > 1 ? "s" : ""} em Circuito Fechado`;
  if (tr > 0) {
    frasePerf += ` e ${tr.toLocaleString("pt-BR")} pacote${tr > 1 ? "s" : ""} (${trPct}%) em trânsito de transferência operacional.`;
  } else {
    frasePerf += ".";
  }
  partes.push(frasePerf);

  if (dp > 0 && pk > 0) {
    partes.push(
      `A carga foi operada entre Dropoff (${dp.toLocaleString("pt-BR")} pacotes em ${ptsDp} balcão(ões) MD) e Pickup (${pk.toLocaleString("pt-BR")} pacotes em ${ptsPk} HUB(s) de transferência).`
    );
  } else if (dp > 0) {
    partes.push(
      `100% da carga foi operada na modalidade Dropoff através de ${ptsDp} ponto(s) parceiro(s) (MDs).`
    );
  } else if (pk > 0) {
    partes.push(
      `100% da carga foi operada na modalidade Pickup através de ${ptsPk} unidade(s) HUB/Galpão de transferência.`
    );
  }

  if (bk === 0) {
    partes.push("Não há registro de backlog retido: toda a carga do estado foi escoada com sucesso.");
  } else {
    partes.push(
      `Há um saldo de ${bk.toLocaleString("pt-BR")} pacote${bk > 1 ? "s" : ""} (${bkPct}%) retido${bk > 1 ? "s" : ""} nos pontos de coleta aguardando escoamento.`
    );
  }

  if (fa > 0) {
    partes.push(
      `Foram contabilizados ${fa.toLocaleString("pt-BR")} pacote${fa > 1 ? "s" : ""} com status 'Foi Assinado', demandando auditoria de baixa e conciliação.`
    );
  }

  return {
    titulo: `Diagnóstico Operacional — ${nome} (${uf})`,
    resumoNarrativo: partes.join(" "),
    statusBadge,
  };
}

export default function CentralColetasPage() {
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState<string[]>([]);
  const [meses, setMeses] = useState<string[]>([]);
  const [modoPeriodo, setModoPeriodo] = useState<"DIA" | "MES">("DIA");
  const [selectedDia, setSelectedDia] = useState<string>("");
  const [selectedCliente, setSelectedCliente] = useState<string>("");
  const [selectedRegional, setSelectedRegional] = useState<string>("");
  const [expandedRegioes, setExpandedRegioes] = useState<Record<string, boolean>>({});
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

  // Aba 6: Reconciliação Retroativa & Pacotes Sem Atualização (Aging)
  const [reconciliacaoData, setReconciliacaoData] = useState<any>(null);
  const [loadingReconciliacao, setLoadingReconciliacao] = useState<boolean>(false);
  const [subAbaReconciliacao, setSubAbaReconciliacao] = useState<"dias" | "pontos" | "pacotes" | "atualizados">("dias");
  const [buscaReconciliacao, setBuscaReconciliacao] = useState<string>("");
  const [filtroFaixaAging, setFiltroFaixaAging] = useState<string>("TODOS");

  // Aba 5: Linha do Tempo & Eventos do Dia
  const [eventosData, setEventosData] = useState<any>(null);
  const [loadingEventos, setLoadingEventos] = useState(false);
  const [subAbaEventos, setSubAbaEventos] = useState<"catalogo" | "timeline">("catalogo");
  const [buscaCatalogoEventos, setBuscaCatalogoEventos] = useState<string>("");
  const [filtroTipoCatalogo, setFiltroTipoCatalogo] = useState<string>("TODOS");
  const [filtroDataEstreiaCatalogo, setFiltroDataEstreiaCatalogo] = useState<string>("");
  const [isLocalOffline, setIsLocalOffline] = useState<boolean>(false);
  const [salvandoNota, setSalvandoNota] = useState<boolean>(false);
  const [novaNota, setNovaNota] = useState({
    categoria: "ESTREIA_PONTO",
    ponto_codigo: "",
    titulo: "",
    descricao: "",
  });

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

  // Estados da Seção de Clientes (Marketplaces + Demais Clientes com Busca & Dropdown + Modal de Pacotes)
  const [buscaOutrosClientes, setBuscaOutrosClientes] = useState<string>("");
  const [mostrarClientesZero, setMostrarClientesZero] = useState<boolean>(false);
  const [limiteOutrosClientes, setLimiteOutrosClientes] = useState<number>(12);

  // Modal de Pacotes e Detalhes do Cliente
  const [modalClienteOpen, setModalClienteOpen] = useState<boolean>(false);
  const [clienteDetalheAlvo, setClienteDetalheAlvo] = useState<string>("");
  const [clienteDetalheData, setClienteDetalheData] = useState<any>(null);
  const [loadingClienteDetalhe, setLoadingClienteDetalhe] = useState<boolean>(false);
  const [abaModalCliente, setAbaModalCliente] = useState<"pacotes" | "pontos" | "sellers">("pacotes");
  const [filtroModalidadeCli, setFiltroModalidadeCli] = useState<string>("TODOS");
  const [filtroStatusCli, setFiltroStatusCli] = useState<string>("TODOS");
  const [filtroPontoCli, setFiltroPontoCli] = useState<string>("TODOS");
  const [buscaPacoteCli, setBuscaPacoteCli] = useState<string>("");


  
  // 1. Carrega lista de datas disponíveis (com auto-recuperação caso o backend esteja iniciando)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    async function initDias() {
      try {
        const res = await fetchDiasColetas();
        if (!unmounted && res.dias && res.dias.length > 0) {
          setDias(res.dias);
          const mList: string[] = Array.isArray(res.meses) && res.meses.length > 0
            ? res.meses
            : Array.from(new Set(res.dias.filter((d: string) => d.length === 10).map((d: string) => d.slice(3, 10))));
          setMeses(mList);
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
  // Diagnóstico Operacional Dinâmico do Estado Selecionado
  const estadoSelecionadoData = useMemo(() => {
    if (!selectedRegional || !resumo) return null;
    const regUp = selectedRegional.trim().toUpperCase();

    // 1. Prioriza o diagnóstico vindo diretamente do Backend se disponível
    if (resumo.diagnostico_estado && (resumo.diagnostico_estado.uf === regUp || resumo.diagnostico_estado.estado === regUp)) {
      return {
        ...resumo.diagnostico_estado,
        regiao_nome: resumo.diagnostico_estado.regiao || "",
      };
    }

    // 2. Procura em macro_regioes
    if (Array.isArray(resumo.macro_regioes)) {
      for (const mr of resumo.macro_regioes) {
        const match = (mr.estados || []).find(
          (e: any) =>
            e.uf?.toUpperCase() === regUp ||
            e.estado?.toUpperCase() === regUp ||
            e.nome_estado?.toUpperCase() === regUp
        );
        if (match) {
          return {
            ...match,
            regiao_nome: mr.regiao,
            nome_estado: match.nome_estado || ESTADOS_NOMES_MAP[match.uf] || match.uf,
          };
        }
      }
    }

    // 3. Procura em regionais flat
    if (Array.isArray(resumo.regionais)) {
      const match = resumo.regionais.find(
        (r: any) =>
          r.uf?.toUpperCase() === regUp ||
          r.estado?.toUpperCase() === regUp ||
          r.nome_estado?.toUpperCase() === regUp
      );
      if (match) {
        return {
          ...match,
          regiao_nome: match.regiao || "",
          nome_estado: match.nome_estado || ESTADOS_NOMES_MAP[match.uf] || match.uf,
        };
      }
    }

    // 4. Fallback com dados do KPI filtrado
    const nome = ESTADOS_NOMES_MAP[regUp] || regUp;
    return {
      uf: regUp,
      estado: regUp,
      nome_estado: nome,
      regiao_nome: "",
      volume: resumo.kpis?.total_pedidos || 0,
      taxa_coleta: resumo.kpis?.taxa_coleta_pct || 0,
      circuito_fechado: resumo.kpis?.circuito_fechado || 0,
      taxa_finalizacao_pct: resumo.kpis?.circuito_fechado_pct || 0,
      em_transito: resumo.kpis?.em_transito || 0,
      backlog_coleta: resumo.kpis?.backlog_coleta || resumo.kpis?.backlog || 0,
      foi_assinado: resumo.kpis?.foi_assinado || 0,
      vol_dropoff: resumo.kpis?.dropoff_volume || 0,
      vol_pickup: resumo.kpis?.pickup_volume || 0,
      qtd_pontos_dropoff: resumo.kpis?.total_mds || 0,
      qtd_pontos_pickup: resumo.kpis?.total_hubs || 0,
      share_regiao_pct: 0,
      share_nacional_pct: 0,
    };
  }, [selectedRegional, resumo]);

  const textoDiagnosticoEstado = useMemo(() => {
    if (!estadoSelecionadoData) return null;
    return gerarTextoDiagnosticoEstado(estadoSelecionadoData, estadoSelecionadoData.regiao_nome, selectedDia);
  }, [estadoSelecionadoData, selectedDia]);

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

  // 6. Carrega Aba de Linha do Tempo & Eventos
  useEffect(() => {
    if (typeof window !== "undefined") {
      const h = window.location.hostname || "";
      setIsLocalOffline(h === "localhost" || h === "127.0.0.1");
    }
  }, []);

  useEffect(() => {
    if (activeTab === "eventos" && selectedDia) {
      carregarEventos();
    }
  }, [activeTab, selectedDia]);

  useEffect(() => {
    if (activeTab === "reconciliacao") {
      carregarReconciliacao();
    }
  }, [activeTab, selectedDia]);

  const carregarReconciliacao = async () => {
    setLoadingReconciliacao(true);
    try {
      const data = await fetchReconciliacaoPacotes();
      setReconciliacaoData(data);
    } catch (err) {
      console.warn("Aviso ao carregar reconciliação de pacotes:", err);
    } finally {
      setLoadingReconciliacao(false);
    }
  };

  const carregarEventos = async () => {
    setLoadingEventos(true);
    try {
      const data = await fetchEventosDia(selectedDia);
      setEventosData(data);
    } catch (err) {
      console.warn("Aviso ao carregar eventos do dia:", err);
    } finally {
      setLoadingEventos(false);
    }
  };

  const handleSalvarNotaDiario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaNota.titulo.trim()) return;
    setSalvandoNota(true);
    try {
      await criarNotaDiarioBordo({
        dia_base: selectedDia,
        categoria: novaNota.categoria,
        ponto_codigo: novaNota.ponto_codigo,
        titulo: novaNota.titulo,
        descricao: novaNota.descricao,
      });
      setNovaNota({ categoria: "OPERACIONAL", ponto_codigo: "", titulo: "", descricao: "" });
      await carregarEventos();
    } catch (err) {
      console.warn("Erro ao salvar nota:", err);
    } finally {
      setSalvandoNota(false);
    }
  };

  const handleRemoverNotaDiario = async (id: number) => {
    try {
      await removerNotaDiarioBordo(id);
      await carregarEventos();
    } catch (err) {
      console.warn("Erro ao excluir nota:", err);
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

    if (/-[ZWA]-H|HUB-|-H\d{2,4}$/.test(cdUpper) || cdUpper.startsWith("HUB")) {
      tipoSugerido = "HUB (Transferência)";
    } else if (cdUpper.includes("GLP") || cdUpper.includes("-CD") || cdUpper.startsWith("WR-GLP")) {
      tipoSugerido = "Galpão / CD (Distribuição)";
    } else if (cdUpper.includes("CROSS")) {
      tipoSugerido = "Crossdocking";
    } else if (/-[A-Z]-D\d+|-[A-Z]-FQ\d+|-[A-Z]-A\d+/.test(cdUpper)) {
      tipoSugerido = "Ponto de Rede";
    } else {
      tipoSugerido = "MD (Ponto de Coleta)";
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

  const ehClienteMarketplaceUI = (cli: any): boolean => {
    if (cli?.is_marketplace !== undefined) return Boolean(cli.is_marketplace);
    const n = String(cli?.cliente || cli?.nome_cliente || "").toLowerCase();
    return n.includes("shein") || n.includes("temu") || n.includes("tiktok") || n.includes("kwai");
  };

  const marketplacesList = useMemo(() => {
    return clientesBreakdown.filter((c: any) => ehClienteMarketplaceUI(c));
  }, [clientesBreakdown]);

  const outrosClientesList = useMemo(() => {
    const base = clientesBreakdown.filter((c: any) => !ehClienteMarketplaceUI(c));
    return base.filter((c: any) => {
      const vol = Number(c.volume || 0);
      if (!mostrarClientesZero && !buscaOutrosClientes.trim() && vol === 0) return false;
      if (buscaOutrosClientes.trim()) {
        const q = buscaOutrosClientes.trim().toLowerCase();
        const nome = String(c.cliente || c.nome_cliente || "").toLowerCase();
        const ids = Array.isArray(c.cliente_ids) ? c.cliente_ids.join(" ").toLowerCase() : "";
        return nome.includes(q) || ids.includes(q);
      }
      return true;
    });
  }, [clientesBreakdown, mostrarClientesZero, buscaOutrosClientes]);

  const carregarDetalhesCliente = async (
    nomeCli: string,
    mod = filtroModalidadeCli,
    st = filtroStatusCli,
    pt = filtroPontoCli,
    q = buscaPacoteCli
  ) => {
    if (!nomeCli) return;
    setLoadingClienteDetalhe(true);
    try {
      const res = await fetchClienteDetalhes({
        cliente: nomeCli,
        dia: selectedDia,
        regional: selectedRegional,
        modalidade: mod,
        status_filtro: st,
        ponto_filtro: pt,
        search: q,
        limit: 150,
      });
      setClienteDetalheData(res);
    } catch (err) {
      console.warn("Erro ao carregar detalhes do cliente:", err);
    } finally {
      setLoadingClienteDetalhe(false);
    }
  };

  const abrirModalCliente = (nomeCli: string, modalidadeInicial = "TODOS") => {
    setClienteDetalheAlvo(nomeCli);
    setFiltroModalidadeCli(modalidadeInicial);
    setFiltroStatusCli("TODOS");
    setFiltroPontoCli("TODOS");
    setBuscaPacoteCli("");
    setAbaModalCliente("pacotes");
    setModalClienteOpen(true);
    carregarDetalhesCliente(nomeCli, modalidadeInicial, "TODOS", "TODOS", "");
  };


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
            {/* Alternador de Visão: Por Dia vs Por Mês */}
            <div className="flex items-center bg-[#090D16] p-1 rounded-xl border border-slate-700/80 text-xs">
              <button
                type="button"
                onClick={() => {
                  setModoPeriodo("DIA");
                  if (selectedDia.startsWith("MES:")) {
                    const mAlvo = selectedDia.replace("MES:", "");
                    const dMatch = dias.find((d) => d.endsWith(mAlvo)) || dias[0] || "";
                    setSelectedDia(dMatch);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  modoPeriodo === "DIA"
                    ? "bg-emerald-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                📅 Por Dia
              </button>
              <button
                type="button"
                onClick={() => {
                  setModoPeriodo("MES");
                  if (!selectedDia.startsWith("MES:")) {
                    const mAtual = selectedDia.length === 10 ? selectedDia.slice(3, 10) : (meses[0] || "10/2026");
                    setSelectedDia(`MES:${mAtual}`);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  modoPeriodo === "MES"
                    ? "bg-indigo-600 text-white shadow"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                🗓️ Por Mês
              </button>
            </div>

            {/* Seletor de Data ou Mês */}
            <div className="flex items-center gap-2 bg-[#131926] px-3 py-1.5 rounded-xl border border-slate-700/80 text-xs">
              <Calendar className={`w-4 h-4 ${modoPeriodo === "MES" ? "text-indigo-400" : "text-emerald-400"}`} />
              <span className="text-slate-400 hidden sm:inline">
                {modoPeriodo === "MES" ? "Mês Consolidado:" : "Data da Coleta:"}
              </span>
              {modoPeriodo === "MES" ? (
                <select
                  value={selectedDia.startsWith("MES:") ? selectedDia : `MES:${meses[0] || "10/2026"}`}
                  onChange={(e) => setSelectedDia(e.target.value)}
                  className="bg-transparent text-indigo-300 font-bold focus:outline-none cursor-pointer"
                >
                  {meses.map((m) => {
                    const nomesMes: Record<string, string> = {
                      "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
                      "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
                      "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro"
                    };
                    const [mm, yyyy] = m.split("/");
                    const labelMes = `${nomesMes[mm] || mm}/${yyyy} (${m})`;
                    return (
                      <option key={m} value={`MES:${m}`} className="bg-slate-900 text-white">
                        📊 {labelMes}
                      </option>
                    );
                  })}
                </select>
              ) : (
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
              )}
            </div>

            {/* Seletor de Regional */}
            <div className="flex items-center gap-2 bg-[#131926] px-3 py-1.5 rounded-xl border border-slate-700/80 text-xs">
              <MapPin className="w-4 h-4 text-cyan-400" />
              <select
                value={selectedRegional}
                onChange={(e) => setSelectedRegional(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer max-w-[190px] truncate"
              >
                <option value="" className="bg-slate-900 text-white font-bold">Brasil (Todas as UFs)</option>
                <optgroup label="Sudeste" className="bg-slate-900 text-cyan-400 font-bold">
                  <option value="SP" className="bg-slate-900 text-white font-normal">São Paulo (SP)</option>
                  <option value="RJ" className="bg-slate-900 text-white font-normal">Rio de Janeiro (RJ)</option>
                  <option value="MG" className="bg-slate-900 text-white font-normal">Minas Gerais (MG)</option>
                  <option value="ES" className="bg-slate-900 text-white font-normal">Espírito Santo (ES)</option>
                </optgroup>
                <optgroup label="Sul" className="bg-slate-900 text-cyan-400 font-bold">
                  <option value="PR" className="bg-slate-900 text-white font-normal">Paraná (PR)</option>
                  <option value="SC" className="bg-slate-900 text-white font-normal">Santa Catarina (SC)</option>
                  <option value="RS" className="bg-slate-900 text-white font-normal">Rio Grande do Sul (RS)</option>
                </optgroup>
                <optgroup label="Nordeste" className="bg-slate-900 text-cyan-400 font-bold">
                  <option value="MA" className="bg-slate-900 text-white font-normal">Maranhão (MA)</option>
                  <option value="BA" className="bg-slate-900 text-white font-normal">Bahia (BA)</option>
                  <option value="PE" className="bg-slate-900 text-white font-normal">Pernambuco (PE)</option>
                  <option value="CE" className="bg-slate-900 text-white font-normal">Ceará (CE)</option>
                  <option value="RN" className="bg-slate-900 text-white font-normal">Rio Grande do Norte (RN)</option>
                  <option value="PB" className="bg-slate-900 text-white font-normal">Paraíba (PB)</option>
                  <option value="AL" className="bg-slate-900 text-white font-normal">Alagoas (AL)</option>
                  <option value="SE" className="bg-slate-900 text-white font-normal">Sergipe (SE)</option>
                  <option value="PI" className="bg-slate-900 text-white font-normal">Piauí (PI)</option>
                </optgroup>
                <optgroup label="Centro-Oeste" className="bg-slate-900 text-cyan-400 font-bold">
                  <option value="GO" className="bg-slate-900 text-white font-normal">Goiás (GO)</option>
                  <option value="DF" className="bg-slate-900 text-white font-normal">Distrito Federal (DF)</option>
                  <option value="MT" className="bg-slate-900 text-white font-normal">Mato Grosso (MT)</option>
                  <option value="MS" className="bg-slate-900 text-white font-normal">Mato Grosso do Sul (MS)</option>
                </optgroup>
                <optgroup label="Norte" className="bg-slate-900 text-cyan-400 font-bold">
                  <option value="AM" className="bg-slate-900 text-white font-normal">Amazonas (AM)</option>
                  <option value="PA" className="bg-slate-900 text-white font-normal">Pará (PA)</option>
                  <option value="RO" className="bg-slate-900 text-white font-normal">Rondônia (RO)</option>
                  <option value="TO" className="bg-slate-900 text-white font-normal">Tocantins (TO)</option>
                  <option value="AC" className="bg-slate-900 text-white font-normal">Acre (AC)</option>
                  <option value="AP" className="bg-slate-900 text-white font-normal">Amapá (AP)</option>
                  <option value="RR" className="bg-slate-900 text-white font-normal">Roraima (RR)</option>
                </optgroup>
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

        {/* BANNER DE DIAGNÓSTICO OPERACIONAL DO ESTADO */}
        {estadoSelecionadoData && textoDiagnosticoEstado && (
          <div className="mx-6 mt-4 p-5 rounded-2xl bg-gradient-to-r from-[#111927] via-[#0E1A2D] to-[#0A1322] border-2 border-cyan-500/50 shadow-2xl shadow-cyan-950/40 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-cyan-500/20 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center justify-center font-mono font-black text-sm shrink-0">
                  {estadoSelecionadoData.uf}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm md:text-base font-extrabold text-white flex items-center gap-2">
                      <span>{estadoSelecionadoData.nome_estado}</span>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-mono font-bold">
                        UF: {estadoSelecionadoData.uf}
                      </span>
                    </h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${textoDiagnosticoEstado.statusBadge.bg} ${textoDiagnosticoEstado.statusBadge.cor} ${textoDiagnosticoEstado.statusBadge.border}`}
                    >
                      ● {textoDiagnosticoEstado.statusBadge.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Diagnóstico Operacional em Tempo Real • Data:{" "}
                    <strong className="text-white">{selectedDia}</strong>
                    {estadoSelecionadoData.regiao_nome && (
                      <> • Região <strong>{estadoSelecionadoData.regiao_nome}</strong></>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start md:self-center">
                <button
                  type="button"
                  onClick={() => setSelectedRegional("")}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                  title="Remover filtro e voltar para visão de todo o Brasil"
                >
                  <X className="w-3.5 h-3.5" /> Limpar Filtro ({estadoSelecionadoData.uf})
                </button>
              </div>
            </div>

            {/* Caixa Narrativa Executiva */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-cyan-500/20 text-slate-200 text-xs md:text-sm leading-relaxed shadow-inner">
              <div className="flex items-start gap-2.5">
                <div className="p-1 rounded bg-cyan-500/10 text-cyan-400 shrink-0 mt-0.5">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block mb-1">
                    Parecer Operacional Executivo do Estado
                  </span>
                  <p className="font-normal text-slate-100">
                    {textoDiagnosticoEstado.resumoNarrativo}
                  </p>
                </div>
              </div>
            </div>

            {/* Grade de 6 Mini-Cards do Estado */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 pt-1">
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Volume Total</span>
                <span className="text-sm md:text-base font-mono font-black text-white">
                  {(estadoSelecionadoData.volume || 0).toLocaleString("pt-BR")}
                </span>
                <span className="text-[10px] text-cyan-400 block mt-0.5">
                  Share Região: {estadoSelecionadoData.share_regiao_pct || 0}%
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Taxa de Coleta</span>
                <span className={`text-sm md:text-base font-mono font-black ${
                  (estadoSelecionadoData.taxa_coleta || 0) >= 85 ? "text-emerald-400" : (estadoSelecionadoData.taxa_coleta || 0) >= 70 ? "text-amber-400" : "text-rose-400"
                }`}>
                  {estadoSelecionadoData.taxa_coleta || 0}%
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  {((estadoSelecionadoData.circuito_fechado || 0) + (estadoSelecionadoData.em_transito || 0)).toLocaleString("pt-BR")} pcts
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-emerald-900/40 bg-emerald-950/20">
                <span className="text-[10px] text-emerald-400 uppercase font-bold block">Circuito Fechado</span>
                <span className="text-sm md:text-base font-mono font-black text-emerald-300">
                  {(estadoSelecionadoData.circuito_fechado || 0).toLocaleString("pt-BR")}
                </span>
                <span className="text-[10px] text-emerald-400/80 block mt-0.5">
                  Conclusão: {estadoSelecionadoData.taxa_finalizacao_pct || 0}%
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-blue-900/40 bg-blue-950/20">
                <span className="text-[10px] text-blue-400 uppercase font-bold block">Em Trânsito</span>
                <span className="text-sm md:text-base font-mono font-black text-blue-300">
                  {(estadoSelecionadoData.em_transito || 0).toLocaleString("pt-BR")}
                </span>
                <span className="text-[10px] text-blue-400/80 block mt-0.5">
                  Carreg. / Desc.
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-amber-900/40 bg-amber-950/20">
                <span className="text-[10px] text-amber-400 uppercase font-bold block">Backlog no Ponto</span>
                <span className="text-sm md:text-base font-mono font-black text-amber-300">
                  {(estadoSelecionadoData.backlog_coleta || estadoSelecionadoData.backlog || 0).toLocaleString("pt-BR")}
                </span>
                <span className="text-[10px] text-amber-400/80 block mt-0.5">
                  Retido no Balcão
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-indigo-900/40 bg-indigo-950/20">
                <span className="text-[10px] text-indigo-400 uppercase font-bold block">Modalidade</span>
                <div className="text-[11px] font-mono text-white flex flex-col mt-0.5">
                  <span className="text-cyan-300">🏪 Drop: {(estadoSelecionadoData.vol_dropoff || 0).toLocaleString("pt-BR")}</span>
                  <span className="text-indigo-300">🚛 Pick: {(estadoSelecionadoData.vol_pickup || 0).toLocaleString("pt-BR")}</span>
                </div>
              </div>
            </div>
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

            <button
              onClick={() => setActiveTab("eventos")}
              className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === "eventos"
                  ? "border-emerald-500 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Calendar className="w-4 h-4 text-fuchsia-400" />
              5. Linha do Tempo & Eventos do Dia
              <span className="px-1.5 py-0.2 bg-fuchsia-500/20 text-fuchsia-300 text-[10px] rounded font-mono">
                1º Bip & Diário
              </span>
            </button>

            <button
              onClick={() => setActiveTab("reconciliacao")}
              className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === "reconciliacao"
                  ? "border-emerald-500 text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <RefreshCw className="w-4 h-4 text-cyan-400" />
              6. Reconciliação & Dias Sem Atualização
              <span className="px-1.5 py-0.2 bg-cyan-500/20 text-cyan-300 text-[10px] rounded font-mono">
                Aging & Baixas
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

              {/* Cards de Métricas Principais (4 Status Oficiais + Dropoff vs Pickup pelo Ponto de Coleta) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                {/* 1. Volume Total + Mix por Ponto (Dropoff MD vs Pickup HUB) */}
                <div className="p-4 rounded-xl bg-[#131926]/90 border border-slate-800 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-300 text-xs font-semibold">
                    <span>Volume Total Movimentado</span>
                    <Package className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="mt-2">
                    <p className="text-2xl font-extrabold text-white tracking-tight font-mono">
                      {kpis?.total_pedidos ? kpis.total_pedidos.toLocaleString("pt-BR") : "0"}
                    </p>
                    <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-1 text-[11px]">
                      <div className="flex justify-between text-cyan-300">
                        <span>🏪 Dropoff (Pontos MD):</span>
                        <span className="font-mono font-bold">
                          {(kpis?.dropoff_volume || 0).toLocaleString("pt-BR")} ({kpis?.dropoff_pct || 0}%)
                        </span>
                      </div>
                      <div className="flex justify-between text-indigo-300">
                        <span>🚛 Pickup (Pontos HUB):</span>
                        <span className="font-mono font-bold">
                          {(kpis?.pickup_volume || 0).toLocaleString("pt-BR")} ({kpis?.pickup_pct || 0}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Circuito Fechado (Finalizados Corretamente) */}
                <div className="p-4 rounded-xl bg-[#131926]/90 border border-emerald-500/35 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-emerald-400 text-xs font-bold">
                    <span>🟢 Circuito Fechado</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="mt-2">
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-extrabold text-emerald-400 tracking-tight font-mono">
                        {(kpis?.circuito_fechado ?? kpis?.total_coletados ?? 0).toLocaleString("pt-BR")}
                      </p>
                      <span className="text-xs font-bold text-emerald-300 font-mono">
                        {kpis?.circuito_fechado_pct ?? kpis?.taxa_coleta_pct ?? 0}%
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Pedidos finalizados corretamente
                    </p>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, kpis?.circuito_fechado_pct ?? kpis?.taxa_coleta_pct ?? 0)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Carregamento e Descarregamento (Em Trânsito) */}
                <div className="p-4 rounded-xl bg-[#131926]/90 border border-blue-500/35 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-blue-300 text-xs font-bold">
                    <span>🚛 Em Trânsito</span>
                    <Truck className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="mt-2">
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-extrabold text-blue-400 tracking-tight font-mono">
                        {(kpis?.em_transito || 0).toLocaleString("pt-BR")}
                      </p>
                      <span className="text-xs font-bold text-blue-300 font-mono">
                        {kpis?.em_transito_pct || 0}%
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Carregamento & Descarregamento
                    </p>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
                      <div
                        className="bg-blue-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, kpis?.em_transito_pct || 0)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Coleta e Saco Selado (Backlog) */}
                <div className="p-4 rounded-xl bg-[#131926]/90 border border-amber-500/35 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-amber-300 text-xs font-bold">
                    <span>📦 Coleta & Saco Selado</span>
                    <Clock className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="mt-2">
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-extrabold text-amber-400 tracking-tight font-mono">
                        {(kpis?.backlog_coleta ?? kpis?.backlog ?? 0).toLocaleString("pt-BR")}
                      </p>
                      <span className="text-xs font-bold text-amber-300 font-mono">
                        {kpis?.backlog_coleta_pct || 0}%
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Backlog (No MD: {(kpis?.backlog_md || 0).toLocaleString("pt-BR")})
                    </p>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
                      <div
                        className="bg-amber-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, kpis?.backlog_coleta_pct || 0)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 5. Foi Assinado (Possíveis Extravios) */}
                <div className="p-4 rounded-xl bg-[#131926]/90 border border-rose-500/35 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-rose-300 text-xs font-bold">
                    <span>🚨 Foi Assinado</span>
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="mt-2">
                    <div className="flex items-baseline gap-2">
                      <p className="text-2xl font-extrabold text-rose-400 tracking-tight font-mono">
                        {(kpis?.foi_assinado || 0).toLocaleString("pt-BR")}
                      </p>
                      <span className="text-xs font-bold text-rose-300 font-mono">
                        {kpis?.foi_assinado_pct || 0}%
                      </span>
                    </div>
                    <p className="text-[11px] text-rose-300/80 mt-1">
                      Possíveis extravios (atenção crítica)
                    </p>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-2">
                      <div
                        className="bg-rose-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, kpis?.foi_assinado_pct || 0)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ============================================================ */}
              {/* SEÇÃO DE CARDS POR MACRO-REGIÃO DO BRASIL + ESTADOS (UF) */}
              {/* Sudeste • Sul • Centro-Oeste • Nordeste • Norte */}
              {/* Separados em Dropoff (Ponto MD) e Pickup (Ponto HUB) + 4 Status */}
              {/* ============================================================ */}
              {Array.isArray(resumo?.macro_regioes) && resumo.macro_regioes.length > 0 && (
                <div className="p-5 rounded-2xl bg-gradient-to-b from-[#131926] to-[#0D131F] border border-cyan-500/30 space-y-4 shadow-xl">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                          Visão Nacional por Macro-Região & Estado (UF)
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Sudeste • Sul • Centro-Oeste • Nordeste • Norte
                        </span>
                      </div>
                      <h3 className="text-sm md:text-base font-bold text-white mt-1">
                        Cards por Regiões do Brasil — Dropoff (MD) vs Pickup (HUB) e Status Operacional
                      </h3>
                      <p className="text-xs text-slate-400">
                        Classificação de <strong>Dropoff</strong> e <strong>Pickup</strong> apurada diretamente pelo <strong>ponto que realizou a coleta</strong>, detalhada por Estado e Total da Região. Clique em qualquer Estado para filtrar o painel.
                      </p>
                    </div>
                    {selectedRegional && (
                      <button
                        type="button"
                        onClick={() => setSelectedRegional("")}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer self-start md:self-center"
                      >
                        <X className="w-3.5 h-3.5" /> Limpar Filtro UF ({selectedRegional})
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {resumo.macro_regioes.map((reg: any) => {
                      const hasVol = Number(reg.volume_total || 0) > 0;
                      const isExpanded = !!expandedRegioes[reg.regiao];
                      const estadosComVolume = (reg.estados || []).filter((e: any) => Number(e.volume || 0) > 0);
                      const estadosExibir = isExpanded
                        ? (reg.estados || [])
                        : (estadosComVolume.length > 0 ? estadosComVolume : (reg.estados || []).slice(0, 4));

                      return (
                        <div
                          key={reg.regiao}
                          className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                            hasVol
                              ? "bg-slate-900/90 border-slate-700/80 shadow-lg"
                              : "bg-slate-900/40 border-slate-800/70 opacity-75"
                          }`}
                        >
                          <div>
                            {/* Cabeçalho do Card da Região + Total da Região */}
                            <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-800">
                              <div>
                                <div className="flex items-center gap-2">
                                  <MapPin className="w-4 h-4 text-cyan-400" />
                                  <h4 className="text-sm font-extrabold text-white uppercase tracking-wide">
                                    Região {reg.regiao}
                                  </h4>
                                </div>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  {reg.qtd_pontos_dropoff || 0} MDs (Dropoff) • {reg.qtd_pontos_pickup || 0} HUBs (Pickup)
                                </p>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                                  Total {reg.regiao}
                                </span>
                                <span className="text-lg font-extrabold text-white font-mono">
                                  {(reg.volume_total || 0).toLocaleString("pt-BR")}
                                </span>
                                <span className="text-[10px] text-cyan-300 font-mono block">
                                  {reg.share_pct || 0}% do Brasil
                                </span>
                              </div>
                            </div>

                            {/* Separação Dropoff vs Pickup baseada no Ponto que fez a coleta */}
                            <div className="grid grid-cols-2 gap-2 my-3">
                              <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/30">
                                <div className="flex items-center justify-between text-[10px] text-cyan-300 font-bold">
                                  <span>🏪 DROPOFF (Ponto MD)</span>
                                  <span>{reg.dropoff_pct || 0}%</span>
                                </div>
                                <div className="text-sm font-extrabold text-white font-mono mt-0.5">
                                  {(reg.vol_dropoff || 0).toLocaleString("pt-BR")}{" "}
                                  <span className="text-[10px] font-normal text-slate-400">pcts</span>
                                </div>
                              </div>

                              <div className="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-500/30">
                                <div className="flex items-center justify-between text-[10px] text-indigo-300 font-bold">
                                  <span>🚛 PICKUP (Ponto HUB)</span>
                                  <span>{reg.pickup_pct || 0}%</span>
                                </div>
                                <div className="text-sm font-extrabold text-white font-mono mt-0.5">
                                  {(reg.vol_pickup || 0).toLocaleString("pt-BR")}{" "}
                                  <span className="text-[10px] font-normal text-slate-400">pcts</span>
                                </div>
                              </div>
                            </div>

                            {/* Os 4 Status Oficiais na Região */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pb-3 border-b border-slate-800 text-[10px]">
                              <div className="p-1.5 rounded bg-emerald-500/10 border border-emerald-500/25">
                                <span className="text-emerald-300 font-semibold block truncate" title="Circuito Fechado (Finalizado Corretamente)">
                                  🟢 Circ. Fechado
                                </span>
                                <span className="font-mono font-bold text-white text-xs">
                                  {(reg.circuito_fechado || 0).toLocaleString("pt-BR")}
                                </span>
                              </div>
                              <div className="p-1.5 rounded bg-blue-500/10 border border-blue-500/25">
                                <span className="text-blue-300 font-semibold block truncate" title="Carregamento e Descarregamento (Em Trânsito)">
                                  🚛 Em Trânsito
                                </span>
                                <span className="font-mono font-bold text-white text-xs">
                                  {(reg.em_transito || 0).toLocaleString("pt-BR")}
                                </span>
                              </div>
                              <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/25">
                                <span className="text-amber-300 font-semibold block truncate" title="Coleta e Saco Selado (Backlog)">
                                  📦 Backlog
                                </span>
                                <span className="font-mono font-bold text-white text-xs">
                                  {(reg.backlog_coleta || 0).toLocaleString("pt-BR")}
                                </span>
                              </div>
                              <div className="p-1.5 rounded bg-rose-500/10 border border-rose-500/25">
                                <span className="text-rose-300 font-semibold block truncate" title="Foi Assinado (Possíveis Extravios)">
                                  🚨 Foi Assinado
                                </span>
                                <span className="font-mono font-bold text-white text-xs">
                                  {(reg.foi_assinado || 0).toLocaleString("pt-BR")}
                                </span>
                              </div>
                            </div>

                            {/* Lista de Estados (UFs) da Região */}
                            <div className="mt-3 space-y-1.5">
                              <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-400 px-1">
                                <span>Estado (UF)</span>
                                <span>Dropoff / Pickup • Status • Total</span>
                              </div>
                              {(reg.estados || []).length > 4 && (
                                <div className="flex justify-end pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedRegioes(prev => ({
                                        ...prev,
                                        [reg.regiao]: !prev[reg.regiao]
                                      }))
                                    }
                                    className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  >
                                    {isExpanded ? (
                                      <>
                                        <ChevronUp className="w-3 h-3" /> Recolher UFs
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="w-3 h-3" /> Ver todas as {(reg.estados || []).length} UFs
                                      </>
                                    )}
                                  </button>
                                </div>
                              )}
                              {estadosExibir.map((est: any) => {
                                const isUfSelected = selectedRegional?.toUpperCase() === est.uf;
                                return (
                                  <div
                                    key={est.uf}
                                    onClick={() => setSelectedRegional(isUfSelected ? "" : est.uf)}
                                    className={`p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                                      isUfSelected
                                        ? "bg-cyan-950/80 border-cyan-400 ring-2 ring-cyan-400 shadow-lg shadow-cyan-950/50"
                                        : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60"
                                    }`}
                                    title={`Clique para filtrar tudo e gerar diagnóstico operacional de ${est.nome_estado} (${est.uf})`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-1.5">
                                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono font-extrabold text-[11px] border border-slate-700">
                                          {est.uf}
                                        </span>
                                        <span className="font-semibold text-slate-200 truncate">
                                          {est.nome_estado}
                                        </span>
                                        {isUfSelected && (
                                          <span className="px-1.5 py-0.2 rounded bg-cyan-400 text-slate-950 text-[9px] font-black uppercase tracking-wider animate-pulse">
                                            Filtro Ativo
                                          </span>
                                        )}
                                      </div>
                                      <span className="font-mono font-extrabold text-white">
                                        {(est.volume || 0).toLocaleString("pt-BR")}{" "}
                                        <span className="text-[10px] font-normal text-slate-400">
                                          ({est.share_regiao_pct || 0}%)
                                        </span>
                                      </span>
                                    </div>

                                    {est.volume > 0 && (
                                      <div className="mt-1.5 pt-1.5 border-t border-slate-800/60 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] font-mono">
                                        <div className="flex items-center gap-2">
                                          <span className="text-cyan-300" title="Dropoff nos Pontos MD do Estado">
                                            🏪 Drop: {(est.vol_dropoff || 0).toLocaleString("pt-BR")}
                                          </span>
                                          <span className="text-indigo-300" title="Pickup nos Pontos HUB do Estado">
                                            🚛 Pick: {(est.vol_pickup || 0).toLocaleString("pt-BR")}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-emerald-400" title="Circuito Fechado">
                                            🟢{(est.circuito_fechado || 0).toLocaleString("pt-BR")}
                                          </span>
                                          <span className="text-blue-400" title="Carregamento e Descarregamento (Em Trânsito)">
                                            🚛{(est.em_transito || 0).toLocaleString("pt-BR")}
                                          </span>
                                          <span className="text-amber-400" title="Coleta e Saco Selado (Backlog)">
                                            📦{(est.backlog_coleta || 0).toLocaleString("pt-BR")}
                                          </span>
                                          {est.foi_assinado > 0 && (
                                            <span className="text-rose-400" title="Foi Assinado (Possíveis Extravios)">
                                              🚨{(est.foi_assinado || 0).toLocaleString("pt-BR")}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* SEÇÃO 1: MARKETPLACES OFICIAIS (SHEIN • TEMU • TIKTOK • KWAI) */}
              {/* Cards separados tanto para W2D (Coleta/Pickup) quanto D2D (Dropoff/MD) */}
              {/* ============================================================ */}
              <div className="p-5 rounded-2xl bg-gradient-to-b from-[#131926] to-[#0E1420] border border-indigo-500/30 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                        Marketplaces Oficiais
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Shein • Temu • TikTok • Kwai
                      </span>
                    </div>
                    <h3 className="text-sm md:text-base font-bold text-white tracking-wide mt-1">
                      Painel de Marketplaces — Separação W2D (Coleta) & D2D (Dropoff MD)
                    </h3>
                    <p className="text-xs text-slate-400">
                      Clique em qualquer card de Marketplace ou na modalidade W2D / D2D para abrir os pacotes, pontos (MDs/HUBs) e sellers
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {selectedCliente && (
                      <button
                        onClick={() => setSelectedCliente("")}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" /> Limpar Filtro ({selectedCliente})
                      </button>
                    )}
                    <span className="text-xs font-mono text-indigo-300 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/25">
                      {marketplacesList.filter((m: any) => Number(m.volume || 0) > 0).length} / {marketplacesList.length} Contas Marketplace
                    </span>
                  </div>
                </div>

                {/* Cards de Contas Marketplace (Shein W2D/Normal, Shein D2D, Shein W2S, Temu D2D, Temu W2D, Temu XBorder, TikTok, Kwai) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  {marketplacesList.map((cli: any, idx: number) => {
                    const nomeCli = cli.cliente || cli.nome_cliente || `Marketplace ${idx + 1}`;
                    const volCli = Number(cli.volume) || 0;
                    const colCli = cli.coletados !== undefined ? Number(cli.coletados) : volCli;
                    const bklCli = Number(cli.backlog) || 0;
                    const dpCli = Number(cli.vol_dropoff) || 0;
                    const pkCli = Number(cli.vol_pickup) || 0;
                    const taxaCli = cli.taxa_pct !== undefined ? Number(cli.taxa_pct) : 100;
                    const pctCli = cli.pct_total !== undefined ? Number(cli.pct_total) : 0;
                    const nLow = nomeCli.toLowerCase();
                    const isD2dCard = nLow.includes("d2d");
                    const isW2dCard = nLow.includes("w2d") || nLow.includes("w2s") || nLow === "shein";
                    const grupo =
                      cli.marketplace_grupo ||
                      (nLow.includes("shein")
                        ? "SHEIN"
                        : nLow.includes("temu")
                        ? "TEMU"
                        : nLow.includes("tiktok")
                        ? "TIKTOK"
                        : "KWAI");

                    const badgeColor =
                      grupo === "SHEIN"
                        ? "bg-pink-500/20 text-pink-300 border-pink-500/40"
                        : grupo === "TEMU"
                        ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                        : grupo === "TIKTOK"
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                        : "bg-amber-500/20 text-amber-300 border-amber-500/40";

                    return (
                      <div
                        key={nomeCli + idx}
                        onClick={() => abrirModalCliente(nomeCli, "TODOS")}
                        className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group ${
                          volCli > 0
                            ? "bg-slate-900/90 border-slate-700/80 hover:border-indigo-400/70 hover:shadow-lg hover:shadow-indigo-950/30"
                            : "bg-slate-900/40 border-slate-800/70 opacity-75 hover:opacity-100 hover:border-slate-700"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${badgeColor}`}>
                              {grupo}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                                isD2dCard
                                  ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                                  : isW2dCard
                                  ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                                  : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                              }`}
                            >
                              {cli.modalidade_tag || (isD2dCard ? "D2D" : isW2dCard ? "W2D" : "W2D & D2D")}
                            </span>
                          </div>

                          <div className="mt-2.5 flex items-baseline justify-between gap-2">
                            <h4 className="font-bold text-white text-sm tracking-wide truncate group-hover:text-indigo-300 transition-colors">
                              {nomeCli}
                            </h4>
                            <span className="text-[11px] font-mono text-slate-400 shrink-0">
                              {pctCli}% share
                            </span>
                          </div>
                          {Array.isArray(cli.cliente_ids) && cli.cliente_ids.length > 0 && (
                            <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                              Nº Cliente: {cli.cliente_ids.join(", ")}
                            </p>
                          )}

                          {/* Volume Principal */}
                          <div className="mt-3 pt-2.5 border-t border-slate-800/80 space-y-1.5 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-400">Volume Total:</span>
                              <span className="font-extrabold text-white text-sm">
                                {volCli.toLocaleString("pt-BR")}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-emerald-400">Coletados:</span>
                              <span className="font-semibold text-emerald-400">
                                {colCli.toLocaleString("pt-BR")} ({taxaCli}%)
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-amber-400">Backlog Retido:</span>
                              <span className="font-semibold text-amber-400">
                                {bklCli.toLocaleString("pt-BR")}
                              </span>
                            </div>
                          </div>

                          {/* Divisão clicável W2D vs D2D dentro do Card */}
                          <div className="mt-3 grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-800/60">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                abrirModalCliente(nomeCli, "W2D");
                              }}
                              className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 text-left transition-colors cursor-pointer"
                              title="Clique para ver apenas pacotes W2D (Pickup/Coleta) deste Marketplace"
                            >
                              <div className="text-[10px] text-indigo-300 font-semibold flex items-center justify-between">
                                <span>🚛 W2D (Pickup)</span>
                                <ArrowUpRight className="w-2.5 h-2.5" />
                              </div>
                              <div className="text-xs font-bold text-white mt-0.5 font-mono">
                                {pkCli.toLocaleString("pt-BR")}
                              </div>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                abrirModalCliente(nomeCli, "D2D");
                              }}
                              className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-left transition-colors cursor-pointer"
                              title="Clique para ver apenas pacotes D2D (Dropoff/MD) deste Marketplace"
                            >
                              <div className="text-[10px] text-cyan-300 font-semibold flex items-center justify-between">
                                <span>🏪 D2D (Dropoff)</span>
                                <ArrowUpRight className="w-2.5 h-2.5" />
                              </div>
                              <div className="text-xs font-bold text-white mt-0.5 font-mono">
                                {dpCli.toLocaleString("pt-BR")}
                              </div>
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 space-y-2">
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full rounded-full"
                              style={{ width: `${Math.min(100, taxaCli)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-indigo-300 font-semibold pt-0.5">
                            <span>Ver pacotes, MDs e sellers</span>
                            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ============================================================ */}
              {/* SEÇÃO 2: DEMAIS CLIENTES / EMBARCADORES (COM DROPDOWN E BUSCA LEVE) */}
              {/* ============================================================ */}
              <div className="p-5 rounded-2xl bg-[#131926]/80 border border-slate-800 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                      <span>Demais Clientes & Embarcadores Cadastrados</span>
                      <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                        {outrosClientesList.length} exibidos
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Use o menu dropdown ou a barra de busca abaixo para consultar rapidamente qualquer um dos 125+ clientes sem pesar a tela
                    </p>
                  </div>

                  {/* Controles Leves: Dropdown Direto + Busca + Toggle Zero */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Menu Dropdown de Seleção Rápida de Cliente */}
                    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-1.5 text-xs">
                      <Filter className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            abrirModalCliente(e.target.value, "TODOS");
                          }
                        }}
                        className="bg-transparent text-white font-medium focus:outline-none cursor-pointer max-w-[230px]"
                      >
                        <option value="" className="bg-slate-900 text-slate-400">
                          📂 Abrir pacotes do cliente (Dropdown)...
                        </option>
                        {clientesBreakdown.map((c: any, i: number) => {
                          const nm = c.cliente || c.nome_cliente;
                          const vl = Number(c.volume || 0);
                          const idTxt = Array.isArray(c.cliente_ids) && c.cliente_ids.length > 0 ? ` [${c.cliente_ids[0]}]` : "";
                          return (
                            <option key={nm + i} value={nm} className="bg-slate-900 text-white">
                              {nm}{idTxt} — {vl.toLocaleString("pt-BR")} pcts
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Input de Busca Rápida de Clientes */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2 text-slate-400" />
                      <input
                        type="text"
                        value={buscaOutrosClientes}
                        onChange={(e) => {
                          setBuscaOutrosClientes(e.target.value);
                          setLimiteOutrosClientes(24);
                        }}
                        placeholder="Buscar cliente ou código (ex: shopmulti, 24596)..."
                        className="bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60 w-64"
                      />
                      {buscaOutrosClientes && (
                        <button
                          onClick={() => setBuscaOutrosClientes("")}
                          className="absolute right-2 top-2 text-slate-400 hover:text-white cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Botão para exibir/ocultar clientes sem pacotes no dia */}
                    <button
                      type="button"
                      onClick={() => setMostrarClientesZero(!mostrarClientesZero)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                        mostrarClientesZero
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold"
                          : "bg-slate-900 text-slate-400 border-slate-700/80 hover:text-white"
                      }`}
                    >
                      {mostrarClientesZero ? "Mostrando Todos (125+)" : "Ver Todos os 125+ Cadastrados"}
                    </button>
                  </div>
                </div>

                {outrosClientesList.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 bg-slate-900/40 rounded-xl border border-slate-800/60">
                    Nenhum cliente encontrado com o filtro atual. Clique em <b>"Ver Todos os 125+ Cadastrados"</b> para listar também as contas sem bipagem nesta data.
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {outrosClientesList.slice(0, limiteOutrosClientes).map((cli: any, idx: number) => {
                        const nomeCli = cli.cliente || cli.nome_cliente || `Cliente ${idx + 1}`;
                        const volCli = Number(cli.volume) || 0;
                        const colCli = cli.coletados !== undefined ? Number(cli.coletados) : volCli;
                        const bklCli = Number(cli.backlog) || 0;
                        const dpCli = Number(cli.vol_dropoff) || 0;
                        const pkCli = Number(cli.vol_pickup) || 0;
                        const taxaCli = cli.taxa_pct !== undefined ? Number(cli.taxa_pct) : 100;
                        const pctCli = cli.pct_total !== undefined ? Number(cli.pct_total) : (cli.share_pct !== undefined ? Number(cli.share_pct) : 0);

                        return (
                          <div
                            key={nomeCli + idx}
                            onClick={() => abrirModalCliente(nomeCli, "TODOS")}
                            className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900 transition-all flex flex-col justify-between cursor-pointer group"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <span className="font-bold text-white text-xs tracking-wide block truncate group-hover:text-emerald-300 transition-colors">
                                    {nomeCli}
                                  </span>
                                  {Array.isArray(cli.cliente_ids) && cli.cliente_ids.length > 0 && (
                                    <span className="text-[10px] font-mono text-slate-500 block">
                                      ID: {cli.cliente_ids.join(", ")}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded shrink-0">
                                  {pctCli}%
                                </span>
                              </div>

                              <div className="my-2.5 space-y-1 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Volume Total:</span>
                                  <span className="font-bold text-white">
                                    {volCli.toLocaleString("pt-BR")}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-emerald-400">Coletados:</span>
                                  <span className="font-semibold text-emerald-400">
                                    {colCli.toLocaleString("pt-BR")} ({taxaCli}%)
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-amber-400">Backlog:</span>
                                  <span className="font-semibold text-amber-400">
                                    {bklCli.toLocaleString("pt-BR")}
                                  </span>
                                </div>
                                {(dpCli > 0 || pkCli > 0) && (
                                  <div className="flex justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/70 font-mono">
                                    <span>W2D: {pkCli.toLocaleString("pt-BR")}</span>
                                    <span>D2D: {dpCli.toLocaleString("pt-BR")}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-emerald-500 h-full rounded-full"
                                  style={{ width: `${Math.min(100, taxaCli)}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-400 group-hover:text-emerald-300">
                                <span>Clique p/ ver pacotes</span>
                                <ChevronRight className="w-3 h-3" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {outrosClientesList.length > limiteOutrosClientes && (
                      <div className="flex justify-center pt-2">
                        <button
                          type="button"
                          onClick={() => setLimiteOutrosClientes((prev) => prev + 24)}
                          className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 cursor-pointer transition-colors"
                        >
                          Carregar mais clientes ({outrosClientesList.length - limiteOutrosClientes} restantes)
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* ABA 2: PONTOS DE COLETA (MDs) & HUBS SEPARADOS */}
          {/* ============================================================ */}
          {activeTab === "mds" && (
            <div className="space-y-4">
              {/* Barra de Filtros e Busca */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {/* Filtros Rápidos */}
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#131926] rounded-xl border border-slate-800 text-xs">
                  <button
                    onClick={() => setMdsFiltro("todos")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                      mdsFiltro === "todos"
                        ? "bg-slate-700 text-white font-bold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🏪 Todos os MDs
                  </button>
                  <button
                    onClick={() => setMdsFiltro("bipando")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                      mdsFiltro === "bipando"
                        ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🟢 Bipando Constante
                  </button>
                  <button
                    onClick={() => setMdsFiltro("sem_bipagem")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                      mdsFiltro === "sem_bipagem"
                        ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    ⚠️ Sem Bipagem (5+ dias)
                  </button>
                  <button
                    onClick={() => setMdsFiltro("backlog")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                      mdsFiltro === "backlog"
                        ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Com Backlog
                  </button>
                  <button
                    onClick={() => setMdsFiltro("primeira_bipagem")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                      mdsFiltro === "primeira_bipagem"
                        ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🌟 1ª Bipagem
                  </button>
                  <button
                    onClick={() => setMdsFiltro("desvio_pickup")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                      mdsFiltro === "desvio_pickup"
                        ? "bg-purple-500/20 text-purple-300 font-bold border border-purple-500/40"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🚨 Pickups em MD
                  </button>
                  <button
                    onClick={() => setMdsFiltro("nao_cadastrado")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                      mdsFiltro === "nao_cadastrado"
                        ? "bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    ⚠️ Não Cadastrados
                  </button>
                  <button
                    onClick={() => setMdsFiltro("hubs")}
                    className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                      mdsFiltro === "hubs"
                        ? "bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/40"
                        : "text-slate-400 hover:text-white"
                    }`}
                    title="Visualizar HUBs de Transferência (como SP-Z-H005) separadamente dos MDs"
                  >
                    🏭 HUBs (SP-Z-H005, etc.)
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

              {/* Tabela de MDs / HUBs */}
              <div className="rounded-2xl border border-slate-800 bg-[#131926]/70 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/60 text-slate-400 font-semibold">
                        <th className="py-3 px-4">{mdsFiltro === "hubs" ? "Unidade (HUB)" : "Ponto (MD)"}</th>
                        <th className="py-3 px-4">Localização / Regional</th>
                        <th className="py-3 px-4 text-center">Alertas / Status</th>
                        <th className="py-3 px-4 text-right">Volume Bipado</th>
                        <th className="py-3 px-4 text-right">Coletado ANJUN</th>
                        <th className="py-3 px-4 text-right">{mdsFiltro === "hubs" ? "Backlog no HUB" : "Backlog no MD"}</th>
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
                              <span>Carregando unidades...</span>
                            </div>
                          </td>
                        </tr>
                      ) : mdsList.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-slate-400">
                            Nenhuma unidade encontrada para os filtros selecionados.
                          </td>
                        </tr>
                      ) : (
                        mdsList.map((md: any) => {
                          const isHubRow =
                            md.is_md === false ||
                            String(md.tipo_ponto || "").toUpperCase().includes("HUB") ||
                            String(md.md_codigo || "").toUpperCase().includes("-H");
                          return (
                            <tr key={md.md_codigo} className="hover:bg-slate-800/30 transition-colors">
                              {/* Código MD ou HUB */}
                              <td className="py-3 px-4 font-mono font-bold text-white flex items-center gap-2">
                                {isHubRow ? (
                                  <Building2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                ) : (
                                  <Store className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                )}
                                <span>{md.md_codigo}</span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase ${
                                    isHubRow
                                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                      : "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                  }`}
                                >
                                  {isHubRow ? "HUB" : "MD"}
                                </span>
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

          {/* ============================================================ */}
          {/* ABA 5: LINHA DO TEMPO & EVENTOS DO DIA (1º PACOTE BIPADO) */}
          {/* ============================================================ */}
          {activeTab === "eventos" && (
            <div className="space-y-6">
              {/* Cabeçalho Contextual da Data / Mês */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-fuchsia-950/30 via-[#131926] to-[#131926] border border-fuchsia-500/30 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-fuchsia-500/20 border border-fuchsia-500/40 flex items-center justify-center text-fuchsia-300 shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40">
                        Memória Operacional da Malha Anjun
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        • {eventosData?.total_pontos_historico || 0} unidades mapeadas em {eventosData?.total_dias_historico || 0} dias de histórico
                      </span>
                    </div>
                    <h3 className="text-base md:text-lg font-bold text-white mt-1">
                      O que aconteceu em{" "}
                      <span className="text-fuchsia-400 underline font-mono">
                        {selectedDia?.startsWith("MES:") ? `Mês ${selectedDia.slice(4)}` : selectedDia}
                      </span>
                      ?
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Rastreie exatamente quando cada MD, HUB, Ponto de Apoio ou Ponto de Rede bipou seu <strong>1º pacote na história</strong>, quais clientes/sellers estrearam e quais unidades pararam de bipar no dia.
                    </p>
                  </div>
                </div>

                {/* KPIs Rápidos dos Eventos do Dia */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
                  <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-amber-500/30">
                    <span className="text-[10px] text-amber-300 font-semibold block">🌟 1º Pacote na História</span>
                    <span className="text-lg font-extrabold text-amber-400 font-mono">
                      {eventosData?.eventos_dia?.estreias_pontos?.length || 0} pts
                    </span>
                  </div>
                  <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-rose-500/30">
                    <span className="text-[10px] text-rose-300 font-semibold block">⚠️ Pararam Hoje</span>
                    <span className="text-lg font-extrabold text-rose-400 font-mono">
                      {eventosData?.eventos_dia?.qtd_pontos_pararam || 0} pts
                    </span>
                  </div>
                  <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-cyan-500/30">
                    <span className="text-[10px] text-cyan-300 font-semibold block">🔄 Retornaram Hoje</span>
                    <span className="text-lg font-extrabold text-cyan-400 font-mono">
                      {eventosData?.eventos_dia?.qtd_pontos_retornaram || 0} pts
                    </span>
                  </div>
                  <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-emerald-500/30">
                    <span className="text-[10px] text-emerald-300 font-semibold block">🆕 Novos Sellers</span>
                    <span className="text-lg font-extrabold text-emerald-400 font-mono">
                      {eventosData?.eventos_dia?.qtd_estreias_sellers || 0}
                    </span>
                  </div>
                </div>
              </div>

              {loadingEventos ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-7 h-7 animate-spin text-fuchsia-400" />
                  <span className="text-xs">Consultando eventos e linha do tempo operacional...</span>
                </div>
              ) : (
                <>
                  {/* GRID DOS 3 BLOCOS DE ACONTECIMENTOS DO DIA SELECIONADO */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* BLOCO 1: ESTREIA DE PONTOS (1º PACOTE BIPADO) */}
                    <div className="p-4 rounded-xl bg-[#131926]/95 border border-amber-500/30 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                          <div>
                            <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                              <Sparkles className="w-4 h-4 text-amber-400" />
                              Estreias de Pontos (1º Pacote Bipado)
                            </h4>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Unidades que iniciaram operação em {selectedDia?.startsWith("MES:") ? selectedDia.slice(4) : selectedDia}
                            </p>
                          </div>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            {eventosData?.eventos_dia?.estreias_pontos?.length || 0}
                          </span>
                        </div>

                        <div className="mt-3 max-h-64 overflow-y-auto space-y-2 pr-1">
                          {(eventosData?.eventos_dia?.estreias_pontos || []).length === 0 ? (
                            <div className="py-8 text-center text-xs text-slate-500">
                              Nenhum ponto estreou seu 1º pacote exatamente nesta data. Veja abaixo na Linha do Tempo todas as datas com inaugurações!
                            </div>
                          ) : (
                            (eventosData?.eventos_dia?.estreias_pontos || []).map((pt: any, idx: number) => (
                              <div
                                key={pt.md_codigo + idx}
                                className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 flex items-center justify-between gap-2 transition-colors"
                              >
                                <div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-mono font-bold text-xs text-white">{pt.md_codigo}</span>
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                      {pt.tipo_ponto}
                                    </span>
                                    {pt.dia_estreia && selectedDia?.startsWith("MES:") && (
                                      <span className="text-[10px] font-mono text-slate-400">• {pt.dia_estreia}</span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    {pt.cidade} / {pt.estado}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-xs font-mono font-extrabold text-amber-400 block">
                                    {(pt.volume_estreia || 0).toLocaleString("pt-BR")} pcts
                                  </span>
                                  <span className="text-[10px] text-slate-500">no 1º dia</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* BLOCO 2: PONTOS QUE PARARAM HOJE OU RETORNARAM */}
                    <div className="p-4 rounded-xl bg-[#131926]/95 border border-rose-500/30 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                          <div>
                            <h4 className="text-xs font-bold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 text-rose-400" />
                              Paradas Súbitas no Dia
                            </h4>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Biparam no dia anterior ({eventosData?.eventos_dia?.dia_anterior || "anterior"}) e zeraram hoje
                            </p>
                          </div>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            {eventosData?.eventos_dia?.qtd_pontos_pararam || 0}
                          </span>
                        </div>

                        <div className="mt-3 max-h-64 overflow-y-auto space-y-2 pr-1">
                          {(eventosData?.eventos_dia?.pontos_pararam || []).length === 0 ? (
                            <div className="py-8 text-center text-xs text-slate-500">
                              Nenhuma parada súbita registrada para este período.
                            </div>
                          ) : (
                            (eventosData?.eventos_dia?.pontos_pararam || []).map((pt: any, idx: number) => (
                              <div
                                key={pt.md_codigo + idx}
                                className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2"
                              >
                                <div>
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-bold text-xs text-white">{pt.md_codigo}</span>
                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-800 text-slate-300">
                                      {pt.tipo_ponto}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    {pt.cidade} / {pt.estado}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-xs font-mono font-bold text-rose-400 block">
                                    0 hoje
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    Ontem: {(pt.volume_dia_anterior || 0).toLocaleString("pt-BR")} pcts
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* BLOCO 3: NOVOS CLIENTES, SELLERS & DIÁRIO DE BORDO */}
                    <div className="p-4 rounded-xl bg-[#131926]/95 border border-emerald-500/30 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                          <div>
                            <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                              <Building2 className="w-4 h-4 text-emerald-400" />
                              Estreias de Clientes & Sellers
                            </h4>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Embarcadores que operaram pela 1ª vez na data
                            </p>
                          </div>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            {(eventosData?.eventos_dia?.estreias_clientes?.length || 0) +
                              (eventosData?.eventos_dia?.qtd_estreias_sellers || 0)}
                          </span>
                        </div>

                        <div className="mt-3 max-h-64 overflow-y-auto space-y-2 pr-1">
                          {(eventosData?.eventos_dia?.estreias_clientes || []).map((c: any, idx: number) => (
                            <div
                              key={"cli-" + idx}
                              className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/40 flex items-center justify-between gap-2"
                            >
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-emerald-500/20 text-emerald-300">
                                    NOVO CLIENTE
                                  </span>
                                  <span className="font-bold text-xs text-white">{c.cliente}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  Operou em {c.qtd_pontos} unidade(s) {c.dia_estreia ? `• ${c.dia_estreia}` : ""}
                                </p>
                              </div>
                              <span className="text-xs font-mono font-extrabold text-emerald-400">
                                {(c.volume_estreia || 0).toLocaleString("pt-BR")} pcts
                              </span>
                            </div>
                          ))}

                          {(eventosData?.eventos_dia?.estreias_sellers || []).map((s: any, idx: number) => (
                            <div
                              key={"sel-" + idx}
                              className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <p className="font-semibold text-xs text-white truncate" title={s.merchant_nome}>
                                  {s.merchant_nome}
                                </p>
                                <p className="text-[10px] text-slate-400 font-mono truncate">
                                  {s.ponto_colecao} • {s.cliente} {s.dia_estreia && selectedDia?.startsWith("MES:") ? `(${s.dia_estreia})` : ""}
                                </p>
                              </div>
                              <span className="text-xs font-mono font-bold text-cyan-300 shrink-0">
                                {(s.volume_estreia || 0).toLocaleString("pt-BR")} pcts
                              </span>
                            </div>
                          ))}

                          {(eventosData?.eventos_dia?.estreias_clientes || []).length === 0 &&
                            (eventosData?.eventos_dia?.estreias_sellers || []).length === 0 && (
                              <div className="py-8 text-center text-xs text-slate-500">
                                Nenhum novo cliente ou seller estreou nesta data.
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* DIÁRIO DE BORDO OPERACIONAL (NOTAS MANUAIS DA DATA) */}
                  {(isLocalOffline || (eventosData?.eventos_dia?.notas_manuais || []).length > 0) && (
                    <div className="p-5 rounded-xl bg-[#131926]/90 border border-slate-800 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                        <div>
                          <h4 className="text-sm font-bold text-white flex items-center gap-2">
                            📝 Diário de Bordo Operacional ({selectedDia})
                          </h4>
                          <p className="text-xs text-slate-400">
                            Registros e observações operacionais anotados para esta data (ex: inauguração de rota, ocorrência em MD, mudança de janela).
                          </p>
                        </div>
                      </div>

                      {(eventosData?.eventos_dia?.notas_manuais || []).length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {(eventosData?.eventos_dia?.notas_manuais || []).map((n: any) => (
                            <div
                              key={n.id}
                              className="p-3.5 rounded-xl bg-slate-900/90 border border-fuchsia-500/30 flex items-start justify-between gap-3"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-fuchsia-500/20 text-fuchsia-300">
                                    {n.categoria}
                                  </span>
                                  {n.ponto_codigo && (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-cyan-300">
                                      {n.ponto_codigo}
                                    </span>
                                  )}
                                  <span className="text-[11px] font-mono text-slate-400">{n.dia_base}</span>
                                </div>
                                <p className="text-xs font-bold text-white">{n.titulo}</p>
                                {n.descricao && <p className="text-xs text-slate-300">{n.descricao}</p>}
                              </div>
                              {isLocalOffline && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoverNotaDiario(n.id)}
                                  className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                                  title="Remover anotação"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {isLocalOffline && (
                        <form onSubmit={handleSalvarNotaDiario} className="grid grid-cols-1 md:grid-cols-12 gap-2.5 pt-1 text-xs">
                          <select
                            value={novaNota.categoria}
                            onChange={(e) => setNovaNota({ ...novaNota, categoria: e.target.value })}
                            className="md:col-span-2 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-white"
                          >
                            <option value="OPERACIONAL">📌 Operacional</option>
                            <option value="ESTREIA_PONTO">🌟 Estreia Ponto</option>
                            <option value="ROTA_TRANSPORTE">🚛 Rota / Frota</option>
                            <option value="OCORRENCIA">⚠️ Ocorrência</option>
                          </select>
                          <input
                            type="text"
                            value={novaNota.ponto_codigo}
                            onChange={(e) => setNovaNota({ ...novaNota, ponto_codigo: e.target.value.toUpperCase() })}
                            placeholder="Código MD/HUB (opcional)"
                            className="md:col-span-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                          />
                          <input
                            type="text"
                            required
                            value={novaNota.titulo}
                            onChange={(e) => setNovaNota({ ...novaNota, titulo: e.target.value })}
                            placeholder="Título do acontecimento (ex: Primeiro carregamento rota ABC)"
                            className="md:col-span-3 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                          />
                          <input
                            type="text"
                            value={novaNota.descricao}
                            onChange={(e) => setNovaNota({ ...novaNota, descricao: e.target.value })}
                            placeholder="Detalhes adicionais..."
                            className="md:col-span-3 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white"
                          />
                          <button
                            type="submit"
                            disabled={salvandoNota}
                            className="md:col-span-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold rounded-lg px-3 py-2 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                          >
                            <Plus className="w-4 h-4" />
                            {salvandoNota ? "Salvando..." : "Registrar no Dia"}
                          </button>
                        </form>
                      )}
                    </div>
                  )}

                  {/* SELETOR INFERIOR: CATÁLOGO DE 1º BIP DE CADA PONTO vs LINHA DO TEMPO DIA A DIA */}
                  <div className="p-5 rounded-xl bg-[#131926]/90 border border-slate-800 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                      <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setSubAbaEventos("catalogo")}
                          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            subAbaEventos === "catalogo"
                              ? "bg-fuchsia-600 text-white shadow"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          🏅 Catálogo de Estreia por Ponto ({eventosData?.catalogo_pontos?.length || 0} Unidades)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubAbaEventos("timeline")}
                          className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            subAbaEventos === "timeline"
                              ? "bg-fuchsia-600 text-white shadow"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          🗓️ Linha do Tempo Dia a Dia ({eventosData?.linha_do_tempo?.length || 0} Datas)
                        </button>
                      </div>

                      {subAbaEventos === "catalogo" && (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <select
                            value={filtroTipoCatalogo}
                            onChange={(e) => setFiltroTipoCatalogo(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white cursor-pointer"
                          >
                            <option value="TODOS">Tipo: Todos ({eventosData?.catalogo_pontos?.length || 0})</option>
                            <option value="MINIDROP">🏪 MINIDROP (MD)</option>
                            <option value="HUB">🏭 HUB ANJUN</option>
                            <option value="PONTO DE APOIO">📍 PONTO DE APOIO</option>
                            <option value="PONTO DE REDE">🌐 PONTO DE REDE</option>
                          </select>

                          <select
                            value={filtroDataEstreiaCatalogo}
                            onChange={(e) => setFiltroDataEstreiaCatalogo(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white cursor-pointer"
                          >
                            <option value="">Data do 1º Pacote: Todas</option>
                            {Array.from(
                              new Set((eventosData?.catalogo_pontos || []).map((p: any) => p.data_primeiro_pacote))
                            ).map((dt: any) => (
                              <option key={dt} value={dt}>
                                Estreou em {dt}
                              </option>
                            ))}
                          </select>

                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                            <input
                              type="text"
                              value={buscaCatalogoEventos}
                              onChange={(e) => setBuscaCatalogoEventos(e.target.value)}
                              placeholder="Buscar código MD/HUB, cidade, UF..."
                              className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-white placeholder-slate-500 w-64 focus:outline-none focus:border-fuchsia-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {subAbaEventos === "catalogo" ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/60">
                              <th className="py-2.5 px-3">Unidade / IATA</th>
                              <th className="py-2.5 px-3">Tipo na Malha</th>
                              <th className="py-2.5 px-3">Cidade / UF</th>
                              <th className="py-2.5 px-3">📅 Data do 1º Pacote Bipado</th>
                              <th className="py-2.5 px-3 text-right">Vol. 1º Dia</th>
                              <th className="py-2.5 px-3">Última Bipagem</th>
                              <th className="py-2.5 px-3 text-center">Dias Operando</th>
                              <th className="py-2.5 px-3 text-right">Pico Diário</th>
                              <th className="py-2.5 px-3 text-right">Volume Total Histórico</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {(eventosData?.catalogo_pontos || [])
                              .filter((pt: any) => {
                                if (filtroTipoCatalogo !== "TODOS" && pt.tipo_ponto !== filtroTipoCatalogo) return false;
                                if (filtroDataEstreiaCatalogo && pt.data_primeiro_pacote !== filtroDataEstreiaCatalogo)
                                  return false;
                                if (buscaCatalogoEventos.trim()) {
                                  const q = buscaCatalogoEventos.trim().toLowerCase();
                                  return (
                                    (pt.md_codigo || "").toLowerCase().includes(q) ||
                                    (pt.cidade || "").toLowerCase().includes(q) ||
                                    (pt.estado || "").toLowerCase().includes(q) ||
                                    (pt.data_primeiro_pacote || "").toLowerCase().includes(q)
                                  );
                                }
                                return true;
                              })
                              .slice(0, 250)
                              .map((pt: any) => (
                                <tr key={pt.md_codigo} className="hover:bg-slate-800/40 transition-colors">
                                  <td className="py-2.5 px-3 font-mono font-bold text-white">{pt.md_codigo}</td>
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                        pt.tipo_ponto === "HUB"
                                          ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                          : pt.tipo_ponto === "PONTO DE APOIO"
                                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                          : pt.tipo_ponto === "PONTO DE REDE"
                                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                          : "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                      }`}
                                    >
                                      {pt.tipo_ponto}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-300">
                                    {pt.cidade} - {pt.estado}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setModoPeriodo("DIA");
                                        setSelectedDia(pt.data_primeiro_pacote);
                                      }}
                                      className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-mono font-bold text-[11px] cursor-pointer transition-colors"
                                      title="Clique para inspecionar o dia de estreia deste ponto"
                                    >
                                      🌟 {pt.data_primeiro_pacote}
                                    </button>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-300">
                                    {(pt.volume_primeiro_dia || 0).toLocaleString("pt-BR")} pcts
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-slate-300">
                                    {pt.data_ultimo_pacote}{" "}
                                    <span className="text-[10px] text-slate-500">
                                      ({(pt.volume_ultimo_dia || 0).toLocaleString("pt-BR")})
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono font-bold text-cyan-300">
                                    {pt.dias_operando} {pt.dias_operando === 1 ? "dia" : "dias"}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                                    {(pt.maior_volume_dia || 0).toLocaleString("pt-BR")}{" "}
                                    <span className="text-[10px] text-slate-500">({pt.data_maior_volume})</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-400">
                                    {(pt.volume_total_historico || 0).toLocaleString("pt-BR")}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                        {(eventosData?.linha_do_tempo || []).map((item: any) => {
                          const isSelected = item.dia === selectedDia;
                          return (
                            <div
                              key={item.dia}
                              onClick={() => {
                                setModoPeriodo("DIA");
                                setSelectedDia(item.dia);
                              }}
                              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                                isSelected
                                  ? "bg-fuchsia-950/30 border-fuchsia-500/60"
                                  : "bg-slate-900/80 border-slate-800 hover:border-slate-700"
                              }`}
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2.5 flex-wrap">
                                  <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-white font-mono font-extrabold text-xs border border-slate-700">
                                    📅 {item.dia}
                                  </span>
                                  <span className="text-xs text-slate-300 font-mono">
                                    Volume: <strong className="text-emerald-400">{(item.volume_total || 0).toLocaleString("pt-BR")}</strong> pcts
                                  </span>
                                  <span className="text-xs text-slate-400 font-mono">
                                    • <strong>{item.pontos_ativos}</strong> pontos ativos
                                  </span>
                                  {item.qtd_estreias_pontos > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                      🌟 {item.qtd_estreias_pontos} {item.qtd_estreias_pontos === 1 ? "ponto estreou (1º bip)" : "pontos estrearam (1º bip)"}
                                    </span>
                                  )}
                                  {item.qtd_pontos_pararam > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                      ⚠️ {item.qtd_pontos_pararam} pararam
                                    </span>
                                  )}
                                  {item.qtd_estreias_sellers > 0 && (
                                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                      🆕 {item.qtd_estreias_sellers} novos sellers
                                    </span>
                                  )}
                                </div>

                                {(item.estreias_pontos_resumo || []).length > 0 && (
                                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                    <span className="text-[10px] text-slate-400">1º pacote bipado em:</span>
                                    {(item.estreias_pontos_resumo || []).map((p: any) => (
                                      <span
                                        key={p.md_codigo}
                                        className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200 font-mono text-[10px]"
                                      >
                                        {p.md_codigo} ({p.volume_estreia})
                                      </span>
                                    ))}
                                    {item.qtd_estreias_pontos > (item.estreias_pontos_resumo || []).length && (
                                      <span className="text-[10px] text-amber-400 font-mono">
                                        +{item.qtd_estreias_pontos - (item.estreias_pontos_resumo || []).length} mais
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-fuchsia-600 text-slate-200 hover:text-white text-xs font-semibold shrink-0 self-start md:self-center transition-colors"
                              >
                                Inspecionar Dia →
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* ABA 6: RECONCILIAÇÃO RETROATIVA & PACOTES HÁ X DIAS SEM ATUALIZAÇÃO */}
          {/* ============================================================ */}
          {activeTab === "reconciliacao" && (
            <div className="space-y-6">
              {/* Banner Explicativo da Reconciliação Automática */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/35 via-[#131926] to-[#131926] border border-cyan-500/35 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0">
                    <RefreshCw className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                        Reconciliação Automática de Planilhas & Aging de Pacotes
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        • Data de Referência: {reconciliacaoData?.dia_referencia || selectedDia}
                      </span>
                    </div>
                    <h3 className="text-base md:text-lg font-bold text-white mt-1">
                      Rastreio de Pacotes Atualizados & Pacotes Sem Baixa ("Há X dias sem atualização")
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5 max-w-4xl">
                      Sempre que você subir uma planilha (seja de um dia novo como <strong>06/10</strong> ou re-subindo um dia antigo como <strong>03/10</strong>), o sistema verifica pelo <strong>código de barras</strong> se o pacote já existe no banco, atualiza o status no dia de origem, cria o registro da mudança e monitora abaixo todos os pacotes que ainda não chegaram em <strong>Circuito Fechado</strong>.
                    </p>
                    <div className="mt-3 p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-xs text-slate-300 max-w-4xl">
                      <p className="font-bold text-cyan-300 mb-1 flex items-center gap-1.5">
                        💡 Cargas Parciais por Lote de Status (Suporte Nativo)
                      </p>
                      <p>
                        Você pode subir planilhas filtradas do mês em blocos (ex: uma só com <em>Coleta e Saco Selado</em>, outra com <em>Carregamento e Descarregamento</em>, ou com <em>Circuito Fechado</em>).
                        O motor utiliza a <strong>Coluna M (Tempo real para a coleta)</strong> para ancorar cada pacote no seu dia de coleta original e atualiza a <strong>Coluna N (Data de conclusão)</strong>, sem nunca duplicar o volume da operação!
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={carregarReconciliacao}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-2 shrink-0 self-start lg:self-center cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingReconciliacao ? "animate-spin" : ""}`} />
                  Atualizar Auditoria
                </button>
              </div>

              {loadingReconciliacao ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-7 h-7 animate-spin text-cyan-400" />
                  <span className="text-xs">Calculando aging de pacotes e histórico de reconciliações...</span>
                </div>
              ) : (
                <>
                  {/* Cards de Faixas de Dias Sem Atualização (Aging) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
                    <div
                      onClick={() => setFiltroFaixaAging("TODOS")}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        filtroFaixaAging === "TODOS"
                          ? "bg-slate-900 border-cyan-500/70"
                          : "bg-[#131926]/90 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <span className="text-xs font-bold text-cyan-300 block">🔄 Atualizados Retroativos</span>
                      <p className="text-2xl font-extrabold text-white font-mono mt-2">
                        {(reconciliacaoData?.totais_gerais?.total_atualizados_retroativos || 0).toLocaleString("pt-BR")}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Pacotes que mudaram de status após re-upload
                      </p>
                    </div>

                    <div
                      onClick={() => setFiltroFaixaAging(filtroFaixaAging === "ATE_2" ? "TODOS" : "ATE_2")}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        filtroFaixaAging === "ATE_2"
                          ? "bg-blue-950/30 border-blue-400"
                          : "bg-[#131926]/90 border-blue-500/30 hover:border-blue-500/60"
                      }`}
                    >
                      <span className="text-xs font-bold text-blue-300 block">⏳ Há 1 a 2 dias sem finalizar</span>
                      <p className="text-2xl font-extrabold text-blue-400 font-mono mt-2">
                        {(reconciliacaoData?.faixas_aging?.ate_2_dias || 0).toLocaleString("pt-BR")}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Pendentes recentes (D-1 / D-2)
                      </p>
                    </div>

                    <div
                      onClick={() => setFiltroFaixaAging(filtroFaixaAging === "DE_3_5" ? "TODOS" : "DE_3_5")}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        filtroFaixaAging === "DE_3_5"
                          ? "bg-amber-950/30 border-amber-400"
                          : "bg-[#131926]/90 border-amber-500/30 hover:border-amber-500/60"
                      }`}
                    >
                      <span className="text-xs font-bold text-amber-300 block">⚠️ Há 3 a 5 dias sem atualização</span>
                      <p className="text-2xl font-extrabold text-amber-400 font-mono mt-2">
                        {(reconciliacaoData?.faixas_aging?.de_3_a_5_dias || 0).toLocaleString("pt-BR")}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Recomendado re-subir planilha da data
                      </p>
                    </div>

                    <div
                      onClick={() => setFiltroFaixaAging(filtroFaixaAging === "DE_6_10" ? "TODOS" : "DE_6_10")}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        filtroFaixaAging === "DE_6_10"
                          ? "bg-orange-950/30 border-orange-400"
                          : "bg-[#131926]/90 border-orange-500/30 hover:border-orange-500/60"
                      }`}
                    >
                      <span className="text-xs font-bold text-orange-300 block">🔶 Há 6 a 10 dias sem atualização</span>
                      <p className="text-2xl font-extrabold text-orange-400 font-mono mt-2">
                        {(reconciliacaoData?.faixas_aging?.de_6_a_10_dias || 0).toLocaleString("pt-BR")}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Estagnados em Coleta / Trânsito / Assinado
                      </p>
                    </div>

                    <div
                      onClick={() => setFiltroFaixaAging(filtroFaixaAging === "MAIS_10" ? "TODOS" : "MAIS_10")}
                      className={`p-4 rounded-xl border cursor-pointer transition-all ${
                        filtroFaixaAging === "MAIS_10"
                          ? "bg-rose-950/30 border-rose-400"
                          : "bg-[#131926]/90 border-rose-500/30 hover:border-rose-500/60"
                      }`}
                    >
                      <span className="text-xs font-bold text-rose-300 block">🚨 Há +10 dias sem atualização</span>
                      <p className="text-2xl font-extrabold text-rose-400 font-mono mt-2">
                        {(reconciliacaoData?.faixas_aging?.mais_10_dias || 0).toLocaleString("pt-BR")}
                      </p>
                      <p className="text-[11px] text-rose-300/80 mt-1">
                        Atenção crítica (re-exportar ou auditar)
                      </p>
                    </div>
                  </div>

                  {/* Painel Principal com Sub-Abas */}
                  <div className="p-5 rounded-2xl bg-[#131926]/90 border border-slate-800 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                      <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        <button
                          type="button"
                          onClick={() => setSubAbaReconciliacao("dias")}
                          className={`px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            subAbaReconciliacao === "dias"
                              ? "bg-cyan-600 text-white"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          📅 Dias com Pacotes Sem Atualização ({reconciliacaoData?.aging_por_data?.length || 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubAbaReconciliacao("pontos")}
                          className={`px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            subAbaReconciliacao === "pontos"
                              ? "bg-cyan-600 text-white"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          🏪 Por Ponto MD / HUB ({reconciliacaoData?.pontos_sem_atualizacao?.length || 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubAbaReconciliacao("pacotes")}
                          className={`px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            subAbaReconciliacao === "pacotes"
                              ? "bg-cyan-600 text-white"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          📦 Pacotes Parados Há X Dias ({reconciliacaoData?.pacotes_pendentes_amostra?.length || 0})
                        </button>
                        <button
                          type="button"
                          onClick={() => setSubAbaReconciliacao("atualizados")}
                          className={`px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            subAbaReconciliacao === "atualizados"
                              ? "bg-cyan-600 text-white"
                              : "text-slate-400 hover:text-white"
                          }`}
                        >
                          🔄 Registro de Pacotes Atualizados ({reconciliacaoData?.historico_pacotes_atualizados?.length || 0})
                        </button>
                      </div>

                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                        <input
                          type="text"
                          value={buscaReconciliacao}
                          onChange={(e) => setBuscaReconciliacao(e.target.value)}
                          placeholder="Buscar data, código de barras, ponto, cliente..."
                          className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 w-72 focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>

                    {subAbaReconciliacao === "dias" && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/60">
                              <th className="py-2.5 px-3">Data de Origem</th>
                              <th className="py-2.5 px-3">Tempo Sem Finalizar</th>
                              <th className="py-2.5 px-3 text-right">Volume Total</th>
                              <th className="py-2.5 px-3 text-right text-emerald-400">🟢 Circuito Fechado</th>
                              <th className="py-2.5 px-3 text-right text-amber-300">⏳ Total Sem Atualização</th>
                              <th className="py-2.5 px-3 text-right">📦 Coleta / Saco Selado</th>
                              <th className="py-2.5 px-3 text-right">🚛 Carreg. / Descarreg.</th>
                              <th className="py-2.5 px-3 text-right text-rose-400">🚨 Foi Assinado</th>
                              <th className="py-2.5 px-3 text-right text-indigo-300" title="Média de horas entre a Coleta no MD (Coluna M) e a Conclusão / Circuito Fechado (Coluna N)">⏱️ Lead Time Médio</th>
                              <th className="py-2.5 px-3 text-center">🔄 Atualizados Depois</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {(reconciliacaoData?.aging_por_data || [])
                              .filter((item: any) => {
                                const d = Number(item.dias_sem_atualizacao || 0);
                                if (filtroFaixaAging === "ATE_2" && d > 2) return false;
                                if (filtroFaixaAging === "DE_3_5" && (d < 3 || d > 5)) return false;
                                if (filtroFaixaAging === "DE_6_10" && (d < 6 || d > 10)) return false;
                                if (filtroFaixaAging === "MAIS_10" && d <= 10) return false;
                                if (buscaReconciliacao.trim()) {
                                  return (item.dia_base || "").toLowerCase().includes(buscaReconciliacao.trim().toLowerCase());
                                }
                                return true;
                              })
                              .map((item: any) => (
                                <tr key={item.dia_base} className="hover:bg-slate-800/40 transition-colors">
                                  <td className="py-2.5 px-3">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setModoPeriodo("DIA");
                                        setSelectedDia(item.dia_base);
                                        setActiveTab("visao_geral");
                                      }}
                                      className="font-mono font-bold text-white hover:text-cyan-300 underline cursor-pointer"
                                    >
                                      📅 {item.dia_base}
                                    </button>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                                        item.dias_sem_atualizacao > 10
                                          ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                          : item.dias_sem_atualizacao > 5
                                          ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
                                          : item.dias_sem_atualizacao > 2
                                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                          : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                                      }`}
                                    >
                                      {item.rotulo_aging}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-white">
                                    {(item.total_pedidos || 0).toLocaleString("pt-BR")}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                                    {(item.circuito_fechado || 0).toLocaleString("pt-BR")}{" "}
                                    <span className="text-[10px] font-normal text-slate-400">
                                      ({item.taxa_finalizacao_pct}%)
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-extrabold text-amber-300">
                                    {(item.sem_atualizacao_total || 0).toLocaleString("pt-BR")}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-amber-400">
                                    {(item.backlog_coleta || 0).toLocaleString("pt-BR")}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-blue-400">
                                    {(item.em_transito || 0).toLocaleString("pt-BR")}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-rose-400 font-semibold">
                                    {(item.foi_assinado || 0).toLocaleString("pt-BR")}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-indigo-300">
                                    {item.horas_medias_coleta_ate_conclusao !== null && item.horas_medias_coleta_ate_conclusao !== undefined ? (
                                      <span title={`${item.amostras_conclusao || 0} pacotes em Circuito Fechado com tempo medido`}>
                                        {item.horas_medias_coleta_ate_conclusao}h
                                      </span>
                                    ) : (
                                      <span className="text-slate-500">—</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-center font-mono">
                                    {item.qtd_atualizados_retroativos > 0 ? (
                                      <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold text-[10px]">
                                        🔄 {item.qtd_atualizados_retroativos.toLocaleString("pt-BR")} ({item.ultima_atualizacao_em})
                                      </span>
                                    ) : (
                                      <span className="text-slate-500 text-[10px]">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {subAbaReconciliacao === "pontos" && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/60">
                              <th className="py-2.5 px-3">Ponto de Coleta</th>
                              <th className="py-2.5 px-3">Modalidade (pelo Ponto)</th>
                              <th className="py-2.5 px-3">Cidade / UF</th>
                              <th className="py-2.5 px-3">Pacote Mais Antigo Sem Baixa</th>
                              <th className="py-2.5 px-3 text-right">Total Sem Atualização</th>
                              <th className="py-2.5 px-3 text-right">📦 Coleta / Saco Selado</th>
                              <th className="py-2.5 px-3 text-right">🚛 Carreg. / Descarreg.</th>
                              <th className="py-2.5 px-3 text-right text-rose-400">🚨 Foi Assinado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {(reconciliacaoData?.pontos_sem_atualizacao || [])
                              .filter((pt: any) => {
                                if (!buscaReconciliacao.trim()) return true;
                                const q = buscaReconciliacao.trim().toLowerCase();
                                return (
                                  (pt.ponto_colecao || "").toLowerCase().includes(q) ||
                                  (pt.cidade || "").toLowerCase().includes(q) ||
                                  (pt.estado || "").toLowerCase().includes(q)
                                );
                              })
                              .map((pt: any) => (
                                <tr key={pt.ponto_colecao} className="hover:bg-slate-800/40">
                                  <td className="py-2.5 px-3 font-mono font-bold text-white">{pt.ponto_colecao}</td>
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        String(pt.modalidade_ponto).includes("DROPOFF")
                                          ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                          : "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                                      }`}
                                    >
                                      {pt.modalidade_ponto}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-300">
                                    {pt.cidade} - {pt.estado}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-amber-300">
                                    Desde {pt.data_mais_antiga} (há {pt.dias_sem_atualizacao_max} dias)
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-extrabold text-white">
                                    {(pt.total_sem_atualizacao || 0).toLocaleString("pt-BR")}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-amber-400">
                                    {(pt.backlog_coleta || 0).toLocaleString("pt-BR")}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-blue-400">
                                    {(pt.em_transito || 0).toLocaleString("pt-BR")}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-rose-400 font-bold">
                                    {(pt.foi_assinado || 0).toLocaleString("pt-BR")}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {subAbaReconciliacao === "pacotes" && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/60">
                              <th className="py-2.5 px-3">Código de Barras</th>
                              <th className="py-2.5 px-3">Data de Origem</th>
                              <th className="py-2.5 px-3">Tempo Sem Atualização</th>
                              <th className="py-2.5 px-3">Ponto de Coleta</th>
                              <th className="py-2.5 px-3">Seller / Remetente</th>
                              <th className="py-2.5 px-3">Cidade / UF</th>
                              <th className="py-2.5 px-3">Status Parado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {(reconciliacaoData?.pacotes_pendentes_amostra || [])
                              .filter((pk: any) => {
                                if (!buscaReconciliacao.trim()) return true;
                                const q = buscaReconciliacao.trim().toLowerCase();
                                return (
                                  (pk.codigo_barras || "").toLowerCase().includes(q) ||
                                  (pk.ponto_colecao || "").toLowerCase().includes(q) ||
                                  (pk.seller || "").toLowerCase().includes(q) ||
                                  (pk.dia_origem || "").toLowerCase().includes(q)
                                );
                              })
                              .map((pk: any, idx: number) => (
                                <tr key={pk.codigo_barras + idx} className="hover:bg-slate-800/40">
                                  <td className="py-2.5 px-3 font-mono font-bold text-white">{pk.codigo_barras}</td>
                                  <td className="py-2.5 px-3 font-mono text-slate-300">{pk.dia_origem}</td>
                                  <td className="py-2.5 px-3">
                                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-[10px] font-bold">
                                      ⏳ {pk.rotulo_aging}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 font-mono">
                                    <span className="text-white font-bold">{pk.ponto_colecao}</span>{" "}
                                    <span className="text-[10px] text-cyan-300">({pk.modalidade_ponto})</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-300 max-w-[200px] truncate" title={pk.seller}>
                                    {pk.seller}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-400">
                                    {pk.cidade}/{pk.estado}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        String(pk.status_atual).toLowerCase() === "foi assinado"
                                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                                          : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                                      }`}
                                    >
                                      {pk.status_atual}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {subAbaReconciliacao === "atualizados" && (
                      <div className="space-y-4">
                        {(reconciliacaoData?.historico_pacotes_atualizados || []).length === 0 ? (
                          <div className="py-10 text-center text-xs text-slate-400 bg-slate-900/50 rounded-xl border border-slate-800 p-6">
                            <p className="font-bold text-white text-sm mb-1">
                              Motor de Reconciliação Ativo e Pronto!
                            </p>
                            <p>
                              Assim que você subir novamente uma planilha de um dia anterior (ex: re-subir <strong>03/10</strong>) ou subir uma planilha nova (ex: <strong>22/10</strong>) contendo pacotes que antes estavam como <em>Coleta / Saco Selado / Carregamento / Foi Assinado</em>, todos os pacotes que tiverem o status atualizado aparecerão listados aqui com a data exata da atualização!
                            </p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead>
                                <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/60">
                                  <th className="py-2.5 px-3">Código de Barras</th>
                                  <th className="py-2.5 px-3">Data de Origem</th>
                                  <th className="py-2.5 px-3">Atualizado na Planilha de</th>
                                  <th className="py-2.5 px-3">Ponto de Coleta</th>
                                  <th className="py-2.5 px-3">Cliente / Seller</th>
                                  <th className="py-2.5 px-3">Evolução de Status</th>
                                  <th className="py-2.5 px-3 text-emerald-300">🏁 Conclusão (Col. N)</th>
                                  <th className="py-2.5 px-3">Data/Hora do Registro</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60">
                                {(reconciliacaoData?.historico_pacotes_atualizados || []).map((item: any) => (
                                  <tr key={item.id} className="hover:bg-slate-800/40">
                                    <td className="py-2.5 px-3 font-mono font-bold text-white">{item.codigo_barras}</td>
                                    <td className="py-2.5 px-3 font-mono text-amber-300">{item.dia_origem}</td>
                                    <td className="py-2.5 px-3 font-mono text-cyan-300 font-bold">{item.dia_atualizacao}</td>
                                    <td className="py-2.5 px-3 font-mono text-white">{item.ponto_colecao}</td>
                                    <td className="py-2.5 px-3 text-slate-300">
                                      {item.nome_cliente} • {item.merchant_nome}
                                    </td>
                                    <td className="py-2.5 px-3 font-mono">
                                      <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">
                                        {item.status_anterior}
                                      </span>
                                      <span className="mx-1.5 text-slate-400">→</span>
                                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                                        {item.status_novo}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 font-mono text-emerald-300">
                                      {item.data_conclusao || <span className="text-slate-500">—</span>}
                                    </td>
                                    <td className="py-2.5 px-3 font-mono text-slate-400">{item.registrado_em}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
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

        {/* ============================================================ */}
        {/* MODAL DE PACOTES, PONTOS (MD/HUB) E SELLERS DO CLIENTE */}
        {/* ============================================================ */}
        {modalClienteOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6">
            <div className="bg-[#0F1522] border border-slate-700/80 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Cabeçalho do Modal */}
              <div className="px-6 py-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900/80">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                      {clienteDetalheData?.is_marketplace ? `Marketplace • ${clienteDetalheData?.marketplace_grupo}` : "Cliente / Embarcador"}
                    </span>
                    {Array.isArray(clienteDetalheData?.cliente_ids) && clienteDetalheData.cliente_ids.length > 0 && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                        Nº Cliente: {clienteDetalheData.cliente_ids.join(", ")}
                      </span>
                    )}
                    <span className="text-xs text-slate-400 font-mono">
                      • Data: {selectedDia}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2 mt-1">
                    <Package className="w-5 h-5 text-emerald-400" />
                    <span>Pacotes & Operação — {clienteDetalheAlvo}</span>
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  {/* Trocar de Cliente rapidamente via Dropdown dentro do Modal */}
                  <select
                    value={clienteDetalheAlvo}
                    onChange={(e) => {
                      if (e.target.value) {
                        abrirModalCliente(e.target.value, "TODOS");
                      }
                    }}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-emerald-500 cursor-pointer max-w-[210px]"
                    title="Alternar para outro cliente rapidamente"
                  >
                    {clientesBreakdown.map((c: any, i: number) => {
                      const nm = c.cliente || c.nome_cliente;
                      const vl = Number(c.volume || 0);
                      return (
                        <option key={nm + i} value={nm} className="bg-slate-900 text-white">
                          {nm} ({vl.toLocaleString("pt-BR")})
                        </option>
                      );
                    })}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCliente(clienteDetalheAlvo);
                      setModalClienteOpen(false);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Filtrar Painel por este Cliente
                  </button>

                  <button
                    type="button"
                    onClick={() => setModalClienteOpen(false)}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* KPIs do Cliente */}
              <div className="px-6 py-3 bg-[#131926] border-b border-slate-800 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-400 text-[11px] block">Total de Pacotes</span>
                  <span className="text-base font-extrabold text-white font-mono">
                    {(clienteDetalheData?.resumo?.total_pedidos || 0).toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-emerald-500/30">
                  <span className="text-emerald-400 text-[11px] block">Coletados ANJUN</span>
                  <span className="text-base font-extrabold text-emerald-400 font-mono">
                    {(clienteDetalheData?.resumo?.coletados || 0).toLocaleString("pt-BR")}{" "}
                    <span className="text-[11px] font-normal">({clienteDetalheData?.resumo?.taxa_coleta_pct || 0}%)</span>
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-amber-500/30">
                  <span className="text-amber-400 text-[11px] block">Backlog Pendente</span>
                  <span className="text-base font-extrabold text-amber-400 font-mono">
                    {(clienteDetalheData?.resumo?.backlog || 0).toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-indigo-500/30">
                  <span className="text-indigo-300 text-[11px] block">🚛 W2D (Pickup)</span>
                  <span className="text-base font-extrabold text-white font-mono">
                    {(clienteDetalheData?.resumo?.vol_pickup || 0).toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30">
                  <span className="text-cyan-300 text-[11px] block">🏪 D2D (Dropoff)</span>
                  <span className="text-base font-extrabold text-white font-mono">
                    {(clienteDetalheData?.resumo?.vol_dropoff || 0).toLocaleString("pt-BR")}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                  <span className="text-slate-400 text-[11px] block">Unidades / Sellers</span>
                  <span className="text-sm font-bold text-slate-200 font-mono">
                    {clienteDetalheData?.resumo?.qtd_pontos || 0} pts • {clienteDetalheData?.resumo?.qtd_sellers || 0} sellers
                  </span>
                </div>
              </div>

              {/* Barra de Filtros Dropdown + Busca de Pacotes */}
              <div className="px-6 py-3 bg-[#0C101B] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                {/* Abas Internas do Modal */}
                <div className="flex items-center gap-1.5 bg-[#131926] p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setAbaModalCliente("pacotes")}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                      abaModalCliente === "pacotes"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    📦 Pacotes / Lotes ({clienteDetalheData?.pacotes?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAbaModalCliente("pontos")}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                      abaModalCliente === "pontos"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🏪 Por Ponto MD / HUB ({clienteDetalheData?.por_ponto?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setAbaModalCliente("sellers")}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                      abaModalCliente === "sellers"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🏢 Por Seller ({clienteDetalheData?.por_seller?.length || 0})
                  </button>
                </div>

                {/* Dropdowns de Filtro + Busca */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Dropdown Modalidade */}
                  <select
                    value={filtroModalidadeCli}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFiltroModalidadeCli(v);
                      carregarDetalhesCliente(clienteDetalheAlvo, v, filtroStatusCli, filtroPontoCli, buscaPacoteCli);
                    }}
                    className="bg-[#131926] border border-slate-700 rounded-xl px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="TODOS">Modalidade: Todas (W2D & D2D)</option>
                    <option value="W2D">🚛 Apenas W2D (Pickup / Coleta)</option>
                    <option value="D2D">🏪 Apenas D2D (Dropoff / MD)</option>
                  </select>

                  {/* Dropdown Status */}
                  <select
                    value={filtroStatusCli}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFiltroStatusCli(v);
                      carregarDetalhesCliente(clienteDetalheAlvo, filtroModalidadeCli, v, filtroPontoCli, buscaPacoteCli);
                    }}
                    className="bg-[#131926] border border-slate-700 rounded-xl px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="TODOS">Status: Todos</option>
                    <option value="COLETADOS">🟢 Coletados ANJUN</option>
                    <option value="BACKLOG">⚠️ Backlog Pendente</option>
                  </select>

                  {/* Dropdown Ponto (MD / HUB) */}
                  <select
                    value={filtroPontoCli}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFiltroPontoCli(v);
                      carregarDetalhesCliente(clienteDetalheAlvo, filtroModalidadeCli, filtroStatusCli, v, buscaPacoteCli);
                    }}
                    className="bg-[#131926] border border-slate-700 rounded-xl px-2.5 py-1.5 text-white focus:outline-none focus:border-emerald-500 cursor-pointer max-w-[180px]"
                  >
                    <option value="TODOS">Ponto (MD/HUB): Todos</option>
                    {(clienteDetalheData?.pontos_disponiveis || []).map((pt: string) => (
                      <option key={pt} value={pt}>
                        {pt}
                      </option>
                    ))}
                  </select>

                  {/* Busca de Pacote / Barcode / Seller / Saca */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                    <input
                      type="text"
                      value={buscaPacoteCli}
                      onChange={(e) => setBuscaPacoteCli(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          carregarDetalhesCliente(
                            clienteDetalheAlvo,
                            filtroModalidadeCli,
                            filtroStatusCli,
                            filtroPontoCli,
                            buscaPacoteCli
                          );
                        }
                      }}
                      placeholder="Buscar pacote, código, saca, seller..."
                      className="bg-[#131926] border border-slate-700 rounded-xl pl-8 pr-16 py-1.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-60"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        carregarDetalhesCliente(
                          clienteDetalheAlvo,
                          filtroModalidadeCli,
                          filtroStatusCli,
                          filtroPontoCli,
                          buscaPacoteCli
                        )
                      }
                      className="absolute right-1.5 top-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                    >
                      Buscar
                    </button>
                  </div>
                </div>
              </div>

              {/* Corpo Rolável do Modal */}
              <div className="flex-1 overflow-y-auto p-5">
                {loadingClienteDetalhe ? (
                  <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs">
                    <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                    <span>Carregando pacotes e operação de {clienteDetalheAlvo}...</span>
                  </div>
                ) : abaModalCliente === "pacotes" ? (
                  <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/50">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900 text-slate-400 font-semibold">
                            <th className="py-2.5 px-3">Código de Barras / Lote</th>
                            <th className="py-2.5 px-3">Nº Pacote / Saca</th>
                            <th className="py-2.5 px-3">Seller / Remetente</th>
                            <th className="py-2.5 px-3">Unidade (MD / HUB)</th>
                            <th className="py-2.5 px-3">Modalidade</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Origem → Destino</th>
                            <th className="py-2.5 px-3 text-right">Qtd / Horário</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-200">
                          {(clienteDetalheData?.pacotes || []).length === 0 ? (
                            <tr>
                              <td colSpan={8} className="py-10 text-center text-slate-400">
                                Nenhum pacote encontrado para este filtro.
                              </td>
                            </tr>
                          ) : (
                            (clienteDetalheData?.pacotes || []).map((pct: any, i: number) => {
                              const isHub = pct.is_md === false || String(pct.ponto_colecao || "").includes("-H");
                              return (
                                <tr key={pct.codigo_barras + i} className="hover:bg-slate-800/40">
                                  <td className="py-2.5 px-3 font-mono font-bold text-white">
                                    {pct.codigo_barras}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-300">
                                    <div>{pct.numero_pacote}</div>
                                    {pct.numero_saca && pct.numero_saca !== "-" && (
                                      <div className="text-[10px] text-slate-500">Saca: {pct.numero_saca}</div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 max-w-[200px] truncate" title={pct.merchant_nome}>
                                    {pct.merchant_nome}
                                  </td>
                                  <td className="py-2.5 px-3 font-mono">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-bold text-white">{pct.ponto_colecao}</span>
                                      <span
                                        className={`px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase ${
                                          isHub
                                            ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                            : "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                        }`}
                                      >
                                        {isHub ? "HUB" : "MD"}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                        String(pct.modalidade || "").includes("W2D")
                                          ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"
                                          : "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                      }`}
                                    >
                                      {pct.modalidade}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-[11px]">
                                      {pct.status_pedido}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-[11px] text-slate-300">
                                    {pct.origem} → {pct.destino}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-[11px]">
                                    <div className="font-bold text-emerald-400">
                                      {(pct.qtd_pacotes || 1).toLocaleString("pt-BR")} pct(s)
                                    </div>
                                    <div className="text-[10px] text-slate-500">{pct.tempo_coleta}</div>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : abaModalCliente === "pontos" ? (
                  <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/50">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900 text-slate-400 font-semibold">
                            <th className="py-2.5 px-4">Unidade (MD ou HUB)</th>
                            <th className="py-2.5 px-4">Tipo de Ponto</th>
                            <th className="py-2.5 px-4">Cidade / UF</th>
                            <th className="py-2.5 px-4 text-right">Volume Total</th>
                            <th className="py-2.5 px-4 text-right">W2D (Pickup)</th>
                            <th className="py-2.5 px-4 text-right">D2D (Dropoff)</th>
                            <th className="py-2.5 px-4 text-right">Coletados</th>
                            <th className="py-2.5 px-4 text-right">Backlog</th>
                            <th className="py-2.5 px-4 text-center">Taxa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-200">
                          {(clienteDetalheData?.por_ponto || []).map((pt: any, i: number) => {
                            const isHub = pt.is_md === false || String(pt.ponto_colecao || "").includes("-H");
                            return (
                              <tr
                                key={pt.ponto_colecao + i}
                                onClick={() => {
                                  setFiltroPontoCli(pt.ponto_colecao);
                                  setAbaModalCliente("pacotes");
                                  carregarDetalhesCliente(
                                    clienteDetalheAlvo,
                                    filtroModalidadeCli,
                                    filtroStatusCli,
                                    pt.ponto_colecao,
                                    buscaPacoteCli
                                  );
                                }}
                                className="hover:bg-slate-800/40 cursor-pointer"
                                title="Clique para filtrar os pacotes desta unidade"
                              >
                                <td className="py-2.5 px-4 font-mono font-bold text-white">
                                  {pt.ponto_colecao}
                                </td>
                                <td className="py-2.5 px-4">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                      isHub
                                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                        : "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                                    }`}
                                  >
                                    {isHub ? "🏭 HUB (Transferência)" : "🏪 MD (Ponto de Coleta)"}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-slate-300">
                                  {pt.cidade} - {pt.estado}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono font-bold text-white">
                                  {(pt.volume || 0).toLocaleString("pt-BR")}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono text-indigo-300">
                                  {(pt.vol_pickup || 0).toLocaleString("pt-BR")}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono text-cyan-300">
                                  {(pt.vol_dropoff || 0).toLocaleString("pt-BR")}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono text-emerald-400 font-semibold">
                                  {(pt.coletados || 0).toLocaleString("pt-BR")}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono text-amber-400 font-semibold">
                                  {(pt.backlog || 0).toLocaleString("pt-BR")}
                                </td>
                                <td className="py-2.5 px-4 text-center font-mono font-bold text-white">
                                  {pt.taxa_coleta_pct}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800 overflow-hidden bg-slate-900/50">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 bg-slate-900 text-slate-400 font-semibold">
                            <th className="py-2.5 px-4">Seller / Comerciante</th>
                            <th className="py-2.5 px-4">Unidade (MD / HUB)</th>
                            <th className="py-2.5 px-4">Cidade / UF</th>
                            <th className="py-2.5 px-4">Modalidade</th>
                            <th className="py-2.5 px-4 text-right">Volume</th>
                            <th className="py-2.5 px-4 text-right">Coletados</th>
                            <th className="py-2.5 px-4 text-right">Backlog</th>
                            <th className="py-2.5 px-4 text-center">Taxa</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 text-slate-200">
                          {(clienteDetalheData?.por_seller || []).map((sl: any, i: number) => (
                            <tr key={sl.merchant_nome + i} className="hover:bg-slate-800/40">
                              <td className="py-2.5 px-4 font-semibold text-white">
                                {sl.merchant_nome}
                              </td>
                              <td className="py-2.5 px-4 font-mono text-cyan-300">
                                {sl.ponto_colecao}
                              </td>
                              <td className="py-2.5 px-4 text-slate-300">
                                {sl.cidade} - {sl.estado}
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-semibold">
                                  {sl.modalidade}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-white">
                                {(sl.volume || 0).toLocaleString("pt-BR")}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono text-emerald-400">
                                {(sl.coletados || 0).toLocaleString("pt-BR")}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono text-amber-400">
                                {(sl.backlog || 0).toLocaleString("pt-BR")}
                              </td>
                              <td className="py-2.5 px-4 text-center font-mono font-bold text-white">
                                {sl.taxa_coleta_pct}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
