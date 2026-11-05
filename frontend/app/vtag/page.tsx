"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  Tag,
  Send,
  Truck,
  CheckCircle2,
  Clock,
  Search,
  Copy,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
  Key,
  Check,
  MapPin,
  User,
  FileSpreadsheet,
  Layers,
  Loader2,
  ChevronRight,
  Download,
  X,
  Phone,
  Shield,
  Eye,
  Calendar,
  Sparkles
} from "lucide-react";

interface VtagItem {
  tag_number: string;
  imagem_url: string | null;
}

interface MdItem {
  md_codigo: string;
  vtags: VtagItem[];
}

interface MotoristaItem {
  motorista: string;
  placa: string;
  rota: string;
  contato: string;
  telefone_wpp: string;
  suporte: string;
  mds: MdItem[];
  total_vtags: number;
  status_envio: "PENDENTE" | "ENVIADO";
  enviado_por: string | null;
  enviado_em: string | null;
}

interface VtagStatusResponse {
  possui_planilha: boolean;
  arquivo?: string;
  dia_base?: string;
  token_status?: {
    valido: boolean;
    dias_restantes: number;
    expira_em?: string;
    usuario?: string;
    expirado?: boolean;
    motivo?: string;
  };
  total_mds_planilha?: number;
  total_motoristas_planilha?: number;
  suportes_disponiveis?: string[];
  estatisticas_banco?: {
    mds_com_vtag: number;
    motoristas_com_vtag: number;
    total_enviados: number;
    total_vtags_geradas: number;
  };
  mensagem?: string;
  erro_leitura?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export default function VtagPage() {
  const { isMaster, isOperador, operadorNome, alternarPerfil } = useAuth();

  // Estados principais
  const [statusData, setStatusData] = useState<VtagStatusResponse | null>(null);
  const [motoristas, setMotoristas] = useState<MotoristaItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMotoristas, setLoadingMotoristas] = useState<boolean>(false);
  const [gerandoVtags, setGerandoVtags] = useState<boolean>(false);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [sucessoMsg, setSucessoMsg] = useState<string | null>(null);

  // Filtros
  const [suporteFiltro, setSuporteFiltro] = useState<string>("TODOS");
  const [search, setSearch] = useState<string>("");
  const [statusFiltro, setStatusFiltro] = useState<string>("TODOS");

  // Modais
  const [modalTokenOpen, setModalTokenOpen] = useState<boolean>(false);
  const [novoToken, setNovoToken] = useState<string>("");
  const [salvandoToken, setSalvandoToken] = useState<boolean>(false);

  const [modalZoomVtag, setModalZoomVtag] = useState<{
    vtag: string;
    md: string;
    imagemUrl: string;
  } | null>(null);

  // 1. Carrega status inicial
  const carregarStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/vtags/status`);
      const data: VtagStatusResponse = await res.json();
      setStatusData(data);

      // Se for operador e ainda não tiver filtro definido, tenta usar o nome do operador
      if (isOperador && operadorNome && data.suportes_disponiveis?.includes(operadorNome.toUpperCase())) {
        setSuporteFiltro(operadorNome.toUpperCase());
      }
    } catch (err: any) {
      console.error("Erro ao carregar status de VTAGs:", err);
      setErroMsg("Não foi possível conectar ao servidor backend da Torre.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Carrega lista de motoristas agrupados
  const carregarMotoristas = async () => {
    try {
      setLoadingMotoristas(true);
      const p = new URLSearchParams();
      if (suporteFiltro && suporteFiltro !== "TODOS") p.append("suporte", suporteFiltro);
      if (search) p.append("search", search);
      if (statusFiltro && statusFiltro !== "TODOS") p.append("status_filtro", statusFiltro);

      const res = await fetch(`${API_BASE}/api/vtags/motoristas?${p.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMotoristas(data.motoristas || []);
      }
    } catch (err) {
      console.warn("Aviso ao carregar motoristas:", err);
    } finally {
      setLoadingMotoristas(false);
    }
  };

  useEffect(() => {
    carregarStatus();
  }, []);

  useEffect(() => {
    if (statusData?.possui_planilha) {
      carregarMotoristas();
    }
  }, [suporteFiltro, search, statusFiltro, statusData?.possui_planilha]);

  // Se o operador mudar seu nome de suporte no filtro, salva localmente
  const handleSelecionarSuporte = (sup: string) => {
    setSuporteFiltro(sup);
    if (sup !== "TODOS") {
      alternarPerfil(isOperador ? "operador" : "master", sup);
    }
  };

  // Disparo / Abertura do WhatsApp
  const handleEnviarWhatsApp = async (m: MotoristaItem) => {
    const nomeOperador = operadorNome || (suporteFiltro !== "TODOS" ? suporteFiltro : "Torre de Controle");
    const diaRef = statusData?.dia_base || new Date().toLocaleDateString("pt-BR");

    // Monta o texto corporativo oficial da Torre
    let texto = `*TORRE DE CONTROLE ANJUN EXPRESS* 🚛\n`;
    texto += `Bom dia, *${m.motorista}*! Seguem suas VTAGs liberadas para a coleta de hoje (${diaRef}):\n\n`;
    texto += `📍 *Rota:* ${m.rota || "Padrão"}\n`;
    texto += `🚐 *Placa:* ${m.placa || "N/A"}\n`;
    texto += `👤 *Operador Responsável:* ${m.suporte}\n\n`;
    texto += `📦 *MiniDrops da sua rota:* \n`;

    m.mds.forEach((md) => {
      const vtagsStr = md.vtags.length > 0 ? md.vtags.map((v) => v.tag_number).join(" e ") : "Gerada na Anjun";
      texto += `  • *${md.md_codigo}* (VTAG: ${vtagsStr})\n`;
    });

    texto += `\n⚠️ _Por favor, apresente o código de barras no momento do bipe no ponto. Bom trabalho e boa rota!_`;

    const telLimpo = m.telefone_wpp.replace(/\D/g, "");
    const urlWpp = `https://web.whatsapp.com/send?phone=${telLimpo}&text=${encodeURIComponent(texto)}`;

    // Abre a conversa oficial no WhatsApp Web
    window.open(urlWpp, "_blank");

    // Marca imediatamente no backend como ENVIADO
    try {
      await fetch(`${API_BASE}/api/vtags/marcar-enviado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dia_base: diaRef,
          motorista: m.motorista,
          enviado_por: nomeOperador
        })
      });

      // Atualiza o estado local do card
      setMotoristas((prev) =>
        prev.map((item) =>
          item.motorista === m.motorista
            ? {
                ...item,
                status_envio: "ENVIADO",
                enviado_por: nomeOperador,
                enviado_em: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
              }
            : item
        )
      );

      setSucessoMsg(`VTAG enviada e registrada para ${m.motorista}!`);
      setTimeout(() => setSucessoMsg(null), 4000);
    } catch (err) {
      console.warn("Erro ao marcar como enviado no backend:", err);
    }
  };

  // Geração de VTAGs na Anjun (apenas Master ou Líder)
  const handleGerarVtagsAnjun = async () => {
    if (!confirm(`Deseja gerar as VTAGs oficiais no sistema da Anjun para os MDs de hoje (${suporteFiltro === "TODOS" ? "Todos os MDs de SP" : `Suporte ${suporteFiltro}`})?`)) {
      return;
    }

    setGerandoVtags(true);
    setErroMsg(null);
    setSucessoMsg(null);

    try {
      const p = new URLSearchParams();
      if (suporteFiltro !== "TODOS") p.append("suporte", suporteFiltro);
      p.append("qtd_por_md", "2");

      const res = await fetch(`${API_BASE}/api/vtags/gerar-vtags-anjun?${p.toString()}`, {
        method: "POST"
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Erro ao gerar VTAGs na Anjun.");
      }

      setSucessoMsg(`Sucesso! ${data.mds_gerados_nesta_execucao} MDs processados e ${data.vtags_salvas} VTAGs oficiais geradas na Anjun.`);
      await carregarStatus();
      await carregarMotoristas();
    } catch (err: any) {
      setErroMsg(err.message || "Falha na chamada com a API Anjun.");
    } finally {
      setGerandoVtags(false);
    }
  };

  // Salvar novo Token da Anjun
  const handleSalvarToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novoToken.trim()) return;

    setSalvandoToken(true);
    try {
      const res = await fetch(`${API_BASE}/api/vtags/atualizar-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: novoToken })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erro ao atualizar token.");

      setSucessoMsg("Token da Anjun atualizado com sucesso!");
      setModalTokenOpen(false);
      setNovoToken("");
      await carregarStatus();
      setTimeout(() => setSucessoMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || "Falha ao salvar token.");
    } finally {
      setSalvandoToken(false);
    }
  };

  const totaisCalculados = useMemo(() => {
    const total = motoristas.length;
    const enviados = motoristas.filter((m) => m.status_envio === "ENVIADO").length;
    const pendentes = total - enviados;
    const pct = total > 0 ? Math.round((enviados / total) * 100) : 0;
    return { total, enviados, pendentes, pct };
  }, [motoristas]);

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho Principal */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
                    Distribuição de VTAGs — São Paulo
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                    {statusData?.dia_base || "Hoje"}
                  </span>
                  {isOperador && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      Visão Operador Restrita
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Separação por Suporte da Torre, Geração Oficial Anjun e Disparo Seguro no WhatsApp dos Motoristas.
                </p>
              </div>
            </div>
          </div>

          {/* Indicador de Sessão Anjun + Ações */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Status Token */}
            <div
              onClick={() => setModalTokenOpen(true)}
              className={`p-2.5 px-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                statusData?.token_status?.valido
                  ? "bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50 text-emerald-300"
                  : "bg-rose-950/30 border-rose-500/40 text-rose-300 animate-pulse"
              }`}
              title="Clique para ver ou renovar o token de acesso à Anjun"
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  statusData?.token_status?.valido ? "bg-emerald-400 animate-ping" : "bg-rose-500"
                }`}
              />
              <div className="text-[11px] font-mono">
                {statusData?.token_status?.valido ? (
                  <span>
                    Sessão Anjun: <strong>{statusData.token_status.dias_restantes} dias</strong> restantes
                  </span>
                ) : (
                  <span className="font-bold">⚠️ Sessão Expirada (Renovar)</span>
                )}
              </div>
              <Key className="w-3.5 h-3.5 opacity-70" />
            </div>

            {/* Botão de Geração na Anjun (Apenas se não for operador restrito ou com confirmação) */}
            <button
              onClick={handleGerarVtagsAnjun}
              disabled={gerandoVtags || !statusData?.token_status?.valido}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-lg ${
                gerandoVtags
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-950/40"
              }`}
            >
              {gerandoVtags ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Gerando na Anjun...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Gerar VTAGs na Anjun (Lote)
                </>
              )}
            </button>

            <button
              onClick={() => {
                carregarStatus();
                carregarMotoristas();
              }}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              title="Atualizar dados"
            >
              <RefreshCw className={`w-4 h-4 ${loadingMotoristas ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Notificações de Sucesso / Erro */}
        {sucessoMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between animate-in fade-in">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              {sucessoMsg}
            </span>
            <button onClick={() => setSucessoMsg(null)} className="text-emerald-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {erroMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between animate-in fade-in">
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              {erroMsg}
            </span>
            <button onClick={() => setErroMsg(null)} className="text-rose-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Barra de Progresso e Métricas Rápidas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-[#131926]/90 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Total Motoristas na Escala</span>
            <span className="text-xl font-mono font-black text-white mt-1 block">
              {totaisCalculados.total}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              {statusData?.total_mds_planilha || 0} MiniDrops ativos
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#131926]/90 border border-emerald-900/40 bg-emerald-950/20">
            <span className="text-[10px] text-emerald-400 uppercase font-bold block">VTAGs Enviadas</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-mono font-black text-emerald-400">
                {totaisCalculados.enviados}
              </span>
              <span className="text-xs font-mono font-bold text-emerald-300">
                ({totaisCalculados.pct}%)
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${totaisCalculados.pct}%` }}
              />
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#131926]/90 border border-amber-900/40 bg-amber-950/20">
            <span className="text-[10px] text-amber-400 uppercase font-bold block">Envios Pendentes</span>
            <span className="text-xl font-mono font-black text-amber-400 mt-1 block">
              {totaisCalculados.pendentes}
            </span>
            <span className="text-[11px] text-amber-300/80 mt-0.5 block">Aguardando disparo</span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#131926]/90 border border-cyan-900/40 bg-cyan-950/20">
            <span className="text-[10px] text-cyan-400 uppercase font-bold block">Planilha do Dia</span>
            <span className="text-xs font-bold text-white mt-1 block truncate" title={statusData?.arquivo}>
              {statusData?.arquivo || "N/A"}
            </span>
            <span className="text-[10px] text-cyan-300 font-mono mt-0.5 block">
              Auto-sincronizada às 08:00
            </span>
          </div>
        </div>

        {/* SELETOR DE SUPORTE / OPERADOR (A CHAVE DA COLABORAÇÃO) */}
        <div className="p-4 rounded-2xl bg-[#131926]/90 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Filtrar por Operador de Suporte (Coluna P):
              </span>
            </div>
            {suporteFiltro !== "TODOS" && (
              <span className="text-xs text-cyan-300 font-mono">
                Exibindo apenas a carteira de <strong>{suporteFiltro}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none flex-wrap">
            {(statusData?.suportes_disponiveis || ["TODOS"]).map((sup) => {
              const active = suporteFiltro === sup;
              return (
                <button
                  key={sup}
                  onClick={() => handleSelecionarSuporte(sup)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/50"
                      : "bg-slate-900/90 text-slate-400 hover:text-white border border-slate-800"
                  }`}
                >
                  <span>{sup}</span>
                  {active && <Check className="w-3.5 h-3.5" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* BARRA DE FILTROS E BUSCA */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por Motorista, Placa, Rota ou código do MD..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors"
            />
          </div>

          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 self-stretch sm:self-auto shrink-0">
            {["TODOS", "PENDENTE", "ENVIADO"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFiltro(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  statusFiltro === st
                    ? "bg-slate-800 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {st === "TODOS" ? "Todos" : st === "PENDENTE" ? "⏳ Pendentes" : "✅ Enviados"}
              </button>
            ))}
          </div>
        </div>

        {/* LISTAGEM DOS CARDS DE MOTORISTAS */}
        {loadingMotoristas ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
            <span className="text-xs">Carregando motoristas e VTAGs da carteira...</span>
          </div>
        ) : motoristas.length === 0 ? (
          <div className="p-12 text-center bg-[#131926]/50 rounded-2xl border border-slate-800 text-slate-400 space-y-2">
            <Truck className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-sm font-semibold text-white">Nenhum motorista encontrado com os filtros selecionados</p>
            <p className="text-xs text-slate-500">Tente selecionar outro suporte ou limpar os termos de busca.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {motoristas.map((m) => {
              const enviado = m.status_envio === "ENVIADO";

              return (
                <div
                  key={m.motorista + m.placa}
                  className={`rounded-2xl p-4.5 border transition-all flex flex-col justify-between space-y-3.5 shadow-xl ${
                    enviado
                      ? "bg-[#0E1724]/90 border-emerald-500/35 shadow-emerald-950/10"
                      : "bg-[#131926]/90 border-slate-800 hover:border-slate-700 shadow-slate-950/30"
                  }`}
                >
                  {/* Topo do Card */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-extrabold text-white leading-snug flex items-center gap-1.5">
                          <User className="w-4 h-4 text-cyan-400 shrink-0" />
                          <span>{m.motorista}</span>
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px] font-bold">
                            {m.rota || "Sem Rota"}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono text-[11px] font-bold border border-cyan-500/30">
                            {m.placa || "Placa N/A"}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider shrink-0 ${
                          enviado
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        }`}
                      >
                        {enviado ? "✅ ENVIADO" : "⏳ PENDENTE"}
                      </span>
                    </div>

                    {/* Detalhes de Contato e Suporte */}
                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-1.5 text-slate-300 font-mono">
                        <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{m.contato || "Sem WhatsApp"}</span>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-400 bg-slate-900 px-2 py-0.5 rounded">
                        Suporte: {m.suporte}
                      </span>
                    </div>

                    {/* MiniDrops Atribuídos */}
                    <div className="mt-3 space-y-1.5">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                        MiniDrops Atribuídos ({m.mds.length}):
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {m.mds.map((md) => {
                          const hasVtag = md.vtags.length > 0;
                          return (
                            <div
                              key={md.md_codigo}
                              className={`p-1.5 rounded-lg border text-[11px] font-mono flex items-center gap-1.5 ${
                                hasVtag
                                  ? "bg-cyan-950/30 border-cyan-500/30 text-cyan-200"
                                  : "bg-slate-900 border-slate-800 text-slate-400"
                              }`}
                            >
                              <span className="font-bold">{md.md_codigo}</span>
                              {hasVtag ? (
                                <button
                                  onClick={() => {
                                    const v = md.vtags[0];
                                    if (v.imagem_url) {
                                      setModalZoomVtag({
                                        vtag: v.tag_number,
                                        md: md.md_codigo,
                                        imagemUrl: `${API_BASE}${v.imagem_url}`
                                      });
                                    }
                                  }}
                                  className="px-1 rounded bg-cyan-500/20 text-[9px] text-cyan-300 hover:underline cursor-pointer"
                                  title="Ver imagem do código de barras"
                                >
                                  {md.vtags.map((v) => v.tag_number).join(", ")}
                                </button>
                              ) : (
                                <span className="text-[9px] text-slate-500 italic">sem vtag</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Rodapé / Botão de Disparo WhatsApp */}
                  <div className="pt-3 border-t border-slate-800">
                    <button
                      onClick={() => handleEnviarWhatsApp(m)}
                      disabled={!m.telefone_wpp}
                      className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        enviado
                          ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40"
                      }`}
                    >
                      <Send className="w-4 h-4 shrink-0" />
                      <span>{enviado ? "Reenviar no WhatsApp" : "Enviar VTAGs no WhatsApp"}</span>
                    </button>

                    {enviado && m.enviado_por && (
                      <span className="text-[10px] text-slate-500 text-center block mt-1.5">
                        Enviado por {m.enviado_por} {m.enviado_em ? `às ${m.enviado_em}` : ""}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* MODAL DE ZOOM DA IMAGEM DA VTAG */}
        {modalZoomVtag && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0F1522] border border-cyan-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Tag className="w-4 h-4 text-cyan-400" />
                    VTAG: {modalZoomVtag.vtag}
                  </h3>
                  <span className="text-xs text-slate-400">Ponto: {modalZoomVtag.md}</span>
                </div>
                <button
                  onClick={() => setModalZoomVtag(null)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Imagem em Alta Resolução */}
              <div className="bg-white rounded-xl p-4 flex items-center justify-center">
                <img
                  src={modalZoomVtag.imagemUrl}
                  alt={`VTAG ${modalZoomVtag.vtag}`}
                  className="max-h-72 object-contain"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <a
                  href={modalZoomVtag.imagemUrl}
                  download={`VTAG_${modalZoomVtag.md}_${modalZoomVtag.vtag}.png`}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Baixar Imagem
                </a>
                <button
                  onClick={() => setModalZoomVtag(null)}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL DE ATUALIZAÇÃO DO TOKEN DA ANJUN */}
        {modalTokenOpen && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0F1522] border border-amber-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Sessão da Plataforma Anjun</h3>
                    <p className="text-xs text-slate-400">Renovação manual de token JWT de acesso</p>
                  </div>
                </div>
                <button
                  onClick={() => setModalTokenOpen(false)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Informações Atuais */}
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-1 text-xs font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Status Atual:</span>
                  <span className={statusData?.token_status?.valido ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                    {statusData?.token_status?.valido ? "VÁLIDO" : "EXPIRADO"}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Dias Restantes:</span>
                  <span className="text-white font-bold">{statusData?.token_status?.dias_restantes || 0} dias</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Expira em:</span>
                  <span className="text-white">{statusData?.token_status?.expira_em || "N/A"}</span>
                </div>
              </div>

              <form onSubmit={handleSalvarToken} className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Cole o novo Token JWT da Anjun abaixo:
                  </label>
                  <textarea
                    rows={4}
                    value={novoToken}
                    onChange={(e) => setNovoToken(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Para pegar o token novo: abra o sistema da Anjun no navegador, abra o F12 ➔ Rede ➔ qualquer requisição ➔ copie o valor do cabeçalho "token".
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalTokenOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={salvandoToken || !novoToken.trim()}
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {salvandoToken ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <SaveIcon className="w-3.5 h-3.5" />}
                    Salvar e Ativar Sessão
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
    </div>
  );
}

function SaveIcon(props: any) {
  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
