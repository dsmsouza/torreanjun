"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export interface AuthState {
  isAuthorized: boolean;
  user: string;
  nome: string;
  role: "master" | "lider" | "operador";
  isMaster: boolean;
  isLider: boolean;
  isOperador: boolean;
  podeGerarVtag: boolean;
  suportePadrao: string;
  searchParamsStr: string;
  logout: () => void;
  desbloquearMaster: (senha: string) => boolean;
}

export function useAuth(): AuthState {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<string>("operador");
  const [nome, setNome] = useState<string>("Operador");
  const [role, setRole] = useState<"master" | "lider" | "operador">("operador");
  const [suportePadrao, setSuportePadrao] = useState<string>("TODOS");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedUser = localStorage.getItem("anjun_user") || "";
      const storedNome = localStorage.getItem("anjun_nome") || "";
      const storedRole = (localStorage.getItem("anjun_role") as "master" | "lider" | "operador") || "operador";
      const storedSup = localStorage.getItem("anjun_suporte_tab") || "TODOS";
      const hasMasterCookie = document.cookie.includes("anjun_master_session=true");

      const activeRole: "master" | "lider" | "operador" = (storedRole === "master" && hasMasterCookie)
        ? "master"
        : (storedRole === "lider" ? "lider" : "operador");

      setUser(storedUser || (activeRole === "master" ? "diego" : "operador"));
      setNome(storedNome || (activeRole === "master" ? "Diego Mandarino" : "Operador"));
      setRole(activeRole);
      setSuportePadrao(storedSup);

      // Bloqueio no Client: se não for Master, só acessa /vtag, /mapa e /login
      if (activeRole !== "master") {
        const allowedPaths = ["/vtag", "/vtag-pickup", "/mapa", "/login"];
        const currentClean = pathname.split("?")[0];
        const isAllowed = allowedPaths.some(
          (ap) => currentClean === ap || currentClean.startsWith(`${ap}/`)
        );
        if (!isAllowed) {
          router.replace("/vtag");
        }
      }

      const handleStorage = () => {
        const u = localStorage.getItem("anjun_user") || "";
        const n = localStorage.getItem("anjun_nome") || "";
        const r = (localStorage.getItem("anjun_role") as "master" | "lider" | "operador") || "operador";
        const s = localStorage.getItem("anjun_suporte_tab") || "TODOS";
        const mc = document.cookie.includes("anjun_master_session=true");
        const finalR: "master" | "lider" | "operador" = (r === "master" && mc) ? "master" : (r === "lider" ? "lider" : "operador");

        setUser(u || (finalR === "master" ? "diego" : "operador"));
        setNome(n || (finalR === "master" ? "Diego Mandarino" : "Operador"));
        setRole(finalR);
        setSuportePadrao(s);
      };

      window.addEventListener("perfilchange", handleStorage);
      return () => window.removeEventListener("perfilchange", handleStorage);
    }
  }, [pathname, router]);

  const logout = () => {
    if (typeof window !== "undefined") {
      document.cookie = "anjun_session=; Max-Age=-99999999; path=/;";
      document.cookie = "anjun_master_session=; Max-Age=-99999999; path=/;";
      document.cookie = "admin_token=; Max-Age=-99999999; path=/;";
      localStorage.removeItem("anjun_user");
      localStorage.removeItem("anjun_nome");
      localStorage.removeItem("anjun_role");
      localStorage.removeItem("anjun_suporte_tab");
      localStorage.removeItem("anjun_perfil");
      localStorage.removeItem("admin_token");
      window.location.href = "/login";
    }
  };

  const desbloquearMaster = (senha: string): boolean => {
    const s = senha.trim();
    if (s === "diego123" || s === "admin123" || s === "anjun2026" || s === "anjun123") {
      if (typeof window !== "undefined") {
        document.cookie = "anjun_session=true; path=/; max-age=604800; SameSite=Lax;";
        document.cookie = "anjun_master_session=true; path=/; max-age=604800; SameSite=Lax;";
        localStorage.setItem("anjun_user", "diego");
        localStorage.setItem("anjun_nome", "Diego Mandarino");
        localStorage.setItem("anjun_role", "master");
        localStorage.setItem("anjun_suporte_tab", "TODOS");
        setRole("master");
        setUser("diego");
        setNome("Diego Mandarino");
        window.dispatchEvent(new Event("perfilchange"));
      }
      return true;
    }
    return false;
  };

  const isMaster = role === "master";
  const isLider = role === "lider";
  // isOperador é true para quem não for Master (para o Sidebar mostrar apenas VTAG e Mapa)
  const isOperador = !isMaster;
  // Diego e Ellen podem gerar VTAGs
  const podeGerarVtag = isMaster || isLider;

  return {
    isAuthorized: true,
    user,
    nome,
    role,
    isMaster,
    isLider,
    isOperador,
    podeGerarVtag,
    suportePadrao,
    searchParamsStr: "",
    logout,
    desbloquearMaster,
  };
}
