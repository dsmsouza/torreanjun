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
  TrendingUp
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const { role, activeRegional, isMaster, searchParamsStr } = useAuth();
  
  // Read current tab parameter from URL on client side to highlight correct item
  const [currentTab, setCurrentTab] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  
  useEffect(() => {
    if (typeof window !== "undefined") {
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

  const menuItems = [
    { name: "Visão Geral", path: "/", icon: LayoutDashboard, roleRequired: "Guest" },
    { name: "Perf. Regionais", path: "/regionais", icon: Globe, roleRequired: "Guest" },
    { name: "Filtro por Filial", path: "/filial", icon: MapPin, roleRequired: "Guest" },
    { name: "Clientes Mktplace", path: "/clientes", icon: Users, roleRequired: "Guest" },
    { name: "Saúde dos MDs", path: "/score-md", icon: Activity, roleRequired: "Guest" },
    { name: "Evolução", path: "/evolucao", icon: TrendingUp, roleRequired: "Guest" },
    { name: "Pacotes em Aberto", path: "/malha?tab=radar", icon: Shield, roleRequired: "Guest" },
    { name: "MAP", path: "/malha?tab=mapa", icon: Map, roleRequired: "Guest" },
    { name: "MISSCAN", path: "/misscan", icon: Package, roleRequired: "Guest" },
    { name: "Configurações", path: "/config", icon: Settings, roleRequired: "Master" },
  ];

  return (
    <aside className="w-16 md:w-64 h-screen fixed left-0 top-0 bg-[#0C101B] border-r border-border flex flex-col justify-between z-30 transition-all duration-300">
      <div className="flex flex-col h-full">
        {/* Logo/Header */}
        <div className="h-16 flex items-center justify-center md:justify-start px-6 border-b border-border gap-3 bg-[#0C101B] shrink-0">
          <MapPin className="w-6 h-6 text-primary animate-pulse" />
          <span className="hidden md:inline font-bold text-base text-white tracking-wider">
            Torre ANJUN
          </span>
        </div>

        {/* Profile Card */}
        <div className="hidden md:flex m-4 p-4 rounded-xl bg-[#131926]/80 border border-border items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
            <Shield className={`w-5 h-5 ${isMaster ? "text-amber-500" : "text-blue-500"}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Perfil Conectado</p>
            <p className="text-sm font-semibold text-white">
              {isMaster ? "Diretoria Master" : `Regional: ${activeRegional}`}
            </p>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="px-2 md:px-4 py-2 space-y-1 mt-4 md:mt-0">
          {menuItems.map((item) => {
            // Hide admin menu items if user has regional role
            if (item.roleRequired === "Master" && !isMaster) {
              return null;
            }

            const isTabMapaItem = item.path.includes("tab=mapa");
            const isTabRadarItem = item.path.includes("tab=radar");
            const isActive = isTabMapaItem
              ? (pathname === "/malha" && currentTab === "mapa")
              : isTabRadarItem
                ? (pathname === "/malha" && currentTab === "radar")
                : (pathname === item.path.split("?")[0] && pathname !== "/malha");

            const Icon = item.icon;

            const baseHref = item.path.includes("?")
              ? `${item.path}${searchParamsStr ? `&${searchParamsStr.slice(1)}` : ""}`
              : `${item.path}${searchParamsStr}`;

            return (
              <Link
                key={item.path}
                href={baseHref}
                className={`flex items-center justify-center md:justify-start gap-3 px-3 py-3 md:px-4 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-primary text-white shadow-lg shadow-blue-500/10"
                    : "text-muted-foreground hover:text-white hover:bg-slate-800/40"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="hidden md:inline">{item.name}</span>
              </Link>
            );
          })}
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

        <Link
          href="/"
          className="flex items-center justify-center md:justify-start gap-3 px-3 py-3 md:px-4 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-all"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className="hidden md:inline">Sair da Sessão</span>
        </Link>
      </div>
    </aside>
  );
}
