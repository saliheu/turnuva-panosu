import {
  addTeams,
  applyDraw,
  applyScore,
  completeStage,
  computeStageResult,
  createRng,
  describeProposal,
  groupTables,
  newTournament,
  proposeDraw,
  resolveStage,
  setFormat,
  setManualOrder,
  stageProgress,
  suggestChampion,
  hasResult,
  type DrawMode,
  type Stage,
  type StagePlan,
  type TeamId,
  type Tournament,
} from '../src/engine';
import { expect } from 'vitest';

export function makeTournament(n: number, opts: { sport?: string; seed?: number; powers?: number[] } = {}): Tournament {
  const t = newTournament({ name: 'Test Turnuvası', sport: opts.sport ?? 'Futbol', schoolYear: '2026-27' });
  const rng = createRng(opts.seed ?? n * 7919);
  addTeams(
    t,
    Array.from({ length: n }, (_, i) => ({
      name: `Takım ${i + 1}`,
      power: opts.powers ? opts.powers[i] : 1 + Math.floor(rng() * 10),
    })),
  );
  return t;
}

export type ResultPolicy = 'random' | 'favorites';

function power(t: Tournament, id: TeamId) {
  return t.teams.find((x) => x.id === id)!.power;
}

/** Aşamadaki tüm maçlara sonuç girer (eleme turlarını sırayla). */
export function playStage(t: Tournament, stage: Stage, rng: () => number, policy: ResultPolicy = 'random', seedRank?: Map<TeamId, number>) {
  const maxRound = Math.max(...stage.matches.map((m) => m.round));
  for (let r = 1; r <= maxRound; r++) {
    const res = resolveStage(stage);
    for (const m of stage.matches.filter((x) => x.round === r)) {
      if (hasResult(m) || m.a.kind === 'bye' || m.b.kind === 'bye') continue;
      const rr = res.get(m.id)!;
      if (!rr.a || !rr.b) continue;
      const knockout = stage.type === 'eleme' || stage.type === 'on-eleme';
      let a = Math.floor(rng() * 5);
      let b = Math.floor(rng() * 5);
      if (policy === 'favorites') {
        const better = seedRank ? (seedRank.get(rr.a)! < seedRank.get(rr.b)! ? 'a' : 'b') : power(t, rr.a) >= power(t, rr.b) ? 'a' : 'b';
        a = better === 'a' ? 3 : 0;
        b = better === 'a' ? 0 : 3;
      }
      if (rng() < 0.03 && policy === 'random') {
        applyScore(t, stage.id, m.id, { forfeit: rng() < 0.5 ? 'a' : 'b' });
        continue;
      }
      if (a === b && !knockout && !t.scoring.allowDraw) a++;
      if (a === b && knockout) {
        if (rng() < 0.5) applyScore(t, stage.id, m.id, { scoreA: a, scoreB: b, penA: 5, penB: 4 });
        else applyScore(t, stage.id, m.id, { scoreA: a, scoreB: b, decided: 'b' });
        continue;
      }
      applyScore(t, stage.id, m.id, { scoreA: a, scoreB: b });
    }
  }
}

/** Kriterlerle çözülemeyen eşitlikleri yönetici gibi karara bağlar */
export function settleTies(t: Tournament, stage: Stage, rng: () => number) {
  for (let i = 0; i < 6; i++) {
    const res = computeStageResult(t, stage);
    if (!res.ties.length) return res;
    for (const tie of res.ties) {
      const existing = stage.manualOrder?.[tie.scope] ?? [];
      const order = [...existing.filter((x) => !tie.teamIds.includes(x)), ...tie.teamIds.slice().sort(() => rng() - 0.5)];
      setManualOrder(t, stage.id, tie.scope, order);
    }
  }
  const res = computeStageResult(t, stage);
  expect(res.ties).toEqual([]);
  return res;
}

/** Bir turdaki takımlar (eleme için çözülmüş) */
export function teamsByRound(stage: Stage): Map<number, TeamId[]> {
  const res = stage.type === 'eleme' || stage.type === 'on-eleme' ? resolveStage(stage) : null;
  const out = new Map<number, TeamId[]>();
  for (const m of stage.matches) {
    const key = m.round;
    if (!out.has(key)) out.set(key, []);
    const ids = res
      ? [res.get(m.id)!.a, res.get(m.id)!.b]
      : [m.a.kind === 'team' ? m.a.teamId : null, m.b.kind === 'team' ? m.b.teamId : null];
    for (const id of ids) if (id && id !== '__BAY__') out.get(key)!.push(id);
  }
  return out;
}

export function expectNoDoubleBooking(stage: Stage) {
  const byRound = teamsByRound(stage);
  for (const [round, ids] of byRound) {
    const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
    expect(dup, `${stage.name} ${round}. tur/haftada aynı takım iki kez`).toEqual([]);
  }
}

export function expectedOut(stage: StagePlan, inCount: number): number {
  const s = stage.settings;
  if (stage.type === 'on-eleme') return s.target!;
  if (stage.type === 'eleme') return 1;
  const G = stage.type === 'lig' ? 1 : s.groupCount!;
  return G * (s.qualifiersPerGroup ?? 0) + (s.bestExtra?.enabled ? s.bestExtra.count : 0) || inCount;
}

/** Planı uçtan uca oynatır ve tüm değişmezlikleri denetler; şampiyonu döner */
export function runPlan(n: number, plan: StagePlan[], mode: DrawMode, seed: number, sport = 'Futbol'): { t: Tournament; champion: TeamId } {
  const t = makeTournament(n, { seed, sport });
  setFormat(t, plan);
  const rng = createRng(seed + 1);
  let incoming = n;
  t.stages.forEach((stage, idx) => {
    const p = proposeDraw(t, stage.id, mode, seed + idx);
    expect(describeProposal(t, p).length).toBeGreaterThan(5);
    applyDraw(t, p);
    checkPlacement(t, stage, incoming, mode);
    checkRoundRobin(stage);
    expectNoDoubleBooking(stage);
    playStage(t, stage, rng);
    expect(stageProgress(stage).complete, `${stage.name} tamamlanmalı`).toBe(true);
    expectNoDoubleBooking(stage);
    checkStandings(t, stage);
    const res = settleTies(t, stage, rng);
    if (idx < t.stages.length - 1) {
      const exp = expectedOut(plan[idx], incoming);
      expect(res.qualifiers.length, `${stage.name}: üst tura çıkan sayısı`).toBe(exp);
      expect(new Set(res.qualifiers.map((q) => q.teamId)).size).toBe(exp);
      completeStage(t, stage.id);
      incoming = exp;
    } else {
      completeStage(t, stage.id);
    }
  });
  const champ = suggestChampion(t);
  expect(champ?.champion, 'şampiyon belirlenmeli').toBeTruthy();
  expect(t.teams.some((x) => x.id === champ!.champion)).toBe(true);
  if (champ?.runnerUp) expect(champ.runnerUp).not.toBe(champ.champion);
  return { t, champion: champ!.champion! };
}

export function checkPlacement(t: Tournament, stage: Stage, incoming: number, mode: DrawMode) {
  const entrants = stage.entrants!.map((e) => e.teamId);
  expect(entrants.length).toBe(incoming);
  expect(new Set(entrants).size).toBe(incoming);
  let placed: TeamId[] = [];
  if (stage.type === 'grup' || stage.type === 'lig') {
    placed = stage.groups!.flatMap((g) => g.teamIds);
    const sizes = stage.groups!.map((g) => g.teamIds.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    if (stage.type === 'grup' && mode === 'dengeli') {
      // Her gruba her torbadan en fazla bir takım
      for (const g of stage.groups!) {
        const pots = g.teamIds.map((id) => stage.drawSteps!.find((s) => s.teamId === id)!.from);
        expect(new Set(pots).size, `${g.name} grubunda aynı torbadan iki takım`).toBe(pots.length);
      }
    }
  } else if (stage.type === 'on-eleme') {
    placed = [...stage.direct!, ...stage.matches.flatMap((m) => [m.a, m.b]).map((s) => (s.kind === 'team' ? s.teamId : ''))];
    const target = stage.settings.target!;
    expect(stage.matches.length).toBe(incoming - target);
    if (mode === 'dengeli') {
      const minDirect = Math.min(...stage.direct!.map((id) => power(t, id)));
      for (const m of stage.matches) {
        for (const s of [m.a, m.b]) if (s.kind === 'team') expect(power(t, s.teamId)).toBeLessThanOrEqual(minDirect);
      }
    }
  } else {
    const first = stage.matches.filter((m) => m.round === 1);
    placed = first.flatMap((m) => [m.a, m.b]).filter((s) => s.kind === 'team').map((s) => (s as { teamId: TeamId }).teamId);
    const size = first.length * 2;
    expect(size & (size - 1)).toBe(0);
    expect(first.filter((m) => m.a.kind === 'bye' || m.b.kind === 'bye').length).toBe(size - incoming);
    expect(first.some((m) => m.a.kind === 'bye' && m.b.kind === 'bye')).toBe(false);
  }
  expect(placed.length, `${stage.name}: yerleşen takım sayısı`).toBe(incoming);
  expect(new Set(placed)).toEqual(new Set(entrants));
}

export function checkRoundRobin(stage: Stage) {
  if (stage.type !== 'grup' && stage.type !== 'lig') return;
  const legs = stage.settings.legs ?? 1;
  for (const g of stage.groups!) {
    const ms = stage.matches.filter((m) => m.group === g.name);
    const n = g.teamIds.length;
    expect(ms.length).toBe(((n * (n - 1)) / 2) * legs);
    const pairs = new Map<string, number[]>();
    for (const m of ms) {
      const a = (m.a as { teamId: TeamId }).teamId;
      const b = (m.b as { teamId: TeamId }).teamId;
      expect(a).not.toBe(b);
      const key = [a, b].sort().join('|');
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key)!.push(m.round);
    }
    expect(pairs.size).toBe((n * (n - 1)) / 2);
    for (const [, rounds] of pairs) {
      expect(rounds.length).toBe(legs);
      // rövanşlı ligde iki takım aynı haftada iki kez eşleşmez
      expect(new Set(rounds).size).toBe(legs);
    }
  }
}

export function checkStandings(t: Tournament, stage: Stage) {
  if (stage.type !== 'grup' && stage.type !== 'lig') return;
  for (const tb of groupTables(t, stage)) {
    const g = stage.groups!.find((x) => x.name === tb.group)!;
    const ids = tb.rows.map((r) => r.teamId);
    expect(new Set(ids).size, 'puan durumunda takım tekrarı').toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(g.teamIds));
    const played = tb.rows.reduce((s, r) => s + r.played, 0);
    expect(played).toBe(stage.matches.filter((m) => m.group === g.name).length * 2);
    tb.rows.forEach((r, i) => {
      expect(r.rank).toBe(i + 1);
      if (i > 0) expect(tb.rows[i - 1].points).toBeGreaterThanOrEqual(r.points);
      expect(r.won + r.drawn + r.lost).toBe(r.played);
    });
  }
}
