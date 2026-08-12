require('dotenv').config();
(async () => {
  try {
    console.log('OPENROUTER_API_KEY present:', !!process.env.OPENROUTER_API_KEY);

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',
        messages: [{ role: 'user', content: 'Test connectivity' }],
        max_tokens: 5,
        temperature: 0.1,
      }),
    });

    console.log('response status:', res.status);
    const text = await res.text();
    console.log('response body (truncated):', text.slice(0, 1000));
  } catch (err) {
    console.error('fetch error:', err);
    process.exitCode = 1;
  }
})();
