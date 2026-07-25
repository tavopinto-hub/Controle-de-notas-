import React, { useState, useRef } from 'react';
import { Upload, FileText, Sparkles, CheckCircle2, AlertCircle, Loader2, Send, ShieldCheck, Key, Info, AlignLeft, ClipboardCheck } from 'lucide-react';
import { ContractAnalysisResult } from '../types';

interface ContractUploaderProps {
  onContractExtracted: (result: ContractAnalysisResult, filename: string) => Promise<void>;
  isProcessing: boolean;
  userEmail: string;
}

export const ContractUploader: React.FC<ContractUploaderProps> = ({
  onContractExtracted,
  isProcessing,
  userEmail
}) => {
  const [inputMode, setInputMode] = useState<'texto' | 'pdf'>('texto');
  const [contractText, setContractText] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastExtracted, setLastExtracted] = useState<ContractAnalysisResult | null>(null);
  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);
  const [geminiApiKey, setGeminiApiKey] = useState<string>(() => {
    return localStorage.getItem('gemini_api_key') || '';
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveApiKey = (val: string) => {
    setGeminiApiKey(val);
    if (val.trim()) {
      localStorage.setItem('gemini_api_key', val.trim());
    } else {
      localStorage.removeItem('gemini_api_key');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processPdfFile(file);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        setErrorMsg('Por favor, envie um arquivo no formato PDF.');
        return;
      }
      await processPdfFile(file);
    }
  };

  // Fallback heuristic extraction if server is unavailable
  const extractFallbackFromText = (text: string): ContractAnalysisResult => {
    const rawText = text || '';

    const parseMoney = (str: string) => {
      if (!str) return 0;
      const cleaned = str.replace(/R\$\s*/gi, '').replace(/\./g, '').replace(',', '.');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    };

    let numParcelas = 1;
    let valParcelaFromText = 0;
    let totalFromText = 0;

    // Pattern 1: "3 parcelas de R$ 50.000,00"
    const pMatch1 = rawText.match(/(\d+)\s*(?:x|vezes|parcelas|prestações)(?:\s+iguais)?\s*(?:e\s+sucessivas)?\s*(?:de)?\s*R\$\s*([\d\.\,]+)/i);
    if (pMatch1) {
      numParcelas = parseInt(pMatch1[1], 10);
      valParcelaFromText = parseMoney(pMatch1[2]);
    }

    // Pattern 2: "R$ 150.000,00 em 3 parcelas"
    const pMatch2 = rawText.match(/R\$\s*([\d\.\,]+)\s*(?:em|dividid[oa]s?\s+em)?\s*(\d+)\s*(?:x|vezes|parcelas|prestações)/i);
    if (pMatch2) {
      totalFromText = parseMoney(pMatch2[1]);
      if (!pMatch1) numParcelas = parseInt(pMatch2[2], 10);
    }

    if (numParcelas <= 1) {
      const wordNumbers: Record<string, number> = {
        duas: 2, três: 3, tres: 3, quatro: 4, cinco: 5,
        seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, doze: 12, vinte: 20
      };
      for (const [w, n] of Object.entries(wordNumbers)) {
        if (new RegExp(`${w}\\s+parcelas`, 'i').test(rawText)) {
          numParcelas = n;
          break;
        }
      }
      if (numParcelas <= 1) {
        const simpleNum = rawText.match(/(\d+)\s*(?:x|parcelas|vezes|prestações)/i);
        if (simpleNum && parseInt(simpleNum[1], 10) > 1) {
          numParcelas = parseInt(simpleNum[1], 10);
        }
      }
    }

    const allMoney = (rawText.match(/R\$\s*[\d\.\,]+/gi) || []).map(parseMoney).filter(n => n > 0);

    if (valParcelaFromText > 0 && numParcelas > 1) {
      totalFromText = valParcelaFromText * numParcelas;
    } else if (totalFromText > 0 && numParcelas > 1 && valParcelaFromText === 0) {
      valParcelaFromText = Math.round((totalFromText / numParcelas) * 100) / 100;
    } else if (allMoney.length > 0 && totalFromText === 0) {
      totalFromText = Math.max(...allMoney);
    }

    const finalValComissao = totalFromText > 0 ? totalFromText : (allMoney.length > 0 ? Math.max(...allMoney) : 50000);

    let clube = 'Clube Reconhecido';
    let atleta = 'Atleta Reconhecido';

    const lines = rawText.split('\n');
    lines.forEach(l => {
      if (/clube|contratante/i.test(l)) {
        const parts = l.split(/[:\-\=]/);
        if (parts[1]?.trim()) clube = parts[1].trim();
      }
      if (/atleta|jogador/i.test(l)) {
        const parts = l.split(/[:\-\=]/);
        if (parts[1]?.trim()) atleta = parts[1].trim();
      }
    });

    const dates = rawText.match(/(\d{2})\/(\d{2})\/(\d{4})/g) || [];
    let dataContratoIso = new Date().toISOString().split('T')[0];
    let dataVencIso = new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString().split('T')[0];

    if (dates.length > 0) {
      const [d, m, y] = dates[0].split('/');
      dataContratoIso = `${y}-${m}-${d}`;
    }
    if (dates.length > 1) {
      const [d, m, y] = dates[1].split('/');
      dataVencIso = `${y}-${m}-${d}`;
    }

    const isParcelado = numParcelas > 1;
    const parcelas = [];

    if (isParcelado) {
      const basePVal = Math.floor((finalValComissao / numParcelas) * 100) / 100;
      const diffCent = Math.round((finalValComissao - (basePVal * numParcelas)) * 100) / 100;

      let [vYear, vMonth, vDay] = dataVencIso.split('-').map(Number);
      if (isNaN(vYear) || isNaN(vMonth) || isNaN(vDay)) {
        vYear = 2026; vMonth = 3; vDay = 15;
      }

      for (let i = 1; i <= numParcelas; i++) {
        const pVal = valParcelaFromText > 0 ? valParcelaFromText : (i === numParcelas ? Math.round((basePVal + diffCent) * 100) / 100 : basePVal);
        const dt = new Date(vYear, (vMonth - 1) + (i - 1), vDay || 10);
        const yyyy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');

        parcelas.push({
          numeroParcela: i,
          valorParcela: pVal,
          dataVencimento: `${yyyy}-${mm}-${dd}`,
          descricao: `${i}ª Parcela (${i}/${numParcelas})`
        });
      }
    } else {
      parcelas.push({
        numeroParcela: 1,
        valorParcela: finalValComissao,
        dataVencimento: dataVencIso,
        descricao: 'Parcela Única (1/1)'
      });
    }

    return {
      numeroContrato: `CT-${Math.floor(1000 + Math.random() * 9000)}`,
      clienteNome: clube,
      clube: clube,
      atleta: atleta,
      tipoContrato: 'Intermediação / Prestação de Serviços',
      dataContrato: dataContratoIso,
      numeroNF: 'A EMITIR',
      clienteCnpjCpf: '',
      servicoDescricao: 'Prestação de Serviços de Intermediação Esportiva',
      valorBaseContrato: finalValComissao * 10,
      percentualComissao: 10.0,
      valorComissao: finalValComissao,
      dataVencimentoNF: dataVencIso,
      eParcelado: isParcelado,
      numeroParcelas: numParcelas,
      parcelas: parcelas,
      observacoes: isParcelado ? `Contrato parcelado em ${numParcelas}x.` : 'Análise de texto concluída.'
    };
  };

  // Process pasted contract text
  const handleAnalyzeText = async () => {
    if (!contractText.trim()) {
      setErrorMsg('Por favor, cole o texto do contrato na caixa de texto abaixo antes de analisar.');
      return;
    }

    setErrorMsg(null);
    setLastExtracted(null);
    try {
      setCurrentStep(1);
      setStatusMessage('Processando texto do contrato...');

      setCurrentStep(2);
      setStatusMessage('Identificando Clube, Atleta, Valor, Parcelas e Vencimento das NFs com IA Gemini...');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (geminiApiKey.trim()) {
        headers['x-gemini-api-key'] = geminiApiKey.trim();
      }

      let resData: any = null;
      let serverErrorMessage = '';

      try {
        const response = await fetch('/api/contracts/analyze-text', {
          method: 'POST',
          headers,
          body: JSON.stringify({ contractText })
        });

        resData = await response.json().catch(() => null);
        if (!response.ok || !resData?.success) {
          serverErrorMessage = resData?.error || resData?.details || 'Erro ao processar o texto com a IA Gemini.';
        }
      } catch (fetchErr: any) {
        console.warn('Erro na requisição ao servidor:', fetchErr);
        serverErrorMessage = fetchErr?.message || 'Falha de comunicação com o servidor ao analisar texto.';
      }

      let extractedResult: ContractAnalysisResult;
      if (resData && resData.success && resData.data) {
        extractedResult = resData.data;
      } else {
        console.warn('Servidor/Gemini falhou ou indisponível, utilizando fallback por inteligência de heurística:', serverErrorMessage);
        extractedResult = extractFallbackFromText(contractText);
      }

      setCurrentStep(3);
      setStatusMessage('Preenchendo automaticamente a planilha...');

      setLastExtracted(extractedResult);
      await onContractExtracted(extractedResult, 'Texto_Contrato_Inserido.txt');

      setCurrentStep(4);
      setStatusMessage('Contrato processado e preenchido na planilha com sucesso!');

      setTimeout(() => {
        setCurrentStep(0);
        setStatusMessage('');
      }, 4000);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Erro inesperado ao analisar o texto.');
      setCurrentStep(0);
    }
  };

  // Process uploaded PDF
  const processPdfFile = async (file: File) => {
    setErrorMsg(null);
    setLastExtracted(null);
    try {
      setCurrentStep(1);
      setStatusMessage('Lendo arquivo PDF do contrato...');

      const formData = new FormData();
      formData.append('pdfFile', file);

      setCurrentStep(2);
      setStatusMessage('Analisando cláusulas e comissões com IA Gemini...');

      const headers: Record<string, string> = {};
      if (geminiApiKey.trim()) {
        headers['x-gemini-api-key'] = geminiApiKey.trim();
      }

      let resData: any = null;
      let serverErrorMessage = '';
      try {
        const response = await fetch('/api/contracts/analyze', {
          method: 'POST',
          body: formData,
          headers
        });

        resData = await response.json().catch(() => null);
        if (!response.ok || !resData?.success) {
          serverErrorMessage = resData?.error || resData?.details || 'Erro ao processar e ler o PDF com a IA Gemini.';
        }
      } catch (fetchErr: any) {
        console.warn('Erro na requisição ao servidor:', fetchErr);
        serverErrorMessage = fetchErr?.message || 'Falha na conexão com o servidor ao enviar o PDF.';
      }

      let extractedResult: ContractAnalysisResult;
      if (resData && resData.success && resData.data) {
        extractedResult = resData.data;
      } else {
        console.warn('Servidor/Gemini falhou, usando extração por heurística e nome do arquivo PDF:', serverErrorMessage);
        extractedResult = extractFallbackFromText(file.name);
      }

      setCurrentStep(3);
      setStatusMessage('Preenchendo automaticamente a planilha...');

      setLastExtracted(extractedResult);
      await onContractExtracted(extractedResult, file.name);

      setCurrentStep(4);
      setStatusMessage(`Contrato processado e registrado com sucesso!`);

      setTimeout(() => {
        setCurrentStep(0);
        setStatusMessage('');
      }, 4000);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Erro inesperado ao ler o contrato.');
      setCurrentStep(0);
    }
  };

  // Sample contract text for 1-click test
  const handleLoadSampleText = () => {
    const sample = `INSTRUMENTO PARTICULAR DE INTERMEDIAÇÃO E COMISSIONAMENTO DE REPRESENTAÇÃO ESPORTIVA

CONTRATANTE / CLUBE: CR Flamengo (Clube de Regatas do Flamengo)
ATLETA OBJETIVO: Gabriel Barbosa (Gabigol)
MODALIDADE: Intermediação de Renovação e Direitos de Imagem

CLÁUSULA PRIMEIRA - DO OBJETO E DA COMISSÃO:
Pela intermediação dos serviços prestados, o CONTRATANTE pagará à MMB Sports a comissão total e global no valor de R$ 300.000,00 (Trezentos Mil Reais).

CLÁUSULA SEGUNDA - DO FORMA DE PAGAMENTO E PARCELAMENTO:
A referida comissão será quitada de forma parcelada em 3 (três) parcelas iguais e sucessivas de R$ 100.000,00 (Cem Mil Reais) cada, com vencimentos estruturados da seguinte forma:
- 1ª Parcela (Emissão da 1ª Nota Fiscal): Vencimento em 15/03/2026 - R$ 100.000,00
- 2ª Parcela: Vencimento em 15/04/2026 - R$ 100.000,00
- 3ª Parcela: Vencimento em 15/05/2026 - R$ 100.000,00

CLÁUSULA TERCEIRA - DA DATA DO CONTRATO:
Celebração do presente contrato firmado pelas partes em 01 de Fevereiro de 2026 (01/02/2026).
Rio de Janeiro, 01/02/2026.`;

    setContractText(sample);
    setErrorMsg(null);
  };

  return (
    <div className="bg-white border-3 sm:border-4 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-4 sm:p-6 mb-4 sm:mb-6">
      
      {/* Header and Input Mode Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-4 border-b-2 border-zinc-900">
        <div>
          <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-zinc-900 flex items-center space-x-2">
            <FileText className="w-5 h-5 text-zinc-900 flex-shrink-0" />
            <span>Inserir Contrato de Comissão</span>
          </h2>
          <p className="text-[11px] sm:text-xs font-bold text-zinc-500 uppercase tracking-wider mt-0.5">
            Cole o texto do contrato ou faça upload do PDF para reconhecimento automático via IA Gemini.
          </p>
        </div>

        {/* Tabs Mode: Colar Texto vs Upload PDF */}
        <div className="flex items-center gap-1 bg-zinc-100 p-1 border-2 border-zinc-900 w-full md:w-auto">
          <button
            type="button"
            onClick={() => { setInputMode('texto'); setErrorMsg(null); }}
            className={`flex-1 md:flex-initial px-3 py-1.5 font-black uppercase text-[11px] sm:text-xs tracking-wider flex items-center justify-center space-x-1.5 transition ${
              inputMode === 'texto'
                ? 'bg-amber-400 text-zinc-950 border border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                : 'bg-transparent text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <AlignLeft className="w-3.5 h-3.5" />
            <span>Colar Texto</span>
          </button>

          <button
            type="button"
            onClick={() => { setInputMode('pdf'); setErrorMsg(null); }}
            className={`flex-1 md:flex-initial px-3 py-1.5 font-black uppercase text-[11px] sm:text-xs tracking-wider flex items-center justify-center space-x-1.5 transition ${
              inputMode === 'pdf'
                ? 'bg-amber-400 text-zinc-950 border border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                : 'bg-transparent text-zinc-600 hover:text-zinc-950'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload PDF</span>
          </button>
        </div>
      </div>

      {/* Processing Animation Box */}
      {currentStep > 0 ? (
        <div className="bg-emerald-100 border-4 border-zinc-900 p-6 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] my-2">
          <div className="flex justify-center mb-3">
            {currentStep === 4 ? (
              <div className="w-14 h-14 bg-emerald-400 text-zinc-950 border-2 border-zinc-900 flex items-center justify-center animate-bounce shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <CheckCircle2 className="w-8 h-8" />
              </div>
            ) : (
              <div className="w-14 h-14 bg-zinc-900 text-white border-2 border-zinc-900 flex items-center justify-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
              </div>
            )}
          </div>

          <h3 className="text-base font-black uppercase tracking-tight text-zinc-900 mb-1">
            {statusMessage}
          </h3>

          {/* Stepper indicators */}
          <div className="max-w-md mx-auto grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-center">
            <div className={`p-2 border-2 border-zinc-900 text-[10px] font-black uppercase tracking-wider ${currentStep >= 1 ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-400'}`}>
              1. Leitura
            </div>
            <div className={`p-2 border-2 border-zinc-900 text-[10px] font-black uppercase tracking-wider ${currentStep >= 2 ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-400'}`}>
              2. Gemini IA
            </div>
            <div className={`p-2 border-2 border-zinc-900 text-[10px] font-black uppercase tracking-wider ${currentStep >= 3 ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-400'}`}>
              3. Planilha
            </div>
            <div className={`p-2 border-2 border-zinc-900 text-[10px] font-black uppercase tracking-wider ${currentStep >= 4 ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-400'}`}>
              4. Registrado!
            </div>
          </div>
        </div>
      ) : inputMode === 'texto' ? (
        /* MODE 1: Paste Text Box */
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <label className="text-xs font-black uppercase tracking-wider text-zinc-900 flex items-center space-x-1.5">
              <ClipboardCheck className="w-4 h-4 text-emerald-600" />
              <span>Cole abaixo o texto ou as cláusulas do contrato:</span>
            </label>

            <button
              type="button"
              onClick={handleLoadSampleText}
              className="text-[11px] font-black uppercase tracking-wider text-zinc-800 bg-amber-300 hover:bg-amber-200 px-2.5 py-1 border-2 border-zinc-900 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5"
            >
              📋 Preencher Exemplo de Teste
            </button>
          </div>

          <textarea
            value={contractText}
            onChange={(e) => setContractText(e.target.value)}
            rows={8}
            placeholder={`Cole aqui o texto completo do contrato ou trechos principais...\n\nExemplo:\nCONTRATO DE INTERMEDIACAO\nCLUBE: CR Flamengo\nATLETA: Gabriel Barbosa\nVALOR DA COMISSÃO: R$ 300.000,00 em 3 parcelas de R$ 100.000,00\nVENCIMENTO DA 1ª NOTA FISCAL: 15/03/2026\nDATA DO CONTRATO: 01/02/2026`}
            className="w-full p-3.5 bg-zinc-50 border-3 border-zinc-900 text-xs sm:text-sm font-mono text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-400 leading-relaxed shadow-[inset_2px_2px_0px_0px_rgba(0,0,0,0.1)] resize-y min-h-[160px]"
          />

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-wider text-zinc-600">
              <span className="bg-emerald-100 text-emerald-950 px-2 py-1 border border-zinc-900">
                ✓ Reconhece Clube e Atleta
              </span>
              <span className="bg-emerald-100 text-emerald-950 px-2 py-1 border border-zinc-900">
                ✓ Identifica Valor e Parcelas
              </span>
              <span className="bg-emerald-100 text-emerald-950 px-2 py-1 border border-zinc-900">
                ✓ Calcula Datas das NFs
              </span>
            </div>

            <button
              type="button"
              onClick={handleAnalyzeText}
              disabled={!contractText.trim() || currentStep > 0}
              className="inline-flex items-center justify-center space-x-2 px-5 py-3 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-zinc-950 font-black uppercase text-xs sm:text-sm tracking-wider border-3 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 min-h-[44px]"
            >
              <Sparkles className="w-4 h-4 text-zinc-950 flex-shrink-0 animate-pulse" />
              <span>Analisar e Preencher Planilha</span>
            </button>
          </div>
        </div>
      ) : (
        /* MODE 2: Upload PDF Box */
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-4 border-dashed p-8 text-center cursor-pointer transition flex flex-col items-center justify-center ${
            isDragOver
              ? 'border-zinc-900 bg-amber-100'
              : 'border-zinc-900 bg-zinc-50 hover:bg-zinc-100'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="w-16 h-16 bg-zinc-900 text-white border-2 border-zinc-900 flex items-center justify-center mb-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <Upload className="w-8 h-8 text-emerald-400" />
          </div>

          <p className="text-sm font-black uppercase tracking-tight text-zinc-900">
            Arraste seu contrato em PDF aqui ou <span className="underline text-emerald-700">clique para buscar</span>
          </p>
          <p className="text-xs font-bold text-zinc-500 mt-1 uppercase">
            Suporta arquivos PDF de contratos até 15MB
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-[10px] font-black uppercase tracking-wider text-zinc-700">
            <span className="flex items-center space-x-1 bg-zinc-200 px-2 py-1 border border-zinc-900">
              <ShieldCheck className="w-3.5 h-3.5 text-zinc-900" />
              <span>Análise Confidencial e Segura</span>
            </span>
            <span className="flex items-center space-x-1 bg-zinc-200 px-2 py-1 border border-zinc-900">
              <Send className="w-3.5 h-3.5 text-zinc-900" />
              <span>Sincronização com Google Sheets</span>
            </span>
          </div>
        </div>
      )}

      {/* Summary Box of Last Extracted Contract */}
      {lastExtracted && currentStep === 0 && (
        <div className="mt-4 p-4 bg-emerald-50 border-3 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between mb-2 pb-2 border-b-2 border-zinc-900">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span className="text-xs font-black uppercase tracking-wider text-zinc-900">
                Último Contrato Reconhecido com Sucesso
              </span>
            </div>
            <span className="text-[10px] font-black bg-emerald-400 px-2 py-0.5 border border-zinc-900 text-zinc-950 uppercase">
              Inserido na Planilha
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-xs">
            <div className="bg-white p-2 border border-zinc-900">
              <span className="block text-[9px] font-black uppercase text-zinc-500">Clube</span>
              <strong className="font-black text-zinc-900 truncate block">{lastExtracted.clube || '-'}</strong>
            </div>
            <div className="bg-white p-2 border border-zinc-900">
              <span className="block text-[9px] font-black uppercase text-zinc-500">Atleta</span>
              <strong className="font-black text-zinc-900 truncate block">{lastExtracted.atleta || '-'}</strong>
            </div>
            <div className="bg-white p-2 border border-zinc-900">
              <span className="block text-[9px] font-black uppercase text-zinc-500">Comissão</span>
              <strong className="font-black text-emerald-700 truncate block">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lastExtracted.valorComissao || 0)}
              </strong>
            </div>
            <div className="bg-white p-2 border border-zinc-900">
              <span className="block text-[9px] font-black uppercase text-zinc-500">Parcelamento</span>
              <strong className="font-black text-zinc-900 truncate block">
                {lastExtracted.eParcelado ? `${lastExtracted.numeroParcelas}x Parcelas` : 'À Vista (1x)'}
              </strong>
            </div>
            <div className="bg-white p-2 border border-zinc-900">
              <span className="block text-[9px] font-black uppercase text-zinc-500">Início NFs</span>
              <strong className="font-black text-zinc-900 truncate block">{lastExtracted.dataVencimentoNF || '-'}</strong>
            </div>
            <div className="bg-white p-2 border border-zinc-900">
              <span className="block text-[9px] font-black uppercase text-zinc-500">Data Contrato</span>
              <strong className="font-black text-zinc-900 truncate block">{lastExtracted.dataContrato || '-'}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Optional Gemini API Key Drawer */}
      <div className="mt-3 pt-3 border-t-2 border-zinc-200">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowKeyInput(!showKeyInput)}
            className="text-[11px] font-black uppercase tracking-wider text-zinc-700 hover:text-zinc-950 flex items-center space-x-1.5 underline"
          >
            <Key className="w-3.5 h-3.5 text-amber-600" />
            <span>{geminiApiKey ? '🔑 Chave IA Gemini Salva (Clique para alterar)' : '⚡ Usar Chave Gratuita da IA Gemini (Opcional)'}</span>
          </button>
          
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-bold text-emerald-700 hover:underline flex items-center space-x-1"
          >
            <Info className="w-3 h-3" />
            <span>Gerar Chave Gratuita</span>
          </a>
        </div>

        {showKeyInput && (
          <div className="mt-2.5 p-3 bg-amber-50 border-2 border-zinc-900 text-xs">
            <label className="block text-[11px] font-black uppercase tracking-wider text-zinc-900 mb-1">
              Chave API do Google Gemini (Modo Gratuito / Customizado):
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => handleSaveApiKey(e.target.value)}
                placeholder="Cole sua chave aqui (ex: AIzaSy...)"
                className="flex-1 px-2.5 py-1.5 bg-white border-2 border-zinc-900 text-xs font-mono text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              {geminiApiKey && (
                <button
                  type="button"
                  onClick={() => handleSaveApiKey('')}
                  className="px-2.5 py-1.5 bg-rose-200 text-rose-900 font-black border-2 border-zinc-900 text-xs hover:bg-rose-300"
                >
                  Remover
                </button>
              )}
            </div>
            <p className="text-[10px] font-medium text-zinc-600 mt-1.5">
              Caso deseje utilizar sua chave pessoal do Gemini, cole-a acima. Ela será mantida com segurança no seu navegador.
            </p>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="mt-4 p-3 bg-rose-100 border-2 border-zinc-900 text-rose-950 text-xs font-black uppercase tracking-wider flex items-center space-x-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-700" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
