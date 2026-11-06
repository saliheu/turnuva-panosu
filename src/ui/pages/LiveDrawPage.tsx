import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Tournament } from '../../engine/types';
import { api } from '../api';
import { Spinner } from '../common';
import { LiveDraw } from '../tournament/LiveDraw';

/** Kesinleşmiş kuranın canlı tekrarı (öğrencilerle birlikte izlemek için, herkese açık) */
export default function LiveDrawPage() {
  const { id, stageId } = useParams();
  const navigate = useNavigate();
  const [t, setT] = useState<Tournament | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.tournament(id!).then(setT).catch((e) => setError(e.message));
  }, [id]);
  if (error) return <div className="alert error">{error}</div>;
  if (!t) return <Spinner />;
  const stage = t.stages.find((s) => s.id === stageId);
  if (!stage?.drawSteps?.length) return <div className="empty">Bu aşama için kura kaydı yok.</div>;
  return <LiveDraw t={t} title={`${t.name} · ${stage.name}`} steps={stage.drawSteps} layout={stage.drawLayout} onClose={() => navigate(`/t/${t.id}`)} />;
}
