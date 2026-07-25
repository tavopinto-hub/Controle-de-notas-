import express from "express";
import path from "path";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import * as XLSX from "xlsx";
import { google } from "googleapis";
import nodemailer from "nodemailer";
import cron from "node-cron";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));

// Initialize Gemini Client safely
function getGeminiClient(req?: express.Request): GoogleGenAI | null {
  const customKey = (req?.headers?.["x-gemini-api-key"] as string) || req?.body?.customApiKey;
  const apiKey = customKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ GEMINI_API_KEY não definida no ambiente nem no cabeçalho x-gemini-api-key.");
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", geminiAvailable: !!process.env.GEMINI_API_KEY });
});

// Helper: Get Sheets API instance with provided access token
function getSheetsClient(accessToken?: string) {
  if (!accessToken) return null;
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.sheets({ version: "v4", auth });
}

// Helper to normalize any date string into standard ISO YYYY-MM-DD
function normalizeToIsoDate(dateStr: any): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const trimmed = dateStr.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // DD/MM/YYYY
  const brMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (brMatch) {
    const d = brMatch[1].padStart(2, '0');
    const m = brMatch[2].padStart(2, '0');
    const y = brMatch[3];
    return `${y}-${m}-${d}`;
  }

  // YYYY/MM/DD
  const isoSlashMatch = trimmed.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (isoSlashMatch) {
    const y = isoSlashMatch[1];
    const m = isoSlashMatch[2].padStart(2, '0');
    const d = isoSlashMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD-MM-YYYY
  const brDashMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (brDashMatch) {
    const d = brDashMatch[1].padStart(2, '0');
    const m = brDashMatch[2].padStart(2, '0');
    const y = brDashMatch[3];
    return `${y}-${m}-${d}`;
  }

  // Text date like "20 de Janeiro de 2026" or "15/02/2026"
  const monthsMap: Record<string, string> = {
    jan: '01', janeiro: '01', fev: '02', fevereiro: '02', mar: '03', marco: '03', março: '03',
    abr: '04', abril: '04', mai: '05', maio: '05', jun: '06', junho: '06', jul: '07', julho: '07',
    ago: '08', agosto: '08', set: '09', setembro: '09', out: '10', outubro: '10', nov: '11', novembro: '11', dez: '12', dezembro: '12'
  };

  const textMatch = trimmed.match(/(\d{1,2})\s+(?:de\s+)?([a-zçáéíóú]+)\s+(?:de\s+)?(\d{4})/i);
  if (textMatch) {
    const day = textMatch[1].padStart(2, '0');
    const monthText = textMatch[2].toLowerCase();
    const year = textMatch[3];
    const monthNum = monthsMap[monthText];
    if (monthNum) {
      return `${year}-${monthNum}-${day}`;
    }
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return '';
}

// Endpoint: Analyze PDF Contract using Gemini AI & pdf-parse fallback
app.post("/api/contracts/analyze", (req, res, next) => {
  upload.single("pdfFile")(req, res, (err) => {
    if (err) {
      console.error("Erro de upload no multer ao receber PDF:", err);
      return res.status(400).json({
        error: `Erro ao carregar o PDF: ${err.message || 'Tamanho limite de 15MB excedido.'}`
      });
    }
    next();
  });
}, async (req: express.Request, res: express.Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "Nenhum arquivo PDF foi enviado." });
    }

    // 1. Extract raw text from PDF using pdf-parse safely
    let pdfText = "";
    try {
      const parseFunc = typeof pdfParse === "function" ? pdfParse : (pdfParse?.default || pdfParse?.PDFParse);
      if (typeof parseFunc === "function") {
        const pdfData = await parseFunc(file.buffer);
        pdfText = pdfData?.text ? pdfData.text.trim() : "";
      }
      console.log(`\n==================== [PDF ANALYZE ENDPOINT] ====================`);
      console.log(`[PDF EXTRACTION] PDF parse extraiu ${pdfText.length} caracteres do arquivo "${file.originalname}" (${file.size} bytes)`);
      console.log(`--- [1. TEXTO BRUTO EXTRAÍDO VIA PDF-PARSE (Amostra)] ---`);
      if (pdfText) {
        console.log(pdfText.length > 5000 ? `${pdfText.substring(0, 5000)}\n... [restante do texto truncado no log: total ${pdfText.length} chars]` : pdfText);
      } else {
        console.log("(Nenhum texto foi extraído pelo pdf-parse - PDF pode ser baseado em imagem ou protegido)");
      }
      console.log(`----------------------------------------------------------------`);
    } catch (pdfErr) {
      console.warn("[PDF EXTRACTION] Aviso ao extrair texto do PDF com pdf-parse:", pdfErr);
    }

    const base64Pdf = file.buffer.toString("base64");
    const mimeType = "application/pdf";

    let extractedData: any = null;

    // 2. Gemini AI analysis with custom key header support & multimodal inlineData PDF
    const ai = getGeminiClient(req);
    if (ai) {
      const prompt = `Você é um analista especialista em auditoria e análise de contratos de futebol e intermediação esportiva da MMB Sports.
Analise com ATENÇÃO TOTAL todas as páginas do documento PDF fornecido em anexo e extraia as informações EXATAMENTE como constam no contrato.

${pdfText && pdfText.length > 50 ? `TEXTO EXTRAÍDO DO PDF PARA CONFERÊNCIA:\n"""\n${pdfText.substring(0, 20000)}\n"""\n` : ''}

REGRAS RÍGIDAS DE PREENCHIMENTO DOS 6 CAMPOS PRINCIPAIS:

1. CLUBE ("clube"):
   - Nome oficial do Clube de Futebol ou Agremiação Esportiva participante, contratante ou objeto da intermediação (Ex: CR Flamengo, SE Palmeiras, São Paulo FC, Fluminense, Santos FC, Grêmio, Athletico Paranaense, Chelsea FC, etc.).
   - Se o documento trouxer o nome do atleta colado ao clube (ex: "Flamengo - Gabigol"), coloque AQUI APENAS "CR Flamengo".
   - NUNCA inclua o nome do atleta neste campo.

2. ATLETA ("atleta"):
   - Nome completo ou nome profissional do Atleta / Jogador de Futebol mencionado no contrato (Ex: Gabriel Barbosa, Eduardo Pereira Rodrigues (Dudu), Jhon Arias, etc.).
   - NUNCA coloque o nome do clube ou empresa no campo do atleta.
   - Se o contrato for institucional sem atleta específico, coloque "Geral".

3. VALOR DA COMISSÃO ("valorComissao") E DO CONTRATO ("valorBaseContrato", "percentualComissao"):
   - "valorComissao": VALOR TOTAL GLOBAL DA COMISSÃO devida em R$ (número decimal puro, ex: 150000.00). 
     * ATENÇÃO CRÍTICA: Se o contrato especifica que a comissão será paga em parcelas (ex: "3 parcelas de R$ 50.000,00" ou "6x de R$ 25.000,00"), o "valorComissao" É A SOMA TOTAL DE TODAS AS PARCELAS (150000.00). JAMAIS informe apenas o valor de 1 parcela no valorComissao total!
   - "valorBaseContrato": Valor global/bruto do contrato de trabalho, transferência, patrocínio ou transação em R$ (ex: 1500000.00).
   - "percentualComissao": Percentual de comissão acordado (ex: 10.0 para 10%).

4. PARCELAS ("eParcelado", "numeroParcelas", "parcelas"):
   - "eParcelado": boolean (true se houver 2 ou mais parcelas; false se for pagamento único/à vista).
   - "numeroParcelas": Número total de parcelas (ex: 1, 2, 3, 4, 6, 12, 24...).
   - "parcelas": Array com todas as parcelas detalhadas na cláusula de pagamento ou tabela do contrato:
     cada objeto contendo:
     - "numeroParcela": 1, 2, 3...
     - "valorParcela": valor numérico em R$ de CADA parcela (ex: 50000.00)
     - "dataVencimento": data de vencimento da parcela no formato "YYYY-MM-DD"
     - "descricao": descrição (ex: "1ª Parcela", "2ª Parcela")

5. DATA DE INÍCIO DAS NOTAS FISCAIS / VENCIMENTO DA 1ª NF ("dataVencimentoNF"):
   - Data de vencimento ou prazo limite da PRIMEIRA Nota Fiscal / 1ª Parcela no formato "YYYY-MM-DD" (ex: "2026-02-15").
   - Se houver parcelamento, a "dataVencimentoNF" DEVE ser rigorosamente igual à data de vencimento da 1ª parcela.

6. DATA DO CONTRATO ("dataContrato"):
   - Data de celebração, assinatura ou início de vigência do contrato no formato "YYYY-MM-DD" (ex: "2026-01-20").

CAMPOS COMPLEMENTARES:
- "numeroContrato": Identificador do contrato/código (ex: "CT-2026/01" ou número da página de rosto).
- "clienteNome": Nome/Razão Social do Contratante/Pagador (se for o próprio clube, coloque o nome do clube; se for uma empresa/agência pagadora, coloque a razão social da empresa).
- "tipoContrato": Tipo do contrato (ex: "Intermediação de Transferência", "Renovação Contratual", "Representação Esportiva", "Direitos de Imagem", "Patrocínio").
- "clienteCnpjCpf": CNPJ ou CPF do contratante pagador com pontuação se disponível.
- "servicoDescricao": Descrição concisa do serviço ou objeto do contrato.
- "observacoes": Resumo claro das condições e prazos de pagamento estipulados no contrato.`;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          numeroContrato: { type: Type.STRING },
          clienteNome: { type: Type.STRING },
          clube: { type: Type.STRING },
          atleta: { type: Type.STRING },
          tipoContrato: { type: Type.STRING },
          dataContrato: { type: Type.STRING },
          numeroNF: { type: Type.STRING },
          clienteCnpjCpf: { type: Type.STRING },
          servicoDescricao: { type: Type.STRING },
          valorBaseContrato: { type: Type.NUMBER },
          percentualComissao: { type: Type.NUMBER },
          valorComissao: { type: Type.NUMBER },
          dataVencimentoNF: { type: Type.STRING },
          eParcelado: { type: Type.BOOLEAN },
          numeroParcelas: { type: Type.INTEGER },
          parcelas: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                numeroParcela: { type: Type.INTEGER },
                valorParcela: { type: Type.NUMBER },
                dataVencimento: { type: Type.STRING },
                descricao: { type: Type.STRING }
              },
              required: ["numeroParcela", "valorParcela", "dataVencimento"]
            }
          },
          observacoes: { type: Type.STRING },
        },
        required: ["clienteNome", "clube", "atleta", "valorComissao", "dataContrato", "dataVencimentoNF"],
      };

      try {
        console.log(`Analisando contrato PDF (${file.originalname}, ${file.size} bytes) via Gemini 3.6 Flash multimodal...`);
        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: [
            {
              inlineData: {
                mimeType,
                data: base64Pdf,
              },
            },
            {
              text: prompt,
            },
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema,
          },
        });

        if (response.text) {
          console.log(`--- [2. RESPOSTA JSON BRUTA GERADA PELO GEMINI (Antes do Parse)] ---`);
          console.log(response.text);
          console.log(`-------------------------------------------------------------------`);

          extractedData = JSON.parse(response.text);

          console.log(`--- [3. DADOS EXTRAÍDOS E ESTRUTURADOS COM SUCESSO] ---`);
          console.log(JSON.stringify(extractedData, null, 2));
          console.log(`===================================================================\n`);
        } else {
          console.warn("[GEMINI RESPONSE WARNING] A resposta do modelo Gemini veio vazia (sem response.text).");
        }
      } catch (geminiErr) {
        console.warn("Aviso na análise multimodal do PDF com Gemini:", geminiErr);
      }
    }

    // 3. Fallback: Parse PDF text with regex if Gemini was unavailable or yielded empty response
    if (!extractedData || !extractedData.clienteNome) {
      console.log("Executando extração alternativa via regex no texto do PDF...");

      // Regex heuristics for common patterns
      const cnpjMatch = pdfText.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/) || pdfText.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
      const cnpj = cnpjMatch ? cnpjMatch[0] : "";

      const contratoMatch = pdfText.match(/(?:contrato|instrumento|ct|nº|n°)\s*(?:de\s*)?(?:nº|n°)?\s*:?\s*([A-Z0-9\.\-\/]{3,20})/i);
      const numeroContrato = contratoMatch ? contratoMatch[1].trim() : `CT-${file.originalname.replace(/\.pdf$/i, '')}`;

      // Search values R$
      const moneyMatches = pdfText.match(/R\$\s*[\d\.\,]+/gi) || [];
      let parsedValues: number[] = [];
      moneyMatches.forEach(m => {
        const cleaned = m.replace(/R\$\s*/i, '').replace(/\./g, '').replace(',', '.');
        const num = parseFloat(cleaned);
        if (!isNaN(num) && num > 0) parsedValues.push(num);
      });

      const maxVal = parsedValues.length > 0 ? Math.max(...parsedValues) : 10000;
      const minVal = parsedValues.length > 1 ? Math.min(...parsedValues) : maxVal * 0.1;

      // Search percentages %
      const pctMatch = pdfText.match(/(\d+(?:[\.,]\d+)?)\s*%/);
      const percentual = pctMatch ? parseFloat(pctMatch[1].replace(',', '.')) : 10.0;

      // Search dates (DD/MM/YYYY)
      const dateMatch = pdfText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      let dataVencFormatted = new Date().toISOString().split("T")[0];

      if (dateMatch) {
        const [_, dd, mm, yyyy] = dateMatch;
        dataVencFormatted = `${yyyy}-${mm}-${dd}`;
      }

      // Try extract client name from text lines or filename
      const cleanFileName = file.originalname.replace(/\.pdf$/i, '').replace(/_/g, ' ').trim();
      const lines = pdfText.split('\n').map(l => l.trim()).filter(l => l.length > 3);
      let clienteNome = "";
      for (const line of lines) {
        if (/contratante|cliente|empresa|razao social|clube|atleta/i.test(line)) {
          clienteNome = line.replace(/contratante|cliente|razao social|:/gi, '').trim();
          if (clienteNome.length > 3) break;
        }
      }

      if (!clienteNome || clienteNome.length < 3) {
        clienteNome = cleanFileName || "Cliente / Contratante";
      }

      // Regex heuristics for parcelas
      const parcelasMatch = pdfText.match(/(\d+)\s*(?:x|vezes|parcelas|prestações)/i) || pdfText.match(/parcelad[oa]\s*em\s*(\d+)/i);
      const numParcelasRegex = parcelasMatch ? parseInt(parcelasMatch[1], 10) : 1;

      extractedData = {
        numeroContrato,
        clienteNome: clienteNome.substring(0, 80),
        clienteCnpjCpf: cnpj,
        servicoDescricao: "Prestação de Serviços / Comissionamento (Extraído do PDF)",
        valorBaseContrato: maxVal,
        percentualComissao: percentual,
        valorComissao: (maxVal * (percentual / 100)) || minVal,
        dataVencimentoNF: dataVencFormatted,
        eParcelado: numParcelasRegex > 1,
        numeroParcelas: numParcelasRegex,
        observacoes: pdfText.length > 0 
          ? `Texto extraído do PDF (${pdfText.length} caracteres).`
          : "PDF processado com sucesso."
      };
    }

    // 4. Normalize dates strictly to YYYY-MM-DD
    extractedData.dataContrato = normalizeToIsoDate(extractedData.dataContrato);
    extractedData.dataVencimentoNF = normalizeToIsoDate(extractedData.dataVencimentoNF);

    if (Array.isArray(extractedData.parcelas)) {
      extractedData.parcelas = extractedData.parcelas.map((p: any) => ({
        ...p,
        dataVencimento: normalizeToIsoDate(p.dataVencimento)
      }));
    }

    // 5. Normalize defaults & generate parcelas array safely
    if (!extractedData.clienteNome || extractedData.clienteNome.length < 2) {
      extractedData.clienteNome = file.originalname.replace(/\.pdf$/i, '').replace(/_/g, ' ').trim() || "Cliente / Contratante";
    }

    if (!extractedData.valorComissao && extractedData.valorBaseContrato && extractedData.percentualComissao) {
      extractedData.valorComissao = Math.round(((extractedData.valorBaseContrato * extractedData.percentualComissao) / 100) * 100) / 100;
    }

    if (!extractedData.dataVencimentoNF) {
      const defaultDate = new Date();
      defaultDate.setDate(defaultDate.getDate() + 7);
      extractedData.dataVencimentoNF = defaultDate.toISOString().split("T")[0];
    }

    const totalParcelas = extractedData.numeroParcelas || (extractedData.parcelas?.length) || (extractedData.eParcelado ? 2 : 1);
    if (totalParcelas > 1 || extractedData.eParcelado) {
      extractedData.eParcelado = true;
      extractedData.numeroParcelas = Math.min(Math.max(totalParcelas, 1), 120);

      const totalComissao = Math.round((extractedData.valorComissao || 0) * 100) / 100;
      const valorBaseParcela = Math.floor((totalComissao / totalParcelas) * 100) / 100;
      const diffRounding = Math.round((totalComissao - (valorBaseParcela * totalParcelas)) * 100) / 100;

      const existingParcelas = extractedData.parcelas || [];
      
      let [vYear, vMonth, vDay] = (extractedData.dataVencimentoNF || '').split('-').map(Number);
      if (isNaN(vYear) || isNaN(vMonth) || isNaN(vDay)) {
        const now = new Date();
        vYear = now.getFullYear();
        vMonth = now.getMonth() + 1;
        vDay = 10;
      }

      const parcelasGenerated = [];
      for (let i = 1; i <= extractedData.numeroParcelas; i++) {
        const existingP = existingParcelas[i - 1];
        
        let valP = existingP?.valorParcela && existingP.valorParcela > 0 
          ? existingP.valorParcela 
          : (i === extractedData.numeroParcelas ? Math.round((valorBaseParcela + diffRounding) * 100) / 100 : valorBaseParcela);

        let dateStr = normalizeToIsoDate(existingP?.dataVencimento);
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          const dt = new Date(vYear, (vMonth - 1) + (i - 1), vDay || 10);
          const yyyy = dt.getFullYear();
          const mm = String(dt.getMonth() + 1).padStart(2, '0');
          const dd = String(dt.getDate()).padStart(2, '0');
          dateStr = `${yyyy}-${mm}-${dd}`;
        }

        parcelasGenerated.push({
          numeroParcela: i,
          valorParcela: valP,
          dataVencimento: dateStr,
          descricao: existingP?.descricao || `Parcela ${i}/${extractedData.numeroParcelas}`
        });
      }

      extractedData.parcelas = parcelasGenerated;

      // Set dataVencimentoNF to 1st installment date
      if (parcelasGenerated.length > 0 && parcelasGenerated[0].dataVencimento) {
        extractedData.dataVencimentoNF = parcelasGenerated[0].dataVencimento;
      }
    }

    return res.json({
      success: true,
      data: extractedData,
      filename: file.originalname
    });

  } catch (error: any) {
    console.error("Erro geral no endpoint /api/contracts/analyze:", error);
    return res.status(500).json({
      error: "Ocorreu um erro ao processar este PDF.",
      details: error.message || String(error)
    });
  }
});

// Helper: Clean Google App Passwords / SMTP Passwords (strip spaces, quotes, dashes)
function cleanSmtpPassword(rawPass?: string): string {
  if (!rawPass) return '';
  return rawPass.replace(/[\s"'-]/g, '').trim();
}

// In-memory store for email settings and records to support background cron jobs & manual test emails
interface ServerEmailSettings {
  senderEmail: string;
  recipientEmails: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  enableMonthlyCron: boolean;
}

let savedEmailSettings: ServerEmailSettings = {
  senderEmail: process.env.SMTP_USER || process.env.GMAIL_USER || "tavopinto@gmail.com",
  recipientEmails: "marcio@marciobittencourt.com.br, gustavo@marciobittencourt.com.br, tavopinto@gmail.com",
  smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
  smtpPort: parseInt(process.env.SMTP_PORT || "587", 10),
  smtpUser: process.env.SMTP_USER || process.env.GMAIL_USER || "tavopinto@gmail.com",
  smtpPass: cleanSmtpPassword(process.env.SMTP_PASS || process.env.GMAIL_PASS || process.env.SMTP_PASSWORD || ""),
  enableMonthlyCron: true
};

let savedRecordsStore: any[] = [];

// Helper: Separate Athlete from Club on server if glued
function cleanClubeAndAtletaInServer(rawClube?: string, rawAtleta?: string, rawClienteNome?: string) {
  let clubeInput = (rawClube || rawClienteNome || '').trim();
  let atletaInput = (rawAtleta || '').trim();

  if (atletaInput === '-' || atletaInput === 'Pendente' || atletaInput === 'Não informado') {
    atletaInput = '';
  }

  const nonAthleteTerms = [
    's.a.', 'sa', 'ltda', 'eireli', 'me', 'epp', 'sociedade', 'futebol', 'base',
    'intermediação', 'intermediacao', 'renovação', 'renovacao', 'empréstimo', 'emprestimo',
    'transferência', 'transferencia', 'representação', 'representacao', 'assessoria',
    'consultoria', 'comissão', 'comissao', 'direitos', 'imagem', 'parcela', 'contrato', 'saf'
  ];

  const isNonAthlete = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || /^\d+$/.test(trimmed) || trimmed.length < 2) return true;
    const lower = trimmed.toLowerCase();
    return nonAthleteTerms.some(term => lower === term || lower.startsWith(term + ' '));
  };

  let extractedClube = clubeInput;
  let extractedAtleta = atletaInput;

  const parenRegex = /[\(\[\{]([^\)\]\}]+)[\)\]\}]/g;
  let match: RegExpExecArray | null;

  while ((match = parenRegex.exec(clubeInput)) !== null) {
    const inside = match[1].trim();
    if (inside && !isNonAthlete(inside)) {
      extractedAtleta = inside;
      extractedClube = clubeInput.replace(match[0], '').replace(/\s+/g, ' ').trim();
      break;
    }
  }

  if (!extractedAtleta) {
    const separators = [/ \- /, / – /, / \/ /, / \| /, / : /];
    for (const sep of separators) {
      if (sep.test(clubeInput)) {
        const parts = clubeInput.split(sep).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2 && !isNonAthlete(parts[1])) {
          extractedClube = parts[0];
          extractedAtleta = parts.slice(1).join(' - ');
          break;
        }
      }
    }
  }

  extractedClube = extractedClube.replace(/[-–/|:\s]+$/, '').trim();

  return {
    clube: extractedClube || rawClube || rawClienteNome || '-',
    atleta: extractedAtleta || atletaInput || '-'
  };
}

// Endpoint: Save Email Settings & Credentials in Server Memory
app.post("/api/email/save-settings", (req, res) => {
  const { senderEmail, recipientEmails, smtpPass, smtpUser, smtpHost, enableMonthlyCron, records } = req.body;
  if (senderEmail) savedEmailSettings.senderEmail = senderEmail;
  if (recipientEmails) savedEmailSettings.recipientEmails = recipientEmails;
  if (smtpUser) savedEmailSettings.smtpUser = smtpUser;
  if (senderEmail && !smtpUser) savedEmailSettings.smtpUser = senderEmail;
  if (smtpPass !== undefined) savedEmailSettings.smtpPass = cleanSmtpPassword(smtpPass);
  if (smtpHost) savedEmailSettings.smtpHost = smtpHost;
  if (enableMonthlyCron !== undefined) savedEmailSettings.enableMonthlyCron = enableMonthlyCron;
  if (Array.isArray(records) && records.length > 0) savedRecordsStore = records;

  console.log(`[Email Settings Saved] Sender: ${savedEmailSettings.senderEmail}, User: ${savedEmailSettings.smtpUser}, Has Pass: ${!!savedEmailSettings.smtpPass}`);
  return res.json({
    success: true,
    hasSmtpPass: !!savedEmailSettings.smtpPass,
    message: "Configurações de e-mail e credenciais salvas no servidor!"
  });
});

// Endpoint: Get Email Settings Status
app.get("/api/email/settings", (_req, res) => {
  return res.json({
    success: true,
    settings: {
      senderEmail: savedEmailSettings.senderEmail,
      recipientEmails: savedEmailSettings.recipientEmails,
      smtpHost: savedEmailSettings.smtpHost,
      smtpUser: savedEmailSettings.smtpUser,
      enableMonthlyCron: savedEmailSettings.enableMonthlyCron,
      hasSmtpPass: !!savedEmailSettings.smtpPass
    }
  });
});

// Endpoint: Test SMTP Authentication Connection
app.post("/api/email/test-connection", async (req, res) => {
  try {
    const smtpUser = req.body.smtpUser || req.body.senderEmail || savedEmailSettings.smtpUser || savedEmailSettings.senderEmail;
    const rawPass = req.body.smtpPass !== undefined ? req.body.smtpPass : savedEmailSettings.smtpPass;
    const smtpPass = cleanSmtpPassword(rawPass);
    const smtpHost = req.body.smtpHost || savedEmailSettings.smtpHost || "smtp.gmail.com";
    const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);

    if (!smtpPass) {
      return res.status(400).json({
        success: false,
        message: "⚠️ Nenhuma 'Senha de App do Gmail' foi informada. Acesse myaccount.google.com/apppasswords para gerar a senha de 16 letras do Google."
      });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass }
    });

    await transporter.verify();
    return res.json({
      success: true,
      message: `✅ Autenticação SMTP com o Gmail (${smtpUser}) realizada com SUCESSO!`
    });
  } catch (err: any) {
    console.error("[SMTP Verify Error]:", err);
    const errMsg = err?.message || '';
    let userMsg = `❌ Falha na autenticação SMTP: ${errMsg}`;
    if (errMsg.includes('535') || errMsg.includes('Invalid login') || errMsg.includes('Username and Password not accepted')) {
      userMsg = `🔒 Falha de Login no Gmail (Erro 535):\nO Google recusou a senha para (${req.body.smtpUser || req.body.senderEmail || 'seu e-mail'}).\n• Não use sua senha normal do e-mail. Crie uma 'Senha de App' de 16 letras em myaccount.google.com/apppasswords.\n• Verifique se a conta Google onde gerou a senha é exatamente o mesmo e-mail digitado no campo de Remetente.`;
    } else if (errMsg.includes('534-5.7.9') || errMsg.includes('Application-specific password required')) {
      userMsg = `🔒 O Gmail exige 'Senha de App' (Erro 534-5.7.9). Acesse myaccount.google.com/apppasswords e crie uma senha de 16 caracteres.`;
    }
    return res.status(400).json({ success: false, message: userMsg });
  }
});

// Endpoint: Send Email Dispatch / Simulation
app.post("/api/send-email", async (req, res) => {
  try {
    const { userEmail, subject, records, messageText } = req.body;

    const targetUserEmail = userEmail || req.body.recipientEmails || savedEmailSettings.recipientEmails;
    if (!targetUserEmail) {
      return res.status(400).json({ error: "E-mail de destino não informado." });
    }

    const recordsToUse = (Array.isArray(records) && records.length > 0) ? records : savedRecordsStore;

    // Prepare Excel Attachment Buffer matching exact 11 columns
    const dataForSheet = (recordsToUse || []).map((rec: any) => {
      const cleaned = cleanClubeAndAtletaInServer(rec.clube, rec.atleta, rec.clienteNome);
      return {
        'DATA': rec.dataVencimentoNF || '',
        'VALOR MMB': rec.valorComissao || 0,
        'Clube': cleaned.clube,
        'Atleta': cleaned.atleta,
        'Tipo de contrato': rec.tipoContrato || rec.servicoDescricao || 'Intermediação',
        'NF': rec.numeroNF || 'Não emitida',
        'Parcelas': `${rec.parcelaAtual || 1}/${rec.totalParcelas || 1}`,
        'Pagamento': rec.dataPagamento || 'Pendente',
        'PAGO OU NÃO': rec.pagoOuNao || (rec.statusPagamento === 'Pago' ? 'SIM (PAGO)' : 'NÃO'),
        'Data do contrato': rec.dataContrato || '',
        'OBS': rec.observacoes || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataForSheet);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Comissões');
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const base64Excel = excelBuffer.toString('base64');
    const filename = `Controle_Comissoes_NFs_${new Date().toISOString().slice(0,10)}.xlsx`;

    const effectiveSmtpHost = req.body.smtpHost || savedEmailSettings.smtpHost || "smtp.gmail.com";
    const effectiveSmtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
    const effectiveSmtpUser = req.body.smtpUser || req.body.senderEmail || savedEmailSettings.smtpUser || savedEmailSettings.senderEmail;
    const rawPass = req.body.smtpPass !== undefined ? req.body.smtpPass : savedEmailSettings.smtpPass;
    const effectiveSmtpPass = cleanSmtpPassword(rawPass);

    if (!effectiveSmtpPass) {
      return res.json({
        success: false,
        realEmailSent: false,
        message: `⚠️ O e-mail NÃO foi enviado por falta da Senha de App do Gmail. Insira a 'Senha de App de 16 caracteres' em myaccount.google.com/apppasswords para habilitar o envio direto.`,
        attachmentName: filename,
        attachmentBase64: base64Excel
      });
    }

    try {
      const transporter = nodemailer.createTransport({
        host: effectiveSmtpHost,
        port: effectiveSmtpPort,
        secure: effectiveSmtpPort === 465,
        auth: {
          user: effectiveSmtpUser,
          pass: effectiveSmtpPass
        }
      });

      const toList = targetUserEmail.split(',').map((e: string) => e.trim()).filter(Boolean);

      await transporter.sendMail({
        from: `"Márcio Bittencourt Sports" <${effectiveSmtpUser}>`,
        to: toList,
        subject: subject || "📊 [MBS] Planilha de Controle de Comissões e NFs Atualizada",
        text: messageText || `Olá!\n\nSegue em anexo a planilha de comissões e notas fiscais atualizada com os novos contratos cadastrados.\n\nTotal de Registros: ${recordsToUse.length}\n\nAtenciosamente,\nMárcio Bittencourt Sports`,
        attachments: [
          {
            filename,
            content: excelBuffer
          }
        ]
      });

      console.log(`[Nodemailer SUCCESS] E-mail enviado com sucesso via SMTP para ${targetUserEmail}`);
      return res.json({
        success: true,
        realEmailSent: true,
        message: `🚀 E-mail enviado de verdade via Gmail/SMTP (${effectiveSmtpUser}) para ${targetUserEmail}!`,
        dispatchedAt: new Date().toISOString(),
        recipientEmail: targetUserEmail,
        attachmentName: filename,
        attachmentBase64: base64Excel
      });
    } catch (smtpErr: any) {
      console.error("[Nodemailer Error]:", smtpErr);
      const errMsg = smtpErr?.message || '';
      let emailNotice = `❌ Falha no envio por SMTP: ${errMsg}`;
      if (errMsg.includes('535') || errMsg.includes('Invalid login') || errMsg.includes('Username and Password not accepted')) {
        emailNotice = `🔒 Falha de Login no Gmail (Erro 535): O Google recusou a senha para (${effectiveSmtpUser}). Crie uma 'Senha de App' de 16 letras em myaccount.google.com/apppasswords e verifique se o e-mail de remetente é exatamente o mesmo da conta Google onde a senha foi gerada.`;
      } else if (errMsg.includes('534-5.7.9') || errMsg.includes('Application-specific password required')) {
        emailNotice = `🔒 O Gmail exige 'Senha de App' (Erro 534-5.7.9). Acesse myaccount.google.com/apppasswords na sua Conta Google (${effectiveSmtpUser}), crie uma 'Senha de App de 16 caracteres' e cole no modal.`;
      }
      return res.json({
        success: false,
        realEmailSent: false,
        message: emailNotice
      });
    }

  } catch (error: any) {
    console.error("Erro no envio de e-mail:", error);
    return res.status(500).json({
      error: "Erro ao processar o envio de e-mail.",
      details: error.message || String(error)
    });
  }
});

// Core Function: Send Monthly NF Report
async function sendMonthlyReportInternal(options: {
  senderEmail?: string;
  recipientEmails?: string;
  records?: any[];
  month?: number;
  year?: number;
  customSmtpUser?: string;
  customSmtpPass?: string;
  customSmtpHost?: string;
}) {
  const {
    senderEmail = savedEmailSettings.senderEmail || "tavopinto@gmail.com",
    recipientEmails = savedEmailSettings.recipientEmails || "marcio@marciobittencourt.com.br, gustavo@marciobittencourt.com.br, tavopinto@gmail.com",
    records = savedRecordsStore,
    month,
    year,
    customSmtpUser,
    customSmtpPass,
    customSmtpHost
  } = options;

  const now = new Date();
  const targetMonth = month ? parseInt(String(month), 10) : (now.getMonth() + 1);
  const targetYear = year ? parseInt(String(year), 10) : now.getFullYear();

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  const monthName = monthNames[targetMonth - 1] || "Atual";

  const targetMonthStr = targetMonth.toString().padStart(2, '0');
  const recordsToFilter = (Array.isArray(records) && records.length > 0) ? records : savedRecordsStore;

  const finalRecordsToReport = recordsToFilter.filter((rec: any) => {
    const d = rec.dataVencimentoNF || rec.dataContrato;
    if (!d) return false;
    if (d.includes('-')) {
      const parts = d.split('-');
      return parts[1] === targetMonthStr && parts[0] === targetYear.toString();
    }
    if (d.includes('/')) {
      const parts = d.split('/');
      return parts[1] === targetMonthStr && parts[2] === targetYear.toString();
    }
    return false;
  });

  const totalValue = finalRecordsToReport.reduce((acc: number, r: any) => acc + (r.valorComissao || 0), 0);
  const formattedTotal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue);

  const formatDateBr = (d?: string) => {
    if (!d) return '';
    if (d.includes('/')) return d;
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return d;
  };

  const dataForSheet = finalRecordsToReport.map((rec: any) => {
    const cleaned = cleanClubeAndAtletaInServer(rec.clube, rec.atleta, rec.clienteNome);
    return {
      'DATA': formatDateBr(rec.dataVencimentoNF),
      'VALOR MMB': rec.valorComissao || 0,
      'Clube': cleaned.clube,
      'Atleta': cleaned.atleta,
      'Tipo de contrato': rec.tipoContrato || 'Intermediação',
      'NF': rec.numeroNF || 'A EMITIR',
      'Parcelas': `${rec.parcelaAtual || 1}/${rec.totalParcelas || 1}`,
      'Pagamento': rec.dataPagamento || 'Pendente',
      'PAGO OU NÃO': rec.pagoOuNao || (rec.statusPagamento === 'Pago' ? 'SIM (PAGO)' : 'NÃO'),
      'Data do contrato': formatDateBr(rec.dataContrato),
      'OBS': rec.observacoes || ''
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(dataForSheet);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `NFs ${monthName}`);
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  const filename = `Relatorio_NFs_Emitir_${monthName}_${targetYear}.xlsx`;

  let realEmailSent = false;
  let emailNotice = '';

  const effectiveSmtpHost = customSmtpHost || savedEmailSettings.smtpHost || "smtp.gmail.com";
  const effectiveSmtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
  const effectiveSmtpUser = customSmtpUser || senderEmail || savedEmailSettings.smtpUser || savedEmailSettings.senderEmail;
  const rawPass = customSmtpPass !== undefined ? customSmtpPass : savedEmailSettings.smtpPass;
  const effectiveSmtpPass = cleanSmtpPassword(rawPass);

  if (effectiveSmtpHost && effectiveSmtpUser && effectiveSmtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: effectiveSmtpHost,
        port: effectiveSmtpPort,
        secure: effectiveSmtpPort === 465,
        auth: { user: effectiveSmtpUser, pass: effectiveSmtpPass }
      });

      const toList = recipientEmails.split(',').map((e: string) => e.trim()).filter(Boolean);

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #ffffff; border: 3px solid #18181b; padding: 20px;">
          <div style="background: #18181b; color: #ffffff; padding: 15px; font-size: 16px; font-weight: 900; text-transform: uppercase;">
            📊 Relatório do Dia 1º — Notas Fiscais a Emitir em 01/${targetMonthStr}/${targetYear}
          </div>
          <div style="padding: 15px 0;">
            <p style="font-size: 14px; font-weight: bold; color: #18181b;">Olá, Márcio e Gustavo!</p>
            <p style="font-size: 13px; color: #3f3f46;">Segue o relatório automático de Notas Fiscais a serem emitidas referente ao mês de <strong>${monthName} de ${targetYear}</strong>:</p>
            <div style="background: #fef3c7; border: 2px solid #18181b; padding: 12px; margin: 15px 0; font-size: 13px;">
              <strong>• Total de NFs a Emitir no Mês:</strong> ${finalRecordsToReport.length} contrato(s)<br/>
              <strong>• Valor Total em Comissões:</strong> ${formattedTotal}
            </div>
            <p style="font-size: 12px; font-weight: bold; color: #18181b;">A planilha em Excel detalhada está anexada a este e-mail.</p>
          </div>
          <div style="border-top: 2px solid #18181b; padding-top: 10px; font-size: 11px; color: #71717a; font-weight: bold;">
            Márcio Bittencourt Sports — Sistema de Controle Automático de Comissões e NFs
          </div>
        </div>
      `;

      await transporter.sendMail({
        from: `"Gustavo Pinto - MBS" <${effectiveSmtpUser}>`,
        to: toList,
        subject: `📊 [MBS] Relatório de Notas Fiscais a Emitir — 01/${targetMonthStr}/${targetYear} (${finalRecordsToReport.length} NFs - ${formattedTotal})`,
        html: emailHtml,
        attachments: [{ filename, content: excelBuffer }]
      });

      realEmailSent = true;
      emailNotice = `🚀 E-mail enviado com SUCESSO via Gmail/SMTP (${effectiveSmtpUser}) para ${recipientEmails}! (${finalRecordsToReport.length} NFs - ${formattedTotal})`;
      console.log(`[Nodemailer Monthly SUCCESS] Relatório enviado via SMTP para ${recipientEmails}`);
    } catch (smtpErr: any) {
      console.error("[Nodemailer Monthly Error]:", smtpErr);
      const errMsg = smtpErr?.message || '';
      if (errMsg.includes('535') || errMsg.includes('Invalid login') || errMsg.includes('Username and Password not accepted')) {
        emailNotice = `🔒 Falha de Login no Gmail (Erro 535): O Google recusou a senha para (${effectiveSmtpUser}). Crie uma 'Senha de App' de 16 letras em myaccount.google.com/apppasswords e verifique se o e-mail de remetente é exatamente o mesmo da conta Google onde a senha foi gerada.`;
      } else if (errMsg.includes('534-5.7.9') || errMsg.includes('Application-specific password required')) {
        emailNotice = `🔒 Erro no Gmail (534-5.7.9): A 'Senha de App' inserida está incorreta ou expirou. Crie uma nova senha de 16 letras em myaccount.google.com/apppasswords na sua Conta Google (${effectiveSmtpUser}) e cole no campo 'Senha de App do Gmail'.`;
      } else {
        emailNotice = `❌ Falha ao autenticar no servidor SMTP (${errMsg}). Verifique a Senha de App de 16 caracteres.`;
      }
    }
  } else {
    emailNotice = `⚠️ O e-mail NÃO foi enviado: A Senha de App do Gmail de 16 caracteres não foi informada. Acesse myaccount.google.com/apppasswords para gerar a senha e cole no campo abaixo.`;
    console.warn(`[Monthly Email Dispatcher] Nenhuma Senha de App do Gmail configurada.`);
  }

  return {
    success: realEmailSent,
    realEmailSent,
    message: emailNotice,
    itemCount: finalRecordsToReport.length,
    totalValue,
    formattedTotal,
    attachmentName: filename
  };
}

// Endpoint: Send Monthly NF Report (Disparo do Dia 1º do Mês)
app.post("/api/send-monthly-report", async (req, res) => {
  try {
    const {
      senderEmail,
      recipientEmails,
      records,
      month,
      year,
      smtpUser: customSmtpUser,
      smtpPass: customSmtpPass,
      smtpHost: customSmtpHost
    } = req.body;

    if (Array.isArray(records) && records.length > 0) {
      savedRecordsStore = records;
    }

    const result = await sendMonthlyReportInternal({
      senderEmail,
      recipientEmails,
      records,
      month,
      year,
      customSmtpUser,
      customSmtpPass,
      customSmtpHost
    });

    return res.json({
      ...result,
      dispatchedAt: new Date().toISOString()
    });

  } catch (error: any) {
    console.error("Erro no envio do relatório mensal:", error);
    return res.status(500).json({
      error: "Erro ao gerar ou enviar o relatório mensal de NFs.",
      details: error.message || String(error)
    });
  }
});

// Cron Job: Runs automatically every 1st day of the month at 08:00 AM
cron.schedule("0 8 1 * *", async () => {
  console.log("⏰ [CRON AUTOMÁTICO - DIA 01 DO MÊS] Iniciando disparo automático do relatório mensal de NFs...");
  if (!savedEmailSettings.enableMonthlyCron) {
    console.log("[Cron Skip] Disparo automático desativado nas configurações.");
    return;
  }
  const result = await sendMonthlyReportInternal({});
  console.log(`[Cron Result Dia 01]: ${result.message}`);
});

// Endpoint: Sync all records to Google Sheets (preserves header if present, updates item rows)
app.post("/api/sheets/sync", async (req, res) => {
  try {
    const { spreadsheetId, records, accessToken, sheetName = "Página1", webAppUrl } = req.body;

    const formatDateBr = (d?: string) => {
      if (!d) return '';
      if (d.includes('/')) return d;
      const parts = d.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return d;
    };

    const headers = [
      "DATA",
      "VALOR MMB",
      "Clube",
      "Atleta",
      "Tipo de contrato",
      "NF",
      "Parcelas",
      "Pagamento",
      "PAGO OU NÃO",
      "Data do contrato",
      "OBS"
    ];

    const itemRows = (records || []).map((rec: any) => [
      formatDateBr(rec.dataVencimentoNF),
      rec.valorComissao || 0,
      rec.clube || rec.clienteNome || '-',
      rec.atleta || '-',
      rec.tipoContrato || rec.servicoDescricao || 'Intermediação',
      rec.numeroNF || 'Não emitida',
      `${rec.parcelaAtual || 1}/${rec.totalParcelas || 1}`,
      rec.dataPagamento ? formatDateBr(rec.dataPagamento) : 'Pendente',
      rec.pagoOuNao || (rec.statusPagamento === 'Pago' ? 'SIM (PAGO)' : 'NÃO'),
      formatDateBr(rec.dataContrato || rec.criadoEm?.split('T')[0]),
      rec.observacoes || ''
    ]);

    // 1. Try Google Apps Script WebApp direct execution if configured
    if (webAppUrl && webAppUrl.startsWith("http")) {
      try {
        console.log(`[Google Sheets] Sincronizando via Google Apps Script WebApp: ${webAppUrl}`);
        const appRes = await fetch(webAppUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "sync",
            spreadsheetId,
            sheetName,
            headers,
            records,
            rows: itemRows
          })
        });
        if (appRes.ok) {
          const appData = await appRes.json().catch(() => ({ success: true }));
          return res.json({
            success: true,
            message: `Sincronizado com sucesso na planilha via Google Apps Script! (${itemRows.length} registros)`,
            updatedRows: itemRows.length,
            spreadsheetId
          });
        }
      } catch (scriptErr) {
        console.warn("[Google Sheets Apps Script Warning]:", scriptErr);
      }
    }

    // 2. Try Google Sheets API v4 with OAuth token
    if (accessToken) {
      const sheets = getSheetsClient(accessToken);
      if (sheets && spreadsheetId) {
        let hasHeader = false;
        try {
          const getHead = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: "A1:K1"
          });
          if (getHead.data.values && getHead.data.values.length > 0 && getHead.data.values[0].length > 0) {
            hasHeader = true;
          }
        } catch (e) {
          hasHeader = false;
        }

        let valuesToWrite;
        let startCell = "A1";

        if (hasHeader) {
          try {
            await sheets.spreadsheets.values.clear({
              spreadsheetId,
              range: "A2:K1000"
            });
          } catch (e) {
            // ignore clear error
          }
          valuesToWrite = itemRows;
          startCell = "A2";
        } else {
          valuesToWrite = [headers, ...itemRows];
          startCell = "A1";
        }

        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: startCell,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: valuesToWrite }
        });

        return res.json({
          success: true,
          message: `Sincronizado com sucesso na planilha via Google Sheets API! (${itemRows.length} registros)`,
          updatedRows: itemRows.length,
          spreadsheetId
        });
      }
    }

    // 3. Fallback: acknowledge and save state locally
    return res.json({
      success: true,
      syncedLocally: true,
      message: `Inclusão registrada no sistema (${itemRows.length} comissão/ões). Conecte com o Google no modal para envio automático à nuvem.`,
      updatedRows: itemRows.length
    });

  } catch (error: any) {
    console.error("Erro ao sincronizar com o Google Sheets:", error);
    return res.status(500).json({
      error: "Erro ao comunicar com o Google Sheets.",
      details: error.message || String(error)
    });
  }
});

// Endpoint: Append single or list of records to Google Sheets (only creates item rows)
app.post("/api/sheets/append", async (req, res) => {
  try {
    const { spreadsheetId, record, records, accessToken } = req.body;
    if (!spreadsheetId) {
      return res.status(400).json({ error: "spreadsheetId não informado." });
    }

    const sheets = getSheetsClient(accessToken);
    if (!sheets) {
      return res.status(401).json({ error: "Token de acesso do Google (OAuth) não fornecido." });
    }

    const itemsToAppend = record ? [record] : (records || []);
    if (itemsToAppend.length === 0) {
      return res.status(400).json({ error: "Nenhum registro para adicionar." });
    }

    // Check if sheet has headers first
    let hasHeader = false;
    try {
      const getHead = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "A1:K1"
      });
      if (getHead.data.values && getHead.data.values.length > 0 && getHead.data.values[0].length > 0) {
        hasHeader = true;
      }
    } catch (e) {
      hasHeader = false;
    }

    const headers = [
      "DATA",
      "VALOR MMB",
      "Clube",
      "Atleta",
      "Tipo de contrato",
      "NF",
      "Parcelas",
      "Pagamento",
      "PAGO OU NÃO",
      "Data do contrato",
      "OBS"
    ];

    const formatDateBr = (d?: string) => {
      if (!d) return '';
      if (d.includes('/')) return d;
      const parts = d.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return d;
    };

    const rows = itemsToAppend.map((rec: any) => [
      formatDateBr(rec.dataVencimentoNF),
      rec.valorComissao || 0,
      rec.clube || rec.clienteNome || '-',
      rec.atleta || '-',
      rec.tipoContrato || rec.servicoDescricao || 'Intermediação',
      rec.numeroNF || 'Não emitida',
      `${rec.parcelaAtual || 1}/${rec.totalParcelas || 1}`,
      rec.dataPagamento ? formatDateBr(rec.dataPagamento) : 'Pendente',
      rec.pagoOuNao || (rec.statusPagamento === 'Pago' ? 'SIM (PAGO)' : 'NÃO'),
      formatDateBr(rec.dataContrato || rec.criadoEm?.split('T')[0]),
      rec.observacoes || ''
    ]);

    const finalValues = !hasHeader ? [headers, ...rows] : rows;

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `A:K`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: finalValues }
    });

    return res.json({
      success: true,
      message: `${rows.length} novo(s) item(ns) criado(s) nas colunas da planilha com sucesso!`,
      appendedCount: rows.length
    });

  } catch (error: any) {
    console.error("Erro ao anexar linha no Google Sheets:", error);
    return res.status(500).json({
      error: "Erro ao adicionar dados na planilha do Google Sheets.",
      details: error.message || String(error)
    });
  }
});

// Endpoint: Read rows from Google Sheet
app.post("/api/sheets/read", async (req, res) => {
  try {
    const { spreadsheetId, accessToken } = req.body;
    if (!spreadsheetId) {
      return res.status(400).json({ error: "spreadsheetId não informado." });
    }

    const parsePtBrNumber = (val: any): number => {
      if (typeof val === "number") return isNaN(val) ? 0 : val;
      if (!val) return 0;
      const str = String(val).replace(/[R$\s%]/g, "").trim();
      if (!str) return 0;
      if (str.includes(",") && str.includes(".")) {
        return parseFloat(str.replace(/\./g, "").replace(",", ".")) || 0;
      }
      if (str.includes(",")) {
        return parseFloat(str.replace(",", ".")) || 0;
      }
      return parseFloat(str) || 0;
    };

    const parsePtBrDate = (dateStr: any): string => {
      if (!dateStr || typeof dateStr !== "string") return new Date().toISOString().split("T")[0];
      const str = dateStr.trim();
      const parts = str.split("/");
      if (parts.length === 3) {
        let [day, month, year] = parts;
        if (year.length === 2) year = "20" + year;
        if (day.length === 1) day = "0" + day;
        if (month.length === 1) month = "0" + month;
        if (year.length === 4) return `${year}-${month}-${day}`;
      }
      if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;
      return new Date().toISOString().split("T")[0];
    };

    let records: any[] = [];

    // Try fetching via public gviz endpoint first
    try {
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json`;
      const gvizRes = await fetch(gvizUrl);
      if (gvizRes.ok) {
        const text = await gvizRes.text();
        if (text.includes("google.visualization.Query.setResponse")) {
          const jsonStr = text
            .replace("/*O_o*/", "")
            .replace("google.visualization.Query.setResponse(", "")
            .slice(0, -2);
          const json = JSON.parse(jsonStr);

          const cols = json.table?.cols || [];
          const rawRows = json.table?.rows || [];

          // Detect schema: check if col 1 or 2 is VALOR MMB / Clube
          const colLabels = cols.map((c: any) => (c?.label || "").toUpperCase());
          const isMbsSchema = colLabels.some((l: string) => l.includes("VALOR MMB") || l.includes("CLUBE") || l.includes("ATLETA"));

          if (isMbsSchema) {
            records = rawRows.map((r: any, idx: number) => {
              const getVal = (colIndex: number) => {
                if (!r.c || !r.c[colIndex]) return "";
                return r.c[colIndex].f !== undefined && r.c[colIndex].f !== null ? r.c[colIndex].f : (r.c[colIndex].v ?? "");
              };

              const dataVenc = parsePtBrDate(getVal(0));
              const valor = parsePtBrNumber(getVal(1));
              const clube = String(getVal(2) || "").trim();
              const atleta = String(getVal(3) || "").trim();
              const tipoContrato = String(getVal(4) || "").trim();
              const nfInfo = String(getVal(5) || "").trim();
              const parcelas = String(getVal(6) || "").trim();
              const pagamentoInfo = String(getVal(7) || "").trim();
              const dataContrato = parsePtBrDate(getVal(9));
              const obs = String(getVal(10) || "").trim();

              const nfInfoLower = nfInfo.toLowerCase();
              const obsLower = obs.toLowerCase();
              const isPaid = nfInfoLower.includes("pg") || obsLower.includes("pg") || pagamentoInfo.toLowerCase().includes("pg") || nfInfoLower.includes("pago");
              const isNfIssued = nfInfoLower.includes("nf") || nfInfoLower.includes("emitida") || nfInfoLower.includes("enviada");
              const isCancelled = nfInfoLower.includes("cancelada");

              const clienteDisplay = clube ? (atleta ? `${clube} (${atleta})` : clube) : (atleta || "Márcio Bittencourt Sports");

              return {
                id: `sheet-mbs-${idx + 1}`,
                numeroContrato: `CT-MBS-${String(idx + 1).padStart(3, '0')}`,
                clienteNome: clienteDisplay,
                clienteCnpjCpf: pagamentoInfo ? pagamentoInfo.split('\n')[0].substring(0, 45) : "",
                servicoDescricao: tipoContrato ? `${tipoContrato}${atleta ? ` - Atleta: ${atleta}` : ''}` : (atleta ? `Intermediação / ${atleta}` : "Intermediação Esportiva"),
                valorBaseContrato: valor,
                percentualComissao: 100,
                valorComissao: valor,
                dataVencimentoNF: dataVenc,
                statusNF: isCancelled ? "Cancelada" : (isNfIssued ? "Emitida" : "Pendente"),
                numeroNF: nfInfo ? nfInfo.split("\n")[0].substring(0, 30) : "-",
                dataEmissaoNF: dataContrato !== new Date().toISOString().split("T")[0] ? dataContrato : dataVenc,
                statusPagamento: isPaid ? "Pago" : "Aguardando",
                dataPagamento: isPaid ? dataVenc : "",
                observacoes: [parcelas ? `Parcela: ${parcelas}` : '', obs ? `Obs: ${obs}` : ''].filter(Boolean).join(" | ") || "Sincronizado do Google Sheets",
                criadoEm: new Date().toISOString().split("T")[0]
              };
            }).filter((rec: any) => rec.valorComissao > 0 || rec.clienteNome);
          } else {
            // Standard App schema via gviz
            records = rawRows.map((r: any, idx: number) => {
              const getVal = (colIndex: number) => {
                if (!r.c || !r.c[colIndex]) return "";
                return r.c[colIndex].f !== undefined && r.c[colIndex].f !== null ? r.c[colIndex].f : (r.c[colIndex].v ?? "");
              };

              const valorBase = parsePtBrNumber(getVal(5));
              const pctCom = parsePtBrNumber(getVal(6));
              const valorCom = parsePtBrNumber(getVal(7)) || (valorBase * (pctCom / 100)) || valorBase;

              return {
                id: `sheet-std-${idx + 1}`,
                numeroContrato: String(getVal(1) || `CT-${idx + 1}`),
                clienteNome: String(getVal(2) || "Cliente Importado"),
                clienteCnpjCpf: String(getVal(3) || ""),
                servicoDescricao: String(getVal(4) || "Intermediação"),
                valorBaseContrato: valorBase,
                percentualComissao: pctCom || 10,
                valorComissao: valorCom,
                dataVencimentoNF: parsePtBrDate(getVal(8)),
                statusNF: getVal(9) === "Emitida" ? "Emitida" : getVal(9) === "Cancelada" ? "Cancelada" : "Pendente",
                numeroNF: String(getVal(10) || "-"),
                dataEmissaoNF: String(getVal(11) || ""),
                statusPagamento: getVal(12) === "Pago" ? "Pago" : getVal(12) === "Atrasado" ? "Atrasado" : "Aguardando",
                dataPagamento: String(getVal(13) || ""),
                observacoes: String(getVal(14) || "Sincronizado do Google Sheets"),
                criadoEm: new Date().toISOString().split("T")[0]
              };
            }).filter((rec: any) => rec.clienteNome && rec.clienteNome !== "Cliente / Razão Social");
          }
        }
      }
    } catch (gvizError) {
      console.warn("GViz fetch skipped or failed, falling back to Sheets API:", gvizError);
    }

    // Fallback: If gviz didn't return records and accessToken exists, use official Google Sheets API v4
    if (records.length === 0 && accessToken) {
      const sheets = getSheetsClient(accessToken);
      if (sheets) {
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `A1:O500`
        });

        const rows = response.data.values || [];
        if (rows.length >= 2) {
          records = rows.slice(1).map((row, index) => {
            const valorBase = parsePtBrNumber(row[5]);
            const pctCom = parsePtBrNumber(row[6]);
            const valorCom = parsePtBrNumber(row[7]) || valorBase;

            return {
              id: `sheet-api-${Date.now()}-${index}`,
              numeroContrato: row[1] || `CT-G-${index + 1}`,
              clienteNome: row[2] || "Cliente Importado",
              clienteCnpjCpf: row[3] || "",
              servicoDescricao: row[4] || "",
              valorBaseContrato: valorBase,
              percentualComissao: pctCom,
              valorComissao: valorCom,
              dataVencimentoNF: parsePtBrDate(row[8]),
              statusNF: row[9] === "Emitida" ? "Emitida" : row[9] === "Cancelada" ? "Cancelada" : "Pendente",
              numeroNF: row[10] || "",
              dataEmissaoNF: row[11] || "",
              statusPagamento: row[12] === "Pago" ? "Pago" : row[12] === "Atrasado" ? "Atrasado" : "Aguardando",
              dataPagamento: row[13] || "",
              observacoes: row[14] || "Sincronizado do Google Sheets",
              criadoEm: new Date().toISOString().split("T")[0]
            };
          });
        }
      }
    }

    return res.json({
      success: true,
      records,
      count: records.length,
      message: `${records.length} comissões importadas da planilha do Google Sheets.`
    });

  } catch (error: any) {
    console.error("Erro ao ler Google Sheets:", error);
    return res.status(500).json({
      error: "Erro ao ler a planilha do Google Sheets.",
      details: error.message || String(error)
    });
  }
});

async function startServer() {
  // Static public assets
  app.use(express.static(path.join(process.cwd(), "public")));

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando com sucesso em http://localhost:${PORT}`);
  });
}

startServer();
