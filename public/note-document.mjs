// Shared, versioned note format. Only final visible strokes leave the composer.
export const PAPERS = { pink:'#fbe1e8', yellow:'#fff0b9', cream:'#fff7e8', lavender:'#ede3f7', blue:'#dfedf7', sage:'#e1eddd' };
export const INKS = ['#542b3a','#ad315d','#315d79','#356347','#593f83','#242424'];
export const STICKERS = ['♥','🌷','✦','💋'];
export function emptyDocument() {
  return { version:1, mode:'mix', paper:'pink', pattern:'plain', font:'serif', title:'', text:'', signature:'', occasion:'', strokes:[], stickers:[] };
}
const boundedText = (value, max) => {
  if (typeof value !== 'string' || value.length > max) throw new Error('This note is too long.');
  return value;
};
export function validateDocument(value) {
  if (!value || value.version !== 1) throw new Error('Unsupported note format.');
  const d = emptyDocument();
  for (const [key, options] of Object.entries({mode:['type','draw','mix'],paper:Object.keys(PAPERS),pattern:['plain','lined','dotted'],font:['serif','sans','hand']})) {
    if (!options.includes(value[key])) throw new Error('Choose a valid paper or writing style.');
    d[key] = value[key];
  }
  for (const [key,max] of Object.entries({title:100,text:4000,signature:80,occasion:100})) d[key] = boundedText(value[key] ?? '',max);
  if (!Array.isArray(value.strokes) || value.strokes.length > 200 || !Array.isArray(value.stickers) || value.stickers.length > 20) throw new Error('This drawing is too detailed.');
  let count = 0;
  d.strokes = value.strokes.map(s => {
    if (!INKS.includes(s.color) || ![2,5,10,18].includes(s.width) || !['pen','highlighter'].includes(s.tool) || !Array.isArray(s.points) || !s.points.length || s.points.length>1200) throw new Error('Invalid drawing stroke.');
    count += s.points.length;
    let previous = -1;
    const points = s.points.map(p => {
      if (!Array.isArray(p) || p.length !== 4 || !p.every(Number.isFinite) || p[0]<0 || p[0]>600 || p[1]<0 || p[1]>500 || p[2]<0.1 || p[2]>1 || p[3]<previous || p[3]>300000) throw new Error('Invalid drawing point.');
      previous=p[3]; return p.map((v,i)=>Math.round(v*(i===2?100:10))/(i===2?100:10));
    });
    return {color:s.color,width:s.width,tool:s.tool,points};
  });
  if(count>12000) throw new Error('Drawing limit reached. Try fewer strokes.');
  d.stickers = value.stickers.map(s=> {
    if(!STICKERS.includes(s.face) || !Number.isFinite(s.x) || !Number.isFinite(s.y) || s.x<20 || s.x>580 || s.y<25 || s.y>475) throw new Error('Invalid sticker.');
    return {face:s.face,x:s.x,y:s.y};
  });
  if (d.mode === 'type') { d.strokes=[]; d.stickers=[]; }
  if (d.mode === 'draw') d.text='';
  return d;
}
export const hasContent = d => !!(d.text.trim() || d.strokes.length || d.stickers.length);
export function paintDrawing(ctx, d, fraction=1) {
  ctx.clearRect(0,0,600,500);
  const total=d.strokes.reduce((n,s)=>n+s.points.length,0);
  let remaining=Math.ceil(total*fraction);
  for(const stroke of d.strokes) {
    const points=stroke.points.slice(0,Math.max(0,remaining)); remaining-=stroke.points.length;
    if(!points.length) continue;
    ctx.save(); ctx.strokeStyle=ctx.fillStyle=stroke.color; ctx.globalAlpha=stroke.tool==='highlighter'?.3:1; ctx.lineCap='round';ctx.lineJoin='round';
    // One path per stroke keeps translucent highlighters from darkening at every point.
    if(stroke.tool==='highlighter') { ctx.lineWidth=stroke.width;ctx.beginPath();ctx.moveTo(points[0][0],points[0][1]);for(const p of points)ctx.lineTo(p[0],p[1]);ctx.stroke(); }
    else for(let i=0;i<points.length;i++) {
      const p=points[i],prev=points[Math.max(0,i-1)];ctx.lineWidth=stroke.width*(.5+p[2]);ctx.beginPath();ctx.moveTo(prev[0],prev[1]);ctx.lineTo(p[0]+.01,p[1]);ctx.stroke();
    }
    ctx.restore();
  }
  if(fraction>=1) for(const s of d.stickers) { ctx.font='34px serif';ctx.textAlign='center';ctx.fillStyle='#ad315d';ctx.fillText(s.face,s.x,s.y); }
}
// Replay only meaningful pen-down time. Long pauses never delay opening a note.
export function replayProgress(d, elapsed) {
  const weights=d.strokes.map(s=>Math.max(80,Math.min(1600,s.points.at(-1)[3]-s.points[0][3])));
  const totalTime=weights.reduce((a,b)=>a+b,0), duration=Math.max(900,Math.min(6500,totalTime));
  if(elapsed>=duration)return 1;
  const totalPoints=d.strokes.reduce((n,s)=>n+s.points.length,0);
  if(!totalPoints)return Math.min(1,elapsed/duration);
  let time=elapsed/duration*totalTime,points=0;
  for(let i=0;i<weights.length;i++) {
    const stroke=d.strokes[i];
    if(time>=weights[i]) {time-=weights[i];points+=stroke.points.length;continue;}
    const first=stroke.points[0][3],span=stroke.points.at(-1)[3]-first;
    const cutoff=first+(span||1)*(time/weights[i]);
    points+=span?stroke.points.filter(p=>p[3]<=cutoff).length:stroke.points.length*(time/weights[i]);
    break;
  }
  return Math.min(1,points/totalPoints);
}
