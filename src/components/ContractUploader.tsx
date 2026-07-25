import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Sparkles, CheckCircle2, AlertCircle, Loader2, Send, ShieldCheck, Key, Settings, Info } from 'lucide-react';
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
  const [isDragOver, setIsDragOver] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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

  // Extract baseline contract data from filename & heuristics as client fallback
  const extractFallbackFromFilename = (file: File): ContractAnalysisResult => {
    const cleanName = file.name.replace(/\.pdf$/i, '').replace(/_/g, ' ').replace(/-/g, ' ').trim();
    
    // Search numbers for commission / contract value
    const numbers = cleanName.match(/\d[\d\.\,]+/g) || [];
    let extractedValue = 10000;
    if (numbers.length > 0) {
      const numStr = numbers[0].replace(/\./g, '').replace(',', '.');
      const parsed = parseFloat(numStr);
      if (!isNaN(parsed) && parsed > 0) extractedValue = parsed;
    }

    // Try guess club or client name
    const words = cleanName.split(' ').filter(w => w.length > 2 && !/^\d+$/.test(w) && !/contrato|pdf|comissao|comissão|servico|serviço/i.test(w));
    const guessedClient = words.slice(0, 3).join(' ') || "Cliente / Contratante";

    const defaultDueDate = new Date();
    defaultDueDate.setDate(defaultDueDate.getDate() + 10);
    const dateFormatted = defaultDueDate.toISOString().split('T')[0];

    return {
      numeroContrato: `CT-${Math.floor(1000 + Math.random() * 9000)}`,
      clienteNome: guessedClient,
      clube: guessedClient,
      atleta: '-',
      tipoContrato: 'Intermediação / Prestação de Serviços',
      dataContrato: new Date().toISOString().split('T')[0],
      numeroNF: 'A EMITIR',
      clienteCnpjCpf: '',
      servicoDescricao: 'Prestação de Serviços de Intermediação Esportiva',
      valorBaseContrato: extractedValue * 10,
      percentualComissao: 10.0,
      valorComissao: extractedValue,
      dataVencimentoNF: dateFormatted,
      eParcelado: false,
      numeroParcelas: 1,
      observacoes: `Dados gerados a partir do arquivo PDF (${file.name}). Verifique os valores e ajuste conforme o contrato original.`
    };
  };

  const processPdfFile = async (file: File) => {
    setErrorMsg(null);
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

      if (serverErrorMessage || !resData || !resData.success || !resData.data) {
        throw new Error(serverErrorMessage || 'Não foi possível extrair os dados do PDF. Verifique se o arquivo está legível.');
      }

      const extractedResult: ContractAnalysisResult = resData.data;

      setCurrentStep(3);
      setStatusMessage('Preenchendo automaticamente a planilha...');

      // Trigger callback
      await onContractExtracted(extractedResult, file.name);

      setCurrentStep(4);
      setStatusMessage(`Contrato processado e registrado com sucesso!`);

      setTimeout(() => {
        setCurrentStep(0);
        setStatusMessage('');
      }, 3000);

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Erro inesperado ao ler o contrato.');
      setCurrentStep(0);
    }
  };

  // Demo contract simulation button for quick testing
  const handleSimulateDemoContract = async () => {
    setErrorMsg(null);
    setCurrentStep(1);
    setStatusMessage('Simulando upload de contrato em PDF...');

    setTimeout(async () => {
      setCurrentStep(2);
      setStatusMessage('Processando com IA Gemini 2.5 Flash...');

      setTimeout(async () => {
        const demoData: ContractAnalysisResult = {
          numeroContrato: `CT-2026/${Math.floor(100 + Math.random() * 900)}`,
          clienteNome: 'Sua EmpresaParceira S.A.',
          clienteCnpjCpf: '28.490.112/0001-88',
          servicoDescricao: 'Prestação de Serviços de Intermediação de Vendas e Fechamento de Contrato',
          valorBaseContrato: 95000.00,
          percentualComissao: 10.0,
          valorComissao: 9500.00,
          dataVencimentoNF: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          observacoes: 'Contrato gerado automaticamente para teste. Emissão de NF prevista para 7 dias.'
        };

        setCurrentStep(3);
        setStatusMessage('Preenchendo a planilha e enviando notificação...');

        await onContractExtracted(demoData, 'Contrato_Comissao_Exemplo.pdf');

        setCurrentStep(4);
        setStatusMessage(`Notificação disparada para ${userEmail}!`);

        setTimeout(() => {
          setCurrentStep(0);
          setStatusMessage('');
        }, 3000);
      }, 1200);
    }, 1000);
  };

  return (
    <div className="bg-white border-3 sm:border-4 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] sm:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-4 sm:p-6 mb-4 sm:mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-4 border-b-2 border-zinc-900">
        <div>
          <h2 className="text-base sm:text-lg font-black uppercase tracking-tight text-zinc-900 flex items-center space-x-2">
            <FileText className="w-5 h-5 text-zinc-900 flex-shrink-0" />
            <span>Inserir Contrato de Comissão (PDF)</span>
          </h2>
          <p className="text-[11px] sm:text-xs font-bold text-zinc-500 uppercase tracking-wider mt-0.5">
            O Gemini lerá o PDF, extrairá os dados e preencherá a planilha automaticamente.
          </p>
        </div>

        <button
          onClick={handleSimulateDemoContract}
          disabled={currentStep > 0}
          className="inline-flex items-center justify-center space-x-2 text-xs font-black uppercase tracking-wider px-3.5 py-2.5 bg-emerald-400 text-zinc-950 border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-emerald-300 transition active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 min-h-[40px] w-full md:w-auto"
        >
          <Sparkles className="w-4 h-4 text-zinc-950 flex-shrink-0" />
          <span>Testar Exemplo de Contrato</span>
        </button>
      </div>

      {/* Processing Animation Box */}
      {currentStep > 0 ? (
        <div className="bg-emerald-100 border-4 border-zinc-900 p-6 text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
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
              1. Leitura PDF
            </div>
            <div className={`p-2 border-2 border-zinc-900 text-[10px] font-black uppercase tracking-wider ${currentStep >= 2 ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-400'}`}>
              2. Gemini AI
            </div>
            <div className={`p-2 border-2 border-zinc-900 text-[10px] font-black uppercase tracking-wider ${currentStep >= 3 ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-400'}`}>
              3. Planilha
            </div>
            <div className={`p-2 border-2 border-zinc-900 text-[10px] font-black uppercase tracking-wider ${currentStep >= 4 ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-400'}`}>
              4. E-mail
            </div>
          </div>
        </div>
      ) : (
        /* Drag & Drop Box */
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
            Suporta arquivos PDF de contratos de comissão, prestação de serviço ou acordos comerciais até 15MB
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-[10px] font-black uppercase tracking-wider text-zinc-700">
            <span className="flex items-center space-x-1 bg-zinc-200 px-2 py-1 border border-zinc-900">
              <ShieldCheck className="w-3.5 h-3.5 text-zinc-900" />
              <span>Análise Confidencial e Segura</span>
            </span>
            <span className="flex items-center space-x-1 bg-zinc-200 px-2 py-1 border border-zinc-900">
              <Send className="w-3.5 h-3.5 text-zinc-900" />
              <span>Envio de e-mail automático configurado</span>
            </span>
          </div>
        </div>
      )}

      {/* Optional Gemini API Key Banner/Drawer */}
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
              Caso execute a aplicação fora do Google AI Studio, cole sua chave gratuita do Gemini obtida em{' '}
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline font-bold text-zinc-900">
                aistudio.google.com/app/apikey
              </a>. Ela é salva somente no seu navegador.
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
