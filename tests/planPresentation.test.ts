import {expect,it} from 'vitest';
import {planPresentation} from '../shared/planPresentation.ts';
import type {PlannedSession,TrainingPlan} from '../shared/types.ts';
const plan={id:'p',startDate:'2026-10-19',weeks:10} as TrainingPlan;
const s=(id:string,date:string,durationMin:number,status='planned',planId='p')=>({id,date,durationMin,status,planId}) as PlannedSession;
it('la settimana e la fine del piano corrispondono alle date, anche oltre 35 giorni',()=>{
 const view=planPresentation(plan,[s('last','2026-12-25',40)],'2026-10-26');expect(view.currentWeek).toBe(1);expect(view.end).toBe('2026-12-27');expect(view.weeks).toHaveLength(10);expect(view.weeks[9].plannedMin).toBe(40);
});
it('usa soltanto le sedute del piano scelto e non conta salti e pause come completamenti',()=>{
 const view=planPresentation(plan,[s('a','2026-10-26',30,'completed'),s('b','2026-10-28',40),s('c','2026-10-30',20,'skipped'),s('d','2026-10-31',50,'paused'),s('other','2026-10-26',999,'completed','other')],'2026-10-26');
 expect(view.weeks[1]).toMatchObject({total:2,completed:1,plannedMin:70,completedMin:30});expect(view.plannedMin).toBe(70);
});
it('senza piano non inventa durata o settimane di un programma',()=>{const view=planPresentation(null,[],'2026-10-26');expect(view.plannedMin).toBe(0);expect(view.weeks[0].total).toBe(0);expect(view.currentWeek).toBe(0);});
