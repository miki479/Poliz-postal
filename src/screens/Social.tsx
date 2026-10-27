import { Newspaper, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FeedRow } from '../components/FeedRow.tsx';
import { useSession } from '../session.tsx';
import { EmptyState, ErrorState, ListSkeleton, useAsync } from '../ui.tsx';
import { ClubImage, Leaderboard } from './Clubs.tsx';
import { ChallengesSection } from './Challenges.tsx';

export function Social() {
  const { backend, me } = useSession();
  const feed = useAsync(() => backend.getFeed(), [me?.id]);
  const clubs = useAsync(() => backend.listMyClubs(), [me?.id]);
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<'challenges' | 'activity'>('challenges');
  const clubId = sel ?? clubs.data?.[0]?.id ?? null;

  return (
    <div className="page">
      <header className="topbar"><h1 className="display h1">Social</h1></header>

      <div className="seg" role="group" aria-label="Sezione">
        <button aria-pressed={tab === 'challenges'} onClick={() => setTab('challenges')}>Sfide</button>
        <button aria-pressed={tab === 'activity'} onClick={() => setTab('activity')}>Attività</button>
      </div>

      {tab === 'challenges' && <ChallengesSection />}
      {tab === 'activity' && <>

      <section className="stack" aria-labelledby="fd">
        <h2 className="section-title" id="fd">Dai tuoi compagni di club</h2>
        {feed.loading ? <ListSkeleton /> : feed.error ? <ErrorState message={feed.error.message} onRetry={feed.reload} /> : feed.data && feed.data.length ? feed.data.map((i) => <FeedRow key={i.id} item={i} />) : (
          <EmptyState icon={<Newspaper />} title="Ancora niente da vedere" text="Qui compaiono le uscite che organizzano o a cui partecipano i compagni dei tuoi club, e le corse che registrano. Chi non vuole condividere le attività non compare." action={<Link to="/club" className="btn btn-outline"><Users size={18} aria-hidden="true" /> Vai ai club</Link>} />
        )}
      </section>

      {clubs.data && clubs.data.length > 0 && clubId && (
        <section className="stack" aria-label="Classifica del club">
          {clubs.data.length > 1 && (
            <div className="filter-row" role="group" aria-label="Scegli il club">
              {clubs.data.map((c) => <button key={c.id} className="pill" aria-pressed={clubId === c.id} onClick={() => setSel(c.id)}><ClubImage club={c} size={24} /> {c.name}</button>)}
            </div>
          )}
          <Leaderboard key={clubId} clubId={clubId} />
        </section>
      )}
      </>}
    </div>
  );
}
