import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  RefreshCw, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  LogIn, 
  ShieldCheck, 
  Database,
  Layers,
  Settings2,
  ListChecks,
  Users
} from 'lucide-react';
import { CommissionRecord, GoogleSheetSettings } from '../types';
import { googleSignIn } from '../lib/googleAuth';

interface SyncViewProps {
  records: CommissionRecord[];
  sheetSettings: GoogleSheetSettings;
  onSaveSettings: (settings: GoogleSheetSettings) => void;
  onSyncToSheets: (recordsToSync?: CommissionRecord[], isUserInitiated?: boolean) => Promise<void>;
  onImportFromSheets: () => Promise<void>;
  isSyncing: boolean;
  onDeduplicateRecords: () => void;
  onSeparateAtletas: () => void;
}

export const SyncView: React.FC<SyncViewProps> = ({
  records,
  sheetSettings,
  onSaveSettings,
  onSyncToSheets,
  onImportFromSheets,
  isSyncing,
  onDeduplicateRecords,
  onSeparateAtletas,
}) => {
  const [sheetUrl, setSheetUrl] = useState(sheetSettings.spreadsheetUrl);
  const [webAppUrl, setWebAppUrl] = useState(sheetSettings.webAppUrl || '');
  const [autoSync, setAutoSync] = useState(sheetSettings.autoSyncOnUpload);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  // Extract spreadsheet ID from URL
  const extractSpreadsheetId = (url: string) => {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : sheetSettings.spreadsheetId;
  };

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
        text: `Autorizado com sucesso no Google! (${user.email || 'Conta autorizada'}). Sincronizando dados agora...`
      });

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

  const handleSaveConfig = () => {
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
      text: 'Configurações de sincronização salvas com sucesso! A planilha está pronta para uso em tempo real.',
    });
  };

  const handleManualSync = async () => {
    try {
      setStatusMsg(null);
      await onSyncToSheets(undefined, true);
      setStatusMsg({
        type: 'success',
        text: `Sincronização realizada com sucesso no Google Sheets! ${records.length} comissões gravadas.`,
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err?.message || 'Erro ao sincronizar com o Google Sheets.',
      });
    }
  };

  const handleManualImport = async () => {
    try {
      setStatusMsg(null);
      await onImportFromSheets();
      setStatusMsg({
        type: 'success',
        text: 'Dados carregados e atualizados diretamente do Google Sheets!',
      });
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err?.message || 'Erro ao ler dados da planilha do Google Sheets.',
      });
    }
  };

  const columnsMapping = [
    { col: 'A', name: 'DATA', example: '15/08/2026 (Vencimento)' },
    { col: 'B', name: 'VALOR MMB', example: 'R$ 15.000,00' },
    { col: 'C', name: 'Clube', example: 'CR Flamengo' },
    { col: 'D', name: 'Atleta', example: 'Gabriel Barbosa' },
    { col: 'E', name: 'Tipo de contrato', example: 'Intermediação Comercial' },
    { col: 'F', name: 'NF', example: 'NF-00123 / Não emitida' },
    { col: 'G', name: 'Parcelas', example: '1/3, 2/3' },
    { col: 'H', name: 'Pagamento', example: '20/08/2026 / Pendente' },
    { col: 'I', name: 'PAGO OU NÃO', example: 'SIM (PAGO) / NÃO' },
    { col: 'J', name: 'Data do contrato', example: '10/08/2026' },
    { col: 'K', name: 'OBS', example: 'Comissão sobre contrato profissional' },
  ];

  return (
    <div className="space-y-6">
      {/* Primary Connection Status Card */}
      <div className="bg-zinc-900 text-white p-6 sm:p-8 border-4 border-zinc-900 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 bg-emerald-400 border border-zinc-900 rounded-full animate-pulse"></span>
              <span className="text-xs font-black text-emerald-400 tracking-widest uppercase">
                Sincronização Google Sheets Ativa
              </span>
            </div>
            
            <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white leading-tight flex items-center gap-2">
              <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
              Central de Integração & Google Sheets
            </h2>

            <p className="text-xs sm:text-sm font-semibold text-zinc-300 leading-relaxed">
              Todas as comissões e parcelas lidas do PDF pelo Gemini são gravadas automaticamente na sua planilha do <strong className="text-emerald-400 font-black">Google Sheets</strong>.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs font-bold text-zinc-300">
              <span className="px-2.5 py-1 bg-zinc-800 border border-zinc-700 font-mono text-[11px]">
                ID: {sheetSettings.spreadsheetId || '1uHR-aXyI5q_wOc_uH8v_dkDG7LP-uziyDutEcOhElB4'}
              </span>
              {sheetSettings.lastSyncedAt && (
                <span className="text-zinc-400">
                  Última sincronização: {new Date(sheetSettings.lastSyncedAt).toLocaleString('pt-BR')}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 w-full lg:w-auto min-w-[240px]">
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="inline-flex items-center justify-center space-x-2 px-5 py-3 bg-amber-400 hover:bg-amber-300 text-zinc-950 font-black uppercase text-xs tracking-wider border-2 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-zinc-950 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sincronizando...' : 'Enviar para Sheets'}</span>
            </button>

            <button
              onClick={handleManualImport}
              disabled={isSyncing}
              className="inline-flex items-center justify-center space-x-2 px-5 py-3 bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-black uppercase text-xs tracking-wider border-2 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50"
            >
              <Database className="w-4 h-4 text-zinc-950" />
              <span>Carregar do Sheets</span>
            </button>

            <a
              href={sheetSettings.spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center space-x-2 px-5 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-black uppercase text-xs tracking-wider border-2 border-zinc-900 transition"
            >
              <span>Abrir no Google Sheets</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

        {statusMsg && (
          <div className={`mt-6 p-4 border-2 border-zinc-900 text-xs font-black flex items-center space-x-2 ${
            statusMsg.type === 'success' 
              ? 'bg-emerald-400 text-zinc-950' 
              : statusMsg.type === 'error'
              ? 'bg-rose-500 text-white'
              : 'bg-amber-400 text-zinc-950'
          }`}>
            {statusMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            <span>{statusMsg.text}</span>
          </div>
        )}
      </div>

      {/* Grid with Config and Data Utilities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Config Panel (2 Cols) */}
        <div className="lg:col-span-2 bg-white border-4 border-zinc-900 p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] space-y-6">
          <div className="flex items-center space-x-3 border-b-3 border-zinc-900 pb-4">
            <div className="p-2 bg-amber-400 border-2 border-zinc-900">
              <Settings2 className="w-5 h-5 text-zinc-950" />
            </div>
            <div>
              <h3 className="text-base font-black uppercase text-zinc-900">Configurações da Planilha</h3>
              <p className="text-xs font-semibold text-zinc-600">Altere a URL, ativação de autorização e preferências</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-black uppercase text-zinc-900 mb-1.5">
                Link Oficial da Planilha Google Sheets
              </label>
              <input
                type="text"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/1uHR.../edit"
                className="w-full px-3.5 py-2.5 bg-zinc-50 border-2 border-zinc-900 text-xs font-bold text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <span className="text-[11px] font-semibold text-zinc-500 mt-1 block">
                ID da Planilha Extraído: <strong className="text-zinc-900 font-mono">{extractSpreadsheetId(sheetUrl)}</strong>
              </span>
            </div>

            {/* Auto Sync Checkbox */}
            <div className="p-4 bg-zinc-50 border-2 border-zinc-900 space-y-2">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSync}
                  onChange={(e) => setAutoSync(e.target.checked)}
                  className="w-5 h-5 text-emerald-500 rounded-none border-2 border-zinc-900 focus:ring-0 cursor-pointer"
                />
                <span className="text-xs font-black uppercase text-zinc-900">
                  Sincronização Automática em Tempo Real
                </span>
              </label>
              <p className="text-[11px] font-semibold text-zinc-600 pl-8">
                Ao enviar e ler um novo contrato PDF com a IA Gemini, os dados e todas as parcelas serão automaticamente inseridos e gravados na planilha Google Sheets sem necessidade de salvar manualmente.
              </p>
            </div>

            {/* Google OAuth Login Button */}
            <div className="p-4 bg-amber-50 border-2 border-zinc-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-1.5 text-xs font-black uppercase text-zinc-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Autorização Conta Google</span>
                </div>
                <p className="text-[11px] font-semibold text-zinc-700">
                  {sheetSettings.accessToken ? 'Sua conta Google está autorizada para salvar e atualizar a planilha.' : 'Autorize sua conta Google para garantir permissões totais de escrita.'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleGoogleConnect}
                disabled={isAuthorizing}
                className="inline-flex items-center space-x-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-black uppercase text-xs tracking-wider border-2 border-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 whitespace-nowrap"
              >
                <LogIn className="w-4 h-4 text-amber-400" />
                <span>{isAuthorizing ? 'Conectando...' : 'Autorizar Google'}</span>
              </button>
            </div>

            {/* Save Button */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleSaveConfig}
                className="inline-flex items-center space-x-2 px-6 py-3 bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-black uppercase text-xs tracking-wider border-2 border-zinc-900 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5"
              >
                <CheckCircle2 className="w-4 h-4 text-zinc-950" />
                <span>Salvar Configurações</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Data Maintenance & Controls (1 Col) */}
        <div className="bg-white border-4 border-zinc-900 p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center space-x-3 border-b-3 border-zinc-900 pb-4">
              <div className="p-2 bg-emerald-400 border-2 border-zinc-900">
                <Layers className="w-5 h-5 text-zinc-950" />
              </div>
              <div>
                <h3 className="text-base font-black uppercase text-zinc-900">Manutenção de Dados</h3>
                <p className="text-xs font-semibold text-zinc-600">Ferramentas de organização para a planilha</p>
              </div>
            </div>

            <div className="bg-zinc-100 p-4 border-2 border-zinc-900 space-y-2">
              <div className="flex items-center justify-between text-xs font-black uppercase text-zinc-900">
                <span>Registros em Memória:</span>
                <span className="px-2.5 py-0.5 bg-amber-400 border border-zinc-900 text-zinc-950 font-bold">
                  {records.length} parcelas
                </span>
              </div>
              <p className="text-[11px] font-semibold text-zinc-600">
                Total de comissões e parcelas armazenadas no aplicativo e sincronizadas com o Google Sheets.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="space-y-3 pt-2">
              <button
                onClick={onDeduplicateRecords}
                className="w-full inline-flex items-center justify-between px-4 py-3 bg-white hover:bg-zinc-100 text-zinc-900 border-2 border-zinc-900 font-black uppercase text-xs tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5"
              >
                <div className="flex items-center space-x-2">
                  <ListChecks className="w-4 h-4 text-amber-500" />
                  <span>Limpar Duplicados</span>
                </div>
                <span className="text-[10px] bg-zinc-200 px-2 py-0.5 border border-zinc-900">Auto</span>
              </button>

              <button
                onClick={onSeparateAtletas}
                className="w-full inline-flex items-center justify-between px-4 py-3 bg-white hover:bg-zinc-100 text-zinc-900 border-2 border-zinc-900 font-black uppercase text-xs tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5"
              >
                <div className="flex items-center space-x-2">
                  <Users className="w-4 h-4 text-emerald-600" />
                  <span>Organizar Clube e Atleta</span>
                </div>
                <span className="text-[10px] bg-zinc-200 px-2 py-0.5 border border-zinc-900">Auto</span>
              </button>
            </div>
          </div>

          <div className="p-3 bg-zinc-900 text-zinc-300 text-[11px] font-semibold border-2 border-zinc-900 space-y-1">
            <div className="font-black text-amber-400 uppercase">Dica MMB Sports:</div>
            <p>
              Seus dados ficam protegidos e salvos tanto localmente quanto na nuvem no Google Sheets oficial MMB Sports.
            </p>
          </div>
        </div>
      </div>

      {/* Mapping Reference Table */}
      <div className="bg-white border-4 border-zinc-900 p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] space-y-4">
        <div className="flex items-center space-x-3 border-b-3 border-zinc-900 pb-3">
          <Sparkles className="w-5 h-5 text-amber-500" />
          <h3 className="text-base font-black uppercase text-zinc-900">
            Estrutura Mapeada das Colunas do Google Sheets
          </h3>
        </div>

        <p className="text-xs font-semibold text-zinc-600">
          Abaixo está a ordem exata das colunas preenchidas automaticamente pela Inteligência Artificial na sua planilha:
        </p>

        <div className="overflow-x-auto border-2 border-zinc-900">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-900 text-white font-black uppercase border-b-2 border-zinc-900">
                <th className="p-2.5 border-r border-zinc-700 w-16 text-center">Coluna</th>
                <th className="p-2.5 border-r border-zinc-700">Campo MMB Sports</th>
                <th className="p-2.5">Exemplo Preenchido pela IA</th>
              </tr>
            </thead>
            <tbody className="divide-y border-zinc-900 font-bold text-zinc-800">
              {columnsMapping.map((c, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-zinc-50'}>
                  <td className="p-2.5 border-r-2 border-zinc-900 font-mono text-center font-black bg-zinc-200 text-zinc-950">
                    {c.col}
                  </td>
                  <td className="p-2.5 border-r-2 border-zinc-900 font-black text-zinc-900">
                    {c.name}
                  </td>
                  <td className="p-2.5 font-mono text-zinc-600 text-[11px]">
                    {c.example}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
