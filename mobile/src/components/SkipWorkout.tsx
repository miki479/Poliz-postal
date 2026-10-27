import { useState } from 'react';
import { Text } from 'react-native';
import { Banner, Button, Sheet, t } from './ui';
import { call } from '@/lib/api';
import { humanError } from '@/lib/errors';
import { SKIP_REASONS, type SkipReason } from '@shared/skipReasons.ts';
import type { PlannedSession } from '@shared/types.ts';

export function SkipWorkoutSheet({session,onClose,onSaved}:{session:PlannedSession|null;onClose():void;onSaved():void}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function skip(reason:SkipReason){
  if(!session||busy)return;setBusy(true);setError('');
  try{await call('skipSession',session.id,true,reason);onSaved();onClose();}
  catch(e){setError(humanError(e,'Allenamento non aggiornato. Riprova.'));}
  finally{setBusy(false);}
 }
 return <Sheet visible={!!session} onClose={onClose} title="Perché salti l’allenamento?">
  {session?<Text style={t.title}>{session.title}</Text>:null}
  {(Object.keys(SKIP_REASONS) as SkipReason[]).map(reason=><Button key={reason} title={SKIP_REASONS[reason]} variant="soft" disabled={busy} onPress={()=>void skip(reason)}/>)}
  {error?<Banner tone="error" text={error}/>:null}
 </Sheet>;
}
