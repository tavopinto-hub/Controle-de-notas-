import React, { useState } from 'react';
import { X, Mail, Send, CheckCircle2, Download, AlertCircle, Sparkles, FileSpreadsheet, Clock, ExternalLink } from 'lucide-react';
import { EmailSettings, CommissionRecord } from '../types';
import { exportToExcel, formatCurrency } from '../utils/excel';

interface EmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  emailSettings: EmailSettings;
  onUpdateSettings: (newSettings: EmailSettings) => void;
  records: CommissionRecord[];
}

export const EmailModal: React.FC<EmailModalProps> = ({
  isOpen,
  onClose,
  emailSettings,
  onUpdateSettings,
  records
}) => {
  const [senderInput, setSenderInput] = useState(
    emailSettings.senderEmail || 'tavopinto@gmail.com'
  );
  const [recipientsInput, setRecipientsInput] = useState(
    emailSettings.recipientEmails || 'tavopinto@gmail.com, marcio@marciobittencourt.com.br, gustavo@marciobittencourt.com.br'
  );
  const [smtpPass, setSmtpPass] = useState<string>(() => {
    return localStorage.getItem('app_smtp_pass_v1') || '';
  });

  const [enableMonthlyCron, setEnableMonthlyCron] = useState(
    emailSettings.enableMonthlyCron ?? true
  );
  const [autoSend, setAutoSend] = useState(emailSettings.autoSendOnUpload);
  const [notifyDue, setNotifyDue] = useState(emailSettings.notifyOnDueDates);
  const [isSending, setIsSending] = useState(false);
  const [testMonth, setTestMonth] = useState<number>(8); // August by default
  const [testYear, setTestYear] = useState<number>(2026);
  const [isSendingMonthly, setIsSendingMonthly] = useState(false);
  const [sendSuccessMsg, setSendSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const cleanPass = (pass: string) => pass.replace(/[\s"'-]/g, '').trim();

  const handleSaveSettings = async () => {
    const cleanedPassword = cleanPass(smtpPass);
    if (cleanedPassword) {
      localStorage.setItem('app_smtp_pass_v1', cleanedPassword);
    } else {
      localStorage.removeItem('app_smtp_pass_v1');
    }

    try {
      await fetch('/api/email/save-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderEmail: senderInput,
          recipientEmails: recipientsInput,
          smtpUser: senderInput,
          smtpPass: cleanedPassword,
          enableMonthlyCron,
          records
        })
      });
    } catch (e) {
      console.warn('Could not sync email settings to server:', e);
    }

    onUpdateSettings({
      ...emailSettings,
      userEmail: recipientsInput,
      senderEmail: senderInput,
      recipientEmails: recipientsInput,
      enableMonthlyCron,
      autoSendOnUpload: autoSend,
      notifyOnDueDates: notifyDue
    });
    setSendSuccessMsg('Configurações de e-mail e credenciais salvas no servidor!');
    setTimeout(() => setSendSuccessMsg(null), 3000);
  };

  const handleTestSmtpConnection = async () => {
    setIsSending(true);
    setErrorMsg(null);
    setSendSuccessMsg(null);
    const cleanedPassword = cleanPass(smtpPass);
    try {
      const res = await fetch('/api/email/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderEmail: senderInput,
          smtpUser: senderInput,
          smtpPass: cleanedPassword
        })
      });
      const data = await res.json();
      if (data.success) {
        setSendSuccessMsg(data.message);
      } else {
        setErrorMsg(data.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao testar conexão com o Gmail.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMonthlyReportNow = async (targetMonthOverride?: number) => {
    setIsSendingMonthly(true);
    setErrorMsg(null);
    setSendSuccessMsg(null);

    const targetMonth = targetMonthOverride !== undefined ? targetMonthOverride : testMonth;
    const cleanedPassword = cleanPass(smtpPass);

    try {
      const response = await fetch('/api/send-monthly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderEmail: senderInput,
          recipientEmails: recipientsInput,
          records,
          month: targetMonth,
          year: testYear,
          smtpUser: senderInput,
          smtpPass: cleanedPassword
        })
      });

      if (!response.ok) {
        throw new Error('Falha no envio do relatório mensal.');
      }

      const resData = await response.json();
      if (resData.realEmailSent) {
        setSendSuccessMsg(
          `🚀 E-mail enviado de verdade via Gmail para ${recipientsInput}! (${resData.itemCount} NFs no valor de ${resData.formattedTotal})`
        );
      } else {
        setErrorMsg(
          `⚠️ ${resData.message}`
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao enviar relatório mensal.');
    } finally {
      setIsSendingMonthly(false);
    }
  };

  const handleOpenGmailClient = () => {
    const targetMonthStr = testMonth.toString().padStart(2, '0');
    const monthRecords = records.filter(rec => {
      const d = rec.dataVencimentoNF || rec.dataContrato;
      if (!d) return false;
      if (d.includes('-')) {
        const parts = d.split('-');
        return parts[1] === targetMonthStr && parts[0] === testYear.toString();
      }
      if (d.includes('/')) {
        const parts = d.split('/');
        return parts[1] === targetMonthStr && parts[2] === testYear.toString();
      }
      return false;
    });

    const total = monthRecords.reduce((acc, r) => acc + (r.valorComissao || 0), 0);
    const formattedTotal = formatCurrency(total);

    const subject = `📊 [MBS] Relatório de Notas Fiscais a Emitir — 01/${targetMonthStr}/${testYear}`;
    let body = `Olá!\n\nSegue o relatório consolidado das Notas Fiscais a emitir referente ao mês de 01/${targetMonthStr}/${testYear}:\n\n`;
    body += `• Total de NFs a Emitir: ${monthRecords.length}\n`;
    body += `• Valor Total em Comissões: ${formattedTotal}\n\n`;
    body += `Detalhamento dos Contratos:\n`;
    monthRecords.forEach((r, idx) => {
      body += `${idx + 1}. ${r.clube || r.clienteNome} | Atleta: ${r.atleta || '-'} | Parcela: ${r.parcelaAtual || 1}/${r.totalParcelas || 1} | Valor: ${formatCurrency(r.valorComissao)} | Vencimento NF: ${r.dataVencimentoNF || 'Pendente'}\n`;
    });
    body += `\n----------------------------------------\nAnexo baixado automaticamente no seu computador: Relatorio_NFs_01_${targetMonthStr}_${testYear}.xlsx\n\nAtenciosamente,\nMárcio Bittencourt Sports`;

    // Download Excel
    exportToExcel(monthRecords, `Relatorio_NFs_01_${targetMonthStr}_${testYear}`);

    // Open Gmail Compose
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipientsInput)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');

    setSendSuccessMsg(`✅ Excel baixado e Webmail do Gmail aberto com mensagem preenchida para ${recipientsInput}!`);
  };

  const handleSendEmailNow = async () => {
    setIsSending(true);
    setErrorMsg(null);
    setSendSuccessMsg(null);

    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: recipientsInput,
          senderEmail: senderInput,
          smtpUser: senderInput,
          smtpPass: cleanPass(smtpPass),
          subject: '📊 Planilha de Controle de Comissões e NFs Atualizada',
          records,
          messageText: `Olá! Segue em anexo a planilha atualizada de controle de notas fiscais e comissões.`
        })
      });

      if (!response.ok) {
        throw new Error('Falha no envio de e-mail pelo servidor.');
      }

      const resData = await response.json();
      setSendSuccessMsg(resData.message || `Planilha enviada com sucesso para ${recipientsInput}!`);

    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao disparar e-mail.');
    } finally {
      setIsSending(false);
    }
  };

  const totalComissao = records.reduce((acc, r) => acc + (r.valorComissao || 0), 0);
  const pendentesCount = records.filter(r => r.statusNF === 'Pendente').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-zinc-900/80 backdrop-blur-xs">
      <div className="bg-white max-w-lg w-full border-3 sm:border-4 border-zinc-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-zinc-900 text-white p-3.5 sm:p-5 flex items-center justify-between border-b-4 border-zinc-900">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-400 text-zinc-950 border-2 border-zinc-900">
              <Mail className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight">Notificações por E-mail & Planilha</h3>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Configure o envio automático das suas comissões e NFs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 border-2 border-white hover:bg-zinc-800 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto text-zinc-900">
          
          {/* Sender Email Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-black text-zinc-900 uppercase tracking-widest">
                E-mail Remetente (Partindo de)
              </label>
              <div className="space-x-1">
                <button
                  type="button"
                  onClick={() => {
                    setSenderInput('tavopinto@gmail.com');
                    if (!recipientsInput.includes('tavopinto@gmail.com')) {
                      setRecipientsInput('tavopinto@gmail.com, ' + recipientsInput);
                    }
                  }}
                  className="text-[10px] bg-amber-400 font-black uppercase px-2 py-0.5 border border-zinc-900 hover:bg-amber-300"
                >
                  Usar tavopinto@gmail.com
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSenderInput('gustavo@marciobittencourt.com.br');
                  }}
                  className="text-[10px] bg-zinc-200 font-black uppercase px-2 py-0.5 border border-zinc-900 hover:bg-zinc-300"
                >
                  Usar MMB Sports
                </button>
              </div>
            </div>
            <input
              type="email"
              value={senderInput}
              onChange={(e) => setSenderInput(e.target.value)}
              placeholder="tavopinto@gmail.com"
              className="w-full px-3.5 py-2 border-2 border-zinc-900 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:bg-amber-50"
            />
          </div>

          {/* Recipient Emails Input */}
          <div>
            <label className="block text-xs font-black text-zinc-900 uppercase tracking-widest mb-1">
              E-mails de Destino (Separados por vírgula)
            </label>
            <input
              type="text"
              value={recipientsInput}
              onChange={(e) => setRecipientsInput(e.target.value)}
              placeholder="tavopinto@gmail.com, marcio@marciobittencourt.com.br, gustavo@marciobittencourt.com.br"
              className="w-full px-3.5 py-2 border-2 border-zinc-900 text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:bg-amber-50"
            />
            <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mt-1">
              Os relatórios e planilhas serão enviados para estes endereços.
            </p>
          </div>

          {/* Gmail / SMTP App Password Config Box */}
          <div className="border-3 border-zinc-900 bg-amber-50 p-4 space-y-2.5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between border-b-2 border-zinc-900 pb-2">
              <div className="flex items-center space-x-2 text-zinc-950 font-black text-xs uppercase tracking-wider">
                <Mail className="w-4 h-4 text-zinc-900" />
                <span>Senha de App do Gmail (Obrigatório pelo Google)</span>
              </div>
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 text-[10px] font-black uppercase bg-zinc-900 text-amber-400 px-2.5 py-1 border border-zinc-900 hover:bg-zinc-800 transition"
              >
                <span>Criar Senha no Google</span>
                <ExternalLink className="w-3 h-3 text-amber-400" />
              </a>
            </div>

            <p className="text-[11px] font-bold text-zinc-800 leading-relaxed">
              O Gmail bloqueia logins comuns por segurança (Erro 534-5.7.9). Para autorizar o envio automático de e-mails via <strong>{senderInput}</strong>:
            </p>

            <ol className="text-[11px] font-semibold text-zinc-900 space-y-1 list-decimal list-inside bg-white p-2.5 border-2 border-zinc-900 font-mono">
              <li>Acesse <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline font-bold text-amber-800">myaccount.google.com/apppasswords</a></li>
              <li>Nome do app: Digite <strong>MBS Comissões</strong></li>
              <li>Copie a senha de 16 letras gerada e cole no campo abaixo:</li>
            </ol>

            <div className="flex gap-2">
              <input
                type="password"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                placeholder="Cole aqui a senha de 16 caracteres (ex: abcd efgh ijkl mnop)"
                className="flex-1 px-3.5 py-2 border-2 border-zinc-900 text-xs font-mono font-bold bg-white focus:outline-none focus:bg-amber-100"
              />
              <button
                type="button"
                onClick={handleTestSmtpConnection}
                disabled={isSending}
                className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-amber-400 font-black text-[11px] uppercase border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer disabled:opacity-50 transition"
              >
                Testar Conexão
              </button>
            </div>
          </div>

          {/* Monthly Day 01 Report Box */}
          <div className="border-3 border-zinc-900 bg-amber-100 p-4 space-y-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center justify-between border-b-2 border-zinc-900 pb-2">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-amber-800" />
                <span className="font-black uppercase tracking-wider text-xs text-zinc-950">
                  Relatório Automático do Dia 1º de Cada Mês
                </span>
              </div>
              <span className="bg-zinc-900 text-amber-400 font-mono font-black text-[10px] px-2 py-0.5 uppercase">
                Todo Dia 01 @ 08:00
              </span>
            </div>

            <p className="text-[11px] font-bold text-zinc-800 uppercase leading-relaxed">
              Consolida e envia por e-mail a lista completa de todas as Notas Fiscais e comissões com vencimento no mês corrente, com tabela formatada e anexo Excel.
            </p>

            <label className="flex items-center space-x-2.5 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={enableMonthlyCron}
                onChange={(e) => setEnableMonthlyCron(e.target.checked)}
                className="accent-zinc-900 w-4 h-4 border-2 border-zinc-900"
              />
              <span className="text-xs font-black uppercase text-zinc-900">
                Ativar Disparo Automático Programado no Dia 01
              </span>
            </label>

            {/* Test Specific Month / Year selector */}
            <div className="bg-white/80 p-2.5 border-2 border-zinc-900 space-y-2 mt-2">
              <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-zinc-900">
                <span>Mês do Teste de Envio:</span>
                <div className="flex items-center space-x-2">
                  <select
                    value={testMonth}
                    onChange={(e) => setTestMonth(Number(e.target.value))}
                    className="bg-white border-2 border-zinc-900 px-2 py-1 text-xs font-mono font-bold focus:outline-none"
                  >
                    <option value={1}>01 - Janeiro</option>
                    <option value={2}>02 - Fevereiro</option>
                    <option value={3}>03 - Março</option>
                    <option value={4}>04 - Abril</option>
                    <option value={5}>05 - Maio</option>
                    <option value={6}>06 - Junho</option>
                    <option value={7}>07 - Julho</option>
                    <option value={8}>08 - Agosto (01/08)</option>
                    <option value={9}>09 - Setembro</option>
                    <option value={10}>10 - Outubro</option>
                    <option value={11}>11 - Novembro</option>
                    <option value={12}>12 - Dezembro</option>
                  </select>

                  <select
                    value={testYear}
                    onChange={(e) => setTestYear(Number(e.target.value))}
                    className="bg-white border-2 border-zinc-900 px-2 py-1 text-xs font-mono font-bold focus:outline-none"
                  >
                    <option value={2026}>2026</option>
                    <option value={2025}>2025</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <div className="flex flex-col sm:flex-row items-stretch gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTestMonth(8);
                      setTestYear(2026);
                      handleSendMonthlyReportNow(8);
                    }}
                    disabled={isSendingMonthly}
                    className="flex-1 py-2.5 px-3 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black text-xs uppercase tracking-wider border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 transition flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 text-zinc-950" />
                    <span>🧪 Disparar Envio Direto (01/08 - Agosto)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendMonthlyReportNow()}
                    disabled={isSendingMonthly}
                    className="py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 text-white font-black text-xs uppercase tracking-wider border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 transition flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <span>Disparar Mês {testMonth.toString().padStart(2, '0')}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleOpenGmailClient}
                  className="w-full py-2.5 px-3 bg-sky-100 hover:bg-sky-200 text-sky-950 font-black text-xs uppercase tracking-wider border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 transition flex items-center justify-center space-x-2 cursor-pointer"
                >
                  <Mail className="w-4 h-4 text-sky-900" />
                  <span>✉️ Alternativa Instantânea: Abrir Webmail do Gmail + Baixar Excel</span>
                </button>
              </div>
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2.5 bg-zinc-100 p-3.5 border-2 border-zinc-900">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSend}
                onChange={(e) => setAutoSend(e.target.checked)}
                className="mt-0.5 accent-zinc-900 w-4 h-4 border-2 border-zinc-900"
              />
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-zinc-900">Envio Automático ao Extrair PDF</span>
                <p className="text-[11px] font-bold text-zinc-600 uppercase">
                  Enviar e-mail de notificação a cada novo contrato cadastrado no sistema.
                </p>
              </div>
            </label>

            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={notifyDue}
                onChange={(e) => setNotifyDue(e.target.checked)}
                className="mt-0.5 accent-zinc-900 w-4 h-4 border-2 border-zinc-900"
              />
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-zinc-900">Lembretes de Vencimento de NFs</span>
                <p className="text-[11px] font-bold text-zinc-600 uppercase">
                  Alertar sobre notas fiscais com vencimento próximo ou pendentes de emissão.
                </p>
              </div>
            </label>
          </div>

          {/* Report Summary Preview Box */}
          <div className="border-2 border-zinc-900 bg-emerald-50 p-3.5 text-xs font-bold space-y-1.5">
            <div className="flex items-center justify-between text-zinc-900 font-black uppercase tracking-wider">
              <span className="flex items-center space-x-1.5">
                <FileSpreadsheet className="w-4 h-4 text-zinc-900" />
                <span>Total de Comissões Cadastradas</span>
              </span>
              <span className="bg-zinc-900 text-white px-2 py-0.5 font-mono">{records.length} itens</span>
            </div>
            <div className="flex justify-between text-zinc-900 pt-1 font-mono">
              <span>VALOR TOTAL:</span>
              <strong className="text-zinc-950 font-black">{formatCurrency(totalComissao)}</strong>
            </div>
            <div className="flex justify-between text-zinc-900 font-mono">
              <span>NFS PENDENTES DE EMISSÃO:</span>
              <strong className="text-amber-950 font-black">{pendentesCount} nota(s)</strong>
            </div>
          </div>

          {sendSuccessMsg && (
            <div className="p-3 bg-emerald-400 border-2 border-zinc-900 text-zinc-950 font-black uppercase tracking-wider text-xs flex items-center space-x-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <CheckCircle2 className="w-4 h-4 text-zinc-950 flex-shrink-0" />
              <span>{sendSuccessMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-400 border-2 border-zinc-900 text-zinc-950 font-black uppercase tracking-wider text-xs flex items-center space-x-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-zinc-100 p-4 border-t-4 border-zinc-900 flex items-center justify-between">
          <button
            onClick={() => exportToExcel(records)}
            className="inline-flex items-center space-x-1.5 text-xs font-black uppercase tracking-wider text-zinc-900 hover:underline"
          >
            <Download className="w-4 h-4 text-zinc-900" />
            <span>Baixar Planilha Local</span>
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleSaveSettings}
              className="px-3.5 py-2 text-xs font-black uppercase tracking-wider text-zinc-900 bg-white border-2 border-zinc-900 hover:bg-zinc-200 transition"
            >
              Salvar Prefs
            </button>

            <button
              onClick={handleSendEmailNow}
              disabled={isSending}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-400 hover:bg-emerald-300 border-2 border-zinc-900 text-zinc-950 font-black uppercase text-xs tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition disabled:opacity-50"
            >
              {isSending ? (
                <>
                  <Clock className="w-4 h-4 animate-spin text-zinc-950" />
                  <span>Enviando...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 text-zinc-950" />
                  <span>Enviar E-mail Agora</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
