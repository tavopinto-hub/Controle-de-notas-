export const PREDEFINED_AGENTES = [
  'Andre Brito',
  'Cadu Quintanilha',
  'Felipe Bittencourt',
  'Márcio Bittencourt',
  'Gustavo Vianna',
  'Rodrigo Rodrigues',
  'Gabriel Martins',
  'Thomas Bedinelli',
  'Joga 10'
] as const;

export const PREDEFINED_CAPTADORES = PREDEFINED_AGENTES;

export type AgenteName = typeof PREDEFINED_AGENTES[number];
export type CaptadorName = AgenteName;

// Helper to assign consistent tag colors to agentes
const COLOR_PALETTE = [
  { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300' },
  { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
  { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' },
  { bg: 'bg-rose-100', text: 'text-rose-800', border: 'border-rose-300' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800', border: 'border-cyan-300' },
  { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-300' },
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
];

export function getAgenteColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[index];
}

export const getCaptadorColor = getAgenteColor;
