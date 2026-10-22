"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "../hooks/use-auth";
import { 
  LayoutDashboard, 
  Globe, 
  MapPin, 
  Users, 
  Package, 
  Settings, 
  Shield, 
  Activity, 
  LogOut,
  Map,
  Sun,
  Moon,
  TrendingUp,
  Truck,
  Search,
  PackageSearch,
  Sparkles,
  Route,
  Rocket
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const { role, activeRegional, isMaster, searchParamsStr } = useAuth();
  
  // Read current tab parameter from URL on client side to highlight correct item
  const [currentTab, setCurrentTab] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isOfflineLocal, setIsOfflineLocal] = useState<boolean>(false);
  
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

      // Initialize theme from localStorage or document class
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
    // Dispatch custom event to notify other components (e.g. Leaflet Map)
    window.dispatchEvent(new Event("themechange"));
  };

  const menuCategories = [
    {
      title: "Operação & Coleta",
      items: [
        { name: "Central de Coletas", path: "/", icon: Truck, roleRequired: "Guest" },
        { name: "No Dia (Tempo Real)", path: "/no-dia", icon: Activity, roleRequired: "Guest" },
        { name: "D2D SP", path: "/d2d-sp", icon: Route, roleRequired: "Guest" },
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
        <div className="hidden md:flex m-3 p-3 rounded-xl bg-[#131926]/80 border border-border items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center">
            <Shield className={`w-4 h-4 ${isMaster ? "text-amber-500" : "text-blue-500"}`} />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Perfil Operacional</p>
            <p className="text-xs font-semibold text-white">
              {isMaster ? "Diretoria Master" : `Regional: ${activeRegional}`}
            </p>
          </div>
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
          onClick={() => {
            document.cookie = 'admin_token=; Max-Age=-99999999; path=/';
            localStorage.removeItem('admin_token');
            window.location.href = '/login';
          }}
          className="w-full flex items-center justify-center md:justify-start gap-3 px-3 py-3 md:px-4 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-all cursor-pointer"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline">Sair da Sessão</span>
        </button>
      </div>
    </aside>
  );
}
