import { CommissionRecord } from '../types';

export interface CleanedClubeAtleta {
  clube: string;
  atleta: string;
  wasModified: boolean;
}

const nonAthleteTerms = [
  's.a.', 'sa', 'ltda', 'eireli', 'me', 'epp', 'sociedade', 'futebol', 'base',
  'profissional', 'feminino', 'masculino', 'intermediação', 'intermediacao',
  'renovação', 'renovacao', 'empréstimo', 'emprestimo', 'transferência', 'transferencia',
  'representação', 'representacao', 'assessoria', 'consultoria', 'comissão', 'comissao',
  'direitos', 'imagem', 'parcela', 'contrato', 'logística', 'logistica', 'engenharia',
  'tecnologia', 'software', 'energia', 'vendas', 'gestão', 'gestao', 'comercial',
  'saf', 's/a', 'clube', 'associação', 'associacao', 'esporte', 'esportes'
];

function isNonAthlete(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  // If it's pure numbers, dates, or very short code
  if (/^\d+$/.test(trimmed) || /^\d{2}\/\d{2}/.test(trimmed) || trimmed.length < 2) {
    return true;
  }
  const lower = trimmed.toLowerCase();
  return nonAthleteTerms.some(term => lower === term || lower.startsWith(term + ' ') || lower.endsWith(' ' + term));
}

/**
 * Separates athlete names that are glued/attached to club names (especially in parentheses).
 * Examples:
 * - "S.E. Palmeiras (Dudu)" -> Clube: "S.E. Palmeiras", Atleta: "Dudu"
 * - "Corinthians (Yuri Alberto)" -> Clube: "Corinthians", Atleta: "Yuri Alberto"
 * - "CR Flamengo (Gabriel Barbosa)" -> Clube: "CR Flamengo", Atleta: "Gabriel Barbosa"
 * - "Grêmio FBPA - Luis Suárez" -> Clube: "Grêmio FBPA", Atleta: "Luis Suárez"
 */
export function cleanClubeAndAtleta(
  rawClube?: string,
  rawAtleta?: string,
  rawClienteNome?: string
): CleanedClubeAtleta {
  let clubeInput = (rawClube || rawClienteNome || '').trim();
  let atletaInput = (rawAtleta || '').trim();

  if (atletaInput === '-' || atletaInput === 'Pendente' || atletaInput === 'Não informado' || atletaInput === 'Sem Atleta') {
    atletaInput = '';
  }

  let extractedClube = clubeInput;
  let extractedAtleta = atletaInput;
  let wasModified = false;

  // 1. Check for Parentheses or Brackets containing athlete name anywhere in clubeInput
  // Matches (Name) or [Name] or {Name}
  const parenRegex = /[\(\[\{]([^\)\]\}]+)[\)\]\}]/g;
  let match: RegExpExecArray | null;

  while ((match = parenRegex.exec(clubeInput)) !== null) {
    const inside = match[1].trim();
    if (inside && !isNonAthlete(inside)) {
      const candidateAtleta = inside;
      // Remove parenthesized athlete from clubeInput
      const cleanedClube = clubeInput
        .replace(match[0], '')
        .replace(/\s+/g, ' ')
        .replace(/\s+[-–/|:]+$/, '')
        .trim();

      if (cleanedClube.length > 1) {
        extractedClube = cleanedClube;
        extractedAtleta = candidateAtleta;
        wasModified = true;
        break;
      }
    }
  }

  // 2. If no paren athlete found, check for explicit separators: " - ", " – ", " / ", " | ", " : "
  if (!wasModified) {
    const separators = [/ \- /, / – /, / \/ /, / \| /, / : /];
    for (const sep of separators) {
      if (sep.test(clubeInput)) {
        const parts = clubeInput.split(sep).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          const candidateClube = parts[0];
          const candidateAtleta = parts.slice(1).join(' - ');
          if (candidateAtleta && !isNonAthlete(candidateAtleta)) {
            extractedClube = candidateClube;
            extractedAtleta = candidateAtleta;
            wasModified = true;
            break;
          }
        }
      }
    }
  }

  // 3. If atleta was already provided in rawAtleta, but clubeInput still has it glued without parens
  if (!wasModified && atletaInput) {
    const lowerClube = clubeInput.toLowerCase();
    const lowerAtleta = atletaInput.toLowerCase();

    if (lowerClube.includes(lowerAtleta) && lowerClube.length > lowerAtleta.length + 2) {
      extractedClube = clubeInput
        .replace(new RegExp(`[\\s\\-\\/\\|:]*${atletaInput.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'gi'), '')
        .replace(/\s+/g, ' ')
        .trim();
      if (extractedClube.length > 1) {
        wasModified = true;
      } else {
        extractedClube = clubeInput;
      }
    }
  }

  // Clean trailing punctuation
  extractedClube = extractedClube.replace(/[-–/|:\s]+$/, '').trim();

  const finalClube = extractedClube || rawClube || rawClienteNome || '-';
  const finalAtleta = extractedAtleta || atletaInput || '-';

  return {
    clube: finalClube,
    atleta: finalAtleta,
    wasModified
  };
}

/**
 * Normalizes an array of records to separate glued Club/Athlete names.
 */
export function normalizeRecordsClubeAtleta(records: CommissionRecord[]): CommissionRecord[] {
  return records.map(rec => {
    const cleaned = cleanClubeAndAtleta(rec.clube, rec.atleta, rec.clienteNome);
    if (cleaned.wasModified || (rec.atleta !== cleaned.atleta && cleaned.atleta !== '-') || (rec.clube !== cleaned.clube && cleaned.clube !== '-')) {
      return {
        ...rec,
        clube: cleaned.clube,
        atleta: cleaned.atleta
      };
    }
    return rec;
  });
}

/**
 * Normalizes athlete name for robust matching (e.g. "Marlon Freitas" == "marlon freitas")
 */
export function getAthleteNormalizedKey(atletaName?: string): string {
  if (!atletaName || atletaName === '-' || atletaName === 'Pendente' || atletaName === 'Sem Atleta') return '';
  return atletaName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Propagates updated athlete fields (agentes, clube, tipoContrato, observacoes, cnpj, etc.)
 * across all existing records for the same athlete in all months.
 */
export function propagateAthleteInfoToAllRecords(
  updatedRecord: CommissionRecord,
  allRecords: CommissionRecord[]
): { updatedRecords: CommissionRecord[]; updatedCount: number } {
  const targetKey = getAthleteNormalizedKey(updatedRecord.atleta);
  if (!targetKey || targetKey.length < 2) {
    return { updatedRecords: allRecords, updatedCount: 0 };
  }

  let updatedCount = 0;
  const targetAgentes = updatedRecord.agentes || updatedRecord.captadores || [];

  const updatedRecords = allRecords.map(rec => {
    // Check if this record belongs to the same athlete
    const currentKey = getAthleteNormalizedKey(rec.atleta);
    if (currentKey === targetKey) {
      updatedCount++;
      return {
        ...rec,
        // Propagate common athlete metadata across all months
        agentes: targetAgentes.length > 0 ? targetAgentes : rec.agentes,
        captadores: targetAgentes.length > 0 ? targetAgentes : rec.captadores,
        clube: updatedRecord.clube && updatedRecord.clube !== '-' ? updatedRecord.clube : rec.clube,
        clienteNome: updatedRecord.clube && updatedRecord.clube !== '-' ? updatedRecord.clube : rec.clienteNome,
        tipoContrato: updatedRecord.tipoContrato || rec.tipoContrato,
        clienteCnpjCpf: updatedRecord.clienteCnpjCpf || rec.clienteCnpjCpf,
        observacoes: updatedRecord.observacoes || rec.observacoes,
        percentualComissao: updatedRecord.percentualComissao !== undefined && updatedRecord.percentualComissao > 0 
          ? updatedRecord.percentualComissao 
          : rec.percentualComissao
      };
    }
    return rec;
  });

  return { updatedRecords, updatedCount };
}

/**
 * Propagates and synchronizes metadata for ALL athletes across all months in the spreadsheet.
 */
export function propagateAllAthletesAcrossAllRecords(allRecords: CommissionRecord[]): { updatedRecords: CommissionRecord[]; totalSynced: number } {
  // Map normalized athlete key -> latest/most complete metadata
  const athleteMap = new Map<string, {
    agentes: string[];
    clube: string;
    tipoContrato: string;
    clienteCnpjCpf: string;
    observacoes: string;
    percentualComissao: number;
  }>();

  for (const rec of allRecords) {
    const key = getAthleteNormalizedKey(rec.atleta);
    if (!key || key.length < 2) continue;

    const existing = athleteMap.get(key);
    const currAgentes = rec.agentes || rec.captadores || [];

    if (!existing) {
      athleteMap.set(key, {
        agentes: currAgentes,
        clube: rec.clube || rec.clienteNome || '',
        tipoContrato: rec.tipoContrato || '',
        clienteCnpjCpf: rec.clienteCnpjCpf || '',
        observacoes: rec.observacoes || '',
        percentualComissao: rec.percentualComissao || 10
      });
    } else {
      // Merge agentes list
      const combinedAgentes = Array.from(new Set([...existing.agentes, ...currAgentes]));
      athleteMap.set(key, {
        agentes: combinedAgentes.length > 0 ? combinedAgentes : existing.agentes,
        clube: (rec.clube && rec.clube !== '-') ? rec.clube : existing.clube,
        tipoContrato: rec.tipoContrato || existing.tipoContrato,
        clienteCnpjCpf: rec.clienteCnpjCpf || existing.clienteCnpjCpf,
        observacoes: rec.observacoes || existing.observacoes,
        percentualComissao: rec.percentualComissao || existing.percentualComissao
      });
    }
  }

  let totalSynced = 0;
  const updatedRecords = allRecords.map(rec => {
    const key = getAthleteNormalizedKey(rec.atleta);
    if (!key || !athleteMap.has(key)) return rec;

    const meta = athleteMap.get(key)!;
    const agentesList = meta.agentes.length > 0 ? meta.agentes : (rec.agentes || rec.captadores || []);

    totalSynced++;
    return {
      ...rec,
      agentes: agentesList,
      captadores: agentesList,
      clube: meta.clube || rec.clube,
      clienteNome: meta.clube || rec.clienteNome,
      tipoContrato: meta.tipoContrato || rec.tipoContrato,
      clienteCnpjCpf: meta.clienteCnpjCpf || rec.clienteCnpjCpf,
      observacoes: meta.observacoes || rec.observacoes,
      percentualComissao: meta.percentualComissao || rec.percentualComissao
    };
  });

  return { updatedRecords, totalSynced };
}


