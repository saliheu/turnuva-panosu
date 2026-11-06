import { groupSizes } from './draw';
import { DEFAULT_CRITERIA } from './standings';
import type { StageSettings, StageType } from './types';
import { isPowerOfTwo, lowerPowerOfTwo, nextPowerOfTwo, ordinalWord } from './util';

export type TemplateId = 'direkt-eleme' | 'grup-eleme' | 'on-eleme-grup-eleme' | 'lig';

export const TEMPLATES: { id: TemplateId; title: string; description: string }[] = [
  {
    id: 'direkt-eleme',
    title: 'Direkt eleme',
    description: 'Her maçı kaybeden elenir, kazanan bir üst tura çıkar. Takım sayısı 2, 4, 8, 16, 32 veya 64 değilse önce en zayıf takımlar ön eleme maçı oynar.',
  },
  {
    id: 'grup-eleme',
    title: 'Grup + eleme',
    description: 'Takımlar önce gruplarda herkesle birer maç yapar. Gruplarda ilk sıralara girenler eleme turlarına (çeyrek final, yarı final, final) çıkar.',
  },
  {
    id: 'on-eleme-grup-eleme',
    title: 'Ön eleme + grup + eleme',
    description: 'Önce en zayıf takımlar ön eleme maçı oynar, kaybeden elenir. Kalanlar gruplara ayrılır, sonra eleme turları oynanır.',
  },
  { id: 'lig', title: 'Lig', description: 'Herkes herkesle oynar. Sonunda puan tablosunda birinci olan takım şampiyon olur.' },
];

export interface StagePlan {
  type: StageType;
  name: string;
  settings: StageSettings;
}

export interface PlanOption {
  id: string;
  title: string;
  description: string;
  stages: StagePlan[];
  recommended?: boolean;
  /** Daha düşük daha iyi */
  score: number;
}

export const STAGE_TYPE_LABELS: Record<StageType, string> = {
  'on-eleme': 'Ön eleme',
  grup: 'Grup',
  lig: 'Lig',
  eleme: 'Eleme',
};

export function defaultStageName(type: StageType): string {
  switch (type) {
    case 'on-eleme':
      return 'Ön Eleme';
    case 'grup':
      return 'Grup Aşaması';
    case 'lig':
      return 'Lig';
    case 'eleme':
      return 'Eleme Turları';
  }
}

export function defaultSettings(type: StageType): StageSettings {
  switch (type) {
    case 'on-eleme':
      return { target: 2 };
    case 'grup':
      return { groupCount: 2, legs: 1, qualifiersPerGroup: 2, bestExtra: { enabled: false, count: 0 }, criteria: [...DEFAULT_CRITERIA] };
    case 'lig':
      return { groupCount: 1, legs: 1, qualifiersPerGroup: 0, criteria: [...DEFAULT_CRITERIA] };
    case 'eleme':
      return { thirdPlace: false, pairing: 'capraz', avoidSameGroup: true };
  }
}

function stage(type: StageType, settings: StageSettings): StagePlan {
  return { type, name: defaultStageName(type), settings: { ...defaultSettings(type), ...settings } };
}

/** "2 grup 5 takımlı, 2 grup 4 takımlı" veya "her grupta 4 takım" */
export function sizesText(n: number, G: number): string {
  const sizes = groupSizes(n, G);
  if (G === 1) return `tek grupta ${n} takım`;
  if (Math.min(...sizes) === Math.max(...sizes)) return `her grupta ${sizes[0]} takım`;
  const counts = new Map<number, number>();
  for (const s of sizes) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([s, c]) => `${c} grup ${s} takımlı`)
    .join(', ');
}

/** Eleme ağacının ilk turunun adı: Final, Yarı final, Çeyrek final, Son 16 turu */
export function startRoundName(size: number): string {
  if (size <= 2) return 'Final';
  if (size === 4) return 'Yarı final';
  if (size === 8) return 'Çeyrek final';
  return `Son ${size} turu`;
}

/** "finale", "yarı finale", "çeyrek finale", "son 16 turuna" */
export function startRoundDative(size: number): string {
  if (size <= 2) return 'finale';
  if (size === 4) return 'yarı finale';
  if (size === 8) return 'çeyrek finale';
  return `son ${size} turuna`;
}

export interface GroupOption {
  G: number;
  k: number;
  extras: number;
  byes: number;
  q: number;
  equal: boolean;
  score: number;
}

/** m takım için grup + eleme seçenekleri (grup sayısı, çıkan sayısı, en iyi X., bay) */
export function groupKnockoutOptions(m: number): GroupOption[] {
  const out: GroupOption[] = [];
  const maxG = m < 6 ? 1 : Math.floor(m / 3);
  for (let G = 1; G <= maxG; G++) {
    const sizes = groupSizes(m, G);
    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);
    if (maxSize > 8) continue;
    const equal = minSize === maxSize;
    const kMax = minSize === 2 ? 2 : Math.min(minSize - 1, 4);
    for (let k = 1; k <= kMax; k++) {
      const q = G * k;
      if (q < 2) continue;
      const base = Math.abs((m / G) - 4) * 2 + (equal ? 0 : 3) + (k === 2 ? 0 : 1) + (G > 1 && G % 2 === 1 ? 1 : 0) + (G === 1 ? 2 : 0);
      if (isPowerOfTwo(q)) {
        out.push({ G, k, extras: 0, byes: 0, q, equal, score: base });
        continue;
      }
      const need = nextPowerOfTwo(q) - q;
      const groupsWithNext = sizes.filter((s) => s >= k + 1).length;
      if (G > 1 && need < G && need <= groupsWithNext && k + 1 <= minSize) {
        out.push({ G, k, extras: need, byes: 0, q: q + need, equal, score: base + 2 });
      }
      out.push({ G, k, extras: 0, byes: need, q, equal, score: base + 3 + need / 2 });
    }
  }
  return out.sort((a, b) => a.score - b.score);
}

function groupOptionToPlan(m: number, o: GroupOption, prefix = ''): PlanOption {
  const cross = o.G >= 2 && o.G % 2 === 0 && o.k <= 2 && o.extras === 0 && o.byes === 0;
  const size = nextPowerOfTwo(o.q);
  const groups = o.G === 1 ? `${m} takım tek grupta herkesle oynar.` : `${m} takım ${o.G} gruba ayrılır (${sizesText(m, o.G)}).`;
  const who = o.G === 1 ? `İlk ${o.k} takım` : `Her gruptan ilk ${o.k} takım`;
  const extra = o.extras ? ` ve grubunu ${ordinalWord(o.k + 1)} bitirenlerden en iyi ${o.extras} takım` : '';
  const byes = o.byes ? ` İlk eleme turunda en iyi ${o.byes} takım maç yapmadan bir üst tura geçer (bay).` : '';
  const crossTxt = cross ? ' Eşleşme çapraz olur: A grubu birincisi B grubu ikincisiyle oynar.' : '';
  return {
    id: `${prefix}g${o.G}-k${o.k}-e${o.extras}-b${o.byes}`,
    title: `${o.G === 1 ? 'Tek grup' : `${o.G} grup`}, sonra ${startRoundName(size).toLocaleLowerCase('tr')}`,
    description: `${groups} ${who}${extra} ${startRoundDative(size)} çıkar.${byes}${crossTxt}`,
    score: o.score,
    stages: [
      stage('grup', {
        groupCount: o.G,
        qualifiersPerGroup: o.k,
        bestExtra: { enabled: o.extras > 0, count: o.extras },
      }),
      stage('eleme', { pairing: cross ? 'capraz' : 'sirali', avoidSameGroup: true }),
    ],
  };
}

/** Şablon ve takım sayısına göre geçerli hazır planlar */
export function templateOptions(template: TemplateId, n: number): { options: PlanOption[]; message?: string } {
  if (n < 2) return { options: [], message: 'En az 2 takım gerekir.' };
  switch (template) {
    case 'lig': {
      const single = (n * (n - 1)) / 2;
      const opts: PlanOption[] = [
        { id: 'lig-1', title: 'Tek maçlı lig', description: `Her takım diğer her takımla 1 kez oynar. Toplam ${single} maç.`, score: 0, stages: [stage('lig', { legs: 1 })] },
        { id: 'lig-2', title: 'Rövanşlı lig (çift maç)', description: `Her takım diğer her takımla 2 kez oynar. Toplam ${single * 2} maç.`, score: 1, stages: [stage('lig', { legs: 2 })] },
      ];
      opts[0].recommended = true;
      const message = n > 16 ? `${n} takımlı ligde toplam ${single} maç oynanır, çok uzun sürebilir. “Grup + eleme” daha kısa sürer.` : undefined;
      return { options: opts, message };
    }
    case 'direkt-eleme': {
      if (isPowerOfTwo(n)) {
        return {
          options: [
            {
              id: 'eleme',
              title: `${n} takımlı eleme`,
              description: `Turnuva ${startRoundName(n).toLocaleLowerCase('tr')} ile başlar, kaybeden elenir. En güçlü takımlar ilk turlarda birbirine denk gelmez.`,
              score: 0,
              recommended: true,
              stages: [stage('eleme', { pairing: 'sirali' })],
            },
          ],
        };
      }
      const target = lowerPowerOfTwo(n);
      const m = n - target;
      return {
        options: [
          {
            id: 'eleme-oe',
            title: `${m} ön eleme maçı, sonra ${target} takımlı eleme`,
            description:
              `En zayıf ${2 * m} takım kendi aralarında ${m} maç oynar, ${m === 1 ? 'kaybeden' : 'kaybedenler'} elenir. ` +
              `Diğer ${n - 2 * m} takım doğrudan ${target} takımlık ana tabloya yerleşir; ${m === 1 ? 'ön eleme kazananı' : 'ön eleme kazananları'} ağaçta ` +
              `kendisini bekleyen yere geçer. Kuranın tamamı en başta çekilir, ön eleme maçları ağacın en solunda görünür.`,
            score: 0,
            recommended: true,
            stages: [stage('eleme', { pairing: 'sirali' })],
          },
        ],
      };
    }
    case 'grup-eleme': {
      const opts = groupKnockoutOptions(n).slice(0, 6).map((o) => groupOptionToPlan(n, o));
      if (opts.length) opts[0].recommended = true;
      return { options: opts, message: opts.length ? undefined : 'Bu takım sayısıyla grup + eleme yapılamıyor. “Direkt eleme” veya “Lig” seçin.' };
    }
    case 'on-eleme-grup-eleme': {
      if (n < 4) return { options: [], message: 'Ön eleme + grup + eleme için en az 4 takım gerekir. “Direkt eleme” veya “Lig” seçin.' };
      const found: PlanOption[] = [];
      for (let T = n - 1; T >= Math.ceil(n / 2); T--) {
        const best = groupKnockoutOptions(T).filter((o) => o.equal && o.byes === 0 && o.extras === 0 && o.G >= (T >= 6 ? 2 : 1));
        if (!best.length) continue;
        const o = best[0];
        const g = groupOptionToPlan(T, o, `oe${T}-`);
        const pm = n - T;
        found.push({
          id: `oe${T}-${g.id}`,
          title: `${pm} ön eleme maçı, sonra ${g.title.toLocaleLowerCase('tr')}`,
          description: `En zayıf ${2 * pm} takım kendi aralarında ${pm} maç oynar, ${pm === 1 ? 'kaybeden' : 'kaybedenler'} elenir. Kalan ${g.description}`,
          score: o.score + pm,
          stages: [stage('on-eleme', { target: T }), ...g.stages],
        });
      }
      found.sort((a, b) => a.score - b.score);
      const options = found.slice(0, 5);
      if (options.length) options[0].recommended = true;
      return { options, message: options.length ? undefined : 'Bu takım sayısı için uygun bir ön eleme bulunamadı. “Grup + eleme” veya “Direkt eleme” seçin.' };
    }
  }
}

export interface PlanAnalysis {
  flow: { name: string; type: StageType; inCount: number; outCount: number; text: string }[];
  errors: string[];
  warnings: string[];
  /** Hata/uyarı varsa önerilen geçerli planlar */
  suggestions: PlanOption[];
}

/** Yöneticinin elle düzenlediği planı doğrular ve geçerli seçenekler önerir */
export function analyzePlan(n: number, stages: StagePlan[]): PlanAnalysis {
  const errors: string[] = [];
  const warnings: string[] = [];
  const flow: PlanAnalysis['flow'] = [];
  let suggestions: PlanOption[] = [];
  if (!stages.length) {
    errors.push('Henüz hiç aşama yok. Yukarıdan hazır bir seçenek seçin veya aşama ekleyin.');
    return { flow, errors, warnings, suggestions };
  }
  let cur = n;
  stages.forEach((st, i) => {
    const last = i === stages.length - 1;
    const label = `${i + 1}. aşama (${st.name})`;
    const s = st.settings;
    let out = 0;
    let text = '';
    if (cur < 2) {
      errors.push(`${label}: bu aşamaya en az 2 takım gelmeli, şu an ${cur} takım geliyor.`);
      flow.push({ name: st.name, type: st.type, inCount: cur, outCount: 0, text: '' });
      cur = 0;
      return;
    }
    switch (st.type) {
      case 'on-eleme': {
        const T = s.target ?? 0;
        if (last) errors.push(`${label}: ön eleme son aşama olamaz; arkasına grup, lig veya eleme aşaması ekleyin.`);
        if (!(T < cur && cur <= 2 * T)) {
          errors.push(`${label}: ${cur} takımla en az 1, en fazla ${Math.floor(cur / 2)} ön eleme maçı yapılabilir.`);
          suggestions = suggestions.concat(templateOptions('direkt-eleme', cur).options.filter((o) => o.stages[0].type === 'on-eleme'));
        }
        out = T;
        text = `${cur - T} maç oynanır, ${cur - 2 * (cur - T)} takım doğrudan geçer → ${T} takım devam eder`;
        break;
      }
      case 'grup':
      case 'lig': {
        const G = st.type === 'lig' ? 1 : s.groupCount ?? 1;
        const k = s.qualifiersPerGroup ?? 0;
        if (G < 1 || cur < G * 2) {
          errors.push(`${label}: ${cur} takım ${G} gruba bölünemez; her grupta en az 2 takım olmalı.`);
          out = 0;
          break;
        }
        const sizes = groupSizes(cur, G);
        const minSize = Math.min(...sizes);
        if (st.type === 'grup' && Math.max(...sizes) !== minSize) {
          warnings.push(`${label}: ${cur} takım ${G} gruba eşit bölünmüyor (${sizesText(cur, G)}). Bu sorun değil; ama gruplar eşit olsun isterseniz aşağıdaki seçeneklerden birini seçin.`);
          suggestions = suggestions.concat(groupKnockoutOptions(cur).filter((o) => o.equal).slice(0, 3).map((o) => groupOptionToPlan(cur, o)));
          // İlk aşamaysa: ön eleme ile eşit gruplara inme seçeneği
          if (i === 0) suggestions = suggestions.concat(templateOptions('on-eleme-grup-eleme', cur).options.slice(0, 2));
        }
        if (last) {
          if (G > 1) errors.push(`${label}: birden fazla grupla turnuva bitemez, çünkü şampiyon belli olmaz. Son aşama tek grup (lig) veya eleme olmalı; gruplardan sonra bir eleme aşaması ekleyin.`);
          out = 0;
          text = G === 1 ? 'Birinci olan şampiyon olur' : '';
        } else {
          if (k < 1) errors.push(`${label}: ${G === 1 ? 'bir sonraki aşamaya' : 'her gruptan bir sonraki aşamaya'} en az 1 takım çıkmalı.`);
          if (k > minSize) errors.push(`${label}: her gruptan ${k} takım çıkamaz, çünkü en küçük grupta ${minSize} takım var.`);
          out = G * k;
          const ex = s.bestExtra?.enabled ? s.bestExtra.count : 0;
          if (ex) {
            const cands = sizes.filter((x) => x >= k + 1).length;
            if (ex > cands) errors.push(`${label}: grubunu ${ordinalWord(k + 1)} bitirenlerden ${ex} takım alınamaz; en fazla ${cands} aday var.`);
            out += ex;
          }
          text = `${G === 1 ? 'Tek grup' : `${G} grup (${sizesText(cur, G)})`}, ${G === 1 ? 'ilk' : 'her gruptan ilk'} ${k}${ex ? ` + en iyi ${ex} ${ordinalWord(k + 1)}` : ''} → ${out} takım devam eder`;
          const nextSt = stages[i + 1];
          if (nextSt?.type === 'eleme' && out >= 2 && !isPowerOfTwo(out)) {
            const need = nextPowerOfTwo(out) - out;
            warnings.push(
              `${label}: eleme turuna ${out} takım çıkıyor. Eleme ağacı 2, 4, 8, 16, 32 veya 64 takımla kurulur; bu yüzden en kötü derecelerle gelen ${2 * (out - lowerPowerOfTwo(out))} takım önce ön eleme oynar, en iyi ${need} takım ön elemeyi maç yapmadan geçer (bay geçer). İstemiyorsanız aşağıdaki seçeneklerden birini seçin.`,
            );
            suggestions = suggestions.concat(
              groupKnockoutOptions(cur)
                .filter((o) => o.G === G && o.byes === 0)
                .concat(groupKnockoutOptions(cur).filter((o) => o.byes === 0 && o.equal))
                .slice(0, 4)
                .map((o) => groupOptionToPlan(cur, o)),
            );
          }
          if (nextSt?.type === 'eleme' && nextSt.settings.pairing === 'capraz' && !(G >= 2 && G % 2 === 0 && k <= 2 && !ex && isPowerOfTwo(out))) {
            warnings.push(
              `${i + 2}. aşama: çapraz eşleşme (A1–B2, B1–A2) ancak grup sayısı çift olduğunda ve her gruptan 1 veya 2 takım çıktığında yapılabilir. Bu planda eşleşmeler başarı sırasına göre yapılacak (en iyi takım en zayıfla).`,
            );
          }
        }
        break;
      }
      case 'eleme': {
        if (!last) errors.push(`${label}: elemeden sonra başka aşama olamaz; eleme son aşama olmalı.`);
        const prev = stages[i - 1];
        if (prev?.type === 'on-eleme') {
          warnings.push(
            `${label}: ön eleme ayrı bir aşama olduğu için eleme ağacının kurası ön eleme maçları bittikten sonra çekilebilir. ` +
              `Ağacın kurasını hemen çekmek ve ön eleme maçlarını ağacın en solunda göstermek isterseniz ön eleme aşamasını kaldırın; ` +
              `eleme aşaması gerekirse en zayıf takımlara ön elemeyi kendisi oynatır.`,
          );
        }
        if (!isPowerOfTwo(cur)) {
          const main = lowerPowerOfTwo(cur);
          const pm = cur - main;
          if (prev && prev.type !== 'on-eleme') {
            // Gruplardan sonra: "en zayıf" değil, en kötü derecelerle gelenler ön eleme oynar
            text = `${pm} ön eleme maçı (en kötü derecelerle gelen ${2 * pm} takım) + ${main} takımlı ana tablo → şampiyon`;
          } else {
            text = `${pm} ön eleme maçı (en zayıf ${2 * pm} takım) + ${main} takımlı ana tablo → şampiyon`;
          }
        } else {
          text = `${cur} takımla eleme → şampiyon`;
        }
        out = 1;
        break;
      }
    }
    flow.push({ name: st.name, type: st.type, inCount: cur, outCount: out, text });
    cur = out;
  });
  const seen = new Set<string>();
  suggestions = suggestions.filter((o) => {
    const key = JSON.stringify(o.stages);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Önerilerin kendisi geçerli olmalı (öneri ilk aşamadan itibaren tüm plan değilse uyarlamayız)
  if (stages.length > 1 && stages[0].type === 'on-eleme' && suggestions.length) {
    // ön elemeli planda grup önerileri ilk aşamaya göre değil sonraki aşamaya göre üretildi
    const T = stages[0].settings.target ?? 0;
    suggestions = suggestions.map((o) => (o.stages[0].type === 'grup' ? {
            ...o,
            stages: [stages[0], ...o.stages],
            title: `${n - T} ön eleme maçı, sonra ${o.title.toLocaleLowerCase('tr')}`,
            description: `Önce ${n - T} ön eleme maçı oynanır. Kalan ${o.description}`,
          } : o));
  }
  return { flow, errors, warnings, suggestions: suggestions.slice(0, 6) };
}
