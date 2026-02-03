const mongoose = require('mongoose');

const assessmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  answers: {
    type: Map,
    of: String,
    required: true
  },
  noIdeas: {
    type: Map,
    of: Boolean,
    default: {}
  },
  customAnswers: {
    type: Map,
    of: String,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

assessmentSchema.index({ userId: 1, timestamp: -1 });

const Assessment = mongoose.model('Assessment', assessmentSchema);

module.exports = Assessment;
