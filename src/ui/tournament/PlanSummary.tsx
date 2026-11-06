import { analyzePlan, STAGE_TYPE_LABELS, type StagePlan } from '../../engine/planner';
import { CRITERION_LABELS, DEFAULT_CRITERIA } from '../../engine/standings';

/** Planın okunur özeti: akış + her aşamanın ayarları (sihirbaz özeti ve kilitli Format sekmesi ortak kullanır) */
export function PlanSummary({ n, plan, showCriteria = false }: { n: number; plan: StagePlan[]; showCriteria?: boolean }) {
  const analysis = analyzePlan(n, plan);
  return (
    <div>
      <div className="flow">
        <span className="step">
          <b>{n} takım</b>
        </span>
        {analysis.flow.map((f, i) => (
          <span key={i} style={{ display: 'contents' }}>
            <span className="muted">→</span>
            <span className="step">
              <b>{f.name}</b> <span className="small muted">{STAGE_TYPE_LABELS[f.type]} · {f.text}</span>
            </span>
          </span>
        ))}
      </div>
      {plan.map((p, i) => {
        const afterGroups = i > 0 && (plan[i - 1].type === 'grup' || plan[i - 1].type === 'lig');
        const parts = [
          (p.type === 'grup' || p.type === 'lig') && (p.settings.legs === 2 ? 'takımlar iki kez karşılaşır (rövanşlı)' : 'takımlar bir kez karşılaşır'),
          p.type === 'on-eleme' && `${p.settings.target ?? 0} takım sonraki aşamaya kalır`,
          p.settings.bestExtra?.enabled && `en iyi ${p.settings.bestExtra.count} ek takım da çıkar`,
          p.type === 'eleme' &&
            afterGroups &&
            (p.settings.pairing === 'capraz' ? 'çapraz eşleşme (A1–B2, B1–A2)' : p.settings.pairing === 'elle' ? 'eşleşmeler elle belirlenir' : 'başarı sırasına göre eşleşme'),
          p.type === 'eleme' && afterGroups && p.settings.avoidSameGroup !== false && 'aynı gruptan gelenler ilk turda karşılaşmaz',
          p.type === 'eleme' && (p.settings.thirdPlace ? 'üçüncülük maçı var' : 'üçüncülük maçı yok'),
        ].filter(Boolean);
        return (
          <div key={i} className="small" style={{ marginTop: 6 }}>
            <b>{p.name}:</b> {parts.join(' · ') || '—'}
            {showCriteria && (p.type === 'grup' || p.type === 'lig') && (
              <div className="tiny muted">
                Puan eşitliğinde: {(p.settings.criteria ?? DEFAULT_CRITERIA).map((c) => CRITERION_LABELS[c]).join(' → ')} → yönetici kararı
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
