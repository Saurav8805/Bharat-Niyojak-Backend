const express = require('express');
const { analyzeImage } = require('../config/gemini');
const { authenticateToken } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');
const fs = require('fs').promises;

const router = express.Router();

// Analyze image with AI
router.post('/analyze', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Image is required'
      });
    }

    // Read image file
    const imageBuffer = await fs.readFile(req.file.path);
    const imageBase64 = imageBuffer.toString('base64');

    // Analyze with Gemini AI
    const result = await analyzeImage(imageBase64, req.file.mimetype);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'AI analysis failed',
        error: result.error
      });
    }

    res.json({
      success: true,
      message: 'Image analyzed successfully',
      data: result.data
    });
  } catch (error) {
    console.error('AI analyze error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze image',
      error: error.message
    });
  }
});

module.exports = router;
