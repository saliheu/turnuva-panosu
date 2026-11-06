import { buildGroupMatches } from './draw';
import type { StagePlan } from './planner';
import { computeStageResult, stageProgress, suggestChampion } from './qualify';
import { hasResult, hasScore, resolveStage } from './results';
import type { Match, Qualifier, Scoring, Slot, Stage, Team, TeamId, Tournament, TournamentSummary } from './types';
import { clone, currentSchoolYear, uid } from './util';

export const SPORTS = ['Futbol', 'Voleybol', 'Basketbol', 'Hentbol', 'Badminton', 'Masa Tenisi', 'Diğer'];

export function scoringPreset(sport: string): Scoring {
  const s = sport.toLocaleLowerCase('tr');
  if (s.includes('voleybol')) {
    return { win: 3, draw: 0, loss: 0, forfeitLoss: 0, allowDraw: false, volleyball: true, forfeitScore: [3, 0], unit: 'Set' };
  }
  if (s.includes('basketbol')) {
    return { win: 2, draw: 0, loss: 1, forfeitLoss: 0, allowDraw: false, volleyball: false, forfeitScore: [20, 0], unit: 'Sayı' };
  }
  if (s.includes('badminton') || s.includes('masa tenisi') || s.includes('tenis')) {
    return { win: 2, draw: 0, loss: 0, forfeitLoss: 0, allowDraw: false, volleyball: false, forfeitScore: [2, 0], unit: 'Set' };
  }
  if (s.includes('hentbol')) {
    return { win: 3, draw: 1, loss: 0, forfeitLoss: 0, allowDraw: true, volleyball: false, forfeitScore: [10, 0], unit: 'Gol' };
  }
  if (s.includes('futbol')) {
    return { win: 3, draw: 1, loss: 0, forfeitLoss: 0, allowDraw: true, volleyball: false, forfeitScore: [3, 0], unit: 'Gol' };
  }
  return { win: 3, draw: 1, loss: 0, forfeitLoss: 0, allowDraw: true, volleyball: false, forfeitScore: [3, 0], unit: 'Skor' };
}

export function slugify(s: string): string {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  return s
    .toLocaleLowerCase('tr')
    .replace(/[çğıiöşüâîû]/g, (c) => map[c] ?? c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function newTournament(input: { name: string; sport: string; schoolYear?: string; category?: string; description?: string }): Tournament {
  const now = new Date().toISOString();
  const base = slugify(`${input.name}`) || 'turnuva';
  return {
    id: `${base}-${uid().slice(0, 5)}`,
    name: input.name.trim(),
    sport: input.sport,
    category: input.category?.trim() || undefined,
    schoolYear: input.schoolYear || currentSchoolYear(),
    description: input.description,
    status: 'taslak',
    archived: false,
    createdAt: now,
    updatedAt: now,
    version: 0,
    scoring: scoringPreset(input.sport),
    teams: [],
    stages: [],
  };
}

export function teamName(t: Tournament, id: TeamId | null | undefined): string {
  if (!id) return '';
  return t.teams.find((x) => x.id === id)?.name ?? '?';
}

/** "Takım A;7" veya "Takım A" satırlarından takım listesi */
export function parseTeamLines(text: string): { name: string; power: number; members: string[] }[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [namePart, powerPart, membersPart] = line.split(/[;\t]/).map((x) => x?.trim());
      const p = Number(powerPart);
      return {
        name: namePart,
        power: Number.isFinite(p) && p >= 1 && p <= 10 ? Math.round(p) : 5,
        members: membersPart ? membersPart.split(',').map((x) => x.trim()).filter(Boolean) : [],
      };
    })
    .filter((x) => x.name);
}

export function addTeams(t: Tournament, items: { name: string; power?: number; members?: string[] }[]): Team[] {
  const created = items.map((it) => ({
    id: uid('t'),
    name: it.name.trim(),
    power: Math.min(10, Math.max(1, Math.round(it.power ?? 5))),
    members: it.members ?? [],
  }));
  t.teams.push(...created);
  return created;
}

/** Plan aşamalarından turnuva aşamalarını oluşturur (kura çekilmiş aşama varsa önce sıfırlanmalı) */
export function setFormat(t: Tournament, plan: StagePlan[]): void {
  t.stages = plan.map((p, i) => ({
    id: `s${i + 1}${uid().slice(0, 3)}`,
    type: p.type,
    name: p.name,
    settings: clone(p.settings),
    status: 'bekliyor',
    matches: [],
  }));
}

export function hasAnyDraw(t: Tournament): boolean {
  return t.stages.some((s) => s.matches.length > 0);
}

export function totalResults(t: Tournament): number {
  return t.stages.reduce((n, s) => n + s.matches.filter(hasResult).length, 0);
}

// ---------------------------------------------------------------------------
// Skor girişi
// ---------------------------------------------------------------------------

export interface ScorePatch {
  scoreA?: number | null;
  scoreB?: number | null;
  penA?: number | null;
  penB?: number | null;
  decided?: 'a' | 'b' | null;
  forfeit?: 'a' | 'b' | null;
  date?: string;
  time?: string;
  venue?: string;
  note?: string;
}

export function findMatch(t: Tournament, stageId: string, matchId: string): { stage: Stage; match: Match } {
  const stage = t.stages.find((s) => s.id === stageId);
  const match = stage?.matches.find((m) => m.id === matchId);
  if (!stage || !match) throw new Error('Maç bulunamadı');
  return { stage, match };
}

/** Skor girişinin geçerliliğini denetler; hata mesajı veya null döner */
export function validateScore(t: Tournament, stage: Stage, m: Match, patch: ScorePatch): string | null {
  const next = { ...m, ...patch };
  if (next.forfeit) return null;
  const a = next.scoreA;
  const b = next.scoreB;
  if ((a == null) !== (b == null)) return 'İki skoru da girin veya ikisini de boş bırakın.';
  if (a == null || b == null) return null;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return 'Skorlar 0 veya pozitif tam sayı olmalı.';
  if (a === b) {
    if (stage.type === 'eleme' || stage.type === 'on-eleme') {
      const pensOk = next.penA != null && next.penB != null && next.penA !== next.penB;
      if (!pensOk && !next.decided) return 'Eleme maçında beraberlik: penaltı skorunu girin veya kazananı seçin.';
    } else if (!t.scoring.allowDraw) {
      return `${t.sport} için beraberlik girilemez (ayarlardan açılabilir).`;
    }
  }
  return null;
}

export interface Impact {
  /** Bu değişiklik yüzünden sonuçları silinecek maçlar */
  clears: { stageId: string; matchId: string; text: string }[];
  warnings: string[];
}

/** Eleme maçında kazananın değişmesi sonraki maçları etkiler mi? */
export function scoreImpact(t: Tournament, stageId: string, matchId: string, patch: ScorePatch): Impact {
  const { stage } = findMatch(t, stageId, matchId);
  const warnings: string[] = [];
  const clears: Impact['clears'] = [];
  if (stage.type === 'eleme' || stage.type === 'on-eleme') {
    const before = resolveStage(stage);
    const copy = clone(stage);
    Object.assign(copy.matches.find((m) => m.id === matchId)!, patch);
    const after = resolveStage(copy);
    for (const m of stage.matches) {
      if (m.id === matchId || !hasResult(m)) continue;
      const b = before.get(m.id)!;
      const a = after.get(m.id)!;
      if (b.a !== a.a || b.b !== a.b) {
        clears.push({ stageId, matchId: m.id, text: `Maç ${m.no}: ${teamName(t, b.a)} - ${teamName(t, b.b)} (${m.scoreA ?? ''}-${m.scoreB ?? ''})` });
      }
    }
  }
  const idx = t.stages.findIndex((s) => s.id === stageId);
  const next = t.stages[idx + 1];
  if (stage.status === 'bitti' && next && next.matches.length) {
    warnings.push('Bu aşama tamamlandı ve sonraki aşamanın kurası çekildi. Skor değişikliği sonraki aşamadaki eşleşmeleri otomatik değiştirmez.');
  }
  return { clears, warnings };
}

function clearResult(m: Match) {
  m.scoreA = null;
  m.scoreB = null;
  m.penA = null;
  m.penB = null;
  m.decided = null;
  m.forfeit = null;
}

/** Skoru uygular. Etkilenen maçlar (impact.clears) yalnızca confirmClears true ise temizlenir. */
export function applyScore(t: Tournament, stageId: string, matchId: string, patch: ScorePatch, confirmClears = false): Impact {
  const { stage, match } = findMatch(t, stageId, matchId);
  const err = validateScore(t, stage, match, patch);
  if (err) throw new Error(err);
  const impact = scoreImpact(t, stageId, matchId, patch);
  if (impact.clears.length && !confirmClears) {
    throw new Error('Bu değişiklik oynanmış maçları etkiliyor; onay gerekli.');
  }
  const next: ScorePatch = { ...patch };
  if (next.forfeit) {
    const [w, l] = t.scoring.forfeitScore;
    next.scoreA = next.forfeit === 'a' ? w : l;
    next.scoreB = next.forfeit === 'a' ? l : w;
    next.penA = null;
    next.penB = null;
    next.decided = null;
  } else if ('scoreA' in patch || 'scoreB' in patch) {
    next.forfeit = null;
    if (patch.scoreA != null && patch.scoreA !== patch.scoreB) {
      next.penA = null;
      next.penB = null;
      next.decided = null;
    }
  }
  Object.assign(match, next);
  for (const c of impact.clears) {
    const m = stage.matches.find((x) => x.id === c.matchId);
    if (m) clearResult(m);
  }
  if (stage.status === 'bekliyor') stage.status = 'devam';
  return impact;
}

export function clearScore(t: Tournament, stageId: string, matchId: string, confirmClears = false): Impact {
  const { match } = findMatch(t, stageId, matchId);
  const patch: ScorePatch = { scoreA: null, scoreB: null, penA: null, penB: null, decided: null, forfeit: null };
  const impact = scoreImpact(t, stageId, matchId, patch);
  if (impact.clears.length && !confirmClears) throw new Error('Bu değişiklik oynanmış maçları etkiliyor; onay gerekli.');
  clearResult(match);
  const { stage } = findMatch(t, stageId, matchId);
  for (const c of impact.clears) {
    const m = stage.matches.find((x) => x.id === c.matchId);
    if (m) clearResult(m);
  }
  return impact;
}

// ---------------------------------------------------------------------------
// Kuradan sonra eşleşme düzenleme
// ---------------------------------------------------------------------------

/** Eleme/ön eleme maçında bir tarafı başka takımla değiştirir. Aynı turdaki yerleriyle takas edilir. */
export function setMatchTeam(t: Tournament, stageId: string, matchId: string, side: 'a' | 'b', teamId: TeamId): void {
  const { stage, match } = findMatch(t, stageId, matchId);
  if (stage.type !== 'eleme' && stage.type !== 'on-eleme') throw new Error('Gruplarda takım değiştirmek için grup takası kullanın.');
  if (hasResult(match)) throw new Error('Oynanmış maçın takımları değiştirilemez. Önce skoru silin.');
  const res = resolveStage(stage);
  const sameRound = stage.matches.filter((m) => m.round === match.round && !m.third);
  // takımın bu turdaki mevcut yeri
  let other: { m: Match; side: 'a' | 'b' } | null = null;
  for (const m of sameRound) {
    const r = res.get(m.id)!;
    if (r.a === teamId && !(m.id === match.id && side === 'a')) other = { m, side: 'a' };
    if (r.b === teamId && !(m.id === match.id && side === 'b')) other = { m, side: 'b' };
  }
  if (stage.type === 'on-eleme' && !other && stage.direct?.includes(teamId)) {
    // doğrudan geçen bir takımı ön elemeye al, çıkanı doğrudan geçenlere koy
    const cur = match[side].kind === 'team' ? (match[side] as { teamId: TeamId }).teamId : null;
    stage.direct = stage.direct.map((id) => (id === teamId ? cur! : id));
    match[side] = { kind: 'team', teamId };
    return;
  }
  const current: Slot = match[side];
  if (other) {
    if (hasResult(other.m)) throw new Error('Bu takım bu turda oynanmış bir maçta; takas yapılamaz.');
    // Ham yerleri takas et: önceki maçtan gelen bağlantılar da birlikte taşınır
    const otherSlot = other.m[other.side];
    other.m[other.side] = current;
    match[side] = otherSlot;
    const la = side === 'a' ? 'labelA' : 'labelB';
    const lb = other.side === 'a' ? 'labelA' : 'labelB';
    const tmp = match[la];
    match[la] = other.m[lb];
    other.m[lb] = tmp;
  } else {
    match[side] = { kind: 'team', teamId };
  }
}

/** Sonraki turda elle verilmiş takımı yeniden "önceki maçın galibi" yapar */
export function restoreSlotSource(t: Tournament, stageId: string, matchId: string, side: 'a' | 'b'): void {
  const { stage, match } = findMatch(t, stageId, matchId);
  if (stage.type !== 'eleme' || match.round === 1) return;
  if (match.third) {
    const semis = stage.matches.filter((m) => m.round === match.round - 1);
    match[side] = { kind: 'loser', matchId: semis[side === 'a' ? 0 : 1].id };
    return;
  }
  const prev = stage.matches.filter((m) => m.round === match.round - 1 && !m.third).sort((x, y) => x.order - y.order);
  match[side] = { kind: 'winner', matchId: prev[match.order * 2 + (side === 'a' ? 0 : 1)].id };
}

/** Grup takası sonucunda kaybolacak oynanmış maçlar */
export function groupSwapImpact(t: Tournament, stageId: string, x: TeamId, y: TeamId): Impact {
  const stage = t.stages.find((s) => s.id === stageId)!;
  const copy = clone(stage);
  swapGroupTeamsInStage(copy, x, y);
  const keys = new Set(copy.matches.map((m) => pairKey(m)));
  const clears = stage.matches
    .filter((m) => hasResult(m) && !keys.has(pairKey(m)))
    .map((m) => ({ stageId, matchId: m.id, text: `${m.group} Grubu: ${teamName(t, slotId(m.a))} - ${teamName(t, slotId(m.b))} (${m.scoreA}-${m.scoreB})` }));
  return { clears, warnings: [] };
}

function slotId(s: Slot): TeamId | null {
  return s.kind === 'team' ? s.teamId : null;
}

function pairKey(m: Match): string {
  const a = slotId(m.a) ?? '';
  const b = slotId(m.b) ?? '';
  return [a, b].sort().join('|') + `|${m.leg ?? 1}`;
}

function swapGroupTeamsInStage(stage: Stage, x: TeamId, y: TeamId) {
  if (!stage.groups) return;
  const gx = stage.groups.find((g) => g.teamIds.includes(x));
  const gy = stage.groups.find((g) => g.teamIds.includes(y));
  if (!gx || !gy) throw new Error('Takım bu aşamada değil.');
  if (gx === gy) return;
  gx.teamIds = gx.teamIds.map((id) => (id === x ? y : id));
  gy.teamIds = gy.teamIds.map((id) => (id === y ? x : id));
  // etkilenen iki grubun fikstürünü yeniden kur, aynı eşleşmelerin skorlarını/tarihlerini koru
  const old = new Map(stage.matches.map((m) => [pairKey(m), m]));
  const rebuilt = buildGroupMatches(stage.id, stage.groups, stage.settings.legs ?? 1);
  stage.matches = rebuilt.map((m) => {
    const prev = old.get(pairKey(m));
    if (!prev) return m;
    const sameOrientation = slotId(prev.a) === slotId(m.a);
    const kept: Match = { ...m, date: prev.date, time: prev.time, venue: prev.venue, note: prev.note, forfeit: prev.forfeit };
    if (sameOrientation) {
      kept.scoreA = prev.scoreA;
      kept.scoreB = prev.scoreB;
    } else {
      kept.scoreA = prev.scoreB;
      kept.scoreB = prev.scoreA;
      kept.forfeit = prev.forfeit ? (prev.forfeit === 'a' ? 'b' : 'a') : prev.forfeit;
    }
    return kept;
  });
}

/** İki takımın gruplarını takas eder (farklı gruplardaysa). */
export function swapGroupTeams(t: Tournament, stageId: string, x: TeamId, y: TeamId, confirmClears = false): Impact {
  const impact = groupSwapImpact(t, stageId, x, y);
  if (impact.clears.length && !confirmClears) throw new Error('Bu değişiklik oynanmış maçları siler; onay gerekli.');
  const stage = t.stages.find((s) => s.id === stageId)!;
  swapGroupTeamsInStage(stage, x, y);
  if (stage.manualOrder) stage.manualOrder = {};
  return impact;
}

// ---------------------------------------------------------------------------
// Aşama yaşam döngüsü
// ---------------------------------------------------------------------------

export function redrawImpact(t: Tournament, stageId: string): { played: number; laterDrawn: string[] } {
  const idx = t.stages.findIndex((s) => s.id === stageId);
  const stage = t.stages[idx];
  return {
    played: stage.matches.filter(hasResult).length,
    laterDrawn: t.stages.slice(idx + 1).filter((s) => s.matches.length).map((s) => s.name),
  };
}

/** Aşamanın kurasını ve sonraki aşamaları sıfırlar (yeniden kura için) */
export function resetStage(t: Tournament, stageId: string): void {
  const idx = t.stages.findIndex((s) => s.id === stageId);
  for (const s of t.stages.slice(idx)) {
    s.matches = [];
    s.groups = undefined;
    s.direct = undefined;
    s.qualifiers = undefined;
    s.manualOrder = {};
    s.drawSteps = undefined;
    s.drawSummary = undefined;
    s.status = 'bekliyor';
    if (s !== t.stages[idx]) s.entrants = undefined;
  }
}

/** Aşamayı onaylanmış üst tura çıkanlarla tamamlar */
export function completeStage(t: Tournament, stageId: string, qualifiers?: Qualifier[]): void {
  const idx = t.stages.findIndex((s) => s.id === stageId);
  const stage = t.stages[idx];
  const progress = stageProgress(stage);
  if (!progress.complete) throw new Error('Aşamadaki tüm maçlar oynanmadan aşama tamamlanamaz.');
  const result = computeStageResult(t, stage);
  const q = qualifiers ?? result.qualifiers;
  const ids = q.map((x) => x.teamId);
  if (new Set(ids).size !== ids.length) throw new Error('Üst tura çıkanlar listesinde aynı takım iki kez var.');
  stage.qualifiers = q.map((x, i) => ({ ...x, rank: i + 1 }));
  stage.status = 'bitti';
  const next = t.stages[idx + 1];
  if (next && !next.matches.length) next.entrants = stage.qualifiers;
}

/** Tamamlanan aşamayı yeniden açar (sonraki aşamanın kurası çekilmemişse) */
export function reopenStage(t: Tournament, stageId: string): void {
  const idx = t.stages.findIndex((s) => s.id === stageId);
  const next = t.stages[idx + 1];
  if (next && next.matches.length) throw new Error('Sonraki aşamanın kurası çekildi; önce onu sıfırlayın.');
  const stage = t.stages[idx];
  stage.status = 'devam';
  stage.qualifiers = undefined;
  if (next) next.entrants = undefined;
}

export function setManualOrder(t: Tournament, stageId: string, scope: string, order: TeamId[]): void {
  const stage = t.stages.find((s) => s.id === stageId)!;
  stage.manualOrder = { ...(stage.manualOrder ?? {}), [scope]: order };
}

// ---------------------------------------------------------------------------
// Takımlar
// ---------------------------------------------------------------------------

/** Ayrılan takımın yerine yeni takım koyar: eski maçlar ve yeri yeni takıma geçer, eski ad saklanır. */
export function replaceTeam(t: Tournament, teamId: TeamId, newName: string, power?: number, members?: string[]): void {
  const team = t.teams.find((x) => x.id === teamId);
  if (!team) throw new Error('Takım bulunamadı');
  team.formerNames = [...(team.formerNames ?? []), team.name];
  team.name = newName.trim();
  if (power) team.power = power;
  team.members = members ?? [];
  team.withdrawn = false;
}

/** Çekilen takımın oynanmamış maçlarını hükmen kaybettirir. */
export function withdrawTeam(t: Tournament, teamId: TeamId): number {
  const team = t.teams.find((x) => x.id === teamId);
  if (!team) throw new Error('Takım bulunamadı');
  team.withdrawn = true;
  let count = 0;
  for (const stage of t.stages) {
    if (stage.status === 'bitti' || !stage.matches.length) continue;
    const res = stage.type === 'eleme' || stage.type === 'on-eleme' ? resolveStage(stage) : null;
    for (const m of stage.matches) {
      if (hasResult(m)) continue;
      const a = res ? res.get(m.id)!.a : slotId(m.a);
      const b = res ? res.get(m.id)!.b : slotId(m.b);
      if (!a || !b || a === '__BAY__' || b === '__BAY__') continue;
      if (a === teamId || b === teamId) {
        const winner = a === teamId ? 'b' : 'a';
        const [w, l] = t.scoring.forfeitScore;
        m.forfeit = winner;
        m.scoreA = winner === 'a' ? w : l;
        m.scoreB = winner === 'a' ? l : w;
        count++;
      }
    }
  }
  return count;
}

/** Takım herhangi bir aşamada kullanılıyor mu (silinebilir mi) */
export function teamInUse(t: Tournament, teamId: TeamId): boolean {
  return t.stages.some(
    (s) =>
      s.groups?.some((g) => g.teamIds.includes(teamId)) ||
      s.direct?.includes(teamId) ||
      s.matches.some((m) => slotId(m.a) === teamId || slotId(m.b) === teamId) ||
      s.entrants?.some((e) => e.teamId === teamId),
  );
}

// ---------------------------------------------------------------------------
// Özet
// ---------------------------------------------------------------------------

export function currentStage(t: Tournament): Stage | undefined {
  return t.stages.find((s) => s.status !== 'bitti') ?? t.stages[t.stages.length - 1];
}

export function summarize(t: Tournament): TournamentSummary {
  const cur = currentStage(t);
  return {
    id: t.id,
    name: t.name,
    sport: t.sport,
    category: t.category,
    schoolYear: t.schoolYear,
    status: t.status,
    archived: t.archived,
    updatedAt: t.updatedAt,
    teamCount: t.teams.filter((x) => !x.withdrawn).length,
    champion: t.champion?.champion,
    currentStage: cur?.matches.length ? cur.name : undefined,
  };
}

export { suggestChampion, hasScore };
