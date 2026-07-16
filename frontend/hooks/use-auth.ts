"use client";

import { useSearchParams } from "next/navigation";

export interface AuthState {
  isAuthorized: boolean;
  role: "Master" | "Regional" | "Guest";
  isMaster: boolean;
  isRegional: boolean;
  activeRegional: string | null;
  searchParamsStr: string;
}

export function useAuth(): AuthState {
  const searchParams = useSearchParams();
  const masterKey = searchParams.get("master");
  const regionalKey = searchParams.get("regional") || searchParams.get("filial");
  
  const isMaster = masterKey === "diego2026" || (typeof window !== "undefined" && !!localStorage.getItem("admin_token"));
  const isRegional = !!regionalKey;
  const isAuthorized = isMaster || isRegional;

  return {
    isAuthorized,
    role: isMaster ? "Master" : isRegional ? "Regional" : "Guest",
    isMaster,
    isRegional,
    activeRegional: regionalKey,
    searchParamsStr: searchParams.toString() ? `?${searchParams.toString()}` : "",
  };
}
