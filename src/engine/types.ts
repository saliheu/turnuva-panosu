// Turnuva veri modeli. Bu dosya hem tarayıcıda hem sunucuda hem de testlerde kullanılır.

export type TeamId = string;

export interface Team {
  id: TeamId;
  name: string;
  /** 1 (en zayıf) – 10 (en güçlü) */
  power: number;
  /** Takım oyuncuları / katılımcılar (isteğe bağlı) */
  members: string[];
  /** Ayrılıp yerine başka takım konduysa eski adlar */
  formerNames?: string[];
  /** Turnuvadan çekildi (kalan maçları hükmen kaybeder) */
  withdrawn?: boolean;
}

export type StageType = 'on-eleme' | 'grup' | 'lig' | 'eleme';
export type DrawMode = 'dengeli' | 'rastgele';
export type PairingMode = 'capraz' | 'sirali' | 'elle';
export type Criterion =
  | 'ikili-puan'
  | 'ikili-averaj'
  | 'ikili-atilan'
  | 'averaj'
  | 'atilan'
  | 'yenilen'
  | 'galibiyet';

export interface StageSettings {
  /** grup: grup sayısı (lig için her zaman 1) */
  groupCount?: number;
  /** grup/lig: tek (1) veya çift (2) maç */
  legs?: 1 | 2;
  /** grup/lig: her gruptan üst tura çıkan takım sayısı (lig son aşamaysa 0) */
  qualifiersPerGroup?: number;
  /** grup: en iyi X. sıradakiler (ör. en iyi üçüncüler) */
  bestExtra?: { enabled: boolean; count: number };
  /** grup/lig: puan eşitliğinde sıralama kriterleri (puan her zaman ilk kriterdir) */
  criteria?: Criterion[];
  /** ön eleme: ana tabloya kalacak takım sayısı */
  target?: number;
  /** eleme: üçüncülük maçı */
  thirdPlace?: boolean;
  /**
   * eleme (ilk aşamaysa): güce göre yerleşim.
   * "kademeli" (varsayılan): güçlüler erken karşılaşmaz ama yerleri kurayla belirlenir.
   * "kesin": 1. ile sonuncu, 2. ile sondan bir önceki eşleşir; her kurada aynı ağaç.
   */
  seeding?: 'kademeli' | 'kesin';
  /** eleme (önceki aşama grup/lig ise): tur atlama eşleşmesi */
  pairing?: PairingMode;
  /** eleme: aynı gruptan gelenler ilk turda karşılaşmasın */
  avoidSameGroup?: boolean;
}

export type Slot =
  | { kind: 'team'; teamId: TeamId }
  | { kind: 'winner'; matchId: string }
  | { kind: 'loser'; matchId: string }
  | { kind: 'bye' };

export interface Match {
  id: string;
  /** Aşama içinde görünen maç numarası */
  no: number;
  /** grup/lig: grup adı (A, B, ...). Lig için 'Lig' */
  group?: string;
  /** grup/lig: hafta; eleme: tur (1 = ilk tur) */
  round: number;
  /** tur içindeki sıra (eleme ağacında konum) */
  order: number;
  /** çift maçlı liglerde 1. veya 2. maç */
  leg?: 1 | 2;
  /** eleme: üçüncülük maçı */
  third?: boolean;
  a: Slot;
  b: Slot;
  /** Ağaçta takımın altında gösterilen etiket (ör. "A1", "3") */
  labelA?: string;
  labelB?: string;
  scoreA?: number | null;
  scoreB?: number | null;
  /** Eleme beraberliğinde penaltı / uzatma sonrası skor */
  penA?: number | null;
  penB?: number | null;
  /** Eleme beraberliğinde yöneticinin seçtiği kazanan */
  decided?: 'a' | 'b' | null;
  /** Hükmen galip gelen taraf */
  forfeit?: 'a' | 'b' | null;
  date?: string;
  time?: string;
  venue?: string;
  note?: string;
}

export interface Group {
  name: string;
  teamIds: TeamId[];
}

export interface Qualifier {
  teamId: TeamId;
  /** Ör. "A1", "B2", "3. en iyi", "ÖE-1" */
  label: string;
  group?: string;
  position?: number;
  /** Bir sonraki aşama için güç/başarı sırası (1 = en iyi) */
  rank: number;
}

export interface DrawStep {
  teamId: TeamId;
  /** "1. torba", "Seri başı 1" ... */
  from: string;
  /** "A Grubu", "Maç 3" ... */
  to: string;
}

/** Canlı kura panosunda bir kart (grup veya eşleşme). Boş yerler takımlar çekildikçe dolar. */
export interface LiveSlot {
  title: string;
  kind: 'match' | 'list';
  entries: ({ teamId: TeamId } | { text: string })[];
}

export interface Stage {
  id: string;
  type: StageType;
  name: string;
  settings: StageSettings;
  status: 'bekliyor' | 'devam' | 'bitti';
  /** Bu aşamaya katılanlar (ilk aşamada kura anında tüm takımlar) */
  entrants?: Qualifier[];
  groups?: Group[];
  /** ön eleme: maç oynamadan doğrudan geçenler (güç sırasıyla) */
  direct?: TeamId[];
  matches: Match[];
  /** Kriterlerle çözülemeyen eşitlikte yöneticinin belirlediği sıra (grup adına göre) */
  manualOrder?: Record<string, TeamId[]>;
  /** Aşama tamamlanınca onaylanan üst tura çıkanlar */
  qualifiers?: Qualifier[];
  drawSteps?: DrawStep[];
  /** Canlı kura panosunun düzeni */
  drawLayout?: LiveSlot[];
  drawMode?: DrawMode;
  drawSeed?: number;
  drawSummary?: string;
}

export interface Scoring {
  win: number;
  draw: number;
  loss: number;
  /** Hükmen mağlubiyette alınan puan */
  forfeitLoss: number;
  /** Lig/grup maçlarında beraberlik olabilir mi */
  allowDraw: boolean;
  /** Voleybol kuralı: 1 set farkla (3-2 / 2-1) galibiyet 2, mağlubiyet 1 puan */
  volleyball: boolean;
  /** Hükmen sonuçta yazılacak skor */
  forfeitScore: [number, number];
  /** Skor birimi: Gol, Set, Sayı ... */
  unit: string;
}

export type TournamentStatus = 'taslak' | 'devam' | 'bitti';

export interface ChampionInfo {
  champion: string;
  runnerUp?: string;
  third?: string;
  championTeamId?: TeamId;
  /** Şampiyonlar arşivindeki kaydın kimliği */
  recordId?: string;
}

export interface Tournament {
  id: string;
  name: string;
  sport: string;
  /** Ör. "Erkekler", "Kızlar", "9. sınıflar" (isteğe bağlı) */
  category?: string;
  /** Öğretim yılı: "2026-27" */
  schoolYear: string;
  status: TournamentStatus;
  archived: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
  /** Sunucudaki sürüm numarası (çakışma kontrolü) */
  version: number;
  scoring: Scoring;
  teams: Team[];
  stages: Stage[];
  /** Yönetici onaylı şampiyon */
  champion?: ChampionInfo;
}

export interface ChampionRecord {
  id: string;
  schoolYear: string;
  sport: string;
  category?: string;
  champion: string;
  runnerUp?: string;
  tournamentId?: string;
  tournamentName?: string;
  note?: string;
  createdAt: string;
}

export interface TournamentSummary {
  id: string;
  name: string;
  sport: string;
  category?: string;
  schoolYear: string;
  status: TournamentStatus;
  archived: boolean;
  updatedAt: string;
  teamCount: number;
  champion?: string;
  currentStage?: string;
}
