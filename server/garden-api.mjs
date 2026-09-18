import {newGarden,growGarden,gardenAction} from '../public/garden-rules.mjs';
const fail=(message,status)=>{throw Object.assign(new Error(message),{status});};
export async function sharedGarden(db,pair,actor,body,method,now){
 if(!pair)fail('Connect with your person in Love Notes to start your shared garden.',403);
 const pairId=pair.pair_id;
 const activeSQL='EXISTS(SELECT 1 FROM ln_pair p JOIN ln_member m ON m.pair_id=p.id WHERE p.id=? AND p.active=1 AND m.user_id=?)';
 await db.prepare(`INSERT OR IGNORE INTO ln_garden(pair_id,state,updated_at) SELECT ?,?,? WHERE ${activeSQL}`).bind(pairId,JSON.stringify(newGarden(now)),now,pairId,actor.id).run();
 const read=()=>db.prepare(`SELECT g.* FROM ln_garden g WHERE g.pair_id=? AND ${activeSQL}`).bind(pairId,pairId,actor.id).first();
 if(method==='POST'&&(!body||typeof body.requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId)))fail('Please retry this action.',400);
 for(let attempt=0;attempt<6;attempt++){
  const row=await read();if(!row)fail('Your connection changed. Open Love Notes to reconnect.',403);
  const saved=JSON.parse(row.state);
  if(method==='GET')return {state:growGarden(saved,now),revision:row.revision,now,user:actor,partner:pair.partner_name};
  const result=gardenAction(saved,body,actor,now);
  const written=await db.prepare(`UPDATE ln_garden SET state=?,revision=revision+1,updated_at=? WHERE pair_id=? AND revision=? AND ${activeSQL}`).bind(JSON.stringify(result.state),now,pairId,row.revision,pairId,actor.id).run();
  if(written.meta.changes)return {state:growGarden(result.state,now),revision:row.revision+1,now,user:actor,partner:pair.partner_name,message:result.message};
 }
 fail('Your person is tending the garden too. Please try once more.',409);
}
