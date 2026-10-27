import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell.tsx';
import { RequireAuth } from './session.tsx';
import { ClubDetail, ClubForm, Clubs, JoinClub } from './screens/Clubs.tsx';
import { EventDetail } from './screens/EventDetail.tsx';
import { EventForm } from './screens/EventForm.tsx';
import { Explore } from './screens/Explore.tsx';
import { Home } from './screens/Home.tsx';
import { Notifications } from './screens/Notifications.tsx';
import { Profile } from './screens/Profile.tsx';
import { Social } from './screens/Social.tsx';
import { ChallengeDetail, ChallengeForm } from './screens/Challenges.tsx';
import { RouteDetail, RouteForm } from './screens/Routes.tsx';
import { Plan, PlanWizard, Progress, Routines, SessionDetail, SessionForm } from './screens/Training.tsx';
import { Coach } from './screens/Coach.tsx';
import { Privacy } from './screens/Privacy.tsx';
import { Stats } from './screens/Stats.tsx';
import { Integrations } from './screens/Integrations.tsx';
import { Welcome } from './screens/Welcome.tsx';
import { ForgotPassword, Onboarding, ResetPassword, VerifyEmail } from './screens/Auth.tsx';

const priv = (el: React.ReactNode) => <RequireAuth>{el}</RequireAuth>;

export function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/benvenuto" element={<Welcome />} />
        <Route index element={<Home />} />
        <Route path="/recupera-password" element={<ForgotPassword />} />
        <Route path="/reimposta-password" element={<ResetPassword />} />
        <Route path="/verifica-email" element={<VerifyEmail />} />
        <Route path="/profilo/statistiche" element={priv(<Stats />)} />
        <Route path="/profilo/integrazioni" element={priv(<Integrations />)} />
        <Route path="/profilo/inizia" element={priv(<Onboarding />)} />
        <Route path="/esplora" element={<Explore />} />
        <Route path="/uscita/nuova" element={priv(<EventForm mode="new" />)} />
        <Route path="/uscita/:id" element={<EventDetail />} />
        <Route path="/uscita/:id/modifica" element={priv(<EventForm mode="edit" />)} />
        <Route path="/percorso/nuovo" element={priv(<RouteForm mode="new" />)} />
        <Route path="/percorso/:id" element={<RouteDetail />} />
        <Route path="/percorso/:id/modifica" element={priv(<RouteForm mode="edit" />)} />
        <Route path="/piano" element={priv(<Plan />)} />
        <Route path="/piano/procedura" element={priv(<PlanWizard />)} />
        <Route path="/piano/progressi" element={priv(<Progress />)} />
        <Route path="/piano/routine" element={priv(<Routines />)} />
        <Route path="/piano/sessione/nuova" element={priv(<SessionForm mode="new" />)} />
        <Route path="/piano/sessione/:id" element={priv(<SessionDetail />)} />
        <Route path="/piano/sessione/:id/modifica" element={priv(<SessionForm mode="edit" />)} />
        <Route path="/coach" element={priv(<Coach />)} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/club" element={<Clubs />} />
        <Route path="/club/nuovo" element={priv(<ClubForm />)} />
        <Route path="/club/:id" element={priv(<ClubDetail />)} />
        <Route path="/invito/:code" element={<JoinClub />} />
        <Route path="/sfide/nuova" element={priv(<ChallengeForm />)} />
        <Route path="/sfida/:id" element={<ChallengeDetail />} />
        <Route path="/social" element={priv(<Social />)} />
        <Route path="/profilo" element={priv(<Profile />)} />
        <Route path="/profilo/:userId" element={priv(<Profile />)} />
        <Route path="/notifiche" element={priv(<Notifications />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
