import { Link } from 'react-router-dom';
import type { FeedItem } from '../../shared/types.ts';
import { fmtDayShort, fmtKm, fmtTime, relativeFromNow } from '../format.ts';
import { Avatar } from '../ui.tsx';

export function FeedRow({ item }: { item: FeedItem }) {
  let text: React.ReactNode;
  let to: string | null = null;
  if (item.kind === 'workout_shared') {
    text = (
      <>
        ha completato <strong>{item.workout.title}</strong> ({item.workout.durationMin} min{item.workout.distanceKm ? `, ${fmtKm(item.workout.distanceKm)}` : ''})
      </>
    );
  } else if (item.kind === 'run_completed') {
    const a = item.activity;
    text = (
      <>
        ha registrato una corsa
        {a.distanceKm ? <> da <strong>{fmtKm(a.distanceKm)}</strong> <span className="muted">(dichiarati)</span></> : null}
      </>
    );
  } else {
    to = `/uscita/${item.event.id}`;
    text =
      item.kind === 'event_created' ? (
        <>
          ha organizzato <strong>{item.event.title}</strong>
        </>
      ) : (
        <>
          partecipa a <strong>{item.event.title}</strong>
        </>
      );
  }
  const body = (
    <>
      <Avatar user={item.user} size={40} />
      <span className="grow">
        <span>
          <strong>{item.user.displayName}</strong> {text}
        </span>
        <br />
        <span className="muted xs">
          {item.kind === 'event_created' || item.kind === 'event_joined' ? `${fmtDayShort(item.event.startsAt, item.event.timezone)}, ${fmtTime(item.event.startsAt, item.event.timezone)} · ` : ''}
          {relativeFromNow(item.at)}
        </span>
      </span>
    </>
  );
  return to ? (
    <Link to={to} className="card card-link row" style={{ flexDirection: 'row', alignItems: 'center' }}>
      {body}
    </Link>
  ) : (
    <div className="card row" style={{ flexDirection: 'row' }}>
      {body}
    </div>
  );
}
