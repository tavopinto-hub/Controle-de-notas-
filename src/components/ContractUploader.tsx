import React, { useState, useRef } from 'react';
import { Upload, FileText, Sparkles, CheckCircle2, AlertCircle, Loader2, Send, ArrowRight, ShieldCheck } from 'lucide-react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const processPdfFile = async (file: File) => {
    setErrorMsg(null);
    try {
      setCurrentStep(1);
      setStatusMessage('Lendo arquivo PDF do contrato...');

      const formData = new FormData();
      formData.append('pdfFile', file);

      setCurrentStep(2);
      setStatusMessage('Analisando clausulas e comissões com IA Gemini...');

      const response = await fetch('/api/contracts/analyze', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Falha ao processar PDF no servidor.');
      }

      const resData = await response.json();
      if (!resData.success || !resData.data) {
        throw new Error(resData.error || 'A extração de dados não retornou resultados válidos.');
      }

      setCurrentStep(3);
      setStatusMessage('Preenchendo automaticamente a planilha...');

      // Trigger callback
      await onContractExtracted(resData.data, file.name);

      setCurrentStep(4);
      setStatusMessage(`Enviando notificação com planilha atualizada para ${userEmail}...`);

      setTimeout(() => {
        setCurrentStep(0);
        setStatusMessage('');
      }, 3500);

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

      {errorMsg && (
        <div className="mt-4 p-3 bg-rose-100 border-2 border-zinc-900 text-rose-950 text-xs font-black uppercase tracking-wider flex items-center space-x-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-700" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
