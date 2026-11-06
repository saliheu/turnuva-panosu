import { isPlayed, resolveStage, hasResult } from './results';
import { accumulate, computeStandings, DEFAULT_CRITERIA, unresolvedTies, type StandingRow } from './standings';
import type { Qualifier, Stage, TeamId, Tournament } from './types';

export interface StageProgress {
  total: number;
  played: number;
  complete: boolean;
}

export function stageProgress(stage: Stage): StageProgress {
  if (stage.type === 'eleme') {
    const res = resolveStage(stage);
    const real = stage.matches.filter((m) => m.a.kind !== 'bye' && m.b.kind !== 'bye');
    const played = real.filter((m) => res.get(m.id)?.winner).length;
    return { total: real.length, played, complete: real.length > 0 && played === real.length };
  }
  if (stage.type === 'on-eleme') {
    const res = resolveStage(stage);
    const played = stage.matches.filter((m) => res.get(m.id)?.winner).length;
    return { total: stage.matches.length, played, complete: stage.matches.length > 0 && played === stage.matches.length };
  }
  const total = stage.matches.length;
  const played = stage.matches.filter(isPlayed).length;
  return { total, played, complete: total > 0 && played === total };
}

export interface GroupTable {
  group: string;
  rows: StandingRow[];
  complete: boolean;
}

export function groupTables(t: Tournament, stage: Stage): GroupTable[] {
  if (!stage.groups) return [];
  const criteria = stage.settings.criteria ?? DEFAULT_CRITERIA;
  return stage.groups.map((g) => {
    const ms = stage.matches.filter((m) => m.group === g.name);
    return {
      group: g.name,
      rows: computeStandings(g.teamIds, ms, t.scoring, criteria, stage.manualOrder?.[g.name]),
      complete: ms.length > 0 && ms.every(isPlayed),
    };
  });
}

export interface ExtraRow {
  teamId: TeamId;
  group: string;
  played: number;
  points: number;
  gd: number;
  gf: number;
  won: number;
  rank: number;
  tied: boolean;
}

/** En iyi X.'ler tablosu. Gruplar farklı büyüklükteyse son sıradakilere karşı maçlar sayılmaz. */
export function bestExtraTable(t: Tournament, stage: Stage, tables: GroupTable[]): ExtraRow[] {
  const k = stage.settings.qualifiersPerGroup ?? 0;
  const pos = k + 1;
  const minSize = Math.min(...tables.map((x) => x.rows.length));
  const candidates: ExtraRow[] = [];
  for (const tb of tables) {
    const row = tb.rows[pos - 1];
    if (!row) continue;
    const allowed = new Set(tb.rows.slice(0, minSize).map((r) => r.teamId));
    const ms = stage.matches.filter((m) => m.group === tb.group);
    const acc = accumulate(tb.rows.map((r) => r.teamId), ms, t.scoring, allowed).get(row.teamId)!;
    candidates.push({
      teamId: row.teamId,
      group: tb.group,
      played: acc.played,
      points: acc.points,
      gd: acc.gf - acc.ga,
      gf: acc.gf,
      won: acc.won,
      rank: 0,
      tied: false,
    });
  }
  const manual = stage.manualOrder?.['__extra'];
  const key = (r: ExtraRow) => [r.points, r.gd, r.gf, r.won];
  const cmp = (x: ExtraRow, y: ExtraRow) => {
    const a = key(x);
    const b = key(y);
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
    if (manual && manual.includes(x.teamId) && manual.includes(y.teamId)) return manual.indexOf(x.teamId) - manual.indexOf(y.teamId);
    return 0;
  };
  candidates.sort((x, y) => cmp(x, y) || x.group.localeCompare(y.group));
  candidates.forEach((r, i) => {
    r.rank = i + 1;
    const prev = candidates[i - 1];
    const next = candidates[i + 1];
    r.tied = (!!prev && cmp(prev, r) === 0) || (!!next && cmp(r, next) === 0);
  });
  return candidates;
}

export interface StageResult {
  complete: boolean;
  qualifiers: Qualifier[];
  /** Yönetici kararı gerektiren eşitlikler */
  ties: { scope: string; teamIds: TeamId[] }[];
  warnings: string[];
}

function perGame(v: number, played: number) {
  return played ? v / played : 0;
}

/** Aşama sonucunu ve üst tura çıkanları hesaplar (yönetici onayından önce). */
export function computeStageResult(t: Tournament, stage: Stage): StageResult {
  const progress = stageProgress(stage);
  const warnings: string[] = [];
  const ties: StageResult['ties'] = [];
  const qualifiers: Qualifier[] = [];

  if (stage.type === 'on-eleme') {
    const res = resolveStage(stage);
    const direct = stage.direct ?? [];
    direct.forEach((id, i) => qualifiers.push({ teamId: id, label: stage.entrants?.find((e) => e.teamId === id)?.label || `${i + 1}`, rank: i + 1 }));
    stage.matches
      .slice()
      .sort((x, y) => x.order - y.order)
      .forEach((m, i) => {
        const w = res.get(m.id)?.winner;
        if (w) qualifiers.push({ teamId: w, label: `Ön eleme ${m.no} galibi`, rank: direct.length + i + 1 });
      });
    return { complete: progress.complete, qualifiers, ties, warnings };
  }

  if (stage.type === 'eleme') {
    return { complete: progress.complete, qualifiers: [], ties, warnings };
  }

  // grup / lig
  const tables = groupTables(t, stage);
  const k = stage.settings.qualifiersPerGroup ?? 0;
  const isLig = stage.type === 'lig';
  const relevantDepth = Math.max(k + (stage.settings.bestExtra?.enabled ? 1 : 0), isLig ? 3 : 1);
  for (const tb of tables) {
    for (const set of unresolvedTies(tb.rows)) {
      const minRank = Math.min(...set.map((id) => tb.rows.find((r) => r.teamId === id)!.rank));
      if (minRank <= relevantDepth) ties.push({ scope: tb.group, teamIds: set });
    }
  }
  type Cand = { teamId: TeamId; group: string; position: number; points: number; gd: number; gf: number; played: number };
  const cands: Cand[] = [];
  for (const tb of tables) {
    tb.rows.slice(0, k).forEach((r, i) =>
      cands.push({ teamId: r.teamId, group: tb.group, position: i + 1, points: r.points, gd: r.gd, gf: r.gf, played: r.played }),
    );
  }
  // Aynı sıradakiler kendi aralarında başarıya göre (maç başına) sıralanır
  cands.sort(
    (x, y) =>
      x.position - y.position ||
      perGame(y.points, y.played) - perGame(x.points, x.played) ||
      perGame(y.gd, y.played) - perGame(x.gd, x.played) ||
      perGame(y.gf, y.played) - perGame(x.gf, x.played) ||
      x.group.localeCompare(y.group),
  );
  cands.forEach((c, i) =>
    qualifiers.push({
      teamId: c.teamId,
      label: isLig ? `${c.position}.` : `${c.group}${c.position}`,
      group: isLig ? undefined : c.group,
      position: c.position,
      rank: i + 1,
    }),
  );
  if (stage.settings.bestExtra?.enabled && stage.settings.bestExtra.count > 0) {
    const extra = bestExtraTable(t, stage, tables);
    const count = stage.settings.bestExtra.count;
    if (extra.length < count) warnings.push(`En iyi ${k + 1}. sıradaki sayısı (${count}) aday sayısından (${extra.length}) fazla.`);
    const chosen = extra.slice(0, count);
    const boundary = extra[count - 1];
    const after = extra[count];
    if (boundary && after && boundary.tied && after.tied) {
      ties.push({ scope: '__extra', teamIds: extra.filter((r) => r.tied && r.points === boundary.points && r.gd === boundary.gd && r.gf === boundary.gf && r.won === boundary.won).map((r) => r.teamId) });
    }
    chosen.forEach((r) =>
      qualifiers.push({ teamId: r.teamId, label: `${r.group}${k + 1}`, group: r.group, position: k + 1, rank: qualifiers.length + 1 }),
    );
  }
  return { complete: progress.complete, qualifiers, ties, warnings };
}

export interface ChampionSuggestion {
  champion?: TeamId;
  runnerUp?: TeamId;
  third?: TeamId;
}

/** Son aşama bittiyse şampiyon önerisi */
export function suggestChampion(t: Tournament): ChampionSuggestion | null {
  const last = t.stages[t.stages.length - 1];
  if (!last || last.matches.length === 0) return null;
  if (!stageProgress(last).complete) return null;
  if (last.type === 'eleme') {
    const res = resolveStage(last);
    const finalRound = Math.max(...last.matches.map((m) => m.round));
    const final = last.matches.find((m) => m.round === finalRound && !m.third)!;
    const third = last.matches.find((m) => m.third);
    const fr = res.get(final.id)!;
    return { champion: fr.winner ?? undefined, runnerUp: fr.loser ?? undefined, third: third ? res.get(third.id)?.winner ?? undefined : undefined };
  }
  if (last.type === 'lig' || (last.type === 'grup' && (last.groups?.length ?? 0) === 1)) {
    const tb = groupTables(t, last)[0];
    return { champion: tb.rows[0]?.teamId, runnerUp: tb.rows[1]?.teamId, third: tb.rows[2]?.teamId };
  }
  return null;
}

/** Oynanmış (skor/hükmen girilmiş) maç sayısı */
export function playedCount(stage: Stage): number {
  return stage.matches.filter(hasResult).length;
}
