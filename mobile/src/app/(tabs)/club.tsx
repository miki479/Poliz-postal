import { Redirect } from 'expo-router';

/** La vecchia scheda Community ora è "Gruppi" dentro Esplora: i vecchi collegamenti arrivano lì. */
export default function Club() {
  return <Redirect href={{ pathname: '/esplora', params: { tab: 'groups' } }} />;
}
