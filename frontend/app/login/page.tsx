"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, ArrowRight, ShieldCheck, User, Users, Shield, Tag, Map, CheckCircle2 } from "lucide-react";

interface UsuarioOption {
  login: string;
  nome: string;
  role: "master" | "lider" | "operador";
  suporte: string;
  descricao: string;
}

const USUARIOS_PADRAO: UsuarioOption[] = [
  { login: "diego", nome: "Diego Mandarino", role: "master", suporte: "TODOS", descricao: "Proprietário / Master (Acesso Completo)" },
  { login: "ellen", nome: "Ellen", role: "lider", suporte: "ELLEN", descricao: "Líder da Torre (Gera VTAGs & Disparo WhatsApp)" },
  { login: "danilo", nome: "Danilo", role: "operador", suporte: "DANILO", descricao: "Suporte da Torre (Disparo WhatsApp)" },
  { login: "gabriele", nome: "Gabriele", role: "operador", suporte: "GABRIELE", descricao: "Suporte da Torre (Disparo WhatsApp)" },
  { login: "ketley", nome: "Ketley", role: "operador", suporte: "KETLEY", descricao: "Suporte da Torre (Disparo WhatsApp)" },
  { login: "janaina", nome: "Janaina", role: "operador", suporte: "JANAINA", descricao: "Suporte da Torre (Disparo WhatsApp)" },
  { login: "nicolas", nome: "Nicolas", role: "operador", suporte: "NICOLAS", descricao: "Suporte da Torre (Disparo WhatsApp)" },
];

export default function LoginPage() {
  const [selectedUser, setSelectedUser] = useState<UsuarioOption>(USUARIOS_PADRAO[0]);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuario: selectedUser.login,
          password: password.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();

        // 1. Grava cookies de sessão
        document.cookie = `anjun_session=true; path=/; max-age=604800; SameSite=Lax;`;
        document.cookie = `anjun_user=${data.usuario}; path=/; max-age=604800; SameSite=Lax;`;
        document.cookie = `anjun_role=${data.role}; path=/; max-age=604800; SameSite=Lax;`;

        if (data.role === "master") {
          document.cookie = `anjun_master_session=true; path=/; max-age=604800; SameSite=Lax;`;
        } else {
          // Garante remoção de cookie master anterior
          document.cookie = `anjun_master_session=; Max-Age=-99999999; path=/;`;
        }

        // 2. Grava no localStorage para uso imediato nos componentes
        localStorage.setItem("anjun_user", data.usuario);
        localStorage.setItem("anjun_nome", data.nome);
        localStorage.setItem("anjun_role", data.role);
        localStorage.setItem("anjun_perfil", data.role);
        localStorage.setItem("anjun_suporte_tab", data.suporte || "TODOS");
        if (data.token) {
          localStorage.setItem("admin_token", data.token);
        }

        window.dispatchEvent(new Event("perfilchange"));

        // 3. Redirecionamento correto conforme o perfil
        const dest = data.role === "master" ? "/" : "/vtag";
        window.location.href = dest;
      } else {
        const err = await response.json().catch(() => ({ detail: "Senha incorreta." }));
        setError(err.detail || "Senha incorreta. Tente novamente.");
      }
    } catch (err) {
      setError("Erro ao conectar no servidor. Verifique se o backend está ativo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full bg-[#090D16] text-slate-100 font-sans">
      {/* Lado Esquerdo: Banner Corporativo */}
      <div className="hidden lg:flex w-5/12 bg-gradient-to-br from-[#0c1322] via-[#090D16] to-[#0d1627] relative overflow-hidden flex-col justify-between p-12 border-r border-slate-800/80">
        <div className="absolute top-[-15%] left-[-15%] w-[60%] h-[60%] rounded-full bg-emerald-600/10 blur-[130px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-cyan-600/10 blur-[120px]" />

        <div className="z-10 flex items-center space-x-3">
          <div className="w-10 h-10 bg-emerald-500/20 border border-emerald-500/40 rounded-xl flex items-center justify-center text-emerald-400 font-black shadow-lg shadow-emerald-500/10">
            A
          </div>
          <div>
            <span className="text-xl font-black text-white tracking-wider">ANJUN <span className="text-emerald-400">Torre</span></span>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">São Paulo First-Mile</p>
          </div>
        </div>

        <div className="z-10 space-y-6 max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            Acesso Operacional Protegido
          </div>
          <h1 className="text-3xl xl:text-4xl font-black text-white leading-tight">
            Torre de Controle Operacional
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            Distribuição de VTAGs oficiais, monitoramento de rotas e acompanhamento de coletas de MiniDrops em tempo real.
          </p>

          <div className="pt-4 space-y-2.5 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span><strong>Diego:</strong> Acesso Master completo (Diretoria)</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span><strong>Ellen:</strong> Líder da Torre — Geração de VTAGs e WhatsApp</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span><strong>Danilo, Gabriele, Ketley, Janaina, Nicolas:</strong> Envio por Suporte</span>
            </div>
          </div>
        </div>

        <div className="z-10 text-[11px] text-slate-500 font-mono">
          Anjun Express Logistics © 2026 — Rede Interna
        </div>
      </div>

      {/* Lado Direito: Formulário de Autenticação */}
      <div className="w-full lg:w-7/12 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-7">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Identifique-se para Acessar</h2>
            <p className="text-xs text-slate-400 mt-1">
              Selecione o seu perfil e digite a sua senha de acesso.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Seletor de Usuário */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Selecione o Usuário
              </label>
              <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                {USUARIOS_PADRAO.map((u) => {
                  const isSelected = selectedUser.login === u.login;
                  return (
                    <button
                      key={u.login}
                      type="button"
                      onClick={() => {
                        setSelectedUser(u);
                        setError("");
                      }}
                      className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                        isSelected
                          ? "bg-emerald-500/15 border-emerald-500/50 shadow-md shadow-emerald-500/10"
                          : "bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                          u.role === "master"
                            ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                            : u.role === "lider"
                            ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                            : "bg-slate-800 text-slate-300 border border-slate-700"
                        }`}>
                          <User className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            {u.nome}
                            {u.role === "master" && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono">
                                Master
                              </span>
                            )}
                            {u.role === "lider" && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                                Líder Torre
                              </span>
                            )}
                            {u.role === "operador" && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                                Suporte {u.suporte}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400">{u.descricao}</p>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Campo de Senha */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                Senha de Acesso ({selectedUser.nome})
              </label>
              <div className="relative">
                <input
                  type="password"
                  autoFocus
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha de acesso..."
                  className="w-full px-4 py-3 pl-11 rounded-xl bg-slate-900 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-4 top-3.5" />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? "Autenticando..." : `Entrar como ${selectedUser.nome}`}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
