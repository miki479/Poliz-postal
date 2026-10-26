import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { FollowButton } from '@/components/FollowButton';
import { Async, Avatar, Banner, Button, Row, Segmented, Sheet, Skeleton, t, useLoad } from '@/components/ui';
import { S } from '@/constants/theme';
import { call } from '@/lib/api';
import { humanError } from '@/lib/errors';
import type { UserPublic } from '@shared/types.ts';
export function Connections({ followers,following }: { followers:number;following:number }) {
 const [open,setOpen]=useState(false);const [kind,setKind]=useState<'followers'|'following'>('followers');
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const state=useLoad(()=>open?call<UserPublic[]>(kind==='followers'?'listFollowers':'listFollowing'):Promise.resolve([]),[open,kind]);
 const remove=async(id:string)=>{if(busy)return;setBusy(true);setError('');try{await call('removeFollower',id);await state.reload();}catch(e){setError(humanError(e,'Non riesco a rimuovere il follower. Riprova.'));}finally{setBusy(false);}};
 return <><Pressable accessibilityRole="button" accessibilityLabel="Apri follower e persone seguite" onPress={()=>setOpen(true)} style={{minHeight:44,justifyContent:'center'}}><Text style={t.muted}>{followers} follower · {following} persone seguite</Text></Pressable><Sheet visible={open} onClose={()=>setOpen(false)} title="Compagni e follower"><Segmented value={kind} onChange={setKind} options={[{value:'followers',label:'Follower'},{value:'following',label:'Seguiti'}]}/><Text style={t.small}>Si segue subito, senza richieste da approvare. Puoi rimuovere un follower quando vuoi.</Text><Async state={state} skeleton={<Skeleton height={64}/>}>
 {(list)=>list.length?<View style={{gap:S.lg}}>{list.map((u)=><Row key={u.id}><Avatar name={u.displayName} hue={u.hue} uri={u.avatar} size={36}/><Text style={[t.body,{flex:1}]}>{u.displayName}</Text>{kind==='followers'?<Button small title="Rimuovi follower" disabled={busy} onPress={()=>void remove(u.id)}/>:<FollowButton userId={u.id} initial compact onChange={()=>void state.reload()}/>}</Row>)}</View>:<Text style={t.muted}>{kind==='followers'?'Nessun follower.':'Non segui ancora nessuno.'}</Text>}
 </Async>{error?<Banner tone="error" text={error}/>:null}</Sheet></>;
}
