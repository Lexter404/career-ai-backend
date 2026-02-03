import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================================================
// MIDDLEWARE CONFIGURATION
// ============================================================================

// Enhanced CORS configuration
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept']
}));

app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// ENVIRONMENT VALIDATION
// ============================================================================

console.log('\n🔍 Environment Configuration Check:');
console.log('   PORT:', PORT);
console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('   GENERATIVE_API_KEY:', process.env.GENERATIVE_API_KEY ? 
  `✅ Configured (${process.env.GENERATIVE_API_KEY.substring(0, 10)}...${process.env.GENERATIVE_API_KEY.length} chars)` : 
  '❌ NOT SET');
console.log('   ELEVENLABS_API_KEY:', process.env.ELEVENLABS_API_KEY ? '✅ Configured' : '❌ NOT SET');

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Call Google Gemini API with a prompt
 */
async function callGeminiAPI(prompt, maxTokens = 4096) {
  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  
  console.log('🔗 Calling Gemini API...');
  console.log(`   Model: ${model}`);
  console.log(`   Prompt length: ${prompt.length} chars`);
  console.log(`   Max tokens: ${maxTokens}`);
  
  if (!process.env.GENERATIVE_API_KEY) {
    throw new Error('GENERATIVE_API_KEY not configured in environment');
  }

  const requestBody = {
    contents: [{
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: maxTokens,
      topP: 0.95,
      topK: 40
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'x-goog-api-key': process.env.GENERATIVE_API_KEY
    },
    body: JSON.stringify(requestBody)
  });

  console.log(`   Response status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`   ❌ Gemini API error: Status ${response.status}`);
    console.error(`   Response: ${errorText.substring(0, 500)}`);
    throw new Error(`Gemini API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  
  // Check for API errors in response
  if (data.error) {
    console.error(`   ❌ API error in response: ${data.error.message}`);
    throw new Error(`Gemini API error: ${data.error.message}`);
  }
  
  // Extract text from response
  let textOutput = '';
  if (data.candidates && data.candidates.length > 0) {
    const content = data.candidates[0].content;
    if (content && content.parts && content.parts.length > 0) {
      textOutput = content.parts.map(p => p.text || '').join('\n');
      console.log(`   ✅ Got response: ${textOutput.length} chars`);
    } else {
      console.warn('   ⚠️ No content parts in candidate');
    }
  } else {
    console.warn('   ⚠️ No candidates in response');
  }

  if (!textOutput) {
    throw new Error('Empty response from Gemini API');
  }

  return textOutput;
}

/**
 * Extract and parse JSON from Gemini response (IMPROVED VERSION)
 * Handles markdown code fences, extra text, and malformed responses
 */
function extractJSON(text) {
  console.log('🔍 Extracting JSON from response...');
  console.log('📏 Original length:', text.length);
  
  // Step 1: Remove markdown code fences
  let cleaned = text.trim();
  
  // Remove various code fence formats
  cleaned = cleaned.replace(/^```(?:json|jsonc|javascript)?\s*/i, '');
  cleaned = cleaned.replace(/\s*```\s*$/i, '');
  
  // Remove any leading/trailing whitespace
  cleaned = cleaned.trim();
  
  console.log('🧹 After cleaning, length:', cleaned.length);
  
  // Step 2: Try to find JSON boundaries using improved algorithm
  function findCompleteJSON(str, startChar, endChar) {
    const startIdx = str.indexOf(startChar);
    if (startIdx === -1) return null;
    
    let depth = 0;
    let endIdx = -1;
    let inString = false;
    let escapeNext = false;
    
    for (let i = startIdx; i < str.length; i++) {
      const char = str[i];
      
      // Handle escape sequences
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      // Handle string boundaries
      if (char === '"') {
        inString = !inString;
        continue;
      }
      
      // Only count braces/brackets outside strings
      if (!inString) {
        if (char === startChar) {
          depth++;
        } else if (char === endChar) {
          depth--;
          if (depth === 0) {
            endIdx = i;
            break;
          }
        }
      }
    }
    
    if (endIdx === -1) return null;
    return str.substring(startIdx, endIdx + 1);
  }
  
  // Try object first (most common for profile/overview data)
  let jsonStr = findCompleteJSON(cleaned, '{', '}');
  
  // If no object, try array
  if (!jsonStr) {
    jsonStr = findCompleteJSON(cleaned, '[', ']');
  }
  
  if (!jsonStr) {
    console.log('❌ No complete JSON structure found');
    console.log('📄 First 300 chars:', cleaned.substring(0, 300));
    console.log('📄 Last 300 chars:', cleaned.substring(Math.max(0, cleaned.length - 300)));
    
    // Save for debugging
    const debugFilename = `gemini-debug-${Date.now()}.txt`;
    try {
      fs.writeFileSync(debugFilename, text);
      console.log(`📁 Debug file saved: ${debugFilename}`);
    } catch (e) {
      console.log('⚠️ Could not save debug file:', e.message);
    }
    
    throw new Error('No valid JSON found in Gemini response');
  }
  
  console.log('✂️ Extracted JSON length:', jsonStr.length);
  console.log('📄 First 200 chars:', jsonStr.substring(0, 200));
  
  // Step 3: Parse JSON
  try {
    const parsed = JSON.parse(jsonStr);
    console.log('✅ Successfully parsed JSON!');
    if (typeof parsed === 'object') {
      console.log('📊 Top-level keys:', Object.keys(parsed).join(', '));
    }
    return parsed;
  } catch (parseError) {
    console.log('❌ JSON parse failed:', parseError.message);
    console.log('💾 Saving failed JSON to debug file...');
    
    const debugFilename = `gemini-parse-error-${Date.now()}.json`;
    try {
      fs.writeFileSync(debugFilename, jsonStr);
      console.log(`📁 Debug file saved: ${debugFilename}`);
    } catch (e) {
      console.log('⚠️ Could not save debug file:', e.message);
    }
    
    throw new Error(`JSON parse error: ${parseError.message}`);
  }
}

// ============================================================================
// BASIC ROUTES
// ============================================================================

app.get('/api/hello', (req, res) => {
  res.json({ 
    message: 'Career Assessment API - Ready!',
    timestamp: new Date().toISOString(),
    version: '2.0'
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    apis: {
      gemini: process.env.GENERATIVE_API_KEY ? 'configured' : 'not-configured',
      elevenlabs: process.env.ELEVENLABS_API_KEY ? 'configured' : 'not-configured'
    },
    server: {
      port: PORT,
      nodeVersion: process.version,
      uptime: process.uptime()
    }
  });
});

// ============================================================================
// TEST ENDPOINTS
// ============================================================================

// Test Gemini API connection
app.get('/api/test-gemini', async (req, res) => {
  try {
    console.log('\n🧪 Testing Gemini API...');
    
    if (!process.env.GENERATIVE_API_KEY) {
      return res.status(400).json({
        success: false,
        error: 'Gemini API key not configured',
        message: 'Add GENERATIVE_API_KEY to .env file',
        instructions: [
          '1. Get API key from https://aistudio.google.com/apikey',
          '2. Create .env file in project root',
          '3. Add line: GENERATIVE_API_KEY=your_key_here',
          '4. Restart server'
        ]
      });
    }

    const testPrompt = 'Respond with a JSON object: {"status": "success", "message": "Gemini API is working"}';
    const response = await callGeminiAPI(testPrompt, 100);
    
    console.log('✅ Gemini test successful');
    
    return res.json({
      success: true,
      message: '✅ Gemini API is working!',
      rawResponse: response.substring(0, 200),
      apiKey: `${process.env.GENERATIVE_API_KEY.substring(0, 10)}...`,
      model: 'gemini-2.0-flash-exp'
    });
  } catch (error) {
    console.error('❌ Gemini API Test Failed:', error.message);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      troubleshooting: [
        '1. Check if GENERATIVE_API_KEY is valid in .env file',
        '2. Verify the API key in Google AI Studio',
        '3. Make sure Gemini API is enabled',
        '4. Check internet connection',
        '5. Check for rate limiting or quota issues'
      ]
    });
  }
});

// Test ElevenLabs connection
app.get('/api/test-elevenlabs', async (req, res) => {
  try {
    console.log("🧪 Testing ElevenLabs API...");
    
    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(400).json({
        status: "Error",
        error: "ElevenLabs API key not configured"
      });
    }
    
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    res.json({ 
      status: "Connected", 
      voicesCount: data.voices ? data.voices.length : 0,
      apiKeyPresent: !!process.env.ELEVENLABS_API_KEY
    });
  } catch (error) {
    res.status(500).json({ 
      status: "Error", 
      error: error.message,
      hint: "Check API key validity"
    });
  }
});

// ============================================================================
// ELEVENLABS TEXT-TO-SPEECH
// ============================================================================

app.post('/api/text-to-speech', async (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  try {
    console.log("🔊 Converting text to speech:", text.substring(0, 50) + "...");

    const voiceId = 'JBFqnCBsd6RMkjVDRZzb'; // Rachel voice
    
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        })
      }
    );

    console.log("📡 ElevenLabs Response Status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ ElevenLabs API Error:", response.status, errorText);
      return res.status(response.status).json({ 
        error: 'ElevenLabs API error',
        status: response.status,
        message: errorText
      });
    }

    const audioArrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(audioArrayBuffer);
    
    console.log(`✅ Audio generated: ${audioBuffer.length} bytes`);
    
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    res.send(audioBuffer);
    
  } catch (error) {
    console.error("❌ TTS Error:", error.message);
    console.error("Error stack:", error.stack);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to generate speech',
        message: error.message 
      });
    }
  }
});

// ============================================================================
// ASSESSMENT ENDPOINTS
// ============================================================================

app.post('/api/answers', async (req, res) => {
  try {
    console.log("📝 Assessment answers received:", Object.keys(req.body).length, "items");
    res.json({ 
      success: true, 
      message: 'Assessment answers saved successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("❌ Error saving answers:", error);
    res.status(500).json({ error: 'Failed to save answers' });
  }
});

// ============================================================================
// 1. OVERVIEW ENDPOINT - /api/overview
// ============================================================================
app.post('/api/overview', async (req, res) => {
  try {
    const { username, answers } = req.body || {};
    console.log('\n📊 === OVERVIEW REQUEST ===');
    console.log('   Username:', username || 'anonymous');
    console.log('   Answers:', answers ? Object.keys(answers).length + ' items' : 'none');

    if (!process.env.GENERATIVE_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'Gemini API key not configured' 
      });
    }

    const prompt = `You are a career counselor AI. Based on the following assessment answers, generate a comprehensive career overview.

Assessment Answers:
${JSON.stringify(answers, null, 2)}

Generate a JSON object with this EXACT structure:
{
  "topMatches": [
    {
      "id": "software_engineer",
      "title": "Software Engineer",
      "match": 95,
      "shortReason": "One sentence why this fits"
    },
    {
      "id": "data_scientist",
      "title": "Data Scientist",
      "match": 90,
      "shortReason": "One sentence why this fits"
    },
    {
      "id": "product_manager",
      "title": "Product Manager",
      "match": 88,
      "shortReason": "One sentence why this fits"
    }
  ],
  "profile": {
    "primaryInterest": "Building technology solutions",
    "topStrengths": ["Problem-solving", "Analytical thinking", "Technical skills"],
    "learningStyle": "Hands-on and project-based",
    "workEnvironment": "Mix of independent and collaborative work"
  },
  "nextStep": {
    "action": "Start learning Python programming",
    "why": "Based on your education path and interest in technology",
    "resources": ["Codecademy", "freeCodeCamp", "CS50"]
  }
}

CRITICAL: Return ONLY the JSON object. No markdown code blocks, no backticks, no explanation text.`;

    const textOutput = await callGeminiAPI(prompt);
    const overview = extractJSON(textOutput);
    
    console.log('✅ Overview generated successfully');
    
    return res.json({
      success: true,
      data: overview,
      source: 'gemini-ai',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error generating overview:', error.message);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================================================
// 2. MATCHES ENDPOINT - /api/matches
// ============================================================================
app.post('/api/matches', async (req, res) => {
  try {
    const { username, answers } = req.body || {};
    console.log('\n🎯 === MATCHES REQUEST ===');
    console.log('   Username:', username || 'anonymous');
    console.log('   Answers:', answers ? Object.keys(answers).length + ' items' : 'none');
    if (!process.env.GENERATIVE_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'Gemini API key not configured' 
      });
    }
    const prompt = `You are a career counselor AI. Based on the following assessment answers, generate 6 detailed career recommendations.
Assessment Answers:
${JSON.stringify(answers, null, 2)}
Generate a JSON array with this EXACT structure:
[
  {
    "id": "software_engineer",
    "title": "Software Engineer",
    "match": 95,
    "whyFits": "Detailed 2-3 sentence explanation of why this career matches their profile.",
    "skillsGap": {
      "hasSkills": ["Problem-solving", "Logical thinking"],
      "needsSkills": ["Programming languages", "Version control", "Software architecture"]
    },
    "education": {
      "minimumRequired": "Bachelor's in Computer Science or related field",
      "alternatives": ["Coding bootcamp", "Self-taught with portfolio", "Associate degree + experience"],
      "timeToComplete": "4 years for degree, 3-6 months for bootcamp"
    },
    "outlook": {
      "salaryRange": "$70,000 - $150,000+",
      "jobGrowth": "Strong (22% growth projected)",
      "demandLevel": "Very High"
    }
  }
]
Requirements:
- Generate exactly 6 careers
- Each career should have ALL fields filled
- Make salary and outlook realistic
- Skills gap should be honest and helpful
CRITICAL: Return ONLY the JSON array. No markdown, no backticks, no explanation.`;
    const textOutput = await callGeminiAPI(prompt, 8192);
    const matches = extractJSON(textOutput);
    
    // Handle both array and single object responses
    let matchesArray;
    if (Array.isArray(matches)) {
      matchesArray = matches;
    } else if (matches && typeof matches === 'object') {
      // If it's a single object, wrap it in an array
      matchesArray = [matches];
      console.log('⚠️  Received single object instead of array, wrapping it');
    } else {
      matchesArray = [];
      console.log('⚠️  No valid matches received');
    }
    
    // Validate and normalize
    const normalized = matchesArray.slice(0, 6).map((m, i) => ({
      id: m.id || `career_${i}`,
      title: m.title || 'Unknown Career',
      match: typeof m.match === 'number' ? Math.min(100, Math.max(0, m.match)) : 75,
      whyFits: m.whyFits || 'This career aligns with your profile.',
      skillsGap: m.skillsGap || {
        hasSkills: ["General skills"],
        needsSkills: ["Specific training needed"]
      },
      education: m.education || {
        minimumRequired: "Varies",
        alternatives: ["Self-learning", "Online courses"],
        timeToComplete: "Varies"
      },
      outlook: m.outlook || {
        salaryRange: "$40,000 - $80,000",
        jobGrowth: "Moderate",
        demandLevel: "Medium"
      }
    }));
    
    console.log(`✅ Generated ${normalized.length} detailed career matches`);
    
    return res.json({
      success: true,
      matches: normalized,
      source: 'gemini-ai',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error generating matches:', error.message);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
// ============================================================================
// 3. EXPLORE CAREERS ENDPOINT - /api/explore
// ============================================================================
app.get('/api/explore', async (req, res) => {
  try {
    const { industry, educationLevel, salaryMin, salaryMax, workEnvironment } = req.query;

    console.log('\n🔍 === EXPLORE REQUEST ===');
    console.log('   Filters:', req.query);

    if (!process.env.GENERATIVE_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'Gemini API key not configured' 
      });
    }

    const filterText = `
Filters applied:
- Industry: ${industry || 'Any'}
- Education Level: ${educationLevel || 'Any'}
- Salary Range: ${salaryMin || 'Min'} - ${salaryMax || 'Max'}
- Work Environment: ${workEnvironment || 'Any'}
`;

    const prompt = `You are a career database expert. Generate a comprehensive list of 15 diverse career paths.

${filterText}

Generate a JSON array with this structure:
[
  {
    "id": "software_engineer",
    "title": "Software Engineer",
    "industry": "Technology",
    "shortDescription": "One sentence description",
    "educationRequired": "Bachelor's degree",
    "salaryRange": "$70,000 - $150,000",
    "workEnvironment": "Office/Remote",
    "demandLevel": "Very High",
    "tags": ["technology", "coding", "problem-solving"]
  }
]

Include diverse careers across Technology, Healthcare, Business, Creative/Arts, Education, Trades, Science, and Social Services.

CRITICAL: Return ONLY the JSON array. No markdown, no backticks, no explanation.`;

    const textOutput = await callGeminiAPI(prompt, 8192);
    const careers = extractJSON(textOutput);
    
    console.log(`✅ Retrieved ${careers.length} careers`);
    
    return res.json({
      success: true,
      careers: careers,
      totalCount: careers.length,
      filters: { industry, educationLevel, salaryMin, salaryMax, workEnvironment },
      source: 'gemini-ai',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching career database:', error.message);
    
    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================================================
// 4. PROFILE ENDPOINT - /api/profile (COMPLETELY REWRITTEN)
// ============================================================================
app.post('/api/profile', async (req, res) => {
  try {
    const { username, answers } = req.body || {};
    
    console.log('\n👤 === PROFILE REQUEST START ===');
    console.log('   Timestamp:', new Date().toISOString());
    console.log('   Username:', username || 'anonymous');
    console.log('   Answers received:', answers ? Object.keys(answers).length + ' items' : 'none');
    console.log('   Request body size:', JSON.stringify(req.body).length, 'bytes');

    // Validate API key
    if (!process.env.GENERATIVE_API_KEY) {
      console.error('❌ Gemini API key not configured');
      return res.status(500).json({ 
        success: false, 
        error: 'Gemini API key not configured on server',
        troubleshooting: [
          'Server admin: Add GENERATIVE_API_KEY to .env file',
          'Get API key from https://aistudio.google.com/apikey',
          'Restart server after adding key'
        ],
        timestamp: new Date().toISOString()
      });
    }

    // Validate input
    if (!answers || Object.keys(answers).length === 0) {
      console.warn('⚠️ No assessment answers provided - returning empty profile');
      return res.json({
        success: true,
        profile: {
          summary: {
            headline: "Complete Assessment to Generate Profile",
            description: "Take the career assessment to receive your personalized AI-generated profile with strengths, recommendations, and career roadmap."
          },
          strengths: [],
          challenges: [],
          interests: {
            primary: [],
            secondary: [],
            workStyle: "Assessment Required"
          },
          learningProfile: {
            preferredMethod: "Assessment Required",
            pace: "Assessment Required",
            bestEnvironment: "Assessment Required"
          },
          careerReadiness: {
            currentLevel: "Assessment Pending",
            nextMilestones: ["Complete the career assessment"],
            estimatedTimeToCareer: "To be determined"
          },
          recommendations: {
            immediate: ["Take the career assessment to get started"],
            shortTerm: [],
            longTerm: []
          }
        },
        source: 'no-assessment-data',
        message: 'Complete assessment to receive AI-generated profile',
        timestamp: new Date().toISOString()
      });
    }

    console.log('✅ Input validation passed');
    console.log('🤖 Preparing Gemini API call for profile analysis...');

    // Optimized prompt for better JSON generation
    const prompt = `You are an expert career counselor AI. Analyze these assessment answers and create a comprehensive career profile.

ASSESSMENT DATA:
${JSON.stringify(answers, null, 2)}

GENERATE EXACTLY THIS JSON STRUCTURE (no extra text):
{
  "summary": {
    "headline": "Engaging one-sentence professional identity",
    "description": "Compelling 2-3 sentence profile summary"
  },
  "strengths": [
    {
      "name": "Strength Name",
      "description": "How this strength manifests based on their answers",
      "score": 85
    },
    {
      "name": "Another Strength",
      "description": "Evidence of this strength",
      "score": 78
    },
    {
      "name": "Third Strength",
      "description": "How they demonstrate this",
      "score": 72
    }
  ],
  "challenges": [
    {
      "area": "Growth Area",
      "description": "Specific challenge to work on",
      "howToImprove": "Actionable steps to improve"
    },
    {
      "area": "Another Challenge",
      "description": "What needs development",
      "howToImprove": "Practical improvement plan"
    }
  ],
  "interests": {
    "primary": ["Interest 1", "Interest 2", "Interest 3"],
    "secondary": ["Interest 4", "Interest 5"],
    "workStyle": "Detailed description of preferred work style"
  },
  "learningProfile": {
    "preferredMethod": "Their best learning approach",
    "pace": "Learning speed and style",
    "bestEnvironment": "Optimal learning conditions"
  },
  "careerReadiness": {
    "currentLevel": "Where they are now",
    "nextMilestones": ["Milestone 1", "Milestone 2", "Milestone 3"],
    "estimatedTimeToCareer": "Realistic timeframe"
  },
  "recommendations": {
    "immediate": ["Action 1 this week", "Action 2 this week", "Action 3 this week"],
    "shortTerm": ["Goal 1 (1-3 months)", "Goal 2 (1-3 months)", "Goal 3 (1-3 months)"],
    "longTerm": ["Vision 1 (6-12 months)", "Vision 2 (6-12 months)", "Vision 3 (6-12 months)"]
  }
}

RULES:
- Return ONLY valid JSON
- NO markdown formatting
- NO code blocks
- NO extra text before or after JSON
- Make all content specific and personalized
- Use realistic scores (65-95 range)
- Base everything on the actual assessment answers`;

    console.log('🚀 Calling Gemini API...');
    console.log('   Prompt size:', prompt.length, 'characters');
    
    const textOutput = await callGeminiAPI(prompt, 8192);
    
    console.log('📝 Gemini response received');
    console.log('   Response length:', textOutput.length, 'characters');
    console.log('   First 150 chars:', textOutput.substring(0, 150));
    console.log('   Last 150 chars:', textOutput.substring(Math.max(0, textOutput.length - 150)));
    
    console.log('🔍 Extracting and parsing JSON...');
    const profile = extractJSON(textOutput);
    
    if (!profile) {
      throw new Error('Failed to extract valid JSON from Gemini response');
    }
    
    // Comprehensive validation and normalization
    console.log('✅ JSON extracted successfully');
    console.log('📊 Validating profile structure...');
    console.log('   Has summary:', !!profile.summary);
    console.log('   Strengths count:', profile.strengths?.length || 0);
    console.log('   Challenges count:', profile.challenges?.length || 0);
    console.log('   Has interests:', !!profile.interests);
    console.log('   Has learningProfile:', !!profile.learningProfile);
    console.log('   Has careerReadiness:', !!profile.careerReadiness);
    console.log('   Has recommendations:', !!profile.recommendations);
    
    // Normalize to ensure all fields exist
    const normalizedProfile = {
      summary: profile.summary || {
        headline: "Career Profile Generated",
        description: "Your personalized career analysis has been completed."
      },
      strengths: Array.isArray(profile.strengths) && profile.strengths.length > 0 
        ? profile.strengths.map(s => ({
            name: s.name || 'Unnamed Strength',
            description: s.description || 'Description unavailable',
            score: typeof s.score === 'number' ? Math.min(100, Math.max(0, s.score)) : 70
          }))
        : [
            {
              name: "Analytical Thinking",
              description: "Based on your assessment responses",
              score: 75
            }
          ],
      challenges: Array.isArray(profile.challenges) && profile.challenges.length > 0
        ? profile.challenges.map(c => ({
            area: c.area || 'Growth Area',
            description: c.description || 'Area for development',
            howToImprove: c.howToImprove || 'Recommendations pending'
          }))
        : [
            {
              area: "Continuous Learning",
              description: "Stay current with industry trends",
              howToImprove: "Dedicate time weekly to learning new skills"
            }
          ],
      interests: {
        primary: Array.isArray(profile.interests?.primary) && profile.interests.primary.length > 0
          ? profile.interests.primary
          : ["Career Development"],
        secondary: Array.isArray(profile.interests?.secondary) && profile.interests.secondary.length > 0
          ? profile.interests.secondary
          : ["Professional Growth"],
        workStyle: profile.interests?.workStyle || "Flexible and adaptable"
      },
      learningProfile: {
        preferredMethod: profile.learningProfile?.preferredMethod || "Mixed learning approaches",
        pace: profile.learningProfile?.pace || "Steady progression",
        bestEnvironment: profile.learningProfile?.bestEnvironment || "Supportive and structured"
      },
      careerReadiness: {
        currentLevel: profile.careerReadiness?.currentLevel || "Exploring career options",
        nextMilestones: Array.isArray(profile.careerReadiness?.nextMilestones) && profile.careerReadiness.nextMilestones.length > 0
          ? profile.careerReadiness.nextMilestones
          : ["Complete skills assessment", "Research career paths", "Create development plan"],
        estimatedTimeToCareer: profile.careerReadiness?.estimatedTimeToCareer || "Variable based on path chosen"
      },
      recommendations: {
        immediate: Array.isArray(profile.recommendations?.immediate) && profile.recommendations.immediate.length > 0
          ? profile.recommendations.immediate
          : ["Review your assessment results", "Research recommended careers", "Identify skill gaps"],
        shortTerm: Array.isArray(profile.recommendations?.shortTerm) && profile.recommendations.shortTerm.length > 0
          ? profile.recommendations.shortTerm
          : ["Take relevant online courses", "Connect with professionals", "Build project portfolio"],
        longTerm: Array.isArray(profile.recommendations?.longTerm) && profile.recommendations.longTerm.length > 0
          ? profile.recommendations.longTerm
          : ["Pursue formal education/certification", "Gain practical experience", "Build professional network"]
      }
    };
    
    console.log('✅ Profile normalized and validated');
    console.log('📊 Final profile structure:');
    console.log('   Summary headline:', normalizedProfile.summary.headline.substring(0, 50));
    console.log('   Strengths:', normalizedProfile.strengths.length);
    console.log('   Challenges:', normalizedProfile.challenges.length);
    console.log('   Primary interests:', normalizedProfile.interests.primary.length);
    console.log('   Immediate recommendations:', normalizedProfile.recommendations.immediate.length);
    console.log('✅ === PROFILE REQUEST SUCCESS ===\n');
    
    return res.json({
      success: true,
      profile: normalizedProfile,
      answers: answers,
      source: 'gemini-ai',
      timestamp: new Date().toISOString(),
      metadata: {
        username: username,
        answersCount: Object.keys(answers).length,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('\n❌ === PROFILE REQUEST FAILED ===');
    console.error('   Error:', error.message);
    console.error('   Type:', error.name);
    console.error('   Stack:', error.stack);
    
    // Determine error type for better troubleshooting
    let errorType = 'UNKNOWN';
    let troubleshooting = [
      'Check server logs for detailed error information',
      'Verify Gemini API key is valid and active',
      'Try the /api/test-gemini endpoint first',
      'Ensure assessment answers are properly formatted'
    ];
    
    if (error.message.includes('400')) {
      errorType = 'BAD_REQUEST';
      troubleshooting = [
        'Gemini API received invalid request format',
        'Check if API key is correctly configured',
        'Verify API key has necessary permissions',
        'Review request payload structure'
      ];
    } else if (error.message.includes('401') || error.message.includes('403')) {
      errorType = 'AUTH_ERROR';
      troubleshooting = [
        'API key is invalid or expired',
        'Get new key from https://aistudio.google.com/apikey',
        'Ensure Gemini API is enabled in Google Cloud Console',
        'Check API key permissions'
      ];
    } else if (error.message.includes('429')) {
      errorType = 'RATE_LIMIT';
      troubleshooting = [
        'Too many requests to Gemini API',
        'Wait a few minutes before retrying',
        'Check API quota limits',
        'Consider upgrading API plan'
      ];
    } else if (error.message.includes('JSON')) {
      errorType = 'PARSE_ERROR';
      troubleshooting = [
        'Gemini returned malformed JSON',
        'Check debug files in server directory',
        'Try request again (AI responses can vary)',
        'Review gemini-debug-*.txt files'
      ];
    }
    
    console.error('   Error Type:', errorType);
    console.error('   Troubleshooting steps:', troubleshooting.join(' | '));
    console.error('='.repeat(50) + '\n');
    
    return res.status(500).json({
      success: false,
      error: error.message,
      errorType: errorType,
      troubleshooting: troubleshooting,
      timestamp: new Date().toISOString(),
      requestInfo: {
        username: req.body.username || 'unknown',
        hasAnswers: !!(req.body.answers && Object.keys(req.body.answers).length > 0)
      }
    });
  }
});

// ============================================================================
// COMPARE CAREERS
// ============================================================================
app.post('/api/explore/compare', async (req, res) => {
  try {
    const { careerIds } = req.body;
    
    if (!careerIds || !Array.isArray(careerIds) || careerIds.length === 0) {
      return res.status(400).json({ error: 'careerIds array required' });
    }

    console.log('\n⚖️  === COMPARE REQUEST ===');
    console.log('   Comparing:', careerIds.join(', '));

    if (!process.env.GENERATIVE_API_KEY) {
      return res.status(500).json({ 
        success: false, 
        error: 'Gemini API key not configured' 
      });
    }

    const prompt = `Generate a detailed comparison of these careers: ${careerIds.join(', ')}

Return a JSON object:
{
  "careers": [
    {
      "id": "career_id",
      "title": "Career Title",
      "education": "Education requirements",
      "salaryRange": "$XX,000 - $XX,000",
      "timeToEntry": "X years",
      "workLifeBalance": "Description",
      "jobSecurity": "Level",
      "growthPotential": "Description",
      "prosAndCons": {
        "pros": ["Pro 1", "Pro 2", "Pro 3"],
        "cons": ["Con 1", "Con 2"]
      }
    }
  ],
  "recommendation": "One paragraph recommendation"
}

CRITICAL: Return ONLY the JSON object. No markdown, no backticks.`;

    const textOutput = await callGeminiAPI(prompt);
    const comparison = extractJSON(textOutput);
    
    console.log('✅ Career comparison generated');
    
    return res.json({
      success: true,
      comparison: comparison,
      source: 'gemini-ai',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error comparing careers:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
    availableEndpoints: [
      'GET /api/hello',
      'GET /api/health',
      'GET /api/test-gemini',
      'GET /api/test-elevenlabs',
      'POST /api/text-to-speech',
      'POST /api/answers',
      'POST /api/overview',
      'POST /api/matches',
      'GET /api/explore',
      'POST /api/explore/compare',
      'POST /api/profile'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// SERVER START
// ============================================================================
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 CAREER ASSESSMENT API - FULLY FUNCTIONAL BACKEND v2.0');
  console.log('='.repeat(80));
  console.log(`🌐 Server URL: http://localhost:${PORT}`);
  console.log(`📅 Started at: ${new Date().toLocaleString()}`);
  console.log(`⏰ Uptime: ${process.uptime().toFixed(2)}s`);
  console.log(`📦 Node version: ${process.version}`);
  
  console.log('\n📋 API Status:');
  console.log(`   🔑 Gemini API: ${process.env.GENERATIVE_API_KEY ? '✅ CONFIGURED' : '❌ NOT CONFIGURED'}`);
  console.log(`   🔊 ElevenLabs API: ${process.env.ELEVENLABS_API_KEY ? '✅ CONFIGURED' : '❌ NOT CONFIGURED'}`);
  
  if (process.env.GENERATIVE_API_KEY) {
    console.log(`   🤖 AI Model: gemini-2.0-flash-exp`);
  } else {
    console.log(`   ⚠️  WARNING: Gemini API not configured!`);
    console.log(`   📝 Get API key: https://aistudio.google.com/apikey`);
    console.log(`   💾 Add to .env: GENERATIVE_API_KEY=your_key_here`);
  }
  
  console.log('\n🔌 Available Endpoints:');
  console.log('   ✅ GET  /api/hello                - Health check');
  console.log('   ✅ GET  /api/health               - System status');
  console.log('   🧪 GET  /api/test-gemini          - Test Gemini API');
  console.log('   🧪 GET  /api/test-elevenlabs      - Test TTS API');
  console.log('   🔊 POST /api/text-to-speech       - Generate speech');
  console.log('   📝 POST /api/answers              - Save answers');
  console.log('   📊 POST /api/overview             - Career overview');
  console.log('   🎯 POST /api/matches              - Career matches');
  console.log('   🔍 GET  /api/explore              - Browse careers');
  console.log('   ⚖️  POST /api/explore/compare     - Compare careers');
  console.log('   👤 POST /api/profile              - User profile ⭐ FIXED');
  
  console.log('\n💡 Tips:');
  console.log('   • Test Gemini: curl http://localhost:' + PORT + '/api/test-gemini');
  console.log('   • View health: curl http://localhost:' + PORT + '/api/health');
  console.log('   • Frontend should use: http://localhost:' + PORT);
  
  console.log('\n' + '='.repeat(80) + '\n');
  
  console.log('✅ Server is ready to accept requests!\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n👋 SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n👋 SIGINT received. Shutting down gracefully...');
  process.exit(0);
});