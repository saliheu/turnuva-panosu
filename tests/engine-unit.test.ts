import { describe, expect, it } from 'vitest';
import {
  addTeams,
  analyzePlan,
  applyDraw,
  applyScore,
  bracketOrder,
  completeStage,
  computeStageResult,
  computeStandings,
  crossPairs,
  defaultSettings,
  describeProposal,
  ekLi,
  groupSwapImpact,
  groupTables,
  newTournament,
  proposeDraw,
  resolveStage,
  roundRobin,
  scoreImpact,
  setFormat,
  setMatchTeam,
  swapGroupTeams,
  swapInProposal,
  templateOptions,
  validateProposal,
  withdrawTeam,
  replaceTeam,
  suggestChampion,
  type Match,
  type Qualifier,
  type Tournament,
} from '../src/engine';
import { makeTournament, playStage, settleTies } from './helpers';
import { createRng } from '../src/engine';

const name = (t: Tournament, id: string | null | undefined) => t.teams.find((x) => x.id === id)?.name;

describe('yardımcılar', () => {
  it('seri başı yerleşimi', () => {
    expect(bracketOrder(2)).toEqual([1, 2]);
    expect(bracketOrder(4)).toEqual([1, 4, 2, 3]);
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const o16 = bracketOrder(16);
    for (let i = 0; i < 16; i += 2) expect(o16[i] + o16[i + 1]).toBe(17);
    // 1 ve 2 farklı yarılarda, ilk 4 farklı çeyreklerde
    expect(o16.indexOf(1) < 8).not.toBe(o16.indexOf(2) < 8);
    const quarters = [1, 2, 3, 4].map((s) => Math.floor(o16.indexOf(s) / 4));
    expect(new Set(quarters).size).toBe(4);
  });

  it('Türkçe sayı ekleri', () => {
    expect(ekLi(16)).toBe("16'lı");
    expect(ekLi(32)).toBe("32'li");
    expect(ekLi(8)).toBe("8'li");
    expect(ekLi(4)).toBe("4'lü");
    expect(ekLi(64)).toBe("64'lü");
    expect(ekLi(3)).toBe("3'lü");
    expect(ekLi(10)).toBe("10'lu");
    expect(ekLi(6)).toBe("6'lı");
    expect(ekLi(9)).toBe("9'lu");
    expect(ekLi(40)).toBe("40'lı");
  });

  it('lig fikstürü: her hafta herkes en fazla bir maç, rövanş farklı haftada', () => {
    for (let n = 2; n <= 20; n++) {
      const ids = Array.from({ length: n }, (_, i) => `t${i}`);
      for (const legs of [1, 2] as const) {
        const rr = roundRobin(ids, legs);
        expect(rr.length).toBe(((n * (n - 1)) / 2) * legs);
        const byRound = new Map<number, string[]>();
        for (const p of rr) {
          byRound.set(p.round, [...(byRound.get(p.round) ?? []), p.home, p.away]);
        }
        for (const [, teams] of byRound) expect(new Set(teams).size).toBe(teams.length);
        if (legs === 2) {
          const seen = new Map<string, number>();
          for (const p of rr) {
            const key = [p.home, p.away].sort().join('|');
            if (seen.has(key)) {
              expect(seen.get(key)).not.toBe(p.round);
            } else seen.set(key, p.round);
          }
        }
        // ev sahibi dengesi: hiçbir takım tek maçlı ligde (n-1)/2'den çok fazla evde oynamaz
        if (legs === 1 && n % 2 === 0) {
          const home = new Map<string, number>();
          for (const p of rr) home.set(p.home, (home.get(p.home) ?? 0) + 1);
          for (const [, h] of home) expect(Math.abs(h - (n - 1) / 2)).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe('ön eleme kuralı', () => {
  it('17 takım: en zayıf 2 takım oynar, kazanan 16’lı tabloya katılır (tek kurada, ağacın içinde)', () => {
    const powers = [...Array(15).fill(6), 2, 1];
    const t = makeTournament(17, { powers });
    t.teams[15].name = 'Takım P';
    t.teams[16].name = 'Takım R';
    const opt = templateOptions('direkt-eleme', 17).options.find((o) => o.recommended)!;
    // ön eleme ayrı aşama değil, eleme ağacının ilk turu
    expect(opt.stages.map((s) => s.type)).toEqual(['eleme']);
    setFormat(t, opt.stages);
    t.stages[0].settings.seeding = 'kesin';
    const p = proposeDraw(t, t.stages[0].id, 'dengeli', 42);
    expect(describeProposal(t, p)).toBe("17 takım: 1 ön eleme maçı (Takım P - Takım R), 15 takım direkt 16'lı tabloya.");
    applyDraw(t, p);
    const st = t.stages[0];
    const r1 = st.matches.filter((m) => m.round === 1);
    const real = r1.filter((m) => m.a.kind === 'team' && m.b.kind === 'team');
    expect(real.length).toBe(1);
    // ana tablo (16 takım) kurası da çekilmiş durumda: 2. turda 8 maç, 15'inde takım belli
    const r2 = st.matches.filter((m) => m.round === 2);
    expect(r2.length).toBe(8);
    const res = resolveStage(st);
    const known = r2.flatMap((m) => [res.get(m.id)!.a, res.get(m.id)!.b]).filter(Boolean);
    expect(known.length).toBe(15);
    // ön eleme kazananı 1. sıradaki takımla eşleşir
    const pm = real[0];
    const target = r2.find((m) => (m.a.kind === 'winner' && m.a.matchId === pm.id) || (m.b.kind === 'winner' && m.b.matchId === pm.id))!;
    const other = res.get(target.id)!;
    const seed1 = Object.entries(p.labels).find(([, l]) => l === '1')![0];
    expect([other.a, other.b]).toContain(seed1);
    applyScore(t, st.id, pm.id, { scoreA: 2, scoreB: 1 });
    const after = resolveStage(st).get(target.id)!;
    expect([after.a, after.b]).toContain(t.teams[15].id);
  });

  it('20 takım: en zayıf 8 takım 4 maç oynar, 12 takım direkt', () => {
    const powers = [10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1];
    const t = makeTournament(20, { powers });
    const opt = templateOptions('direkt-eleme', 20).options[0];
    setFormat(t, opt.stages);
    t.stages[0].settings.seeding = 'kesin';
    const p = proposeDraw(t, t.stages[0].id, 'dengeli', 7);
    const real = p.pairs!.filter((x) => x.a && x.b);
    const direct = p.pairs!.filter((x) => !x.a || !x.b).map((x) => x.a ?? x.b);
    expect(real.length).toBe(4);
    expect(direct.length).toBe(12);
    // güçlü ön elemeci en zayıfla: 13-20, 14-19, 15-18, 16-17
    const pw = (id: string | null) => t.teams.find((x) => x.id === id)!.power;
    expect(real.map((x) => [pw(x.a), pw(x.b)]).sort()).toEqual([
      [3, 2],
      [3, 2],
      [4, 1],
      [4, 1],
    ]);
    for (const id of direct) expect(pw(id)).toBeGreaterThanOrEqual(5);
    expect(describeProposal(t, p)).toMatch(/^20 takım: 4 ön eleme maçı \(.+\), 12 takım direkt 16'lı tabloya\.$/);
  });

  it('ayrı ön eleme aşaması (gruplardan önce) hâlâ çalışır ve önizlemede değiştirilebilir', () => {
    const t = makeTournament(5, { powers: [9, 8, 7, 2, 1] });
    setFormat(t, [
      { type: 'on-eleme', name: 'Ön eleme', settings: { target: 4 } },
      { type: 'eleme', name: 'Eleme', settings: defaultSettings('eleme') },
    ]);
    const p = proposeDraw(t, t.stages[0].id, 'dengeli', 3);
    expect(describeProposal(t, p)).toMatch(/^5 takım: 1 ön eleme maçı/);
    const directTeam = p.direct![0];
    const playing = p.pairs![0].a!;
    const p2 = swapInProposal(p, directTeam, playing);
    expect(p2.pairs![0].a).toBe(directTeam);
    expect(p2.direct).toContain(playing);
    expect(validateProposal(p2)).toEqual([]);
  });
});

describe('eleme ağacı ve seri başı', () => {
  it('kesin sıralama: en güçlü en zayıfla; favoriler kazanırsa finalde 1 ve 2, yarı finalde ilk 4', () => {
    for (const n of [8, 13, 16, 27, 32, 64]) {
      const powers = Array.from({ length: n }, (_, i) => Math.max(1, 10 - Math.floor((i * 10) / n)));
      const t = makeTournament(n, { powers });
      setFormat(t, [{ type: 'eleme', name: 'Eleme', settings: { ...defaultSettings('eleme'), seeding: 'kesin' } }]);
      const p = proposeDraw(t, t.stages[0].id, 'dengeli', n);
      applyDraw(t, p);
      const stage = t.stages[0];
      const seedRank = new Map(Object.entries(p.labels).map(([id, l]) => [id, Number(l)]));
      // en güçlü takım en zayıfla eşleşir
      const first = stage.matches.filter((m) => m.round === 1);
      const s1 = [...seedRank.entries()].find(([, r]) => r === 1)![0];
      const m1 = first.find((m) => m.a.kind === 'team' && m.a.teamId === s1)!;
      const size = first.length * 2;
      if (size === n) expect(seedRank.get((m1.b as { teamId: string }).teamId)).toBe(n);
      else expect(m1.b.kind).toBe('bye');
      // güç sırası seri başı sırasıyla uyumlu
      const bySeed = [...seedRank.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => t.teams.find((x) => x.id === id)!.power);
      for (let i = 1; i < bySeed.length; i++) expect(bySeed[i - 1]).toBeGreaterThanOrEqual(bySeed[i]);
      playStage(t, stage, createRng(1), 'favorites', seedRank);
      const res = resolveStage(stage);
      const rounds = Math.log2(size);
      const final = stage.matches.find((m) => m.round === rounds && !m.third)!;
      const f = res.get(final.id)!;
      expect(new Set([seedRank.get(f.a!), seedRank.get(f.b!)])).toEqual(new Set([1, 2]));
      if (rounds >= 2) {
        const semis = stage.matches.filter((m) => m.round === rounds - 1);
        const semiSeeds = semis.flatMap((m) => [res.get(m.id)!.a, res.get(m.id)!.b]).map((id) => seedRank.get(id!));
        expect(new Set(semiSeeds)).toEqual(new Set([1, 2, 3, 4]));
      }
      expect(suggestChampion(t)!.champion).toBe(s1);
    }
  });

  it('kademeli kura (varsayılan): güçlüler erken karşılaşmaz ama her kurada farklı ağaç çıkar', () => {
    for (let n = 2; n <= 64; n++) {
      const t = makeTournament(n);
      setFormat(t, [{ type: 'eleme', name: 'Eleme', settings: defaultSettings('eleme') }]);
      const T = (() => {
        let p = 1;
        while (p * 2 <= n) p *= 2;
        return p;
      })();
      const m = n - T;
      const direct = n - 2 * m;
      const seen = new Set<string>();
      for (let seed = 0; seed < 30; seed++) {
        const p = proposeDraw(t, t.stages[0].id, 'dengeli', seed * 7919 + n);
        expect(validateProposal(p)).toEqual([]);
        const rank = (id: string | null) => (id ? Number(p.labels[id]) : 0);
        const pairs = p.pairs!;
        // ana tablonun yerleri: ön eleme varsa her ilk tur eşleşmesi bir yer, yoksa her takım bir yer
        const slots: number[][] = m > 0 ? pairs.map((x) => [rank(x.a), rank(x.b)].filter(Boolean)) : pairs.flatMap((x) => [[rank(x.a)], [rank(x.b)]]);
        expect(slots.length).toBe(T);
        const slotOf = (r: number) => slots.findIndex((sl) => sl.includes(r));
        // ön elemeyi yalnızca en zayıf 2m takım oynar
        if (m > 0) {
          for (const x of pairs) if (x.a && x.b) for (const r of [rank(x.a), rank(x.b)]) expect(r).toBeGreaterThan(direct);
          expect(pairs.filter((x) => !x.a || !x.b).length).toBe(direct);
        }
        // 1. ve 2. farklı yarılarda; ilk 4 farklı çeyreklerde; ilk 8 farklı sekizde birlerde
        for (const k of [2, 4, 8]) {
          if (T < k || n < k) continue;
          const parts = new Set(Array.from({ length: k }, (_, i) => Math.floor(slotOf(i + 1) / (T / k))));
          expect(parts.size, `n=${n}: ilk ${k} takım ayrı bölümlerde olmalı`).toBe(k);
        }
        // ana tablonun ilk turunda iki doğrudan geçen takım eşleşirse biri güçlü yarıdan, biri zayıf yarıdan
        for (let k = 0; k < T; k += 2) {
          const [x, y] = [slots[k], slots[k + 1]];
          if (x.length === 1 && y.length === 1 && x[0] <= direct && y[0] <= direct) {
            expect((x[0] <= T / 2) !== (y[0] <= T / 2), `n=${n}: ${x[0]} ile ${y[0]} ilk turda eşleşmemeli`).toBe(true);
          }
        }
        seen.add(JSON.stringify(pairs));
      }
      if (n >= 6) expect(seen.size, `n=${n}: kademeli kura rastgele olmalı`).toBeGreaterThan(1);
    }
  });

  it('kademeli kurada da favoriler kazanırsa finalde 1 ve 2, yarı finalde ilk 4 buluşur', () => {
    for (const n of [8, 9, 13, 16, 27, 32, 64]) {
      for (const seed of [1, 2, 3]) {
        const powers = Array.from({ length: n }, (_, i) => Math.max(1, 10 - Math.floor((i * 10) / n)));
        const t = makeTournament(n, { powers });
        setFormat(t, [{ type: 'eleme', name: 'Eleme', settings: defaultSettings('eleme') }]);
        const p = proposeDraw(t, t.stages[0].id, 'dengeli', seed);
        applyDraw(t, p);
        const stage = t.stages[0];
        const seedRank = new Map(Object.entries(p.labels).map(([id, l]) => [id, Number(l)]));
        playStage(t, stage, createRng(1), 'favorites', seedRank);
        const res = resolveStage(stage);
        const rounds = Math.max(...stage.matches.map((m) => m.round));
        const final = stage.matches.find((m) => m.round === rounds && !m.third)!;
        const f = res.get(final.id)!;
        expect(new Set([seedRank.get(f.a!), seedRank.get(f.b!)])).toEqual(new Set([1, 2]));
        const semis = stage.matches.filter((m) => m.round === rounds - 1);
        expect(new Set(semis.flatMap((m) => [res.get(m.id)!.a, res.get(m.id)!.b]).map((id) => seedRank.get(id!)))).toEqual(new Set([1, 2, 3, 4]));
      }
    }
  });

  it('beraberlikte kazanan seçilmeden eleme maçı sonuçlanmaz', () => {
    const t = makeTournament(4);
    setFormat(t, [{ type: 'eleme', name: 'Eleme', settings: { thirdPlace: true } }]);
    applyDraw(t, proposeDraw(t, t.stages[0].id, 'dengeli', 1));
    const m = t.stages[0].matches[0];
    expect(() => applyScore(t, t.stages[0].id, m.id, { scoreA: 1, scoreB: 1 })).toThrow(/penaltı/);
    applyScore(t, t.stages[0].id, m.id, { scoreA: 1, scoreB: 1, penA: 3, penB: 4 });
    const res = resolveStage(t.stages[0]);
    expect(res.get(m.id)!.winner).toBe((m.b as { teamId: string }).teamId);
    // üçüncülük maçı var
    expect(t.stages[0].matches.some((x) => x.third)).toBe(true);
  });

  it('kazanan değişirse sonraki oynanmış maç uyarısı verir, onaysız silmez', () => {
    const t = makeTournament(4);
    setFormat(t, [{ type: 'eleme', name: 'Eleme', settings: {} }]);
    applyDraw(t, proposeDraw(t, t.stages[0].id, 'dengeli', 1));
    const st = t.stages[0];
    const [s1, s2] = st.matches.filter((m) => m.round === 1);
    applyScore(t, st.id, s1.id, { scoreA: 2, scoreB: 0 });
    applyScore(t, st.id, s2.id, { scoreA: 2, scoreB: 0 });
    const final = st.matches.find((m) => m.round === 2)!;
    applyScore(t, st.id, final.id, { scoreA: 1, scoreB: 0 });
    const impact = scoreImpact(t, st.id, s1.id, { scoreA: 0, scoreB: 2 });
    expect(impact.clears.map((c) => c.matchId)).toEqual([final.id]);
    expect(() => applyScore(t, st.id, s1.id, { scoreA: 0, scoreB: 2 })).toThrow(/onay/);
    expect(final.scoreA).toBe(1);
    applyScore(t, st.id, s1.id, { scoreA: 0, scoreB: 2 }, true);
    expect(final.scoreA).toBeNull();
    // skoru değişmeyen maçta kazanan aynıysa etki yok
    expect(scoreImpact(t, st.id, s2.id, { scoreA: 3, scoreB: 0 }).clears).toEqual([]);
  });

  it('oynanmamış eşleşme elle değiştirilebilir (takas)', () => {
    const t = makeTournament(8);
    setFormat(t, [{ type: 'eleme', name: 'Eleme', settings: {} }]);
    applyDraw(t, proposeDraw(t, t.stages[0].id, 'dengeli', 1));
    const st = t.stages[0];
    const [m1, m2] = st.matches.filter((m) => m.round === 1);
    const x = (m1.b as { teamId: string }).teamId;
    const y = (m2.b as { teamId: string }).teamId;
    setMatchTeam(t, st.id, m1.id, 'b', y);
    expect((m1.b as { teamId: string }).teamId).toBe(y);
    expect((m2.b as { teamId: string }).teamId).toBe(x);
    applyScore(t, st.id, m2.id, { scoreA: 1, scoreB: 0 });
    expect(() => setMatchTeam(t, st.id, m1.id, 'b', x)).toThrow(/oynanmış/);
  });
});

describe('gruplar ve sıralama', () => {
  const sc = newTournament({ name: 'x', sport: 'Futbol' }).scoring;
  const mk = (a: string, b: string, sa: number, sb: number, i: number): Match => ({
    id: `m${i}`,
    no: i,
    round: 1,
    order: i,
    group: 'A',
    a: { kind: 'team', teamId: a },
    b: { kind: 'team', teamId: b },
    scoreA: sa,
    scoreB: sb,
  });

  it('puan eşitliğinde ikili maç önce gelir', () => {
    // A, B, C hepsi 6 puan; A-B: A kazandı, B-C: B, C-A: C (döngü) → ikili puan eşit → ikili averaj
    const ms = [mk('A', 'B', 3, 0, 1), mk('B', 'C', 1, 0, 2), mk('C', 'A', 2, 1, 3), mk('A', 'D', 1, 0, 4), mk('B', 'D', 1, 0, 5), mk('C', 'D', 5, 0, 6)];
    const rows = computeStandings(['A', 'B', 'C', 'D'], ms, sc);
    // ikili averaj: A +3-1=+2, B -3+1=-2, C +1-1... C: B-C 0-1 (-1), C-A 2-1 (+1) → 0
    expect(rows.map((r) => r.teamId)).toEqual(['A', 'C', 'B', 'D']);
    expect(rows.every((r) => !r.tied)).toBe(true);
  });

  it('ikili maç genel averajdan önce uygulanır', () => {
    const ms = [mk('A', 'B', 0, 1, 1), mk('A', 'C', 9, 0, 2), mk('B', 'C', 0, 1, 3)];
    const rows = computeStandings(['A', 'B', 'C'], ms, sc);
    // A ve B 3'er puan... C de 3 puan: üçlü eşitlik, ikili puan hepsi 3 → ikili averaj A +8, B 0, C -8
    expect(rows.map((r) => r.teamId)).toEqual(['A', 'B', 'C']);
    const rows2 = computeStandings(['A', 'B'], [mk('A', 'B', 0, 1, 1), mk('B', 'A', 0, 1, 2)], sc, ['averaj']);
    expect(rows2.every((r) => r.tied)).toBe(true);
  });

  it('çözülemeyen eşitlik işaretlenir, yönetici sırası uygulanır', () => {
    const ms = [mk('A', 'B', 1, 1, 1)];
    const rows = computeStandings(['A', 'B'], ms, sc);
    expect(rows.every((r) => r.tied)).toBe(true);
    const rows2 = computeStandings(['A', 'B'], ms, sc, undefined, ['B', 'A']);
    expect(rows2.map((r) => r.teamId)).toEqual(['B', 'A']);
    expect(rows2.every((r) => r.manual && !r.tied)).toBe(true);
  });

  it('voleybol: 3-2 galibiyet 2 puan, mağlubiyet 1 puan', () => {
    const v = newTournament({ name: 'x', sport: 'Voleybol' }).scoring;
    const rows = computeStandings(['A', 'B', 'C'], [mk('A', 'B', 3, 2, 1), mk('C', 'A', 3, 0, 2)], v);
    const pts = Object.fromEntries(rows.map((r) => [r.teamId, r.points]));
    expect(pts).toEqual({ A: 2, B: 1, C: 3 });
  });

  it('hükmen: galip galibiyet puanı, mağlup 0 puan ve hükmen skor', () => {
    const t = makeTournament(3, { sport: 'Basketbol' });
    setFormat(t, [{ type: 'lig', name: 'Lig', settings: defaultSettings('lig') }]);
    applyDraw(t, proposeDraw(t, t.stages[0].id, 'dengeli', 1));
    const m = t.stages[0].matches[0];
    applyScore(t, t.stages[0].id, m.id, { forfeit: 'a' });
    expect([m.scoreA, m.scoreB]).toEqual([20, 0]);
    const rows = groupTables(t, t.stages[0])[0].rows;
    const a = rows.find((r) => r.teamId === (m.a as { teamId: string }).teamId)!;
    const b = rows.find((r) => r.teamId === (m.b as { teamId: string }).teamId)!;
    expect(a.points).toBe(2);
    expect(b.points).toBe(0);
  });

  it('çapraz eşleşme: A1-B2, C1-D2, B1-A2, D1-C2', () => {
    const qs: Qualifier[] = [];
    // başarı sırasına göre (karışık grup sırası) verilse bile gruplar A-B, C-D eşlenmeli
    for (const p of [1, 2]) for (const g of ['C', 'A', 'D', 'B']) qs.push({ teamId: `${g}${p}`, label: `${g}${p}`, group: g, position: p, rank: 0 });
    expect(crossPairs(qs)).toEqual([
      { a: 'A1', b: 'B2' },
      { a: 'C1', b: 'D2' },
      { a: 'B1', b: 'A2' },
      { a: 'D1', b: 'C2' },
    ]);
  });

  it('grup + eleme: aynı gruptan çıkanlar ilk turda karşılaşmaz, en iyi üçüncüler doğru seçilir', () => {
    // 6 grup × 4, ilk 2 + en iyi 4 üçüncü = 16
    const t = makeTournament(24);
    setFormat(t, [
      { type: 'grup', name: 'Gruplar', settings: { ...defaultSettings('grup'), groupCount: 6, qualifiersPerGroup: 2, bestExtra: { enabled: true, count: 4 } } },
      { type: 'eleme', name: 'Eleme', settings: { pairing: 'sirali', avoidSameGroup: true } },
    ]);
    const g = t.stages[0];
    applyDraw(t, proposeDraw(t, g.id, 'dengeli', 5));
    playStage(t, g, createRng(3));
    const res = settleTies(t, g, createRng(4));
    expect(res.qualifiers.length).toBe(16);
    const thirds = res.qualifiers.filter((q) => q.position === 3);
    expect(thirds.length).toBe(4);
    expect(new Set(thirds.map((q) => q.group)).size).toBe(4);
    completeStage(t, g.id);
    const e = t.stages[1];
    applyDraw(t, proposeDraw(t, e.id, 'dengeli', 5));
    const gOf = new Map(res.qualifiers.map((q) => [q.teamId, q.group]));
    for (const m of e.matches.filter((x) => x.round === 1)) {
      const a = (m.a as { teamId: string }).teamId;
      const b = (m.b as { teamId: string }).teamId;
      expect(gOf.get(a)).not.toBe(gOf.get(b));
    }
    // grup birincileri ilk turda birbiriyle eşleşmez; en güçlü birinci en zayıf üçüncüyle oynar
    for (const m of e.matches.filter((x) => x.round === 1)) {
      expect(m.labelA!.endsWith('1') && m.labelB!.endsWith('1')).toBe(false);
    }
    const top = e.matches.find((x) => x.round === 1 && x.order === 0)!;
    expect(top.labelA).toMatch(/1$/);
    expect(top.labelB).toMatch(/3$/);
  });

  it('grup takası: korunabilen skorlar korunur, silinecekler önceden bildirilir', () => {
    const t = makeTournament(8);
    setFormat(t, [
      { type: 'grup', name: 'Gruplar', settings: { ...defaultSettings('grup'), groupCount: 2 } },
      { type: 'eleme', name: 'Eleme', settings: defaultSettings('eleme') },
    ]);
    const st = t.stages[0];
    applyDraw(t, proposeDraw(t, st.id, 'dengeli', 9));
    const [A, B] = st.groups!;
    // A grubunda A[0] ile A[1] arasındaki maça skor gir
    const target = st.matches.find((m) => [A.teamIds[0], A.teamIds[1]].includes((m.a as { teamId: string }).teamId) && [A.teamIds[0], A.teamIds[1]].includes((m.b as { teamId: string }).teamId))!;
    applyScore(t, st.id, target.id, { scoreA: 4, scoreB: 2 });
    // A[3] ile B[3] takası bu maçı etkilemez
    expect(groupSwapImpact(t, st.id, A.teamIds[3], B.teamIds[3]).clears).toEqual([]);
    swapGroupTeams(t, st.id, A.teamIds[3], B.teamIds[3]);
    const kept = st.matches.find((m) => m.scoreA === 4 && m.scoreB === 2);
    expect(kept).toBeTruthy();
    // A[0] taşınırsa maç silinir: onay olmadan hata
    const imp = groupSwapImpact(t, st.id, A.teamIds[0], B.teamIds[0]);
    expect(imp.clears.length).toBe(1);
    expect(() => swapGroupTeams(t, st.id, A.teamIds[0], B.teamIds[0])).toThrow(/onay/);
  });

  it('dengeli grup kurası: her gruba her torbadan bir takım', () => {
    const powers = [10, 10, 10, 10, 7, 7, 7, 7, 4, 4, 4, 4, 1, 1, 1, 1];
    for (let seed = 0; seed < 20; seed++) {
      const t = makeTournament(16, { powers });
      setFormat(t, [
        { type: 'grup', name: 'G', settings: { ...defaultSettings('grup'), groupCount: 4 } },
        { type: 'eleme', name: 'E', settings: defaultSettings('eleme') },
      ]);
      const p = proposeDraw(t, t.stages[0].id, 'dengeli', seed);
      for (const g of p.groups!) {
        const ps = g.teamIds.map((id) => t.teams.find((x) => x.id === id)!.power).sort((a, b) => b - a);
        expect(ps).toEqual([10, 7, 4, 1]);
      }
    }
  });
});

describe('planlayıcı', () => {
  it('tam bölünmeyen grup için geçerli seçenekler sunar', () => {
    const plan = [
      { type: 'grup' as const, name: 'G', settings: { ...defaultSettings('grup'), groupCount: 4, qualifiersPerGroup: 2 } },
      { type: 'eleme' as const, name: 'E', settings: defaultSettings('eleme') },
    ];
    const a = analyzePlan(18, plan);
    expect(a.errors).toEqual([]);
    expect(a.warnings.join(' ')).toMatch(/eşit bölünmüyor/);
    expect(a.suggestions.length).toBeGreaterThan(0);
    for (const s of a.suggestions) expect(analyzePlan(18, s.stages).errors).toEqual([]);
  });

  it('üst tura çıkan sayı ağaca uymazsa uyarır ve seçenek önerir', () => {
    const plan = [
      { type: 'grup' as const, name: 'G', settings: { ...defaultSettings('grup'), groupCount: 3, qualifiersPerGroup: 2 } },
      { type: 'eleme' as const, name: 'E', settings: defaultSettings('eleme') },
    ];
    const a = analyzePlan(12, plan);
    expect(a.warnings.join(' ')).toMatch(/bay geçer/);
    expect(a.suggestions.length).toBeGreaterThan(0);
    // önerilerden biri en iyi üçüncüler veya farklı grup sayısı içermeli
    expect(a.suggestions.some((s) => s.stages[0].settings.bestExtra?.enabled || s.stages[0].settings.groupCount !== 3)).toBe(true);
  });

  it('hatalı planları reddeder', () => {
    expect(analyzePlan(10, []).errors.length).toBe(1);
    expect(analyzePlan(10, [{ type: 'on-eleme', name: 'Ö', settings: { target: 8 } }]).errors.join()).toMatch(/son aşama/);
    expect(analyzePlan(10, [{ type: 'on-eleme', name: 'Ö', settings: { target: 4 } }, { type: 'eleme', name: 'E', settings: {} }]).errors.join()).toMatch(/en fazla 5 ön eleme maçı/);
    expect(analyzePlan(10, [{ type: 'grup', name: 'G', settings: { groupCount: 2, qualifiersPerGroup: 2 } }]).errors.join()).toMatch(/şampiyon belli olmaz/);
    expect(analyzePlan(10, [{ type: 'eleme', name: 'E', settings: {} }, { type: 'lig', name: 'L', settings: {} }]).errors.join()).toMatch(/son aşama olmalı/);
  });

  it('18 takım için ön eleme + grup + eleme: 2 ön eleme maçı, 16 takım 4 gruba', () => {
    const { options } = templateOptions('on-eleme-grup-eleme', 18);
    const rec = options.find((o) => o.recommended)!;
    expect(rec.stages[0].settings.target).toBe(16);
    expect(rec.stages[1].settings.groupCount).toBe(4);
  });
});

describe('takım değişiklikleri', () => {
  it('ayrılan takımın yerine gelen takım yerini ve eski adını korur', () => {
    const t = makeTournament(4);
    const id = t.teams[0].id;
    replaceTeam(t, id, 'Yeni Takım');
    expect(name(t, id)).toBe('Yeni Takım');
    expect(t.teams[0].formerNames).toEqual(['Takım 1']);
  });

  it('çekilen takımın kalan maçları hükmen kaybedilir', () => {
    const t = makeTournament(4);
    setFormat(t, [{ type: 'lig', name: 'Lig', settings: defaultSettings('lig') }]);
    applyDraw(t, proposeDraw(t, t.stages[0].id, 'dengeli', 1));
    const id = t.teams[0].id;
    const n = withdrawTeam(t, id);
    expect(n).toBe(3);
    const rows = groupTables(t, t.stages[0])[0].rows;
    expect(rows[rows.length - 1].teamId).toBe(id);
    expect(computeStageResult(t, t.stages[0]).complete).toBe(false);
  });
});

describe('ekleme', () => {
  it('addTeams güç puanını 1-10 arasına sıkıştırır', () => {
    const t = newTournament({ name: 'x', sport: 'Futbol' });
    addTeams(t, [{ name: 'a', power: 15 }, { name: 'b', power: -2 }]);
    expect(t.teams.map((x) => x.power)).toEqual([10, 1]);
  });
});
