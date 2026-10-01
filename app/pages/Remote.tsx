import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { openRoom, type Cmd, type ShowState } from '../lib/channel';

export default function Remote() {
  const [p] = useSearchParams();
  const room = p.get('room') ?? localStorage.getItem('room') ?? '';
  const [st, setSt] = useState<ShowState | null>(null);
  const r = useRef<ReturnType<typeof openRoom>>(undefined);

  useEffect(() => {
    if (!room) return;
    r.current = openRoom(room, { onState: setSt });
    const t = setTimeout(() => r.current?.sendCmd({ type: 'sync' }), 1000);
    return () => { clearTimeout(t); r.current?.close(); };
  }, [room]);

  const send = (type: Cmd['type']) => { navigator.vibrate?.(15); r.current?.sendCmd({ type }); };
  if (!room) return (
    <div className="sji-page">
      <span className="sji-logo">SJI</span>
      <p className="sji-comment">// code de salle manquant : ouvre le lien affiché sur l'écran du show</p>
    </div>
  );

  return (
    <div className="sji-page">
      <span className="sji-logo">SJI</span>
      <h1 className="sji-title"><span className="sji-kw">remote</span><span className="sji-op">.</span><span className="sji-fn">control</span><span className="sji-op">()</span></h1>
      <p className="sji-status">
        {st ? (st.stage === 'finale' ? <b>écran final</b> : <><b>{st.index}</b> / {st.total} binômes</>) : 'connexion…'}
      </p>
      <button className="sji-btn primary sji-remote-next" onClick={() => send('next')}>next() ▶</button>
      <div className="sji-row">
        <button className="sji-btn" onClick={() => send('prev')}>◀ prev()</button>
        <button className="sji-btn" onClick={() => send('finale')}>merci()</button>
      </div>
      <div className="sji-row">
        <button className="sji-btn" onClick={() => send('sound')}>son : {st?.sound ? 'on' : 'off'}</button>
        <button className="sji-btn" onClick={() => confirm('Rejouer depuis le début ?') && send('reset')}>reset()</button>
      </div>
    </div>
  );
}
