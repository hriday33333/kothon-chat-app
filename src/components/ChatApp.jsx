'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const THEMES = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#475569'];
const WALLS = {
  plain: { backgroundColor: '#f4f6f5' },
  dots: { backgroundColor: '#f4f6f5', backgroundImage: 'radial-gradient(#cbd5d3 1px, transparent 1px)', backgroundSize: '18px 18px' },
  warm: { backgroundColor: '#fbf1e3' },
  night: { backgroundColor: '#1e293b' },
};
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
const initial = (n) => (n || '?').trim().charAt(0).toUpperCase();
const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function markSeen(meId, otherId) {
  return supabase
    .from('messages')
    .update({ seen_at: new Date().toISOString() })
    .eq('receiver_id', meId)
    .eq('sender_id', otherId)
    .is('seen_at', null);
}

function Avatar({ name, online, size = 'h-11 w-11' }) {
  return (
    <div className="relative shrink-0">
      <div className={`${size} rounded-full bg-brand-soft text-brand-dark grid place-items-center font-semibold`}>
        {initial(name)}
      </div>
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
            online ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
        />
      )}
    </div>
  );
}

export default function ChatApp() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [people, setPeople] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState({});
  const [online, setOnline] = useState(new Set());
  const [typingFrom, setTypingFrom] = useState({});
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [cfg, setCfg] = useState({ nickname: '', theme: '#0f766e', wallpaper: 'plain' });
  const [panel, setPanel] = useState(false);
  const [notifPerm, setNotifPerm] = useState('unsupported');

  const activeRef = useRef(null);
  const peopleRef = useRef([]);
  const channelRef = useRef(null);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const lastTypingSent = useRef(0);
  const typingTimers = useRef({});

  peopleRef.current = people;

  // ---------- Initial load ----------
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace('/login');
        return;
      }
      const user = data.session.user;
      const { data: st } = await supabase.from('settings').select('*').eq('user_id', user.id).maybeSingle();
      if (st && alive) setCfg({ nickname: st.nickname || '', theme: st.theme || '#0f766e', wallpaper: st.wallpaper || 'plain' });
      const [{ data: profs }, { data: myProf }, { data: unseen }] = await Promise.all([
        supabase.from('profiles').select('id,name').neq('id', user.id).order('name'),
        supabase.from('profiles').select('id,name').eq('id', user.id).maybeSingle(),
        supabase.from('messages').select('sender_id').eq('receiver_id', user.id).is('seen_at', null),
      ]);
      if (!alive) return;
      const counts = {};
      (unseen || []).forEach((m) => (counts[m.sender_id] = (counts[m.sender_id] || 0) + 1));
      setMe({ id: user.id, name: myProf?.name || user.email });
      setPeople(profs || []);
      setUnread(counts);
      // Desktop-e jodi ekjon-i person thake, auto open
      if (profs?.length === 1 && window.matchMedia('(min-width: 768px)').matches) {
        setActiveId(profs[0].id);
      }
    })();
    if (typeof Notification !== 'undefined') setNotifPerm(Notification.permission);
    return () => {
      alive = false;
    };
  }, [router]);

  // ---------- Realtime: new / updated / deleted messages ----------
  useEffect(() => {
    if (!me) return;
    const ch = supabase
      .channel('db-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ({ new: m }) => {
        const other = m.sender_id === me.id ? m.receiver_id : m.sender_id;
        const incoming = m.receiver_id === me.id;
        const viewing = other === activeRef.current && !document.hidden;

        if (other === activeRef.current) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (incoming && viewing) markSeen(me.id, other);
        }
        if (incoming) {
          setTypingFrom((t) => ({ ...t, [m.sender_id]: false }));
          if (!viewing) {
            setUnread((u) => ({ ...u, [m.sender_id]: (u[m.sender_id] || 0) + 1 }));
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              const sender = peopleRef.current.find((p) => p.id === m.sender_id);
              new Notification(sender?.name || 'New message', {
                body: m.content || 'Sent a photo',
                icon: '/icons/icon-192.png',
              });
            }
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, ({ new: m }) => {
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, ({ old }) => {
        setMessages((prev) => prev.filter((x) => x.id !== old.id));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [me]);

  // ---------- Presence (online) + typing ----------
  useEffect(() => {
    if (!me) return;
    const ch = supabase.channel('room', { config: { presence: { key: me.id } } });
    ch.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(ch.presenceState()))))
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.to !== me.id) return;
        setTypingFrom((t) => ({ ...t, [payload.from]: true }));
        clearTimeout(typingTimers.current[payload.from]);
        typingTimers.current[payload.from] = setTimeout(
          () => setTypingFrom((t) => ({ ...t, [payload.from]: false })),
          2500
        );
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await ch.track({ at: Date.now() });
      });
    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [me]);

  // ---------- Load conversation when a person is opened ----------
  useEffect(() => {
    activeRef.current = activeId;
    setSelectedId(null);
    if (!me || !activeId) {
      setMessages([]);
      return;
    }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(
          `and(sender_id.eq.${me.id},receiver_id.eq.${activeId}),and(sender_id.eq.${activeId},receiver_id.eq.${me.id})`
        )
        .order('created_at', { ascending: true })
        .limit(500);
      if (!alive) return;
      setMessages(data || []);
      setUnread((u) => ({ ...u, [activeId]: 0 }));
      markSeen(me.id, activeId);
    })();
    return () => {
      alive = false;
    };
  }, [me, activeId]);

  // Tab-e fire ele seen mark kora
  useEffect(() => {
    if (!me) return;
    const onVisible = () => {
      if (!document.hidden && activeRef.current) {
        markSeen(me.id, activeRef.current);
        setUnread((u) => ({ ...u, [activeRef.current]: 0 }));
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [me]);

  // Phone-er back button
  useEffect(() => {
    const onPop = () => setActiveId(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const active = people.find((p) => p.id === activeId);
  const isTyping = activeId && typingFrom[activeId];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, isTyping, activeId]);

  // ---------- Actions ----------
  function openChat(id) {
    window.history.pushState({ chat: id }, '');
    setActiveId(id);
  }

  async function insertMessage(fields) {
    const { data, error } = await supabase
      .from('messages')
      .insert({ sender_id: me.id, receiver_id: activeId, ...fields })
      .select()
      .single();
    if (error) throw error;
    setMessages((prev) => (prev.some((x) => x.id === data.id) ? prev : [...prev, data]));
  }

  async function send(e) {
    e?.preventDefault();
    const content = text.trim();
    if (!content || !activeId) return;
    setText('');
    try {
      await insertMessage({ content });
    } catch (err) {
      setText(content);
      alert('Message pathano jayni: ' + err.message);
    }
  }

  function onType(e) {
    setText(e.target.value);
    const now = Date.now();
    if (now - lastTypingSent.current > 1500 && channelRef.current && activeId) {
      lastTypingSent.current = now;
      channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { from: me.id, to: activeId } });
    }
  }

  function onKeyDown(e) {
    const desktop = window.matchMedia('(pointer: fine)').matches;
    if (e.key === 'Enter' && !e.shiftKey && desktop) send(e);
  }

  async function onPickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeId) return;
    if (!file.type.startsWith('image/')) return alert('Shudhu chobi pathano jabe.');
    if (file.size > 8 * 1024 * 1024) return alert('Chobi 8MB-er cheye choto hote hobe.');
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${me.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('chat-images')
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('chat-images').getPublicUrl(path);
      await insertMessage({ image_url: pub.publicUrl });
    } catch (err) {
      alert('Chobi pathano jayni: ' + err.message);
    }
    setUploading(false);
  }

  async function deleteMessage(id) {
    setSelectedId(null);
    setMessages((prev) => prev.filter((m) => m.id !== id));
    await supabase.from('messages').delete().eq('id', id);
  }

  async function askNotifications() {
    const p = await Notification.requestPermission();
    setNotifPerm(p);
  }

  async function saveCfg() {
    setPanel(false);
    const { error } = await supabase
      .from('settings')
      .upsert({ user_id: me.id, nickname: cfg.nickname.trim(), theme: cfg.theme, wallpaper: cfg.wallpaper });
    if (error) alert('Save hoyni: ' + error.message);
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  // ---------- Derived ----------
  const lastMineId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].sender_id === me?.id) return messages[i].id;
    return null;
  }, [messages, me]);

  if (!me) return <div className="h-[100dvh] grid place-items-center text-brand">Loading…</div>;

  // ---------- UI ----------
  return (
    <div className="h-[100dvh] flex overflow-hidden bg-paper" style={{ '--brand-rgb': hexRgb(cfg.theme) }}>
      {/* Chat list */}
      <aside
        className={`${activeId ? 'hidden md:flex' : 'flex'} w-full md:w-80 lg:w-96 shrink-0 flex-col bg-white md:border-r border-slate-200`}
      >
        <header className="safe-top bg-brand text-white">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="h-10 w-10 rounded-full bg-white/20 grid place-items-center font-semibold">
              {initial(me.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold leading-tight truncate">{me.name}</div>
              <div className="text-xs text-white/70">Kothon</div>
            </div>
            {notifPerm === 'default' && (
              <button onClick={askNotifications} className="rounded-lg bg-white/15 px-3 py-1.5 text-xs active:bg-white/25">
                Notification
              </button>
            )}
            <button onClick={() => setPanel(true)} className="rounded-lg bg-white/15 px-3 py-1.5 text-xs active:bg-white/25">
              Customize
            </button>
            <button onClick={logout} className="rounded-lg bg-white/15 px-3 py-1.5 text-xs active:bg-white/25">
              Logout
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto scroll-soft">
          {people.length === 0 && (
            <div className="p-6 text-center text-slate-500">
              Ekhono keu nei. Onno jon-ke ei app-e account banate bolun, tahole ekhane dekha jabe.
            </div>
          )}
          {people.map((p) => (
            <button
              key={p.id}
              onClick={() => openChat(p.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-100 ${
                p.id === activeId ? 'bg-brand-soft' : 'hover:bg-slate-50'
              }`}
            >
              <Avatar name={cfg.nickname || p.name} online={online.has(p.id)} />
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{cfg.nickname || p.name}</div>
                <div className="text-sm text-slate-500 truncate">
                  {typingFrom[p.id] ? 'typing…' : online.has(p.id) ? 'Online' : 'Offline'}
                </div>
              </div>
              {unread[p.id] > 0 && (
                <span className="min-w-6 h-6 px-1.5 rounded-full bg-brand text-white text-xs grid place-items-center">
                  {unread[p.id]}
                </span>
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* Conversation */}
      <section className={`${activeId ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex-col`}>
        {!active ? (
          <div className="flex-1 grid place-items-center text-center px-6">
            <div>
              <div className="mx-auto h-16 w-16 rounded-2xl bg-brand-soft text-brand-dark grid place-items-center text-3xl font-semibold">
                ক
              </div>
              <p className="mt-4 text-slate-500">Bam theke kono chat select korun.</p>
            </div>
          </div>
        ) : (
          <>
            <header className="safe-top bg-white border-b border-slate-200">
              <div className="flex items-center gap-2 px-2 md:px-4 py-2.5">
                <button
                  onClick={() => window.history.back()}
                  className="md:hidden h-10 w-10 grid place-items-center rounded-full text-brand active:bg-slate-100"
                  aria-label="Back"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <Avatar name={active.name} online={online.has(active.id)} size="h-10 w-10" />
                <div className="min-w-0">
                  <div className="font-semibold leading-tight truncate">{cfg.nickname || active.name}</div>
                  <div className="text-xs text-slate-500">
                    {isTyping ? 'typing…' : online.has(active.id) ? 'Active now' : 'Offline'}
                  </div>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto scroll-soft px-3 md:px-6 py-4" style={WALLS[cfg.wallpaper] || WALLS.plain} onClick={() => setSelectedId(null)}>
              {messages.length === 0 && (
                <p className="text-center text-sm text-slate-400 mt-10">
                  Ekhono kono message nei. Prothom message-ta pathan.
                </p>
              )}
              {messages.map((m, i) => {
                const mine = m.sender_id === me.id;
                const showDay = i === 0 || dayLabel(messages[i - 1].created_at) !== dayLabel(m.created_at);
                return (
                  <div key={m.id}>
                    {showDay && (
                      <div className="my-3 text-center text-xs text-slate-400">{dayLabel(m.created_at)}</div>
                    )}
                    <div className={`flex ${mine ? 'justify-end' : 'justify-start'} mb-1.5`}>
                      <div className={`max-w-[80%] md:max-w-[65%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                        <div
                          onClick={(e) => {
                            if (!mine) return;
                            e.stopPropagation();
                            setSelectedId(selectedId === m.id ? null : m.id);
                          }}
                          className={`overflow-hidden break-words whitespace-pre-wrap ${
                            m.image_url ? 'p-1' : 'px-3.5 py-2'
                          } ${
                            mine
                              ? 'bg-brand text-white rounded-2xl rounded-br-md'
                              : 'bg-white border border-slate-200 rounded-2xl rounded-bl-md'
                          }`}
                        >
                          {m.image_url && (
                            <img
                              src={m.image_url}
                              alt="Photo"
                              loading="lazy"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightbox(m.image_url);
                              }}
                              className="max-h-72 w-auto rounded-xl cursor-zoom-in"
                            />
                          )}
                          {m.content}
                        </div>
                        <div className="mt-0.5 px-1 text-[11px] text-slate-400">
                          {fmtTime(m.created_at)}
                          {mine && m.id === lastMineId && <span> · {m.seen_at ? 'Seen' : 'Sent'}</span>}
                        </div>
                        {selectedId === m.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMessage(m.id);
                            }}
                            className="mt-1 rounded-lg bg-red-50 px-3 py-1 text-xs text-red-600 active:bg-red-100"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {isTyping && (
                <div className="flex justify-start mb-1.5">
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                    <span className="dot h-2 w-2 rounded-full bg-slate-400" />
                    <span className="dot h-2 w-2 rounded-full bg-slate-400" />
                    <span className="dot h-2 w-2 rounded-full bg-slate-400" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={send} className="safe-bottom bg-white border-t border-slate-200 px-2 pt-2 flex items-end gap-1.5">
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="h-11 w-11 shrink-0 grid place-items-center rounded-full text-brand active:bg-slate-100 disabled:opacity-40"
                aria-label="Send photo"
              >
                {uploading ? (
                  <span className="text-xs">…</span>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="16" rx="3" />
                    <circle cx="9" cy="10" r="1.6" />
                    <path d="M21 16l-5-5-8 8" />
                  </svg>
                )}
              </button>
              <textarea
                value={text}
                onChange={onType}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Message likhun…"
                className="flex-1 resize-none max-h-32 rounded-2xl bg-slate-100 px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand/30"
                style={{ fieldSizing: 'content' }}
              />
              <button
                type="submit"
                disabled={!text.trim()}
                className="h-11 w-11 shrink-0 grid place-items-center rounded-full bg-brand text-white active:bg-brand-dark disabled:opacity-30"
                aria-label="Send"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.4 20.4l17.4-8a.5.5 0 000-.9L3.4 3.6a.5.5 0 00-.7.6L5 11l9 1-9 1-2.3 6.8a.5.5 0 00.7.6z" />
                </svg>
              </button>
            </form>
          </>
        )}
      </section>

      {panel && (
        <div className="fixed inset-0 z-50 bg-black/50 grid items-end md:place-items-center" onClick={() => setPanel(false)}>
          <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl p-5 safe-bottom" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold">Apnar moto kore sajan</h2>
            <p className="text-sm text-slate-500">Eta shudhu apnar screen-e dekha jabe.</p>
            <label className="block mt-4 text-sm font-medium">Nickname</label>
            <input
              value={cfg.nickname}
              onChange={(e) => setCfg({ ...cfg, nickname: e.target.value })}
              placeholder={people[0]?.name}
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-brand"
            />
            <div className="mt-4 text-sm font-medium">Color</div>
            <div className="mt-2 flex flex-wrap gap-3">
              {THEMES.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setCfg({ ...cfg, theme: c })}
                  style={{ background: c }}
                  className={`h-9 w-9 rounded-full ${cfg.theme === c ? 'ring-2 ring-offset-2 ring-slate-700' : ''}`}
                />
              ))}
            </div>
            <div className="mt-4 text-sm font-medium">Wallpaper</div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {Object.keys(WALLS).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCfg({ ...cfg, wallpaper: k })}
                  style={WALLS[k]}
                  className={`h-16 rounded-xl border text-xs ${k === 'night' ? 'text-white' : ''} ${
                    cfg.wallpaper === k ? 'ring-2 ring-brand border-brand' : 'border-slate-200'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <button onClick={saveCfg} className="mt-5 w-full rounded-xl bg-brand py-3 font-medium text-white">
              Save
            </button>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/85 grid place-items-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="Photo" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
