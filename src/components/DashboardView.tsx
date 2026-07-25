import React, { useMemo, useState } from 'react';
import { 
  Wallet, 
  Clock, 
  AlertTriangle, 
  FileCheck, 
  CheckCircle2, 
  Building2, 
  User, 
  TrendingUp, 
  PieChart as PieChartIcon, 
  BarChart3, 
  Calendar,
  ArrowUpRight,
  ShieldAlert,
  FileText
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts';
import { CommissionRecord } from '../types';
import { formatCurrency } from '../utils/excel';
import { getRecordYear, isPastDate } from '../utils/dateUtils';

interface DashboardViewProps {
  records: CommissionRecord[];
  selectedYear: string;
  onSelectYear: (year: string) => void;
  availableYears: string[];
  onOpenRecordDetail: (record: CommissionRecord) => void;
  onNavigateToTable: (statusFilter?: 'all' | 'nao_emitida' | 'fora_prazo' | 'emitida' | 'pago') => void;
}

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const DashboardView: React.FC<DashboardViewProps> = ({
  records,
  selectedYear,
  onSelectYear,
  availableYears,
  onOpenRecordDetail,
  onNavigateToTable
}) => {
  const [selectedClubeFilter, setSelectedClubeFilter] = useState<string>('ALL');

  // Filter records by selected year
  const yearRecords = useMemo(() => {
    return records.filter(rec => {
      if (selectedYear === 'ALL') return true;
      return getRecordYear(rec) === selectedYear;
    });
  }, [records, selectedYear]);

  // Distinct club list for sub-filtering if desired
  const clubList = useMemo(() => {
    const setClubs = new Set<string>();
    yearRecords.forEach(r => {
      const club = r.clube || r.clienteNome;
      if (club && club !== '-') setClubs.add(club);
    });
    return Array.from(setClubs).sort();
  }, [yearRecords]);

  // Apply club sub-filter
  const filteredRecords = useMemo(() => {
    if (selectedClubeFilter === 'ALL') return yearRecords;
    return yearRecords.filter(r => (r.clube || r.clienteNome) === selectedClubeFilter);
  }, [yearRecords, selectedClubeFilter]);

  // KPI Calculations
  const totalComissao = useMemo(() => {
    return filteredRecords.reduce((acc, r) => acc + (r.valorComissao || 0), 0);
  }, [filteredRecords]);

  const notasAEmitir = useMemo(() => {
    return filteredRecords.filter(r => r.statusNF === 'Não emitida' || r.statusNF === 'Pendente' || r.statusNF !== 'Emitida');
  }, [filteredRecords]);
  const valorAEmitir = notasAEmitir.reduce((acc, r) => acc + (r.valorComissao || 0), 0);

  const notasForaDoPrazo = useMemo(() => {
    return notasAEmitir.filter(r => isPastDate(r.dataVencimentoNF));
  }, [notasAEmitir]);
  const valorForaDoPrazo = notasForaDoPrazo.reduce((acc, r) => acc + (r.valorComissao || 0), 0);

  const notasEmitidasAguardando = useMemo(() => {
    return filteredRecords.filter(r => r.statusNF === 'Emitida' && r.statusPagamento !== 'Pago');
  }, [filteredRecords]);
  const valorEmitidasAguardando = notasEmitidasAguardando.reduce((acc, r) => acc + (r.valorComissao || 0), 0);

  const notasPagas = useMemo(() => {
    return filteredRecords.filter(r => r.statusPagamento === 'Pago' || r.pagoOuNao === 'SIM (PAGO)' || r.pagoOuNao === 'SIM');
  }, [filteredRecords]);
  const valorPagas = notasPagas.reduce((acc, r) => acc + (r.valorComissao || 0), 0);

  // Monthly Breakdown Data for Bar Chart
  const monthlyData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({
      monthIndex: i,
      monthName: MONTH_NAMES[i],
      total: 0,
      pago: 0,
      pendente: 0,
      count: 0
    }));

    filteredRecords.forEach(rec => {
      const dateStr = rec.dataVencimentoNF || rec.dataContrato;
      if (!dateStr) return;

      let monthIdx = -1;
      if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        if (parts.length >= 2) monthIdx = parseInt(parts[1], 10) - 1;
      } else if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length >= 2) monthIdx = parseInt(parts[1], 10) - 1;
      }

      if (monthIdx >= 0 && monthIdx < 12) {
        const val = rec.valorComissao || 0;
        months[monthIdx].total += val;
        months[monthIdx].count += 1;

        if (rec.statusPagamento === 'Pago' || rec.pagoOuNao === 'SIM (PAGO)' || rec.pagoOuNao === 'SIM') {
          months[monthIdx].pago += val;
        } else {
          months[monthIdx].pendente += val;
        }
      }
    });

    return months;
  }, [filteredRecords]);

  // Status Distribution for Pie Chart
  const statusPieData = useMemo(() => {
    return [
      { name: 'Pagas (Liquidadas)', value: valorPagas, count: notasPagas.length, color: '#10b981' },
      { name: 'Emitidas (Aguardando)', value: valorEmitidasAguardando, count: notasEmitidasAguardando.length, color: '#38bdf8' },
      { name: 'A Emitir no Prazo', value: valorAEmitir - valorForaDoPrazo, count: notasAEmitir.length - notasForaDoPrazo.length, color: '#f59e0b' },
      { name: 'Não Emitidas (Atrasadas)', value: valorForaDoPrazo, count: notasForaDoPrazo.length, color: '#ef4444' }
    ].filter(item => item.value > 0);
  }, [valorPagas, notasPagas, valorEmitidasAguardando, notasEmitidasAguardando, valorAEmitir, notasAEmitir, valorForaDoPrazo, notasForaDoPrazo]);

  // Contract Type Breakdown Data
  const tipoContratoData = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    filteredRecords.forEach(rec => {
      const rawTipo = (rec.tipoContrato || rec.servicoDescricao || 'Intermediação Comercial').trim();
      let key = 'Intermediação';
      if (/renova/i.test(rawTipo)) key = 'Renovação';
      else if (/empr[eé]stimo/i.test(rawTipo)) key = 'Empréstimo';
      else if (/imagem/i.test(rawTipo)) key = 'Direitos de Imagem';
      else if (/transfer/i.test(rawTipo)) key = 'Transferência';
      else if (/representa/i.test(rawTipo)) key = 'Representação';

      const existing = map.get(key) || { name: key, total: 0, count: 0 };
      existing.total += rec.valorComissao || 0;
      existing.count += 1;
      map.set(key, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filteredRecords]);

  // Top Clubs Ranking
  const topClubs = useMemo(() => {
    const map = new Map<string, { clube: string; total: number; count: number }>();
    filteredRecords.forEach(r => {
      const name = (r.clube || r.clienteNome || 'Outros').trim();
      const existing = map.get(name) || { clube: name, total: 0, count: 0 };
      existing.total += r.valorComissao || 0;
      existing.count += 1;
      map.set(name, existing);
    });

    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [filteredRecords]);

  // Top Athletes Ranking
  const topAthletes = useMemo(() => {
    const map = new Map<string, { atleta: string; clube: string; total: number; count: number }>();
    filteredRecords.forEach(r => {
      const atletaName = (r.atleta || '').trim();
      if (!atletaName || atletaName === '-' || atletaName.toLowerCase() === 'não informado' || atletaName.toLowerCase() === 'pendente') {
        return;
      }
      const existing = map.get(atletaName) || { atleta: atletaName, clube: r.clube || r.clienteNome || '-', total: 0, count: 0 };
      existing.total += r.valorComissao || 0;
      existing.count += 1;
      map.set(atletaName, existing);
    });

    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [filteredRecords]);

  // Upcoming NF Due Dates (Próximos Vencimentos)
  const upcomingRecords = useMemo(() => {
    return [...filteredRecords]
      .filter(r => r.statusNF !== 'Emitida' || r.statusPagamento !== 'Pago')
      .sort((a, b) => (a.dataVencimentoNF || '').localeCompare(b.dataVencimentoNF || ''))
      .slice(0, 8);
  }, [filteredRecords]);

  return (
    <div className="space-y-6">
      {/* Year & Club Filter Header Bar */}
      <div className="bg-zinc-900 text-white p-4 border-3 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-400 text-zinc-950 border-2 border-zinc-900 font-black">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-amber-400">
              Dashboard Financeiro & Análise de Comissões
            </h2>
            <p className="text-[11px] sm:text-xs font-semibold text-zinc-300">
              Métricas executivas, faturamento mensal, ranking de clubes/atletas e alertas de notas fiscais.
            </p>
          </div>
        </div>

        {/* Filter selectors */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Year selector buttons */}
          <div className="flex items-center space-x-1 flex-wrap gap-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400 mr-1">
              Ano:
            </span>
            <button
              onClick={() => onSelectYear('ALL')}
              className={`px-3 py-1.5 text-xs font-black uppercase border-2 border-zinc-900 transition cursor-pointer ${
                selectedYear === 'ALL'
                  ? 'bg-amber-400 text-zinc-950 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.3)]'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
              }`}
            >
              Todos
            </button>
            {availableYears.map(yr => (
              <button
                key={yr}
                onClick={() => onSelectYear(yr)}
                className={`px-3 py-1.5 text-xs font-black uppercase font-mono border-2 border-zinc-900 transition cursor-pointer ${
                  selectedYear === yr
                    ? 'bg-amber-400 text-zinc-950 shadow-[2px_2px_0px_0px_rgba(255,255,255,0.3)]'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                {yr}
              </button>
            ))}
          </div>

          {/* Optional Club filter dropdown */}
          {clubList.length > 0 && (
            <div className="flex items-center space-x-1 ml-auto md:ml-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                Clube:
              </span>
              <select
                value={selectedClubeFilter}
                onChange={(e) => setSelectedClubeFilter(e.target.value)}
                className="bg-zinc-800 text-amber-300 text-xs font-bold px-2 py-1.5 border-2 border-zinc-900 focus:outline-none cursor-pointer max-w-[160px]"
              >
                <option value="ALL">Todos os Clubes</option>
                {clubList.map(clube => (
                  <option key={clube} value={clube}>{clube}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Card 1: Total em Comissões */}
        <div 
          onClick={() => onNavigateToTable('all')}
          className="p-4 bg-white border-3 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-zinc-50 transition cursor-pointer group"
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                Total em Comissões
              </span>
              <p className="text-xl sm:text-2xl font-black font-mono tracking-tight text-zinc-900 mt-1 italic">
                {formatCurrency(totalComissao)}
              </p>
              <p className="text-[11px] font-bold text-zinc-600 mt-1 uppercase flex items-center gap-1">
                <span>{filteredRecords.length} parcelas</span>
                <ArrowUpRight className="w-3 h-3 text-zinc-400 group-hover:text-zinc-900 transition" />
              </p>
            </div>
            <div className="p-2.5 bg-zinc-900 text-white border-2 border-zinc-900 flex-shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Card 2: Notas a Emitir */}
        <div 
          onClick={() => onNavigateToTable('nao_emitida')}
          className="p-4 bg-amber-100/90 border-3 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-amber-100 transition cursor-pointer group"
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-950">
                Notas a Emitir
              </span>
              <p className="text-xl sm:text-2xl font-black font-mono tracking-tight text-amber-950 mt-1 italic">
                {formatCurrency(valorAEmitir)}
              </p>
              <p className="text-[11px] font-black text-amber-900 mt-1 uppercase flex items-center gap-1">
                <span>{notasAEmitir.length} NFs pendentes</span>
                <ArrowUpRight className="w-3 h-3 text-amber-700 group-hover:text-amber-950 transition" />
              </p>
            </div>
            <div className="p-2.5 bg-amber-400 text-zinc-950 border-2 border-zinc-900 flex-shrink-0">
              <Clock className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Card 3: Fora do Prazo */}
        <div 
          onClick={() => onNavigateToTable('fora_prazo')}
          className="p-4 bg-red-100/90 border-3 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-red-200 transition cursor-pointer group"
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-red-950">
                Fora do Prazo (Atrasadas)
              </span>
              <p className="text-xl sm:text-2xl font-black font-mono tracking-tight text-red-950 mt-1 italic">
                {formatCurrency(valorForaDoPrazo)}
              </p>
              <div className="flex items-center space-x-1 mt-1">
                <span className="bg-red-600 text-white font-black text-[9px] uppercase px-1.5 py-0.5 border border-zinc-900">
                  {notasForaDoPrazo.length} ATRASADAS
                </span>
              </div>
            </div>
            <div className="p-2.5 bg-red-600 text-white border-2 border-zinc-900 flex-shrink-0">
              <AlertTriangle className="w-4 h-4 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Card 4: Emitidas (Aguardando Pgto) */}
        <div 
          onClick={() => onNavigateToTable('emitida')}
          className="p-4 bg-sky-100/90 border-3 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-sky-100 transition cursor-pointer group"
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-sky-950">
                Emitidas (Faturadas)
              </span>
              <p className="text-xl sm:text-2xl font-black font-mono tracking-tight text-sky-950 mt-1 italic">
                {formatCurrency(valorEmitidasAguardando)}
              </p>
              <p className="text-[11px] font-bold text-sky-900 mt-1 uppercase flex items-center gap-1">
                <span>{notasEmitidasAguardando.length} aguardando pgto</span>
                <ArrowUpRight className="w-3 h-3 text-sky-700 group-hover:text-sky-950 transition" />
              </p>
            </div>
            <div className="p-2.5 bg-sky-400 text-zinc-950 border-2 border-zinc-900 flex-shrink-0">
              <FileCheck className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Card 5: Pagas / Liquidadas */}
        <div 
          onClick={() => onNavigateToTable('pago')}
          className="p-4 bg-emerald-100/90 border-3 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:bg-emerald-100 transition cursor-pointer group"
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-950">
                Comissões Pagas
              </span>
              <p className="text-xl sm:text-2xl font-black font-mono tracking-tight text-emerald-950 mt-1 italic">
                {formatCurrency(valorPagas)}
              </p>
              <p className="text-[11px] font-black text-emerald-900 mt-1 uppercase flex items-center gap-1">
                <span>{notasPagas.length} quitadas</span>
                <ArrowUpRight className="w-3 h-3 text-emerald-700 group-hover:text-emerald-950 transition" />
              </p>
            </div>
            <div className="p-2.5 bg-emerald-500 text-white border-2 border-zinc-900 flex-shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Bar Chart: Monthly Evolution */}
        <div className="lg:col-span-2 bg-white p-5 border-3 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4">
          <div className="flex items-center justify-between border-b-2 border-zinc-900 pb-3">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-zinc-900" />
              <h3 className="font-black text-sm uppercase tracking-wide text-zinc-900">
                Evolução Mensal de Comissões ({selectedYear === 'ALL' ? 'Todos os Anos' : selectedYear})
              </h3>
            </div>
            <span className="text-[10px] font-black uppercase bg-amber-400 text-zinc-950 px-2 py-0.5 border border-zinc-900">
              Valores por Mês de Vencimento
            </span>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                <XAxis dataKey="monthName" tick={{ fontSize: 11, fontWeight: 700, fill: '#18181b' }} />
                <YAxis 
                  tick={{ fontSize: 10, fontWeight: 600, fill: '#52525b' }} 
                  tickFormatter={(val) => val >= 1000 ? `R$${(val / 1000).toFixed(0)}k` : `R$${val}`}
                />
                <Tooltip 
                  formatter={(val: any) => [formatCurrency(Number(val)), '']}
                  labelFormatter={(label) => `Mês: ${label}`}
                  contentStyle={{
                    backgroundColor: '#18181b',
                    color: '#ffffff',
                    border: '2px solid #18181b',
                    borderRadius: '0px',
                    fontWeight: 'bold',
                    fontSize: '12px'
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '12px', fontWeight: 'bold' }} />
                <Bar dataKey="pago" name="Comissão Paga (R$)" fill="#10b981" stroke="#18181b" strokeWidth={1} />
                <Bar dataKey="pendente" name="A Emitir / Pendente (R$)" fill="#f59e0b" stroke="#18181b" strokeWidth={1} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart: Status Distribution */}
        <div className="bg-white p-5 border-3 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4">
          <div className="flex items-center justify-between border-b-2 border-zinc-900 pb-3">
            <div className="flex items-center space-x-2">
              <PieChartIcon className="w-5 h-5 text-zinc-900" />
              <h3 className="font-black text-sm uppercase tracking-wide text-zinc-900">
                Distribuição de Status
              </h3>
            </div>
            <span className="text-[10px] font-black uppercase bg-zinc-200 text-zinc-900 px-2 py-0.5 border border-zinc-900">
              Proporção
            </span>
          </div>

          {statusPieData.length > 0 ? (
            <div className="h-72 w-full flex flex-col justify-between">
              <ResponsiveContainer width="100%" height="70%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="#18181b" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(val: any) => [formatCurrency(Number(val)), 'Valor']}
                    contentStyle={{
                      backgroundColor: '#18181b',
                      color: '#ffffff',
                      border: '2px solid #18181b',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="grid grid-cols-2 gap-2 text-[10px] font-black uppercase pt-2 border-t border-zinc-200">
                {statusPieData.map(item => (
                  <div key={item.name} className="flex items-center space-x-1.5 truncate">
                    <span className="w-2.5 h-2.5 border border-zinc-900 flex-shrink-0" style={{ backgroundColor: item.color }}></span>
                    <span className="truncate text-zinc-800">{item.name} ({item.count})</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-xs font-bold text-zinc-500 uppercase">
              Nenhum dado disponível no filtro selecionado.
            </div>
          )}
        </div>
      </div>

      {/* Rankings Section: Top Clubes & Top Atletas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Top 5 Clubes */}
        <div className="bg-white p-5 border-3 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4">
          <div className="flex items-center justify-between border-b-2 border-zinc-900 pb-3">
            <div className="flex items-center space-x-2">
              <Building2 className="w-5 h-5 text-amber-500" />
              <h3 className="font-black text-sm uppercase tracking-wide text-zinc-900">
                Top 5 Clubes por Comissões
              </h3>
            </div>
            <span className="text-[10px] font-black uppercase bg-amber-100 text-amber-900 px-2 py-0.5 border border-zinc-900">
              Ranking
            </span>
          </div>

          <div className="space-y-3">
            {topClubs.length > 0 ? (
              topClubs.map((club, idx) => {
                const percent = totalComissao > 0 ? ((club.total / totalComissao) * 100).toFixed(1) : '0';
                return (
                  <div key={club.clube} className="p-2.5 bg-zinc-50 border-2 border-zinc-900 flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span className="w-6 h-6 bg-zinc-900 text-amber-400 font-black text-xs flex items-center justify-center border border-zinc-900 flex-shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-black text-xs uppercase text-zinc-900 truncate">
                          {club.clube}
                        </p>
                        <p className="text-[10px] font-bold text-zinc-500 uppercase">
                          {club.count} contrato(s) • {percent}% do total
                        </p>
                      </div>
                    </div>
                    <span className="font-black font-mono text-xs text-emerald-700 whitespace-nowrap">
                      {formatCurrency(club.total)}
                    </span>
                  </div>
                );
              })
            ) : (
              <p className="text-xs font-bold text-zinc-500 text-center py-4">Nenhum clube encontrado.</p>
            )}
          </div>
        </div>

        {/* Top 5 Atletas Representados */}
        <div className="bg-white p-5 border-3 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4">
          <div className="flex items-center justify-between border-b-2 border-zinc-900 pb-3">
            <div className="flex items-center space-x-2">
              <User className="w-5 h-5 text-sky-600" />
              <h3 className="font-black text-sm uppercase tracking-wide text-zinc-900">
                Top 5 Atletas Representados
              </h3>
            </div>
            <span className="text-[10px] font-black uppercase bg-sky-100 text-sky-900 px-2 py-0.5 border border-zinc-900">
              Atletas
            </span>
          </div>

          <div className="space-y-3">
            {topAthletes.length > 0 ? (
              topAthletes.map((ath, idx) => (
                <div key={ath.atleta} className="p-2.5 bg-zinc-50 border-2 border-zinc-900 flex items-center justify-between gap-2">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <span className="w-6 h-6 bg-sky-600 text-white font-black text-xs flex items-center justify-center border border-zinc-900 flex-shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-black text-xs uppercase text-zinc-900 truncate">
                        {ath.atleta}
                      </p>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase truncate">
                        {ath.clube}
                      </p>
                    </div>
                  </div>
                  <span className="font-black font-mono text-xs text-sky-900 whitespace-nowrap">
                    {formatCurrency(ath.total)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs font-bold text-zinc-500 text-center py-4">Nenhum atleta destacado.</p>
            )}
          </div>
        </div>

        {/* Tipos de Contrato */}
        <div className="bg-white p-5 border-3 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4">
          <div className="flex items-center justify-between border-b-2 border-zinc-900 pb-3">
            <div className="flex items-center space-x-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              <h3 className="font-black text-sm uppercase tracking-wide text-zinc-900">
                Volume por Tipo de Contrato
              </h3>
            </div>
            <span className="text-[10px] font-black uppercase bg-emerald-100 text-emerald-900 px-2 py-0.5 border border-zinc-900">
              Categorias
            </span>
          </div>

          <div className="space-y-3">
            {tipoContratoData.length > 0 ? (
              tipoContratoData.map((tipo) => {
                const percent = totalComissao > 0 ? Math.round((tipo.total / totalComissao) * 100) : 0;
                return (
                  <div key={tipo.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-black uppercase">
                      <span className="text-zinc-800">{tipo.name} ({tipo.count})</span>
                      <span className="font-mono text-zinc-900">{formatCurrency(tipo.total)} ({percent}%)</span>
                    </div>
                    <div className="w-full bg-zinc-200 h-2.5 border border-zinc-900 overflow-hidden">
                      <div 
                        className="bg-zinc-900 h-full transition-all" 
                        style={{ width: `${Math.min(100, Math.max(5, percent))}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs font-bold text-zinc-500 text-center py-4">Nenhum dado por categoria.</p>
            )}
          </div>
        </div>
      </div>

      {/* Próximas NFs e Atrasos em Destaque */}
      <div className="bg-white p-5 border-3 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b-2 border-zinc-900 pb-3 gap-2">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <h3 className="font-black text-sm sm:text-base uppercase tracking-wide text-zinc-900">
              Controle Prioritário de NFs e Vencimentos
            </h3>
          </div>
          <button
            onClick={() => onNavigateToTable('nao_emitida')}
            className="inline-flex items-center space-x-1 text-xs font-black uppercase text-amber-600 hover:text-amber-700 underline cursor-pointer"
          >
            <span>Ver todas as NFs pendentes na Tabela ↗</span>
          </button>
        </div>

        <div className="overflow-x-auto border-2 border-zinc-900">
          <table className="w-full text-left text-xs font-bold">
            <thead>
              <tr className="bg-zinc-900 text-white uppercase text-[10px] tracking-wider border-b-2 border-zinc-900">
                <th className="p-2.5">Vencimento NF</th>
                <th className="p-2.5">Clube / Cliente</th>
                <th className="p-2.5">Atleta</th>
                <th className="p-2.5">Parcela</th>
                <th className="p-2.5 text-right">Comissão MMB</th>
                <th className="p-2.5">Status NF</th>
                <th className="p-2.5 text-center">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y border-zinc-200">
              {upcomingRecords.length > 0 ? (
                upcomingRecords.map((rec) => {
                  const isAtrasada = isPastDate(rec.dataVencimentoNF) && rec.statusNF !== 'Emitida';
                  return (
                    <tr 
                      key={rec.id} 
                      className={`hover:bg-amber-50 transition ${
                        isAtrasada ? 'bg-red-50/80' : ''
                      }`}
                    >
                      <td className="p-2.5 font-mono font-black text-zinc-900 whitespace-nowrap">
                        <div className="flex items-center space-x-1">
                          {isAtrasada && <AlertTriangle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />}
                          <span>{rec.dataVencimentoNF || '-'}</span>
                        </div>
                      </td>
                      <td className="p-2.5 text-zinc-900 font-black uppercase">
                        {rec.clube || rec.clienteNome}
                      </td>
                      <td className="p-2.5 text-zinc-700 font-bold uppercase">
                        {rec.atleta || '-'}
                      </td>
                      <td className="p-2.5 font-mono text-zinc-800">
                        {rec.parcelaAtual || 1}/{rec.totalParcelas || 1}
                      </td>
                      <td className="p-2.5 text-right font-mono font-black text-emerald-800 whitespace-nowrap">
                        {formatCurrency(rec.valorComissao)}
                      </td>
                      <td className="p-2.5">
                        <span className={`px-2 py-0.5 text-[10px] font-black uppercase border border-zinc-900 inline-block ${
                          isAtrasada 
                            ? 'bg-red-600 text-white' 
                            : rec.statusNF === 'Emitida' 
                              ? 'bg-sky-400 text-zinc-950' 
                              : 'bg-amber-300 text-zinc-950'
                        }`}>
                          {isAtrasada ? 'ATRASADA' : (rec.statusNF || 'Não emitida')}
                        </span>
                      </td>
                      <td className="p-2.5 text-center whitespace-nowrap">
                        <button
                          onClick={() => onOpenRecordDetail(rec)}
                          className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-white text-[10px] font-black uppercase border border-zinc-900 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 cursor-pointer"
                        >
                          Ver / Editar
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-xs font-bold text-zinc-500 uppercase">
                    Nenhuma nota fiscal pendente encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
