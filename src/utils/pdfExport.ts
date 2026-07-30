import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CommissionRecord } from '../types';
import { formatCurrency, formatDate } from './excel';
import { cleanClubeAndAtleta } from './athleteUtils';

interface ExportPdfOptions {
  monthLabel: string; // e.g. "Julho / 2026" or "Ano 2026 - Todos os Meses"
  year: number;
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
  doc.rect(0, 0, pageWidth, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('MMB SPORTS — RELATÓRIO DE NOTAS FISCAIS & COMISSÕES', 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(212, 212, 216);
  doc.text(`Documento para Contabilidade | Período: ${options.monthLabel}`, 14, 18);

  const todayStr = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  doc.text(`Gerado em: ${todayStr}`, pageWidth - 14, 18, { align: 'right' });

  // Calculate Summary metrics
  const totalRecords = records.length;
  const totalValor = records.reduce((acc, r) => acc + (r.valorComissao || 0), 0);
  
  const paidRecords = records.filter(r => r.pagoOuNao === 'SIM (PAGO)' || r.statusPagamento === 'Pago');
  const totalPaid = paidRecords.reduce((acc, r) => acc + (r.valorComissao || 0), 0);
  
  const pendingRecords = records.filter(r => r.pagoOuNao !== 'SIM (PAGO)' && r.statusPagamento !== 'Pago');
  const totalPending = pendingRecords.reduce((acc, r) => acc + (r.valorComissao || 0), 0);

  // Draw Summary KPI Box
  doc.setFillColor(244, 244, 245);
  doc.setDrawColor(212, 212, 216);
  doc.roundedRect(14, 28, pageWidth - 28, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(39, 39, 42);

  // KPI 1: Qtd Notas
  doc.text(`TOTAL DE NOTAS:`, 20, 35);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(9, 9, 11);
  doc.text(`${totalRecords} nota(s)`, 20, 41);

  // KPI 2: Total Bruto
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(39, 39, 42);
  doc.text(`VALOR TOTAL:`, 80, 35);
  doc.setTextColor(16, 185, 129); // Emerald
  doc.text(`${formatCurrency(totalValor)}`, 80, 41);

  // KPI 3: Total Pago
  doc.setTextColor(39, 39, 42);
  doc.text(`PAGO / LIQUIDADO:`, 150, 35);
  doc.setTextColor(37, 99, 235); // Blue
  doc.text(`${formatCurrency(totalPaid)} (${paidRecords.length})`, 150, 41);

  // KPI 4: Total Pendente
  doc.setTextColor(39, 39, 42);
  doc.text(`PENDENTE / A RECEBER:`, 220, 35);
  doc.setTextColor(225, 29, 72); // Rose
  doc.text(`${formatCurrency(totalPending)} (${pendingRecords.length})`, 220, 41);

  // Table Columns & Rows
  const tableHead = [
    [
      'Vencimento',
      'Clube',
      'Atleta',
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

    return [
      formatDate(r.dataVencimentoNF),
      cleaned.clube || '-',
      cleaned.atleta || '-',
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
    { content: 'TOTAL DO PERÍODO:', colSpan: 5, styles: { fontStyle: 'bold', halign: 'right' } },
    { content: `${totalRecords}`, styles: { fontStyle: 'bold', halign: 'center' } },
    { content: formatCurrency(totalValor), styles: { fontStyle: 'bold', halign: 'right', textColor: [16, 185, 129] } },
    { content: `Pago: ${formatCurrency(totalPaid)}`, colSpan: 2, styles: { fontStyle: 'bold', halign: 'center' } }
  ];

  autoTable(doc, {
    startY: 50,
    head: tableHead,
    body: [...tableBody, totalRow as any],
    margin: { left: 14, right: 14, bottom: 15 },
    styles: {
      fontSize: 8.5,
      cellPadding: 2.5,
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
      fontSize: 8.5
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250]
    },
    columnStyles: {
      0: { cellWidth: 24 }, // Vencimento
      1: { cellWidth: 32 }, // Clube
      2: { cellWidth: 42 }, // Atleta
      3: { cellWidth: 35 }, // Tipo
      4: { cellWidth: 35 }, // NF
      5: { cellWidth: 16, halign: 'center' }, // Parc
      6: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }, // Valor
      7: { cellWidth: 28, halign: 'center' }, // Status
      8: { cellWidth: 26, halign: 'center' }  // Data Pgto
    },
    didParseCell: (data) => {
      // Style status cell
      if (data.section === 'body' && data.column.index === 7) {
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
