import { groupTables } from '../../engine/qualify';
import { slugify, teamName } from '../../engine/tournament';
import type { Tournament } from '../../engine/types';
import { resolveAll, slotPlaceholder, stageRoundLabel } from './ctx';

function matchRows(t: Tournament) {
  const rows: (string | number | null)[][] = [];
  for (const stage of t.stages) {
    if (!stage.matches.length) continue;
    const res = resolveAll(stage);
    const ms = stage.matches
      .filter((m) => m.a.kind !== 'bye' && m.b.kind !== 'bye')
      .slice()
      .sort((x, y) => x.round - y.round || (x.third ? -1 : 0) - (y.third ? -1 : 0) || (x.group ?? '').localeCompare(y.group ?? '') || x.no - y.no);
    for (const m of ms) {
      const r = res.get(m.id)!;
      const a = r.a ? teamName(t, r.a) : slotPlaceholder(stage, m.a);
      const b = r.b ? teamName(t, r.b) : slotPlaceholder(stage, m.b);
      const scored = m.scoreA != null && m.scoreB != null;
      let note = m.note ?? '';
      if (m.forfeit) note = ['Hükmen', note].filter(Boolean).join(' · ');
      if (m.penA != null && m.penB != null) note = [`Penaltı ${m.penA}-${m.penB}`, note].filter(Boolean).join(' · ');
      else if (m.decided && scored && m.scoreA === m.scoreB && r.winner) note = [`Kazanan: ${teamName(t, r.winner)} (karar)`, note].filter(Boolean).join(' · ');
      rows.push([
        stage.name,
        m.group && m.group !== 'Lig' ? `${m.group} Grubu` : '',
        stageRoundLabel(stage, m.round, m.third),
        m.no || null,
        m.date ?? '',
        m.time ?? '',
        m.venue ?? '',
        a,
        scored ? m.scoreA! : null,
        scored ? m.scoreB! : null,
        b,
        note,
      ]);
    }
  }
  return rows;
}

/** Fikstürü gerçek eşleşmelerle Excel (.xlsx) olarak indirir */
export async function exportExcel(t: Tournament) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const bold = (v: string) => ({ value: v, fontWeight: 'bold' as const });
  const header = ['Aşama', 'Grup', 'Tur / Hafta', 'Maç No', 'Tarih', 'Saat', 'Saha', 'Takım 1', 'Skor 1', 'Skor 2', 'Takım 2', 'Not'];
  const cell = (v: string | number | null) => (v === null || v === '' ? null : typeof v === 'number' ? { value: v, type: Number } : { value: v });
  const fixture = [
    [bold(`${t.name} — ${t.sport} — ${t.schoolYear}${t.category ? ` — ${t.category}` : ''}`)],
    [],
    header.map(bold),
    ...matchRows(t).map((r) => r.map(cell)),
  ];
  const sheets = [
    {
      sheet: 'Fikstür',
      data: fixture,
      columns: [{ width: 16 }, { width: 10 }, { width: 14 }, { width: 8 }, { width: 12 }, { width: 8 }, { width: 16 }, { width: 24 }, { width: 7 }, { width: 7 }, { width: 24 }, { width: 22 }],
    },
  ] as { sheet: string; data: unknown[][]; columns?: { width: number }[] }[];

  for (const stage of t.stages) {
    if ((stage.type === 'grup' || stage.type === 'lig') && stage.groups?.length) {
      const data: unknown[][] = [];
      for (const tb of groupTables(t, stage)) {
        data.push([bold(stage.type === 'lig' ? 'Puan Durumu' : `${tb.group} Grubu`)]);
        data.push(['Sıra', 'Takım', 'O', 'G', 'B', 'M', 'A', 'Y', 'Av', 'P'].map(bold));
        for (const r of tb.rows) {
          data.push([r.rank, teamName(t, r.teamId), r.played, r.won, r.drawn, r.lost, r.gf, r.ga, r.gd, r.points].map((v) => (typeof v === 'number' ? { value: v, type: Number } : { value: v })));
        }
        data.push([]);
      }
      sheets.push({ sheet: `${stage.name}`.slice(0, 28), data, columns: [{ width: 6 }, { width: 26 }, ...Array(8).fill({ width: 6 })] });
    }
  }
  // Güç puanları yalnızca yönetici verisinde bulunur (ziyaretçide 0 gelir)
  const withPower = t.teams.some((tm) => tm.power > 0);
  sheets.push({
    sheet: 'Takımlar',
    data: [
      (withPower ? ['Takım', 'Güç', 'Oyuncular'] : ['Takım', 'Oyuncular']).map(bold),
      ...t.teams.map((tm) => [
        { value: tm.name + (tm.withdrawn ? ' (çekildi)' : '') },
        ...(withPower ? [{ value: tm.power, type: Number }] : []),
        tm.members.length ? { value: tm.members.join(', ') } : null,
      ]),
    ],
    columns: withPower ? [{ width: 26 }, { width: 6 }, { width: 60 }] : [{ width: 26 }, { width: 60 }],
  });
  // Sayfa adları benzersiz olmalı
  const used = new Set<string>();
  for (const s of sheets) {
    let name = s.sheet.replace(/[\\/?*[\]:]/g, ' ');
    let i = 2;
    while (used.has(name)) name = `${s.sheet.slice(0, 25)} ${i++}`;
    used.add(name);
    s.sheet = name;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await writeXlsxFile(sheets as any).toFile(`${slugify(t.name)}-fikstur.xlsx`);
}

/** Verilen öğeyi PNG olarak indirir */
export async function exportImage(el: HTMLElement, fileName: string) {
  const { toPng } = await import('html-to-image');
  el.classList.add('exporting');
  try {
    const width = el.scrollWidth;
    const height = el.scrollHeight;
    const url = await toPng(el, {
      backgroundColor: '#f4f1e8',
      pixelRatio: Math.min(2, Math.max(1, 3000 / Math.max(width, height))),
      width,
      height,
      style: { overflow: 'visible' },
      cacheBust: true,
    });
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.png`;
    a.click();
  } finally {
    el.classList.remove('exporting');
  }
}
