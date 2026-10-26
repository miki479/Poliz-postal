import { ArrowLeft, Bell, CalendarClock, CalendarX, Flag, Trophy, UserPlus, Users } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { Notification } from '../../shared/types.ts';
import { relativeFromNow } from '../format.ts';
import { useSession } from '../session.tsx';
import { EmptyState, ErrorState, ListSkeleton, useAsync } from '../ui.tsx';

const ICON = { workout_companion: Users, event_updated: CalendarClock, event_cancelled: CalendarX, participant_joined: UserPlus, club_member_joined: Users, challenge_joined: Flag, challenge_ended: Trophy, new_follower: UserPlus, new_comment: Bell, club_invite: Users, event_invite: UserPlus } as const;

export function Notifications() {
  const { backend, refreshUnread } = useSession();
  const { data, error, loading, reload } = useAsync(() => backend.listNotifications(), []);
  useEffect(() => {
    if (data?.some((n) => !n.readAt)) backend.markNotificationsRead().then(refreshUnread, () => {});
  }, [data, backend, refreshUnread]);

  return (
    <div className="page">
      <Link to="/" className="back-link"><ArrowLeft size={18} aria-hidden="true" /> Home</Link>
      <h1 className="display h1">Notifiche</h1>
      <p className="hint" style={{ marginTop: -12 }}>Avvisi dentro l'app. Le notifiche push sul telefono non sono ancora attive.</p>
      {loading ? <ListSkeleton /> : error ? <ErrorState message={error.message} onRetry={reload} /> : data && data.length ? (
        <ul className="stack">
          {data.map((n: Notification) => {
            const I = ICON[n.type];
            const body = (
              <>
                <span className="chip accent" style={{ width: 36, height: 36, justifyContent: 'center', padding: 0, flex: 'none' }}><I size={18} aria-hidden="true" /></span>
                <span className="grow"><span>{n.text}</span><br /><span className="muted xs">{relativeFromNow(n.createdAt)}</span></span>
                {!n.readAt && <span className="chip accent">Nuova</span>}
              </>
            );
            const to = n.eventId ? `/uscita/${n.eventId}` : n.challengeId ? `/sfida/${n.challengeId}` : n.clubId ? `/club/${n.clubId}` : null;
            return <li key={n.id}>{to ? <Link to={to} className="card card-link row" style={{ flexDirection: 'row' }}>{body}</Link> : <div className="card row" style={{ flexDirection: 'row' }}>{body}</div>}</li>;
          })}
        </ul>
      ) : <EmptyState icon={<Bell />} title="Nessuna notifica" text="Ti avvisiamo qui quando qualcuno si iscrive alle tue uscite o quando un'uscita a cui partecipi cambia." />}
    </div>
  );
}
