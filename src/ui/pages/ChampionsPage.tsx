import { useEffect, useState } from 'react';
import { api, type PublicData } from '../api';
import { Spinner, useDocumentTitle } from '../common';
import { ChampionList } from './ChampionList';

export default function ChampionsPage() {
  const [data, setData] = useState<PublicData | null>(null);
  const [error, setError] = useState('');
  useDocumentTitle('Şampiyonlar');
  useEffect(() => {
    api.publicData().then(setData).catch((e) => setError(e.message));
  }, []);
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return <Spinner />;
  return (
    <section className="section">
      <div className="section-head">
        <h2>Şampiyonlar arşivi</h2>
        <span className="small muted">{data.champions.length} kayıt</span>
      </div>
      <ChampionList items={data.champions} />
    </section>
  );
}
