import { Redirect } from 'expo-router';
/** Compatibilità con vecchi collegamenti: gli aggiornamenti sono nella Home. */
export default function Social() { return <Redirect href="/" />; }
