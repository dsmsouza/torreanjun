"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, ArrowRight, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("from") || "/";

  // Prevenir que o usuário já logado veja a tela de login
  useEffect(() => {
    if (document.cookie.includes("admin_token")) {
      router.push(redirectUrl);
    }
  }, [router, redirectUrl]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Define the cookie with 24h expiration
        document.cookie = `admin_token=${data.token}; path=/; max-age=86400; SameSite=Strict`;
        
        // Also keep in localStorage for some client requests if needed
        localStorage.setItem("admin_token", data.token);
        
        // Redireciona com window.location.href para forçar o middleware a recarregar a rota protegida
        window.location.href = redirectUrl;
      } else {
        const err = await response.json();
        setError(err.detail || "Credenciais inválidas");
      }
    } catch (err) {
      setError("Erro ao conectar no servidor. Verifique se o backend está rodando.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex w-full bg-[#090D16]">
      {/* Left side: branding & image */}
      <div className="hidden lg:flex w-1/2 bg-slate-900 relative overflow-hidden flex-col justify-between p-12">
        {/* Abstract background elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-600/20 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/20 blur-[120px]" />
        
        <div className="z-10 flex items-center space-x-3">
          {/* ANJUN Logo SVG Representation */}
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-6 h-6 text-white" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-2xl font-bold text-white tracking-tight">ANJUN <span className="text-blue-500">Express</span></span>
        </div>

        <div className="z-10 space-y-6 max-w-md">
          <h1 className="text-4xl font-bold text-white leading-tight">Torre de Controle Operacional</h1>
          <p className="text-slate-400 text-lg leading-relaxed">
            Gestão avançada de malha, monitoramento de performance e controle de qualidade para excelência na primeira milha.
          </p>
          
          <div className="flex items-center space-x-4 pt-8">
            <div className="flex -space-x-4">
              <div className="w-10 h-10 rounded-full bg-slate-800 border-2 border-[#090D16] flex items-center justify-center text-xs font-bold text-slate-300">SP</div>
              <div className="w-10 h-10 rounded-full bg-blue-900 border-2 border-[#090D16] flex items-center justify-center text-xs font-bold text-blue-200">RJ</div>
              <div className="w-10 h-10 rounded-full bg-indigo-900 border-2 border-[#090D16] flex items-center justify-center text-xs font-bold text-indigo-200">MG</div>
            </div>
            <span className="text-sm text-slate-500">Operação Nacional</span>
          </div>
        </div>
      </div>

      {/* Right side: login form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12">
        <div className="w-full max-w-md space-y-10">
          
          {/* Mobile Logo (visible only on small screens) */}
          <div className="flex lg:hidden items-center justify-center space-x-3 mb-12">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-6 h-6 text-white" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-white tracking-tight">ANJUN <span className="text-blue-500">Express</span></span>
          </div>

          <div className="space-y-3 text-center lg:text-left">
            <h2 className="text-3xl font-bold text-white tracking-tight">
              Acesso Restrito
            </h2>
            <p className="text-slate-400">
              Digite a chave de acesso master para entrar no painel de controle.
            </p>
          </div>

          <form className="space-y-6" onSubmit={handleLogin}>
            <div className="space-y-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="block w-full pl-10 pr-3 py-3 border border-slate-700 rounded-xl bg-slate-800/50 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm"
                  placeholder="Chave de Acesso"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start space-x-2">
                <ShieldCheck className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <span className="text-sm text-red-400">{error}</span>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading || !password}
                className="group relative flex w-full justify-center items-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-[#090D16] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Entrar no Painel</span>
                    <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>
            
            <div className="mt-8 pt-6 border-t border-slate-800 flex items-center justify-center space-x-2 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4" />
              <span>Ambiente seguro e monitorado</span>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
