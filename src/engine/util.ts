import type { Team, TeamId } from './types';

/** Tohumlu rastgele sayı üreteci (mulberry32). Aynı tohum aynı kurayı verir. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function uid(prefix = ''): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return prefix + s;
}

export function isPowerOfTwo(n: number): boolean {
  return n >= 1 && (n & (n - 1)) === 0;
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** n'in altındaki (veya eşit) en büyük 2'nin kuvveti */
export function lowerPowerOfTwo(n: number): number {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

/**
 * Takımları güce göre sıralar (10 en güçlü). Aynı güçtekilerin sırası kurayla
 * (tohumlu rastgele) belirlenir.
 */
export function orderByPower(teams: readonly Team[], rng: () => number): Team[] {
  const shuffled = shuffle(teams, rng);
  return shuffled
    .map((t, i) => ({ t, i }))
    .sort((x, y) => y.t.power - x.t.power || x.i - y.i)
    .map((x) => x.t);
}

/**
 * Seri başı yerleşimi: n (2'nin kuvveti) büyüklüğündeki tabloda sıralı konumlara
 * düşen seri başı numaraları. Ör. 8 → [1,8,4,5,2,7,3,6].
 * 1 ile n eşleşir; 1 ve 2 ancak finalde, ilk 4 ancak yarı finalde karşılaşabilir.
 */
export function bracketOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const len = order.length * 2;
    const next: number[] = [];
    for (const s of order) next.push(s, len + 1 - s);
    order = next;
  }
  return order;
}

export function groupName(index: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < letters.length) return letters[index];
  return letters[Math.floor(index / letters.length) - 1] + letters[index % letters.length];
}

/** Türkçe sayı eki: 16'lı, 32'li, 4'lü, 9'lu ... */
export function ekLi(n: number): string {
  const ones: Record<number, string> = {
    0: '', 1: 'li', 2: 'li', 3: 'lü', 4: 'lü', 5: 'li', 6: 'lı', 7: 'li', 8: 'li', 9: 'lu',
  };
  const tens: Record<number, string> = {
    1: 'lu', 2: 'li', 3: 'lu', 4: 'lı', 5: 'li', 6: 'lı', 7: 'li', 8: 'li', 9: 'lı',
  };
  let suffix: string;
  if (n === 0) suffix = 'lı';
  else if (n % 100 === 0) suffix = 'lü';
  else if (n % 10 !== 0) suffix = ones[n % 10];
  else suffix = tens[(n / 10) % 10];
  return `${n}'${suffix}`;
}

/** Türkçe sıra sayısı: 1. 2. ... */
export function ordinal(n: number): string {
  return `${n}.`;
}

export function teamMap(teams: readonly Team[]): Map<TeamId, Team> {
  return new Map(teams.map((t) => [t.id, t]));
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function knockoutRoundName(teamsInRound: number): string {
  switch (teamsInRound) {
    case 2:
      return 'Final';
    case 4:
      return 'Yarı Final';
    case 8:
      return 'Çeyrek Final';
    default:
      return `Son ${teamsInRound}`;
  }
}

/** "2026-27" gibi öğretim yılı; Eylül'den itibaren yeni yıl başlar. */
export function currentSchoolYear(date = new Date()): string {
  const y = date.getFullYear();
  const start = date.getMonth() >= 8 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

const ORDINAL_WORDS = ['', 'birinci', 'ikinci', 'üçüncü', 'dördüncü', 'beşinci', 'altıncı', 'yedinci', 'sekizinci', 'dokuzuncu', 'onuncu'];

/** 3 → "üçüncü" */
export function ordinalWord(n: number): string {
  return ORDINAL_WORDS[n] ?? `${n}.`;
}

/** 3 → "üçüncüler" */
export function ordinalPlural(n: number): string {
  const w = ordinalWord(n);
  if (w.endsWith('.')) return `${w} sıradakiler`;
  return w + (/[ıaou][^aeıioöuü]*$/.test(w) ? 'lar' : 'ler');
}
