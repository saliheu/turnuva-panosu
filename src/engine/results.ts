import type { Match, Scoring, Slot, Stage, TeamId } from './types';

export const BYE = '__BAY__';

export function hasScore(m: Match): boolean {
  return m.scoreA != null && m.scoreB != null && !Number.isNaN(m.scoreA) && !Number.isNaN(m.scoreB);
}

/** Maç oynandı mı (skor, hükmen veya bay) */
export function isPlayed(m: Match): boolean {
  return hasScore(m) || !!m.forfeit || m.a.kind === 'bye' || m.b.kind === 'bye';
}

/** Skor veya hükmen girilmiş mi (bay hariç) — "oynanmış maç" uyarıları için */
export function hasResult(m: Match): boolean {
  return hasScore(m) || !!m.forfeit;
}

export type Side = 'a' | 'b';

/** Lig/grup maçı sonucu: kazanan taraf veya beraberlik */
export function leagueOutcome(m: Match): Side | 'draw' | null {
  if (m.forfeit) return m.forfeit;
  if (!hasScore(m)) return null;
  if (m.scoreA! > m.scoreB!) return 'a';
  if (m.scoreA! < m.scoreB!) return 'b';
  return 'draw';
}

/** Eleme maçının kazananı (henüz belli değilse null) */
export function knockoutWinnerSide(m: Match, resolved: { a: TeamId | null; b: TeamId | null }): Side | null {
  if (resolved.a === BYE && resolved.b && resolved.b !== BYE) return 'b';
  if (resolved.b === BYE && resolved.a && resolved.a !== BYE) return 'a';
  if (!resolved.a || !resolved.b) return null;
  if (m.forfeit) return m.forfeit;
  if (!hasScore(m)) return null;
  if (m.scoreA! > m.scoreB!) return 'a';
  if (m.scoreA! < m.scoreB!) return 'b';
  if (m.penA != null && m.penB != null && m.penA !== m.penB) return m.penA > m.penB ? 'a' : 'b';
  if (m.decided) return m.decided;
  return null;
}

/** Eleme aşamasındaki tüm maçların takımlarını çözer */
export function resolveStage(stage: Stage): Map<string, { a: TeamId | null; b: TeamId | null; winner: TeamId | null; loser: TeamId | null }> {
  const byId = new Map(stage.matches.map((m) => [m.id, m]));
  const cache = new Map<string, { a: TeamId | null; b: TeamId | null; winner: TeamId | null; loser: TeamId | null }>();
  const visiting = new Set<string>();

  const resolveSlot = (slot: Slot): TeamId | null => {
    switch (slot.kind) {
      case 'team':
        return slot.teamId;
      case 'bye':
        return BYE;
      case 'winner': {
        const r = resolveMatch(slot.matchId);
        return r ? r.winner : null;
      }
      case 'loser': {
        const r = resolveMatch(slot.matchId);
        if (!r || !r.loser) return null;
        return r.loser;
      }
    }
  };

  function resolveMatch(id: string) {
    if (cache.has(id)) return cache.get(id)!;
    const m = byId.get(id);
    if (!m || visiting.has(id)) return null;
    visiting.add(id);
    const a = resolveSlot(m.a);
    const b = resolveSlot(m.b);
    const side = knockoutWinnerSide(m, { a, b });
    const winner = side === 'a' ? a : side === 'b' ? b : null;
    const loserRaw = side === 'a' ? b : side === 'b' ? a : null;
    const loser = loserRaw === BYE ? null : loserRaw;
    const res = { a, b, winner: winner === BYE ? null : winner, loser };
    visiting.delete(id);
    cache.set(id, res);
    return res;
  }

  for (const m of stage.matches) resolveMatch(m.id);
  return cache;
}

/** Bir maçta tarafların aldığı lig puanı */
export function matchPoints(m: Match, scoring: Scoring): { a: number; b: number } | null {
  const o = leagueOutcome(m);
  if (o === null) return null;
  if (m.forfeit) {
    return m.forfeit === 'a' ? { a: scoring.win, b: scoring.forfeitLoss } : { a: scoring.forfeitLoss, b: scoring.win };
  }
  if (o === 'draw') return { a: scoring.draw, b: scoring.draw };
  if (scoring.volleyball && Math.abs(m.scoreA! - m.scoreB!) === 1) {
    // 3-2 veya 2-1: galip 2, mağlup 1 puan
    return o === 'a' ? { a: 2, b: 1 } : { a: 1, b: 2 };
  }
  return o === 'a' ? { a: scoring.win, b: scoring.loss } : { a: scoring.loss, b: scoring.win };
}

export function slotTeam(slot: Slot): TeamId | null {
  return slot.kind === 'team' ? slot.teamId : null;
}
