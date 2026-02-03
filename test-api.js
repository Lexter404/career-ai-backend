#!/usr/bin/env node

import dotenv from 'dotenv';
dotenv.config();

const API_KEY = process.env.GENERATIVE_API_KEY;
const model = 'gemini-1.5-flash';

console.log('\n🧪 Testing Gemini API Connection...\n');

if (!API_KEY) {
  console.error('❌ ERROR: GENERATIVE_API_KEY not found in .env');
  process.exit(1);
}

console.log(`✅ API Key found: ${API_KEY.substring(0, 20)}...`);
console.log(`📚 Model: ${model}\n`);

async function testAPI() {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    
    console.log('📡 Sending test request...\n');

    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: 'Say "Success" in one word' }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 10
        }
      })
    });

    console.log(`Response Status: ${response.status} ${response.statusText}\n`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:');
      console.error(errorText);
      process.exit(1);
    }

    const data = await response.json();
    
    if (data.error) {
      console.error('❌ API Error:');
      console.error(JSON.stringify(data.error, null, 2));
      process.exit(1);
    }

    if (data.candidates && data.candidates.length > 0) {
      const result = data.candidates[0].content.parts[0].text;
      console.log('✅ SUCCESS! Gemini API is working!\n');
      console.log(`Response: ${result}\n`);
      console.log('🎉 Your API key is valid and the connection is working!\n');
    } else {
      console.warn('⚠️ Unexpected response format');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('❌ Connection Error:');
    console.error(`${error.message}\n`);
    process.exit(1);
  }
}

testAPI();
