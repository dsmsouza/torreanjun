"use client";

import React, { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../hooks/use-auth";
import Sidebar from "./Sidebar";
import CopilotWidget from "./CopilotWidget";

function AuthContent({ children }: { children: React.ReactNode }) {
  const { isAuthorized, isOperador } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Guarda de rota estrita no client: Operador só acessa /vtag, /mapa e /login
  useEffect(() => {
    if (isOperador) {
      const allowedPaths = ["/vtag", "/mapa", "/login"];
      const currentClean = pathname.split("?")[0];
      const isAllowed = allowedPaths.some(
        (ap) => currentClean === ap || currentClean.startsWith(`${ap}/`)
      );
      if (!isAllowed) {
        router.replace("/vtag");
      }
    }
  }, [isOperador, pathname, router]);

  // Se estiver na página de login, não renderizamos Sidebar nem Main wrapper
  if (pathname === "/login") {
    return <>{children}</>;
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

      {/* Copilot IA Inteligente (Grounded no SQLite) - Oculto no perfil restrito Operador */}
      {!isOperador && <CopilotWidget />}
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
