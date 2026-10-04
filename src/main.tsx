import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, Check, Copy, Crown, Hash, LogOut, Plus, RotateCcw, Users, Zap } from 'lucide-react';
import { db, type Room, type Player } from './client';
import './style.css';

function App() {
  const [nickname, setNickname] = useState(() => localStorage.getItem('buzz-nickname') || '');
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() || '');
  const [mode, setMode] = useState<'create' | 'join'>(() => new URLSearchParams(location.search).has('room') ? 'join' : 'create');
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const lock = useRef(false);
  const activeRoom = useRef<string | null>(null);
  const mergeRoom = useCallback((next: Room) => {
    if (activeRoom.current !== next.id) return;
    setRoom(prev => !prev || next.revision >= prev.revision ? next : prev);
  }, []);

  useEffect(() => {
    if (!room || !db) return;
    const id = room.id;
    const refresh = async () => {
      const [r, p] = await Promise.all([
        db!.from('rooms').select('*').eq('id', id).single(),
        db!.from('players').select('user_id,nickname,joined_at').eq('room_id', id).order('joined_at'),
      ]);
      if (activeRoom.current !== id) return;
      if (r.data) mergeRoom(r.data);
      if (p.data) setPlayers(p.data);
    };
    const channel = db.channel(`room:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${id}` }, payload => mergeRoom(payload.new as Room))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${id}` }, () => void refresh())
      .subscribe(status => {
        setConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') void refresh();
      });
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); void db!.removeChannel(channel); };
  }, [room?.id, mergeRoom]);

  const enter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lock.current) return;
    if (!db) { setError('Connecte Supabase pour ouvrir les rooms. Les étapes sont dans le fichier README du projet.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const session = await db.auth.getSession();
      if (session.error) throw session.error;
      let user = session.data.session?.user;
      if (!user) {
        const auth = await db.auth.signInAnonymously();
        if (auth.error) throw auth.error;
        user = auth.data.user!;
      }
      const result = await db.rpc(mode === 'create' ? 'create_room' : 'join_room', mode === 'create' ? { p_nickname: nickname.trim() } : { p_code: code.trim().toUpperCase(), p_nickname: nickname.trim() });
      if (result.error) throw result.error;
      setUserId(user.id); activeRoom.current = result.data.id; setRoom(result.data);
      localStorage.setItem('buzz-nickname', nickname.trim());
      history.replaceState(null, '', `?room=${result.data.code}`);
    } catch (err) { setError(message(err)); }
    finally { lock.current = false; setBusy(false); }
  };

  const buzz = useCallback(async () => {
    if (!db || !room || room.winner_id || lock.current || !connected) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const { data, error } = await db.rpc('buzz', { p_room: room.id, p_round: room.round });
      if (error) throw error;
      mergeRoom(data);
    } catch (err) { setError(message(err)); }
    finally { lock.current = false; setBusy(false); }
  }, [room, connected, mergeRoom]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
      if (room) { e.preventDefault(); void buzz(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [buzz, room]);

  const reset = async () => {
    if (!db || !room || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const { data, error } = await db.rpc('reset_round', { p_room: room.id, p_round: room.round });
      if (error) throw error;
      mergeRoom(data);
    } catch (err) { setError(message(err)); }
    finally { lock.current = false; setBusy(false); }
  };
  const leave = () => {
    activeRoom.current = null; setRoom(null); setPlayers([]); setConnected(false); setError(''); history.replaceState(null, '', '/');
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/?room=${room!.code}`); setCopied(true); window.setTimeout(() => setCopied(false), 2000); }
    catch { setError(`Partage le code ${room!.code} avec tes amis.`); }
  };
  return <div className="app-shell">
    <header><a className="brand" href="/" aria-label="BUZZ, accueil"><span className="brand-icon"><Zap fill="currentColor" size={22}/></span>BUZZ<span className="brand-dot">.</span></a><span className="header-note">LE PLUS RAPIDE A LA PAROLE</span>{room ? <button className="quiet" onClick={leave} disabled={busy}><LogOut size={16}/> Quitter</button> : <span className="live-label"><i/> Prêt à jouer ?</span>}</header>
    <main>
      {!room ? <>
        <div className="intro"><span className="eyebrow">UN PSEUDO. UNE ROOM. UN RÉFLEXE.</span><h1>La réponse ?<br/><span>À toi de buzzer.</span></h1><p>Réunis tes amis, lance ta question.<br/>Le premier qui buzze prend la main.</p></div>
        <div className="lobby-layout">
          <section className="entry-card"><div className="tabs"><button className={mode === 'create' ? 'selected' : ''} onClick={() => { setMode('create'); setError(''); }}><Plus size={18}/>Créer une room</button><button className={mode === 'join' ? 'selected' : ''} onClick={() => { setMode('join'); setError(''); }}><Hash size={18}/>Rejoindre</button></div>
            <form onSubmit={enter}><h2>{mode === 'create' ? 'La partie commence ici.' : 'On t’attend dans la room.'}</h2><p className="muted">{mode === 'create' ? 'Choisis ton pseudo, puis invite ta bande.' : 'Entre ton pseudo et le code partagé par tes amis.'}</p><label htmlFor="nickname">Ton pseudo <span>20 caractères max.</span></label><input id="nickname" placeholder="Ex. SuperQuiz" autoComplete="nickname" required minLength={1} maxLength={20} value={nickname} onChange={e => setNickname(e.target.value)} pattern=".*\S.*"/>
              {mode === 'join' && <><label htmlFor="code">Code de la room</label><input id="code" className="code-input" placeholder="ABC123" required minLength={6} maxLength={6} pattern="[A-Za-z0-9]{6}" autoComplete="off" value={code} onChange={e => setCode(e.target.value.toUpperCase())}/></>}
              <button className="primary" disabled={busy}>{busy ? 'Connexion…' : mode === 'create' ? 'Créer ma room' : 'Rejoindre la room'}<ArrowRight size={19}/></button><p className="form-note"><Users size={14}/> Pas de compte. Juste ton pseudo.</p>
            </form>
          </section>
          <section className="buzzer-preview" aria-label="Buzzer au clic ou à la touche espace"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><span className="preview-label"><span/> TES RÉFLEXES ENTRENT EN JEU</span><div className="buzzer-base"><div className="buzzer-face"><Zap size={66} strokeWidth={1.6} fill="currentColor"/></div></div><div className="shortcut"><span>Un clic</span><span className="muted">ou</span><kbd>espace</kbd></div><p>Une seule première place.</p></section>
        </div>
        <div className="steps"><div><span>01</span><p>Crée ta room<small>Ton terrain de jeu, en un clic.</small></p></div><div><span>02</span><p>Invite tes amis<small>Un code à partager, et c’est parti.</small></p></div><div><span>03</span><p>Sois le plus rapide<small>Clique ou appuie sur espace.</small></p></div></div>
      </> : <>
        <div className="room-heading"><div><span className="eyebrow">LA ROOM EST OUVERTE</span><h1>À vos buzzers<span className="brand-dot">.</span></h1></div><button className="room-code" onClick={copy} aria-label="Copier le lien de la room"><span>CODE ROOM<strong>{room.code}</strong></span>{copied ? <Check size={21}/> : <Copy size={21}/>}</button></div>
        <div className="game-layout"><section className={`game-card ${room.winner_id ? 'won' : ''}`}><div className="game-meta"><span>MANCHE {String(room.round).padStart(2, '0')}</span><span className={connected ? 'connection online' : 'connection'}><i/>{connected ? 'En direct' : 'Reconnexion…'}</span></div><div className="result" aria-live="polite">{room.winner_id ? <><span className="eyebrow">PREMIER À BUZZER</span><h2>{room.winner_name}{room.winner_id === userId && <small>C’est toi !</small>}</h2></> : <><span className="eyebrow">TOUS LES RÉFLEXES COMPTENT</span><h2>{busy ? 'Buzz envoyé…' : 'Prêt à prendre la main ?'}</h2></>}</div><button className="buzzer-base playable" aria-label="Buzzer" disabled={!!room.winner_id || busy || !connected} onClick={buzz}><span className="buzzer-face"><Zap size={70} fill="currentColor" strokeWidth={1.5}/><span>BUZZ</span></span></button><div className="shortcut"><span>Clique ou appuie sur</span><kbd>espace</kbd></div><div className="round-action">{room.host_id === userId ? <button className="reset" onClick={reset} disabled={busy || !room.winner_id || !connected}><RotateCcw size={17}/>Manche suivante</button> : <p className="muted">{room.winner_id ? 'L’hôte va lancer la prochaine manche.' : 'Le premier buzz reçu remporte la manche.'}</p>}</div></section>
          <aside className="players-card"><div className="players-title"><h2><Users size={19}/>Dans la room</h2><span>{players.length}</span></div><p className="muted">La bande est au complet ? À vous de jouer.</p><ul>{players.map((p, i) => <li key={p.user_id}><span className={`avatar color-${i % 4}`}>{p.nickname.slice(0, 2).toUpperCase()}</span><div><strong>{p.nickname}</strong><small>{p.user_id === userId ? 'Toi' : 'Joueur'}{p.user_id === room.host_id ? ' · Hôte' : ''}</small></div>{p.user_id === room.winner_id ? <Zap className="winner-icon" size={20} fill="currentColor"/> : p.user_id === room.host_id ? <Crown className="muted" size={18}/> : null}</li>)}</ul><button className="invite" onClick={copy}>{copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? 'Lien copié !' : 'Inviter des amis'}</button><p className="players-note">Les pseudos restent dans la room après déconnexion.</p></aside>
        </div>
      </>}
      {error && <div className="error" role="alert">{error}<button aria-label="Fermer le message" onClick={() => setError('')}>×</button></div>}
    </main><footer><span>BUZZ. <span className="muted">Moins d’hésitation. Plus de réflexes.</span></span><span>Que le plus rapide gagne <Zap size={13}/></span></footer>
  </div>;
}
function message(err: unknown) {
  const text = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Connexion impossible. Réessaie dans un instant.';
  if (/anonymous sign-ins are disabled/i.test(text)) return 'Active les connexions anonymes dans Supabase → Authentication pour jouer.';
  if (/fetch|network/i.test(text)) return 'Connexion interrompue. Vérifie ta connexion et réessaie.';
  return text;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
