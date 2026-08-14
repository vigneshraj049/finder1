const http = require('http');

const req = http.request('http://localhost:5000/api/results/properties/57', {method: 'GET'}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Properties found:');
    try {
      const result = JSON.parse(data);
      if (result.count > 0) {
        console.log('✅ SUCCESS! Found', result.count, 'properties');
        console.log('First property:', JSON.stringify(result.data[0], null, 2));
      } else {
        console.log('❌ No properties found yet');
      }
    } catch (e) {
      console.log(data);
    }
    process.exit(0);
  });
});

req.on('error', e => {
  console.error('Error:', e.message);
  process.exit(1);
});

req.end();
