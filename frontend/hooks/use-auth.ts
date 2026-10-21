"use client";

export interface AuthState {
  isAuthorized: boolean;
  role: "Master" | "Guest" | "Regional";
  isMaster: boolean;
  isRegional: boolean;
  activeRegional: string | null;
  searchParamsStr: string;
}

export function useAuth(): AuthState {
  return {
    isAuthorized: true,
    role: "Master",
    isMaster: true,
    isRegional: false,
    activeRegional: null,
    searchParamsStr: "",
  };
}
