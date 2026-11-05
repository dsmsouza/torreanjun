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
  PackageCheck,
  Building2,
  ShoppingBag
} from "lucide-react";

interface VtagItem {
  tag_number: string;
  imagem_url: string | null;
  pdf_url?: string | null;
}

interface PontoItem {
  ponto_nome: string;
  canal: string;
  endereco: string;
  quantidade: number;
  vtags: VtagItem[];
}

interface MotoristaPickupItem {
  motorista: string;
  placa: string;
  rota: string;
  contato: string;
  telefone_wpp: string;
  canal: string;
  pontos: PontoItem[];
  total_vtags: number;
  card_imagem_url?: string;
  status_envio: "PENDENTE" | "ENVIADO";
  enviado_por?: string | null;
  enviado_em?: string | null;
}

interface PickupStatusResponse {
  possui_planilha: boolean;
  arquivo: string | null;
  dia_base: string | null;
  token_status: {
    valido: boolean;
    dias_restantes: number;
    expira_em?: string;
  };
  site_id_oficial: number;
  site_nome_oficial: string;
  total_pontos_planilha: number;
  total_motoristas_planilha: number;
  canais_disponiveis: string[];
  por_canal: Record<string, number>;
  estatisticas_banco: {
    total_pontos_com_vtag: number;
    total_enviados: number;
    total_vtags_geradas: number;
  };
  mensagem?: string;
}

const API_BASE = typeof window !== "undefined" ? "" : (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000");

async function copiarCardParaClipboard(cardUrl: string): Promise<boolean> {
  try {
    const res = await fetch(cardUrl);
    if (!res.ok) return false;
    const blob = await res.blob();
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return true;
    }
  } catch (err) {
    console.warn("Clipboard API bloqueada ou indisponível:", err);
  }
  return false;
}

export default function VtagPickupPage() {
  const { user, nome, isMaster, isLider, podeGerarVtag } = useAuth();

  const [statusData, setStatusData] = useState<PickupStatusResponse | null>(null);
  const [motoristas, setMotoristas] = useState<MotoristaPickupItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMotoristas, setLoadingMotoristas] = useState<boolean>(false);
  const [gerandoVtags, setGerandoVtags] = useState<boolean>(false);
  const [gerandoMotoristaNome, setGerandoMotoristaNome] = useState<string | null>(null);
  const [erroMsg, setErroMsg] = useState<string | null>(null);
  const [sucessoMsg, setSucessoMsg] = useState<string | null>(null);

  // Filtros
  const [canalFiltro, setCanalFiltro] = useState<string>("TODOS");
  const [search, setSearch] = useState<string>("");
  const [statusFiltro, setStatusFiltro] = useState<string>("TODOS");
  const [destinoWpp, setDestinoWpp] = useState<"web" | "app">("web");

  // Modais
  const [modalPontoOpen, setModalPontoOpen] = useState<boolean>(false);
  const [pontoInput, setPontoInput] = useState<string>("");
  const [forcarPonto, setForcarPonto] = useState<boolean>(false);
  const [gerandoPonto, setGerandoPonto] = useState<boolean>(false);

  const [modalZoomVtag, setModalZoomVtag] = useState<{
    vtag: string;
    ponto: string;
    imagemUrl: string;
  } | null>(null);

  const [relatorioGeracao, setRelatorioGeracao] = useState<{
    aberto: boolean;
    alvo: string;
    pontosSolicitados: number;
    pontosGerados: number;
    vtagsSalvas: number;
    totalFalhas: number;
    falhas: Array<{
      ponto: string;
      canal: string;
      motorista: string;
      motivo: string;
    }>;
  } | null>(null);

  // 1. Carrega status inicial
  const carregarStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/vtags-pickup/status`);
      const data: PickupStatusResponse = await res.json();
      setStatusData(data);
    } catch (err: any) {
      console.error("Erro ao carregar status de VTAGs de Pickup:", err);
      setErroMsg("Não foi possível conectar ao servidor backend de Pickups.");
    } finally {
      setLoading(false);
    }
  };

  // 2. Carrega lista de motoristas agrupados
  const carregarMotoristas = async (isBackground: boolean = false) => {
    try {
      if (!isBackground) setLoadingMotoristas(true);
      const p = new URLSearchParams();
      if (canalFiltro && canalFiltro !== "TODOS") p.append("canal", canalFiltro);
      if (search) p.append("search", search);
      if (statusFiltro && statusFiltro !== "TODOS") p.append("status_filtro", statusFiltro);

      const res = await fetch(`${API_BASE}/api/vtags-pickup/motoristas?${p.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMotoristas(data.motoristas || []);
      }
    } catch (err) {
      console.warn("Aviso ao carregar motoristas de pickup:", err);
    } finally {
      if (!isBackground) setLoadingMotoristas(false);
    }
  };

  useEffect(() => {
    carregarStatus();
  }, []);

  useEffect(() => {
    if (statusData?.possui_planilha) {
      carregarMotoristas();
    }
  }, [canalFiltro, search, statusFiltro, statusData?.possui_planilha]);

  // Polling automático a cada 12 segundos
  useEffect(() => {
    const timer = setInterval(() => {
      if (statusData?.possui_planilha) {
        carregarMotoristas(true);
      }
    }, 12000);
    return () => clearInterval(timer);
  }, [canalFiltro, search, statusFiltro, statusData?.possui_planilha]);

  // Ação robusta para copiar imagem do motorista
  const handleAcaoCopiarImagem = async (m: MotoristaPickupItem) => {
    const diaRef = statusData?.dia_base || new Date().toLocaleDateString("pt-BR");
    const cardUrl = m.card_imagem_url || `/api/vtags-pickup/card-motorista?dia_base=${encodeURIComponent(diaRef)}&motorista=${encodeURIComponent(m.motorista)}`;

    const copiou = await copiarCardParaClipboard(cardUrl);
    if (copiou) {
      setSucessoMsg(`📸 Código de barras de ${m.motorista} copiado! Basta dar Ctrl + V no WhatsApp.`);
      setTimeout(() => setSucessoMsg(null), 5000);
      return;
    }

    try {
      const res = await fetch(cardUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `VTAG_PICKUP_${m.motorista.replace(/\s+/g, '_')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setModalZoomVtag({
        vtag: `VTAGs Pickup de ${m.motorista}`,
        ponto: m.pontos.map(i => i.ponto_nome).join(", "),
        imagemUrl: blobUrl
      });

      setSucessoMsg(`📥 Imagem salva em Downloads! Você pode colar no WhatsApp ou arrastar.`);
      setTimeout(() => setSucessoMsg(null), 6000);
    } catch (e) {
      setErroMsg("Não foi possível carregar a imagem. Verifique se as VTAGs foram geradas na Anjun.");
    }
  };

  // Disparo WhatsApp do Motorista de Pickup
  const handleEnviarWhatsApp = async (m: MotoristaPickupItem) => {
    if (m.status_envio === "ENVIADO") {
      const resp = window.confirm(
        `ATENÇÃO: As VTAGs de ${m.motorista} já foram encaminhadas por ${m.enviado_por || "outro operador"} às ${m.enviado_em || ""}.\n\nDeseja reenviar no WhatsApp?`
      );
      if (!resp) return;
    }

    const totalPontos = m.pontos.length;
    const pontosPendentes = m.pontos.filter((p) => p.vtags.length === 0);

    if (pontosPendentes.length > 0) {
      const listaPendentes = pontosPendentes.map((i) => `  • [${i.canal}] ${i.ponto_nome}`).join("\n");
      const confirma = window.confirm(
        `⚠️ ATENÇÃO: O motorista ${m.motorista} possui ${totalPontos} coletas na rota, mas ${pontosPendentes.length} ainda NÃO possuem VTAGs geradas:\n\n${listaPendentes}\n\nDeseja enviar assim mesmo para o WhatsApp com os pontos liberados?`
      );
      if (!confirma) return;
    }

    const nomeOperador = nome || user || "Torre de Controle";
    const diaRef = statusData?.dia_base || new Date().toLocaleDateString("pt-BR");
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const linkPainelMotorista = `${origin}/vtag-pickup/motorista?dia=${encodeURIComponent(diaRef)}&motorista=${encodeURIComponent(m.motorista)}`;

    let texto = `*TORRE DE CONTROLE ANJUN EXPRESS* 🚛\n`;
    texto += `Bom dia, *${m.motorista}*! Seguem suas VTAGs liberadas para coleta de hoje (${diaRef}):\n\n`;
    texto += `📍 *Canal / Rota:* ${m.canal} - ${m.rota || "Padrão"}\n`;
    texto += `🚐 *Placa:* ${m.placa || "N/A"}\n`;
    texto += `👤 *Operador Responsável:* ${nomeOperador}\n\n`;
    texto += `📦 *Pontos de Coleta da sua rota (${totalPontos} no total):* \n`;

    m.pontos.forEach((p) => {
      if (p.vtags.length > 0) {
        const vtagsStr = p.vtags.map((v) => v.tag_number).join(" e ");
        texto += `  • *[${p.canal}] ${p.ponto_nome}* (VTAG: ${vtagsStr})\n`;
      } else {
        texto += `  • *[${p.canal}] ${p.ponto_nome}* ⏳ _(Aguardando liberação / Em processamento)_\n`;
      }
    });

    texto += `\n📲 *Visualização Digital em Alta Resolução (Tela Cheia):*\n`;
    texto += `Abra no seu celular para biper cada ponto com zoom máximo:\n`;
    texto += `👉 ${linkPainelMotorista}\n`;

    const pontosLiberados = m.pontos.filter((p) => p.vtags.length > 0);
    if (pontosLiberados.length > 0) {
      texto += `\n🔗 *Links Diretos de Cada Código de Barras (Separados):*\n`;
      pontosLiberados.forEach((p) => {
        texto += `📍 *${p.ponto_nome}:*\n`;
        p.vtags.forEach((v) => {
          if (v.imagem_url) {
            texto += `  • VTAG (${v.tag_number}): ${origin}${v.imagem_url}\n`;
          }
        });
      });
    }

    texto += `\n⚠️ _Por favor, apresente o código de barras no momento do bipe na coleta. Bom trabalho e boa rota!_`;

    const telLimpo = m.telefone_wpp.replace(/\D/g, "");
    const cardUrl = m.card_imagem_url || `/api/vtags-pickup/card-motorista?dia_base=${encodeURIComponent(diaRef)}&motorista=${encodeURIComponent(m.motorista)}`;
    let copiouImagem = false;
    try {
      copiouImagem = await copiarCardParaClipboard(cardUrl);
    } catch (e) {
      console.warn("Aviso clipboard:", e);
    }

    if (destinoWpp === "app") {
      window.location.href = `whatsapp://send?phone=${telLimpo}&text=${encodeURIComponent(texto)}`;
    } else {
      const urlWpp = `https://web.whatsapp.com/send?phone=${telLimpo}&text=${encodeURIComponent(texto)}`;
      window.open(urlWpp, "whatsapp_web_window");
    }

    try {
      const agoraStr = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      await fetch(`${API_BASE}/api/vtags-pickup/marcar-enviado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dia_base: diaRef,
          motorista: m.motorista,
          canal: m.canal,
          placa: m.placa,
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
      console.warn("Erro ao marcar como enviado:", err);
    }
  };

  // Geração em Lote por Canal
  const handleGerarLoteCanal = async () => {
    if (!podeGerarVtag) {
      alert("Acesso restrito: Apenas Diego ou Ellen têm permissão para gerar VTAGs oficiais.");
      return;
    }

    const canalNome = canalFiltro === "TODOS" ? "Todos os Canais (C&A, Pickup, TikTok, Temu)" : `Canal ${canalFiltro}`;
    if (!confirm(`Deseja gerar 1 VTAG oficial (SP-Z-H001) na Anjun para os pontos de: ${canalNome}?`)) {
      return;
    }

    setGerandoVtags(true);
    setErroMsg(null);
    setSucessoMsg(null);

    try {
      const p = new URLSearchParams();
      if (canalFiltro !== "TODOS") p.append("canal", canalFiltro);
      p.append("usuario", user || "diego");

      const res = await fetch(`${API_BASE}/api/vtags-pickup/gerar-vtags-anjun?${p.toString()}`, {
        method: "POST"
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erro ao gerar VTAGs de Pickup na Anjun.");

      if (data.total_falhas > 0) {
        setRelatorioGeracao({
          aberto: true,
          alvo: canalNome,
          pontosSolicitados: data.pontos_solicitados || 0,
          pontosGerados: data.pontos_gerados_nesta_execucao || 0,
          vtagsSalvas: data.vtags_salvas || 0,
          totalFalhas: data.total_falhas,
          falhas: data.falhas || []
        });
        setSucessoMsg(`Geração finalizada com alertas: ${data.pontos_gerados_nesta_execucao} gerados e ${data.total_falhas} pendências.`);
      } else {
        setSucessoMsg(`Sucesso! ${data.pontos_gerados_nesta_execucao} pontos processados e ${data.vtags_salvas} VTAGs de Pickup criadas no SP-Z-H001.`);
      }

      await carregarStatus();
      await carregarMotoristas();
    } catch (err: any) {
      setErroMsg(err.message || "Falha na chamada com a API Anjun.");
    } finally {
      setGerandoVtags(false);
    }
  };

  // Geração de Todas as VTAGs de um Motorista de Pickup
  const handleGerarMotorista = async (motoristaNome: string, forcar: boolean = false) => {
    if (!podeGerarVtag) {
      alert("Acesso restrito: Apenas Diego ou Ellen têm permissão para gerar VTAGs oficiais.");
      return;
    }

    if (!confirm(`Deseja gerar as VTAGs oficiais para todos os pontos da rota de ${motoristaNome}?`)) {
      return;
    }

    setGerandoMotoristaNome(motoristaNome);
    setErroMsg(null);
    setSucessoMsg(null);

    try {
      const p = new URLSearchParams();
      p.append("motorista", motoristaNome);
      p.append("usuario", user || "diego");
      if (forcar) p.append("forcar", "true");

      const res = await fetch(`${API_BASE}/api/vtags-pickup/gerar-vtags-anjun?${p.toString()}`, {
        method: "POST"
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erro ao gerar VTAGs para o motorista.");

      if (data.total_falhas > 0) {
        setRelatorioGeracao({
          aberto: true,
          alvo: `Motorista ${motoristaNome}`,
          pontosSolicitados: data.pontos_solicitados || 0,
          pontosGerados: data.pontos_gerados_nesta_execucao || 0,
          vtagsSalvas: data.vtags_salvas || 0,
          totalFalhas: data.total_falhas,
          falhas: data.falhas || []
        });
      } else {
        setSucessoMsg(`Sucesso! ${data.pontos_gerados_nesta_execucao} pontos gerados para ${motoristaNome}.`);
      }

      await carregarStatus();
      await carregarMotoristas();
    } catch (err: any) {
      setErroMsg(err.message || "Falha na chamada com a API Anjun.");
    } finally {
      setGerandoMotoristaNome(null);
    }
  };

  // Geração para Ponto Específico
  const handleGerarPontoEspecifico = async (pontoEscolhido?: string, forcarEscolhido?: boolean) => {
    if (!podeGerarVtag) {
      alert("Acesso restrito: Apenas Diego ou Ellen têm permissão para gerar VTAGs oficiais.");
      return;
    }

    const targetPonto = (pontoEscolhido || pontoInput).trim();
    if (!targetPonto) {
      alert("Por favor, selecione ou digite o nome do Seller ou Loja.");
      return;
    }

    setGerandoPonto(true);
    setErroMsg(null);
    setSucessoMsg(null);

    try {
      const p = new URLSearchParams();
      p.append("ponto_nome", targetPonto);
      p.append("usuario", user || "diego");
      if (forcarEscolhido || forcarPonto) p.append("forcar", "true");

      const res = await fetch(`${API_BASE}/api/vtags-pickup/gerar-vtags-anjun?${p.toString()}`, {
        method: "POST"
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erro ao gerar VTAG oficial para o ponto.");

      setSucessoMsg(`VTAG gerada com sucesso para ${targetPonto}!`);
      setModalPontoOpen(false);
      setPontoInput("");
      await carregarStatus();
      await carregarMotoristas();
    } catch (err: any) {
      setErroMsg(err.message || "Falha na chamada com a API Anjun.");
    } finally {
      setGerandoPonto(false);
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
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">
                  VTAGs Pickups & Sellers (FM)
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                  {statusData?.dia_base || "Hoje"}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
                  Estação: SP-Z-H001 (1 VTAG)
                </span>
                {isMaster ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <Shield className="w-3 h-3 text-amber-400" />
                    Diego (Master)
                  </span>
                ) : isLider ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                    <Shield className="w-3 h-3 text-cyan-400" />
                    Ellen (Líder)
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Emissão Oficial para Lojas C&A, Coletas Pickup, Sellers TikTok e Sellers Temu (1 VTAG por Ponto).
              </p>
            </div>
          </div>
        </div>

        {/* Indicador de Sessão Anjun + Ações */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status Token */}
          <div
            className={`p-2.5 px-3 rounded-xl border flex items-center gap-2.5 transition-all ${
              statusData?.token_status?.valido
                ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                : "bg-rose-950/30 border-rose-500/40 text-rose-300 animate-pulse"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                statusData?.token_status?.valido ? "bg-emerald-400 animate-ping" : "bg-rose-500"
              }`}
            />
            <div className="text-[11px] font-mono">
              {statusData?.token_status?.valido ? (
                <span>
                  Sessão Anjun: <strong>{statusData.token_status.dias_restantes} dias</strong>
                </span>
              ) : (
                <span className="font-bold">⚠️ Sessão Expirada</span>
              )}
            </div>
            <Key className="w-3.5 h-3.5 opacity-70" />
          </div>

          {/* Botões de Ação na Anjun */}
          {podeGerarVtag ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleGerarLoteCanal}
                disabled={gerandoVtags || gerandoPonto || !statusData?.token_status?.valido}
                className={`px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-lg ${
                  gerandoVtags
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                    : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-950/40"
                }`}
                title="Gera 1 VTAG oficial para todos os pontos do canal selecionado"
              >
                {gerandoVtags ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gerando Pickups...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Gerar VTAGs ({canalFiltro})
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  setPontoInput("");
                  setModalPontoOpen(true);
                }}
                disabled={gerandoVtags || gerandoPonto || !statusData?.token_status?.valido}
                className="px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer bg-slate-900 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 shadow-lg hover:bg-cyan-950/30"
                title="Gerar VTAG oficial para um Seller ou Loja específico"
              >
                <Target className="w-4 h-4 text-cyan-400" />
                <span>Gerar Ponto Específico</span>
              </button>
            </div>
          ) : (
            <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs font-medium">
              Geração restrita a Ellen e Diego
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
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
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
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            {erroMsg}
          </span>
          <button onClick={() => setErroMsg(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cartões de Indicadores Gerais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-[#0F1420] border border-slate-800/80">
          <span className="text-[11px] text-slate-400 font-medium block">Total de Pontos (Sellers)</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-white">{statusData?.total_pontos_planilha || 0}</span>
            <span className="text-[11px] text-slate-400">válidos hoje</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#0F1420] border border-slate-800/80">
          <span className="text-[11px] text-slate-400 font-medium block">Motoristas de Pickup</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-cyan-400">{totaisCalculados.total}</span>
            <span className="text-[11px] text-cyan-400/80">em rota</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#0F1420] border border-slate-800/80">
          <span className="text-[11px] text-slate-400 font-medium block">VTAGs Emitidas</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-emerald-400">
              {statusData?.estatisticas_banco?.total_vtags_geradas || 0}
            </span>
            <span className="text-[11px] text-emerald-400/80">oficiais Anjun</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#0F1420] border border-slate-800/80">
          <span className="text-[11px] text-slate-400 font-medium block">Disparos WhatsApp</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-purple-400">{totaisCalculados.enviados}</span>
            <span className="text-[11px] text-purple-400/80">({totaisCalculados.pct}%)</span>
          </div>
        </div>
      </div>

      {/* Abas de Canais (C&A, Pickup, TikTok, Temu) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-800">
        {["TODOS", "C&A", "PICKUP", "TIKTOK", "TEMU"].map((c) => {
          const ativo = canalFiltro === c;
          const count = c === "TODOS" ? statusData?.total_pontos_planilha : statusData?.por_canal[c];
          return (
            <button
              key={c}
              onClick={() => setCanalFiltro(c)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
                ativo
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-950/40"
                  : "bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
              }`}
            >
              <span>{c === "TODOS" ? "Todos os Canais" : c}</span>
              {count !== undefined && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    ativo ? "bg-slate-950 text-cyan-300" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Barra de Filtros e Busca */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#0F1420] p-3 rounded-2xl border border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por Motorista, Seller / Loja, Rota ou Placa..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Envio */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {["TODOS", "PENDENTE", "ENVIADO"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFiltro(st)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  statusFiltro === st
                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Destino WhatsApp */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-bold">
            <button
              onClick={() => setDestinoWpp("web")}
              className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                destinoWpp === "web"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Abre o WhatsApp Web em uma única guia"
            >
              🌐 Web
            </button>
            <button
              onClick={() => setDestinoWpp("app")}
              className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                destinoWpp === "app"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "text-slate-400 hover:text-white"
              }`}
              title="Abre o aplicativo nativo do WhatsApp no computador"
            >
              💻 App
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Motoristas e Pickups */}
      {loadingMotoristas && motoristas.length === 0 ? (
        <div className="p-12 text-center space-y-3">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-medium">Carregando coletas de Pickup...</p>
        </div>
      ) : motoristas.length === 0 ? (
        <div className="p-12 text-center bg-[#0F1420] border border-slate-800 rounded-2xl space-y-2">
          <PackageCheck className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-sm font-bold text-slate-300">Nenhuma coleta encontrada</h3>
          <p className="text-xs text-slate-500">Tente ajustar a busca ou o canal selecionado.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {motoristas.map((m) => {
            const enviado = m.status_envio === "ENVIADO";
            const mdsPendentesCount = m.pontos.filter((i) => i.vtags.length === 0).length;

            return (
              <div
                key={m.motorista}
                className="rounded-2xl bg-[#0F1420] border border-slate-800 hover:border-slate-700 p-4 transition-all flex flex-col justify-between space-y-4 shadow-lg hover:shadow-cyan-950/20"
              >
                <div>
                  {/* Topo do Card */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <h3 className="text-sm font-black text-white leading-tight">
                        {m.motorista}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-mono text-[10px] font-bold border border-indigo-500/30">
                          {m.canal}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 font-mono text-[10px] font-bold border border-slate-800">
                          {m.rota || "Padrão"}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-mono text-[10px] font-bold border border-cyan-500/30">
                          {m.placa || "-"}
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

                  {/* Telefone */}
                  <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-1.5 text-slate-300 font-mono">
                      <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{m.contato || "Sem WhatsApp"}</span>
                    </div>
                    <span className="text-[11px] font-bold text-cyan-400">
                      {m.pontos.length} Ponto(s)
                    </span>
                  </div>

                  {/* Lista de Sellers / Lojas */}
                  <div className="mt-3 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                      Pontos de Coleta ({m.pontos.length}):
                    </span>
                    <div className="space-y-1.5">
                      {m.pontos.map((p, pIdx) => {
                        const hasVtag = p.vtags.length > 0;
                        return (
                          <div
                            key={pIdx}
                            className={`p-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                              hasVtag
                                ? "bg-cyan-950/20 border-cyan-500/30 text-cyan-200"
                                : "bg-slate-950 border-slate-800 text-slate-400"
                            }`}
                          >
                            <div className="truncate flex-1">
                              <span className="font-bold text-white block truncate" title={p.ponto_nome}>
                                {p.ponto_nome}
                              </span>
                              {p.endereco && (
                                <span className="text-[10px] text-slate-400 block truncate" title={p.endereco}>
                                  {p.endereco}
                                </span>
                              )}
                            </div>

                            {hasVtag ? (
                              <button
                                onClick={() => {
                                  const v = p.vtags[0];
                                  if (v?.imagem_url) {
                                    setModalZoomVtag({
                                      vtag: v.tag_number,
                                      ponto: `${p.ponto_nome} (${p.canal})`,
                                      imagemUrl: `${API_BASE}${v.imagem_url}`
                                    });
                                  }
                                }}
                                className="px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/40 text-[10px] text-cyan-300 font-bold font-mono border border-cyan-500/30 shrink-0 cursor-pointer transition-colors"
                                title="Ver código de barras desta VTAG"
                              >
                                {p.vtags[0].tag_number}
                              </button>
                            ) : podeGerarVtag ? (
                              <button
                                onClick={() => handleGerarPontoEspecifico(p.ponto_nome, false)}
                                disabled={gerandoPonto || gerandoVtags}
                                className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-[10px] text-emerald-300 font-bold shrink-0 cursor-pointer transition-colors flex items-center gap-1"
                                title="Gerar VTAG oficial para este ponto"
                              >
                                <Sparkles className="w-2.5 h-2.5" />
                                + Gerar
                              </button>
                            ) : (
                              <span className="text-[9px] text-slate-500 italic shrink-0">sem vtag</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Rodapé e Botões de Ação */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  {/* Botão de Geração por Motorista */}
                  {podeGerarVtag && mdsPendentesCount > 0 && (
                    <button
                      type="button"
                      onClick={() => handleGerarMotorista(m.motorista)}
                      disabled={gerandoVtags || gerandoMotoristaNome === m.motorista}
                      className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600/30 to-teal-600/30 hover:from-emerald-600/40 hover:to-teal-600/40 border border-emerald-500/40 text-[11px] font-bold text-emerald-300 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm hover:border-emerald-400"
                      title="Gera 1 VTAG para cada ponto pendente deste motorista"
                    >
                      {gerandoMotoristaNome === m.motorista ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Gerando Pickups de {m.motorista}...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                          <span>⚡ Gerar VTAGs deste Motorista ({mdsPendentesCount} pendente{mdsPendentesCount > 1 ? 's' : ''})</span>
                        </>
                      )}
                    </button>
                  )}

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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAcaoCopiarImagem(m);
                        }}
                        className="flex-1 py-1.5 px-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-cyan-500/50 text-[11px] font-bold text-slate-300 hover:text-cyan-300 flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        title="Copia a imagem com todas as VTAGs do motorista para Ctrl+V no WhatsApp"
                      >
                        <Copy className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Copiar Imagem (Ctrl+V)</span>
                      </button>

                      <a
                        href={m.card_imagem_url || `/api/vtags-pickup/card-motorista?dia_base=${encodeURIComponent(statusData?.dia_base || "")}&motorista=${encodeURIComponent(m.motorista)}`}
                        download={`VTAG_PICKUP_${m.motorista.replace(/\s+/g, '_')}.png`}
                        className="p-1.5 px-2.5 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        title="Baixar imagem unificada"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Baixar</span>
                      </a>

                      <a
                        href={`/vtag-pickup/motorista?dia=${encodeURIComponent(statusData?.dia_base || "")}&motorista=${encodeURIComponent(m.motorista)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 px-2.5 rounded-lg bg-cyan-950/40 border border-cyan-500/40 hover:border-cyan-400 text-cyan-300 hover:text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-sm transition-all"
                        title="Abrir tela do motorista para celular em nova aba"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Visão Celular</span>
                      </a>
                    </div>
                  )}

                  {/* Botão Enviar WhatsApp */}
                  <button
                    onClick={() => handleEnviarWhatsApp(m)}
                    className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md ${
                      enviado
                        ? "bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-500/30"
                        : "bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-950/30 font-black"
                    }`}
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{enviado ? "Reenviar no WhatsApp" : "Enviar WhatsApp ao Motorista"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL RELATÓRIO DE FALHAS / GERAÇÃO DA ANJUN */}
      {relatorioGeracao?.aberto && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F1522] border border-amber-500/40 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Relatório da Geração na Anjun</h3>
                  <p className="text-xs text-slate-400">
                    Alvo: <strong>{relatorioGeracao.alvo}</strong> (Site SP-Z-H001)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRelatorioGeracao(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 shrink-0">
              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Solicitados</span>
                <span className="text-lg font-black text-white">{relatorioGeracao.pontosSolicitados}</span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
                <span className="text-[10px] text-emerald-400 font-bold uppercase block">Gerados com Sucesso</span>
                <span className="text-lg font-black text-emerald-300">{relatorioGeracao.pontosGerados}</span>
              </div>
              <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30">
                <span className="text-[10px] text-rose-400 font-bold uppercase block">Falhas / Recusas</span>
                <span className="text-lg font-black text-rose-400">{relatorioGeracao.totalFalhas}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {relatorioGeracao.falhas.map((f, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs flex flex-col md:flex-row md:items-center justify-between gap-2"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-cyan-300">{f.ponto}</span>
                      <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                        {f.canal}
                      </span>
                      <span className="text-slate-300">{f.motorista}</span>
                    </div>
                    <p className="text-[11px] text-rose-300">⚠️ {f.motivo}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGerarPontoEspecifico(f.ponto, true)}
                    className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold self-start md:self-auto cursor-pointer"
                  >
                    Tentar Novamente
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setRelatorioGeracao(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl cursor-pointer"
              >
                Entendido / Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GERAR PONTO ESPECÍFICO */}
      {modalPontoOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F1522] border border-cyan-500/40 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <Target className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Gerar VTAG de Ponto Específico</h3>
                  <p className="text-xs text-slate-400">Site Anjun SP-Z-H001 • 1 VTAG</p>
                </div>
              </div>
              <button
                onClick={() => setModalPontoOpen(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Nome do Seller / Loja:
                </label>
                <input
                  type="text"
                  value={pontoInput}
                  onChange={(e) => setPontoInput(e.target.value)}
                  placeholder="Ex: SHOPPING ELDORADO ou Closet da Lingerie"
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={forcarPonto}
                    onChange={(e) => setForcarPonto(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
                  />
                  <span>Forçar re-geração (substitui se já gerada hoje)</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalPontoOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleGerarPontoEspecifico()}
                  disabled={gerandoPonto || !pontoInput.trim()}
                  className="px-5 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-lg shadow-cyan-950/40"
                >
                  {gerandoPonto ? (
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

      {/* MODAL ZOOM VTAG */}
      {modalZoomVtag && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0F1522] border border-cyan-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">{modalZoomVtag.ponto}</h3>
                <p className="text-xs font-mono text-cyan-400">{modalZoomVtag.vtag}</p>
              </div>
              <button
                onClick={() => setModalZoomVtag(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white p-3 rounded-xl flex items-center justify-center">
              <img
                src={modalZoomVtag.imagemUrl}
                alt="VTAG Zoom"
                className="max-h-[60vh] object-contain"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <a
                href={modalZoomVtag.imagemUrl}
                download={`${modalZoomVtag.vtag}.png`}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Baixar PNG</span>
              </a>

              <button
                onClick={() => setModalZoomVtag(null)}
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold rounded-xl cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
