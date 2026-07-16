"use client";

import React, { Suspense } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../hooks/use-auth";
import Sidebar from "./Sidebar";
import { ShieldAlert, KeyRound } from "lucide-react";

function AuthContent({ children }: { children: React.ReactNode }) {
  const { isAuthorized, isMaster, role } = useAuth();
  const pathname = usePathname();

  if (!isAuthorized && pathname !== "/login") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090D16] p-6">
        <div className="max-w-md w-full glass-panel p-8 rounded-2xl border border-destructive/20 text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-destructive animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Acesso Restrito</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Esta Torre de Controle é de uso exclusivo da operação ANJUN. Por favor, utilize o link de acesso parametrizado com sua credencial correspondente.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-800/40 border border-border flex items-center gap-3 justify-center text-xs text-muted-foreground">
            <KeyRound className="w-4 h-4 text-blue-400" />
            <span>Exemplo: ?regional=SP ou informe-se com o administrador</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="ml-16 md:ml-64 flex-1 min-h-screen p-4 md:p-8 bg-[#090D16] overflow-y-auto transition-all duration-300">
        <div className="max-w-7xl mx-auto space-y-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#090D16]">
        <div className="text-sm text-muted-foreground animate-pulse">Carregando Torre de Controle...</div>
      </div>
    }>
      <AuthContent>{children}</AuthContent>
    </Suspense>
  );
}
