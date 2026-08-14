const http = require('http');

// Check request 54 which is COMPLETED
const req = http.request('http://localhost:5000/api/results/properties/54', {method: 'GET'}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const result = JSON.parse(data);
      console.log('📊 Request 54 Results:');
      console.log('   Properties found:', result.count);
      if (result.count > 0) {
        console.log('✅ SUCCESS! Data is being saved and retrieved!');
        console.log('\n📋 First property sample:');
        const p = result.data[0];
        console.log('   - Title:', p.property_title);
        console.log('   - Type:', p.property_type);
        console.log('   - Contact Phone:', p.contact_phone || p.contactNumber || '(none)');
        console.log('   - Contact Email:', p.contact_email || p.contactEmail || '(none)');
      } else {
        console.log('❌ No properties found (might still be processing or Gemini quota)');
      }
    } catch (e) {
      console.error('Parse error:', e.message);
      console.log('Response:', data.slice(0, 500));
    }
    process.exit(0);
  });
});

req.on('error', e => {
  console.error('Error:', e.message);
  process.exit(1);
});

req.end();
