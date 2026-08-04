import React, { useState, useEffect } from 'react';
import { X, Save, FileSpreadsheet, Calendar, DollarSign, CheckCircle2, Clock, FileText, AlertTriangle, Trash2, UserCheck, Users, Plus, Copy } from 'lucide-react';
import { CommissionRecord, StatusNF, StatusPagamento } from '../types';
import { cleanClubeAndAtleta } from '../utils/athleteUtils';
import { PREDEFINED_AGENTES, getAgenteColor } from '../constants/captadores';

interface RecordModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: CommissionRecord | null; // null for new record
  allRecords?: CommissionRecord[];
  onSave: (record: CommissionRecord, propagateToAllMonths?: boolean) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (record: CommissionRecord) => void;
}

export const RecordModal: React.FC<RecordModalProps> = ({
  isOpen,
  onClose,
  record,
  allRecords = [],
  onSave,
  onDelete,
  onDuplicate
}) => {
  const [formData, setFormData] = useState<Partial<CommissionRecord>>({
    numeroContrato: '',
    clienteNome: '',
    clienteCnpjCpf: '',
    servicoDescricao: '',
    valorBaseContrato: 0,
    percentualComissao: 10,
    valorComissao: 0,
    dataVencimentoNF: new Date().toISOString().split('T')[0],
    statusNF: 'Pendente',
    numeroNF: '',
    dataEmissaoNF: '',
    statusPagamento: 'Aguardando',
    dataPagamento: '',
    observacoes: ''
  });

  const [customCaptador, setCustomCaptador] = useState('');
  const [propagateToAllMonths, setPropagateToAllMonths] = useState<boolean>(true);

  useEffect(() => {
    if (record) {
      setFormData({
        ...record,
        captadores: record.captadores || record.agentes || []
      });
      setPropagateToAllMonths(true);
    } else {
      setFormData({
        numeroContrato: `CT-2026/${Math.floor(100 + Math.random() * 900)}`,
        clienteNome: '',
        clube: '',
        atleta: '',
        tipoContrato: 'Intermediação Comercial',
        dataContrato: new Date().toISOString().split('T')[0],
        clienteCnpjCpf: '',
        servicoDescricao: 'Intermediação e Comissão Comercial',
        valorBaseContrato: 10000,
        percentualComissao: 10,
        valorComissao: 1000,
        dataVencimentoNF: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        statusNF: 'Não emitida',
        numeroNF: '',
        dataEmissaoNF: '',
        statusPagamento: 'Aguardando',
        pagoOuNao: 'Não pago',
        dataPagamento: '',
        observacoes: '',
        captadores: [],
        agentes: [],
        parcelaAtual: 1,
        totalParcelas: 1
      });
      setPropagateToAllMonths(true);
    }
  }, [record, isOpen]);

  // Check if current typed athlete matches existing records in allRecords
  const matchingAthleteRecord = React.useMemo(() => {
    const term = (formData.atleta || '').toLowerCase().trim();
    if (!term || term.length < 2 || term === '-' || !allRecords.length) return null;
    return allRecords.find(r => r.atleta && r.atleta.toLowerCase().trim() === term);
  }, [formData.atleta, allRecords]);

  const countMatchingAthleteRecords = React.useMemo(() => {
    const term = (formData.atleta || '').toLowerCase().trim();
    if (!term || term.length < 2 || term === '-' || !allRecords.length) return 0;
    return allRecords.filter(r => r.atleta && r.atleta.toLowerCase().trim() === term).length;
  }, [formData.atleta, allRecords]);

  const handlePrefillAthleteData = () => {
    if (!matchingAthleteRecord) return;
    const existingAgentes = matchingAthleteRecord.agentes || matchingAthleteRecord.captadores || [];
    setFormData(prev => ({
      ...prev,
      clube: matchingAthleteRecord.clube || prev.clube,
      clienteNome: matchingAthleteRecord.clube || prev.clienteNome,
      tipoContrato: matchingAthleteRecord.tipoContrato || prev.tipoContrato,
      clienteCnpjCpf: matchingAthleteRecord.clienteCnpjCpf || prev.clienteCnpjCpf,
      observacoes: matchingAthleteRecord.observacoes || prev.observacoes,
      captadores: existingAgentes.length > 0 ? existingAgentes : prev.captadores,
      agentes: existingAgentes.length > 0 ? existingAgentes : prev.agentes,
      percentualComissao: matchingAthleteRecord.percentualComissao || prev.percentualComissao
    }));
  };

  const toggleCaptador = (name: string) => {
    const currentList = formData.captadores || formData.agentes || [];
    const newList = currentList.includes(name)
      ? currentList.filter(c => c !== name)
      : [...currentList, name];

    setFormData(prev => ({
      ...prev,
      captadores: newList,
      agentes: newList
    }));
  };

  const handleAddCustomCaptador = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customCaptador.trim();
    if (!trimmed) return;
    const currentList = formData.captadores || formData.agentes || [];
    if (!currentList.includes(trimmed)) {
      const newList = [...currentList, trimmed];
      setFormData(prev => ({
        ...prev,
        captadores: newList,
        agentes: newList
      }));
    }
    setCustomCaptador('');
  };

  if (!isOpen) return null;

  // Auto calculate commission when base or % changes
  const handleBaseChange = (val: number) => {
    const perc = formData.percentualComissao || 0;
    const calcComissao = (val * perc) / 100;
    setFormData(prev => ({
      ...prev,
      valorBaseContrato: val,
      valorComissao: calcComissao
    }));
  };

  const handlePercChange = (val: number) => {
    const base = formData.valorBaseContrato || 0;
    const calcComissao = (base * val) / 100;
    setFormData(prev => ({
      ...prev,
      percentualComissao: val,
      valorComissao: calcComissao
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clienteNome && !formData.clube && !formData.valorComissao) {
      alert('Por favor, preencha o clube/cliente e o valor da comissão.');
      return;
    }

    const cleaned = cleanClubeAndAtleta(formData.clube, formData.atleta, formData.clienteNome);

    const finalRecord: CommissionRecord = {
      id: record ? record.id : `rec-${Date.now()}`,
      numeroContrato: formData.numeroContrato || 'CT-2026/001',
      clienteNome: cleaned.clube,
      clube: cleaned.clube,
      atleta: cleaned.atleta,
      tipoContrato: formData.tipoContrato || 'Intermediação Comercial',
      dataContrato: formData.dataContrato || new Date().toISOString().split('T')[0],
      clienteCnpjCpf: formData.clienteCnpjCpf || '',
      servicoDescricao: formData.servicoDescricao || '',
      valorBaseContrato: Number(formData.valorBaseContrato) || 0,
      percentualComissao: Number(formData.percentualComissao) || 0,
      valorComissao: Number(formData.valorComissao) || 0,
      dataVencimentoNF: formData.dataVencimentoNF || new Date().toISOString().split('T')[0],
      statusNF: (formData.statusNF as StatusNF) || 'Não emitida',
      numeroNF: formData.numeroNF || '',
      dataEmissaoNF: formData.dataEmissaoNF || '',
      statusPagamento: (formData.statusPagamento as StatusPagamento) || 'Aguardando',
      pagoOuNao: formData.statusPagamento === 'Pago' ? 'Pago' : 'Não pago',
      dataPagamento: formData.dataPagamento || '',
      observacoes: formData.observacoes || '',
      captadores: formData.captadores || formData.agentes || [],
      agentes: formData.captadores || formData.agentes || [],
      criadoEm: record ? record.criadoEm : new Date().toISOString(),
      parcelaAtual: Number(formData.parcelaAtual) || 1,
      totalParcelas: Number(formData.totalParcelas) || 1
    };

    onSave(finalRecord, propagateToAllMonths);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-zinc-900/80 backdrop-blur-xs">
      <div className="bg-white max-w-2xl w-full border-3 sm:border-4 border-zinc-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-zinc-900 text-white p-3.5 sm:p-5 flex items-center justify-between border-b-4 border-zinc-900">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="p-1.5 sm:p-2 bg-emerald-400 text-zinc-950 border-2 border-zinc-900 flex-shrink-0">
              <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black uppercase tracking-tight">
                {record ? 'Editar Comissão & Nota Fiscal' : 'Nova Comissão'}
              </h3>
              <p className="text-[10px] sm:text-xs font-bold text-zinc-400 uppercase tracking-wider">
                {record ? `Contrato nº ${record.numeroContrato}` : 'Preencha os dados do contrato e comissão'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 border-2 border-white hover:bg-zinc-800 text-white transition min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-3 sm:space-y-4 text-xs font-medium text-zinc-900">
          
          {/* Main Info: Clube, Atleta, Tipo de Contrato */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-black text-zinc-900 uppercase tracking-wider mb-1">
                Clube (Contratante)
              </label>
              <input
                type="text"
                value={formData.clube || formData.clienteNome}
                onChange={(e) => setFormData({ ...formData, clube: e.target.value, clienteNome: e.target.value })}
                required
                placeholder="Ex: CR Flamengo"
                className="w-full px-3 py-2 border-2 border-zinc-900 font-black text-zinc-900 text-xs uppercase focus:bg-amber-50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-black text-zinc-900 uppercase tracking-wider mb-1">
                Atleta
              </label>
              <input
                type="text"
                value={formData.atleta || ''}
                onChange={(e) => setFormData({ ...formData, atleta: e.target.value })}
                placeholder="Ex: Gabriel Barbosa"
                className="w-full px-3 py-2 border-2 border-zinc-900 font-bold text-xs uppercase focus:bg-amber-50 focus:outline-none"
              />
              {countMatchingAthleteRecords > 0 && matchingAthleteRecord && (
                <div className="mt-1 flex items-center justify-between bg-amber-100 border border-amber-400 p-1.5 text-[10px] font-bold text-amber-950">
                  <span>💡 {countMatchingAthleteRecords} parcela(s) encontradas.</span>
                  <button
                    type="button"
                    onClick={handlePrefillAthleteData}
                    className="px-1.5 py-0.5 bg-amber-400 text-zinc-950 border border-zinc-900 font-black uppercase hover:bg-amber-300 cursor-pointer"
                  >
                    Preencher Dados
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block font-black text-zinc-900 uppercase tracking-wider mb-1">
                Tipo de Contrato
              </label>
              <input
                type="text"
                value={formData.tipoContrato || ''}
                onChange={(e) => setFormData({ ...formData, tipoContrato: e.target.value })}
                placeholder="Ex: Transferência / Renovação"
                className="w-full px-3 py-2 border-2 border-zinc-900 text-xs font-bold focus:bg-amber-50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-black text-zinc-900 uppercase tracking-wider mb-1">
                Nº do Contrato
              </label>
              <input
                type="text"
                value={formData.numeroContrato}
                onChange={(e) => setFormData({ ...formData, numeroContrato: e.target.value })}
                required
                className="w-full px-3 py-2 border-2 border-zinc-900 font-mono text-xs font-bold focus:bg-amber-50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-black text-zinc-900 uppercase tracking-wider mb-1">
                Data do Contrato
              </label>
              <input
                type="date"
                value={formData.dataContrato || ''}
                onChange={(e) => setFormData({ ...formData, dataContrato: e.target.value })}
                className="w-full px-3 py-2 border-2 border-zinc-900 font-mono text-xs font-bold focus:bg-amber-50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-black text-zinc-900 uppercase tracking-wider mb-1">
                Parcelas (Atual / Total)
              </label>
              <div className="flex items-center space-x-1">
                <input
                  type="number"
                  min="1"
                  value={formData.parcelaAtual || 1}
                  onChange={(e) => setFormData({ ...formData, parcelaAtual: parseInt(e.target.value, 10) || 1 })}
                  className="w-1/2 px-2 py-2 border-2 border-zinc-900 font-mono text-xs font-bold text-center focus:bg-amber-50 focus:outline-none"
                  placeholder="1"
                />
                <span className="font-black text-zinc-900">/</span>
                <input
                  type="number"
                  min="1"
                  value={formData.totalParcelas || 1}
                  onChange={(e) => setFormData({ ...formData, totalParcelas: parseInt(e.target.value, 10) || 1 })}
                  className="w-1/2 px-2 py-2 border-2 border-zinc-900 font-mono text-xs font-bold text-center focus:bg-amber-50 focus:outline-none"
                  placeholder="1"
                />
              </div>
            </div>
          </div>

          {/* Agentes Envolvidos na Comissão */}
          <div className="bg-indigo-50/70 p-3.5 border-2 border-zinc-900">
            <div className="flex items-center justify-between mb-2">
              <label className="font-black text-zinc-900 uppercase tracking-wider text-xs flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-indigo-700" />
                <span>Agentes Envolvidos na Comissão</span>
              </label>
              <span className="text-[10px] font-bold text-indigo-900 bg-indigo-200 px-2 py-0.5 rounded border border-indigo-400">
                {(formData.captadores || formData.agentes || []).length} selecionado(s)
              </span>
            </div>

            {/* Predefined agentes interactive chips */}
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {PREDEFINED_AGENTES.map((cap) => {
                const isSelected = (formData.captadores || formData.agentes || []).includes(cap);
                const colors = getAgenteColor(cap);
                return (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => toggleCaptador(cap)}
                    className={`px-2.5 py-1 text-xs font-bold transition flex items-center space-x-1 border cursor-pointer select-none ${
                      isSelected
                        ? `bg-zinc-900 text-white border-zinc-900 shadow-[2px_2px_0px_0px_rgba(79,70,229,1)]`
                        : `bg-white ${colors.text} ${colors.border} hover:bg-zinc-100`
                    }`}
                  >
                    <span>{isSelected ? '✓ ' : '+ '}</span>
                    <span>{cap}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Agente Input */}
            <div className="flex items-center space-x-2 pt-2 border-t border-indigo-200">
              <input
                type="text"
                value={customCaptador}
                onChange={(e) => setCustomCaptador(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomCaptador(e);
                  }
                }}
                placeholder="Outro agente... (pressione Enter)"
                className="flex-1 px-2.5 py-1.5 bg-white border border-zinc-900 text-xs font-bold focus:bg-amber-50 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddCustomCaptador}
                className="px-3 py-1.5 bg-zinc-900 text-white text-xs font-black uppercase tracking-wider border border-zinc-900 hover:bg-zinc-800 transition cursor-pointer"
              >
                + Adicionar
              </button>
            </div>

            {/* Selected custom agentes (if not in predefined list) */}
            {(formData.captadores || formData.agentes || []).some(c => !(PREDEFINED_AGENTES as readonly string[]).includes(c)) && (
              <div className="flex flex-wrap gap-1 mt-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase self-center mr-1">Outros:</span>
                {(formData.captadores || formData.agentes || [])
                  .filter(c => !(PREDEFINED_AGENTES as readonly string[]).includes(c))
                  .map(c => (
                    <span key={c} className="inline-flex items-center space-x-1 px-2 py-0.5 bg-zinc-900 text-white text-[11px] font-bold">
                      <span>{c}</span>
                      <button
                        type="button"
                        onClick={() => toggleCaptador(c)}
                        className="hover:text-rose-400 font-black ml-1"
                      >
                        ×
                      </button>
                    </span>
                  ))}
              </div>
            )}
          </div>

          {/* Values & Installment Section */}
          <div className="bg-zinc-100 p-4 border-2 border-zinc-900 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-black text-zinc-950 uppercase tracking-wider mb-1 text-xs">
                VALOR MMB / Comissão (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.valorComissao}
                onChange={(e) => setFormData({ ...formData, valorComissao: parseFloat(e.target.value) || 0 })}
                required
                placeholder="Ex: 15000.00"
                className="w-full px-3 py-2 border-2 border-zinc-900 bg-emerald-300 font-black text-zinc-950 text-sm font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-black text-zinc-900 uppercase tracking-wider mb-1 text-xs">
                Valor do Contrato / Operação (R$)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.valorBaseContrato}
                onChange={(e) => setFormData({ ...formData, valorBaseContrato: parseFloat(e.target.value) || 0 })}
                placeholder="Ex: 100000.00"
                className="w-full px-3 py-2 border-2 border-zinc-900 text-xs font-black font-mono focus:bg-amber-50 focus:outline-none"
              />
            </div>
          </div>

          {/* Quick NF Status Selector Box */}
          <div className="bg-amber-50 p-3.5 border-2 border-zinc-900 rounded-none">
            <label className="block font-black text-zinc-900 uppercase tracking-wider text-xs mb-2">
              Status da Nota Fiscal (Marcar Como):
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFormData({
                  ...formData,
                  statusNF: 'Emitida',
                  dataEmissaoNF: formData.dataEmissaoNF || new Date().toISOString().split('T')[0]
                })}
                className={`py-2 px-3 text-xs font-black uppercase tracking-wider border-2 border-zinc-900 transition flex items-center justify-center space-x-1.5 ${
                  formData.statusNF === 'Emitida'
                    ? 'bg-emerald-400 text-zinc-950 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-white text-zinc-800 hover:bg-emerald-100'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-zinc-950" />
                <span>Emitida</span>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, statusNF: 'Não emitida' })}
                className={`py-2 px-3 text-xs font-black uppercase tracking-wider border-2 border-zinc-900 transition flex items-center justify-center space-x-1.5 ${
                  formData.statusNF === 'Não emitida' || formData.statusNF === 'Pendente'
                    ? 'bg-amber-400 text-zinc-950 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-white text-zinc-800 hover:bg-amber-100'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-zinc-950" />
                <span>Não emitida</span>
              </button>

              <button
                type="button"
                onClick={() => setFormData({ ...formData, statusNF: 'Não autorizada' })}
                className={`py-2 px-3 text-xs font-black uppercase tracking-wider border-2 border-zinc-900 transition flex items-center justify-center space-x-1.5 ${
                  formData.statusNF === 'Não autorizada'
                    ? 'bg-rose-400 text-zinc-950 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-white text-zinc-800 hover:bg-rose-100'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-zinc-950" />
                <span>Não autorizada</span>
              </button>
            </div>
          </div>

          {/* NF & Payment details */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-black text-zinc-900 uppercase tracking-wider mb-1">
                Vencimento da NF
              </label>
              <input
                type="date"
                value={formData.dataVencimentoNF}
                onChange={(e) => setFormData({ ...formData, dataVencimentoNF: e.target.value })}
                required
                className="w-full px-3 py-2 border-2 border-zinc-900 text-xs font-black font-mono focus:bg-amber-50 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-black text-zinc-900 uppercase tracking-wider mb-1">
                Status Selecionado
              </label>
              <select
                value={formData.statusNF}
                onChange={(e) => setFormData({ ...formData, statusNF: e.target.value as StatusNF })}
                className="w-full px-3 py-2 border-2 border-zinc-900 text-xs font-black uppercase focus:bg-amber-50 focus:outline-none"
              >
                <option value="Emitida">Emitida</option>
                <option value="Não emitida">Não emitida</option>
                <option value="Não autorizada">Não autorizada</option>
                <option value="Pendente">Pendente (A Emitir)</option>
                <option value="Cancelada">Cancelada</option>
              </select>
            </div>

            <div>
              <label className="block font-black text-zinc-900 uppercase tracking-wider mb-1">
                Nº Nota Fiscal
              </label>
              <input
                type="text"
                value={formData.numeroNF}
                onChange={(e) => setFormData({ ...formData, numeroNF: e.target.value })}
                placeholder="NF-00123"
                className="w-full px-3 py-2 border-2 border-zinc-900 text-xs font-black font-mono uppercase focus:bg-amber-50 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-black text-zinc-900 uppercase tracking-wider mb-1">
                Status do Pagamento
              </label>
              <select
                value={formData.statusPagamento}
                onChange={(e) => setFormData({ ...formData, statusPagamento: e.target.value as StatusPagamento })}
                className="w-full px-3 py-2 border-2 border-zinc-900 text-xs font-black uppercase focus:bg-amber-50 focus:outline-none"
              >
                <option value="Aguardando">Aguardando Pagamento</option>
                <option value="Pago">Pago / Liquidado</option>
                <option value="Atrasado">Atrasado</option>
              </select>
            </div>

            <div>
              <label className="block font-black text-zinc-900 uppercase tracking-wider mb-1">
                Data do Pagamento
              </label>
              <input
                type="date"
                value={formData.dataPagamento || ''}
                onChange={(e) => setFormData({ ...formData, dataPagamento: e.target.value })}
                className="w-full px-3 py-2 border-2 border-zinc-900 text-xs font-black font-mono focus:bg-amber-50 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-black text-zinc-900 uppercase tracking-wider mb-1">
              Observações & Destaques Contratuais
            </label>
            <textarea
              rows={3}
              value={formData.observacoes}
              onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
              placeholder="Condições técnicas, retentores, PIX..."
              className="w-full px-3 py-2 border-2 border-zinc-900 text-xs font-bold focus:bg-amber-50 focus:outline-none"
            />
          </div>

          {/* PROPAGATION TO ALL MONTHS / PARCELAS FOR ATHLETE */}
          <div className="bg-amber-50 border-2 border-zinc-900 p-3 space-y-1">
            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={propagateToAllMonths}
                onChange={(e) => setPropagateToAllMonths(e.target.checked)}
                className="w-4 h-4 text-emerald-600 border-2 border-zinc-900 rounded-none focus:ring-0 cursor-pointer"
              />
              <span className="text-xs font-black uppercase text-zinc-950 tracking-tight">
                ⚡ Atribuir estas informações (Agentes, Clube, Tipo) a TODOS OS MESES deste Atleta
              </span>
            </label>
            <p className="text-[11px] text-zinc-700 font-bold pl-6">
              {formData.atleta && formData.atleta !== '-' ? (
                <>Ao salvar, as informações de Agentes, Clube e Contrato do atleta <strong className="text-zinc-950 uppercase font-black">{formData.atleta}</strong> serão sincronizadas em todas as parcelas e meses cadastrados.</>
              ) : (
                <>Sincroniza as informações alteradas em todas as parcelas e meses deste atleta em toda a planilha.</>
              )}
            </p>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t-2 border-zinc-900 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              {record && onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (record.id) {
                      onDelete(record.id);
                    }
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 bg-rose-500 hover:bg-rose-600 text-white font-black uppercase text-xs tracking-wider border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-white" />
                  <span>Excluir</span>
                </button>
              )}

              {record && onDuplicate && (
                <button
                  type="button"
                  onClick={() => {
                    onDuplicate(formData as CommissionRecord);
                  }}
                  className="inline-flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-xs tracking-wider border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
                  title="Duplica este registro para divisão entre duas ou mais empresas"
                >
                  <Copy className="w-4 h-4 text-white" />
                  <span>Duplicar Comissão</span>
                </button>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border-2 border-zinc-900 text-zinc-900 font-black uppercase text-xs tracking-wider hover:bg-zinc-200 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex items-center space-x-2 px-5 py-2 bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-black uppercase text-xs tracking-wider border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition cursor-pointer"
              >
                <Save className="w-4 h-4 text-zinc-950" />
                <span>Salvar na Planilha</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
