import React, { useState, useEffect } from 'react';
import { X, Copy, Users, FileText, Building2, DollarSign, Layers, Check, Sparkles } from 'lucide-react';
import { CommissionRecord } from '../types';
import { PREDEFINED_AGENTES, getAgenteColor } from '../constants/captadores';
import { formatCurrency } from '../utils/excel';

export interface DuplicateOptions {
  duplicateAllInstallments: boolean;
  newAgentes: string[];
  newTipoContrato: string;
  newClienteNome: string;
  newClube: string;
  valueMode: 'same' | 'split50' | 'custom';
  customValue?: number;
  contractSuffix?: string;
}

interface DuplicateModalProps {
  isOpen: boolean;
  record: CommissionRecord | null;
  allRecords: CommissionRecord[];
  onClose: () => void;
  onConfirm: (options: DuplicateOptions) => void;
}

const TIPO_COMISSAO_PRESETS = [
  'Intermediação Comercial',
  'Direito de Imagem',
  'Renovação Contratual',
  'Transferência / Agenciamento',
  'Licenciamento',
  'Empréstimo de Atleta',
  'Representação Exclusiva',
  'Comissão de Salário'
];

export const DuplicateModal: React.FC<DuplicateModalProps> = ({
  isOpen,
  record,
  allRecords = [],
  onClose,
  onConfirm
}) => {
  const [duplicateAllInstallments, setDuplicateAllInstallments] = useState(true);
  const [selectedAgentes, setSelectedAgentes] = useState<string[]>([]);
  const [customAgente, setCustomAgente] = useState('');
  const [tipoContrato, setTipoContrato] = useState('Direito de Imagem');
  const [customTipo, setCustomTipo] = useState('');
  const [clienteNome, setClienteNome] = useState('');
  const [clube, setClube] = useState('');
  const [valueMode, setValueMode] = useState<'same' | 'split50' | 'custom'>('same');
  const [customValue, setCustomValue] = useState<number>(0);
  const [contractSuffix, setContractSuffix] = useState('-B');

  // Find all installments associated with this contract
  const contractInstallments = React.useMemo(() => {
    if (!record) return [];
    if (!record.numeroContrato) return [record];
    
    // Group records by contract number or athlete + contract date
    const matching = allRecords.filter(r => 
      (r.numeroContrato && r.numeroContrato === record.numeroContrato) ||
      (r.atleta && r.atleta === record.atleta && r.totalParcelas === record.totalParcelas && r.totalParcelas && r.totalParcelas > 1)
    );

    return matching.length > 0 ? matching : [record];
  }, [record, allRecords]);

  useEffect(() => {
    if (record) {
      const initialAgentes = record.captadores || record.agentes || [];
      setSelectedAgentes(initialAgentes);
      setTipoContrato(record.tipoContrato || 'Direito de Imagem');
      setClienteNome(record.clienteNome || record.clube || '');
      setClube(record.clube || record.clienteNome || '');
      setCustomValue(record.valorComissao || 0);
      setDuplicateAllInstallments(contractInstallments.length > 1);
      
      // Auto suggest suffix if original already has -B or similar
      if (record.numeroContrato?.includes('-B')) {
        setContractSuffix('-C');
      } else {
        setContractSuffix('-B');
      }
    }
  }, [record, contractInstallments]);

  if (!isOpen || !record) return null;

  const toggleAgente = (name: string) => {
    setSelectedAgentes(prev => 
      prev.includes(name) ? prev.filter(a => a !== name) : [...prev, name]
    );
  };

  const handleAddCustomAgente = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customAgente.trim();
    if (trimmed && !selectedAgentes.includes(trimmed)) {
      setSelectedAgentes(prev => [...prev, trimmed]);
      setCustomAgente('');
    }
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const finalTipo = customTipo.trim() || tipoContrato;
    
    onConfirm({
      duplicateAllInstallments,
      newAgentes: selectedAgentes,
      newTipoContrato: finalTipo,
      newClienteNome: clienteNome || record.clienteNome,
      newClube: clube || record.clube || clienteNome,
      valueMode,
      customValue: Number(customValue) || 0,
      contractSuffix: contractSuffix.trim()
    });

    onClose();
  };

  const targetInstallmentCount = duplicateAllInstallments ? contractInstallments.length : 1;
  const currentInstallmentValue = record.valorComissao || 0;
  
  const estimatedNewValue = valueMode === 'same' 
    ? currentInstallmentValue 
    : valueMode === 'split50' 
      ? currentInstallmentValue / 2 
      : customValue;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-zinc-900/80 backdrop-blur-xs">
      <div className="bg-white max-w-xl w-full border-3 sm:border-4 border-zinc-900 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-indigo-950 text-white p-4 flex items-center justify-between border-b-4 border-zinc-900">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-400 text-zinc-950 border-2 border-zinc-900 flex-shrink-0">
              <Copy className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight flex items-center gap-2">
                <span>Duplicar Comissão</span>
                <span className="bg-emerald-400 text-zinc-950 text-[10px] px-2 py-0.5 font-extrabold border border-zinc-900">
                  {targetInstallmentCount} {targetInstallmentCount === 1 ? 'Parcela' : 'Parcelas'}
                </span>
              </h3>
              <p className="text-xs font-bold text-indigo-200">
                {record.atleta ? `Atleta: ${record.atleta}` : `Contrato: ${record.numeroContrato}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 border-2 border-white hover:bg-indigo-900 text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleConfirm} className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs font-medium text-zinc-900">
          
          {/* Scope Selector: All installments or single installment */}
          {contractInstallments.length > 1 && (
            <div className="bg-amber-50 p-3.5 border-2 border-zinc-900 space-y-2">
              <label className="block font-black text-zinc-900 uppercase tracking-wider text-xs flex items-center space-x-1.5">
                <Layers className="w-4 h-4 text-amber-700" />
                <span>Escopo da Duplicação (Período / Parcelas)</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDuplicateAllInstallments(true)}
                  className={`p-2.5 text-left border-2 border-zinc-900 transition flex items-start space-x-2 cursor-pointer ${
                    duplicateAllInstallments
                      ? 'bg-amber-300 text-zinc-950 font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                      : 'bg-white hover:bg-amber-100 font-bold'
                  }`}
                >
                  <input
                    type="radio"
                    name="scope"
                    checked={duplicateAllInstallments}
                    onChange={() => setDuplicateAllInstallments(true)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-black uppercase">Duplicar Contrato Inteiro</div>
                    <div className="text-[10px] text-zinc-700">
                      Gera todas as {contractInstallments.length} parcelas em todos os meses correspondentes.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setDuplicateAllInstallments(false)}
                  className={`p-2.5 text-left border-2 border-zinc-900 transition flex items-start space-x-2 cursor-pointer ${
                    !duplicateAllInstallments
                      ? 'bg-amber-300 text-zinc-950 font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                      : 'bg-white hover:bg-amber-100 font-bold'
                  }`}
                >
                  <input
                    type="radio"
                    name="scope"
                    checked={!duplicateAllInstallments}
                    onChange={() => setDuplicateAllInstallments(false)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-black uppercase">Apenas esta Parcela</div>
                    <div className="text-[10px] text-zinc-700">
                      Duplica apenas a parcela {record.parcelaAtual || 1}/{record.totalParcelas || 1} deste mês.
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Section 1: Agente / Captador */}
          <div className="bg-indigo-50/80 p-3.5 border-2 border-zinc-900 space-y-2">
            <div className="flex items-center justify-between">
              <label className="font-black text-zinc-900 uppercase tracking-wider text-xs flex items-center space-x-1.5">
                <Users className="w-4 h-4 text-indigo-700" />
                <span>Alterar Agente(s) da Nova Comissão</span>
              </label>
              <span className="text-[10px] font-bold text-indigo-900 bg-indigo-200 px-2 py-0.5 border border-indigo-400">
                {selectedAgentes.length} selecionado(s)
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PREDEFINED_AGENTES.map((agente) => {
                const isSelected = selectedAgentes.includes(agente);
                const colors = getAgenteColor(agente);
                return (
                  <button
                    key={agente}
                    type="button"
                    onClick={() => toggleAgente(agente)}
                    className={`px-2.5 py-1 text-xs font-bold transition flex items-center space-x-1 border cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-900 text-white border-zinc-900 shadow-[2px_2px_0px_0px_rgba(79,70,229,1)]'
                        : `bg-white ${colors.text} ${colors.border} hover:bg-zinc-100`
                    }`}
                  >
                    <span>{isSelected ? '✓ ' : '+ '}</span>
                    <span>{agente}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom agente prompt */}
            <div className="flex items-center space-x-2 pt-1">
              <input
                type="text"
                value={customAgente}
                onChange={(e) => setCustomAgente(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomAgente(e);
                  }
                }}
                placeholder="Outro agente/empresa..."
                className="flex-1 px-2.5 py-1.5 bg-white border border-zinc-900 text-xs font-bold focus:bg-amber-50 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddCustomAgente}
                className="px-3 py-1.5 bg-zinc-900 text-white text-xs font-black uppercase tracking-wider border border-zinc-900 hover:bg-zinc-800 transition cursor-pointer"
              >
                + Adicionar
              </button>
            </div>
          </div>

          {/* Section 2: Tipo de Comissão */}
          <div className="bg-emerald-50/80 p-3.5 border-2 border-zinc-900 space-y-2">
            <label className="font-black text-zinc-900 uppercase tracking-wider text-xs flex items-center space-x-1.5">
              <FileText className="w-4 h-4 text-emerald-700" />
              <span>Tipo de Comissão / Contrato</span>
            </label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {TIPO_COMISSAO_PRESETS.map((preset) => {
                const isSelected = tipoContrato === preset && !customTipo;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setTipoContrato(preset);
                      setCustomTipo('');
                    }}
                    className={`p-2 text-[11px] font-extrabold uppercase border text-center transition cursor-pointer leading-tight ${
                      isSelected
                        ? 'bg-emerald-600 text-white border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                        : 'bg-white text-zinc-800 border-zinc-300 hover:bg-emerald-100'
                    }`}
                  >
                    {preset}
                  </button>
                );
              })}
            </div>

            <div className="pt-1">
              <input
                type="text"
                value={customTipo}
                onChange={(e) => setCustomTipo(e.target.value)}
                placeholder="Ou digite outro tipo personalizado (ex: Comissão Especial)"
                className="w-full px-2.5 py-1.5 bg-white border border-zinc-900 text-xs font-bold focus:bg-amber-50 focus:outline-none"
              />
            </div>
          </div>

          {/* Section 3: Empresa / Cliente Contratante */}
          <div className="bg-zinc-50 p-3.5 border-2 border-zinc-900 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-black text-zinc-900 uppercase tracking-wider mb-1 text-xs flex items-center space-x-1">
                  <Building2 className="w-3.5 h-3.5 text-zinc-700" />
                  <span>Clube / Contratante</span>
                </label>
                <input
                  type="text"
                  value={clube}
                  onChange={(e) => setClube(e.target.value)}
                  placeholder="Ex: CR Flamengo ou Empresa X"
                  className="w-full px-2.5 py-1.5 border-2 border-zinc-900 text-xs font-bold focus:bg-amber-50 focus:outline-none uppercase"
                />
              </div>

              <div>
                <label className="block font-black text-zinc-900 uppercase tracking-wider mb-1 text-xs">
                  Sufixo do Nº Contrato
                </label>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-xs font-bold text-zinc-500">{record.numeroContrato}</span>
                  <input
                    type="text"
                    value={contractSuffix}
                    onChange={(e) => setContractSuffix(e.target.value)}
                    placeholder="-B"
                    className="w-20 px-2 py-1 border-2 border-zinc-900 font-mono text-xs font-bold text-center focus:bg-amber-50 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 4: Valor da Comissão */}
          <div className="bg-zinc-100 p-3.5 border-2 border-zinc-900 space-y-2">
            <label className="font-black text-zinc-900 uppercase tracking-wider text-xs flex items-center space-x-1.5">
              <DollarSign className="w-4 h-4 text-emerald-700" />
              <span>Ajuste de Valor da Comissão</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setValueMode('same')}
                className={`p-2 border-2 border-zinc-900 text-left transition cursor-pointer ${
                  valueMode === 'same'
                    ? 'bg-emerald-300 font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-white hover:bg-zinc-200 font-bold'
                }`}
              >
                <div className="text-[11px] uppercase font-black">Manter Igual</div>
                <div className="text-xs font-mono font-bold text-emerald-950">
                  {formatCurrency(currentInstallmentValue)}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setValueMode('split50')}
                className={`p-2 border-2 border-zinc-900 text-left transition cursor-pointer ${
                  valueMode === 'split50'
                    ? 'bg-emerald-300 font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-white hover:bg-zinc-200 font-bold'
                }`}
              >
                <div className="text-[11px] uppercase font-black">Dividir por 2 (50%)</div>
                <div className="text-xs font-mono font-bold text-emerald-950">
                  {formatCurrency(currentInstallmentValue / 2)}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setValueMode('custom')}
                className={`p-2 border-2 border-zinc-900 text-left transition cursor-pointer ${
                  valueMode === 'custom'
                    ? 'bg-emerald-300 font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-white hover:bg-zinc-200 font-bold'
                }`}
              >
                <div className="text-[11px] uppercase font-black">Valor Personalizado</div>
                <div className="text-xs font-mono font-bold text-emerald-950">
                  Digitar abaixo
                </div>
              </button>
            </div>

            {valueMode === 'custom' && (
              <div className="pt-1">
                <label className="block text-[10px] font-bold text-zinc-700 uppercase mb-0.5">
                  Valor por Parcela (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={customValue}
                  onChange={(e) => setCustomValue(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="w-full px-2.5 py-1.5 bg-white border-2 border-zinc-900 font-mono text-xs font-black focus:bg-amber-50 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Duplication Summary Card */}
          <div className="bg-zinc-900 text-white p-3.5 border-2 border-zinc-900 space-y-1">
            <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-emerald-400">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Resumo do que será gerado:</span>
              </span>
              <span>
                {targetInstallmentCount} x {formatCurrency(estimatedNewValue)}
              </span>
            </div>
            <div className="text-[11px] font-medium text-zinc-300 space-y-0.5 pt-1 border-t border-zinc-800">
              <div>• <strong>Escopo:</strong> {duplicateAllInstallments ? `Todas as ${contractInstallments.length} parcelas do contrato` : `Apenas 1 parcela`}</div>
              <div>• <strong>Atleta / Contrato:</strong> {record.atleta || record.clienteNome} ({record.numeroContrato}{contractSuffix})</div>
              <div>• <strong>Tipo de Comissão:</strong> <span className="text-amber-300 font-bold">{customTipo || tipoContrato}</span></div>
              <div>• <strong>Agente(s):</strong> <span className="text-indigo-300 font-bold">{selectedAgentes.join(', ') || 'Sem agente selecionado'}</span></div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border-2 border-zinc-900 text-zinc-900 font-black uppercase text-xs tracking-wider hover:bg-zinc-200 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center space-x-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase text-xs tracking-wider border-2 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition cursor-pointer"
            >
              <Copy className="w-4 h-4 text-white" />
              <span>Confirmar Duplicação ({targetInstallmentCount})</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
