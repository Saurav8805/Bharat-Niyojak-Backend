const express = require('express');
const router = express.Router();
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const supabase = require('../config/supabase');

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * @route   POST /api/issues/report
 * @desc    Report new issue with AI analysis
 * @access  Private (Citizen)
 */
router.post('/report', upload.single('image'), async (req, res) => {
  try {
    const { description, latitude, longitude, address } = req.body;
    const userId = req.user?.id || req.body.userId; // From auth middleware

    // Validation
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Image is required'
      });
    }

    if (!description || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Description and location are required'
      });
    }

    // Upload image to Supabase Storage
    const fileName = `${Date.now()}-${req.file.originalname}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('issue-images')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (uploadError) {
      console.error('Image upload error:', uploadError);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload image'
      });
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('issue-images')
      .getPublicUrl(fileName);

    // AI Analysis using Gemini Vision
    console.log('Starting AI analysis...');
    
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    // Convert image buffer to base64
    const imageBase64 = req.file.buffer.toString('base64');
    
    const prompt = `Analyze this civic issue image and provide:
1. A detailed description of the problem (2-3 sentences)
2. The severity level (low, medium, high, critical)
3. The appropriate department (must be one of: electric, road, water, forest)
4. Estimated category/type of issue

User's description: "${description}"
Location: ${address || `${latitude}, ${longitude}`}

Response format (JSON only):
{
  "detailed_description": "string",
  "severity": "low|medium|high|critical",
  "department": "electric|road|water|forest",
  "category": "string",
  "confidence": 0.0-1.0
}`;

    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: req.file.mimetype,
          data: imageBase64
        }
      }
    ]);

    const response = await result.response;
    const aiText = response.text();
    
    // Parse AI response
    let aiAnalysis;
    try {
      // Extract JSON from response
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      aiAnalysis = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error('AI parsing error:', e);
      // Fallback to basic analysis
      aiAnalysis = {
        detailed_description: description,
        severity: 'medium',
        department: 'road', // Default
        category: 'General Issue',
        confidence: 0.5
      };
    }

    console.log('AI Analysis:', aiAnalysis);

    // Check for duplicate issues with enhanced AI comparison
    const { data: recentIssues } = await supabase
      .from('issues')
      .select('id, latitude, longitude, images, description, ai_description, department')
      .gte('reported_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
      .eq('department', aiAnalysis.department) // Same department only
      .limit(100);

    let isDuplicate = false;
    let duplicateIssueId = null;
    let similarityScore = 0;

    if (recentIssues && recentIssues.length > 0) {
      // Enhanced duplicate detection with location and description similarity
      for (const issue of recentIssues) {
        const distance = calculateDistance(
          parseFloat(latitude),
          parseFloat(longitude),
          issue.latitude,
          issue.longitude
        );
        
        // If within 200 meters and same department, check description similarity
        if (distance < 0.2) { // 0.2 km = 200 meters
          // Calculate text similarity using AI
          try {
            const similarityPrompt = `Compare these two issue descriptions and determine if they are reporting the same problem.
            
Issue 1 (New): ${aiAnalysis.detailed_description}
Location 1: ${address || `${latitude}, ${longitude}`}

Issue 2 (Existing): ${issue.ai_description || issue.description}
Location 2: Around ${distance.toFixed(2)} km away

Are these the same issue? Consider:
- Physical proximity (${distance.toFixed(3)} km apart)
- Problem description similarity
- Same department (${aiAnalysis.department})

Respond with JSON only:
{
  "is_duplicate": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}`;

            const similarityResult = await model.generateContent(similarityPrompt);
            const similarityResponse = await similarityResult.response;
            const similarityText = similarityResponse.text();
            
            const similarityJson = JSON.parse(similarityText.match(/\{[\s\S]*\}/)[0]);
            
            if (similarityJson.is_duplicate && similarityJson.confidence > 0.7) {
              isDuplicate = true;
              duplicateIssueId = issue.id;
              similarityScore = similarityJson.confidence;
              console.log(`Duplicate detected: ${similarityJson.reason}`);
              break;
            }
          } catch (e) {
            console.error('Similarity check error:', e);
            // Fallback to distance-only check
            if (distance < 0.05) { // 50 meters
              isDuplicate = true;
              duplicateIssueId = issue.id;
              similarityScore = 0.8;
              break;
            }
          }
        }
      }
    }

    // Create issue in database
    const { data: issue, error: issueError } = await supabase
      .from('issues')
      .insert({
        citizen_id: userId,
        title: aiAnalysis.category || description.substring(0, 100),
        description: description,
        ai_description: aiAnalysis.detailed_description,
        category: aiAnalysis.category,
        department: aiAnalysis.department,
        priority: aiAnalysis.severity,
        status: 'pending',
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        address: address || null,
        images: [publicUrl],
        ai_confidence: aiAnalysis.confidence,
        is_duplicate: isDuplicate,
        duplicate_of: duplicateIssueId
      })
      .select()
      .single();

    if (issueError) {
      console.error('Issue creation error:', issueError);
      return res.status(500).json({
        success: false,
        message: 'Failed to create issue'
      });
    }

    // Log issue creation
    await supabase.from('issue_updates').insert({
      issue_id: issue.id,
      user_id: userId,
      update_type: 'created',
      new_value: 'pending',
      comment: 'Issue reported by citizen'
    });

    // Create notification for department admin (optional)
    // Notify all admins of the assigned department
    const { data: departmentAdmins } = await supabase
      .from('users')
      .select('id')
      .eq('department', aiAnalysis.department)
      .eq('role', 'admin')
      .eq('is_active', true);

    if (departmentAdmins && departmentAdmins.length > 0) {
      const notifications = departmentAdmins.map(admin => ({
        user_id: admin.id,
        title: 'New Issue Reported',
        message: `A new ${aiAnalysis.severity} priority issue has been reported in your department: ${issue.title}`,
        type: 'new_issue',
        related_issue_id: issue.id
      }));

      await supabase.from('notifications').insert(notifications);
    }

    // Notify citizen of successful submission
    await supabase.from('notifications').insert({
      user_id: userId,
      title: 'Issue Reported Successfully',
      message: `Your issue "${issue.title}" has been reported and assigned to the ${aiAnalysis.department} department.`,
      type: 'issue_submitted',
      related_issue_id: issue.id
    });

    res.status(201).json({
      success: true,
      message: isDuplicate 
        ? 'Possible duplicate detected! Issue reported successfully.' 
        : 'Issue reported successfully',
      data: {
        issue,
        aiAnalysis,
        isDuplicate,
        duplicateIssueId,
        similarityScore: isDuplicate ? similarityScore : null
      }
    });

  } catch (error) {
    console.error('Report issue error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to report issue'
    });
  }
});

/**
 * @route   GET /api/issues/my-issues
 * @desc    Get citizen's reported issues
 * @access  Private (Citizen)
 */
router.get('/my-issues', async (req, res) => {
  try {
    const userId = req.user?.id || req.query.userId;

    const { data: issues, error } = await supabase
      .from('issues')
      .select(`
        *,
        issue_updates(*)
      `)
      .eq('citizen_id', userId)
      .order('reported_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: { issues }
    });

  } catch (error) {
    console.error('Get issues error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch issues'
    });
  }
});

/**
 * @route   GET /api/issues/:id
 * @desc    Get single issue details
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: issue, error } = await supabase
      .from('issues')
      .select(`
        *,
        citizen:users!issues_citizen_id_fkey(id, full_name, email),
        assigned_admin:users!issues_assigned_to_fkey(id, full_name, email, department),
        issue_updates(
          *,
          user:users(id, full_name, role)
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }

    res.json({
      success: true,
      data: { issue }
    });

  } catch (error) {
    console.error('Get issue error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch issue'
    });
  }
});

/**
 * Helper function to calculate distance between two coordinates
 * Returns distance in kilometers
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * @route   GET /api/issues/admin/department
 * @desc    Get issues for admin's department
 * @access  Private (Admin)
 */
router.get('/admin/department', async (req, res) => {
  try {
    const { department } = req.query;
    const userId = req.user?.id || req.query.userId;

    if (!department) {
      return res.status(400).json({
        success: false,
        message: 'Department is required'
      });
    }

    const { data: issues, error } = await supabase
      .from('issues')
      .select(`
        *,
        citizen:users!issues_citizen_id_fkey(id, full_name, email, phone_number),
        assigned_admin:users!issues_assigned_to_fkey(id, full_name, email)
      `)
      .eq('department', department)
      .order('reported_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: { issues }
    });

  } catch (error) {
    console.error('Get department issues error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch issues'
    });
  }
});

/**
 * @route   GET /api/issues/all
 * @desc    Get all issues (super admin only)
 * @access  Private (Super Admin)
 */
router.get('/all', async (req, res) => {
  try {
    const { data: issues, error } = await supabase
      .from('issues')
      .select(`
        *,
        citizen:users!issues_citizen_id_fkey(id, full_name, email, phone_number),
        assigned_admin:users!issues_assigned_to_fkey(id, full_name, email)
      `)
      .order('reported_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: { issues }
    });

  } catch (error) {
    console.error('Get all issues error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch issues'
    });
  }
});

/**
 * @route   PATCH /api/issues/:id/status
 * @desc    Update issue status
 * @access  Private (Admin)
 */
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, comment } = req.body;
    const userId = req.user?.id || req.body.userId;

    const updateData = { status };
    
    if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data: issue, error } = await supabase
      .from('issues')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Log status update
    await supabase.from('issue_updates').insert({
      issue_id: id,
      user_id: userId,
      update_type: 'status_change',
      new_value: status,
      comment: comment || `Status updated to ${status}`
    });

    // Notify citizen about status change
    const statusMessages = {
      'assigned': 'Your issue has been assigned to an admin.',
      'in_progress': 'Work has started on your issue.',
      'resolved': 'Your issue has been resolved!',
      'rejected': 'Your issue has been reviewed and rejected.',
      'closed': 'Your issue has been closed.'
    };

    await supabase.from('notifications').insert({
      user_id: issue.citizen_id,
      title: `Issue ${status.replace('_', ' ').toUpperCase()}`,
      message: `${statusMessages[status]} Issue: "${issue.title}"`,
      type: 'status_update',
      related_issue_id: id
    });

    res.json({
      success: true,
      message: 'Issue status updated successfully',
      data: { issue }
    });

  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update issue status'
    });
  }
});

module.exports = router;


/**
 * @route   GET /api/issues/:id/updates
 * @desc    Get issue update history
 * @access  Public
 */
router.get('/:id/updates', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: updates, error } = await supabase
      .from('issue_updates')
      .select(`
        *,
        user:users(id, full_name, role)
      `)
      .eq('issue_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: { updates }
    });

  } catch (error) {
    console.error('Get issue updates error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch issue updates'
    });
  }
});

/**
 * @route   GET /api/issues/notifications/user/:userId
 * @desc    Get user notifications
 * @access  Private
 */
router.get('/notifications/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({
      success: true,
      data: { notifications }
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
});

/**
 * @route   PATCH /api/issues/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.patch('/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: notification, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data: { notification }
    });

  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
});
