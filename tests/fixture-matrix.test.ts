import { describe, expect, it } from 'vitest';
import { TEMPLATES, templateOptions, analyzePlan } from '../src/engine';
import { runPlan } from './helpers';

/**
 * 2-64 arası her takım sayısını tüm şablonlar ve her şablonun önerdiği tüm
 * seçeneklerle, hem dengeli hem rastgele kurayla uçtan uca oynatır.
 */
describe('fikstür motoru: 2-64 takım × tüm şablonlar', () => {
  for (const tpl of TEMPLATES) {
    it(`${tpl.title}`, () => {
      let played = 0;
      for (let n = 2; n <= 64; n++) {
        const { options, message } = templateOptions(tpl.id, n);
        if (!options.length) {
          // Uygun olmayan durumda mutlaka açıklama verilmeli (yalnızca çok küçük sayılarda)
          expect(message, `${tpl.id} n=${n}`).toBeTruthy();
          expect(n, `${tpl.id} n=${n} için seçenek yok`).toBeLessThan(4);
          continue;
        }
        expect(options.filter((o) => o.recommended).length).toBe(1);
        for (const opt of options) {
          // Hazır seçenekler hatasız olmalı
          const analysis = analyzePlan(n, opt.stages);
          expect(analysis.errors, `${tpl.id} n=${n} ${opt.id}`).toEqual([]);
          for (const mode of ['dengeli', 'rastgele'] as const) {
            // Büyük liglerde süreyi kısaltmak için rastgele modu yalnızca bazı sayılarda dene
            if (tpl.id === 'lig' && mode === 'rastgele' && n % 5 !== 0) continue;
            runPlan(n, opt.stages, mode, n * 31 + opt.id.length);
            played++;
          }
        }
      }
      expect(played).toBeGreaterThan(50);
    });
  }

  it('voleybol ve basketbolda (beraberliksiz) da çalışır', () => {
    for (const n of [5, 8, 12, 17, 24, 33]) {
      for (const sport of ['Voleybol', 'Basketbol', 'Badminton']) {
        const opt = templateOptions('grup-eleme', n).options[0];
        runPlan(n, opt.stages, 'dengeli', n, sport);
      }
    }
  });
});
