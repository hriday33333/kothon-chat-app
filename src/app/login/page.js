'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PEOPLE = ['Ruhi', 'Qalbi'];

export default function Login() {
  const router = useRouter();
  const [who, setWho] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/chat');
    });
  }, [router]);

  async function submit(e) {
    e.preventDefault();
    if (!who) return setError('Age bolun apni ke.');
    setError('');
    setBusy(true);
    const email = `${who.toLowerCase()}@kothon.app`;
    const password = `kothon-${pw}`; // Supabase min 6 okkhor chay, tai prefix
    let { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err && pw === '1234') {
      // prothom bar: account auto toiri hobe
      const su = await supabase.auth.signUp({ email, password, options: { data: { name: who } } });
      err = su.error || !su.data.session ? su.error || { message: 'x' } : null;
    }
    setBusy(false);
    if (err) setError('Password vul.');
    else router.replace('/chat');
  }

  return (
    <main className="min-h-[100dvh] grid place-items-center px-5 safe-top">
      <div className="w-full max-w-sm">
        <div className="h-14 w-14 rounded-2xl bg-brand grid place-items-center text-white text-2xl font-semibold">ক</div>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight">Kothon</h1>
        <p className="mt-1 mb-6 text-slate-500">Apni ke?</p>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {PEOPLE.map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setWho(p)}
                className={`rounded-2xl border-2 py-5 text-lg font-medium ${
                  who === p ? 'border-brand bg-brand-soft text-brand-dark' : 'border-slate-200 bg-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            type="password"
            inputMode="numeric"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-brand"
            placeholder="Password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            required
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-brand py-3 font-medium text-white disabled:opacity-60">
            {busy ? 'Wait korun…' : 'Login'}
          </button>
        </form>
      </div>
    </main>
  );
}
