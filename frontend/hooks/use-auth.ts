"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export interface AuthState {
  isAuthorized: boolean;
  role: "Master" | "Guest" | "Regional" | "Operador";
  isMaster: boolean;
  isOperador: boolean;
  isRegional: boolean;
  activeRegional: string | null;
  searchParamsStr: string;
  operadorNome: string | null;
  alternarPerfil: (novoPerfil: "master" | "operador", nome?: string) => void;
  desbloquearMaster: (senha: string) => boolean;
  bloquearOperador: () => void;
}

export function useAuth(): AuthState {
  const router = useRouter();
  const pathname = usePathname();

  // PADRÃO DE SEGURANÇA: Qualquer novo acesso (rede local ou anônimo) entra estritamente como "operador"
  const [perfil, setPerfil] = useState<"master" | "operador">("operador");
  const [operadorNome, setOperadorNome] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedPerfil = localStorage.getItem("anjun_perfil");
      const hasMasterCookie = document.cookie.includes("anjun_master_session=true");

      // Só é master se tiver o cookie Master E o perfil master explícito
      const p: "master" | "operador" = storedPerfil === "master" && hasMasterCookie ? "master" : "operador";
      const op = localStorage.getItem("anjun_operador_nome");

      setPerfil(p);
      setOperadorNome(op);

      // BLOQUEIO DE ROTA ESTRITO: Operador só pode acessar /vtag, /mapa ou /login
      if (p === "operador") {
        const allowedPaths = ["/vtag", "/mapa", "/login"];
        const currentClean = pathname.split("?")[0];
        const isAllowed = allowedPaths.some(
          (ap) => currentClean === ap || currentClean.startsWith(`${ap}/`)
        );
        if (!isAllowed) {
          router.replace("/vtag");
        }
      }

      const handleStorage = () => {
        const curStored = localStorage.getItem("anjun_perfil");
        const curCookie = document.cookie.includes("anjun_master_session=true");
        const curP: "master" | "operador" = curStored === "master" && curCookie ? "master" : "operador";
        setPerfil(curP);
        setOperadorNome(localStorage.getItem("anjun_operador_nome"));
      };
      window.addEventListener("perfilchange", handleStorage);
      return () => window.removeEventListener("perfilchange", handleStorage);
    }
  }, [pathname, router]);

  const alternarPerfil = (novoPerfil: "master" | "operador", nome?: string) => {
    if (typeof window !== "undefined") {
      if (novoPerfil === "master") {
        localStorage.setItem("anjun_perfil", "master");
        document.cookie = "anjun_master_session=true; path=/; max-age=604800; SameSite=Lax;";
        localStorage.removeItem("anjun_operador_nome");
      } else {
        localStorage.setItem("anjun_perfil", "operador");
        document.cookie = "anjun_master_session=; Max-Age=-99999999; path=/;";
        if (nome) {
          localStorage.setItem("anjun_operador_nome", nome);
        }
      }
      setPerfil(novoPerfil);
      setOperadorNome(nome || null);
      window.dispatchEvent(new Event("perfilchange"));
    }
  };

  const desbloquearMaster = (senha: string): boolean => {
    const s = senha.trim();
    if (s === "admin123" || s === "anjun2026" || s === "anjun123") {
      alternarPerfil("master");
      return true;
    }
    return false;
  };

  const bloquearOperador = () => {
    alternarPerfil("operador");
    const allowedPaths = ["/vtag", "/mapa", "/login"];
    const currentClean = pathname.split("?")[0];
    const isAllowed = allowedPaths.some(
      (ap) => currentClean === ap || currentClean.startsWith(`${ap}/`)
    );
    if (!isAllowed) {
      router.replace("/vtag");
    }
  };

  const isOperador = perfil === "operador";
  const isMaster = !isOperador;

  return {
    isAuthorized: true,
    role: isOperador ? "Operador" : "Master",
    isMaster,
    isOperador,
    isRegional: false,
    activeRegional: null,
    searchParamsStr: "",
    operadorNome,
    alternarPerfil,
    desbloquearMaster,
    bloquearOperador,
  };
}
