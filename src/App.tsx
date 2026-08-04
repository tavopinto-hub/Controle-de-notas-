/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { StatsOverview } from './components/StatsOverview';
import { ContractUploader } from './components/ContractUploader';
import { SpreadsheetTable } from './components/SpreadsheetTable';
import { DashboardView } from './components/DashboardView';
import { SyncView } from './components/SyncView';
import { EmailModal } from './components/EmailModal';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';
import { NotificationCenter } from './components/NotificationCenter';
import { RecordModal } from './components/RecordModal';
import { DuplicateModal, DuplicateOptions } from './components/DuplicateModal';
import { initialRecords } from './data/initialRecords';
import { CommissionRecord, ContractAnalysisResult, AppNotification, EmailSettings, GoogleSheetSettings } from './types';
import { Sparkles, CheckCircle2, AlertTriangle, FileSpreadsheet, ExternalLink, RefreshCw, Trash2, LayoutDashboard, FileText } from 'lucide-react';
import { initAuth, getCachedAccessToken } from './lib/googleAuth';
import { getRecordYear } from './utils/dateUtils';
import { normalizeRecordsClubeAtleta, cleanClubeAndAtleta, propagateAthleteInfoToAllRecords, propagateAllAthletesAcrossAllRecords } from './utils/athleteUtils';
import { fetchSheetRecordsDirectly } from './utils/sheetsClient';
import { 
  subscribeToRecords, 
  saveRecordToFirestore, 
  saveBatchRecordsToFirestore, 
  deleteRecordFromFirestore,
  seedFirestoreRecords
} from './lib/firebase';

const STORAGE_KEY_RECORDS = 'app_commission_records_v1';
const STORAGE_KEY_EMAIL = 'app_email_settings_v1';
const STORAGE_KEY_SHEETS = 'app_sheets_settings_v1';

// Helpers for deduplication date & string normalization
const normalizeDateISO = (d?: string): string => {
  if (!d) return '';
  const str = String(d).trim();
  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length === 3) {
      let [day, month, year] = parts;
      if (year.length === 2) year = '20' + year;
      if (day.length === 1) day = '0' + day;
      if (month.length === 1) month = '0' + month;
      return `${year}-${month}-${day}`;
    }
  }
  return str.substring(0, 10);
};

const getNormalizedAthleteKey = (rec: CommissionRecord): string => {
  let athlete = (rec.atleta && rec.atleta !== '-' && rec.atleta !== 'Pendente') ? rec.atleta : '';
  if (!athlete) {
    let raw = rec.clienteNome || rec.clube || '';
    const paren = raw.match(/[\(\[\{]([^\)\]\}]+)[\)\]\}]/);
    if (paren && paren[1]) {
      athlete = paren[1];
    } else {
      athlete = raw;
    }
  }
  return athlete.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim();
};

const getNormalizedClubKey = (rec: CommissionRecord): string => {
  let clube = (rec.clube && rec.clube !== '-') ? rec.clube : '';
  if (!clube) {
    let raw = rec.clienteNome || '';
    clube = raw.split('(')[0].split('-')[0].split('/')[0];
  }
  return clube.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim();
};

// Comprehensive Deduplication helper to inspect the entire spreadsheet
export const deduplicateRecords = (recordsList: CommissionRecord[]): CommissionRecord[] => {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const result: CommissionRecord[] = [];

  for (const rec of recordsList) {
    if (!rec || !rec.id) continue;

    // 1. Skip exact duplicate IDs
    if (seenIds.has(rec.id)) {
      continue;
    }

    const athleteKey = getNormalizedAthleteKey(rec);
    const clubKey = getNormalizedClubKey(rec);
    const clienteKey = (rec.clienteNome || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '').trim();
    const vencISO = normalizeDateISO(rec.dataVencimentoNF);
    const monthISO = vencISO.substring(0, 7); // e.g. "2026-07"
    const valor = Math.round((rec.valorComissao || 0) * 100) / 100;
    const parcCurr = rec.parcelaAtual || 1;
    const parcTot = rec.totalParcelas || 1;
    const parcStr = `${parcCurr}/${parcTot}`;
    const tipoKey = (rec.tipoContrato || '').toLowerCase().trim();
    const agentesKey = (rec.captadores || rec.agentes || []).slice().sort().join(',').toLowerCase();
    const statusNfKey = (rec.statusNF || '').toLowerCase().trim();
    const statusPagKey = (rec.statusPagamento || '').toLowerCase().trim();
    const obsKey = (rec.observacoes || '').toLowerCase().trim();

    let ct = (rec.numeroContrato || '').split('(')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (ct.includes('mbs') || ct.includes('sem')) ct = '';

    const contractDisc = ct ? `ct:${ct}` : (clienteKey ? `cli:${clienteKey}` : '');

    // Fully detailed composite key that preserves duplicates created for different companies, types, agents, status, or values
    const fullUniqueKey = `key:${rec.id}:${contractDisc}:${athleteKey}:${clubKey}:${tipoKey}:${agentesKey}:${parcStr}:${monthISO}:${valor}:${statusNfKey}:${statusPagKey}:${obsKey}`;

    if (seenKeys.has(fullUniqueKey)) {
      continue; // Skip exact clone
    }

    seenIds.add(rec.id);
    seenKeys.add(fullUniqueKey);
    result.push(rec);
  }

  return result;
};

export default function App() {
  // Load initial state or localStorage
  const [records, setRecords] = useState<CommissionRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RECORDS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Filter out legacy fake records if present
          const cleanParsed = parsed.filter((r: any) => !r.id?.startsWith('rec-00') && r.clienteNome !== 'Nexus Tecnologia S.A.');
          if (cleanParsed.length > 0) {
            return normalizeRecordsClubeAtleta(deduplicateRecords(cleanParsed));
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
    return normalizeRecordsClubeAtleta(deduplicateRecords(initialRecords));
  });

  const [emailSettings, setEmailSettings] = useState<EmailSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_EMAIL);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {
      userEmail: 'marcio@marciobittencourt.com.br, gustavo@marciobittencourt.com.br',
      senderEmail: 'gustavo@marciobittencourt.com.br',
      recipientEmails: 'marcio@marciobittencourt.com.br, gustavo@marciobittencourt.com.br',
      enableMonthlyCron: true,
      autoSendOnUpload: true,
      notifyOnDueDates: true,
      daysBeforeNotification: 3,
      smtpConfigured: true
    };
  });

  const [sheetSettings, setSheetSettings] = useState<GoogleSheetSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SHEETS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return {
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1uHR-aXyI5q_wOc_uH8v_dkDG7LP-uziyDutEcOhElB4/edit?pli=1&gid=0#gid=0',
      spreadsheetId: '1uHR-aXyI5q_wOc_uH8v_dkDG7LP-uziyDutEcOhElB4',
      sheetName: 'Página1',
      autoSyncOnUpload: true,
      isConnected: true,
      lastSyncedAt: new Date().toISOString()
    };
  });

  const [notifications, setNotifications] = useState<AppNotification[]>([
    {
      id: 'notif-1',
      titulo: 'Sincronização Google Sheets Ativa',
      mensagem: 'Sua planilha do Google Sheets (ID: 1uHR-aXyI5q_wOc_uH8v_dkDG7LP-uziyDutEcOhElB4) foi conectada e atualizada com sucesso.',
      tipo: 'sucesso',
      data: 'Hoje 09:30',
      lida: false
    }
  ]);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Main Division Tab state ('inclusao' = PDF + Planilha, 'dashboard' = Visual Dashboard, 'sincronizacao' = Google Sheets Sync)
  const [mainAppTab, setMainAppTab] = useState<'inclusao' | 'dashboard' | 'sincronizacao'>('inclusao');

  // Dashboard Year & Status Filter states
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [dashboardTab, setDashboardTab] = useState<'all' | 'nao_emitida' | 'fora_prazo' | 'emitida' | 'nao_autorizada' | 'pago'>('all');

  const handleNavigateToTable = (statusFilter?: 'all' | 'nao_emitida' | 'fora_prazo' | 'emitida' | 'nao_autorizada' | 'pago') => {
    if (statusFilter) {
      setDashboardTab(statusFilter);
    }
    setMainAppTab('inclusao');
  };

  // Dynamically compute available years from commission records
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    records.forEach(rec => {
      const yr = getRecordYear(rec);
      if (yr && yr !== 'Outros') {
        yearsSet.add(yr);
      }
    });
    const currentY = new Date().getFullYear().toString();
    yearsSet.add(currentY);
    yearsSet.add("2026");
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [records]);

  // Modal states
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isSheetsModalOpen, setIsSheetsModalOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [duplicateRecordTarget, setDuplicateRecordTarget] = useState<CommissionRecord | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<CommissionRecord | null>(null);
  const [recordToDelete, setRecordToDelete] = useState<CommissionRecord | null>(null);
  const [isSheetsSyncing, setIsSheetsSyncing] = useState(false);

  // Sync records to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(records));
    } catch (e) {
      console.error(e);
    }
  }, [records]);

  // Real-time Firestore synchronization for iPhone, iPad, and Desktop
  useEffect(() => {
    const unsubscribe = subscribeToRecords(
      (firestoreRecords) => {
        if (Array.isArray(firestoreRecords) && firestoreRecords.length > 0) {
          setRecords(normalizeRecordsClubeAtleta(deduplicateRecords(firestoreRecords)));
        }
      },
      () => {
        // If Firestore is empty on first run, seed with local or initial records
        const initial = (() => {
          try {
            const saved = localStorage.getItem(STORAGE_KEY_RECORDS);
            if (saved) {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed) && parsed.length > 0) {
                const cleanParsed = parsed.filter((r: any) => !r.id?.startsWith('rec-00') && r.clienteNome !== 'Nexus Tecnologia S.A.');
                if (cleanParsed.length > 0) return cleanParsed;
              }
            }
          } catch (e) {
            console.error(e);
          }
          return initialRecords;
        })();
        const cleanInitial = normalizeRecordsClubeAtleta(deduplicateRecords(initial));
        setRecords(cleanInitial);
        seedFirestoreRecords(cleanInitial).catch(err => console.warn('Erro ao popular Firestore inicial:', err));
      }
    );

    return () => unsubscribe();
  }, []);

  // Sync emailSettings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_EMAIL, JSON.stringify(emailSettings));
    } catch (e) {
      console.error(e);
    }
  }, [emailSettings]);

  // Sync sheetSettings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SHEETS, JSON.stringify(sheetSettings));
    } catch (e) {
      console.error(e);
    }
  }, [sheetSettings]);

  // Initialize Auth listener & auto-import
  useEffect(() => {
    const unsubscribe = initAuth((_user, token) => {
      setSheetSettings(prev => ({ ...prev, accessToken: token, isConnected: true }));
    });
    return () => unsubscribe();
  }, []);

  // Auto-import records from Google Sheets on initial load
  useEffect(() => {
    if (sheetSettings.spreadsheetId) {
      handleImportFromSheets().catch(err => {
        console.warn('Auto-import do Google Sheets ao iniciar:', err);
      });
    }
  }, [sheetSettings.spreadsheetId]);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  // Google Sheets Sync handler
  const handleSyncToSheets = async (targetRecords?: CommissionRecord[]) => {
    setIsSheetsSyncing(true);
    try {
      const recordsToSync = targetRecords || records;
      const activeToken = sheetSettings.accessToken || getCachedAccessToken();
      const res = await fetch('/api/sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: sheetSettings.spreadsheetId,
          sheetName: sheetSettings.sheetName,
          webAppUrl: sheetSettings.webAppUrl,
          accessToken: activeToken,
          records: recordsToSync
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.details || 'Falha ao sincronizar com Google Sheets');
      }

      setSheetSettings(prev => ({
        ...prev,
        lastSyncedAt: new Date().toISOString(),
        isConnected: true
      }));

      if (data.simulated) {
        console.log("Inclusão salva no app.");
      } else {
        showToast(`Google Sheets atualizado em tempo real (${recordsToSync.length} comissões)!`, 'success');
      }
    } catch (err: any) {
      console.error("Erro ao sincronizar com Google Sheets:", err);
      showToast(`Atenção ao alimentar Google Sheets: ${err.message || 'Verifique o link'}`, 'info');
    } finally {
      setIsSheetsSyncing(false);
    }
  };

  // Google Sheets Import handler (merges with local PDF records)
  const handleImportFromSheets = async () => {
    setIsSheetsSyncing(true);
    try {
      let loadedRecords: CommissionRecord[] = [];

      // 1. Try server API route first
      try {
        const res = await fetch('/api/sheets/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            spreadsheetId: sheetSettings.spreadsheetId
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.records) && data.records.length > 0) {
            loadedRecords = data.records;
          }
        }
      } catch (serverErr) {
        console.warn("Server sheets endpoint unaccessible, trying direct browser fetch...", serverErr);
      }

      // 2. Client-side direct GViz fallback if server endpoint was skipped or failed
      if (loadedRecords.length === 0 && sheetSettings.spreadsheetId) {
        try {
          loadedRecords = await fetchSheetRecordsDirectly(sheetSettings.spreadsheetId);
        } catch (directErr) {
          console.error("Erro no fetch direto do Google Sheets:", directErr);
        }
      }

      if (loadedRecords.length > 0) {
        const mergedList = deduplicateRecords([...records, ...loadedRecords]);
        setRecords(mergedList);
        saveBatchRecordsToFirestore(mergedList).catch(err => console.warn('Firestore import sync:', err));
        showToast(`${loadedRecords.length} comissões carregadas da planilha do Google Sheets!`, 'success');
      } else {
        showToast('Nenhum registro encontrado na planilha do Google Sheets.', 'info');
      }
    } catch (err: any) {
      console.error("Erro ao importar do Google Sheets:", err);
      showToast(`Aviso: ${err.message || 'Erro ao ler a planilha'}`, 'info');
    } finally {
      setIsSheetsSyncing(false);
    }
  };

  // Manual Deduplication handler
  const handleDeduplicateRecords = () => {
    const beforeCount = records.length;
    const cleaned = deduplicateRecords(records);
    const removedCount = beforeCount - cleaned.length;
    setRecords(cleaned);
    saveBatchRecordsToFirestore(cleaned).catch(err => console.warn('Firestore deduplicate sync:', err));
    if (removedCount > 0) {
      showToast(`Removidas ${removedCount} parcela(s) duplicada(s) com sucesso!`, 'success');
      if (sheetSettings.spreadsheetId) {
        handleSyncToSheets(cleaned).catch(e => console.warn('Sync notice:', e));
      }
    } else {
      showToast('Nenhuma parcela duplicada encontrada na planilha.', 'info');
    }
  };

  // Manual Separation of Clube and Atleta handler
  const handleSeparateAtletas = () => {
    const beforeStr = JSON.stringify(records);
    const cleaned = normalizeRecordsClubeAtleta(records);
    const afterStr = JSON.stringify(cleaned);

    setRecords(cleaned);
    saveBatchRecordsToFirestore(cleaned).catch(err => console.warn('Firestore separate sync:', err));
    if (beforeStr !== afterStr) {
      showToast('✨ Atletas colados no clube foram organizados para a coluna Atleta!', 'success');
      if (sheetSettings.spreadsheetId) {
        handleSyncToSheets(cleaned).catch(e => console.warn('Sync notice:', e));
      }
    } else {
      showToast('Todos os atletas já estão organizados na coluna de Atleta.', 'info');
    }
  };

  // Callback when PDF is parsed by Gemini AI
  const handleContractExtracted = async (extracted: ContractAnalysisResult, filename: string) => {
    const newRecordsCreated: CommissionRecord[] = [];
    const baseContratoNo = extracted.numeroContrato || `CT-2026/${Math.floor(100 + Math.random() * 900)}`;
    const baseCliente = extracted.clienteNome || 'Cliente Não Identificado';
    const totalParcelas = extracted.parcelas?.length || extracted.numeroParcelas || 1;

    // Clean and split clube and atleta if glued together
    const { clube: cleanedClube, atleta: cleanedAtleta } = cleanClubeAndAtleta(
      extracted.clube,
      extracted.atleta,
      extracted.clienteNome
    );

    // Prioritize exact values extracted by Gemini, fallback to cleanClubeAndAtleta if empty
    const finalClube = (extracted.clube && extracted.clube.trim().length > 0 && extracted.clube !== '-') 
      ? extracted.clube.trim() 
      : (cleanedClube || baseCliente);

    const finalAtleta = (extracted.atleta && extracted.atleta.trim().length > 0 && extracted.atleta !== '-') 
      ? extracted.atleta.trim() 
      : (cleanedAtleta || '-');

    if (extracted.parcelas && extracted.parcelas.length > 1) {
      extracted.parcelas.forEach((p, idx) => {
        newRecordsCreated.push({
          id: `rec-${Date.now()}-${idx + 1}`,
          numeroContrato: `${baseContratoNo} (${p.numeroParcela}/${totalParcelas})`,
          clienteNome: baseCliente,
          clube: finalClube,
          atleta: finalAtleta,
          tipoContrato: extracted.tipoContrato || 'Intermediação Comercial',
          dataContrato: extracted.dataContrato || new Date().toISOString().split('T')[0],
          numeroNF: extracted.numeroNF || '',
          clienteCnpjCpf: extracted.clienteCnpjCpf || '',
          servicoDescricao: `${extracted.servicoDescricao || 'Serviço de Intermediação Comercial'} - Parcela ${p.numeroParcela}/${totalParcelas}`,
          valorBaseContrato: extracted.valorBaseContrato ? Math.round((extracted.valorBaseContrato / totalParcelas) * 100) / 100 : 0,
          percentualComissao: extracted.percentualComissao || 10,
          valorComissao: p.valorParcela,
          dataVencimentoNF: p.dataVencimento,
          statusNF: 'Não emitida',
          statusPagamento: 'Aguardando',
          pagoOuNao: 'Não pago',
          observacoes: extracted.observacoes || p.descricao || `Contrato parcelado em ${totalParcelas}x (Arquivo: ${filename})`,
          criadoEm: new Date().toISOString(),
          pdfNomeArquivo: filename,
          parcelaAtual: p.numeroParcela,
          totalParcelas: totalParcelas
        });
      });
    } else {
      newRecordsCreated.push({
        id: `rec-${Date.now()}`,
        numeroContrato: baseContratoNo,
        clienteNome: baseCliente,
        clube: finalClube,
        atleta: finalAtleta,
        tipoContrato: extracted.tipoContrato || 'Intermediação Comercial',
        dataContrato: extracted.dataContrato || new Date().toISOString().split('T')[0],
        numeroNF: extracted.numeroNF || '',
        clienteCnpjCpf: extracted.clienteCnpjCpf || '',
        servicoDescricao: extracted.servicoDescricao || 'Serviço de Intermediação Comercial',
        valorBaseContrato: extracted.valorBaseContrato || 0,
        percentualComissao: extracted.percentualComissao || 10,
        valorComissao: extracted.valorComissao || (extracted.valorBaseContrato ? (extracted.valorBaseContrato * (extracted.percentualComissao || 10) / 100) : 0),
        dataVencimentoNF: extracted.dataVencimentoNF || new Date().toISOString().split('T')[0],
        statusNF: 'Não emitida',
        statusPagamento: 'Aguardando',
        pagoOuNao: 'Não pago',
        observacoes: extracted.observacoes || `Extraído de ${filename}`,
        criadoEm: new Date().toISOString(),
        pdfNomeArquivo: filename,
        parcelaAtual: 1,
        totalParcelas: 1
      });
    }

    const updatedRecords = deduplicateRecords([...newRecordsCreated, ...records]);
    setRecords(updatedRecords);
    saveBatchRecordsToFirestore(updatedRecords).catch(err => console.warn('Firestore extract sync:', err));

    const firstRec = newRecordsCreated[0];

    // Add notification
    const newNotif: AppNotification = {
      id: `notif-${Date.now()}`,
      titulo: totalParcelas > 1 ? `Contrato Parcelado (${totalParcelas}x) Lido` : 'Novo Contrato PDF Lido',
      mensagem: totalParcelas > 1 
        ? `Contrato de ${baseCliente} lido com sucesso. Geradas ${totalParcelas} parcelas de comissão com vencimentos mensais.`
        : `Contrato de ${baseCliente} lido com sucesso. Comissão de R$ ${(firstRec.valorComissao || 0).toLocaleString('pt-BR')} preenchida.`,
      tipo: 'sucesso',
      data: 'Agora',
      lida: false
    };

    setNotifications(prev => [newNotif, ...prev]);

    // Open prefilled modal so user can review the first installment
    setSelectedRecord(firstRec);
    setIsRecordModalOpen(true);

    // Automatically trigger email dispatch and download Excel
    try {
      const emailRes = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: emailSettings.userEmail,
          subject: `📊 [MBS] Contrato ${totalParcelas > 1 ? `Parcelado em ${totalParcelas}x` : ''} Lido: ${baseCliente}`,
          records: updatedRecords,
          newRecord: firstRec
        })
      });

      const emailData = await emailRes.json();
      if (emailData.attachmentBase64) {
        // Trigger direct browser download of the updated Excel file
        const byteCharacters = atob(emailData.attachmentBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = emailData.attachmentName || `Planilha_Comissoes_${baseCliente}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      showToast(
        totalParcelas > 1 
          ? `Contrato lido! Geradas ${totalParcelas} parcelas na planilha e arquivo Excel baixado.`
          : `Contrato lido com sucesso! Planilha Excel baixada e notificação enviada para ${emailSettings.userEmail}.`, 
        'success'
      );
    } catch (err) {
      console.error("Erro ao processar envio de e-mail/excel:", err);
      showToast(totalParcelas > 1 ? `${totalParcelas} parcelas geradas na planilha!` : 'Novo contrato lido e preenchido!', 'success');
    }

    // Always feed into Google Sheets on every contract inclusion
    handleSyncToSheets(updatedRecords).catch(e => console.warn('Sync Google Sheets notice:', e));
  };

  const handleUpdateRecord = (updatedRecord: CommissionRecord, propagate: boolean = true) => {
    let updatedList = records.map(r => r.id === updatedRecord.id ? updatedRecord : r);
    if (propagate && updatedRecord.atleta && updatedRecord.atleta !== '-') {
      const { updatedRecords } = propagateAthleteInfoToAllRecords(updatedRecord, updatedList);
      updatedList = updatedRecords;
    }
    setRecords(updatedList);
    saveRecordToFirestore(updatedRecord).catch(err => console.warn('Firestore single record update sync:', err));
    saveBatchRecordsToFirestore(updatedList).catch(err => console.warn('Firestore update sync:', err));
    showToast(`Comissão de ${updatedRecord.clienteNome || updatedRecord.clube || updatedRecord.atleta} atualizada.`);
    if (sheetSettings.spreadsheetId) {
      handleSyncToSheets(updatedList).catch(e => console.warn('Sync notice:', e));
    }
  };

  const handleDeleteRecord = (id: string) => {
    const target = records.find(r => r.id === id);
    if (target) {
      setRecordToDelete(target);
    }
  };

  const executeDeleteRecord = () => {
    if (!recordToDelete) return;
    const targetId = recordToDelete.id;
    const targetName = recordToDelete.clienteNome || recordToDelete.clube || 'Comissão';
    const updatedList = records.filter(r => r.id !== targetId);
    setRecords(updatedList);
    deleteRecordFromFirestore(targetId).catch(err => console.warn('Firestore delete sync:', err));
    setRecordToDelete(null);
    setIsRecordModalOpen(false);
    showToast(`Comissão (${targetName}) excluída com sucesso!`, 'info');
    if (sheetSettings.spreadsheetId) {
      handleSyncToSheets(updatedList).catch(e => console.warn('Sync delete notice:', e));
    }
  };

  const handleSaveRecordModal = (recordToSave: CommissionRecord, propagateToAllMonths: boolean = true) => {
    const exists = records.some(r => r.id === recordToSave.id);
    let updatedList: CommissionRecord[];
    if (exists) {
      updatedList = records.map(r => r.id === recordToSave.id ? recordToSave : r);
    } else {
      updatedList = [recordToSave, ...records];
    }

    if (propagateToAllMonths && recordToSave.atleta && recordToSave.atleta !== '-') {
      const { updatedRecords, updatedCount } = propagateAthleteInfoToAllRecords(recordToSave, updatedList);
      updatedList = updatedRecords;
      showToast(`✨ Dados atribuídos a ${updatedCount} parcela(s)/mês(es) do atleta ${recordToSave.atleta}!`, 'success');
    } else {
      showToast(exists ? 'Registro atualizado na planilha.' : 'Novo registro adicionado à planilha.');
    }

    setRecords(updatedList);
    saveBatchRecordsToFirestore(updatedList).catch(err => console.warn('Firestore modal save sync:', err));
    if (sheetSettings.spreadsheetId) {
      handleSyncToSheets(updatedList).catch(e => console.warn('Sync modal notice:', e));
    }
  };

  const handleDuplicateRecord = (recordToDuplicate: CommissionRecord) => {
    setIsRecordModalOpen(false);
    setDuplicateRecordTarget(recordToDuplicate);
    setIsDuplicateModalOpen(true);
  };

  const handleConfirmDuplicateOptions = (options: DuplicateOptions) => {
    if (!duplicateRecordTarget) return;

    let targetInstallments: CommissionRecord[] = [];
    if (options.duplicateAllInstallments && duplicateRecordTarget.numeroContrato) {
      const matching = records.filter(r => 
        (r.numeroContrato && r.numeroContrato === duplicateRecordTarget.numeroContrato) ||
        (r.atleta && r.atleta === duplicateRecordTarget.atleta && r.totalParcelas === duplicateRecordTarget.totalParcelas && r.totalParcelas && r.totalParcelas > 1)
      );
      targetInstallments = matching.length > 0 ? matching : [duplicateRecordTarget];
    } else {
      targetInstallments = [duplicateRecordTarget];
    }

    const suffix = options.contractSuffix || '-B';

    const newDuplicatedRecords: CommissionRecord[] = targetInstallments.map((item, index) => {
      const newId = `rec-${Date.now()}-${index}-${Math.floor(Math.random() * 10000)}`;
      
      let calculatedValue = item.valorComissao;
      if (options.valueMode === 'split50') {
        calculatedValue = item.valorComissao / 2;
      } else if (options.valueMode === 'custom') {
        calculatedValue = options.customValue || item.valorComissao;
      }

      const baseContract = item.numeroContrato || 'CT-2026/001';
      const newContractNum = baseContract.includes(suffix) ? baseContract : `${baseContract}${suffix}`;

      const newAgentesList = options.newAgentes.length > 0 ? options.newAgentes : (item.captadores || item.agentes || []);

      return {
        ...item,
        id: newId,
        numeroContrato: newContractNum,
        tipoContrato: options.newTipoContrato || item.tipoContrato || 'Intermediação Comercial',
        clienteNome: options.newClienteNome || item.clienteNome,
        clube: options.newClube || item.clube || options.newClienteNome || item.clienteNome,
        captadores: newAgentesList,
        agentes: newAgentesList,
        valorComissao: calculatedValue,
        observacoes: item.observacoes 
          ? `${item.observacoes} (Duplicado - ${options.newTipoContrato})`
          : `Duplicado - ${options.newTipoContrato}`,
        criadoEm: new Date().toISOString()
      };
    });

    const updatedList = deduplicateRecords([...newDuplicatedRecords, ...records]);
    setRecords(updatedList);
    saveBatchRecordsToFirestore(newDuplicatedRecords).catch(err => console.warn('Firestore duplicate batch sync:', err));

    if (sheetSettings.spreadsheetId) {
      handleSyncToSheets(updatedList).catch(e => console.warn('Sync duplicate batch notice:', e));
    }

    showToast(`✨ ${newDuplicatedRecords.length} comissão(ões) duplicada(s) com sucesso para ${options.newTipoContrato}!`, 'success');
    setIsDuplicateModalOpen(false);
    setDuplicateRecordTarget(null);
  };

  const handleOpenEditRecord = (record: CommissionRecord) => {
    setSelectedRecord(record);
    setIsRecordModalOpen(true);
  };

  const handleOpenAddRecord = () => {
    setSelectedRecord(null);
    setIsRecordModalOpen(true);
  };

  const unreadNotifCount = notifications.filter(n => !n.lida).length;

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 flex flex-col font-sans">
      {/* Top Bar Header */}
      <Header
        notifications={notifications}
        emailSettings={emailSettings}
        onOpenEmailModal={() => setIsEmailModalOpen(true)}
        onOpenSheetsModal={() => setIsSheetsModalOpen(true)}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        unreadCount={unreadNotifCount}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Main App Division Navigation Tabs */}
        <div className="flex items-center space-x-2 sm:space-x-3 border-b-4 border-zinc-900 mb-6 pb-3 overflow-x-auto">
          <button
            onClick={() => setMainAppTab('inclusao')}
            className={`inline-flex items-center space-x-2 px-4 sm:px-6 py-3 font-black uppercase text-xs sm:text-sm tracking-wider border-3 border-zinc-900 transition cursor-pointer whitespace-nowrap ${
              mainAppTab === 'inclusao'
                ? 'bg-amber-400 text-zinc-950 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] translate-y-[-2px]'
                : 'bg-white hover:bg-zinc-200 text-zinc-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-zinc-950 flex-shrink-0" />
            <span>Inclusão (PDF) & Planilha</span>
          </button>

          <button
            onClick={() => setMainAppTab('dashboard')}
            className={`inline-flex items-center space-x-2 px-4 sm:px-6 py-3 font-black uppercase text-xs sm:text-sm tracking-wider border-3 border-zinc-900 transition cursor-pointer whitespace-nowrap ${
              mainAppTab === 'dashboard'
                ? 'bg-amber-400 text-zinc-950 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] translate-y-[-2px]'
                : 'bg-white hover:bg-zinc-200 text-zinc-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 text-zinc-950 flex-shrink-0" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setMainAppTab('sincronizacao')}
            className={`inline-flex items-center space-x-2 px-4 sm:px-6 py-3 font-black uppercase text-xs sm:text-sm tracking-wider border-3 border-zinc-900 transition cursor-pointer whitespace-nowrap ${
              mainAppTab === 'sincronizacao'
                ? 'bg-emerald-400 text-zinc-950 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] translate-y-[-2px]'
                : 'bg-white hover:bg-zinc-200 text-zinc-700 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
            }`}
          >
            <RefreshCw className="w-4 h-4 text-zinc-950 flex-shrink-0" />
            <span>Sincronização</span>
          </button>
        </div>

        {mainAppTab === 'inclusao' && (
          <div className="space-y-6">
            {/* Contract PDF Uploader with Gemini AI */}
            <ContractUploader
              onContractExtracted={handleContractExtracted}
              isProcessing={false}
              userEmail={emailSettings.userEmail}
            />

            {/* Spreadsheet Table */}
            <SpreadsheetTable
              records={records}
              selectedYear={selectedYear}
              activeTab={dashboardTab}
              onTabChange={setDashboardTab}
              onUpdateRecord={handleUpdateRecord}
              onDeleteRecord={handleDeleteRecord}
              onDuplicateRecord={handleDuplicateRecord}
              onAddNewRecord={handleOpenAddRecord}
              onOpenEmailModal={() => setIsEmailModalOpen(true)}
              onViewRecordDetail={handleOpenEditRecord}
              onDeduplicateRecords={handleDeduplicateRecords}
              onSeparateAtletas={handleSeparateAtletas}
            />
          </div>
        )}

        {mainAppTab === 'dashboard' && (
          <DashboardView
            records={records}
            selectedYear={selectedYear}
            onSelectYear={setSelectedYear}
            availableYears={availableYears}
            onOpenRecordDetail={handleOpenEditRecord}
            onNavigateToTable={handleNavigateToTable}
          />
        )}

        {mainAppTab === 'sincronizacao' && (
          <SyncView
            records={records}
            sheetSettings={sheetSettings}
            onSaveSettings={setSheetSettings}
            onSyncToSheets={handleSyncToSheets}
            onImportFromSheets={handleImportFromSheets}
            isSyncing={isSheetsSyncing}
            onDeduplicateRecords={handleDeduplicateRecords}
            onSeparateAtletas={handleSeparateAtletas}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t-4 border-zinc-900 py-5 text-center text-xs font-bold uppercase tracking-wider text-zinc-900">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-zinc-900" />
            <span className="font-black text-zinc-900">Márcio Bittencourt Sports</span>
            <span>• Leitura de PDF com IA Gemini & Sincronização Google Sheets</span>
          </div>
          <div>
            Link Planilha: <a href={sheetSettings.spreadsheetUrl} target="_blank" rel="noreferrer" className="text-zinc-950 font-black underline hover:text-emerald-600">Abrir no Google Sheets ↗</a>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <EmailModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        emailSettings={emailSettings}
        onUpdateSettings={setEmailSettings}
        records={records}
      />

      <GoogleSheetsModal
        isOpen={isSheetsModalOpen}
        onClose={() => setIsSheetsModalOpen(false)}
        records={records}
        sheetSettings={sheetSettings}
        onSaveSettings={setSheetSettings}
        onSyncToSheets={handleSyncToSheets}
        onImportFromSheets={handleImportFromSheets}
        isSyncing={isSheetsSyncing}
      />

      <NotificationCenter
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onMarkAllAsRead={() => setNotifications(notifications.map(n => ({ ...n, lida: true })))}
      />

      <RecordModal
        isOpen={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
        record={selectedRecord}
        allRecords={records}
        onSave={handleSaveRecordModal}
        onDelete={handleDeleteRecord}
        onDuplicate={handleDuplicateRecord}
      />

      <DuplicateModal
        isOpen={isDuplicateModalOpen}
        record={duplicateRecordTarget}
        allRecords={records}
        onClose={() => setIsDuplicateModalOpen(false)}
        onConfirm={handleConfirmDuplicateOptions}
      />

      {/* Confirmation Modal for Deletion */}
      {recordToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-zinc-900 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md w-full p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-2 bg-rose-100 border-2 border-zinc-900">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-lg font-black uppercase text-zinc-900">Excluir Comissão</h3>
            </div>
            
            <div className="space-y-2 text-xs font-bold text-zinc-800">
              <p>
                Tem certeza que deseja excluir esta comissão da planilha?
              </p>
              <div className="p-3 bg-zinc-100 border-2 border-zinc-900 font-mono text-[11px] space-y-1">
                <div><strong>Clube / Cliente:</strong> {recordToDelete.clube || recordToDelete.clienteNome}</div>
                <div><strong>Atleta:</strong> {recordToDelete.atleta || '-'}</div>
                <div><strong>Valor MMB:</strong> R$ {(recordToDelete.valorComissao || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                <div><strong>Parcela:</strong> {recordToDelete.parcelaAtual || 1}/{recordToDelete.totalParcelas || 1}</div>
              </div>
              <p className="text-[11px] text-zinc-500 italic">
                * Esta ação atualizará imediatamente a tabela local e o Google Sheets conectado.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t-2 border-zinc-900">
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                className="px-4 py-2 border-2 border-zinc-900 bg-zinc-200 hover:bg-zinc-300 text-zinc-900 text-xs font-black uppercase tracking-wider transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeDeleteRecord}
                className="inline-flex items-center space-x-1.5 px-4 py-2 border-2 border-zinc-900 bg-rose-500 hover:bg-rose-600 text-white text-xs font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition active:translate-x-0.5 active:translate-y-0.5"
              >
                <Trash2 className="w-4 h-4 text-white" />
                <span>Sim, Excluir</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center space-x-2 px-4 py-3 bg-zinc-900 text-white border-2 border-zinc-900 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-xs font-black uppercase tracking-wider">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
