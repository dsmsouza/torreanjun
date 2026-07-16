"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "../../hooks/use-auth";
import { 
  getBackupUrl, 
  restoreDatabase, 
  cleanDatabase, 
  importDatabase, 
  importarCoordenadasCSV,
  fetchGeminiConfig,
  saveGeminiKey
} from "../../lib/api";
import { 
  ShieldAlert, 
  Download, 
  Upload, 
  Trash2, 
  Loader2, 
  AlertOctagon, 
  CheckCircle,
  Database,
  FileSpreadsheet,
  Calendar,
  Layers,
  ArrowRight,
  MapPin,
  Sparkles
} from "lucide-react";

export default function ConfigPage() {
  const { isMaster } = useAuth();
  
  // Backup / Restore / Purge States
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [cleanConfirm, setCleanConfirm] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Ingestion States
  const [dataOperacao, setDataOperacao] = useState<string>(new Date().toISOString().split("T")[0]);
  const [numSemana, setNumSemana] = useState<string>("1");
  const [fileMds, setFileMds] = useState<File | null>(null);
  const [fileOperacional, setFileOperacional] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Coordinates Import States
  const [fileCoordenadas, setFileCoordenadas] = useState<File | null>(null);
  const [coordImporting, setCoordImporting] = useState(false);
  const [coordMessage, setCoordMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Gemini API Key States
  const [geminiKey, setGeminiKey] = useState<string>("");
  const [geminiConfigured, setGeminiConfigured] = useState<boolean>(false);
  const [geminiMaskedKey, setGeminiMaskedKey] = useState<string>("");
  const [geminiLoading, setGeminiLoading] = useState<boolean>(false);
  const [geminiMessage, setGeminiMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    const loadGeminiConfig = async () => {
      try {
        const config = await fetchGeminiConfig();
        setGeminiConfigured(config.configured);
        setGeminiMaskedKey(config.masked_key);
      } catch (err) {
        console.error("Error loading Gemini configuration:", err);
      }
    };
    loadGeminiConfig();
  }, []);

  if (!isMaster) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="max-w-md w-full glass-panel p-8 rounded-2xl border border-destructive/20 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-xl bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-lg font-bold text-white">Acesso Negado</h2>
          <p className="text-sm text-muted-foreground">
            Você não possui credenciais suficientes para acessar as configurações e gerenciar backups. Por favor, contate o administrador Master da Torre.
          </p>
        </div>
      </div>
    );
  }

  // Handle Download Backup
  const handleDownload = () => {
    window.open(getBackupUrl(), "_blank");
  };

  // Handle Upload Database Restore
  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    if (!window.confirm("ATENÇÃO: Restaurar esta base irá substituir permanentemente todos os dados operacionais atuais. Deseja prosseguir?")) {
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      await restoreDatabase(file);
      setMessage({ text: "Base de dados SQLite restaurada com sucesso!", type: "success" });
      setFile(null);
    } catch (err: any) {
      setMessage({ text: err.message || "Falha ao restaurar banco de dados.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Handle Clean Database
  const handleClean = async () => {
    setLoading(true);
    setMessage(null);
    setCleanConfirm(false);
    try {
      await cleanDatabase();
      setMessage({ text: "Todas as tabelas operacionais históricas foram limpas!", type: "success" });
    } catch (err: any) {
      setMessage({ text: err.message || "Erro ao limpar banco de dados.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Handle Spreadsheet Ingestion
  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileMds || !fileOperacional || !dataOperacao || !numSemana) return;

    setImporting(true);
    setImportMessage(null);
    try {
      const res = await importDatabase(dataOperacao, numSemana, fileMds, fileOperacional);
      setImportMessage({ 
        text: res.message || "Ingestão diária concluída com sucesso!", 
        type: "success" 
      });
      setFileMds(null);
      setFileOperacional(null);
    } catch (err: any) {
      setImportMessage({ text: err.message || "Falha ao importar planilhas operacionais.", type: "error" });
    } finally {
      setImporting(false);
    }
  };

  // Handle Coordinates CSV Ingestion
  const handleImportCoordenadas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileCoordenadas) return;

    setCoordImporting(true);
    setCoordMessage(null);
    try {
      const res = await importarCoordenadasCSV(fileCoordenadas);
      setCoordMessage({ 
        text: `Importação de coordenadas concluída! Cadastrados ${res.rows_imported} pontos de malha (MDs) geolocalizados com sucesso.`, 
        type: "success" 
      });
      setFileCoordenadas(null);
    } catch (err: any) {
      setCoordMessage({ text: err.message || "Falha ao importar coordenadas de malha.", type: "error" });
    } finally {
      setCoordImporting(false);
    }
  };

  // Handle Save Gemini Key
  const handleSaveGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!geminiKey) return;

    setGeminiLoading(true);
    setGeminiMessage(null);
    try {
      await saveGeminiKey(geminiKey);
      setGeminiMessage({ text: "Chave de API do Gemini configurada com sucesso!", type: "success" });
      
      const config = await fetchGeminiConfig();
      setGeminiConfigured(config.configured);
      setGeminiMaskedKey(config.masked_key);
      setGeminiKey("");
    } catch (err: any) {
      setGeminiMessage({ text: err.message || "Erro ao salvar chave do Gemini.", type: "error" });
    } finally {
      setGeminiLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex justify-between items-center bg-[#0C101B]/40 p-6 rounded-2xl border border-border">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight font-medium">Configurações & Backups</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Painel Master de administração da Torre: backups, limpezas e importações operacionais.
          </p>
        </div>
        <div className="px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs font-semibold text-amber-400">
          Perfil Master Habilitado
        </div>
      </div>

      {/* Global Status Message */}
      {message && (
        <div className={`p-4 rounded-xl text-sm font-semibold border flex items-center gap-2 ${
          message.type === "success" 
            ? "bg-success/10 text-success border-success/20" 
            : "bg-destructive/10 text-destructive border-destructive/20"
        }`}>
          {message.type === "success" ? <CheckCircle className="w-5 h-5 shrink-0" /> : <ShieldAlert className="w-5 h-5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Admin Panel Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Card 1: Download Backup */}
        <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="text-md font-bold text-white">Exportar Backup (.db)</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Baixe uma cópia compacta em tempo real do banco de dados SQLite (`torre_anjun.db`) contendo todo o histórico acumulado.
            </p>
          </div>
          <button
            onClick={handleDownload}
            disabled={loading || importing}
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-primary hover:bg-blue-600 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Baixar Backup Completo</span>
          </button>
        </div>

        {/* Card 2: Restore Database */}
        <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Upload className="w-5 h-5" />
            </div>
            <h3 className="text-md font-bold text-white">Restaurar Banco de Dados</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Faça o upload de um arquivo `.db` de backup para restaurar a Torre de Controle a um estado anterior.
            </p>
          </div>
          <form onSubmit={handleRestore} className="space-y-3">
            <input
              id="db-restore-file"
              type="file"
              accept=".db"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-semibold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 cursor-pointer"
              required
            />
            <button
              type="submit"
              disabled={loading || !file || importing}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-amber-500 hover:bg-amber-600 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>Restaurar Base (.db)</span>
            </button>
          </form>
        </div>

        {/* Card 3: Purge Database */}
        <div className="glass-panel p-6 rounded-2xl border border-border flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive">
              <Trash2 className="w-5 h-5" />
            </div>
            <h3 className="text-md font-bold text-white">Limpeza das Tabelas Históricas</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Exclua permanentemente os registros de todas as tabelas operacionais (Volumes, Backlogs, Justificativas, Ocorrências e Penalidades).
            </p>
          </div>
          
          {cleanConfirm ? (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl space-y-2">
              <p className="text-[10px] font-bold text-destructive flex items-center gap-1">
                <AlertOctagon className="w-3.5 h-3.5 shrink-0" />
                <span>CONFIRMAÇÃO EXTREMA E IRREVOGÁVEL</span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleClean}
                  disabled={loading}
                  className="flex-1 py-1.5 bg-destructive hover:bg-destructive-hover text-[10px] font-bold text-white rounded-lg transition-all cursor-pointer"
                >
                  Confirmar Exclusão
                </button>
                <button
                  onClick={() => setCleanConfirm(false)}
                  disabled={loading}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 rounded-lg transition-all cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCleanConfirm(true)}
              disabled={loading || importing}
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 rounded-xl text-xs font-semibold text-destructive transition-all disabled:opacity-50 cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
              <span>Limpar Tabelas Históricas</span>
            </button>
          )}
        </div>

      </div>

      {/* Card 4: Excel Ingestion Panel */}
      <div className="glass-panel p-6 rounded-2xl border border-border space-y-6">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <FileSpreadsheet className="w-6 h-6 text-blue-400" />
          <div>
            <h2 className="text-lg font-semibold text-white">Importar Planilhas Operacionais (Ingestão de Dados)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Faça a carga dos arquivos diários de pontos de coleta e dados de status para alimentar os gráficos e dashboards.
            </p>
          </div>
        </div>

        {importMessage && (
          <div className={`p-4 rounded-xl text-sm font-semibold border flex items-center gap-2 ${
            importMessage.type === "success" 
              ? "bg-success/10 text-success border-success/20" 
              : "bg-destructive/10 text-destructive border-destructive/20"
          }`}>
            {importMessage.type === "success" ? <CheckCircle className="w-5 h-5 shrink-0" /> : <ShieldAlert className="w-5 h-5 shrink-0" />}
            <span>{importMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleImport} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Metadata Parameters */}
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                <span>Data da Operação:</span>
              </label>
              <input
                type="date"
                value={dataOperacao}
                onChange={(e) => setDataOperacao(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono"
                required
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span>Número da Semana Operacional:</span>
              </label>
              <input
                type="number"
                min="1"
                max="53"
                value={numSemana}
                onChange={(e) => setNumSemana(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono"
                required
              />
            </div>
          </div>

          {/* Files Input & Action */}
          <div className="space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  1. Cadastro de Pontos de Coleta (MDS):
                </label>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => setFileMds(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-semibold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 cursor-pointer"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  2. Planilha Operacional Diária (Status):
                </label>
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => setFileOperacional(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-semibold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 cursor-pointer"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={importing || loading || !fileMds || !fileOperacional}
              className="flex items-center justify-center gap-2 w-full py-3 bg-primary hover:bg-blue-600 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 cursor-pointer"
            >
              {importing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processando Planilhas (Paciência, base pesada)...</span>
                </>
              ) : (
                <>
                  <span>Iniciar Ingestão no Banco de Dados</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

        </form>
      </div>

      {/* Card 5: Coordinates Geolocation Import (Full-Width Row) */}
      <div className="glass-panel p-6 rounded-2xl border border-border space-y-6">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <MapPin className="w-6 h-6 text-emerald-400" />
          <div>
            <h2 className="text-lg font-semibold text-white">Importar Coordenadas da Malha (CSV ou Excel)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Suba a planilha CSV ou Excel contendo CEPs, coordenadas (Latitude/Longitude), horários de funcionamento e histogramas de bipagem dos pontos de coleta (MDs) da ANJUN.
            </p>
          </div>
        </div>

        {coordMessage && (
          <div className={`p-4 rounded-xl text-sm font-semibold border flex items-center gap-2 ${
            coordMessage.type === "success" 
              ? "bg-success/10 text-success border-success/20" 
              : "bg-destructive/10 text-destructive border-destructive/20"
          }`}>
            {coordMessage.type === "success" ? <CheckCircle className="w-5 h-5 shrink-0" /> : <ShieldAlert className="w-5 h-5 shrink-0" />}
            <span>{coordMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleImportCoordenadas} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <p className="text-xs text-slate-400 leading-relaxed">
              O arquivo CSV deve conter pelo menos as colunas: 
              <code className="text-emerald-400 mx-1 bg-[#0C101B] px-1.5 py-0.5 rounded font-mono font-semibold">WKT</code>, 
              <code className="text-emerald-400 mx-1 bg-[#0C101B] px-1.5 py-0.5 rounded font-mono font-semibold">Nome do Ponto de Coleta</code>, 
              <code className="text-emerald-400 mx-1 bg-[#0C101B] px-1.5 py-0.5 rounded font-mono font-semibold">CEP</code> e 
              <code className="text-emerald-400 mx-1 bg-[#0C101B] px-1.5 py-0.5 rounded font-mono font-semibold">Endereco</code>.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Se as colunas dedicadas de latitude/longitude estiverem vazias, o importador extrairá as coordenadas automaticamente da coluna espacial <code className="text-emerald-400 bg-[#0C101B] px-1.5 py-0.5 rounded font-mono font-semibold">WKT</code>.
            </p>
          </div>

          <div className="space-y-4 flex flex-col justify-end">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Selecione o arquivo CSV ou Excel (.xlsx) de coordenadas:
              </label>
              <input
                type="file"
                accept=".csv, .xlsx, .xls"
                onChange={(e) => setFileCoordenadas(e.target.files?.[0] || null)}
                className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-semibold file:bg-slate-800 file:text-slate-300 hover:file:bg-slate-700 cursor-pointer"
                required
              />
            </div>

            <button
              type="submit"
              disabled={coordImporting || loading || !fileCoordenadas || importing}
              className="flex items-center justify-center gap-2 w-full py-3 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 cursor-pointer"
            >
              {coordImporting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Importando Coordenadas de Malha...</span>
                </>
              ) : (
                <>
                  <span>Importar Planilha de Coordenadas (.csv)</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Card 6: Gemini API Key Config */}
      <div className="glass-panel p-6 rounded-2xl border border-border space-y-6">
        <div className="flex items-center gap-3 border-b border-border pb-3">
          <Sparkles className="w-6 h-6 text-purple-400" />
          <div>
            <h2 className="text-lg font-semibold text-white">Chave de API do Google Gemini (Copiloto IA)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Insira a chave de API do Gemini para habilitar a geração de relatórios executivos avançados por IA.
            </p>
          </div>
        </div>

        {geminiMessage && (
          <div className={`p-4 rounded-xl text-sm font-semibold border flex items-center gap-2 ${
            geminiMessage.type === "success" 
              ? "bg-success/10 text-success border-success/20" 
              : "bg-destructive/10 text-destructive border-destructive/20"
          }`}>
            {geminiMessage.type === "success" ? <CheckCircle className="w-5 h-5 shrink-0" /> : <ShieldAlert className="w-5 h-5 shrink-0" />}
            <span>{geminiMessage.text}</span>
          </div>
        )}

        <form onSubmit={handleSaveGeminiKey} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${geminiConfigured ? "bg-success" : "bg-destructive animate-pulse"}`}></span>
              <span className="text-xs font-semibold text-slate-300">
                Status: {geminiConfigured ? `Configurado (${geminiMaskedKey})` : "Não Configurado (Modo local off-line)"}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              O copiloto operacional usa a API do Gemini para redigir relatórios de desvios semanais (WBR) e mensagens corporativas de SLA com tom executivo sênior e toque humano fluido.
            </p>
          </div>

          <div className="space-y-4 flex flex-col justify-end">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Insira sua chave de API do Gemini (AIzaSy...):
              </label>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="Insira a chave do Gemini..."
                className="w-full px-4 py-2.5 bg-[#0C101B] border border-border rounded-xl text-xs text-slate-200 focus:outline-none focus:border-blue-500/50 font-mono"
                required
              />
            </div>

            <button
              type="submit"
              disabled={geminiLoading}
              className="flex items-center justify-center gap-2 w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 cursor-pointer"
            >
              {geminiLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Salvando Chave de API...</span>
                </>
              ) : (
                <>
                  <span>Salvar Chave de API do Gemini</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>

    </div>
  );
}
