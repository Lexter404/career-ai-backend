const express = require('express');
const router = express.Router();
const Assessment = require('../models/Assessment');
const Result = require('../models/result');
const { callFastAPI } = require('../utils/fastapi');

router.post('/answers', async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'Not authenticated' 
      });
    }

    const { answers, noIdeas, customAnswers, timestamp } = req.body;

    if (!answers) {
      return res.status(400).json({ 
        error: 'Assessment answers are required' 
      });
    }

    const assessment = new Assessment({
      userId,
      answers,
      noIdeas: noIdeas || {},
      customAnswers: customAnswers || {},
      timestamp: timestamp || new Date()
    });

    await assessment.save();

    console.log('Assessment saved:', assessment._id);

    try {
      const analysisResult = await callFastAPI('/analyze', {
        assessmentId: assessment._id.toString(),
        userId: userId.toString(),
        answers,
        noIdeas,
        customAnswers
      });

      console.log(' AI analysis complete');

      const result = new Result({
        userId,
        assessmentId: assessment._id,
        careerMatches: analysisResult.careerMatches,
        interests: analysisResult.interests,
        strengths: analysisResult.strengths,
        learningStyle: analysisResult.learningStyle,
        nextSteps: analysisResult.nextSteps
      });

      await result.save();

      console.log(' Results saved:', result._id);

      res.json({
        message: 'Assessment submitted successfully',
        assessmentId: assessment._id,
        resultId: result._id
      });

    } catch (aiError) {
      console.error(' AI analysis error:', aiError);
      
      res.status(500).json({
        error: 'Assessment saved but AI analysis failed',
        assessmentId: assessment._id,
        details: aiError.message
      });
    }

  } catch (error) {
    console.error(' Assessment submission error:', error);
    res.status(500).json({ 
      error: 'Failed to submit assessment',
      details: error.message
    });
  }
});

router.get('/results', async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'Not authenticated' 
      });
    }

    const result = await Result.findOne({ userId })
      .sort({ generatedAt: -1 })
      .populate('assessmentId');

    if (!result) {
      return res.status(404).json({ 
        error: 'No results found. Please complete an assessment first.' 
      });
    }

    res.json({ result });

  } catch (error) {
    console.error(' Get results error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve results',
      details: error.message
    });
  }
});

router.get('/results/history', async (req, res) => {
  try {
    const userId = req.session.userId;
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'Not authenticated' 
      });
    }

    const results = await Result.find({ userId })
      .sort({ generatedAt: -1 })
      .populate('assessmentId')
      .limit(10);

    res.json({ results });

  } catch (error) {
    console.error(' Get history error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve history',
      details: error.message
    });
  }
});

module.exports = router;

