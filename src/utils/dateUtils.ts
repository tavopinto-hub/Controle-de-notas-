import { CommissionRecord } from '../types';

export const getRecordYear = (rec: { dataVencimentoNF?: string; dataContrato?: string }): string => {
  const d = rec.dataVencimentoNF || rec.dataContrato;
  if (!d) return 'Outros';
  if (d.includes('-')) {
    const y = d.split('-')[0];
    if (y && y.length === 4) return y;
  }
  if (d.includes('/')) {
    const parts = d.split('/');
    const y = parts[2];
    if (y && y.length === 4) return y;
  }
  return 'Outros';
};

export const isPastDate = (dateStr?: string): boolean => {
  if (!dateStr) return false;
  let isoDate = dateStr;
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  const todayISO = new Date().toISOString().split('T')[0];
  return isoDate < todayISO;
};
