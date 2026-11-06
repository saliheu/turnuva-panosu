import { createContext, useContext } from 'react';
import { BYE, resolveStage } from '../../engine/results';
import type { Match, Slot, Stage, TeamId, Tournament } from '../../engine/types';
import { teamName } from '../../engine/tournament';

export interface TournamentCtxValue {
  t: Tournament;
  admin: boolean;
  /** Taslağı değiştirip kaydeder. Hata olursa false döner. */
  mutate: (label: string, fn: (draft: Tournament) => void) => Promise<boolean>;
  saving: boolean;
  reload: () => Promise<void>;
  replace: (t: Tournament) => void;
}

export const TournamentCtx = createContext<TournamentCtxValue | null>(null);

export function useT(): TournamentCtxValue {
  const v = useContext(TournamentCtx);
  if (!v) throw new Error('TournamentCtx yok');
  return v;
}

export interface Resolved {
  a: TeamId | null;
  b: TeamId | null;
  winner: TeamId | null;
  loser: TeamId | null;
}

/** Aşamadaki tüm maçların taraflarını çözer (gruplar için doğrudan takımlar) */
export function resolveAll(stage: Stage): Map<string, Resolved> {
  if (stage.type === 'eleme' || stage.type === 'on-eleme') return resolveStage(stage);
  const out = new Map<string, Resolved>();
  for (const m of stage.matches) {
    const a = m.a.kind === 'team' ? m.a.teamId : null;
    const b = m.b.kind === 'team' ? m.b.teamId : null;
    let winner: TeamId | null = null;
    if (m.forfeit) winner = m.forfeit === 'a' ? a : b;
    else if (m.scoreA != null && m.scoreB != null && m.scoreA !== m.scoreB) winner = m.scoreA > m.scoreB ? a : b;
    out.set(m.id, { a, b, winner, loser: winner ? (winner === a ? b : a) : null });
  }
  return out;
}

/** Henüz belli olmayan taraf için açıklama: "Maç 5 galibi" */
export function slotPlaceholder(stage: Stage, slot: Slot): string {
  if (slot.kind === 'bye') return 'Bay';
  if (slot.kind === 'team') return '';
  const src = stage.matches.find((m) => m.id === slot.matchId);
  const no = src?.no ? `Maç ${src.no}` : 'Önceki maç';
  return slot.kind === 'winner' ? `${no} galibi` : `${no} mağlubu`;
}

export function sideName(t: Tournament, stage: Stage, m: Match, side: 'a' | 'b', r?: Resolved): { text: string; tbd: boolean } {
  const id = r ? r[side] : null;
  if (id && id !== BYE) return { text: teamName(t, id), tbd: false };
  if (id === BYE) return { text: 'Bay', tbd: true };
  return { text: slotPlaceholder(stage, m[side]) || 'Belli değil', tbd: true };
}

export function stageRoundLabel(stage: Stage, round: number, third?: boolean): string {
  if (third) return 'Üçüncülük Maçı';
  if (stage.type === 'on-eleme') return 'Ön Eleme Maçları';
  if (stage.type === 'eleme') {
    const r1 = stage.matches.filter((m) => m.round === 1 && !m.third).length;
    // Bay geçen varsa ilk tur, en zayıfların oynadığı ön eleme turudur
    if (round === 1 && stage.matches.some((m) => m.round === 1 && (m.a.kind === 'bye' || m.b.kind === 'bye'))) return 'Ön Eleme';
    const teams = (r1 * 2) / 2 ** (round - 1);
    if (teams === 2) return 'Final';
    if (teams === 4) return 'Yarı Final';
    if (teams === 8) return 'Çeyrek Final';
    return `Son ${teams}`;
  }
  return `${round}. Tur Maçları`;
}
