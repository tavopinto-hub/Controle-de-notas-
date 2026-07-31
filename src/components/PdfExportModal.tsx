import React, { useState, useMemo } from 'react';
import { X, FileDown, Filter, Users, Calendar, CheckCircle2, AlertTriangle, DollarSign, Search } from 'lucide-react';
import { CommissionRecord } from '../types';
import { PREDEFINED_AGENTES, getAgenteColor } from '../constants/captadores';
import { formatCurrency, formatDate } from '../utils/excel';
import { generateMonthlyPdf } from '../utils/pdfExport';

interface PdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: CommissionRecord[];
  currentMonth: string;
  currentAgenteFilter?: string;
  currentStatusTab?: string;
  currentSearchTerm?: string;
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  isOpen,
  onClose,
  records,
  currentMonth,
  currentAgenteFilter = 'ALL',
  currentStatusTab = 'all',
  currentSearchTerm = ''
}) => {
  if (!isOpen) return null;

  // Local filter states for custom PDF generation
  const [selectedAgente, setSelectedAgente] = useState<string>(currentAgenteFilter);
  const [selectedStatus, setSelectedStatus] = useState<string>(currentStatusTab);
  const [periodType, setPeriodType] = useState<'month' | 'year' | 'all' | 'custom'>('month');
  const [selectedMonthISO, setSelectedMonthISO] = useState<string>(currentMonth === 'ALL' ? new Date().toISOString().slice(0, 7) : currentMonth);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>(currentSearchTerm);

  // Extract all unique custom agentes from records if any
  const allAgentesList = useMemo(() => {
    const set = new Set<string>(PREDEFINED_AGENTES);
    records.forEach(r => {
      const list = r.agentes || r.captadores || [];
      list.forEach(a => set.add(a));
    });
    return Array.from(set).sort();
  }, [records]);

  // Compute filtered records for PDF preview and export
  const previewRecords = useMemo(() => {
    return records.filter(r => {
      // 1. Agente Filter
      if (selectedAgente !== 'ALL') {
        const list = r.agentes || r.captadores || [];
        if (!list.includes(selectedAgente)) return false;
      }

      // 2. Status Filter
      if (selectedStatus === 'nao_emitida') {
        if (r.statusNF === 'Emitida') return false;
      } else if (selectedStatus === 'fora_prazo') {
        const todayStr = new Date().toISOString().split('T')[0];
        if (r.statusNF === 'Emitida' || r.dataVencimentoNF >= todayStr) return false;
      } else if (selectedStatus === 'emitida') {
        if (r.statusNF !== 'Emitida') return false;
      } else if (selectedStatus === 'pago') {
        if (r.statusPagamento !== 'Pago' && r.pagoOuNao !== 'SIM (PAGO)' && r.pagoOuNao !== 'SIM') return false;
      } else if (selectedStatus === 'nao_autorizada') {
        if (r.statusNF !== 'Não autorizada') return false;
      }

      // 3. Period Filter
      if (periodType === 'month') {
        if (selectedMonthISO && selectedMonthISO !== 'ALL') {
          if (!r.dataVencimentoNF.startsWith(selectedMonthISO)) return false;
        }
      } else if (periodType === 'year') {
        const year = selectedMonthISO ? selectedMonthISO.slice(0, 4) : '2026';
        if (!r.dataVencimentoNF.startsWith(year)) return false;
      } else if (periodType === 'custom') {
        if (startDate && r.dataVencimentoNF < startDate) return false;
        if (endDate && r.dataVencimentoNF > endDate) return false;
      }

      // 4. Search term
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase().trim();
        const matches =
          r.clienteNome.toLowerCase().includes(term) ||
          r.numeroContrato.toLowerCase().includes(term) ||
          (r.clube && r.clube.toLowerCase().includes(term)) ||
          (r.atleta && r.atleta.toLowerCase().includes(term)) ||
          (r.numeroNF && r.numeroNF.toLowerCase().includes(term)) ||
          ((r.agentes || r.captadores || []).some(a => a.toLowerCase().includes(term)));
        if (!matches) return false;
      }

      return true;
    });
  }, [records, selectedAgente, selectedStatus, periodType, selectedMonthISO, startDate, endDate, searchTerm]);

  // Total summary for preview
  const totalValor = previewRecords.reduce((acc, r) => acc + (r.valorComissao || 0), 0);
  const totalPaid = previewRecords
    .filter(r => r.statusPagamento === 'Pago' || r.pagoOuNao === 'SIM (PAGO)' || r.pagoOuNao === 'SIM')
    .reduce((acc, r) => acc + (r.valorComissao || 0), 0);

  const handleGeneratePdf = () => {
    let monthLabelStr = 'Todos os Períodos';
    if (periodType === 'month') {
      if (selectedMonthISO && selectedMonthISO !== 'ALL') {
        const [yyyy, mm] = selectedMonthISO.split('-');
        const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const monthName = months[parseInt(mm, 10) - 1] || mm;
        monthLabelStr = `${monthName} / ${yyyy}`;
      } else {
        monthLabelStr = 'Todos os Meses';
      }
    } else if (periodType === 'year') {
      const year = selectedMonthISO ? selectedMonthISO.slice(0, 4) : '2026';
      monthLabelStr = `Ano ${year}`;
    } else if (periodType === 'custom') {
      monthLabelStr = `Período (${startDate ? formatDate(startDate) : 'Início'} a ${endDate ? formatDate(endDate) : 'Fim'})`;
    }

    let statusLabel = 'Todas';
    if (selectedStatus === 'nao_emitida') statusLabel = 'A Emitir';
    else if (selectedStatus === 'fora_prazo') statusLabel = 'Fora do Prazo';
    else if (selectedStatus === 'emitida') statusLabel = 'Emitidas';
    else if (selectedStatus === 'pago') statusLabel = 'Pagas';
    else if (selectedStatus === 'nao_autorizada') statusLabel = 'Não Autorizadas';

    const filenameAgente = selectedAgente !== 'ALL' ? `_Agente_${selectedAgente.replace(/\s+/g, '_')}` : '';
    const cleanLabel = monthLabelStr.replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Relatorio_NFs${filenameAgente}_${cleanLabel}.pdf`;

    generateMonthlyPdf(previewRecords, {
      monthLabel: monthLabelStr,
      agenteFilter: selectedAgente,
      statusFilter: statusLabel,
      searchTerm: searchTerm,
      filename: filename
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-zinc-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white border-4 border-zinc-900 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-zinc-900 text-white p-4 border-b-4 border-zinc-900 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-rose-500 text-white border border-white">
              <FileDown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black uppercase tracking-tight text-amber-300">
                Gerar Relatório PDF em Diversos Filtros
              </h2>
              <p className="text-xs text-zinc-300 font-bold">
                Exporte relatórios personalizados por Agente, Mês e Status das Notas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-600 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-zinc-900 font-sans">
          
          {/* 1. AGENTE FILTER */}
          <div className="bg-indigo-50 border-2 border-zinc-900 p-3.5 space-y-2">
            <label className="font-black text-xs uppercase tracking-wider text-indigo-950 flex items-center space-x-2">
              <Users className="w-4 h-4 text-indigo-700" />
              <span>1. Filtrar por Agente / Captador:</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={selectedAgente}
                onChange={(e) => setSelectedAgente(e.target.value)}
                className="w-full px-3 py-2 bg-white border-2 border-zinc-900 font-black text-xs text-zinc-900 focus:outline-none cursor-pointer"
              >
                <option value="ALL">🌟 Todos os Agentes (Relatório Geral)</option>
                {allAgentesList.map(agente => (
                  <option key={agente} value={agente}>
                    Agente: {agente}
                  </option>
                ))}
              </select>

              {/* Quick Agente Badges preview */}
              <div className="flex flex-wrap items-center gap-1">
                {allAgentesList.map(agente => {
                  const isSel = selectedAgente === agente;
                  const colors = getAgenteColor(agente);
                  return (
                    <button
                      key={agente}
                      type="button"
                      onClick={() => setSelectedAgente(isSel ? 'ALL' : agente)}
                      className={`px-2 py-0.5 text-[10px] font-black uppercase border transition cursor-pointer ${
                        isSel
                          ? 'bg-zinc-900 text-white border-zinc-900 shadow-[1px_1px_0px_0px_rgba(79,70,229,1)]'
                          : `bg-white ${colors.text} ${colors.border} hover:bg-zinc-100`
                      }`}
                    >
                      {agente}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 2. STATUS FILTER */}
          <div className="bg-amber-50 border-2 border-zinc-900 p-3.5 space-y-2">
            <label className="font-black text-xs uppercase tracking-wider text-amber-950 flex items-center space-x-2">
              <Filter className="w-4 h-4 text-amber-600" />
              <span>2. Filtrar por Status da NF / Pagamento:</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'all', label: 'Todas as NFs', color: 'bg-zinc-900 text-white' },
                { id: 'nao_emitida', label: 'A Emitir', color: 'bg-amber-400 text-zinc-950' },
                { id: 'fora_prazo', label: 'Fora do Prazo ⚠️', color: 'bg-rose-600 text-white' },
                { id: 'emitida', label: 'Emitidas', color: 'bg-sky-400 text-zinc-950' },
                { id: 'pago', label: 'Pagas 🟢', color: 'bg-emerald-400 text-zinc-950' },
                { id: 'nao_autorizada', label: 'Não Autorizadas', color: 'bg-purple-600 text-white' },
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setSelectedStatus(st.id)}
                  className={`p-2 text-xs font-black uppercase border-2 border-zinc-900 transition text-center cursor-pointer ${
                    selectedStatus === st.id
                      ? `${st.color} shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ring-2 ring-zinc-900`
                      : 'bg-white text-zinc-800 hover:bg-zinc-100'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3. PERIOD FILTER */}
          <div className="bg-zinc-50 border-2 border-zinc-900 p-3.5 space-y-3">
            <label className="font-black text-xs uppercase tracking-wider text-zinc-900 flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-zinc-900" />
              <span>3. Período do Relatório:</span>
            </label>

            <div className="flex flex-wrap gap-2">
              {[
                { id: 'month', label: 'Mês Específico' },
                { id: 'year', label: 'Todo o Ano' },
                { id: 'all', label: 'Todos os Registros' },
                { id: 'custom', label: 'Intervalo Personalizado' },
              ].map(pt => (
                <button
                  key={pt.id}
                  type="button"
                  onClick={() => setPeriodType(pt.id as any)}
                  className={`px-3 py-1.5 text-xs font-black uppercase border border-zinc-900 cursor-pointer ${
                    periodType === pt.id
                      ? 'bg-amber-400 text-zinc-950 font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                      : 'bg-white text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  {pt.label}
                </button>
              ))}
            </div>

            {periodType === 'month' && (
              <div className="flex items-center space-x-2 pt-1">
                <span className="text-xs font-bold text-zinc-700 uppercase">Selecione o Mês:</span>
                <input
                  type="month"
                  value={selectedMonthISO}
                  onChange={(e) => setSelectedMonthISO(e.target.value)}
                  className="px-3 py-1.5 bg-white border-2 border-zinc-900 font-bold text-xs focus:outline-none"
                />
              </div>
            )}

            {periodType === 'custom' && (
              <div className="flex items-center space-x-3 pt-1">
                <div className="flex items-center space-x-1">
                  <span className="text-xs font-bold text-zinc-700 uppercase">De:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-2 py-1 bg-white border-2 border-zinc-900 font-bold text-xs"
                  />
                </div>
                <div className="flex items-center space-x-1">
                  <span className="text-xs font-bold text-zinc-700 uppercase">Até:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-2 py-1 bg-white border-2 border-zinc-900 font-bold text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 4. OPTIONAL SEARCH TERM */}
          <div className="flex items-center space-x-2 bg-white border-2 border-zinc-900 px-3 py-2">
            <Search className="w-4 h-4 text-zinc-500 flex-shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrar também por texto (ex: nome de cliente, clube ou atleta)..."
              className="w-full text-xs font-bold text-zinc-900 focus:outline-none placeholder-zinc-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="text-xs text-rose-600 font-bold cursor-pointer"
              >
                Limpar
              </button>
            )}
          </div>

          {/* LIVE SUMMARY PREVIEW BOX */}
          <div className="bg-emerald-50 border-2 border-emerald-900 p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-[3px_3px_0px_0px_rgba(16,185,129,1)]">
            <div>
              <div className="text-xs font-black uppercase text-emerald-950 flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Resumo das Notas Encontradas com os Filtros:</span>
              </div>
              <p className="text-xs font-bold text-emerald-900 mt-1">
                <span className="text-sm font-black text-zinc-950 font-mono">{previewRecords.length}</span> nota(s) selecionada(s)
                {selectedAgente !== 'ALL' && <span> para <strong className="uppercase">{selectedAgente}</strong></span>}
              </p>
            </div>

            <div className="text-right sm:self-end">
              <div className="text-[10px] font-bold text-emerald-800 uppercase">Valor Total das Comissões</div>
              <div className="text-base font-black text-emerald-950 font-mono">
                {formatCurrency(totalValor)}
              </div>
              <div className="text-[10px] font-bold text-blue-800 uppercase">
                Pago: {formatCurrency(totalPaid)}
              </div>
            </div>
          </div>

        </div>

        {/* Modal Footer Actions */}
        <div className="bg-zinc-100 p-4 border-t-4 border-zinc-900 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-white hover:bg-zinc-200 text-zinc-900 border-2 border-zinc-900 font-black text-xs uppercase tracking-wider transition cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={previewRecords.length === 0}
            className={`px-5 py-2.5 font-black text-xs uppercase tracking-wider border-2 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 flex items-center space-x-2 cursor-pointer ${
              previewRecords.length > 0
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-zinc-300 text-zinc-500 border-zinc-400 cursor-not-allowed shadow-none'
            }`}
          >
            <FileDown className="w-4 h-4 text-white" />
            <span>⚡ Baixar PDF Formatado ({previewRecords.length} NFs)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
