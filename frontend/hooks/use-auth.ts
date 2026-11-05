"use client";

import { useState, useEffect } from "react";

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
}

export function useAuth(): AuthState {
  const [perfil, setPerfil] = useState<string>("master");
  const [operadorNome, setOperadorNome] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = localStorage.getItem("anjun_perfil") || "master";
      const op = localStorage.getItem("anjun_operador_nome");
      setPerfil(p);
      setOperadorNome(op);

      const handleStorage = () => {
        setPerfil(localStorage.getItem("anjun_perfil") || "master");
        setOperadorNome(localStorage.getItem("anjun_operador_nome"));
      };
      window.addEventListener("perfilchange", handleStorage);
      return () => window.removeEventListener("perfilchange", handleStorage);
    }
  }, []);

  const alternarPerfil = (novoPerfil: "master" | "operador", nome?: string) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("anjun_perfil", novoPerfil);
      if (nome) {
        localStorage.setItem("anjun_operador_nome", nome);
      } else if (novoPerfil === "master") {
        localStorage.removeItem("anjun_operador_nome");
      }
      setPerfil(novoPerfil);
      setOperadorNome(nome || null);
      window.dispatchEvent(new Event("perfilchange"));
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
  };
}
