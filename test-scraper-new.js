const http = require('http');

// First create a search request
const createReq = http.request('http://localhost:5000/api/search', {method: 'POST', headers: {'Content-Type': 'application/json'}}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    try {
      console.log('Response:', data);
      const result = JSON.parse(data);
      const newId = result.data?.searchRequest?.id || result.id;
      console.log('Created search request:', newId);
      
      if (newId) {
        setTimeout(() => runScraper(newId), 500);
      }
    } catch (e) {
      console.error('Parse error:', e.message);
    }
  });
});

createReq.write(JSON.stringify({categoryId: 1, locationId: 1}));
createReq.end();

function runScraper(searchId) {
  const scraperReq = http.request(`http://localhost:5000/api/scraper/start/${searchId}`, {method: 'POST'}, (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      console.log('\nScraper Status:', res.statusCode);
      console.log('Scraper Response:');
      console.log(data);
      process.exit(0);
    });
  });
  scraperReq.on('error', e => {
    console.error('Error:', e.message);
    process.exit(1);
  });
  scraperReq.end();
}
