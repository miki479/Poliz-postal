import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { Platform, Text } from 'react-native';
import { Banner, Button, Sheet, SwitchRow, t, useReduceMotion } from '@/components/ui';
import { post } from '@/lib/api';
import { deviceTimezone } from '@/lib/format';
import { humanError } from '@/lib/errors';
export function StoryExportSheet({
  logId,
  visible,
  onClose,
  strava = false,
}: {
  logId: string;
  visible: boolean;
  onClose(): void;
  strava?: boolean;
}) {
  const [route, setRoute] = useState(false),
    [people, setPeople] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const still = useReduceMotion();
  const generation = useRef({value:0});
  useEffect(() => {
    const token=generation.current;
    if (!visible) token.value++;
    return () => { token.value++; };
  }, [visible]);
  const exportVideo = async () => {
    if (busy) return;
    const ticket = ++generation.current.value;
    setBusy(true);
    setError('');
    let file: File | null = null;
    try {
      const result = await post<{ base64: string; filename: string; mime: string }>('/api/story/export', {
        logId,
        includeRoute: route && !strava,
        includePeople: people,
        reduceMotion: still,
        timezone:deviceTimezone(),
      });
      if (ticket !== generation.current.value) return;
      if (Platform.OS === 'web') {
        const a = document.createElement('a');
        a.href = `data:video/mp4;base64,${result.base64}`;
        a.download = 'runngo-racconto.mp4';
        a.click();
      } else {
        if (!(await Sharing.isAvailableAsync())) throw new Error('La condivisione dei file non è disponibile su questo dispositivo.');
        file = new File(Paths.cache, `runngo-racconto-${Date.now()}.mp4`);
        file.create();
        await file.write(result.base64, { encoding: 'base64' });
        if (ticket !== generation.current.value) return;
        await Sharing.shareAsync(file.uri, { mimeType: 'video/mp4', UTI: 'public.mpeg-4', dialogTitle: 'Salva o condividi il Racconto' });
      }
      if (ticket === generation.current.value) onClose();
    } catch (e) {
      if (ticket === generation.current.value) setError(humanError(e, 'Non riesco a esportare il video. Riprova.'));
    } finally {
      if (file?.exists) file.delete();
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Esporta il Racconto">
      <Text style={t.muted}>
        Video verticale MP4 di 12 secondi, senza audio. Contiene soltanto i dati disponibili. Dal pannello di condivisione puoi salvarlo nei
        File o inviarlo.
      </Text>
      {!strava ? (
        <SwitchRow
          label="Includi lo schema del percorso"
          hint="Partenza e arrivo protetti per 300 m. Il video non contiene una mappa stradale né coordinate scritte."
          value={route}
          onChange={setRoute}
        />
      ) : (
        <Text style={t.small}>L’attività importata resta privata in Runngo; il percorso Strava non viene incluso nel file.</Text>
      )}
      <SwitchRow
        label="Includi i compagni confermati"
        hint="Solo chi ha confermato e consente la condivisione. Il file può essere visto da chi lo riceve."
        value={people}
        onChange={setPeople}
      />
      {still ? <Text style={t.small}>Riduci movimento attivo: il percorso resta statico.</Text> : null}
      {error ? <Banner tone="error" text={error} /> : null}
      <Button title={busy ? 'Preparo il video…' : 'Esporta MP4'} busy={busy} onPress={() => void exportVideo()} />
      <Text style={t.small}>Puoi chiudere subito: il pannello di condivisione non verrà aperto dopo la chiusura.</Text>
    </Sheet>
  );
}
