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
