const express = require('express');
const router = express.Router();
const axios = require('axios');

router.post('/text-to-speech', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ 
        error: 'Text is required' 
      });
    }

    if (!process.env.ELEVENLABS_API_KEY) {
      console.error(' ELEVENLABS_API_KEY not configured');
      return res.status(500).json({ 
        error: 'TTS service not configured' 
      });
    }

    console.log('🔊 TTS Request:', text.substring(0, 50) + '...');

    const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const response = await axios({
      method: 'POST',
      url: apiUrl,
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      },
   data: {
  text: text,
  model_id: 'eleven_turbo_v2_5',  
  voice_settings: {
    stability: 0.5,
    similarity_boost: 0.75
  }
},
      responseType: 'arraybuffer'
    });

    if (!response.data || response.data.byteLength === 0) {
      console.error('Empty audio response from ElevenLabs');
      return res.status(500).json({ 
        error: 'TTS service returned empty audio' 
      });
    }

    console.log(' TTS Success:', response.data.byteLength, 'bytes');

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', response.data.byteLength);

    res.send(Buffer.from(response.data));

  } catch (error) {
    console.error(' TTS Error:', error.message);
    
    if (error.response) {
      console.error('ElevenLabs API Error:', error.response.status, error.response.data);
      return res.status(error.response.status).json({ 
        error: 'TTS service error',
        details: error.response.data 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to generate speech',
      details: error.message
    });
  }
});

router.get('/health', (req, res) => {
  const isConfigured = !!(
    process.env.ELEVENLABS_API_KEY && 
    process.env.ELEVENLABS_VOICE_ID
  );

  res.json({
    status: isConfigured ? 'configured' : 'not configured',
    hasApiKey: !!process.env.ELEVENLABS_API_KEY,
    hasVoiceId: !!process.env.ELEVENLABS_VOICE_ID
  });
});

module.exports = router;

