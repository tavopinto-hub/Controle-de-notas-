import React from 'react';
import { Wallet, AlertTriangle, FileCheck, CheckCircle, Calendar, Filter, Clock, AlertCircle } from 'lucide-react';
import { CommissionRecord } from '../types';
import { formatCurrency } from '../utils/excel';
import { getRecordYear, isPastDate } from '../utils/dateUtils';

interface StatsOverviewProps {
  records: CommissionRecord[];
  selectedYear: string;
  onSelectYear: (year: string) => void;
  availableYears: string[];
  activeTab?: string;
  onSelectTab?: (tab: 'all' | 'nao_emitida' | 'fora_prazo' | 'emitida' | 'pago') => void;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({
  records,
  selectedYear,
  onSelectYear,
  availableYears,
  activeTab,
  onSelectTab
}) => {
  // Filter records by selected year
  const yearRecords = records.filter(rec => {
    if (selectedYear === 'ALL') return true;
    return getRecordYear(rec) === selectedYear;
  });

  // 1. Total em Comissões
  const totalComissao = yearRecords.reduce((acc, r) => acc + (r.valorComissao || 0), 0);

  // 2. Notas a Emitir (Pendente / Não emitida)
  const notasAEmitir = yearRecords.filter(r => r.statusNF === 'Não emitida' || r.statusNF === 'Pendente' || r.statusNF !== 'Emitida');
  const valorAEmitir = notasAEmitir.reduce((acc, r) => acc + (r.valorComissao || 0), 0);

  // 3. Notas não emitidas ( FORA DO PRAZO / Vencidas )
  const notasForaDoPrazo = notasAEmitir.filter(r => isPastDate(r.dataVencimentoNF));
  const valorForaDoPrazo = notasForaDoPrazo.reduce((acc, r) => acc + (r.valorComissao || 0), 0);

  // 4. Notas Pagas
  const notasPagas = yearRecords.filter(r => r.statusPagamento === 'Pago' || r.pagoOuNao === 'SIM (PAGO)' || r.pagoOuNao === 'SIM');
  const valorPagas = notasPagas.reduce((acc, r) => acc + (r.valorComissao || 0), 0);

  // 5. NFs Emitidas / Aguardando Pagamento
  const notasEmitidas = yearRecords.filter(r => r.statusNF === 'Emitida' && r.statusPagamento !== 'Pago');
  const valorEmitidas = notasEmitidas.reduce((acc, r) => acc + (r.valorComissao || 0), 0);

  return (
    <div className="space-y-4 mb-6">
      {/* Year Filter Header Bar */}
      <div className="bg-zinc-900 text-white p-3.5 sm:p-4 border-3 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <Calendar className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <div>
            <h3 className="font-black text-xs sm:text-sm uppercase tracking-wider text-white">
              Painel do Exercício & Desempenho
            </h3>
            <p className="text-[10px] sm:text-[11px] font-bold text-zinc-400 uppercase">
              {selectedYear === 'ALL' ? 'Exibindo dados consolidados de Todos os Anos' : `Filtrando comissões e NFs do ano de ${selectedYear}`}
            </p>
          </div>
        </div>

        {/* Year Buttons / Dropdown */}
        <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5 w-full sm:w-auto">
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mr-1 hidden sm:inline">
            Ano:
          </span>
          <button
            onClick={() => onSelectYear('ALL')}
            className={`px-3 py-1.5 text-xs font-black uppercase border-2 border-zinc-900 transition ${
              selectedYear === 'ALL'
                ? 'bg-amber-400 text-zinc-950 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.3)]'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
            }`}
          >
            Todos os Anos
          </button>
          {availableYears.map(year => (
            <button
              key={year}
              onClick={() => onSelectYear(year)}
              className={`px-3 py-1.5 text-xs font-black uppercase font-mono border-2 border-zinc-900 transition ${
                selectedYear === year
                  ? 'bg-amber-400 text-zinc-950 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.3)]'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Cards (KPI Dashboard Boxes) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
        
        {/* Card 1: Total em Comissões */}
        <div 
          onClick={() => onSelectTab && onSelectTab('all')}
          className={`p-4 border-3 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition cursor-pointer bg-white hover:bg-zinc-50 ${
            activeTab === 'all' ? 'ring-4 ring-zinc-900' : ''
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Total em Comissões
              </p>
              <p className="text-xl sm:text-2xl font-black tracking-tighter text-zinc-900 mt-1 italic font-mono">
                {formatCurrency(totalComissao)}
              </p>
              <p className="text-[11px] font-bold text-zinc-600 mt-1 uppercase">
                {yearRecords.length} PARCELA(S)
              </p>
            </div>
            <div className="p-2 bg-zinc-900 text-white border-2 border-zinc-900 flex-shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Card 2: NOTAS A EMITIR */}
        <div 
          onClick={() => onSelectTab && onSelectTab('nao_emitida')}
          className={`p-4 border-3 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition cursor-pointer bg-amber-100/80 hover:bg-amber-100 ${
            activeTab === 'nao_emitida' ? 'ring-4 ring-amber-900' : ''
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center space-x-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-950">
                  Notas a Emitir
                </p>
              </div>
              <p className="text-xl sm:text-2xl font-black tracking-tighter text-amber-950 mt-1 italic font-mono">
                {formatCurrency(valorAEmitir)}
              </p>
              <p className="text-[11px] font-black text-amber-900 mt-1 uppercase">
                {notasAEmitir.length} NOTA(S) A EMITIR
              </p>
            </div>
            <div className="p-2 bg-amber-400 text-zinc-950 border-2 border-zinc-900 flex-shrink-0">
              <Clock className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Card 3: NOTAS NÃO EMITIDAS (FORA DO PRAZO) */}
        <div 
          onClick={() => onSelectTab && onSelectTab('fora_prazo')}
          className={`p-4 border-3 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition cursor-pointer bg-red-100/90 hover:bg-red-200 ${
            activeTab === 'fora_prazo' ? 'ring-4 ring-red-950' : ''
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center space-x-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-red-950">
                  Não Emitidas (Fora do Prazo)
                </p>
              </div>
              <p className="text-xl sm:text-2xl font-black tracking-tighter text-red-950 mt-1 italic font-mono">
                {formatCurrency(valorForaDoPrazo)}
              </p>
              <div className="flex items-center space-x-1.5 mt-1">
                <span className="bg-red-600 text-white font-black text-[9px] uppercase px-1.5 py-0.5 border border-zinc-900">
                  {notasForaDoPrazo.length} ATRASADA(S)
                </span>
              </div>
            </div>
            <div className="p-2 bg-red-600 text-white border-2 border-zinc-900 flex-shrink-0">
              <AlertTriangle className="w-4 h-4 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Card 4: NOTAS EMITIDAS (AGUARDANDO PGTO) */}
        <div 
          onClick={() => onSelectTab && onSelectTab('emitida')}
          className={`p-4 border-3 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition cursor-pointer bg-sky-100/80 hover:bg-sky-100 ${
            activeTab === 'emitida' ? 'ring-4 ring-sky-900' : ''
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-sky-950">
                Emitidas (Aguardando Pgto)
              </p>
              <p className="text-xl sm:text-2xl font-black tracking-tighter text-sky-950 mt-1 italic font-mono">
                {formatCurrency(valorEmitidas)}
              </p>
              <p className="text-[11px] font-bold text-sky-900 mt-1 uppercase">
                {notasEmitidas.length} NOTA(S) FATURADA(S)
              </p>
            </div>
            <div className="p-2 bg-sky-400 text-zinc-950 border-2 border-zinc-900 flex-shrink-0">
              <FileCheck className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Card 5: NOTAS PAGAS */}
        <div 
          onClick={() => onSelectTab && onSelectTab('pago')}
          className={`p-4 border-3 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition cursor-pointer bg-emerald-100/90 hover:bg-emerald-200 ${
            activeTab === 'pago' ? 'ring-4 ring-emerald-950' : ''
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-950">
                Notas Pagas
              </p>
              <p className="text-xl sm:text-2xl font-black tracking-tighter text-emerald-950 mt-1 italic font-mono">
                {formatCurrency(valorPagas)}
              </p>
              <p className="text-[11px] font-black text-emerald-900 mt-1 uppercase">
                {notasPagas.length} LIQUIDADA(S)
              </p>
            </div>
            <div className="p-2 bg-emerald-400 text-zinc-950 border-2 border-zinc-900 flex-shrink-0">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
