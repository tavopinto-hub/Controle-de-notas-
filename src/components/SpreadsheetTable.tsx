import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Download, FileSpreadsheet, Search, Plus, Trash2, Edit2, CheckCircle2,
  AlertTriangle, Clock, Filter, ArrowUpDown, Send, FileText, ExternalLink, CopyX, UserCheck,
  ChevronLeft, ChevronRight, Calendar, RotateCcw, X, FileDown, Users, Copy
} from 'lucide-react';
import { CommissionRecord, StatusNF, StatusPagamento } from '../types';
import { formatCurrency, formatDate, exportToExcel, exportToCSV } from '../utils/excel';
import { getRecordYear, isPastDate } from '../utils/dateUtils';
import { cleanClubeAndAtleta } from '../utils/athleteUtils';
import { deduplicateRecords } from '../App';
import { generateMonthlyPdf } from '../utils/pdfExport';
import { PREDEFINED_AGENTES, getAgenteColor } from '../constants/captadores';
import { PdfExportModal } from './PdfExportModal';

const getCurrentIsoMonth = (): string => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
};

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const formatIsoMonthLabel = (isoMonth: string): string => {
  if (!isoMonth || isoMonth === 'ALL') return 'Todos os Meses';
  const parts = isoMonth.split('-');
  if (parts.length < 2) return isoMonth;
  const yyyy = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) return isoMonth;
  return `${MONTH_NAMES_PT[monthIdx]} ${yyyy}`;
};

interface SpreadsheetTableProps {
  records: CommissionRecord[];
  selectedYear?: string;
  activeTab?: 'all' | 'nao_emitida' | 'fora_prazo' | 'emitida' | 'nao_autorizada' | 'pago';
  onTabChange?: (tab: 'all' | 'nao_emitida' | 'fora_prazo' | 'emitida' | 'nao_autorizada' | 'pago') => void;
  onUpdateRecord: (record: CommissionRecord) => void;
  onDeleteRecord: (id: string) => void;
  onDuplicateRecord?: (record: CommissionRecord) => void;
  onAddNewRecord: () => void;
  onOpenEmailModal: () => void;
  onViewRecordDetail: (record: CommissionRecord) => void;
  onDeduplicateRecords?: () => void;
  onSeparateAtletas?: () => void;
}

export const SpreadsheetTable: React.FC<SpreadsheetTableProps> = ({
  records,
  selectedYear = 'ALL',
  activeTab: controlledActiveTab,
  onTabChange,
  onUpdateRecord,
  onDeleteRecord,
  onDuplicateRecord,
  onAddNewRecord,
  onOpenEmailModal,
  onViewRecordDetail,
  onDeduplicateRecords,
  onSeparateAtletas
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [internalTab, setInternalTab] = useState<'all' | 'nao_emitida' | 'fora_prazo' | 'emitida' | 'nao_autorizada' | 'pago'>('all');
  
  const activeTab = controlledActiveTab !== undefined ? controlledActiveTab : internalTab;

  const currentIsoMonth = getCurrentIsoMonth();
  const [selectedMonth, setSelectedMonth] = useState<string>(currentIsoMonth);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [dateField, setDateField] = useState<'dataVencimentoNF' | 'dataContrato' | 'dataPagamento'>('dataVencimentoNF');
  const [selectedCaptadorFilter, setSelectedCaptadorFilter] = useState<string>('ALL');
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);

  const monthScrollRef = useRef<HTMLDivElement>(null);
  const activeMonthPillRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll active month pill into view on mount or change
  useEffect(() => {
    if (activeMonthPillRef.current) {
      activeMonthPillRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
      });
    }
  }, [selectedMonth]);

  // Helper to extract YYYY-MM from record date
  const getRecordIsoMonth = (
    rec: CommissionRecord,
    field: 'dataVencimentoNF' | 'dataContrato' | 'dataPagamento' = 'dataVencimentoNF'
  ): string => {
    const val = rec[field] || rec.dataVencimentoNF || rec.dataContrato;
    if (!val) return '';
    if (val.includes('-')) {
      const parts = val.split('-');
      if (parts.length >= 2) return `${parts[0]}-${parts[1].padStart(2, '0')}`;
    }
    if (val.includes('/')) {
      const parts = val.split('/');
      if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}`;
    }
    return '';
  };

  // Generate continuous month list from -12 months to +18 months + any record months
  const generatedMonthsList = useMemo(() => {
    const setMonths = new Set<string>();
    const now = new Date();
    const currentY = now.getFullYear();
    const currentM = now.getMonth();

    for (let i = -12; i <= 18; i++) {
      const d = new Date(currentY, currentM + i, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      setMonths.add(`${yyyy}-${mm}`);
    }

    records.forEach((rec) => {
      const mIso = getRecordIsoMonth(rec, dateField);
      if (mIso && /^\d{4}-\d{2}$/.test(mIso)) {
        setMonths.add(mIso);
      }
    });

    return Array.from(setMonths).sort();
  }, [records, dateField]);

  const countRecordsForMonth = (isoMonth: string): number => {
    return records.filter(r => getRecordIsoMonth(r, dateField) === isoMonth).length;
  };

  const scrollMonthBar = (direction: 'left' | 'right') => {
    if (monthScrollRef.current) {
      const amount = direction === 'left' ? -260 : 260;
      monthScrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  const handleSelectMonth = (mIso: string) => {
    setSelectedMonth(mIso);
    setStartDate('');
    setEndDate('');
  };

  const handleGoToCurrentMonth = () => {
    setSelectedMonth(currentIsoMonth);
    setStartDate('');
    setEndDate('');
  };

  const handleClearDateRange = () => {
    setStartDate('');
    setEndDate('');
  };

  const handleApplyPreset = (preset: 'mes_atual' | 'proximo_mes' | 'mes_anterior' | 'este_ano' | 'todos') => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = now.getMonth();

    if (preset === 'mes_atual') {
      const curIso = `${yyyy}-${String(mm + 1).padStart(2, '0')}`;
      setSelectedMonth(curIso);
      setStartDate('');
      setEndDate('');
    } else if (preset === 'proximo_mes') {
      const nextD = new Date(yyyy, mm + 1, 1);
      const nextIso = `${nextD.getFullYear()}-${String(nextD.getMonth() + 1).padStart(2, '0')}`;
      setSelectedMonth(nextIso);
      setStartDate('');
      setEndDate('');
    } else if (preset === 'mes_anterior') {
      const prevD = new Date(yyyy, mm - 1, 1);
      const prevIso = `${prevD.getFullYear()}-${String(prevD.getMonth() + 1).padStart(2, '0')}`;
      setSelectedMonth(prevIso);
      setStartDate('');
      setEndDate('');
    } else if (preset === 'este_ano') {
      setSelectedMonth('ALL');
      setStartDate(`${yyyy}-01-01`);
      setEndDate(`${yyyy}-12-31`);
    } else if (preset === 'todos') {
      setSelectedMonth('ALL');
      setStartDate('');
      setEndDate('');
    }
  };

  const handleSelectTab = (tab: 'all' | 'nao_emitida' | 'fora_prazo' | 'emitida' | 'nao_autorizada' | 'pago') => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  // Toggle NF Status quickly
  const handleToggleNFStatus = (record: CommissionRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    let nextStatus: StatusNF = 'Emitida';
    let dataEmissaoNF = record.dataEmissaoNF;
    let numeroNF = record.numeroNF;

    if (record.statusNF === 'Emitida') {
      nextStatus = 'Não emitida';
    } else if (record.statusNF === 'Não emitida' || record.statusNF === 'Pendente') {
      nextStatus = 'Não autorizada';
    } else {
      nextStatus = 'Emitida';
      dataEmissaoNF = new Date().toISOString().split('T')[0];
      if (!numeroNF) {
        numeroNF = `NF-00${Math.floor(1000 + Math.random() * 9000)}`;
      }
    }

    onUpdateRecord({
      ...record,
      statusNF: nextStatus,
      dataEmissaoNF,
      numeroNF
    });
  };

  // Toggle Pagamento Status quickly
  const handleTogglePagamento = (record: CommissionRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    let nextStatus: StatusPagamento = 'Aguardando';
    let dataPagamento = record.dataPagamento;

    if (record.statusPagamento === 'Aguardando') {
      nextStatus = 'Pago';
      dataPagamento = new Date().toISOString().split('T')[0];
    } else if (record.statusPagamento === 'Pago') {
      nextStatus = 'Atrasado';
      dataPagamento = undefined;
    } else {
      nextStatus = 'Aguardando';
      dataPagamento = undefined;
    }

    onUpdateRecord({
      ...record,
      statusPagamento: nextStatus,
      dataPagamento
    });
  };

  const [sortField, setSortField] = useState<keyof CommissionRecord>('dataVencimentoNF');
  const [sortAsc, setSortAsc] = useState(true);

  // 1. First filter records by selectedYear
  const yearFilteredRecords = records.filter(rec => {
    if (selectedYear === 'ALL') return true;
    return getRecordYear(rec) === selectedYear;
  });

  // Calculate live duplicate count metric
  const duplicateCount = useMemo(() => {
    return Math.max(0, records.length - deduplicateRecords(records).length);
  }, [records]);

  // 2. Filter by Month & Date Range
  const dateFilteredRecords = yearFilteredRecords.filter(rec => {
    const recordDate = rec[dateField] || rec.dataVencimentoNF;
    if (!recordDate) return false;

    let isoDate = recordDate;
    if (recordDate.includes('/')) {
      const parts = recordDate.split('/');
      if (parts.length === 3) {
        isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }

    // Custom date range filtering
    if (startDate && isoDate < startDate) return false;
    if (endDate && isoDate > endDate) return false;

    // Selected Month filtering (if no explicit custom start/end date overrides)
    if (selectedMonth !== 'ALL' && !startDate && !endDate) {
      const recMonth = getRecordIsoMonth(rec, dateField);
      if (recMonth !== selectedMonth) return false;
    }

    return true;
  });

  // 3. Filtered & sorted records by activeTab status, search term and agente filter
  const filteredRecords = dateFilteredRecords.filter(rec => {
    const searchLower = searchTerm.toLowerCase();
    const agentesList = rec.agentes || rec.captadores || [];
    const matchesSearch =
      rec.clienteNome.toLowerCase().includes(searchLower) ||
      rec.numeroContrato.toLowerCase().includes(searchLower) ||
      rec.clienteCnpjCpf.toLowerCase().includes(searchLower) ||
      (rec.clube && rec.clube.toLowerCase().includes(searchLower)) ||
      (rec.atleta && rec.atleta.toLowerCase().includes(searchLower)) ||
      (rec.numeroNF && rec.numeroNF.toLowerCase().includes(searchLower)) ||
      (agentesList.some(c => c.toLowerCase().includes(searchLower)));

    if (!matchesSearch) return false;

    if (selectedCaptadorFilter !== 'ALL') {
      if (!agentesList.includes(selectedCaptadorFilter)) {
        return false;
      }
    }

    if (activeTab === 'nao_emitida') {
      return rec.statusNF === 'Não emitida' || rec.statusNF === 'Pendente' || rec.statusNF !== 'Emitida';
    }
    if (activeTab === 'fora_prazo') {
      const isUnissued = rec.statusNF === 'Não emitida' || rec.statusNF === 'Pendente' || rec.statusNF !== 'Emitida';
      return isUnissued && isPastDate(rec.dataVencimentoNF);
    }
    if (activeTab === 'emitida') {
      return rec.statusNF === 'Emitida';
    }
    if (activeTab === 'nao_autorizada') {
      return rec.statusNF === 'Não autorizada';
    }
    if (activeTab === 'pago') {
      return rec.statusPagamento === 'Pago' || rec.pagoOuNao === 'SIM (PAGO)' || rec.pagoOuNao === 'SIM';
    }

    return true;
  }).sort((a, b) => {
    const valA = a[sortField] || '';
    const valB = b[sortField] || '';
    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  const handleSort = (field: keyof CommissionRecord) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleExportPdf = () => {
    // Export exact currently filtered records (respecting month, status tab, agente, search term)
    let label = formatIsoMonthLabel(selectedMonth);
    if (startDate || endDate) {
      label = `Período (${formatDate(startDate)} a ${formatDate(endDate)})`;
    } else if (selectedMonth === 'ALL') {
      label = `Ano ${selectedYear} (Todos os Meses)`;
    }

    let statusLabel = 'Todas';
    if (activeTab === 'nao_emitida') statusLabel = 'A Emitir';
    else if (activeTab === 'fora_prazo') statusLabel = 'Fora do Prazo';
    else if (activeTab === 'emitida') statusLabel = 'Emitidas';
    else if (activeTab === 'pago') statusLabel = 'Pagas';
    else if (activeTab === 'nao_autorizada') statusLabel = 'Não Autorizadas';

    const filenameAgente = selectedCaptadorFilter !== 'ALL' ? `_Agente_${selectedCaptadorFilter.replace(/\s+/g, '_')}` : '';
    const cleanLabel = label.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Relatorio_Contabilidade_NFs${filenameAgente}_${cleanLabel}.pdf`;

    generateMonthlyPdf(filteredRecords, {
      monthLabel: label,
      year: parseInt(selectedYear || '2026', 10),
      agenteFilter: selectedCaptadorFilter,
      statusFilter: statusLabel,
      searchTerm: searchTerm,
      filename: filename
    });
  };

  return (
    <div className="bg-white border-4 border-zinc-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] overflow-hidden mb-8">
      {/* Table Header Controls */}
      <div className="p-4 sm:p-5 border-b-4 border-zinc-900 bg-zinc-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-zinc-900 text-emerald-400 border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex-shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-black uppercase tracking-tight text-zinc-900">
              Planilha de Controle de NFs & Comissões
            </h2>
            <p className="text-[11px] sm:text-xs font-bold text-zinc-500 uppercase tracking-wider">
              {filteredRecords.length} de {records.length} registro(s) exibido(s)
            </p>
          </div>
        </div>

        {/* Top actions: Export Excel / CSV / PDF Contadora / PDF por Agente / Email / Add Record - Responsive Grid */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <button
            onClick={handleExportPdf}
            title="Exportar relatório PDF da visualização atual (respeita filtros ativos)"
            className="inline-flex items-center justify-center space-x-1 px-2.5 py-2 sm:px-3 bg-rose-600 hover:bg-rose-500 text-white border-2 border-zinc-900 text-[11px] sm:text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 min-h-[40px] cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5 text-white flex-shrink-0" />
            <span>PDF Filtros Atuais ({filteredRecords.length})</span>
          </button>

          <button
            onClick={() => setIsPdfModalOpen(true)}
            title="Gerar PDF personalizado filtrado por Agente, Mês e Status das Notas"
            className="inline-flex items-center justify-center space-x-1 px-2.5 py-2 sm:px-3 bg-amber-400 hover:bg-amber-300 text-zinc-950 border-2 border-zinc-900 text-[11px] sm:text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 min-h-[40px] cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 text-zinc-950 flex-shrink-0" />
            <span>PDF por Agente / Filtros ⚙️</span>
          </button>

          <button
            onClick={() => exportToExcel(records)}
            className="inline-flex items-center justify-center space-x-1 px-2.5 py-2 sm:px-3 bg-white border-2 border-zinc-900 text-zinc-900 hover:bg-zinc-100 text-[11px] sm:text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 min-h-[40px]"
          >
            <Download className="w-3.5 h-3.5 text-zinc-900 flex-shrink-0" />
            <span>.XLSX</span>
          </button>

          <button
            onClick={() => exportToCSV(records)}
            className="inline-flex items-center justify-center space-x-1 px-2.5 py-2 sm:px-3 bg-white border-2 border-zinc-900 text-zinc-900 hover:bg-zinc-100 text-[11px] sm:text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 min-h-[40px]"
          >
            <FileText className="w-3.5 h-3.5 text-zinc-900 flex-shrink-0" />
            <span>CSV</span>
          </button>

          <button
            onClick={onOpenEmailModal}
            className="inline-flex items-center justify-center space-x-1 px-2.5 py-2 sm:px-3 bg-zinc-900 text-white hover:bg-zinc-800 border-2 border-zinc-900 text-[11px] sm:text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 min-h-[40px]"
          >
            <Send className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span>E-mail</span>
          </button>

          {onDeduplicateRecords && (
            <button
              onClick={onDeduplicateRecords}
              title="Analisar e remover notas duplicadas da planilha"
              className={`inline-flex items-center justify-center space-x-1 px-2.5 py-2 sm:px-3 border-2 border-zinc-900 text-zinc-950 text-[11px] sm:text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 min-h-[40px] cursor-pointer ${
                duplicateCount > 0
                  ? 'bg-amber-400 hover:bg-amber-300 animate-pulse'
                  : 'bg-amber-200 hover:bg-amber-300'
              }`}
            >
              <CopyX className="w-3.5 h-3.5 text-zinc-950 flex-shrink-0" />
              <span>Limpar Duplicados</span>
              <span className={`px-1.5 py-0.5 text-[9px] font-mono border border-zinc-900 font-bold ${
                duplicateCount > 0 ? 'bg-rose-500 text-white' : 'bg-emerald-400 text-zinc-950'
              }`}>
                {duplicateCount > 0 ? `${duplicateCount} dup!` : '0 dup'}
              </span>
            </button>
          )}

          {onSeparateAtletas && (
            <button
              onClick={onSeparateAtletas}
              title="Mover nomes de atletas colados no clube para a coluna Atleta"
              className="inline-flex items-center justify-center space-x-1 px-2.5 py-2 sm:px-3 bg-sky-200 hover:bg-sky-300 border-2 border-zinc-900 text-zinc-950 text-[11px] sm:text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 min-h-[40px]"
            >
              <UserCheck className="w-3.5 h-3.5 text-zinc-950 flex-shrink-0" />
              <span>✨ Separar Atletas</span>
            </button>
          )}

          <button
            onClick={onAddNewRecord}
            className="col-span-2 sm:col-span-1 inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 bg-emerald-400 hover:bg-emerald-300 text-zinc-950 border-2 border-zinc-900 text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 min-h-[40px]"
          >
            <Plus className="w-4 h-4 text-zinc-950 flex-shrink-0" />
            <span>Nova Comissão</span>
          </button>
        </div>
      </div>

      {/* Horizontal Scrollable Month Bar */}
      <div className="bg-zinc-900 border-b-4 border-zinc-900 p-3 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-2">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-black uppercase tracking-wider text-amber-300">
              Navegação por Mês (Notas & Vencimentos)
            </span>
            {selectedMonth === currentIsoMonth && !startDate && !endDate && (
              <span className="bg-emerald-400 text-zinc-950 text-[10px] font-black uppercase px-2 py-0.5 border border-zinc-900">
                Mês Atual
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 self-end sm:self-auto">
            <button
              onClick={handleExportPdf}
              title="Baixar PDF formatado das notas do mês selecionado para envio à contadora"
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] uppercase border border-zinc-900 transition active:translate-x-0.5 cursor-pointer flex items-center space-x-1"
            >
              <FileDown className="w-3 h-3 text-white" />
              <span>📄 PDF do Mês</span>
            </button>
            <button
              onClick={handleGoToCurrentMonth}
              className="px-2.5 py-1 bg-amber-400 text-zinc-950 hover:bg-amber-300 font-black text-[10px] uppercase border border-zinc-900 transition active:translate-x-0.5 cursor-pointer"
            >
              🎯 Ir para Mês Atual
            </button>
            <button
              onClick={() => { setSelectedMonth('ALL'); setStartDate(''); setEndDate(''); }}
              className={`px-2.5 py-1 font-black text-[10px] uppercase border border-zinc-900 transition cursor-pointer ${
                selectedMonth === 'ALL' && !startDate && !endDate
                  ? 'bg-white text-zinc-950 border-amber-400'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              ♾️ Ver Todos os Meses
            </button>
          </div>
        </div>

        {/* Scrollable Month Strip with Left/Right Arrow Controls */}
        <div className="relative flex items-center">
          <button
            type="button"
            onClick={() => scrollMonthBar('left')}
            className="z-10 p-2 bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-zinc-700 mr-1 flex-shrink-0 cursor-pointer"
            title="Mês Anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div
            ref={monthScrollRef}
            className="flex items-center space-x-2 overflow-x-auto py-1.5 scroll-smooth no-scrollbar w-full"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <button
              onClick={() => { setSelectedMonth('ALL'); setStartDate(''); setEndDate(''); }}
              className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border transition flex-shrink-0 flex items-center space-x-1.5 cursor-pointer ${
                selectedMonth === 'ALL' && !startDate && !endDate
                  ? 'bg-amber-400 text-zinc-950 border-white shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]'
                  : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
              }`}
            >
              <span>Todos os Meses</span>
              <span className="text-[10px] opacity-80 font-mono">({records.length})</span>
            </button>

            {generatedMonthsList.map((mIso) => {
              const isCurrent = mIso === currentIsoMonth;
              const isSelected = selectedMonth === mIso && !startDate && !endDate;
              const countInMonth = countRecordsForMonth(mIso);

              return (
                <button
                  key={mIso}
                  ref={isSelected ? activeMonthPillRef : null}
                  onClick={() => handleSelectMonth(mIso)}
                  className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border transition flex-shrink-0 flex items-center space-x-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-amber-400 text-zinc-950 border-white font-black shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]'
                      : isCurrent
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500 hover:bg-emerald-900'
                      : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                  }`}
                >
                  {isCurrent && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />}
                  <span>{formatIsoMonthLabel(mIso)}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 font-mono ${
                    isSelected ? 'bg-zinc-950 text-amber-300' : 'bg-zinc-900 text-zinc-400'
                  }`}>
                    {countInMonth} NFs
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => scrollMonthBar('right')}
            className="z-10 p-2 bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-zinc-700 ml-1 flex-shrink-0 cursor-pointer"
            title="Próximo Mês"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Custom Date Range Filter Toolbar */}
      <div className="bg-amber-50/80 border-b-2 border-zinc-900 px-4 py-2.5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center space-x-1 font-black text-zinc-900 uppercase">
            <Filter className="w-3.5 h-3.5 text-amber-600" />
            <span>Filtro de Data:</span>
          </div>

          <select
            value={dateField}
            onChange={(e) => setDateField(e.target.value as any)}
            className="px-2 py-1 bg-white border-2 border-zinc-900 font-bold text-zinc-900 focus:outline-none text-xs cursor-pointer"
          >
            <option value="dataVencimentoNF">Vencimento da NF</option>
            <option value="dataContrato">Data do Contrato</option>
            <option value="dataPagamento">Data do Pagamento</option>
          </select>

          <div className="flex items-center space-x-1 bg-white border-2 border-zinc-900 px-2 py-0.5">
            <span className="font-bold text-zinc-600 text-[10px] uppercase">De:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (e.target.value) setSelectedMonth('ALL');
              }}
              className="bg-transparent font-mono font-bold text-zinc-900 focus:outline-none text-xs"
            />
          </div>

          <div className="flex items-center space-x-1 bg-white border-2 border-zinc-900 px-2 py-0.5">
            <span className="font-bold text-zinc-600 text-[10px] uppercase">Até:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                if (e.target.value) setSelectedMonth('ALL');
              }}
              className="bg-transparent font-mono font-bold text-zinc-900 focus:outline-none text-xs"
            />
          </div>

          {/* Agente Filter Dropdown */}
          <div className="flex items-center space-x-1 bg-indigo-50 border-2 border-zinc-900 px-2 py-0.5">
            <Users className="w-3.5 h-3.5 text-indigo-700" />
            <select
              value={selectedCaptadorFilter}
              onChange={(e) => setSelectedCaptadorFilter(e.target.value)}
              className="bg-transparent font-black text-indigo-950 text-xs focus:outline-none cursor-pointer"
            >
              <option value="ALL">Todos os Agentes</option>
              {PREDEFINED_AGENTES.map((cap) => (
                <option key={cap} value={cap}>
                  Agente: {cap}
                </option>
              ))}
            </select>
          </div>

          {(startDate || endDate || selectedCaptadorFilter !== 'ALL') && (
            <button
              onClick={() => {
                handleClearDateRange();
                setSelectedCaptadorFilter('ALL');
              }}
              className="px-2 py-1 bg-rose-200 hover:bg-rose-300 text-rose-950 border border-zinc-900 font-black uppercase text-[10px] flex items-center space-x-1 cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Limpar Filtros</span>
            </button>
          )}
        </div>

        {/* Quick Date Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-black uppercase text-zinc-500 mr-0.5">Atalhos:</span>
          <button
            onClick={() => handleApplyPreset('mes_atual')}
            className="px-2.5 py-1 bg-white hover:bg-amber-200 border border-zinc-900 font-bold text-[11px] uppercase text-zinc-900 transition cursor-pointer"
          >
            Mês Atual
          </button>
          <button
            onClick={() => handleApplyPreset('proximo_mes')}
            className="px-2.5 py-1 bg-white hover:bg-amber-200 border border-zinc-900 font-bold text-[11px] uppercase text-zinc-900 transition cursor-pointer"
          >
            Próximo Mês
          </button>
          <button
            onClick={() => handleApplyPreset('mes_anterior')}
            className="px-2.5 py-1 bg-white hover:bg-amber-200 border border-zinc-900 font-bold text-[11px] uppercase text-zinc-900 transition cursor-pointer"
          >
            Mês Anterior
          </button>
          <button
            onClick={() => handleApplyPreset('este_ano')}
            className="px-2.5 py-1 bg-white hover:bg-amber-200 border border-zinc-900 font-bold text-[11px] uppercase text-zinc-900 transition cursor-pointer"
          >
            Este Ano
          </button>
        </div>
      </div>

      {/* Active Filter Context Banner */}
      {(selectedMonth !== 'ALL' || startDate || endDate) && (
        <div className="bg-amber-300 border-b-2 border-zinc-900 px-4 py-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-black text-zinc-950 uppercase tracking-tight">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-zinc-950 flex-shrink-0" />
            <span>
              {startDate || endDate
                ? `📅 Filtrando por Intervalo: ${startDate || 'Início'} até ${endDate || 'Fim'}`
                : `📅 Exibindo Conteúdo do Mês: ${formatIsoMonthLabel(selectedMonth)}`}
            </span>
            {selectedMonth === currentIsoMonth && !startDate && !endDate && (
              <span className="bg-emerald-400 text-zinc-950 px-2 py-0.5 border border-zinc-900 text-[10px]">
                Mês Atual 📌
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3 self-end sm:self-auto">
            <span className="text-[11px]">
              Total no período: <strong className="text-emerald-950 font-mono text-xs">{formatCurrency(dateFilteredRecords.reduce((acc, r) => acc + (r.valorComissao || 0), 0))}</strong> ({dateFilteredRecords.length} NFs)
            </span>
            <button
              onClick={() => handleApplyPreset('todos')}
              className="text-[10px] bg-zinc-900 text-white px-2 py-1 border border-zinc-900 hover:bg-zinc-800 transition cursor-pointer"
            >
              Ver Todos os Meses
            </button>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div className="px-5 py-3 border-b-2 border-zinc-900 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Tabs */}
        <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <button
            onClick={() => handleSelectTab('all')}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-zinc-900 transition whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
            }`}
          >
            Todas ({dateFilteredRecords.length})
          </button>
          <button
            onClick={() => handleSelectTab('nao_emitida')}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-zinc-900 transition whitespace-nowrap ${
              activeTab === 'nao_emitida'
                ? 'bg-amber-400 text-zinc-950'
                : 'bg-amber-100 text-amber-950 hover:bg-amber-200'
            }`}
          >
            A Emitir ({dateFilteredRecords.filter(r => r.statusNF !== 'Emitida').length})
          </button>
          <button
            onClick={() => handleSelectTab('fora_prazo')}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-zinc-900 transition whitespace-nowrap ${
              activeTab === 'fora_prazo'
                ? 'bg-red-600 text-white'
                : 'bg-red-100 text-red-950 hover:bg-red-200'
            }`}
          >
            Fora do Prazo ⚠️ ({dateFilteredRecords.filter(r => r.statusNF !== 'Emitida' && isPastDate(r.dataVencimentoNF)).length})
          </button>
          <button
            onClick={() => handleSelectTab('emitida')}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-zinc-900 transition whitespace-nowrap ${
              activeTab === 'emitida'
                ? 'bg-sky-400 text-zinc-950'
                : 'bg-sky-100 text-sky-950 hover:bg-sky-200'
            }`}
          >
            Emitidas ({dateFilteredRecords.filter(r => r.statusNF === 'Emitida').length})
          </button>
          <button
            onClick={() => handleSelectTab('pago')}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-zinc-900 transition whitespace-nowrap ${
              activeTab === 'pago'
                ? 'bg-emerald-400 text-zinc-950'
                : 'bg-emerald-100 text-emerald-950 hover:bg-emerald-200'
            }`}
          >
            Pagas 🟢 ({dateFilteredRecords.filter(r => r.statusPagamento === 'Pago' || r.pagoOuNao === 'SIM (PAGO)' || r.pagoOuNao === 'SIM').length})
          </button>
          <button
            onClick={() => handleSelectTab('nao_autorizada')}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-zinc-900 transition whitespace-nowrap ${
              activeTab === 'nao_autorizada'
                ? 'bg-rose-400 text-zinc-950'
                : 'bg-rose-100 text-rose-950 hover:bg-rose-200'
            }`}
          >
            Não Autorizadas ({dateFilteredRecords.filter(r => r.statusNF === 'Não autorizada').length})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-zinc-900 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente, contrato..."
            className="w-full pl-9 pr-3 py-1.5 bg-zinc-50 border-2 border-zinc-900 text-xs font-bold text-zinc-900 placeholder-zinc-400 focus:outline-none focus:bg-white"
          />
        </div>
      </div>

      {/* Mobile Card List (Visible on mobile devices < 768px) */}
      <div className="block md:hidden p-3 bg-zinc-100/80 space-y-3 border-b-2 border-zinc-900">
        {filteredRecords.length === 0 ? (
          <div className="py-8 text-center text-zinc-500 font-bold uppercase tracking-wider bg-white p-4 border-2 border-zinc-900">
            Nenhum registro de comissão encontrado.
          </div>
        ) : (
          filteredRecords.map((record, index) => {
            const todayStr = new Date().toISOString().split('T')[0];
            const isOverdueNF = record.statusNF === 'Pendente' && record.dataVencimentoNF < todayStr;
            const isDueToday = record.statusNF === 'Pendente' && record.dataVencimentoNF === todayStr;
            const isPago = record.statusPagamento === 'Pago' || record.pagoOuNao === 'Pago' || record.pagoOuNao === 'SIM (PAGO)';
            const cleaned = cleanClubeAndAtleta(record.clube, record.atleta, record.clienteNome);

            return (
              <div
                key={`mobile-${record.id}`}
                onClick={() => onViewRecordDetail(record)}
                className="bg-white border-2 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] p-3.5 space-y-2.5 transition active:scale-[0.99] cursor-pointer"
              >
                {/* Header Row: Index + Valor + Parcela */}
                <div className="flex items-center justify-between gap-2 border-b-2 border-zinc-900 pb-2">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-6 h-6 bg-zinc-900 text-white font-mono font-black text-xs flex items-center justify-center border border-zinc-900">
                      {index + 1}
                    </span>
                    <div className={`inline-flex items-center px-2 py-0.5 border border-zinc-900 font-mono font-bold text-[11px] ${
                      isOverdueNF ? 'bg-rose-400 text-zinc-950' : isDueToday ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-100 text-zinc-900'
                    }`}>
                      {formatDate(record.dataVencimentoNF)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono font-black text-emerald-950 text-base">
                      {formatCurrency(record.valorComissao)}
                    </div>
                    <div className="flex items-center justify-end space-x-1 mt-0.5">
                      <span className="text-[10px] font-mono font-bold bg-purple-200 text-purple-950 px-1.5 py-0.5 border border-zinc-900">
                        Parc. {record.parcelaAtual || 1}/{record.totalParcelas || 1}
                      </span>
                      <span className="text-[10px] font-mono font-bold bg-amber-200 text-amber-950 px-1.5 py-0.5 border border-zinc-900">
                        {formatIsoMonthLabel(getRecordIsoMonth(record, 'dataVencimentoNF'))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Main Info: Clube + Atleta + Captadores */}
                <div>
                  <div className="font-black text-sm uppercase text-zinc-900">
                    {cleaned.clube}
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-700 font-bold mt-0.5">
                    <span>Atleta: <strong className="text-zinc-900 uppercase">{cleaned.atleta}</strong></span>
                    <span className="text-[10px] bg-zinc-100 px-1.5 py-0.5 border border-zinc-900 uppercase">{record.tipoContrato || record.servicoDescricao || 'Intermediação'}</span>
                  </div>
                  {/* Agentes Badges */}
                  {((record.agentes && record.agentes.length > 0) || (record.captadores && record.captadores.length > 0)) && (
                    <div className="flex flex-wrap gap-1 mt-1.5 pt-1.5 border-t border-zinc-100">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase self-center mr-0.5">Agente(s):</span>
                      {(record.agentes || record.captadores || []).map(cap => {
                        const colors = getAgenteColor(cap);
                        return (
                          <span
                            key={cap}
                            className={`px-1.5 py-0.5 text-[10px] font-black uppercase border ${colors.bg} ${colors.text} ${colors.border}`}
                          >
                            {cap}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Status Toggles for Mobile Touch */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-200">
                  <button
                    type="button"
                    onClick={(e) => handleToggleNFStatus(record, e)}
                    className={`flex items-center justify-center space-x-1 py-2 px-2 text-[10px] font-black uppercase border border-zinc-900 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 ${
                      record.statusNF === 'Emitida'
                        ? 'bg-emerald-400 text-zinc-950'
                        : record.statusNF === 'Não autorizada'
                        ? 'bg-rose-400 text-zinc-950'
                        : 'bg-amber-300 text-zinc-950'
                    }`}
                  >
                    <span>NF: {record.statusNF === 'Pendente' ? 'Não emitida' : record.statusNF}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleTogglePagamento(record, e)}
                    className={`flex items-center justify-center space-x-1 py-2 px-2 text-[10px] font-black uppercase border border-zinc-900 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 ${
                      isPago ? 'bg-emerald-400 text-zinc-950' : 'bg-rose-400 text-zinc-950'
                    }`}
                  >
                    {isPago ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    <span>{isPago ? 'PAGO' : 'NÃO PAGO'}</span>
                  </button>
                </div>

                {/* Action Row */}
                <div className="flex items-center justify-between pt-2 border-t-2 border-zinc-900 text-xs">
                  <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[120px]">
                    {record.observacoes || 'Sem observações'}
                  </span>
                  <div className="flex items-center space-x-1.5">
                    {onDuplicateRecord && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDuplicateRecord(record); }}
                        className="inline-flex items-center space-x-1 px-2 py-1.5 bg-indigo-600 text-white font-black text-[10px] uppercase border border-zinc-900 active:scale-95 cursor-pointer"
                        title="Duplicar esta comissão"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Duplicar</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onViewRecordDetail(record); }}
                      className="inline-flex items-center space-x-1 px-2 py-1.5 bg-zinc-900 text-white font-black text-[10px] uppercase border border-zinc-900 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDeleteRecord(record.id); }}
                      className="inline-flex items-center space-x-1 px-2 py-1.5 bg-rose-500 text-white font-black text-[10px] uppercase border border-zinc-900 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Excluir</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Spreadsheet Main Grid Table (Visible on Desktop / Tablets >= 768px) */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-zinc-900 text-white border-b-2 border-zinc-900 font-black uppercase tracking-wider select-none text-[11px]">
              <th className="py-3 px-3 text-center w-10">#</th>
              <th
                onClick={() => handleSort('dataVencimentoNF')}
                className="py-3 px-3 cursor-pointer hover:bg-zinc-800 transition min-w-[110px]"
              >
                <div className="flex items-center space-x-1">
                  <span>DATA</span>
                  <ArrowUpDown className="w-3 h-3 text-zinc-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('valorComissao')}
                className="py-3 px-3 cursor-pointer hover:bg-zinc-800 transition"
              >
                <div className="flex items-center space-x-1">
                  <span>VALOR MMB</span>
                  <ArrowUpDown className="w-3 h-3 text-zinc-400" />
                </div>
              </th>
              <th
                onClick={() => handleSort('clienteNome')}
                className="py-3 px-3 cursor-pointer hover:bg-zinc-800 transition min-w-[150px]"
              >
                <div className="flex items-center space-x-1">
                  <span>Clube</span>
                  <ArrowUpDown className="w-3 h-3 text-zinc-400" />
                </div>
              </th>
              <th className="py-3 px-3 min-w-[140px]">Atleta</th>
              <th className="py-3 px-3 min-w-[160px]">Agentes</th>
              <th className="py-3 px-3 min-w-[140px]">Tipo de Contrato</th>
              <th className="py-3 px-3 min-w-[110px]">NF</th>
              <th className="py-3 px-2 text-center">Parcelas</th>
              <th className="py-3 px-3 min-w-[110px]">Pagamento</th>
              <th className="py-3 px-3 text-center min-w-[110px]">PAGO OU NÃO</th>
              <th className="py-3 px-3 min-w-[120px]">Data do Contrato</th>
              <th className="py-3 px-3 min-w-[140px]">OBS</th>
              <th className="py-3 px-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-zinc-900 text-zinc-900 font-medium">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={14} className="py-12 text-center text-zinc-500 font-bold uppercase tracking-wider bg-white">
                  Nenhum registro de comissão encontrado com os filtros selecionados.
                </td>
              </tr>
            ) : (
              filteredRecords.map((record, index) => {
                const todayStr = new Date().toISOString().split('T')[0];
                const isOverdueNF = record.statusNF === 'Pendente' && record.dataVencimentoNF < todayStr;
                const isDueToday = record.statusNF === 'Pendente' && record.dataVencimentoNF === todayStr;
                const isPago = record.statusPagamento === 'Pago' || record.pagoOuNao === 'Pago' || record.pagoOuNao === 'SIM (PAGO)';
                const cleaned = cleanClubeAndAtleta(record.clube, record.atleta, record.clienteNome);

                return (
                  <tr
                    key={record.id}
                    onClick={() => onViewRecordDetail(record)}
                    className="hover:bg-amber-50/50 transition cursor-pointer group"
                  >
                    {/* Index */}
                    <td className="py-3 px-3 text-center text-zinc-500 font-mono font-bold text-[11px]">
                      {index + 1}
                    </td>

                    {/* 1. DATA */}
                    <td className="py-3 px-3">
                      <div className="flex flex-col space-y-1">
                        <div className={`inline-flex items-center space-x-1 px-2 py-0.5 border border-zinc-900 font-mono font-bold ${
                          isOverdueNF
                            ? 'bg-rose-400 text-zinc-950'
                            : isDueToday
                            ? 'bg-amber-400 text-zinc-950'
                            : 'bg-zinc-100 text-zinc-900'
                        }`}>
                          {isOverdueNF && <AlertTriangle className="w-3 h-3 text-zinc-950 mr-1" />}
                          <span>{formatDate(record.dataVencimentoNF)}</span>
                        </div>
                        <span className="text-[10px] font-mono font-bold uppercase text-amber-900 bg-amber-100 px-1.5 py-0.5 border border-amber-300 w-fit">
                          📅 {formatIsoMonthLabel(getRecordIsoMonth(record, 'dataVencimentoNF'))}
                        </span>
                      </div>
                    </td>

                    {/* 2. VALOR MMB */}
                    <td className="py-3 px-3 font-black text-emerald-950 font-mono text-sm bg-emerald-50/50 border-x border-zinc-200">
                      {formatCurrency(record.valorComissao)}
                    </td>

                    {/* 3. Clube */}
                    <td className="py-3 px-3">
                      <div className="font-black text-zinc-900 uppercase group-hover:underline">
                        {cleaned.clube}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500">
                        {record.clienteCnpjCpf || 'Sem CNPJ'}
                      </div>
                    </td>

                    {/* 4. Atleta */}
                    <td className="py-3 px-3 font-bold text-zinc-900 uppercase">
                      {cleaned.atleta}
                    </td>

                    {/* 4.5. Agentes */}
                    <td className="py-3 px-3">
                      {((record.agentes && record.agentes.length > 0) || (record.captadores && record.captadores.length > 0)) ? (
                        <div className="flex flex-wrap gap-1">
                          {(record.agentes || record.captadores || []).map(cap => {
                            const colors = getAgenteColor(cap);
                            return (
                              <span
                                key={cap}
                                className={`px-2 py-0.5 text-[10px] font-black uppercase border ${colors.bg} ${colors.text} ${colors.border}`}
                              >
                                {cap}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-zinc-400 text-[10px] font-mono italic">-</span>
                      )}
                    </td>

                    {/* 5. Tipo de contrato */}
                    <td className="py-3 px-3 font-medium text-zinc-800">
                      <span className="px-2 py-0.5 bg-zinc-100 border border-zinc-900 text-[10px] font-bold uppercase">
                        {record.tipoContrato || record.servicoDescricao || 'Intermediação'}
                      </span>
                    </td>

                    {/* 6. NF */}
                    <td className="py-3 px-3 font-mono font-bold text-zinc-900">
                      <div className="flex flex-col space-y-0.5">
                        <span className="text-xs font-black">{record.numeroNF || 'Não emitida'}</span>
                        <button
                          onClick={(e) => handleToggleNFStatus(record, e)}
                          title="Clique para alternar status da NF"
                          className={`inline-flex items-center px-1.5 py-0.5 text-[9px] font-black uppercase border border-zinc-900 ${
                            record.statusNF === 'Emitida'
                              ? 'bg-emerald-400 text-zinc-950'
                              : record.statusNF === 'Não autorizada'
                              ? 'bg-rose-400 text-zinc-950'
                              : 'bg-amber-300 text-zinc-950'
                          }`}
                        >
                          {record.statusNF === 'Pendente' ? 'Não emitida' : record.statusNF}
                        </button>
                      </div>
                    </td>

                    {/* 7. Parcelas */}
                    <td className="py-3 px-2 text-center font-mono">
                      <div className="flex flex-col items-center space-y-0.5">
                        <span className="px-2 py-0.5 bg-purple-200 text-purple-950 border border-zinc-900 text-xs font-black">
                          {record.parcelaAtual || 1}/{record.totalParcelas || 1}
                        </span>
                        <span className="text-[9px] font-mono font-bold text-purple-900 uppercase">
                          {(record.totalParcelas || 1) > 1 ? `Parc. ${record.parcelaAtual || 1}` : 'Única'}
                        </span>
                      </div>
                    </td>

                    {/* 8. Pagamento */}
                    <td className="py-3 px-3 font-mono font-bold text-zinc-900">
                      {record.dataPagamento ? formatDate(record.dataPagamento) : '-'}
                    </td>

                    {/* 9. PAGO OU NÃO */}
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={(e) => handleTogglePagamento(record, e)}
                        title="Clique para alternar status do Pagamento (Pago / Não Pago)"
                        className={`inline-flex items-center space-x-1 px-2.5 py-1 text-[10px] font-black uppercase border-2 border-zinc-900 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] ${
                          isPago
                            ? 'bg-emerald-400 text-zinc-950'
                            : 'bg-rose-400 text-zinc-950'
                        }`}
                      >
                        {isPago ? <CheckCircle2 className="w-3 h-3 text-zinc-950" /> : <Clock className="w-3 h-3 text-zinc-950" />}
                        <span>{isPago ? 'PAGO' : 'NÃO PAGO'}</span>
                      </button>
                    </td>

                    {/* 10. Data do contrato */}
                    <td className="py-3 px-3 font-mono text-zinc-700">
                      {record.dataContrato ? formatDate(record.dataContrato) : formatDate(record.criadoEm?.split('T')[0])}
                    </td>

                    {/* 11. OBS */}
                    <td className="py-3 px-3 text-[11px] text-zinc-600 max-w-[180px] truncate" title={record.observacoes}>
                      {record.observacoes || '-'}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        {onDuplicateRecord && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onDuplicateRecord(record); }}
                            className="p-1.5 bg-indigo-100 border border-zinc-900 hover:bg-indigo-600 hover:text-white text-indigo-950 transition cursor-pointer"
                            title="Duplicar comissão (divisão entre empresas)"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}

                        <button
                          onClick={(e) => { e.stopPropagation(); onViewRecordDetail(record); }}
                          className="p-1.5 bg-zinc-100 border border-zinc-900 hover:bg-zinc-900 hover:text-white text-zinc-900 transition cursor-pointer"
                          title="Ver / Editar detalhes"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteRecord(record.id); }}
                          className="p-1.5 bg-rose-100 border border-zinc-900 hover:bg-rose-500 hover:text-white text-rose-950 transition cursor-pointer"
                          title="Excluir comissão"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer Stats Summary */}
      <div className="p-4 bg-zinc-100 border-t-2 border-zinc-900 flex flex-col sm:flex-row items-center justify-between text-xs font-bold text-zinc-800 gap-2">
        <div className="flex items-center space-x-4">
          <span>TOTAL DE COMISSÕES: <strong className="text-zinc-950 font-black text-sm">{formatCurrency(records.reduce((a, r) => a + (r.valorComissao || 0), 0))}</strong></span>
          <span>•</span>
          <span>A EMITIR NF: <strong className="text-amber-950 font-black">{formatCurrency(records.filter(r => r.statusNF === 'Pendente').reduce((a, r) => a + (r.valorComissao || 0), 0))}</strong></span>
        </div>
        <div className="text-zinc-500 font-bold uppercase tracking-wider text-[11px]">
          Dica: Clique no pill de status da NF ou do Pagamento para alternar rapidamente.
        </div>
      </div>

      {/* PDF Export Modal */}
      <PdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        records={records}
        currentMonth={selectedMonth}
        currentAgenteFilter={selectedCaptadorFilter}
        currentStatusTab={activeTab}
        currentSearchTerm={searchTerm}
      />
    </div>
  );
};
