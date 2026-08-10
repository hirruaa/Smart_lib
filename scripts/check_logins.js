const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envFile = path.resolve(__dirname, '..', '.env.local');
if (!fs.existsSync(envFile)) {
  console.error('.env.local not found')
  process.exit(1)
}
const env = fs.readFileSync(envFile, 'utf8').split(/\r?\n/).reduce((acc, line) => {
  const m = /^([^=]+)=(.*)$/.exec(line);
  if (m) acc[m[1].trim()] = m[2].trim();
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

(async () => {
  const credentials = [
    { email: 'admin@test.com', password: 'admin123' },
    { email: 'student@test.com', password: 'student123' },
  ];

  for (const c of credentials) {
    try {
      const res = await supabase.auth.signInWithPassword({ email: c.email, password: c.password });
      console.log(c.email, '=>', res.error ? `ERROR: ${res.error.message}` : `OK (userId=${res.data?.user?.id ?? 'none'})`);
    } catch (err) {
      console.error(c.email, '=>', err?.message ?? err);
    }
  }
})();
