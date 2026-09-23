import fs from 'node:fs/promises';

// Research helper: downloads metadata, never assumes that a search result is licensed.
const queries = process.argv.slice(2);
const directory = 'tests/artifacts/photo-research';
await fs.mkdir(directory, { recursive: true });
for (const query of queries) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search',
    gsrsearch: `${query.startsWith('search:') ? query.slice(7) : `intitle:"${query}"`} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '8',
    prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '960',
  });
  try {
    let response;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { 'User-Agent': 'WWMarketDemo/1.0 (open-license photo research)' } });
      if (response.status !== 429) break;
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const pages = Object.values(data.query?.pages || {}).sort((a, b) => a.index - b.index);
    await fs.writeFile(`${directory}/${query.replace(/[^a-z0-9]/gi, '-')}.json`, JSON.stringify(pages, null, 2));
    console.log(JSON.stringify({ query, results: pages.map(page => ({ title: page.title, license: page.imageinfo?.[0].extmetadata?.LicenseShortName?.value, author: page.imageinfo?.[0].extmetadata?.Artist?.value?.replace(/<[^>]*>/g, '').slice(0, 140), width: page.imageinfo?.[0].width, height: page.imageinfo?.[0].height })) }));
  } catch (error) { console.log(JSON.stringify({ query, error: error.message })); }
  await new Promise(resolve => setTimeout(resolve, 1800));
}
