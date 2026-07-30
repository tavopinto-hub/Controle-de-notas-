import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, Sparkles, CheckCircle2, AlertCircle, Loader2, Send, 
  ShieldCheck, Key, Info, AlignLeft, Calculator, Calendar, DollarSign,
  Building2, User, RefreshCw, Plus, Trash2, ArrowRight, Upload, ClipboardCheck
} from 'lucide-react';
import { ContractAnalysisResult, InstallmentInfo } from '../types';

interface ContractUploaderProps {
  onContractExtracted: (result: ContractAnalysisResult, filename: string) => Promise<void>;
  isProcessing: boolean;
  userEmail: string;
}

function addMonthsToDateIso(startDateIso: string, monthsToAdd: number): string {
  if (!startDateIso || !/^\d{4}-\d{2}-\d{2}$/.test(startDateIso)) {
    startDateIso = new Date().toISOString().split('T')[0];
  }
  const [y, m, d] = startDateIso.split('-').map(Number);
  const dt = new Date(y, (m - 1) + monthsToAdd, d || 10);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseMoney(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const cleaned = String(val).replace(/R\$\s*/gi, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export const ContractUploader: React.FC<ContractUploaderProps> = ({
  onContractExtracted,
  isProcessing,
  userEmail
}) => {
  const [inputMode, setInputMode] = useState<'texto' | 'pdf'>('texto');
  const [contractText, setContractText] = useState<string>('');
  
  // Extracted or Calculated Fields
  const [clube, setClube] = useState<string>('CR Flamengo');
  const [atleta, setAtleta] = useState<string>('Gabriel Barbosa');
  const [valorTotal, setValorTotal] = useState<number>(300000);
  const [numParcelas, setNumParcelas] = useState<number>(3);
  const [dataContrato, setDataContrato] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [dataPrimeiraParcela, setDataPrimeiraParcela] = useState<string>('2026-03-15');
  const [tipoContrato, setTipoContrato] = useState<string>('Intermediação / Renovação');
  
  // Custom list of installments
  const [parcelas, setParcelas] = useState<InstallmentInfo[]>([
    { numeroParcela: 1, valorParcela: 100000, dataVencimento: '2026-03-15', descricao: '1ª Parcela (1/3)' },
    { numeroParcela: 2, valorParcela: 100000, dataVencimento: '2026-04-15', descricao: '2ª Parcela (2/3)' },
    { numeroParcela: 3, valorParcela: 100000, dataVencimento: '2026-05-15', descricao: '3ª Parcela (3/3)' }
  ]);

  const [currentStep, setCurrentStep] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => localStorage.getItem('gemini_api_key') || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveApiKey = (val: string) => {
    setGeminiApiKey(val);
    if (val.trim()) {
      localStorage.setItem('gemini_api_key', val.trim());
    } else {
      localStorage.removeItem('gemini_api_key');
    }
  };

  // Recalculate installments whenever total value, number of installments, or first due date changes
  const handleRecalculateInstallments = (tot: number, numP: number, startDate: string) => {
    const validTot = Math.max(0, tot);
    const validNumP = Math.min(50, Math.max(1, Math.round(numP)));
    
    const baseVal = Math.floor((validTot / validNumP) * 100) / 100;
    const diffCents = Math.round((validTot - (baseVal * validNumP)) * 100) / 100;

    const list: InstallmentInfo[] = [];
    for (let i = 1; i <= validNumP; i++) {
      const val = (i === validNumP) ? Math.round((baseVal + diffCents) * 100) / 100 : baseVal;
      const dueDate = addMonthsToDateIso(startDate, i - 1);
      list.push({
        numeroParcela: i,
        valorParcela: val,
        dataVencimento: dueDate,
        descricao: validNumP > 1 ? `${i}ª Parcela (${i}/${validNumP})` : 'Parcela Única (1/1)'
      });
    }
    setParcelas(list);
  };

  // Handle manual change of total value
  const handleValorTotalChange = (newVal: number) => {
    setValorTotal(newVal);
    handleRecalculateInstallments(newVal, numParcelas, dataPrimeiraParcela);
  };

  // Handle manual change of number of installments (allows up to 50)
  const handleNumParcelasChange = (newNum: number) => {
    const valid = Math.min(50, Math.max(1, newNum));
    setNumParcelas(valid);
    handleRecalculateInstallments(valorTotal, valid, dataPrimeiraParcela);
  };

  // Handle manual change of first due date
  const handleDataPrimeiraParcelaChange = (newDate: string) => {
    setDataPrimeiraParcela(newDate);
    handleRecalculateInstallments(valorTotal, numParcelas, newDate);
  };

  // Edit individual installment
  const handleUpdateInstallment = (index: number, field: keyof InstallmentInfo, val: any) => {
    setParcelas(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  // Extract from text via AI or fallback
  const handleAnalyzeText = async (textToProcess: string = contractText) => {
    if (!textToProcess.trim()) {
      setErrorMsg('Por favor, cole o texto do contrato na caixa de texto antes de analisar.');
      return;
    }

    setErrorMsg(null);
    setSuccessMsg(null);
    setIsAiLoading(true);
    setCurrentStep(1);
    setStatusMessage('Lendo texto e identificando cláusulas de comissão...');

    try {
      setCurrentStep(2);
      setStatusMessage('Analisando com IA Gemini: Clube, Atleta, Valor e Parcelas...');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (geminiApiKey.trim()) headers['x-gemini-api-key'] = geminiApiKey.trim();

      let resData: any = null;
      try {
        const response = await fetch('/api/contracts/analyze-text', {
          method: 'POST',
          headers,
          body: JSON.stringify({ contractText: textToProcess })
        });
        resData = await response.json().catch(() => null);
      } catch (e) {
        console.warn('Erro ao chamar backend, usando extração heurística:', e);
      }

      if (resData && resData.success && resData.data) {
        const data = resData.data;
        if (data.clube) setClube(data.clube);
        if (data.atleta) setAtleta(data.atleta);
        if (data.tipoContrato) setTipoContrato(data.tipoContrato);
        if (data.dataContrato) setDataContrato(data.dataContrato);

        const extractedTotal = data.valorComissao || 300000;
        const extractedNumP = data.numeroParcelas || (data.parcelas?.length) || 1;
        const extractedFirstDate = data.dataVencimentoNF || new Date().toISOString().split('T')[0];

        setValorTotal(extractedTotal);
        setNumParcelas(extractedNumP);
        setDataPrimeiraParcela(extractedFirstDate);

        if (Array.isArray(data.parcelas) && data.parcelas.length > 0) {
          setParcelas(data.parcelas);
        } else {
          handleRecalculateInstallments(extractedTotal, extractedNumP, extractedFirstDate);
        }
      } else {
        // Fallback heuristic extraction
        const raw = textToProcess;
        let pNum = 1;
        let vTotal = 0;
        let vParcela = 0;

        const m1 = raw.match(/(\d+)\s*(?:x|vezes|parcelas|prestações)(?:\s+iguais)?\s*(?:de)?\s*R\$\s*([\d\.\,]+)/i);
        if (m1) {
          pNum = parseInt(m1[1], 10);
          vParcela = parseMoney(m1[2]);
          vTotal = vParcela * pNum;
        }

        const m2 = raw.match(/R\$\s*([\d\.\,]+)\s*(?:em|dividid[oa]s?\s+em)?\s*(\d+)\s*(?:x|vezes|parcelas)/i);
        if (m2 && vTotal === 0) {
          vTotal = parseMoney(m2[1]);
          pNum = parseInt(m2[2], 10);
        }

        if (vTotal === 0) {
          const moneyAll = (raw.match(/R\$\s*[\d\.\,]+/gi) || []).map(parseMoney).filter(n => n > 0);
          if (moneyAll.length > 0) vTotal = Math.max(...moneyAll);
          else vTotal = 150000;
        }

        let extractedClube = 'CR Flamengo';
        let extractedAtleta = 'Gabriel Barbosa';

        raw.split('\n').forEach(line => {
          if (/clube|contratante/i.test(line)) {
            const parts = line.split(/[:\-\=]/);
            if (parts[1]?.trim()) extractedClube = parts[1].trim();
          }
          if (/atleta|jogador/i.test(line)) {
            const parts = line.split(/[:\-\=]/);
            if (parts[1]?.trim()) extractedAtleta = parts[1].trim();
          }
        });

        const dates = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/g) || [];
        let dFirst = '2026-03-15';
        if (dates.length > 0) {
          const [d, m, y] = dates[0].split('/');
          dFirst = `${y}-${m}-${d}`;
        }

        setClube(extractedClube);
        setAtleta(extractedAtleta);
        setValorTotal(vTotal);
        setNumParcelas(pNum);
        setDataPrimeiraParcela(dFirst);
        handleRecalculateInstallments(vTotal, pNum, dFirst);
      }

      setCurrentStep(0);
      setSuccessMsg('Texto lido com sucesso! Confira abaixo "O que cobrar" e "Quando cobrar" com a divisão das parcelas.');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Erro ao processar texto do contrato.');
      setCurrentStep(0);
    } finally {
      setIsAiLoading(false);
    }
  };

  // PDF Upload Processing
  const handlePdfUpload = async (file: File) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setIsAiLoading(true);
    setCurrentStep(1);
    setStatusMessage('Lendo arquivo PDF do contrato...');

    try {
      const formData = new FormData();
      formData.append('pdfFile', file);

      setCurrentStep(2);
      setStatusMessage('Analisando PDF com IA Gemini...');

      const headers: Record<string, string> = {};
      if (geminiApiKey.trim()) headers['x-gemini-api-key'] = geminiApiKey.trim();

      const res = await fetch('/api/contracts/analyze', { method: 'POST', body: formData, headers });
      const resData = await res.json().catch(() => null);

      if (res.ok && resData && resData.success && resData.data) {
        const data = resData.data;
        if (data.clube) setClube(data.clube);
        if (data.atleta) setAtleta(data.atleta);
        if (data.dataContrato) setDataContrato(data.dataContrato);

        const extractedTotal = data.valorComissao || 300000;
        const extractedNumP = data.numeroParcelas || (data.parcelas?.length) || 1;
        const extractedFirstDate = data.dataVencimentoNF || new Date().toISOString().split('T')[0];

        setValorTotal(extractedTotal);
        setNumParcelas(extractedNumP);
        setDataPrimeiraParcela(extractedFirstDate);

        if (Array.isArray(data.parcelas) && data.parcelas.length > 0) {
          setParcelas(data.parcelas);
        } else {
          handleRecalculateInstallments(extractedTotal, extractedNumP, extractedFirstDate);
        }
        setSuccessMsg(`PDF "${file.name}" lido com sucesso! Dados extraídos e prontos para confirmação.`);
      } else {
        throw new Error(resData?.error || 'Não foi possível extrair os dados do PDF.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Erro ao ler o arquivo PDF.');
    } finally {
      setIsAiLoading(false);
      setCurrentStep(0);
    }
  };

  // Submit and save to spreadsheet
  const handleConfirmAndSave = async () => {
    if (!clube.trim()) {
      setErrorMsg('Por favor, informe o nome do Clube / Cliente.');
      return;
    }
    if (valorTotal <= 0) {
      setErrorMsg('Por favor, informe um valor total de comissão válido.');
      return;
    }

    setErrorMsg(null);
    setCurrentStep(3);
    setStatusMessage('Registrando comissão e gerando parcelas na planilha...');

    try {
      const result: ContractAnalysisResult = {
        numeroContrato: `CT-2026/${Math.floor(100 + Math.random() * 900)}`,
        clienteNome: clube,
        clube: clube,
        atleta: atleta || '-',
        tipoContrato: tipoContrato || 'Intermediação Comercial',
        dataContrato: dataContrato || new Date().toISOString().split('T')[0],
        clienteCnpjCpf: '',
        servicoDescricao: `Comissão Esportiva - ${clube} / ${atleta}`,
        valorBaseContrato: valorTotal * 10,
        percentualComissao: 10,
        valorComissao: valorTotal,
        dataVencimentoNF: dataPrimeiraParcela,
        observacoes: numParcelas > 1 ? `Cobrança dividida em ${numParcelas}x parcelas.` : 'Pagamento único.',
        eParcelado: numParcelas > 1,
        numeroParcelas: numParcelas,
        parcelas: parcelas
      };

      await onContractExtracted(result, inputMode === 'pdf' ? 'Contrato.pdf' : 'Texto_Inserido.txt');

      setCurrentStep(4);
      setStatusMessage('Cobranças salvas e registradas na planilha com sucesso!');

      setTimeout(() => {
        setCurrentStep(0);
        setStatusMessage('');
      }, 3500);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Erro ao salvar os dados.');
      setCurrentStep(0);
    }
  };

  // Sample contract loader
  const handleLoadSample = () => {
    const sampleText = `INSTRUMENTO PARTICULAR DE INTERMEDIAÇÃO DE REPRESENTAÇÃO ESPORTIVA

CONTRATANTE / CLUBE: CR Flamengo (Clube de Regatas do Flamengo)
ATLETA OBJETIVO: Gabriel Barbosa (Gabigol)

CLÁUSULA DA COMISSÃO:
O CONTRATANTE pagará à MMB Sports a comissão total no valor de R$ 300.000,00 (Trezentos Mil Reais).

FORMA DE PAGAMENTO E VENCIMENTOS:
A comissão será paga em 3 (três) parcelas iguais e sucessivas de R$ 100.000,00 cada:
- 1ª Parcela: Vencimento em 15/03/2026 - R$ 100.000,00
- 2ª Parcela: Vencimento em 15/04/2026 - R$ 100.000,00
- 3ª Parcela: Vencimento em 15/05/2026 - R$ 100.000,00

Data do Contrato: 01/02/2026.`;

    setContractText(sampleText);
    handleAnalyzeText(sampleText);
  };

  return (
    <div className="bg-white border-3 sm:border-4 border-zinc-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-4 sm:p-6 mb-6">
      
      {/* Top Bar Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 mb-5 border-b-3 border-zinc-900">
        <div>
          <h2 className="text-lg sm:text-xl font-black uppercase tracking-tight text-zinc-950 flex items-center space-x-2">
            <Calculator className="w-6 h-6 text-amber-500 flex-shrink-0" />
            <span>Leitor e Calculadora de Cobrança</span>
          </h2>
          <p className="text-xs font-bold text-zinc-600 uppercase tracking-wider mt-0.5">
            Insira o texto ou valor do contrato. O app lê o que e quando cobrar e faz a divisão automática das parcelas.
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-1 bg-zinc-100 p-1 border-2 border-zinc-900">
          <button
            type="button"
            onClick={() => setInputMode('texto')}
            className={`px-3 py-1.5 font-black uppercase text-xs tracking-wider flex items-center space-x-1.5 transition ${
              inputMode === 'texto'
                ? 'bg-amber-400 text-zinc-950 border border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <AlignLeft className="w-3.5 h-3.5" />
            <span>Cole o Texto</span>
          </button>
          <button
            type="button"
            onClick={() => setInputMode('pdf')}
            className={`px-3 py-1.5 font-black uppercase text-xs tracking-wider flex items-center space-x-1.5 transition ${
              inputMode === 'pdf'
                ? 'bg-amber-400 text-zinc-950 border border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload PDF</span>
          </button>
        </div>
      </div>

      {/* Stepper Status Box */}
      {currentStep > 0 && (
        <div className="bg-emerald-100 border-3 border-zinc-900 p-5 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] mb-5">
          <div className="flex justify-center mb-2">
            {currentStep === 4 ? (
              <div className="w-12 h-12 bg-emerald-400 text-zinc-950 border-2 border-zinc-900 flex items-center justify-center animate-bounce shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <CheckCircle2 className="w-7 h-7" />
              </div>
            ) : (
              <div className="w-12 h-12 bg-zinc-900 text-white border-2 border-zinc-900 flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
              </div>
            )}
          </div>
          <p className="text-sm font-black uppercase tracking-tight text-zinc-950">{statusMessage}</p>
        </div>
      )}

      {/* SECTION 1: TEXT OR PDF INPUT */}
      {inputMode === 'texto' ? (
        <div className="space-y-3 mb-6 bg-amber-50/50 p-4 border-3 border-zinc-900">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-black uppercase tracking-wider text-zinc-900 flex items-center space-x-1.5">
              <ClipboardCheck className="w-4 h-4 text-amber-600" />
              <span>1. Cole o texto do contrato para leitura automática:</span>
            </label>
            <button
              type="button"
              onClick={handleLoadSample}
              className="text-[11px] font-black uppercase tracking-wider text-zinc-950 bg-amber-300 hover:bg-amber-200 px-2.5 py-1 border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5"
            >
              📋 Preencher Exemplo de Teste
            </button>
          </div>

          <textarea
            value={contractText}
            onChange={(e) => setContractText(e.target.value)}
            rows={5}
            placeholder={`Cole aqui as cláusulas ou o texto do contrato...\nExemplo: "Clube: Flamengo. Comissão: R$ 300.000 em 3 parcelas de R$ 100.000 com vencimentos em 15/03/2026, 15/04/2026 e 15/05/2026"`}
            className="w-full p-3 bg-white border-2 border-zinc-900 text-xs sm:text-sm font-mono text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-400 leading-relaxed resize-y"
          />

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => handleAnalyzeText(contractText)}
              disabled={!contractText.trim() || isAiLoading}
              className="inline-flex items-center space-x-2 px-5 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-zinc-950 font-black uppercase text-xs tracking-wider border-2 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5"
            >
              <Sparkles className="w-4 h-4 text-zinc-950 animate-pulse" />
              <span>Ler e Extrair do Texto</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) handlePdfUpload(file);
          }}
          onClick={() => fileInputRef.current?.click()}
          className="border-3 border-dashed border-zinc-900 p-6 text-center cursor-pointer bg-zinc-50 hover:bg-amber-50 transition mb-6"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePdfUpload(f);
            }}
            className="hidden"
          />
          <Upload className="w-8 h-8 text-amber-600 mx-auto mb-2" />
          <p className="text-xs sm:text-sm font-black uppercase tracking-tight text-zinc-950">
            Arraste seu PDF aqui ou clique para selecionar
          </p>
        </div>
      )}

      {/* SECTION 2: INTERACTIVE CALCULATOR & SUMMARY ("O QUE COBRAR" + "QUANDO COBRAR") */}
      <div className="border-3 border-zinc-900 bg-white p-4 sm:p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
        
        <div className="flex items-center justify-between pb-3 mb-4 border-b-2 border-zinc-900">
          <h3 className="text-sm font-black uppercase tracking-wider text-zinc-950 flex items-center space-x-2">
            <Calculator className="w-4 h-4 text-emerald-600" />
            <span>2. O que cobrar & Quando cobrar (Ajuste e Divisão)</span>
          </h3>
          <span className="text-[10px] font-black bg-emerald-100 text-emerald-950 px-2 py-0.5 border border-zinc-900 uppercase">
            Cálculo em Tempo Real
          </span>
        </div>

        {/* Inputs: O QUE COBRAR (Clube, Atleta, Valor Total) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-[11px] font-black uppercase text-zinc-800 mb-1 flex items-center space-x-1">
              <Building2 className="w-3.5 h-3.5 text-zinc-700" />
              <span>Clube / Devedor:</span>
            </label>
            <input
              type="text"
              value={clube}
              onChange={(e) => setClube(e.target.value)}
              placeholder="Ex: CR Flamengo"
              className="w-full px-3 py-2 bg-zinc-50 border-2 border-zinc-900 text-xs sm:text-sm font-bold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase text-zinc-800 mb-1 flex items-center space-x-1">
              <User className="w-3.5 h-3.5 text-zinc-700" />
              <span>Atleta / Jogador:</span>
            </label>
            <input
              type="text"
              value={atleta}
              onChange={(e) => setAtleta(e.target.value)}
              placeholder="Ex: Gabriel Barbosa"
              className="w-full px-3 py-2 bg-zinc-50 border-2 border-zinc-900 text-xs sm:text-sm font-bold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase text-zinc-800 mb-1 flex items-center space-x-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span>Valor Total da Comissão (R$):</span>
            </label>
            <input
              type="number"
              step="1000"
              value={valorTotal}
              onChange={(e) => handleValorTotalChange(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2 bg-emerald-50 border-2 border-zinc-900 text-xs sm:text-sm font-black text-emerald-950 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>

        {/* Inputs: QUANDO COBRAR & QUANTIDADE DE PARCELAS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5 p-3 bg-zinc-50 border-2 border-zinc-900">
          <div>
            <label className="block text-[11px] font-black uppercase text-zinc-800 mb-1 flex items-center space-x-1">
              <Calculator className="w-3.5 h-3.5 text-amber-600" />
              <span>Quantidade de Parcelas (até 50x):</span>
            </label>
            <div className="flex gap-2 items-center">
              <select
                value={numParcelas <= 50 ? numParcelas : 50}
                onChange={(e) => handleNumParcelasChange(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 bg-white border-2 border-zinc-900 text-xs sm:text-sm font-black text-zinc-950 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {Array.from({ length: 50 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? '1x (À vista)' : `${n}x Parcelas`}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={50}
                value={numParcelas}
                onChange={(e) => handleNumParcelasChange(parseInt(e.target.value, 10) || 1)}
                className="w-16 px-2 py-2 bg-white border-2 border-zinc-900 text-xs sm:text-sm font-black text-center text-zinc-950 focus:outline-none focus:ring-2 focus:ring-amber-400"
                title="Digite o número de parcelas (1 a 50)"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase text-zinc-800 mb-1 flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Vencimento da 1ª Parcela:</span>
            </label>
            <input
              type="date"
              value={dataPrimeiraParcela}
              onChange={(e) => handleDataPrimeiraParcelaChange(e.target.value)}
              className="w-full px-3 py-2 bg-white border-2 border-zinc-900 text-xs font-bold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-black uppercase text-zinc-800 mb-1">
              Valor por Parcela (Divisão Exata):
            </label>
            <div className="px-3 py-2 bg-amber-300 border-2 border-zinc-900 text-xs sm:text-sm font-black text-zinc-950 flex items-center justify-between">
              <span>{numParcelas}x de</span>
              <span>
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                  Math.round((valorTotal / Math.max(1, numParcelas)) * 100) / 100
                )}
              </span>
            </div>
          </div>
        </div>

        {/* SECTION 3: INSTALLMENT SCHEDULE TABLE */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-zinc-900 flex items-center space-x-1.5">
              <Calendar className="w-4 h-4 text-zinc-800" />
              <span>Cronograma de Cobrança Dividido ({parcelas.length} parcelas):</span>
            </h4>
            <span className="text-[10px] font-bold text-zinc-500 uppercase">
              Vencimentos Mensais Calculados
            </span>
          </div>

          <div className="overflow-x-auto border-2 border-zinc-900">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-zinc-900 text-white uppercase font-black text-[10px] tracking-wider">
                  <th className="p-2.5 border-r border-zinc-800">Parcela</th>
                  <th className="p-2.5 border-r border-zinc-800">O que cobrar (Valor)</th>
                  <th className="p-2.5 border-r border-zinc-800">Quando cobrar (Vencimento)</th>
                  <th className="p-2.5">Descrição</th>
                </tr>
              </thead>
              <tbody className="divide-y border-zinc-900">
                {parcelas.map((p, idx) => (
                  <tr key={idx} className="bg-white hover:bg-amber-50/60 transition">
                    <td className="p-2.5 font-black text-zinc-950 border-r border-zinc-200 w-24">
                      {p.numeroParcela}ª ({p.numeroParcela}/{parcelas.length})
                    </td>
                    <td className="p-2 border-r border-zinc-200">
                      <div className="flex items-center space-x-1">
                        <span className="text-[11px] font-bold text-zinc-500">R$</span>
                        <input
                          type="number"
                          value={p.valorParcela}
                          onChange={(e) => handleUpdateInstallment(idx, 'valorParcela', parseFloat(e.target.value) || 0)}
                          className="w-full px-2 py-1 bg-zinc-50 border border-zinc-900 text-xs font-black text-emerald-800 focus:bg-white"
                        />
                      </div>
                    </td>
                    <td className="p-2 border-r border-zinc-200">
                      <input
                        type="date"
                        value={p.dataVencimento}
                        onChange={(e) => handleUpdateInstallment(idx, 'dataVencimento', e.target.value)}
                        className="w-full px-2 py-1 bg-zinc-50 border border-zinc-900 text-xs font-bold text-zinc-950 focus:bg-white"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={p.descricao || ''}
                        onChange={(e) => handleUpdateInstallment(idx, 'descricao', e.target.value)}
                        className="w-full px-2 py-1 bg-zinc-50 border border-zinc-300 text-xs text-zinc-800 focus:bg-white"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FEEDBACK MESSAGES */}
        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-100 border-2 border-zinc-900 text-rose-950 text-xs font-black uppercase flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-700 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-emerald-100 border-2 border-zinc-900 text-emerald-950 text-xs font-black uppercase flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ACTION BUTTON */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <div className="text-[11px] font-bold text-zinc-600 uppercase">
            Total a Registrar: <strong className="text-zinc-950">{parcelas.length} parcelas</strong> somando{' '}
            <strong className="text-emerald-700">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                parcelas.reduce((acc, p) => acc + (p.valorParcela || 0), 0)
              )}
            </strong>
          </div>

          <button
            type="button"
            onClick={handleConfirmAndSave}
            disabled={isProcessing || currentStep > 0}
            className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3.5 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-zinc-950 font-black uppercase text-xs sm:text-sm tracking-wider border-3 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5"
          >
            <CheckCircle2 className="w-5 h-5 text-zinc-950 flex-shrink-0" />
            <span>Confirmar e Registrar Cobrança na Planilha</span>
          </button>
        </div>

      </div>

      {/* API Key Drawer */}
      <div className="mt-4 pt-3 border-t-2 border-zinc-200 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => setShowKeyInput(!showKeyInput)}
          className="text-[11px] font-black uppercase text-zinc-700 hover:text-zinc-950 flex items-center space-x-1 underline"
        >
          <Key className="w-3.5 h-3.5 text-amber-600" />
          <span>{geminiApiKey ? '🔑 Chave IA Salva' : '⚡ Chave Gemini IA (Opcional)'}</span>
        </button>

        {showKeyInput && (
          <div className="mt-2 p-2 bg-amber-50 border border-zinc-900 w-full max-w-sm">
            <input
              type="password"
              value={geminiApiKey}
              onChange={(e) => handleSaveApiKey(e.target.value)}
              placeholder="Cole sua chave aqui..."
              className="w-full px-2 py-1 bg-white border border-zinc-900 text-xs font-mono"
            />
          </div>
        )}
      </div>

    </div>
  );
};
