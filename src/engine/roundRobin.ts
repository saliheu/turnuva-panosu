import type { TeamId } from './types';

export interface RRPairing {
  round: number; // 1'den başlar
  home: TeamId;
  away: TeamId;
  leg: 1 | 2;
}

/**
 * Daire (Berger) yöntemiyle lig fikstürü.
 * - Tek sayıda takımda her hafta bir takım bay geçer.
 * - Çift maçta ikinci yarı ilk yarının ev/deplasman çevrilmiş tekrarıdır;
 *   böylece aynı iki takım asla aynı haftada iki kez eşleşmez.
 */
export function roundRobin(teamIds: readonly TeamId[], legs: 1 | 2 = 1): RRPairing[] {
  if (teamIds.length < 2) return [];
  const list: (TeamId | null)[] = teamIds.slice();
  if (list.length % 2 === 1) list.push(null);
  const n = list.length;
  const rounds = n - 1;
  const out: RRPairing[] = [];
  let arr = list.slice();
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < n / 2; i++) {
      const x = arr[i];
      const y = arr[n - 1 - i];
      if (x === null || y === null) continue;
      // Ev/deplasman dengesi: sabit takım haftalara göre dönüşümlü; diğerlerinde üst sıradaki
      // takım ev sahibi. Dönüş sayesinde herkes yaklaşık yarı maçında ev sahibi olur.
      const swap = i === 0 ? r % 2 === 1 : false;
      out.push({ round: r + 1, home: swap ? y : x, away: swap ? x : y, leg: 1 });
    }
    // ilk eleman sabit, diğerleri döner
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  if (legs === 2) {
    const first = out.slice();
    for (const p of first) {
      out.push({ round: p.round + rounds, home: p.away, away: p.home, leg: 2 });
    }
  }
  return out;
}

/** Bir grupta kaç hafta olacağı */
export function roundCount(teamCount: number, legs: 1 | 2): number {
  if (teamCount < 2) return 0;
  const n = teamCount % 2 === 0 ? teamCount : teamCount + 1;
  return (n - 1) * legs;
}
