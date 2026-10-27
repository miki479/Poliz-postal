import { Text } from 'react-native';
import { Async, Button, Sheet, t, useLoad } from './ui';
import { call } from '@/lib/api';
import type { SessionMatch } from '@shared/adaptive.ts';
type Candidate={activityId:string;title:string;matches:SessionMatch[]};
function Choices({sessionId,onSaved}:{sessionId:string;onSaved():void}){
 const state=useLoad(()=>call<Candidate[]>('pendingActivityLinks'));
 return <Async state={state}>{list=><>{list.filter(item=>item.matches.some(match=>match.session.id===sessionId)).map(item=><Button key={item.activityId} variant="soft" title={item.title} onPress={()=>{void call('linkActivityToSession',item.activityId,sessionId).then(onSaved,()=>{void state.reload();});}}/>)}{!list.some(item=>item.matches.some(match=>match.session.id===sessionId))?<Text style={t.muted}>Nessuna attività recente compatibile.</Text>:null}</>}</Async>;
}
export function LinkWorkoutSheet({sessionId,onClose,onSaved}:{sessionId:string|null;onClose():void;onSaved():void}){
 return <Sheet visible={!!sessionId} onClose={onClose} title="Collega un’attività">{sessionId?<Choices key={sessionId} sessionId={sessionId} onSaved={()=>{onSaved();onClose();}}/>:null}</Sheet>;
}
