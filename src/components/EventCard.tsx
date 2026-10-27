import { Check, Clock, Gauge, MapPin, Route, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { levelLabel } from '../../shared/sports.ts';
import type { EventView } from '../../shared/types.ts';
import { dayNumber, eventPath, fmtKm, fmtTime, formatPace, monthShort } from '../format.ts';
import { DemoChip } from '../ui.tsx';

export function EventCard({ event: e, distanceFromMeKm }: { event: EventView; distanceFromMeKm?: number | null }) {
  const going = e.viewer.isParticipant;
  return (
    <Link to={eventPath(e)} className={`event ${e.status === 'cancelled' ? 'cancelled' : ''}`} aria-label={`${e.title}, ${fmtTime(e.startsAt, e.timezone)}`}>
      <div className="event-date" aria-hidden="true">
        <span className="d">{dayNumber(e.startsAt, e.timezone)}</span>
        <span className="m">{monthShort(e.startsAt, e.timezone)}</span>
      </div>
      <div className="event-body">
        <div className="event-title">{e.title}</div>
        <div className="event-meta">
          <Clock size={15} aria-hidden="true" />
          <span>{fmtTime(e.startsAt, e.timezone)}</span>
          {!e.restricted && (
            <>
              <MapPin size={15} aria-hidden="true" />
              <span className="truncate">{e.meetingPlace}</span>
            </>
          )}
        </div>
        <div className="tags">
          {e.status === 'cancelled' && <span className="chip danger">Annullata</span>}
          {going && e.status === 'active' && (
            <span className="chip success">
              <Check size={13} aria-hidden="true" /> Partecipi
            </span>
          )}
          {e.isFull && !going && e.status === 'active' && <span className="chip danger">Al completo</span>}
          {e.distanceKm !== null && (
            <span className="chip">
              <Route size={13} aria-hidden="true" /> {fmtKm(e.distanceKm)}
            </span>
          )}
          {e.paceSecPerKm !== null && (
            <span className="chip">
              <Gauge size={13} aria-hidden="true" /> {formatPace(e.paceSecPerKm)}
            </span>
          )}
          <span className="chip">{levelLabel(e.level)}</span>
          <span className="chip accent">
            <Users size={13} aria-hidden="true" /> {e.participantCount}
            {e.maxParticipants ? `/${e.maxParticipants}` : ''}
          </span>
          {distanceFromMeKm != null && <span className="chip accent">{distanceFromMeKm < 1 ? '< 1 km da te' : `${Math.round(distanceFromMeKm)} km da te`}</span>}
          {e.club && <span className="chip">{e.club.name}</span>}
          <DemoChip id={e.id} />
        </div>
      </div>
    </Link>
  );
}
