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
  Sparkles,
  Target,
  PlusCircle
} from "lucide-react";

interface VtagItem {
  tag_number: string;
  imagem_url: string | null;
  pdf_url?: string | null;
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
  lista_mds?: string[];
  estatisticas_banco?: {
    mds_com_vtag: number;
    motoristas_com_vtag: number;
    total_enviados: number;
    total_vtags_geradas: number;
  };
  mensagem?: string;
  erro_leitura?: string;
}

const API_BASE = typeof window !== "undefined" ? "" : (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000");

// Função para juntar etiquetas e copiar imagem para a área de transferência (Clipboard)
async function copiarEtiquetasParaClipboard(
  motorista: string,
  mds: MdItem[],
  diaRef: string
): Promise<boolean> {
  try {
    const urls: string[] = [];
    mds.forEach((md) => {
      md.vtags.forEach((v) => {
        if (v.imagem_url) urls.push(v.imagem_url);
      });
    });

    if (urls.length === 0) return false;

    // Se tiver apenas 1 imagem
    if (urls.length === 1) {
      const res = await fetch(urls[0]);
      const blob = await res.blob();
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        return true;
      }
      return false;
    }

    // Se tiver 2 ou mais etiquetas, junta num único card vertical de alta definição
    const loadedImgs = await Promise.all(
      urls.map((url) => {
        return new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = url;
        });
      })
    );

    const canvas = document.createElement("canvas");
    const width = 787;
    const headerHeight = 75;
    const itemHeight = 787;
    const totalHeight = headerHeight + loadedImgs.length * itemHeight;

    canvas.width = width;
    canvas.height = totalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    // Fundo branco perfeito para bipagem
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, totalHeight);

    // Faixa Superior
    ctx.fillStyle = "#0F172A";
    ctx.fillRect(0, 0, width, headerHeight);
    ctx.fillStyle = "#38BDF8";
    ctx.font = "bold 26px sans-serif";
    ctx.fillText("ANJUN EXPRESS - VTAGS DE COLETA", 25, 38);
    ctx.fillStyle = "#E2E8F0";
    ctx.font = "16px sans-serif";
    ctx.fillText(`Motorista: ${motorista}  •  Data: ${diaRef}`, 25, 62);

    let currentY = headerHeight;
    for (const img of loadedImgs) {
      ctx.drawImage(img, 0, currentY, width, itemHeight);
      currentY += itemHeight;
    }

    return new Promise<boolean>((resolve) => {
      canvas.toBlob(async (blob) => {
        if (blob && typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.write) {
          try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            resolve(true);
          } catch (e) {
            console.warn("Erro ao escrever no clipboard:", e);
            resolve(false);
          }
        } else {
          resolve(false);
        }
      }, "image/png");
    });
  } catch (err) {
    console.warn("Falha no copiarEtiquetasParaClipboard:", err);
    return false;
  }
}

export default function VtagPage() {
  const { user, nome, role, isMaster, isLider, isOperador, podeGerarVtag, suportePadrao } = useAuth();

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
  const [destinoWpp, setDestinoWpp] = useState<"web" | "app">("web");

  // Modais
  const [modalTokenOpen, setModalTokenOpen] = useState<boolean>(false);
  const [novoToken, setNovoToken] = useState<string>("");
  const [salvandoToken, setSalvandoToken] = useState<boolean>(false);

  // Modal MD Específico
  const [modalMdOpen, setModalMdOpen] = useState<boolean>(false);
  const [mdEspecificoInput, setMdEspecificoInput] = useState<string>("");
  const [qtdMdEspecifico, setQtdMdEspecifico] = useState<number>(2);
  const [forcarMdEspecifico, setForcarMdEspecifico] = useState<boolean>(false);
  const [gerandoMdEspecifico, setGerandoMdEspecifico] = useState<boolean>(false);

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
    } catch (err: any) {
      console.error("Erro ao carregar status de VTAGs:", err);
      setErroMsg("Não foi possível conectar ao servidor backend da Torre.");
    } finally {
      setLoading(false);
    }
  };

  // Se o usuário logado pertencer a um suporte específico (Ellen, Danilo, etc.), pré-seleciona a aba
  useEffect(() => {
    if (suportePadrao && suportePadrao !== "TODOS") {
      setSuporteFiltro(suportePadrao);
    }
  }, [suportePadrao]);

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

  // Polling automático a cada 10 segundos para manter todos os suportes sincronizados
  useEffect(() => {
    const timer = setInterval(() => {
      if (statusData?.possui_planilha) {
        carregarMotoristas();
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [suporteFiltro, search, statusFiltro, statusData?.possui_planilha]);

  const handleSelecionarSuporte = (sup: string) => {
    setSuporteFiltro(sup);
  };

  // Disparo / Abertura do WhatsApp com trava antiduplicidade
  const handleEnviarWhatsApp = async (m: MotoristaItem) => {
    if (m.status_envio === "ENVIADO") {
      const resp = window.confirm(
        `ATENÇÃO: As VTAGs de ${m.motorista} já foram encaminhadas por ${m.enviado_por || "outro operador"} às ${m.enviado_em || ""}.\n\nDeseja realmente reenviar a mensagem no WhatsApp?`
      );
      if (!resp) return;
    }

    const nomeOperador = nome || user || (suporteFiltro !== "TODOS" ? suporteFiltro : "Torre de Controle");
    const diaRef = statusData?.dia_base || new Date().toLocaleDateString("pt-BR");

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

    // Incluir link do PDF da nuvem Anjun caso exista
    m.mds.forEach((md) => {
      const pdfUrl = md.vtags.find((v) => v.pdf_url)?.pdf_url;
      if (pdfUrl) {
        texto += `\n📲 _Link do Código de Barras (PDF Anjun):_\n${pdfUrl}\n`;
      }
    });

    const telLimpo = m.telefone_wpp.replace(/\D/g, "");

    // 1. Tentar auto-copiar imagem para a área de transferência
    let copiouImagem = false;
    try {
      copiouImagem = await copiarEtiquetasParaClipboard(m.motorista, m.mds, diaRef);
    } catch (e) {
      console.warn("Aviso clipboard:", e);
    }

    // 2. Abrir WhatsApp (reaproveita mesma aba se Web, ou abre app do Windows se Desktop)
    if (destinoWpp === "app") {
      window.location.href = `whatsapp://send?phone=${telLimpo}&text=${encodeURIComponent(texto)}`;
    } else {
      const urlWpp = `https://web.whatsapp.com/send?phone=${telLimpo}&text=${encodeURIComponent(texto)}`;
      window.open(urlWpp, "whatsapp_web_window");
    }

    try {
      const agoraStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      await fetch(`${API_BASE}/api/vtags/marcar-enviado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dia_base: diaRef,
          motorista: m.motorista,
          placa: m.placa,
          suporte: m.suporte,
          enviado_por: nomeOperador
        })
      });

      setMotoristas((prev) =>
        prev.map((item) =>
          item.motorista === m.motorista
            ? {
                ...item,
                status_envio: "ENVIADO",
                enviado_por: nomeOperador,
                enviado_em: agoraStr
              }
            : item
        )
      );

      if (copiouImagem) {
        setSucessoMsg(`📸 Mensagem aberta no WhatsApp e Código de Barras COPIADO! Dê Ctrl + V na conversa de ${m.motorista} para colar a imagem.`);
      } else {
        setSucessoMsg(`Mensagem aberta no WhatsApp para ${m.motorista}!`);
      }
      setTimeout(() => setSucessoMsg(null), 6000);
    } catch (err) {
      console.warn("Erro ao marcar como enviado no backend:", err);
    }
  };

  // Geração de VTAGs na Anjun (estritamente Diego ou Ellen)
  const handleGerarVtagsAnjun = async () => {
    if (!podeGerarVtag) {
      alert("Acesso restrito: Apenas Diego ou Ellen têm permissão para gerar VTAGs oficiais.");
      return;
    }

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
      p.append("usuario", user || "diego");

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

  // Geração para MD Específico (Diego ou Ellen)
  const handleGerarMdEspecifico = async (
    mdEscolhido?: string,
    qtdEscolhida?: number,
    forcarEscolhido?: boolean
  ) => {
    if (!podeGerarVtag) {
      alert("Acesso restrito: Apenas Diego ou Ellen têm permissão para gerar VTAGs oficiais.");
      return;
    }

    const targetMd = (mdEscolhido || mdEspecificoInput).trim().toUpperCase();
    if (!targetMd) {
      alert("Por favor, selecione ou digite o código do MD (ex: MD-HAV-01).");
      return;
    }

    const qtd = qtdEscolhida || qtdMdEspecifico || 2;
    const forcar = forcarEscolhido !== undefined ? forcarEscolhido : forcarMdEspecifico;

    setGerandoMdEspecifico(true);
    setErroMsg(null);
    setSucessoMsg(null);

    try {
      const p = new URLSearchParams();
      p.append("md_codigo", targetMd);
      p.append("qtd_por_md", qtd.toString());
      p.append("usuario", user || "diego");
      if (forcar) p.append("forcar", "true");

      const res = await fetch(`${API_BASE}/api/vtags/gerar-vtags-anjun?${p.toString()}`, {
        method: "POST"
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Erro ao gerar VTAG oficial para o MD.");
      }

      setSucessoMsg(`VTAG(s) gerada(s) com sucesso para o ${targetMd}! (${data.vtags_salvas} etiquetas criadas)`);
      setModalMdOpen(false);
      setMdEspecificoInput("");
      await carregarStatus();
      await carregarMotoristas();
    } catch (err: any) {
      setErroMsg(err.message || "Falha na chamada com a API Anjun.");
    } finally {
      setGerandoMdEspecifico(false);
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
                  {isMaster ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                      <Shield className="w-3 h-3 text-amber-400" />
                      Diego Mandarino (Master)
                    </span>
                  ) : isLider ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                      <Shield className="w-3 h-3 text-cyan-400" />
                      Ellen (Líder da Torre)
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                      <User className="w-3 h-3 text-emerald-400" />
                      Suporte: {nome}
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

            {/* Botões de Geração na Anjun (Apenas Diego e Ellen) */}
            {podeGerarVtag ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGerarVtagsAnjun}
                  disabled={gerandoVtags || gerandoMdEspecifico || !statusData?.token_status?.valido}
                  className={`px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg ${
                    gerandoVtags
                      ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                      : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-950/40"
                  }`}
                  title="Gera 2 VTAGs oficiais para todos os MDs da carteira selecionada"
                >
                  {gerandoVtags ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Gerando em Lote...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Gerar VTAGs (Lote)
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setMdEspecificoInput("");
                    setModalMdOpen(true);
                  }}
                  disabled={gerandoVtags || gerandoMdEspecifico || !statusData?.token_status?.valido}
                  className="px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer bg-slate-900 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 shadow-lg hover:bg-cyan-950/30"
                  title="Gerar ou testar VTAG oficial para um MD específico"
                >
                  <Target className="w-4 h-4 text-cyan-400" />
                  <span>Gerar MD Específico</span>
                </button>
              </div>
            ) : (
              <div className="px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs flex items-center gap-2 font-medium">
                <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Geração oficial travada (Liberada para Ellen e Diego)</span>
              </div>
            )}

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

          {/* Seletor de Destino do WhatsApp (Web vs App) */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 self-stretch sm:self-auto shrink-0">
            <button
              onClick={() => setDestinoWpp("web")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                destinoWpp === "web"
                  ? "bg-slate-800 text-emerald-400 shadow border border-emerald-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Abre o WhatsApp Web na mesma aba (não abre guias repetidas)"
            >
              <span>🌐 Web (Aba Única)</span>
            </button>
            <button
              onClick={() => setDestinoWpp("app")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                destinoWpp === "app"
                  ? "bg-slate-800 text-emerald-400 shadow border border-emerald-500/30"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Abre direto no Aplicativo WhatsApp do Windows (sem abrir navegador)"
            >
              <span>💻 App Windows</span>
            </button>
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
                              ) : podeGerarVtag ? (
                                <button
                                  onClick={() => handleGerarMdEspecifico(md.md_codigo, 2, false)}
                                  disabled={gerandoMdEspecifico || gerandoVtags}
                                  className="px-1.5 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-[9px] text-emerald-300 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  title="Gerar 2 VTAGs oficiais na Anjun para este MD agora"
                                >
                                  <Sparkles className="w-2.5 h-2.5" />
                                  + Gerar
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
                  <div className="pt-3 border-t border-slate-800 space-y-2">
                    {enviado && (
                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center justify-between">
                        <span className="font-semibold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          Encaminhado
                        </span>
                        <span className="font-mono text-[10px] text-emerald-400">
                          por {m.enviado_por || "Suporte"} {m.enviado_em ? `às ${m.enviado_em}` : ""}
                        </span>
                      </div>
                    )}

                    {/* Botões Rápidos de Imagem */}
                    {m.total_vtags > 0 && (
                      <div className="flex items-center gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const diaRef = statusData?.dia_base || new Date().toLocaleDateString("pt-BR");
                            const ok = await copiarEtiquetasParaClipboard(m.motorista, m.mds, diaRef);
                            if (ok) {
                              setSucessoMsg(`📸 Código de barras de ${m.motorista} copiado! Basta dar Ctrl + V no WhatsApp.`);
                              setTimeout(() => setSucessoMsg(null), 5000);
                            } else {
                              alert("Para copiar: clique na VTAG para abrir e selecione 'Copiar Imagem'.");
                            }
                          }}
                          className="flex-1 py-1 px-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-500/50 text-[10px] font-bold text-slate-300 hover:text-cyan-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                          title="Copia o código de barras para o clipboard para você colar no WhatsApp com Ctrl+V"
                        >
                          <Copy className="w-3 h-3 text-cyan-400" />
                          <span>Copiar Imagem (Ctrl+V)</span>
                        </button>

                        {m.mds[0]?.vtags[0]?.imagem_url && (
                          <a
                            href={m.mds[0].vtags[0].imagem_url}
                            download={`VTAG_${m.motorista}_${m.mds[0].md_codigo}.png`}
                            className="p-1 px-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-[10px] flex items-center gap-1 cursor-pointer"
                            title="Baixar imagem do código de barras"
                          >
                            <Download className="w-3 h-3" />
                            <span>Baixar</span>
                          </a>
                        )}
                      </div>
                    )}

                    <button
                      onClick={() => handleEnviarWhatsApp(m)}
                      disabled={!m.telefone_wpp}
                      className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        enviado
                          ? "bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700/80"
                          : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40"
                      }`}
                    >
                      <Send className="w-4 h-4 shrink-0" />
                      <span>{enviado ? "Reenviar no WhatsApp" : "Enviar VTAGs no WhatsApp"}</span>
                    </button>
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

                {/* MODAL DE GERAÇÃO PARA MD ESPECÍFICO */}
        {modalMdOpen && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0F1522] border border-cyan-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Gerar VTAG de MD Específico</h3>
                    <p className="text-xs text-slate-400">Emissão oficial imediata na Anjun para testes ou avulso</p>
                  </div>
                </div>
                <button
                  onClick={() => setModalMdOpen(false)}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Código do MiniDrop (MD):
                  </label>
                  <input
                    type="text"
                    list="mds-sugestoes"
                    value={mdEspecificoInput}
                    onChange={(e) => setMdEspecificoInput(e.target.value.toUpperCase())}
                    placeholder="Ex: MD-HAV-01 ou MD-FRA-01"
                    className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 uppercase"
                  />
                  <datalist id="mds-sugestoes">
                    {(statusData?.lista_mds || []).map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Digite qualquer MD ou escolha um da lista de rotas de hoje.
                  </span>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">
                    Quantidade de VTAGs:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setQtdMdEspecifico(2)}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                        qtdMdEspecifico === 2
                          ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <span>2 VTAGs</span>
                      <span className="text-[10px] font-normal opacity-75">Padrão (2 Ondas)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setQtdMdEspecifico(1)}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                        qtdMdEspecifico === 1
                          ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-300"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <span>1 VTAG</span>
                      <span className="text-[10px] font-normal opacity-75">Teste / Onda Única</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={forcarMdEspecifico}
                      onChange={(e) => setForcarMdEspecifico(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
                    />
                    <span>Forçar re-geração (substitui se já tiver sido gerada hoje)</span>
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalMdOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGerarMdEspecifico()}
                    disabled={gerandoMdEspecifico || !mdEspecificoInput.trim()}
                    className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-lg shadow-cyan-950/40"
                  >
                    {gerandoMdEspecifico ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Gerando na Anjun...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Gerar VTAG Agora
                      </>
                    )}
                  </button>
                </div>
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
