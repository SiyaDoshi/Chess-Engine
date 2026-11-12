import { Chess } from 'chess.js';
const [fen, ms, d] = [process.argv[2], process.argv[3].split(' ').filter(Boolean), +process.argv[4]];
const c = new Chess(fen); for (const u of ms) c.move({from:u.slice(0,2), to:u.slice(2,4), promotion:'q'});
const perft=(c,d)=>{ if(!d) return 1; let n=0; for(const m of c.moves({verbose:true})){c.move(m); n+=perft(c,d-1); c.undo();} return n; };
const out={}; for (const m of c.moves({verbose:true})) { const k=m.from+m.to; c.move(m); out[k]=(out[k]||0)+perft(c,d-1); c.undo(); }
console.log(JSON.stringify(out));
