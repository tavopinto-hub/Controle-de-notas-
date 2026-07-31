import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CommissionRecord } from '../types';
import { formatCurrency, formatDate } from './excel';
import { cleanClubeAndAtleta } from './athleteUtils';

export interface ExportPdfOptions {
  monthLabel: string; // e.g. "Julho / 2026" or "Ano 2026 - Todos os Meses"
  year?: number;
  agenteFilter?: string; // e.g. "Andre Brito" or "ALL"
  statusFilter?: string; // e.g. "A Emitir", "Pagas", "Emitidas", "Todas"
  searchTerm?: string;
  filename?: string;
}

export function generateMonthlyPdf(records: CommissionRecord[], options: ExportPdfOptions) {
  // Create A4 landscape PDF for optimal table width
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header section
  doc.setFillColor(24, 24, 27); // Dark zinc header banner
  doc.rect(0, 0, pageWidth, 26, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('MMB SPORTS — RELATÓRIO DE NOTAS FISCAIS & COMISSÕES', 14, 11);

  // Subtitle with active filters context
  let filterContextStr = `Período: ${options.monthLabel}`;
  if (options.agenteFilter && options.agenteFilter !== 'ALL') {
    filterContextStr += ` | AGENTE: ${options.agenteFilter.toUpperCase()}`;
  }
  if (options.statusFilter && options.statusFilter !== 'all' && options.statusFilter !== 'Todas') {
    filterContextStr += ` | STATUS: ${options.statusFilter.toUpperCase()}`;
  }
  if (options.searchTerm && options.searchTerm.trim() !== '') {
    filterContextStr += ` | BUSCA: "${options.searchTerm.trim()}"`;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(212, 212, 216);
  doc.text(filterContextStr, 14, 18);

  const todayStr = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  doc.setFontSize(8.5);
  doc.text(`Gerado em: ${todayStr}`, pageWidth - 14, 18, { align: 'right' });

  // Calculate Summary metrics
  const totalRecords = records.length;
  const totalValor = records.reduce((acc, r) => acc + (r.valorComissao || 0), 0);
  
  const paidRecords = records.filter(r => r.pagoOuNao === 'SIM (PAGO)' || r.pagoOuNao === 'SIM' || r.statusPagamento === 'Pago');
  const totalPaid = paidRecords.reduce((acc, r) => acc + (r.valorComissao || 0), 0);
  
  const pendingRecords = records.filter(r => r.pagoOuNao !== 'SIM (PAGO)' && r.pagoOuNao !== 'SIM' && r.statusPagamento !== 'Pago');
  const totalPending = pendingRecords.reduce((acc, r) => acc + (r.valorComissao || 0), 0);

  // Draw Summary KPI Box
  doc.setFillColor(244, 244, 245);
  doc.setDrawColor(212, 212, 216);
  doc.roundedRect(14, 29, pageWidth - 28, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(39, 39, 42);

  // KPI 1: Qtd Notas
  const kpi1Title = options.agenteFilter && options.agenteFilter !== 'ALL' ? `AGENTE (${options.agenteFilter.toUpperCase()}):` : `TOTAL DE NOTAS:`;
  doc.text(kpi1Title, 20, 36);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(9, 9, 11);
  doc.text(`${totalRecords} nota(s)`, 20, 42);

  // KPI 2: Total Bruto
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(39, 39, 42);
  doc.text(`VALOR TOTAL:`, 85, 36);
  doc.setTextColor(16, 185, 129); // Emerald
  doc.text(`${formatCurrency(totalValor)}`, 85, 42);

  // KPI 3: Total Pago
  doc.setTextColor(39, 39, 42);
  doc.text(`PAGO / LIQUIDADO:`, 150, 36);
  doc.setTextColor(37, 99, 235); // Blue
  doc.text(`${formatCurrency(totalPaid)} (${paidRecords.length})`, 150, 42);

  // KPI 4: Total Pendente
  doc.setTextColor(39, 39, 42);
  doc.text(`PENDENTE / A RECEBER:`, 220, 36);
  doc.setTextColor(225, 29, 72); // Rose
  doc.text(`${formatCurrency(totalPending)} (${pendingRecords.length})`, 220, 42);

  // Table Columns & Rows
  const tableHead = [
    [
      'Vencimento',
      'Clube',
      'Atleta',
      'Agente(s)',
      'Tipo / Serviço',
      'Nº Nota Fiscal',
      'Parc.',
      'Valor MMB',
      'Status Pagamento',
      'Data Pgto'
    ]
  ];

  const tableBody = records.map((r) => {
    const cleaned = cleanClubeAndAtleta(r.clube, r.atleta, r.clienteNome);
    const isPaid = r.pagoOuNao === 'SIM (PAGO)' || r.statusPagamento === 'Pago';
    const agentesArr = (r.agentes && r.agentes.length > 0) ? r.agentes : r.captadores;
    const agentesStr = (agentesArr && agentesArr.length > 0) ? agentesArr.join(', ') : '-';

    return [
      formatDate(r.dataVencimentoNF),
      cleaned.clube || '-',
      cleaned.atleta || '-',
      agentesStr,
      r.tipoContrato || r.servicoDescricao || 'Intermediação',
      r.numeroNF || 'Pendente',
      `${r.parcelaAtual || 1}/${r.totalParcelas || 1}`,
      formatCurrency(r.valorComissao || 0),
      isPaid ? 'PAGO' : 'PENDENTE',
      r.dataPagamento ? formatDate(r.dataPagamento) : '-'
    ];
  });

  // Total Summary Footer Row inside autoTable
  const totalRow = [
    { content: 'TOTAL DO PERÍODO:', colSpan: 6, styles: { fontStyle: 'bold', halign: 'right' } },
    { content: `${totalRecords}`, styles: { fontStyle: 'bold', halign: 'center' } },
    { content: formatCurrency(totalValor), styles: { fontStyle: 'bold', halign: 'right', textColor: [16, 185, 129] } },
    { content: `Pago: ${formatCurrency(totalPaid)}`, colSpan: 2, styles: { fontStyle: 'bold', halign: 'center' } }
  ];

  autoTable(doc, {
    startY: 50,
    head: tableHead,
    body: [...tableBody, totalRow as any],
    margin: { left: 10, right: 10, bottom: 15 },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      font: 'helvetica',
      textColor: [39, 39, 42],
      lineColor: [228, 228, 231],
      lineWidth: 0.2
    },
    headStyles: {
      fillColor: [39, 39, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
      fontSize: 8
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250]
    },
    columnStyles: {
      0: { cellWidth: 22 }, // Vencimento
      1: { cellWidth: 30 }, // Clube
      2: { cellWidth: 38 }, // Atleta
      3: { cellWidth: 38 }, // Captador(es)
      4: { cellWidth: 30 }, // Tipo
      5: { cellWidth: 30 }, // NF
      6: { cellWidth: 14, halign: 'center' }, // Parc
      7: { cellWidth: 28, halign: 'right', fontStyle: 'bold' }, // Valor
      8: { cellWidth: 25, halign: 'center' }, // Status Pagamento
      9: { cellWidth: 22, halign: 'center' }  // Data Pgto
    },
    didParseCell: (data) => {
      // Style status cell (Status Pagamento is at index 8)
      if (data.section === 'body' && data.column.index === 8) {
        if (data.cell.raw === 'PAGO') {
          data.cell.styles.textColor = [16, 185, 129];
          data.cell.styles.fontStyle = 'bold';
        } else if (data.cell.raw === 'PENDENTE') {
          data.cell.styles.textColor = [225, 29, 72];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawPage: (data) => {
      // Page Footer
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(113, 113, 122);
      
      doc.text(
        `MMB Sports — Relatório Contábil Mensal`,
        14,
        doc.internal.pageSize.getHeight() - 8
      );

      doc.text(
        `Página ${data.pageNumber} de ${pageCount}`,
        pageWidth - 14,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'right' }
      );
    }
  });

  const cleanMonthName = options.monthLabel.replace(/[^a-zA-Z0-9_-]/g, '_');
  const finalFilename = options.filename || `Relatorio_Contabilidade_NFs_${cleanMonthName}.pdf`;

  doc.save(finalFilename);
}
