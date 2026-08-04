import { CommissionRecord } from '../types';

export const formatDateBr = (d?: string) => {
  if (!d) return '';
  if (d.includes('/')) return d;
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
};

export const formatCurrencyBr = (val?: number) => {
  if (val === undefined || val === null || isNaN(val)) return '0,00';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const cleanClubeAndAtleta = (clube?: string, atleta?: string, clienteNome?: string) => {
  let finalClube = (clube || '').trim();
  let finalAtleta = (atleta || '').trim();

  if ((!finalClube || finalClube === '-' || finalClube.toLowerCase() === 'não informado') && clienteNome) {
    if (clienteNome.includes(' - ')) {
      const parts = clienteNome.split(' - ');
      finalClube = parts[0].trim();
      if (!finalAtleta || finalAtleta === '-') {
        finalAtleta = parts.slice(1).join(' - ').trim();
      }
    } else {
      finalClube = clienteNome.trim();
    }
  }

  if (!finalClube) finalClube = '-';
  if (!finalAtleta) finalAtleta = '-';

  return { clube: finalClube, atleta: finalAtleta };
};

export const GOOGLE_SHEETS_HEADERS = [
  "DATA",
  "VALOR MMB",
  "Clube",
  "Atleta",
  "Tipo de contrato",
  "NF",
  "Parcelas",
  "Pagamento",
  "PAGO OU NÃO",
  "Data do contrato",
  "OBS"
];

export const generateSheetsRows = (records: CommissionRecord[]) => {
  return records.map(rec => {
    const { clube, atleta } = cleanClubeAndAtleta(rec.clube, rec.atleta, rec.clienteNome);
    return [
      formatDateBr(rec.dataVencimentoNF),
      formatCurrencyBr(rec.valorComissao),
      clube,
      atleta,
      rec.tipoContrato || rec.servicoDescricao || 'Intermediação',
      rec.numeroNF || 'Não emitida',
      `${rec.parcelaAtual || 1}/${rec.totalParcelas || 1}`,
      rec.dataPagamento ? formatDateBr(rec.dataPagamento) : (rec.statusPagamento === 'Pago' ? 'Pago' : 'Pendente'),
      rec.pagoOuNao || (rec.statusPagamento === 'Pago' ? 'SIM (PAGO)' : 'NÃO'),
      formatDateBr(rec.dataContrato || rec.criadoEm?.split('T')[0]),
      (rec.observacoes || '').replace(/[\r\n\t]/g, ' ')
    ];
  });
};

/**
 * Generates Tab-Separated Values (TSV) to copy directly to clipboard.
 * When pasted into cell A1 of Google Sheets, all columns populate automatically!
 * Includes headers so pasting at cell A1 overwrites the entire table cleanly without duplicates.
 */
export const copyDataToClipboardForSheets = async (records: CommissionRecord[]): Promise<boolean> => {
  try {
    const rows = generateSheetsRows(records);
    const tsvContent = [
      GOOGLE_SHEETS_HEADERS.join('\t'),
      ...rows.map(row => row.join('\t'))
    ].join('\n');

    await navigator.clipboard.writeText(tsvContent);
    return true;
  } catch (err) {
    console.error('Erro ao copiar para área de transferência:', err);
    return false;
  }
};

/**
 * Copies ONLY data rows without headers (useful for appending rows at the end of a sheet)
 */
export const copyRowsOnlyToClipboardForSheets = async (records: CommissionRecord[]): Promise<boolean> => {
  try {
    const rows = generateSheetsRows(records);
    const tsvContent = rows.map(row => row.join('\t')).join('\n');
    await navigator.clipboard.writeText(tsvContent);
    return true;
  } catch (err) {
    console.error('Erro ao copiar para área de transferência:', err);
    return false;
  }
};

/**
 * Downloads a UTF-8 CSV file with BOM (\uFEFF) compatible with Google Sheets & Excel
 */
export const downloadGoogleSheetsCsv = (records: CommissionRecord[], filename: string = 'Comissoes_MMB_Sports_GoogleSheets.csv') => {
  const rows = generateSheetsRows(records);
  const csvRows = [
    GOOGLE_SHEETS_HEADERS.map(h => `"${h.replace(/"/g, '""')}"`).join(';'),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
  ];

  const csvString = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
