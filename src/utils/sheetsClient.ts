import { CommissionRecord } from '../types';

export const parsePtBrNumber = (val: any): number => {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const str = String(val).replace(/[R$\s%]/g, "").trim();
  if (!str) return 0;
  if (str.includes(",") && str.includes(".")) {
    return parseFloat(str.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (str.includes(",")) {
    return parseFloat(str.replace(",", ".")) || 0;
  }
  return parseFloat(str) || 0;
};

export const parsePtBrDate = (dateStr: any): string => {
  if (!dateStr || typeof dateStr !== "string") return "";
  const str = dateStr.trim();
  const parts = str.split("/");
  if (parts.length === 3) {
    let [day, month, year] = parts;
    if (year.length === 2) year = "20" + year;
    if (day.length === 1) day = "0" + day;
    if (month.length === 1) month = "0" + month;
    if (year.length === 4) return `${year}-${month}-${day}`;
  }
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;
  return "";
};

export async function fetchSheetRecordsDirectly(spreadsheetId: string): Promise<CommissionRecord[]> {
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json`;
  const res = await fetch(gvizUrl);
  if (!res.ok) throw new Error(`Status HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes("google.visualization.Query.setResponse")) {
    throw new Error("Formato inválido de resposta do Google Sheets");
  }
  const jsonStr = text
    .replace("/*O_o*/", "")
    .replace("google.visualization.Query.setResponse(", "")
    .slice(0, -2);
  const json = JSON.parse(jsonStr);

  const rows = json.table?.rows || [];
  const records: CommissionRecord[] = [];

  rows.forEach((r: any, idx: number) => {
    const getVal = (colIndex: number) => {
      if (!r.c || !r.c[colIndex]) return "";
      return r.c[colIndex].f !== undefined && r.c[colIndex].f !== null ? r.c[colIndex].f : (r.c[colIndex].v ?? "");
    };

    const dataVenc = parsePtBrDate(getVal(0));
    const valor = parsePtBrNumber(getVal(1));
    const clube = String(getVal(2) || "").trim();
    const atleta = String(getVal(3) || "").trim();
    const tipoContrato = String(getVal(4) || "").trim();
    const nfInfo = String(getVal(5) || "").trim();
    const parcelas = String(getVal(6) || "").trim();
    const pagamentoInfo = String(getVal(7) || "").trim();
    const pagoOuNaoVal = String(getVal(8) || "").trim();
    const dataContrato = parsePtBrDate(getVal(9));
    const obs = String(getVal(10) || "").trim();

    if (!clube && !atleta && !valor) return;

    let parcelaAtual = 1;
    let totalParcelas = 1;
    if (parcelas) {
      const matchParc = parcelas.match(/(\d+)\s*(?:de|\/)\s*(\d+)/i);
      if (matchParc) {
        parcelaAtual = parseInt(matchParc[1], 10);
        totalParcelas = parseInt(matchParc[2], 10);
      }
    }

    const nfInfoLower = nfInfo.toLowerCase();
    const pagoOuNaoLower = pagoOuNaoVal.toLowerCase();
    const isPaid = pagoOuNaoLower.includes("sim") || pagoOuNaoLower.includes("pago") || nfInfoLower.includes("pg") || pagamentoInfo.toLowerCase().includes("pg");
    const isNfIssued = nfInfoLower.includes("nf") || nfInfoLower.includes("emitida") || nfInfoLower.includes("enviada");
    const isCancelled = nfInfoLower.includes("cancelada");

    const clienteDisplay = clube ? (atleta ? `${clube} (${atleta})` : clube) : (atleta || "Márcio Bittencourt Sports");

    records.push({
      id: `mbs-sheet-${idx + 1}`,
      numeroContrato: `CT-MBS-${String(idx + 1).padStart(3, "0")}`,
      clienteNome: clienteDisplay,
      clube: clube || "-",
      atleta: atleta || "-",
      tipoContrato: tipoContrato || "Intermediação",
      clienteCnpjCpf: "",
      servicoDescricao: tipoContrato ? `${tipoContrato}${atleta ? ` - Atleta: ${atleta}` : ""}` : "Intermediação Esportiva",
      valorBaseContrato: valor,
      percentualComissao: 100,
      valorComissao: valor,
      dataVencimentoNF: dataVenc || "2026-08-01",
      dataContrato: dataContrato || "",
      statusNF: isCancelled ? "Cancelada" : (isNfIssued ? "Emitida" : "Pendente"),
      numeroNF: nfInfo ? nfInfo.substring(0, 30) : "Não emitida",
      dataEmissaoNF: isNfIssued ? (dataContrato || dataVenc) : "",
      statusPagamento: isPaid ? "Pago" : "Aguardando",
      pagoOuNao: isPaid ? "SIM (PAGO)" : "NÃO",
      dataPagamento: isPaid ? (pagamentoInfo ? parsePtBrDate(pagamentoInfo) || dataVenc : dataVenc) : "",
      observacoes: obs || "Sincronizado do Google Sheets",
      criadoEm: "2026-01-01T00:00:00.000Z",
      parcelaAtual,
      totalParcelas
    });
  });

  return records;
}
