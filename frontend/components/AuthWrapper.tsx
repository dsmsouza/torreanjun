"use client";

import React, { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../hooks/use-auth";
import Sidebar from "./Sidebar";
import { ShieldAlert, KeyRound } from "lucide-react";
import CopilotWidget from "./CopilotWidget";

function AuthContent({ children }: { children: React.ReactNode }) {
  const { isAuthorized } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Em caso raro do middleware falhar ou client-side state apagar, 
  // forçamos o push para login no client
  useEffect(() => {
    if (!isAuthorized && pathname !== "/login") {
      router.push(`/login?from=${encodeURIComponent(pathname)}`);
    }
  }, [isAuthorized, pathname, router]);

  // Se estiver na página de login, não renderizamos Sidebar nem Main wrapper escuro
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Se ainda estiver carregando auth state ou falhou mas vai redirecionar
  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090D16]">
        <div className="text-sm text-blue-500 animate-pulse">Verificando segurança...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-[#090D16]">
      {/* Sidebar navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <main className="ml-16 md:ml-64 flex-1 min-h-screen p-4 md:p-8 overflow-y-auto transition-all duration-300">
        <div className="max-w-7xl mx-auto space-y-8">
          {children}
        </div>
      </main>

      {/* Copilot IA Inteligente (Grounded no SQLite) */}
      <CopilotWidget />
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
