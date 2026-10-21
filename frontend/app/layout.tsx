import type { Metadata } from "next";
import "./globals.css";
import AuthWrapper from "../components/AuthWrapper";

export const metadata: Metadata = {
  title: "Torre de Controle ANJUN",
  description: "Torre de Controle Operacional da ANJUN Logística - First Mile Monitor",
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="bg-background text-foreground transition-colors duration-200">
        <AuthWrapper>{children}</AuthWrapper>
      </body>
    </html>
  );
}
