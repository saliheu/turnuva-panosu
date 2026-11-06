import { roundRobin } from './roundRobin';
import type {
  DrawMode,
  DrawStep,
  Group,
  LiveSlot,
  Match,
  Qualifier,
  Slot,
  Stage,
  Team,
  TeamId,
  Tournament,
} from './types';
import {
  bracketOrder,
  createRng,
  ekLi,
  groupName,
  isPowerOfTwo,
  knockoutRoundName,
  lowerPowerOfTwo,
  nextPowerOfTwo,
  orderByPower,
  ordinalWord,
  shuffle,
} from './util';

/** Kura önizlemesi: kesinleşmeden önce yöneticiye gösterilir ve düzenlenebilir. */
export interface DrawProposal {
  stageId: string;
  type: Stage['type'];
  mode: DrawMode;
  seed: number;
  entrants: Qualifier[];
  /** grup / lig */
  groups?: Group[];
  /** eleme ilk turu (ağaç sırasıyla) veya ön eleme maçları; null = bay */
  pairs?: { a: TeamId | null; b: TeamId | null }[];
  /** ön eleme: doğrudan geçenler */
  direct?: TeamId[];
  /** Takım etiketleri (A1, seri başı no ...) */
  labels: Record<TeamId, string>;
  steps: DrawStep[];
  notes: string[];
  /** İlk aşama eleme ise kullanılan diziliş */
  seeding?: 'kademeli' | 'kesin';
}

export function stageIndex(t: Tournament, stageId: string): number {
  return t.stages.findIndex((s) => s.id === stageId);
}

/** Bu aşamaya girecek takımlar; ilk aşamada çekilmemiş tüm takımlar. */
export function stageEntrants(t: Tournament, stageId: string): Qualifier[] | null {
  const idx = stageIndex(t, stageId);
  if (idx < 0) return null;
  if (idx === 0) {
    return t.teams
      .filter((tm) => !tm.withdrawn)
      .map((tm, i) => ({ teamId: tm.id, label: '', rank: i + 1 }));
  }
  const prev = t.stages[idx - 1];
  if (prev.status !== 'bitti' || !prev.qualifiers) return null;
  return prev.qualifiers.map((q) => ({ ...q }));
}

function teamsOf(t: Tournament, ids: TeamId[]): Team[] {
  const map = new Map(t.teams.map((x) => [x.id, x]));
  return ids.map((id) => map.get(id)!).filter(Boolean);
}

/** Seri başı sırası: dengeli kurada güç (eşitlerde kura), rastgelede tamamen karışık */
function seedOrder(teams: Team[], mode: DrawMode, rng: () => number): Team[] {
  return mode === 'dengeli' ? orderByPower(teams, rng) : shuffle(teams, rng);
}

// ---------------------------------------------------------------------------
// Grup kurası (torbalar)
// ---------------------------------------------------------------------------

export function groupSizes(teamCount: number, groupCount: number): number[] {
  const base = Math.floor(teamCount / groupCount);
  const extra = teamCount % groupCount;
  return Array.from({ length: groupCount }, (_, i) => base + (i < extra ? 1 : 0));
}

function drawGroups(t: Tournament, stage: Stage, entrants: Qualifier[], mode: DrawMode, rng: () => number) {
  const G = stage.type === 'lig' ? 1 : Math.max(1, stage.settings.groupCount ?? 1);
  const teams = teamsOf(
    t,
    entrants.map((e) => e.teamId),
  );
  const groups: Group[] = Array.from({ length: G }, (_, i) => ({
    name: stage.type === 'lig' ? 'Lig' : groupName(i),
    teamIds: [],
  }));
  const steps: DrawStep[] = [];
  const groupLabel = (g: Group) => (stage.type === 'lig' ? 'Lig' : `${g.name} Grubu`);

  if (stage.type === 'lig') {
    const order = shuffle(teams, rng);
    order.forEach((tm, i) => {
      groups[0].teamIds.push(tm.id);
      steps.push({ teamId: tm.id, from: 'Torba', to: `Fikstür sırası ${i + 1}` });
    });
    return { groups, steps };
  }

  if (mode === 'dengeli') {
    const ordered = orderByPower(teams, rng);
    const pots: Team[][] = [];
    for (let i = 0; i < ordered.length; i += G) pots.push(ordered.slice(i, i + G));
    pots.forEach((pot, p) => {
      const drawn = shuffle(pot, rng);
      // eksik torbada hangi grupların fazladan takım alacağı da kurayla belirlenir
      const targets = pot.length === G ? groups.map((_, i) => i) : shuffle(groups.map((_, i) => i), rng).slice(0, pot.length);
      const sortedTargets = pot.length === G ? targets : targets.sort((a, b) => a - b);
      drawn.forEach((tm, i) => {
        const g = groups[sortedTargets[i]];
        g.teamIds.push(tm.id);
        steps.push({ teamId: tm.id, from: `${p + 1}. torba`, to: groupLabel(g) });
      });
    });
  } else {
    const drawn = shuffle(teams, rng);
    drawn.forEach((tm, i) => {
      const g = groups[i % G];
      g.teamIds.push(tm.id);
      steps.push({ teamId: tm.id, from: 'Torba', to: groupLabel(g) });
    });
  }
  return { groups, steps };
}

// ---------------------------------------------------------------------------
// Eleme ağacı
// ---------------------------------------------------------------------------

/** Sıralı takımları seri başı mantığıyla ağaca yerleştirir; eksik yerler bay olur. */
export function seededPairs(ordered: TeamId[]): { a: TeamId | null; b: TeamId | null }[] {
  const size = nextPowerOfTwo(Math.max(2, ordered.length));
  const pos = bracketOrder(size);
  const pairs: { a: TeamId | null; b: TeamId | null }[] = [];
  for (let i = 0; i < size; i += 2) {
    const sa = pos[i];
    const sb = pos[i + 1];
    pairs.push({ a: ordered[sa - 1] ?? null, b: ordered[sb - 1] ?? null });
  }
  return pairs;
}

/**
 * Güce göre eleme ağacı (ön eleme dahil).
 *
 * Takımlar güç sırasıyla verilir (1 = en güçlü). Takım sayısı 2'nin kuvveti değilse ana tablo
 * T = n'nin altındaki en büyük 2'nin kuvveti olur; en zayıf 2·(n−T) takım ön eleme oynar ve
 * her ön eleme maçı ana tablodaki bir yerin sahibini belirler.
 *
 * - "kesin": 1. ile sonuncu, 2. ile sondan bir önceki eşleşir; ön elemede de en güçlü ön elemeci
 *   en zayıfla oynar. Aynı güç sırası her zaman aynı ağacı verir.
 * - "kademeli": ağaçtaki yerler kademelere bölünür (1-2, 3-4, 5-8, 9-16 ...) ve her kademenin
 *   takımları kendi yerleri arasında kurayla dağıtılır. Böylece:
 *     · 1. ve 2. ağacın farklı yarılarındadır (ancak finalde karşılaşabilir),
 *     · ilk 4 farklı çeyreklerdedir (ancak yarı finalde), ilk 8 farklı sekizde birlerdedir ...
 *     · ana tablonun ilk turunda güçlü yarıdaki her takımın rakibi zayıf yarıdan kurayla gelir,
 *   ama her kurada farklı bir ağaç çıkar. Ön elemeyi yine en zayıflar oynar; eşleşmeleri kurayla belirlenir.
 */
export function balancedPairs(ordered: TeamId[], style: 'kesin' | 'kademeli', rng: () => number): { a: TeamId | null; b: TeamId | null }[] {
  const n = ordered.length;
  const T = isPowerOfTwo(n) ? n : lowerPowerOfTwo(n);
  const m = n - T;
  const directCount = n - 2 * m;
  // Ön eleme eşleşmeleri; i. eşleşme ana tablodaki (directCount + 1 + i). sıranın yerini alır
  const prelimTeams = ordered.slice(directCount);
  const prelimPairs: [TeamId, TeamId][] = [];
  if (style === 'kesin') {
    for (let i = 0; i < m; i++) prelimPairs.push([prelimTeams[i], prelimTeams[2 * m - 1 - i]]);
  } else {
    // Ön elemecilerin güçlü yarısı birbiriyle eşleşmez: her biri zayıf yarıdan kurayla bir rakip alır.
    // Eşleşmenin ana tablodaki yeri güçlü takımın sırasına göre belirlenir (sonra kademe kurası karıştırır).
    const upper = prelimTeams.slice(0, m);
    const lower = shuffle(prelimTeams.slice(m), rng);
    for (let i = 0; i < m; i++) prelimPairs.push([upper[i], lower[i]]);
  }
  const slotSeed = bracketOrder(T);
  if (style === 'kademeli') {
    for (let lo = 1, hi = Math.min(2, T); lo <= T; lo = hi + 1, hi = Math.min(hi * 2, T)) {
      const slots = slotSeed.map((s, i) => (s >= lo && s <= hi ? i : -1)).filter((i) => i >= 0);
      const seeds = shuffle(
        slots.map((i) => slotSeed[i]),
        rng,
      );
      slots.forEach((slot, k) => (slotSeed[slot] = seeds[k]));
    }
  }
  if (m === 0) {
    const pairs: { a: TeamId | null; b: TeamId | null }[] = [];
    for (let k = 0; k < T; k += 2) pairs.push({ a: ordered[slotSeed[k] - 1], b: ordered[slotSeed[k + 1] - 1] });
    return pairs;
  }
  // Ön eleme varsa: ana tablonun her yeri ilk turda ya bay geçen bir takım ya da bir ön eleme maçıdır
  return slotSeed.map((s) => (s <= directCount ? { a: ordered[s - 1], b: null } : { a: prelimPairs[s - directCount - 1][0], b: prelimPairs[s - directCount - 1][1] }));
}

/** İlk turda aynı gruptan gelenleri ayırmak için takas yapar. */
export function avoidSameGroup(
  pairs: { a: TeamId | null; b: TeamId | null }[],
  groupOf: (id: TeamId) => string | undefined,
): { pairs: { a: TeamId | null; b: TeamId | null }[]; unresolved: number } {
  const out = pairs.map((p) => ({ ...p }));
  const clash = (p: { a: TeamId | null; b: TeamId | null }) =>
    !!p.a && !!p.b && groupOf(p.a) !== undefined && groupOf(p.a) === groupOf(p.b);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < out.length; i++) {
      if (!clash(out[i])) continue;
      // en yakın eşleşmeyle "b" takımlarını değiştirmeyi dene
      const candidates = out
        .map((_, j) => j)
        .filter((j) => j !== i)
        .sort((x, y) => Math.abs(x - i) - Math.abs(y - i));
      for (const j of candidates) {
        const pi = out[i];
        const pj = out[j];
        if (!pj.b || !pj.a) continue;
        const ni = { a: pi.a, b: pj.b };
        const nj = { a: pj.a, b: pi.b };
        if (!clash(ni) && !clash(nj)) {
          out[i] = ni;
          out[j] = nj;
          break;
        }
      }
    }
  }
  return { pairs: out, unresolved: out.filter(clash).length };
}

/** Çapraz eşleşme: A1-B2, C1-D2 üst yarıda; B1-A2, D1-C2 alt yarıda. */
export function crossPairs(qs: Qualifier[]): { a: TeamId; b: TeamId }[] | null {
  // Gruplar ada göre (A, B, C ...) eşlenir; başarı sırası önemli değil
  const groups = [...new Set(qs.map((q) => q.group).filter((g): g is string => !!g))].sort((a, b) => a.length - b.length || a.localeCompare(b));
  if (groups.length < 2 || groups.length % 2 !== 0) return null;
  if (qs.some((q) => !q.group || !q.position)) return null;
  const k = Math.max(...qs.map((q) => q.position!));
  if (k > 2) return null;
  if (qs.length !== groups.length * k) return null;
  if (!isPowerOfTwo(qs.length)) return null;
  const find = (g: string, p: number) => qs.find((q) => q.group === g && q.position === p)!.teamId;
  const top: { a: TeamId; b: TeamId }[] = [];
  const bottom: { a: TeamId; b: TeamId }[] = [];
  for (let i = 0; i < groups.length; i += 2) {
    const X = groups[i];
    const Y = groups[i + 1];
    if (k === 1) top.push({ a: find(X, 1), b: find(Y, 1) });
    else {
      top.push({ a: find(X, 1), b: find(Y, 2) });
      bottom.push({ a: find(Y, 1), b: find(X, 2) });
    }
  }
  return [...top, ...bottom];
}

function drawKnockout(t: Tournament, stage: Stage, entrants: Qualifier[], mode: DrawMode, rng: () => number, isFirst: boolean, seeding: 'kademeli' | 'kesin') {
  const notes: string[] = [];
  const labels: Record<TeamId, string> = {};
  let pairs: { a: TeamId | null; b: TeamId | null }[];
  const steps: DrawStep[] = [];

  if (isFirst) {
    const ordered = seedOrder(teamsOf(t, entrants.map((e) => e.teamId)), mode, rng).map((x) => x.id);
    if (mode === 'dengeli') {
      ordered.forEach((id, i) => (labels[id] = String(i + 1)));
      pairs = balancedPairs(ordered, seeding, rng);
    } else pairs = seededPairs(ordered);
  } else {
    const fromGroups = entrants.some((e) => e.group);
    const pairing = stage.settings.pairing ?? (fromGroups ? 'capraz' : 'sirali');
    for (const e of entrants) labels[e.teamId] = e.label;
    let made: { a: TeamId | null; b: TeamId | null }[] | null = null;
    if (mode === 'rastgele') {
      made = seededPairs(shuffle(entrants, rng).map((e) => e.teamId));
      notes.push('Eşleşmeler rastgele kurayla belirlendi.');
    } else if (pairing === 'capraz') {
      made = crossPairs(entrants);
      if (!made) notes.push('Bu planda çapraz eşleşme yapılamıyor (grup sayısı çift olmalı ve her gruptan 1 veya 2 takım çıkmalı). Eşleşmeler başarı sırasına göre yapıldı: en iyi takım en zayıfla oynar.');
    }
    if (!made) {
      const ordered = entrants.slice().sort((x, y) => x.rank - y.rank).map((e) => e.teamId);
      made = seededPairs(ordered);
      if (pairing === 'elle') notes.push('Eşleşmeleri elle belirlemeyi seçtiniz: aşağıdaki listelerden takımları istediğiniz gibi değiştirin.');
    }
    pairs = made;
    const avoid = stage.settings.avoidSameGroup ?? true;
    if (avoid && fromGroups) {
      const gmap = new Map(entrants.map((e) => [e.teamId, e.group]));
      const res = avoidSameGroup(pairs, (id) => gmap.get(id));
      pairs = res.pairs;
      if (res.unresolved) notes.push(`${res.unresolved} eşleşmede aynı gruptan gelen iki takım karşılaşıyor; bunu önlemenin yolu bulunamadı. İsterseniz aşağıdan elle değiştirin.`);
    }
  }
  const size = pairs.length * 2;
  const byes = pairs.filter((p) => !p.a || !p.b).length;
  if (byes)
    notes.push(
      `${size - byes * 2 > 0 ? (size - 2 * byes) : 0} takım ön eleme oynar; diğer ${byes} takım doğrudan ${size / 2} takımlık ana tabloya yerleşir. Ön eleme kazananı ağaçta kendisini bekleyen yere geçer.`,
    );
  // Canlı kura sırası: önce seri başları/sıralı takımlar
  const revealOrder = isFirst && mode === 'rastgele' ? shuffle(entrants.map((e) => e.teamId), rng) : null;
  const posOf = new Map<TeamId, string>();
  let pe = 0;
  pairs.forEach((p, i) => {
    if (byes && (!p.a || !p.b)) {
      const id = p.a ?? p.b;
      if (id) posOf.set(id, 'Doğrudan ana tabloya');
      return;
    }
    const to = byes ? `Ön eleme ${++pe}` : `Maç ${i + 1}`;
    if (p.a) posOf.set(p.a, to);
    if (p.b) posOf.set(p.b, to);
  });
  const seq = revealOrder ?? pairs.flatMap((p) => [p.a, p.b]).filter((x): x is TeamId => !!x);
  seq.forEach((id) => steps.push({ teamId: id, from: labels[id] ? (/^\d+$/.test(labels[id]) ? `Güç sırası ${labels[id]}` : labels[id]) : 'Torba', to: posOf.get(id)! }));
  return { pairs, labels, steps, notes };
}

// ---------------------------------------------------------------------------
// Ön eleme
// ---------------------------------------------------------------------------

function drawPrelim(t: Tournament, stage: Stage, entrants: Qualifier[], mode: DrawMode, rng: () => number) {
  const n = entrants.length;
  const target = stage.settings.target ?? 0;
  const m = n - target;
  const ordered = seedOrder(teamsOf(t, entrants.map((e) => e.teamId)), mode, rng).map((x) => x.id);
  const direct = ordered.slice(0, n - 2 * m);
  const playing = ordered.slice(n - 2 * m);
  const pairs: { a: TeamId | null; b: TeamId | null }[] = [];
  for (let i = 0; i < m; i++) pairs.push({ a: playing[i], b: playing[2 * m - 1 - i] });
  const labels: Record<TeamId, string> = {};
  ordered.forEach((id, i) => (labels[id] = String(i + 1)));
  const steps: DrawStep[] = [];
  direct.forEach((id) => steps.push({ teamId: id, from: `Güç sırası ${labels[id]}`, to: 'Doğrudan ana tabloya' }));
  pairs.forEach((p, i) => {
    steps.push({ teamId: p.a!, from: `Güç sırası ${labels[p.a!]}`, to: `Ön eleme ${i + 1}` });
    steps.push({ teamId: p.b!, from: `Güç sırası ${labels[p.b!]}`, to: `Ön eleme ${i + 1}` });
  });
  return { pairs, direct, labels, steps };
}

// ---------------------------------------------------------------------------
// Öneri üret / uygula
// ---------------------------------------------------------------------------

/**
 * Kura önerisi üretir.
 * @param opts.seeding İlk aşama eleme ise ağacın dizilişi (verilmezse aşama ayarı, o da yoksa "kademeli").
 */
export function proposeDraw(t: Tournament, stageId: string, mode: DrawMode, seed: number, opts: { seeding?: 'kademeli' | 'kesin' } = {}): DrawProposal {
  const idx = stageIndex(t, stageId);
  const stage = t.stages[idx];
  if (!stage) throw new Error('Aşama bulunamadı');
  const entrants = stageEntrants(t, stageId);
  if (!entrants) throw new Error('Önceki aşama tamamlanmadan kura çekilemez.');
  if (entrants.length < 2) throw new Error('Kura için en az 2 takım gerekir.');
  const rng = createRng(seed);
  const base = { stageId, type: stage.type, mode, seed, entrants };

  if (stage.type === 'grup' || stage.type === 'lig') {
    const G = stage.type === 'lig' ? 1 : stage.settings.groupCount ?? 1;
    if (entrants.length < G * 2) throw new Error(`${entrants.length} takım ${G} gruba bölünemez (her grupta en az 2 takım olmalı).`);
    const { groups, steps } = drawGroups(t, stage, entrants, mode, rng);
    const labels: Record<TeamId, string> = {};
    for (const e of entrants) if (e.label) labels[e.teamId] = e.label;
    return { ...base, groups, labels, steps, notes: [] };
  }
  if (stage.type === 'on-eleme') {
    const target = stage.settings.target ?? 0;
    if (!(target < entrants.length && entrants.length <= 2 * target)) {
      throw new Error(`Ön eleme hedefi (${target}) ${entrants.length} takım için geçersiz.`);
    }
    const r = drawPrelim(t, stage, entrants, mode, rng);
    return { ...base, pairs: r.pairs, direct: r.direct, labels: r.labels, steps: r.steps, notes: [] };
  }
  const seeding = opts.seeding ?? (stage.settings.seeding === 'kesin' ? 'kesin' : 'kademeli');
  const r = drawKnockout(t, stage, entrants, mode, rng, idx === 0, seeding);
  return { ...base, pairs: r.pairs, labels: r.labels, steps: r.steps, notes: r.notes, seeding: idx === 0 && mode === 'dengeli' ? seeding : undefined };
}

/**
 * Canlı kura için çekiliş sırası ve pano düzeni. Önizlemede elle yapılan değişiklikleri de yansıtır.
 * Öğrenciler izleyeceği için güç sırası gösterilmez; takımlar "1. torba, 2. torba ..." diye çekilir.
 */
export function liveDrawPlan(p: DrawProposal): { steps: DrawStep[]; layout: LiveSlot[] } {
  const layout: LiveSlot[] = [];
  const to = new Map<TeamId, string>();
  const from = new Map<TeamId, string>();
  const rank = (id: TeamId) => (p.labels[id] && /^\d+$/.test(p.labels[id]) ? Number(p.labels[id]) : 0);
  const tierName = (r: number) => `${r <= 2 ? 1 : Math.ceil(Math.log2(r))}. torba`;
  let order: TeamId[] | null = null;

  if (p.groups) {
    for (const g of p.groups) {
      const title = p.type === 'lig' ? 'Lig (fikstür sırası)' : `${g.name} Grubu`;
      layout.push({ title, kind: 'list', entries: g.teamIds.map((teamId) => ({ teamId })) });
      for (const id of g.teamIds) to.set(id, title);
    }
  } else if (p.type === 'on-eleme') {
    p.pairs!.forEach((x, i) => {
      const title = `Ön eleme ${i + 1}`;
      layout.push({ title, kind: 'match', entries: [{ teamId: x.a! }, { teamId: x.b! }] });
      to.set(x.a!, title);
      to.set(x.b!, title);
      from.set(x.a!, 'Ön eleme torbası');
      from.set(x.b!, 'Ön eleme torbası');
    });
    if (p.direct?.length) {
      layout.push({ title: 'Doğrudan geçenler', kind: 'list', entries: p.direct.map((teamId) => ({ teamId })) });
      for (const id of p.direct) {
        to.set(id, 'Doğrudan geçenler');
        from.set(id, 'Doğrudan geçenler');
      }
    }
    order = [...(p.direct ?? []), ...p.pairs!.flatMap((x) => [x.a!, x.b!])];
  } else {
    const pairs = p.pairs!;
    const hasBye = pairs.some((x) => !x.a || !x.b);
    if (!hasBye) {
      const name = knockoutRoundName(pairs.length * 2);
      pairs.forEach((x, i) => {
        const title = pairs.length === 1 ? 'Final' : `${name} ${i + 1}`;
        layout.push({ title, kind: 'match', entries: [{ teamId: x.a! }, { teamId: x.b! }] });
        to.set(x.a!, title);
        to.set(x.b!, title);
      });
    } else {
      // Ön eleme ağacın içinde: ana tablonun eşleşmeleri + ön eleme maçları
      const mainName = knockoutRoundName(pairs.length);
      const prelimCards: LiveSlot[] = [];
      let pe = 0;
      for (let j = 0; j < pairs.length / 2; j++) {
        const title = pairs.length === 2 ? 'Final' : `${mainName} ${j + 1}`;
        const entries: LiveSlot['entries'] = [];
        for (const x of [pairs[2 * j], pairs[2 * j + 1]]) {
          if (!x.a || !x.b) {
            const id = (x.a ?? x.b)!;
            entries.push({ teamId: id });
            to.set(id, title);
          } else {
            pe++;
            const pt = `Ön eleme ${pe}`;
            entries.push({ text: `${pt} galibi` });
            const card = `${pt} → ${title}`;
            prelimCards.push({ title: card, kind: 'match', entries: [{ teamId: x.a }, { teamId: x.b }] });
            to.set(x.a, card);
            to.set(x.b, card);
            from.set(x.a, 'Ön eleme torbası');
            from.set(x.b, 'Ön eleme torbası');
          }
        }
        layout.push({ title, kind: 'match', entries });
      }
      layout.unshift(...prelimCards);
    }
    // Güçlüler önce çekilir (torba torba); ön elemeciler en sonda
    const all = pairs.flatMap((x) => [x.a, x.b]).filter((x): x is TeamId => !!x);
    if (all.every((id) => rank(id) > 0)) {
      order = all.slice().sort((x, y) => (from.has(x) ? 1 : 0) - (from.has(y) ? 1 : 0) || rank(x) - rank(y));
      for (const id of all) if (!from.has(id)) from.set(id, tierName(rank(id)));
    }
  }
  const base = order ? order.map((id) => p.steps.find((s) => s.teamId === id) ?? { teamId: id, from: '', to: '' }) : p.steps;
  const steps = base.map((s) => ({
    teamId: s.teamId,
    from: from.get(s.teamId) ?? (/^Güç sırası/.test(s.from) ? 'Torba' : s.from),
    to: to.get(s.teamId) ?? s.to,
  }));
  return { steps, layout };
}

/** Önizlemede iki takımın yerini değiştirir (grup, eşleşme veya doğrudan geçenler arasında). */
export function swapInProposal(p: DrawProposal, x: TeamId, y: TeamId): DrawProposal {
  if (x === y) return p;
  const next: DrawProposal = JSON.parse(JSON.stringify(p));
  const repl = (id: TeamId | null) => (id === x ? y : id === y ? x : id);
  if (next.groups) next.groups = next.groups.map((g) => ({ ...g, teamIds: g.teamIds.map((id) => repl(id)!) }));
  if (next.pairs) next.pairs = next.pairs.map((pp) => ({ a: repl(pp.a), b: repl(pp.b) }));
  if (next.direct) next.direct = next.direct.map((id) => repl(id)!);
  return next;
}

/** Önizlemede bir grubun takımını başka gruba taşır (grup büyüklükleri değişir). */
export function moveInProposal(p: DrawProposal, teamId: TeamId, toGroup: string): DrawProposal {
  const next: DrawProposal = JSON.parse(JSON.stringify(p));
  if (!next.groups) return p;
  for (const g of next.groups) g.teamIds = g.teamIds.filter((id) => id !== teamId);
  next.groups.find((g) => g.name === toGroup)?.teamIds.push(teamId);
  return next;
}

/** Önizlemenin tutarlılığını denetler; her takım tam bir kez yer almalı. */
export function validateProposal(p: DrawProposal): string[] {
  const errs: string[] = [];
  const seen: TeamId[] = [];
  if (p.groups) {
    for (const g of p.groups) {
      seen.push(...g.teamIds);
      if (g.teamIds.length < 2) errs.push(`${g.name} grubunda en az 2 takım olmalı.`);
    }
  }
  if (p.pairs) {
    p.pairs.forEach((pp, i) => {
      if (!pp.a && !pp.b) errs.push(`${i + 1}. eşleşme boş.`);
      if (pp.a) seen.push(pp.a);
      if (pp.b) seen.push(pp.b);
    });
  }
  if (p.direct) seen.push(...p.direct);
  const set = new Set(seen);
  if (set.size !== seen.length) errs.push('Bir takım birden fazla yere yerleşmiş.');
  for (const e of p.entrants) if (!set.has(e.teamId)) errs.push('Yerleşmemiş takım var.');
  if (set.size !== p.entrants.length) errs.push('Takım sayısı uyuşmuyor.');
  return [...new Set(errs)];
}

/** Ağaç maçlarını kurar. */
export function buildBracket(
  stageId: string,
  pairs: { a: TeamId | null; b: TeamId | null }[],
  labels: Record<TeamId, string>,
  thirdPlace: boolean,
): Match[] {
  const size = pairs.length * 2;
  const rounds = Math.log2(size);
  const matches: Match[] = [];
  let prev: Match[] = [];
  const slot = (id: TeamId | null): Slot => (id ? { kind: 'team', teamId: id } : { kind: 'bye' });
  pairs.forEach((p, i) => {
    const m: Match = {
      id: `${stageId}-r1-${i + 1}`,
      no: 0,
      round: 1,
      order: i,
      a: slot(p.a),
      b: slot(p.b),
      labelA: p.a ? labels[p.a] : undefined,
      labelB: p.b ? labels[p.b] : undefined,
    };
    matches.push(m);
    prev.push(m);
  });
  for (let r = 2; r <= rounds; r++) {
    const cur: Match[] = [];
    for (let i = 0; i < prev.length / 2; i++) {
      const m: Match = {
        id: `${stageId}-r${r}-${i + 1}`,
        no: 0,
        round: r,
        order: i,
        a: { kind: 'winner', matchId: prev[2 * i].id },
        b: { kind: 'winner', matchId: prev[2 * i + 1].id },
      };
      matches.push(m);
      cur.push(m);
    }
    prev = cur;
  }
  if (thirdPlace && rounds >= 2) {
    const semis = matches.filter((m) => m.round === rounds - 1);
    matches.push({
      id: `${stageId}-3`,
      no: 0,
      round: rounds,
      order: 1,
      third: true,
      a: { kind: 'loser', matchId: semis[0].id },
      b: { kind: 'loser', matchId: semis[1].id },
    });
  }
  numberMatches(matches);
  return matches;
}

function numberMatches(matches: Match[]) {
  // Bay maçları numaralandırılmaz; üçüncülük maçı finalden önce gelir.
  const sorted = matches
    .slice()
    .sort((x, y) => x.round - y.round || (x.third ? -1 : 0) - (y.third ? -1 : 0) || (x.group ?? '').localeCompare(y.group ?? '') || x.order - y.order);
  let no = 1;
  for (const m of sorted) {
    if (m.a.kind === 'bye' || m.b.kind === 'bye') m.no = 0;
    else m.no = no++;
  }
}

export function buildGroupMatches(stageId: string, groups: Group[], legs: 1 | 2): Match[] {
  const matches: Match[] = [];
  for (const g of groups) {
    const rr = roundRobin(g.teamIds, legs);
    rr.forEach((p, i) => {
      matches.push({
        id: `${stageId}-${g.name}-${p.round}-${i + 1}`,
        no: 0,
        group: g.name,
        round: p.round,
        order: i,
        leg: legs === 2 ? p.leg : undefined,
        a: { kind: 'team', teamId: p.home },
        b: { kind: 'team', teamId: p.away },
      });
    });
  }
  numberMatches(matches);
  return matches;
}

/** Önizlemeyi kesinleştirir: aşamanın maçlarını oluşturur. Turnuvayı yerinde değiştirir. */
export function applyDraw(t: Tournament, p: DrawProposal, summary?: string): Stage {
  const errs = validateProposal(p);
  if (errs.length) throw new Error(errs.join(' '));
  const stage = t.stages.find((s) => s.id === p.stageId);
  if (!stage) throw new Error('Aşama bulunamadı');
  stage.entrants = p.entrants;
  stage.drawMode = p.mode;
  stage.drawSeed = p.seed;
  stage.drawSteps = p.steps;
  stage.drawSummary = summary;
  if (p.seeding) stage.settings.seeding = p.seeding;
  stage.manualOrder = {};
  stage.qualifiers = undefined;
  stage.direct = undefined;
  stage.groups = undefined;
  if (stage.type === 'grup' || stage.type === 'lig') {
    stage.groups = p.groups!.map((g) => ({ name: g.name, teamIds: g.teamIds.slice() }));
    stage.matches = buildGroupMatches(stage.id, stage.groups, stage.settings.legs ?? 1);
  } else if (stage.type === 'on-eleme') {
    stage.direct = p.direct!.slice();
    stage.matches = p.pairs!.map((pp, i) => ({
      id: `${stage.id}-p${i + 1}`,
      no: i + 1,
      round: 1,
      order: i,
      a: { kind: 'team', teamId: pp.a! },
      b: { kind: 'team', teamId: pp.b! },
      labelA: p.labels[pp.a!],
      labelB: p.labels[pp.b!],
    }));
  } else {
    stage.matches = buildBracket(stage.id, p.pairs!, p.labels, !!stage.settings.thirdPlace);
  }
  stage.status = 'devam';
  return stage;
}

/** Eleme turunun adı (Final, Yarı Final, ...) */
export function knockoutRoundLabel(stage: Stage, round: number): string {
  const r1 = stage.matches.filter((m) => m.round === 1 && !m.third).length;
  const size = r1 * 2;
  const teams = size / 2 ** (round - 1);
  return knockoutRoundName(teams);
}

/** Kura önizlemesinin okunabilir özeti (ör. "17 takım: 1 ön eleme maçı (P - R), 15 takım direkt 16'lı tabloya.") */
export function describeProposal(t: Tournament, p: DrawProposal): string {
  const name = (id: TeamId | null) => (id ? t.teams.find((x) => x.id === id)?.name ?? '?' : 'Bay');
  const n = p.entrants.length;
  const idx = stageIndex(t, p.stageId);
  const stage = t.stages[idx];
  const next = t.stages[idx + 1];
  if (p.type === 'on-eleme') {
    const m = p.pairs!.length;
    const list = p.pairs!.map((x) => `${name(x.a)} - ${name(x.b)}`).join(', ');
    const target = stage.settings.target!;
    const dest = !next
      ? 'sonraki tura'
      : next.type === 'eleme'
        ? `${ekLi(target)} tabloya`
        : next.type === 'grup'
          ? 'grup aşamasına'
          : 'lige';
    return `${n} takım: ${m} ön eleme maçı (${list}), ${p.direct!.length} takım direkt ${dest}.`;
  }
  if (p.type === 'eleme') {
    const size = p.pairs!.length * 2;
    const byes = p.pairs!.filter((x) => !x.a || !x.b);
    const real = p.pairs!.filter((x) => x.a && x.b);
    const lab = (id: TeamId | null) => (id && p.labels[id] && !/^\d+$/.test(p.labels[id]) ? ` (${p.labels[id]})` : '');
    const list = real.length <= 8 ? `: ${real.map((x) => `${name(x.a)}${lab(x.a)} - ${name(x.b)}${lab(x.b)}`).join(', ')}` : '';
    if (!byes.length) return `${n} takım eleme ağacına yerleşti. ${knockoutRoundName(size)} turunda ${real.length} maç oynanacak${list}.`;
    // Kullanıcının istediği biçim: "17 takım: 1 ön eleme maçı (Takım P - Takım R), 15 takım direkt 16'lı tabloya."
    const pairs = real.map((x) => `${name(x.a)}${lab(x.a)} - ${name(x.b)}${lab(x.b)}`).join(', ');
    return `${n} takım: ${real.length} ön eleme maçı (${pairs}), ${byes.length} takım direkt ${ekLi(size / 2)} tabloya.`;
  }
  const sizes = p.groups!.map((g) => g.teamIds.length);
  if (p.type === 'lig') {
    const legs = stage.settings.legs ?? 1;
    return `${n} takım tek ligde ${legs === 2 ? 'iki kez (rövanşlı)' : 'birer kez'} karşılaşacak: toplam ${(n * (n - 1) * legs) / 2} maç.`;
  }
  const counts = new Map<number, number>();
  for (const s of sizes) counts.set(s, (counts.get(s) ?? 0) + 1);
  const desc =
    counts.size === 1
      ? `her grupta ${sizes[0]} takım`
      : [...counts.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([size, c]) => `${c} grup ${size} takımlı`)
          .join(', ');
  const k = stage.settings.qualifiersPerGroup ?? 0;
  const extra = stage.settings.bestExtra?.enabled ? stage.settings.bestExtra.count : 0;
  let s = `${n} takım ${p.groups!.length} gruba ayrıldı (${desc}).`;
  if (k) s += ` Her gruptan ilk ${k} takım${extra ? ` ve grubunu ${ordinalWord(k + 1)} bitirenlerden en iyi ${extra} takım` : ''} bir sonraki aşamaya çıkacak.`;
  return s;
}
