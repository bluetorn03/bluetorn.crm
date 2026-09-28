async function test() {
  const endpoints = [
    'http://localhost:3000/',
    'http://localhost:3000/app',
    'http://localhost:3000/app/finance',
    'http://localhost:3000/app/finance/invoices',
    'http://localhost:3000/app/finance/payments',
    'http://localhost:3000/app/finance/invoices/new',
    'http://localhost:3000/admin',
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      console.log(`URL: ${url}`);
      console.log(`  Status: ${res.status} ${res.statusText}`);
      console.log(`  HTML Length: ${text.length}`);
      const titleMatch = text.match(/<title>(.*?)<\/title>/);
      console.log(`  Title: ${titleMatch ? titleMatch[1] : 'No title'}`);
      console.log(`  Has Error: ${text.includes('500') || text.includes('Internal Server Error')}`);
    } catch (err) {
      console.error(`URL ${url} ERROR:`, err.message);
    }
  }
}

test();
