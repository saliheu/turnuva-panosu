import { leagueOutcome, matchPoints, hasResult } from './results';
import type { Criterion, Match, Scoring, TeamId } from './types';

export interface StandingRow {
  teamId: TeamId;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  /** Kriterlerle ayrılamadı ve yönetici sıralamadı */
  tied: boolean;
  /** Aynı eşitlik kümesindeki satırlar aynı numarayı taşır */
  tieGroup?: number;
  /** Yöneticinin elle belirlediği sıra kullanıldı */
  manual: boolean;
}

export const DEFAULT_CRITERIA: Criterion[] = ['ikili-puan', 'ikili-averaj', 'ikili-atilan', 'averaj', 'atilan'];

export const CRITERION_LABELS: Record<Criterion, string> = {
  'ikili-puan': 'Aralarındaki maçlarda aldıkları puan',
  'ikili-averaj': 'Aralarındaki maçların averajı',
  'ikili-atilan': 'Aralarındaki maçlarda attıkları gol/sayı',
  averaj: 'Genel averaj (atılan − yenilen)',
  atilan: 'Toplam attığı gol/sayı',
  yenilen: 'En az gol/sayı yiyen',
  galibiyet: 'Galibiyet sayısı',
};

export const ALL_CRITERIA: Criterion[] = [
  'ikili-puan',
  'ikili-averaj',
  'ikili-atilan',
  'averaj',
  'atilan',
  'yenilen',
  'galibiyet',
];

interface Acc {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
}

function emptyAcc(): Acc {
  return { played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 };
}

/** Verilen maçlardan takım istatistiklerini hesaplar (yalnızca set içindeki takımlar arası maçlar istenirse filtrelenir) */
export function accumulate(
  teamIds: readonly TeamId[],
  matches: readonly Match[],
  scoring: Scoring,
  onlyAmong?: Set<TeamId>,
): Map<TeamId, Acc> {
  const acc = new Map<TeamId, Acc>(teamIds.map((id) => [id, emptyAcc()]));
  for (const m of matches) {
    if (m.a.kind !== 'team' || m.b.kind !== 'team') continue;
    if (!hasResult(m)) continue;
    const a = m.a.teamId;
    const b = m.b.teamId;
    if (onlyAmong && (!onlyAmong.has(a) || !onlyAmong.has(b))) continue;
    const pa = acc.get(a);
    const pb = acc.get(b);
    if (!pa || !pb) continue;
    const pts = matchPoints(m, scoring)!;
    const o = leagueOutcome(m)!;
    const ga = m.scoreA ?? (m.forfeit === 'a' ? scoring.forfeitScore[0] : scoring.forfeitScore[1]);
    const gb = m.scoreB ?? (m.forfeit === 'b' ? scoring.forfeitScore[0] : scoring.forfeitScore[1]);
    pa.played++;
    pb.played++;
    pa.gf += ga;
    pa.ga += gb;
    pb.gf += gb;
    pb.ga += ga;
    pa.points += pts.a;
    pb.points += pts.b;
    if (o === 'draw') {
      pa.drawn++;
      pb.drawn++;
    } else if (o === 'a') {
      pa.won++;
      pb.lost++;
    } else {
      pb.won++;
      pa.lost++;
    }
  }
  return acc;
}

function criterionValue(c: Criterion, id: TeamId, overall: Map<TeamId, Acc>, h2h: Map<TeamId, Acc>): number {
  const o = overall.get(id)!;
  const h = h2h.get(id)!;
  switch (c) {
    case 'ikili-puan':
      return h.points;
    case 'ikili-averaj':
      return h.gf - h.ga;
    case 'ikili-atilan':
      return h.gf;
    case 'averaj':
      return o.gf - o.ga;
    case 'atilan':
      return o.gf;
    case 'yenilen':
      return -o.ga;
    case 'galibiyet':
      return o.won;
  }
}

/**
 * Puan durumu. Puan eşitliğinde kriterler sırayla uygulanır; ikili maç kriterleri
 * yalnızca hâlâ eşit olan takımlar arasındaki maçlara bakar ve eşitlik bölündükçe
 * kalan alt kümeye yeniden uygulanır. Hiçbir kriter ayıramazsa yöneticinin elle
 * verdiği sıra (manualOrder) kullanılır; o da yoksa satırlar "tied" işaretlenir.
 */
export function computeStandings(
  teamIds: readonly TeamId[],
  matches: readonly Match[],
  scoring: Scoring,
  criteria: readonly Criterion[] = DEFAULT_CRITERIA,
  manualOrder?: readonly TeamId[],
): StandingRow[] {
  const overall = accumulate(teamIds, matches, scoring);
  const tiedFlags = new Map<TeamId, number>();
  let tieCounter = 0;
  const manualFlags = new Map<TeamId, boolean>();

  const sortSet = (set: TeamId[]): TeamId[] => {
    if (set.length <= 1) return set;
    const among = new Set(set);
    const h2h = accumulate(set, matches, scoring, among);
    for (const c of criteria) {
      const vals = new Map(set.map((id) => [id, criterionValue(c, id, overall, h2h)]));
      const distinct = new Set(vals.values());
      if (distinct.size > 1) {
        const buckets = [...distinct].sort((x, y) => y - x);
        const out: TeamId[] = [];
        for (const v of buckets) {
          const sub = set.filter((id) => vals.get(id) === v);
          out.push(...sortSet(sub));
        }
        return out;
      }
    }
    // Kriterlerle çözülemedi
    if (manualOrder && set.every((id) => manualOrder.includes(id))) {
      for (const id of set) manualFlags.set(id, true);
      return set.slice().sort((x, y) => manualOrder.indexOf(x) - manualOrder.indexOf(y));
    }
    tieCounter++;
    for (const id of set) tiedFlags.set(id, tieCounter);
    return set.slice().sort((x, y) => teamIds.indexOf(x) - teamIds.indexOf(y));
  };

  // Önce puana göre kovalar
  const byPoints = new Map<number, TeamId[]>();
  for (const id of teamIds) {
    const p = overall.get(id)!.points;
    if (!byPoints.has(p)) byPoints.set(p, []);
    byPoints.get(p)!.push(id);
  }
  const ordered: TeamId[] = [];
  for (const p of [...byPoints.keys()].sort((x, y) => y - x)) {
    ordered.push(...sortSet(byPoints.get(p)!));
  }

  return ordered.map((id, i) => {
    const a = overall.get(id)!;
    return {
      teamId: id,
      rank: i + 1,
      played: a.played,
      won: a.won,
      drawn: a.drawn,
      lost: a.lost,
      gf: a.gf,
      ga: a.ga,
      gd: a.gf - a.ga,
      points: a.points,
      tied: tiedFlags.has(id),
      tieGroup: tiedFlags.get(id),
      manual: manualFlags.get(id) ?? false,
    };
  });
}

/** Sıralamadaki çözülemeyen eşitlik kümeleri (yönetici kararı gerekir) */
export function unresolvedTies(rows: readonly StandingRow[]): TeamId[][] {
  const out: TeamId[][] = [];
  let cur: StandingRow[] = [];
  const flush = () => {
    if (cur.length > 1) out.push(cur.map((r) => r.teamId));
    cur = [];
  };
  for (const r of rows) {
    if (!r.tied) {
      flush();
      continue;
    }
    if (cur.length && cur[cur.length - 1].tieGroup !== r.tieGroup) flush();
    cur.push(r);
  }
  flush();
  return out;
}
