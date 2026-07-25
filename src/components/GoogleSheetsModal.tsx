import React, { useState } from 'react';
import { FileSpreadsheet, X, RefreshCw, ExternalLink, Download, Upload, CheckCircle2, AlertCircle, Sparkles, Layers, LogIn, ShieldCheck } from 'lucide-react';
import { CommissionRecord, GoogleSheetSettings } from '../types';
import { googleSignIn } from '../lib/googleAuth';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: CommissionRecord[];
  sheetSettings: GoogleSheetSettings;
  onSaveSettings: (settings: GoogleSheetSettings) => void;
  onSyncToSheets: (recordsToSync?: CommissionRecord[]) => Promise<void>;
  onImportFromSheets: () => Promise<void>;
  isSyncing: boolean;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  records,
  sheetSettings,
  onSaveSettings,
  onSyncToSheets,
  onImportFromSheets,
  isSyncing,
}) => {
  const [sheetUrl, setSheetUrl] = useState(sheetSettings.spreadsheetUrl);
  const [webAppUrl, setWebAppUrl] = useState(sheetSettings.webAppUrl || '');
  const [autoSync, setAutoSync] = useState(sheetSettings.autoSyncOnUpload);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  if (!isOpen) return null;

  // Extract spreadsheet ID from URL
  const extractSpreadsheetId = (url: string) => {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : sheetSettings.spreadsheetId;
  };

  const currentSpreadsheetId = extractSpreadsheetId(sheetUrl);

  const handleGoogleConnect = async () => {
    setIsAuthorizing(true);
    setStatusMsg(null);
    try {
      const { user, accessToken } = await googleSignIn();
      const newId = extractSpreadsheetId(sheetUrl);
      const newSettings: GoogleSheetSettings = {
        ...sheetSettings,
        spreadsheetUrl: sheetUrl,
        spreadsheetId: newId,
        webAppUrl: webAppUrl.trim(),
        autoSyncOnUpload: autoSync,
        isConnected: true,
        accessToken,
        lastSyncedAt: new Date().toISOString()
      };
      onSaveSettings(newSettings);
      
      setStatusMsg({
        type: 'success',
        text: `Autorizado com sucesso no Google! (${user.email || 'Conta vinculada'}). Sincronizando dados agora...`
      });

      // Directly sync records now
      await onSyncToSheets();
    } catch (err: any) {
      console.error("Erro ao conectar Google:", err);
      setStatusMsg({
        type: 'error',
        text: err?.message || 'Falha ao autorizar conta Google.'
      });
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleSave = () => {
    const newId = extractSpreadsheetId(sheetUrl);
    onSaveSettings({
      ...sheetSettings,
      spreadsheetUrl: sheetUrl,
      spreadsheetId: newId,
      webAppUrl: webAppUrl.trim(),
      autoSyncOnUpload: autoSync,
      isConnected: true,
    });
    setStatusMsg({
      type: 'success',
      text: 'Configurações do Google Sheets salvas com sucesso! As inclusões serão enviadas instantaneamente.',
    });
  };

  const handleSyncNow = async () => {
    try {
      setStatusMsg(null);
      await onSyncToSheets();
      setStatusMsg({
        type: 'success',
        text: `Sincronização concluída com sucesso no Google Sheets! ${records.length} linha(s) enviada(s).`,
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err?.message || 'Erro ao sincronizar com o Google Sheets.',
      });
    }
  };

  const handleImportNow = async () => {
    try {
      setStatusMsg(null);
      await onImportFromSheets();
      setStatusMsg({
        type: 'success',
        text: 'Dados importados com sucesso da planilha do Google Sheets!',
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err?.message || 'Erro ao ler dados da planilha do Google Sheets.',
      });
    }
  };

  const columnsMap = [
    { col: 'A', name: 'Item', example: '1' },
    { col: 'B', name: 'Nº Contrato', example: 'CT-2026/089' },
    { col: 'C', name: 'Cliente / Razão Social', example: 'Márcio Bittencourt Sports' },
    { col: 'D', name: 'CNPJ / CPF', example: '00.000.000/0001-00' },
    { col: 'E', name: 'Descrição do Serviço', example: 'Comissão sobre intermediação de atleta' },
    { col: 'F', name: 'Valor Contrato (R$)', example: 'R$ 150.000,00' },
    { col: 'G', name: '% Comissão', example: '10%' },
    { col: 'H', name: 'Valor Comissão (R$)', example: 'R$ 15.000,00' },
    { col: 'I', name: 'Vencimento NF', example: '2026-08-15' },
    { col: 'J', name: 'Status NF', example: 'Pendente / Emitida' },
    { col: 'K', name: 'Nº NF', example: 'NF-00123' },
    { col: 'L', name: 'Data Emissão NF', example: '2026-08-10' },
    { col: 'M', name: 'Status Pagamento', example: 'Aguardando / Pago' },
    { col: 'N', name: 'Data Pagamento', example: '2026-08-12' },
    { col: 'O', name: 'Observações', example: 'Extraído via IA Gemini PDF' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-zinc-900/80 backdrop-blur-xs">
      <div className="bg-white max-w-2xl w-full border-3 sm:border-4 border-zinc-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-zinc-900 text-white p-3.5 sm:p-5 flex items-center justify-between border-b-4 border-zinc-900">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-400 text-zinc-950 border-2 border-zinc-900">
              <FileSpreadsheet className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-black uppercase tracking-tight">Integração Google Sheets</h3>
                <span className="bg-emerald-400 text-zinc-950 text-[10px] font-black uppercase px-2 py-0.5 border border-zinc-900">
                  Ao Vivo
                </span>
              </div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                Sincronize comissões e NFs diretamente na sua planilha
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 border-2 border-white hover:bg-zinc-800 text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-zinc-900 text-xs font-medium">

          {/* Google Account OAuth Connection Banner */}
          <div className="bg-amber-100/80 p-4 border-3 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span className="font-black uppercase tracking-wider text-xs text-zinc-900">
                    Autorização Direct-Sync Google Sheets API
                  </span>
                </div>
                <p className="text-[11px] font-bold text-zinc-700 uppercase">
                  Para que o aplicativo possa gravar e atualizar sua planilha no Google Drive em tempo real, autorize o acesso com sua conta do Google:
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={handleGoogleConnect}
                disabled={isAuthorizing || isSyncing}
                className="inline-flex items-center justify-center space-x-2.5 px-4 py-2.5 bg-white hover:bg-zinc-50 text-zinc-900 font-black text-xs uppercase border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 transition disabled:opacity-50 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                <span>{isAuthorizing ? 'Conectando ao Google...' : 'Autorizar Acesso Google (OAuth)'}</span>
              </button>

              {sheetSettings.accessToken ? (
                <div className="inline-flex items-center space-x-1.5 bg-emerald-200 border border-zinc-900 px-3 py-1.5 text-[11px] font-black uppercase text-emerald-950">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-800" />
                  <span>Conta Conectada & Token Ativo</span>
                </div>
              ) : (
                <div className="inline-flex items-center space-x-1.5 bg-amber-200 border border-zinc-900 px-3 py-1.5 text-[11px] font-bold uppercase text-amber-950">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-900" />
                  <span>Acesso Não Autorizado Ainda</span>
                </div>
              )}
            </div>
          </div>

          {/* Spreadsheet Link Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block font-black text-zinc-900 uppercase tracking-widest text-xs">
                Link da Planilha do Google Sheets
              </label>
              <a
                href={sheetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1 text-emerald-600 font-black hover:underline uppercase text-[11px]"
              >
                <span>Abrir Planilha no Google</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <input
              type="text"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/1uHR-aXyI5q_wOc_uH8v_dkDG7LP-uziyDutEcOhElB4/edit"
              className="w-full px-3.5 py-2.5 border-2 border-zinc-900 text-xs font-bold text-zinc-900 font-mono focus:bg-amber-50 focus:outline-none"
            />
            <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-0.5">
              <span>ID Extraído: <strong className="text-zinc-900">{currentSpreadsheetId}</strong></span>
              <span>Total Registros Locais: <strong className="text-zinc-900">{records.length}</strong></span>
            </div>
          </div>

          {/* WebApp URL Input (Instant Sync) */}
          <div className="space-y-2 pt-1 border-2 border-zinc-900 p-3.5 bg-zinc-50">
            <div className="flex items-center justify-between">
              <label className="block font-black text-zinc-900 uppercase tracking-widest text-xs">
                URL do WebApp Google Apps Script (Alimentação Direta)
              </label>
              <button
                type="button"
                onClick={() => {
                  const scriptCode = `function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    if (data.rows && data.rows.length > 0) {
      if (sheet.getLastRow() === 0 && data.headers) {
        sheet.appendRow(data.headers);
      } else if (sheet.getLastRow() > 1) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
      }
      data.rows.forEach(function(row) {
        sheet.appendRow(row);
      });
    }
    return ContentService.createTextOutput(JSON.stringify({status: "success"}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({status: "error", message: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;
                  navigator.clipboard.writeText(scriptCode);
                  setStatusMsg({ type: 'success', text: 'Código do Google Apps Script copiado para a área de transferência!' });
                }}
                className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black text-[10px] uppercase border border-zinc-900 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5"
              >
                Copiar Código do Apps Script
              </button>
            </div>

            <input
              type="text"
              value={webAppUrl}
              onChange={(e) => setWebAppUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full px-3.5 py-2.5 border-2 border-zinc-900 text-xs font-bold text-zinc-900 font-mono focus:bg-amber-50 focus:outline-none"
            />
            
            <div className="text-[11px] font-bold text-zinc-600 space-y-1">
              <p className="text-zinc-900 uppercase">como ativar a atualização automatica na sua planilha:</p>
              <ol className="list-decimal list-inside space-y-0.5 font-normal text-zinc-700">
                <li>Na sua planilha do Google, acesse <strong className="font-black text-zinc-900">Extensões &gt; Apps Script</strong></li>
                <li>Clique em <strong>Copiar Código</strong> acima e cole no editor do Google</li>
                <li>Clique em <strong>Implantar &gt; Nova implantação &gt; App da Web</strong></li>
                <li>Quem pode acessar: selecione <strong className="font-black text-zinc-900">Qualquer Pessoa (Anyone)</strong></li>
                <li>Copie o link gerado e cole no campo acima. Pronto! Cada inclusão alimentará o Google Sheets na hora.</li>
              </ol>
            </div>
          </div>

          {/* Toggle Auto Sync */}
          <div className="bg-emerald-50 p-4 border-2 border-zinc-900 space-y-3">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="mt-0.5 accent-zinc-900 w-4 h-4 border-2 border-zinc-900"
              />
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-zinc-900">
                  Sincronização Automática em Tempo Real
                </span>
                <p className="text-[11px] font-bold text-zinc-700 uppercase mt-0.5">
                  Alimentar e atualizar a planilha do Google Sheets no exato momento de cada inclusão, edição ou leitura de PDF no aplicativo.
                </p>
              </div>
            </label>
          </div>

          {/* Actions: Sync / Import */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="inline-flex items-center justify-center space-x-2 p-3 bg-emerald-400 hover:bg-emerald-300 border-2 border-zinc-900 text-zinc-950 font-black uppercase tracking-wider text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition disabled:opacity-50"
            >
              <Upload className="w-4 h-4 text-zinc-950" />
              <span>{isSyncing ? 'Sincronizando...' : 'Enviar Dados ao Google Sheets'}</span>
            </button>

            <button
              onClick={handleImportNow}
              disabled={isSyncing}
              className="inline-flex items-center justify-center space-x-2 p-3 bg-white hover:bg-zinc-100 border-2 border-zinc-900 text-zinc-900 font-black uppercase tracking-wider text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-zinc-900" />
              <span>Importar do Google Sheets</span>
            </button>
          </div>

          {/* Status Message */}
          {statusMsg && (
            <div
              className={`p-3.5 border-2 border-zinc-900 font-black uppercase text-xs flex items-center space-x-2 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] ${
                statusMsg.type === 'success'
                  ? 'bg-emerald-400 text-zinc-950'
                  : 'bg-rose-400 text-zinc-950'
              }`}
            >
              {statusMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{statusMsg.text}</span>
            </div>
          )}

          {/* Column Mapping Table */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-zinc-900" />
              <h4 className="font-black uppercase tracking-wider text-xs text-zinc-900">
                Mapeamento das Colunas na Planilha
              </h4>
            </div>
            <div className="border-2 border-zinc-900 rounded-none overflow-hidden max-h-48 overflow-y-auto">
              <table className="w-full text-left font-mono text-[11px]">
                <thead className="bg-zinc-900 text-white font-black uppercase sticky top-0">
                  <tr>
                    <th className="p-2 border-r border-zinc-700 w-12 text-center">Coluna</th>
                    <th className="p-2 border-r border-zinc-700">Campo no App</th>
                    <th className="p-2">Exemplo de Dado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-300 bg-white">
                  {columnsMap.map((colItem) => (
                    <tr key={colItem.col} className="hover:bg-zinc-100">
                      <td className="p-2 border-r border-zinc-200 font-black text-center bg-amber-100 text-zinc-900">
                        {colItem.col}
                      </td>
                      <td className="p-2 border-r border-zinc-200 font-bold text-zinc-900">
                        {colItem.name}
                      </td>
                      <td className="p-2 text-zinc-500 font-sans">{colItem.example}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-zinc-100 p-4 border-t-4 border-zinc-900 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-[11px] font-bold text-zinc-600 uppercase">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span>Márcio Bittencourt Sports</span>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border-2 border-zinc-900 text-zinc-900 font-black uppercase text-xs tracking-wider hover:bg-zinc-200 transition"
            >
              Fechar
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-zinc-900 text-white font-black uppercase text-xs tracking-wider border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-zinc-800 transition"
            >
              Salvar Configurações
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
