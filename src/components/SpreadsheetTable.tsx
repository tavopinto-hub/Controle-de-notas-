import React, { useState } from 'react';
import {
  Download, FileSpreadsheet, Search, Plus, Trash2, Edit2, CheckCircle2,
  AlertTriangle, Clock, Filter, ArrowUpDown, Send, FileText, ExternalLink, CopyX, UserCheck
} from 'lucide-react';
import { CommissionRecord, StatusNF, StatusPagamento } from '../types';
import { formatCurrency, formatDate, exportToExcel, exportToCSV } from '../utils/excel';
import { getRecordYear, isPastDate } from '../utils/dateUtils';
import { cleanClubeAndAtleta } from '../utils/athleteUtils';

interface SpreadsheetTableProps {
  records: CommissionRecord[];
  selectedYear?: string;
  activeTab?: 'all' | 'nao_emitida' | 'fora_prazo' | 'emitida' | 'nao_autorizada' | 'pago';
  onTabChange?: (tab: 'all' | 'nao_emitida' | 'fora_prazo' | 'emitida' | 'nao_autorizada' | 'pago') => void;
  onUpdateRecord: (record: CommissionRecord) => void;
  onDeleteRecord: (id: string) => void;
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
  onAddNewRecord,
  onOpenEmailModal,
  onViewRecordDetail,
  onDeduplicateRecords,
  onSeparateAtletas
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [internalTab, setInternalTab] = useState<'all' | 'nao_emitida' | 'fora_prazo' | 'emitida' | 'nao_autorizada' | 'pago'>('all');
  
  const activeTab = controlledActiveTab !== undefined ? controlledActiveTab : internalTab;

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

  // First filter records by selectedYear
  const yearFilteredRecords = records.filter(rec => {
    if (selectedYear === 'ALL') return true;
    return getRecordYear(rec) === selectedYear;
  });

  // Filtered & sorted records
  const filteredRecords = yearFilteredRecords.filter(rec => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      rec.clienteNome.toLowerCase().includes(searchLower) ||
      rec.numeroContrato.toLowerCase().includes(searchLower) ||
      rec.clienteCnpjCpf.toLowerCase().includes(searchLower) ||
      (rec.clube && rec.clube.toLowerCase().includes(searchLower)) ||
      (rec.atleta && rec.atleta.toLowerCase().includes(searchLower)) ||
      (rec.numeroNF && rec.numeroNF.toLowerCase().includes(searchLower));

    if (!matchesSearch) return false;

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

        {/* Top actions: Export Excel / CSV / Email / Add Record - Responsive Grid */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
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
              title="Remover registros duplicados da planilha"
              className="inline-flex items-center justify-center space-x-1 px-2.5 py-2 sm:px-3 bg-amber-200 hover:bg-amber-300 border-2 border-zinc-900 text-zinc-950 text-[11px] sm:text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 min-h-[40px]"
            >
              <CopyX className="w-3.5 h-3.5 text-zinc-950 flex-shrink-0" />
              <span>Limpar Duplicados</span>
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
            Todas ({yearFilteredRecords.length})
          </button>
          <button
            onClick={() => handleSelectTab('nao_emitida')}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-zinc-900 transition whitespace-nowrap ${
              activeTab === 'nao_emitida'
                ? 'bg-amber-400 text-zinc-950'
                : 'bg-amber-100 text-amber-950 hover:bg-amber-200'
            }`}
          >
            A Emitir ({yearFilteredRecords.filter(r => r.statusNF !== 'Emitida').length})
          </button>
          <button
            onClick={() => handleSelectTab('fora_prazo')}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-zinc-900 transition whitespace-nowrap ${
              activeTab === 'fora_prazo'
                ? 'bg-red-600 text-white'
                : 'bg-red-100 text-red-950 hover:bg-red-200'
            }`}
          >
            Fora do Prazo ⚠️ ({yearFilteredRecords.filter(r => r.statusNF !== 'Emitida' && isPastDate(r.dataVencimentoNF)).length})
          </button>
          <button
            onClick={() => handleSelectTab('emitida')}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-zinc-900 transition whitespace-nowrap ${
              activeTab === 'emitida'
                ? 'bg-sky-400 text-zinc-950'
                : 'bg-sky-100 text-sky-950 hover:bg-sky-200'
            }`}
          >
            Emitidas ({yearFilteredRecords.filter(r => r.statusNF === 'Emitida').length})
          </button>
          <button
            onClick={() => handleSelectTab('pago')}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-zinc-900 transition whitespace-nowrap ${
              activeTab === 'pago'
                ? 'bg-emerald-400 text-zinc-950'
                : 'bg-emerald-100 text-emerald-950 hover:bg-emerald-200'
            }`}
          >
            Pagas 🟢 ({yearFilteredRecords.filter(r => r.statusPagamento === 'Pago' || r.pagoOuNao === 'SIM (PAGO)' || r.pagoOuNao === 'SIM').length})
          </button>
          <button
            onClick={() => handleSelectTab('nao_autorizada')}
            className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider border-2 border-zinc-900 transition whitespace-nowrap ${
              activeTab === 'nao_autorizada'
                ? 'bg-rose-400 text-zinc-950'
                : 'bg-rose-100 text-rose-950 hover:bg-rose-200'
            }`}
          >
            Não Autorizadas ({yearFilteredRecords.filter(r => r.statusNF === 'Não autorizada').length})
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
                    <span className="text-[10px] font-mono font-bold bg-purple-200 text-purple-950 px-1.5 py-0.5 border border-zinc-900">
                      Parc. {record.parcelaAtual || 1}/{record.totalParcelas || 1}
                    </span>
                  </div>
                </div>

                {/* Main Info: Clube + Atleta */}
                <div>
                  <div className="font-black text-sm uppercase text-zinc-900">
                    {cleaned.clube}
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-700 font-bold mt-0.5">
                    <span>Atleta: <strong className="text-zinc-900 uppercase">{cleaned.atleta}</strong></span>
                    <span className="text-[10px] bg-zinc-100 px-1.5 py-0.5 border border-zinc-900 uppercase">{record.tipoContrato || record.servicoDescricao || 'Intermediação'}</span>
                  </div>
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
                  <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[160px]">
                    {record.observacoes || 'Sem observações'}
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onViewRecordDetail(record); }}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-zinc-900 text-white font-black text-[10px] uppercase border border-zinc-900"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onDeleteRecord(record.id); }}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-rose-500 text-white font-black text-[10px] uppercase border border-zinc-900"
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
                <td colSpan={13} className="py-12 text-center text-zinc-500 font-bold uppercase tracking-wider bg-white">
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
                      <span className="px-2 py-1 bg-purple-200 text-purple-950 border border-zinc-900 text-xs font-black">
                        {record.parcelaAtual || 1}/{record.totalParcelas || 1}
                      </span>
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
                        <button
                          onClick={(e) => { e.stopPropagation(); onViewRecordDetail(record); }}
                          className="p-1.5 bg-zinc-100 border border-zinc-900 hover:bg-zinc-900 hover:text-white text-zinc-900 transition"
                          title="Ver / Editar detalhes"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={(e) => { e.stopPropagation(); onDeleteRecord(record.id); }}
                          className="p-1.5 bg-rose-100 border border-zinc-900 hover:bg-rose-500 hover:text-white text-rose-950 transition"
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
    </div>
  );
};
