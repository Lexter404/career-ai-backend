const mongoose = require('mongoose');

const skillGapSchema = new mongoose.Schema({
  skill: String,
  level: String,
  gap: Number
}, { _id: false });

const salarySchema = new mongoose.Schema({
  min: Number,
  max: Number,
  median: Number
}, { _id: false });

const careerMatchSchema = new mongoose.Schema({
  careerId: Number,
  title: String,
  match: Number,
  whyFits: String,
  skillsGap: [skillGapSchema],
  salary: salarySchema,
  outlook: String,
  environment: String,
  interests: [String]
}, { _id: false });

const resultSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  assessmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assessment',
    required: true
  },
  careerMatches: [careerMatchSchema],
  interests: [String],
  strengths: [String],
  learningStyle: String,
  nextSteps: [{
    title: String,
    duration: String
  }],
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

resultSchema.index({ userId: 1 });
resultSchema.index({ assessmentId: 1 });
resultSchema.index({ userId: 1, generatedAt: -1 });

const Result = mongoose.model('Result', resultSchema);

module.exports = Result;