const Database = require('better-sqlite3');
const http = require('http');

const db = new Database('/home/huy/.config/ezprofile/ezprofile.db');

function lookupCountry(ip) {
  return new Promise((resolve) => {
    http.get(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode`, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', (d) => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.status === 'success' ? json : null);
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

(async () => {
  const proxies = db.prepare('SELECT id, host FROM proxies WHERE country_code IS NULL').all();
  console.log(`Found ${proxies.length} proxies to backfill...`);
  for (const proxy of proxies) {
    const geo = await lookupCountry(proxy.host);
    if (geo && geo.countryCode) {
      db.prepare('UPDATE proxies SET country_code = ?, country_name = ? WHERE id = ?').run(geo.countryCode, geo.country, proxy.id);
      console.log(`Updated ${proxy.host} -> ${geo.countryCode}`);
    } else {
      console.log(`Failed to lookup ${proxy.host}`);
    }
  }
  db.close();
})();
