export type StatusNF = 'Pendente' | 'Emitida' | 'Não emitida' | 'Não autorizada' | 'Cancelada';
export type StatusPagamento = 'Aguardando' | 'Pago' | 'Atrasado';

export interface InstallmentInfo {
  numeroParcela: number;
  valorParcela: number;
  dataVencimento: string; // YYYY-MM-DD
  descricao?: string;
}

export interface CommissionRecord {
  id: string;
  numeroContrato: string;
  clienteNome: string; // Razão Social / Cliente
  clube?: string; // Clube (ex: CR Flamengo, SE Palmeiras)
  atleta?: string; // Atleta (ex: Gabriel Barbosa)
  tipoContrato?: string; // Tipo de contrato (ex: Renovação, Empréstimo, Transferência, Representação)
  clienteCnpjCpf: string;
  servicoDescricao: string;
  valorBaseContrato: number;
  percentualComissao: number;
  valorComissao: number; // VALOR MMB
  dataVencimentoNF: string; // DATA (YYYY-MM-DD)
  dataContrato?: string; // Data do contrato (YYYY-MM-DD)
  statusNF: StatusNF;
  dataEmissaoNF?: string; // YYYY-MM-DD
  numeroNF?: string; // NF
  statusPagamento: StatusPagamento;
  pagoOuNao?: string; // PAGO OU NÃO ('Pago' | 'Não pago' | 'Pendente')
  dataPagamento?: string; // Pagamento (YYYY-MM-DD)
  observacoes: string; // OBS
  criadoEm: string;
  pdfNomeArquivo?: string;
  // Agentes envolvidos na comissão (múltiplos)
  captadores?: string[];
  agentes?: string[];
  // Parcelamento
  parcelaAtual?: number;
  totalParcelas?: number;
}

export interface ContractAnalysisResult {
  numeroContrato: string;
  clienteNome: string;
  clube?: string;
  atleta?: string;
  tipoContrato?: string;
  dataContrato?: string;
  clienteCnpjCpf: string;
  servicoDescricao: string;
  valorBaseContrato: number;
  percentualComissao: number;
  valorComissao: number; // VALOR MMB
  dataVencimentoNF: string; // DATA
  numeroNF?: string; // NF
  observacoes: string; // OBS
  captadores?: string[];
  agentes?: string[];
  // Parcelamento extraído do PDF
  eParcelado?: boolean;
  numeroParcelas?: number;
  parcelas?: InstallmentInfo[];
}

export interface AppNotification {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: 'alerta' | 'sucesso' | 'info' | 'vencimento';
  data: string;
  lida: boolean;
  recordId?: string;
}

export interface EmailSettings {
  userEmail: string; // Recipient email(s) default or single
  senderEmail?: string; // gustavo@marciobittencourt.com.br
  recipientEmails?: string; // marcio@marciobittencourt.com.br, gustavo@marciobittencourt.com.br
  enableMonthlyCron?: boolean; // Disparo automático todo dia 1º
  autoSendOnUpload: boolean;
  notifyOnDueDates: boolean;
  daysBeforeNotification: number;
  smtpConfigured: boolean;
  lastMonthlySentAt?: string;
}

export interface GoogleSheetSettings {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetName: string;
  autoSyncOnUpload: boolean;
  lastSyncedAt?: string;
  isConnected: boolean;
  webAppUrl?: string;
  accessToken?: string;
}
