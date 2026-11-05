"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../hooks/use-auth";
import { 
  MapPin, 
  Settings, 
  Shield,
  ShieldAlert, 
  LogOut,
  Map,
  Sun,
  Moon,
  Truck,
  Clock,
  Rocket,
  Tag,
  PackageCheck,
  Lock,
  KeyRound,
  X,
  User
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const { nome, role, isMaster, isLider, isOperador, logout, searchParamsStr, desbloquearMaster } = useAuth();
  
  const [currentTab, setCurrentTab] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isOfflineLocal, setIsOfflineLocal] = useState<boolean>(false);
  const [showModalSenha, setShowModalSenha] = useState<boolean>(false);
  const [senhaInput, setSenhaInput] = useState<string>("");
  const [erroSenha, setErroSenha] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const h = window.location.hostname;
      setIsOfflineLocal(h === "localhost" || h === "127.0.0.1");
      const searchParams = new URLSearchParams(window.location.search);
      setCurrentTab(searchParams.get("tab"));
      
      const handlePopState = () => {
        const updatedParams = new URLSearchParams(window.location.search);
        setCurrentTab(updatedParams.get("tab"));
      };
      window.addEventListener("popstate", handlePopState);

      const storedTheme = localStorage.getItem("theme");
      const initialTheme = storedTheme === "light" ? "light" : "dark";
      setTheme(initialTheme);
      if (initialTheme === "light") {
        document.documentElement.classList.add("light");
      } else {
        document.documentElement.classList.remove("light");
      }

      return () => {
        window.removeEventListener("popstate", handlePopState);
      };
    }
  }, [pathname]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    if (nextTheme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
    window.dispatchEvent(new Event("themechange"));
  };

  const handleDesbloqueio = (e: React.FormEvent) => {
    e.preventDefault();
    setErroSenha("");
    const ok = desbloquearMaster(senhaInput);
    if (ok) {
      setShowModalSenha(false);
      setSenhaInput("");
      window.location.reload();
    } else {
      setErroSenha("Senha incorreta. Apenas a senha master do Diego é válida.");
    }
  };

  // Menu da Torre Operacional e Master
  const menuCategories = isOperador ? [
    {
      title: "Torre de Controle Operacional",
      items: [
        { name: "VTAGs MiniDrops (MD)", path: "/vtag", icon: Tag, roleRequired: "Guest" },
        { name: "VTAGs Pickups (FM)", path: "/vtag-pickup", icon: PackageCheck, roleRequired: "Guest" },
        { name: "Mapa da Malha", path: "/mapa", icon: Map, roleRequired: "Guest" },
      ]
    }
  ] : [
    {
      title: "Operação & Coleta",
      items: [
        { name: "Central de Coletas", path: "/", icon: Truck, roleRequired: "Guest" },
        { name: "VTAGs MiniDrops (MD)", path: "/vtag", icon: Tag, roleRequired: "Guest" },
        { name: "VTAGs Pickups (FM)", path: "/vtag-pickup", icon: PackageCheck, roleRequired: "Guest" },
        { name: "Planejador 16h SP", path: "/planejador-rotas", icon: Clock, roleRequired: "Guest" },
        { name: "SLA & Anomalias", path: "/sla", icon: ShieldAlert, roleRequired: "Guest" },
      ]
    },
    {
      title: "Implantação FM",
      items: [
        { name: "Fluxo de Novas Solicitações", path: "/solicitacoes", icon: Rocket, roleRequired: "Guest" },
        { name: "Mapa da Malha", path: "/mapa", icon: Map, roleRequired: "Guest" },
      ]
    },
    ...(isOfflineLocal ? [{
      title: "Ferramentas & Admin",
      items: [
        { name: "Configurações", path: "/config", icon: Settings, roleRequired: "Master" },
      ]
    }] : [])
  ];

  return (
    <>
      <aside className="w-16 md:w-64 h-screen fixed left-0 top-0 bg-[#0C101B] border-r border-border flex flex-col justify-between z-30 transition-all duration-300">
        <div className="flex flex-col h-full overflow-y-auto">
          {/* Logo/Header */}
          <div className="h-16 flex items-center justify-center md:justify-start px-6 border-b border-border gap-3 bg-[#0C101B] shrink-0">
            <MapPin className="w-6 h-6 text-emerald-400 animate-pulse" />
            <span className="hidden md:inline font-bold text-base text-white tracking-wider">
              Torre ANJUN
            </span>
          </div>

          {/* Profile Card */}
          <div className="hidden md:flex m-3 p-3 rounded-xl bg-[#131926]/80 border border-border items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center">
                <Shield className={`w-4 h-4 ${isMaster ? "text-amber-500" : (isLider ? "text-cyan-400" : "text-emerald-400")}`} />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  {isMaster ? "Diretoria Master" : (isLider ? "Liderança Torre" : "Suporte Torre")}
                </p>
                <p className="text-xs font-semibold text-white truncate max-w-[110px]" title={nome}>
                  {nome || "Operador"}
                </p>
              </div>
            </div>

            {isOperador && (
              <button
                onClick={() => {
                  setErroSenha("");
                  setShowModalSenha(true);
                }}
                className="text-[10px] text-amber-400 hover:text-amber-300 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 cursor-pointer flex items-center gap-1 font-medium transition-all hover:bg-amber-500/20"
                title="Desbloquear Acesso Master (Diego)"
              >
                <Lock className="w-3 h-3" />
                Master
              </button>
            )}
          </div>

          {/* Navigation Menu */}
          <nav className="px-2 md:px-3 py-2 space-y-4">
            {menuCategories.map((cat, catIdx) => (
              <div key={catIdx} className="space-y-1">
                <p className="hidden md:block text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-1">
                  {cat.title}
                </p>
                {cat.items.map((item) => {
                  if (item.roleRequired === "Master" && !isMaster) return null;

                  const currentPath = pathname.split("?")[0];
                  const isActive = currentPath === item.path || (item.path === "/" && (currentPath === "/" || currentPath === "/coletas"));
                  const Icon = item.icon;
                  const baseHref = item.path.includes("?")
                    ? `${item.path}${searchParamsStr ? `&${searchParamsStr.slice(1)}` : ""}`
                    : `${item.path}${searchParamsStr}`;

                  return (
                    <Link
                      key={item.path}
                      href={baseHref}
                      prefetch={true}
                      className={`flex items-center justify-center md:justify-start gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                        isActive
                          ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/10 font-bold"
                          : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="hidden md:inline">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Theme Toggler & Logout */}
        <div className="p-2 md:p-4 border-t border-border space-y-1">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-center md:justify-start gap-3 px-3 py-3 md:px-4 rounded-lg text-sm font-medium text-muted-foreground hover:text-white hover:bg-slate-800/40 transition-all cursor-pointer"
          >
            {theme === "dark" ? (
              <>
                <Sun className="w-4 h-4 shrink-0 text-amber-500" />
                <span className="hidden md:inline">Modo Claro</span>
              </>
            ) : (
              <>
                <Moon className="w-4 h-4 shrink-0 text-indigo-400" />
                <span className="hidden md:inline">Modo Escuro</span>
              </>
            )}
          </button>

          <button
            onClick={logout}
            className="w-full flex items-center justify-center md:justify-start gap-3 px-3 py-3 md:px-4 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline">Sair da Sessão</span>
          </button>
        </div>
      </aside>

      {/* Modal para Desbloquear Modo Master */}
      {showModalSenha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#111827] border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative">
            <button
              onClick={() => setShowModalSenha(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Desbloquear Master</h3>
                <p className="text-xs text-slate-400">Acesso completo à Diretoria (Diego)</p>
              </div>
            </div>

            <form onSubmit={handleDesbloqueio} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Senha do Diego
                </label>
                <input
                  type="password"
                  autoFocus
                  value={senhaInput}
                  onChange={(e) => setSenhaInput(e.target.value)}
                  placeholder="Digite a senha de administrador..."
                  className="w-full px-3.5 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500"
                />
                {erroSenha && (
                  <p className="text-xs text-rose-400 mt-1.5">{erroSenha}</p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModalSenha(false)}
                  className="px-3 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-lg shadow-amber-500/20"
                >
                  Confirmar Desbloqueio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
