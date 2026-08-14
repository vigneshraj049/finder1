const http = require('http');

const req = http.request('http://localhost:5000/api/scraper/start/54', {method: 'POST'}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:');
    console.log(data);
    process.exit(0);
  });
});

req.on('error', e => {
  console.error('Error:', e.message);
  process.exit(1);
});

req.end();
