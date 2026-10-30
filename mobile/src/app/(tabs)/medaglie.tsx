import { BadgesView } from '@/app/traguardi';
import { TabScreen } from '@/components/ui';

export default function Medaglie() {
  return (
    <TabScreen title="Medaglie" subtitle="I traguardi che hai ottenuto e i prossimi">
      <BadgesView />
    </TabScreen>
  );
}
