const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn('⚠️  Gemini API key not found. AI features will be disabled.');
}

const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

async function analyzeImage(imageBase64, mimeType = 'image/jpeg') {
  if (!genAI) {
    throw new Error('Gemini AI is not configured');
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });

    const prompt = `You are an AI assistant for a civic issue reporting system in India. Analyze this image and provide the following information in JSON format:

{
  "category": "one of: pothole, damaged_road, garbage, overflowing_bin, streetlight, water_leakage, water_pipeline, fallen_tree, drainage, open_manhole, damaged_garden, traffic_infrastructure, other",
  "severity": "one of: low, medium, high, critical",
  "description": "detailed description of the civic issue visible in the image (2-3 sentences)",
  "confidence": "confidence score as a number between 0-100",
  "recommended_department": "Public Works Department, Water Supply Department, Electrical Department, Forest Department, Solid Waste Management, or Drainage Department",
  "estimated_size": "small, medium, or large",
  "safety_risk": "description of any safety risks"
}

Guidelines:
- Be specific and accurate in identifying civic infrastructure issues
- Assess severity based on safety risk and impact
- Provide clear, actionable descriptions
- Focus on Indian civic infrastructure context`;

    const imageParts = [
      {
        inlineData: {
          data: imageBase64,
          mimeType: mimeType
        }
      }
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const analysisData = JSON.parse(jsonMatch[0]);
      return {
        success: true,
        data: analysisData
      };
    }

    throw new Error('Failed to parse AI response');
  } catch (error) {
    console.error('Gemini AI Error:', error);
    return {
      success: false,
      error: error.message || 'Failed to analyze image'
    };
  }
}

module.exports = {
  analyzeImage
};
