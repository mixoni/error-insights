/* Run:  npx tsx scripts/seed.ts --n 10000 --batch 500 --concurrency 4 --api http://localhost:3000/ingest */

type SeedOpts = {
    noOfEvents: number;    
    batchPerRequest: number;  
    concurrencyRequestsMax: number;   
    api: string;  
    daysBack: number; 
  };
  
  const args = new Map<string,string>();
  process.argv.slice(2).forEach((a) => {
    const [k,v] = a.replace(/^--/,'').split('=');
    if (k) args.set(k, v ?? 'true');
  });
  
  const opts: SeedOpts = {
    noOfEvents: Number(args.get('n') ?? 5000),
    batchPerRequest: Number(args.get('batch') ?? 500),
    concurrencyRequestsMax: Number(args.get('concurrency') ?? 4),
    api: String(args.get('api') ?? 'http://localhost:3000/ingest'),
    daysBack: Number(args.get('daysBack') ?? 7),
  };
  
  const browsers = ['Chrome','Firefox','Safari','Edge','Opera','Chromium'];
  const urls = ['/','/login','/dashboard','/settings','/reports','/api/data','/products','/cart'];
  const messages = [
    'Uncaught TypeError: undefined is not a function',
    'ReferenceError: foo is not defined',
    'NetworkError: Failed to fetch',
    'UnhandledPromiseRejectionWarning: Error',
    'TypeError: Cannot read properties of null',
    'RangeError: Maximum call stack size exceeded',
    'SyntaxError: Unexpected token < in JSON',
  ];
  
  function rand<T>(arr: T[]) { return arr[Math.floor(Math.random()*arr.length)]; }
  function randInt(min: number, max: number) { return Math.floor(Math.random()*(max-min+1))+min; }
  function randomUser() { return `user-${randInt(1, 500)}`; }
  
  function randomTimestamp(daysBack: number) {
    const now = Date.now();
    const span = daysBack*24*60*60*1000;
    const t = now - Math.floor(Math.random()*span);
    return new Date(t).toISOString();
  }
  
  function randomStack() {
    const files = ['main.ts','app.component.ts','auth.service.ts','charts.ts','store.ts','http.ts'];
    const lines = Array.from({length: randInt(2,6)}).map((_ ,i) =>
      `    at ${i%2?'Object.<anonymous>':'fn'} (${rand(files)}:${randInt(1,400)}:${randInt(1,200)})`
    );
    return lines.join('\n');
  }
  
  type Event = {
    timestamp: string;
    userId: string;
    browser: string;
    url: string;
    errorMessage: string;
    stackTrace: string;
  };
  
  function generate(n: number, daysBack: number): Event[] {
    return Array.from({length: n}).map(() => ({
      timestamp: randomTimestamp(daysBack),
      userId: randomUser(),
      browser: rand(browsers) || 'unknown',
      url: rand(urls) || '/',
      errorMessage: rand(messages) || 'No error message',
      stackTrace: randomStack(),
    }));
  }
  
  function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i=0; i<arr.length; i+=size) out.push(arr.slice(i,i+size));
    return out;
  }
  
  async function postJson(url: string, body: unknown) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const text = await res.text().catch(()=>'');
      throw new Error(`POST ${url} ${res.status} ${res.statusText} :: ${text}`);
    }
    return res.json().catch(()=>({}));
  }
  
  async function main() {
    console.log(`Seeding ${opts.noOfEvents} events → ${opts.api} (batch=${opts.batchPerRequest}, conc=${opts.concurrencyRequestsMax})`);
    const all = generate(opts.noOfEvents, opts.daysBack);
    const batches = chunk(all, opts.batchPerRequest);
  
    let inFlight = 0, ok=0, fail=0;
    let idx = 0;
  
    return new Promise<void>((resolve) => {
      const launchNext = () => {
        while (inFlight < opts.concurrencyRequestsMax && idx < batches.length) {
          const payload = batches[idx++];
          inFlight++;
          postJson(opts.api, payload)
            .then(() => { ok++; })
            .catch((e) => { fail++; console.error('Batch failed:', e.message); })
            .finally(() => {
              inFlight--;
              process.stdout.write(`\rSent: ${ok+fail}/${batches.length} (ok=${ok}, fail=${fail})   `);
              if (ok+fail === batches.length) { console.log('\nDone.'); resolve(); }
              else launchNext();
            });
        }
      };
      launchNext();
    });
  }
  
  main().catch((e) => { console.error(e); process.exit(1); });
  