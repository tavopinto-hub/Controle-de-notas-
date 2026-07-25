import * as XLSX from 'xlsx';
import { CommissionRecord } from '../types';
import { cleanClubeAndAtleta } from './athleteUtils';

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
}

export function formatDate(dateString?: string): string {
  if (!dateString) return '-';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateString;
}

export function generateExcelWorkbook(records: CommissionRecord[]): XLSX.WorkBook {
  const dataForSheet = records.map((rec) => {
    const cleaned = cleanClubeAndAtleta(rec.clube, rec.atleta, rec.clienteNome);
    return {
      'DATA': formatDate(rec.dataVencimentoNF),
      'VALOR MMB': rec.valorComissao || 0,
      'Clube': cleaned.clube,
      'Atleta': cleaned.atleta,
      'Tipo de contrato': rec.tipoContrato || rec.servicoDescricao || 'Intermediação',
      'NF': rec.numeroNF || 'Não emitida',
      'Parcelas': `${rec.parcelaAtual || 1}/${rec.totalParcelas || 1}`,
      'Pagamento': rec.dataPagamento ? formatDate(rec.dataPagamento) : 'Pendente',
      'PAGO OU NÃO': rec.pagoOuNao || (rec.statusPagamento === 'Pago' ? 'SIM (PAGO)' : 'NÃO'),
      'Data do contrato': rec.dataContrato ? formatDate(rec.dataContrato) : formatDate(rec.criadoEm?.split('T')[0]),
      'OBS': rec.observacoes || ''
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(dataForSheet);

  // Set column widths for exact 11 columns
  worksheet['!cols'] = [
    { wch: 14 }, // DATA
    { wch: 18 }, // VALOR MMB
    { wch: 28 }, // Clube
    { wch: 24 }, // Atleta
    { wch: 22 }, // Tipo de contrato
    { wch: 16 }, // NF
    { wch: 12 }, // Parcelas
    { wch: 14 }, // Pagamento
    { wch: 16 }, // PAGO OU NÃO
    { wch: 16 }, // Data do contrato
    { wch: 35 }  // OBS
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Controle MMB Sports');

  return workbook;
}

export function exportToExcel(records: CommissionRecord[], filename = 'Controle_Comissoes_NFs.xlsx'): void {
  const workbook = generateExcelWorkbook(records);
  XLSX.writeFile(workbook, filename);
}

export function exportToCSV(records: CommissionRecord[], filename = 'Controle_Comissoes_NFs.csv'): void {
  const workbook = generateExcelWorkbook(records);
  XLSX.writeFile(workbook, filename, { bookType: 'csv' });
}

export function getExcelBase64Buffer(records: CommissionRecord[]): string {
  const workbook = generateExcelWorkbook(records);
  const base64Str = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
  return base64Str;
}
