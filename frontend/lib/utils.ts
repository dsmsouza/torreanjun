export function formatMonthLabel(mStr: string) {
  if (!mStr || !mStr.includes("-")) return mStr;
  const [ano, mes] = mStr.split("-");
  const mesesPt: Record<string, string> = {
    "01": "Janeiro", "02": "Fevereiro", "03": "Março", "04": "Abril",
    "05": "Maio", "06": "Junho", "07": "Julho", "08": "Agosto",
    "09": "Setembro", "10": "Outubro", "11": "Novembro", "12": "Dezembro"
  };
  return mesesPt[mes] ? `${mesesPt[mes]}/${ano}` : mStr;
}
