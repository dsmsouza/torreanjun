import { useState } from "react";

export function formatMonth(label: string): string {
  if (!label) return label;
  if (label.includes("-")) {
    const [y, m] = label.split("-");
    const mNum = parseInt(m);
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    if (mNum >= 1 && mNum <= 12) {
      return `${months[mNum - 1]}/${y}`;
    }
  }
  return label;
}

export function useDateFilters() {
  const [periodoTipo, setPeriodoTipo] = useState<string>("Diário");
  const [rotulo, setRotulo] = useState<string>("");
  const [dtInicio, setDtInicio] = useState<string>("");
  const [dtFim, setDtFim] = useState<string>("");

  return {
    periodoTipo,
    setPeriodoTipo,
    rotulo,
    setRotulo,
    dtInicio,
    setDtInicio,
    dtFim,
    setDtFim,
  };
}
