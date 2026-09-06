const express = require('express');
const router = express.Router();
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth.middleware');

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
router.post('/report', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { description, latitude, longitude, address } = req.body;
    const userId = req.user?.id || req.body.userId; // From auth middleware

    console.log('=== Report Issue Request ===');
    console.log('User ID:', userId);
    console.log('Description:', description?.substring(0, 50));
    console.log('Location:', { latitude, longitude });
    console.log('Has image:', !!req.file);

    // Validation
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

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
    console.log('Uploading image to Supabase...');
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
        message: 'Failed to upload image: ' + uploadError.message
      });
    }

    console.log('Image uploaded successfully:', fileName);

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('issue-images')
      .getPublicUrl(fileName);

    // AI Analysis using Gemini Vision (REQUIRED - with automatic fallback)
    let aiAnalysis;
    console.log('Starting AI analysis with Gemini...');
    console.log('API Key exists:', !!process.env.GEMINI_API_KEY);
    
    // Try multiple models in order of preference
    const modelsToTry = [
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-3.8-flash',
      'gemini-3.5-flash'
    ];
    
    let lastError = null;
    let modelUsed = null;
    
    for (const modelName of modelsToTry) {
      try {
        console.log(`Trying model: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
      
      const imageBase64 = req.file.buffer.toString('base64');
      
      const prompt = `You are an AI assistant for a civic issue reporting system in India. Analyze this image carefully and classify it into the correct department.

CRITICAL: You MUST choose the correct department from: electric, road, water, forest

Common department classifications:
- ELECTRIC: Power lines, transformers, street lights, electrical poles, wire issues, power outages
- ROAD: Potholes, road damage, traffic signs, road construction, blocked roads, broken pavements
- WATER: Water leaks, drainage issues, sewage problems, pipe bursts, water supply issues, flooding
- FOREST: Tree-related issues, forest fires, illegal logging, wildlife problems, park maintenance

User's description: "${description}"
Location: ${address || `${latitude}, ${longitude}`}

Analyze the image and user description to determine:
1. A detailed description of the problem (2-3 sentences)
2. The severity level (low, medium, high, critical)
3. The CORRECT department (electric, road, water, or forest) - BE VERY CAREFUL HERE
4. Estimated category/type of issue

IMPORTANT: If the image shows water-related issues (pipes, leaks, drainage, sewage), choose "water" department, NOT road!
If the image shows electrical issues (wires, poles, transformers), choose "electric" department!

Response format (JSON only, no markdown):
{
  "detailed_description": "string",
  "severity": "low|medium|high|critical",
  "department": "electric|road|water|forest",
  "category": "string",
  "confidence": 0.0-1.0
}`;

        const result = await model.generateContent([
          prompt,
          {
            inlineData: {
              mimeType: req.file.mimetype,
              data: imageBase64
            }
          }
        ]);

        const response = result.response;
        const aiText = response.text();
        
        console.log('AI Raw Response:', aiText);
        
        // Parse AI response
        let jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          const codeBlockMatch = aiText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
          if (codeBlockMatch) {
            jsonMatch = [codeBlockMatch[1]];
          } else {
            throw new Error('No JSON found in AI response');
          }
        }
        
        aiAnalysis = JSON.parse(jsonMatch[0]);
        
        // Validate department
        const validDepartments = ['electric', 'road', 'water', 'forest'];
        if (!validDepartments.includes(aiAnalysis.department)) {
          throw new Error(`Invalid department: ${aiAnalysis.department}`);
        }
        
        modelUsed = modelName;
        console.log(`✓ AI Analysis successful with ${modelName}:`, aiAnalysis);
        break; // Success! Exit the loop
        
      } catch (modelError) {
        console.error(`✗ Model ${modelName} failed:`, modelError.message);
        lastError = modelError;
        
        // If it's a 503 (service unavailable), try next model
        // If it's other errors, also try next model
        continue;
      }
    }
    
    // If all models failed
    if (!aiAnalysis) {
      console.error('❌ All AI models failed - BLOCKING ISSUE SUBMISSION');
      console.error('Last error:', lastError?.message);
      
      return res.status(503).json({
        success: false,
        message: 'AI service is temporarily unavailable. Please try again in a few moments.',
        error: lastError?.message,
        details: 'All AI models are currently experiencing high demand. Please wait a moment and try again.'
      });
    }

    // Check for duplicate issues with AI-powered image and text comparison
    console.log('Checking for duplicate issues...');
    const { data: recentIssues } = await supabase
      .from('issues')
      .select('id, latitude, longitude, images, description, ai_description, department, reported_at')
      .gte('reported_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
      .eq('department', aiAnalysis.department) // Same department only
      .limit(50); // Limit to 50 most recent

    let isDuplicate = false;
    let duplicateIssueId = null;
    let similarityScore = 0;

    if (recentIssues && recentIssues.length > 0) {
      console.log(`Found ${recentIssues.length} recent issues in ${aiAnalysis.department} department`);
      
      // Get the model that worked for AI analysis
      const workingModel = genAI.getGenerativeModel({ model: modelUsed || 'gemini-flash-latest' });
      
      for (const issue of recentIssues) {
        // Calculate distance
        const distance = calculateDistance(
          parseFloat(latitude),
          parseFloat(longitude),
          issue.latitude,
          issue.longitude
        );
        
        // Only check issues within 500 meters (0.5 km)
        if (distance < 0.5) {
          console.log(`Checking issue ${issue.id} - Distance: ${(distance * 1000).toFixed(0)}m`);
          
          try {
            // Enhanced AI-powered duplicate detection with IMAGE comparison
            let comparisonPrompt = `You are analyzing whether two civic issue reports are duplicates.

NEW ISSUE:
- Description: ${aiAnalysis.detailed_description}
- User said: "${description}"
- Location: ${address || `${latitude}, ${longitude}`}
- Distance from existing issue: ${(distance * 1000).toFixed(0)} meters
- Department: ${aiAnalysis.department}

EXISTING ISSUE (reported ${Math.floor((Date.now() - new Date(issue.reported_at).getTime()) / (1000 * 60 * 60))} hours ago):
- Description: ${issue.ai_description || issue.description}
- Department: ${issue.department}

IMPORTANT: Look at BOTH images carefully. Compare:
1. Visual similarity - Are they showing the SAME physical location/problem?
2. Problem type - Same type of damage/issue?
3. Physical proximity - Only ${(distance * 1000).toFixed(0)} meters apart
4. Time - ${Math.floor((Date.now() - new Date(issue.reported_at).getTime()) / (1000 * 60 * 60))} hours between reports

If the images show the SAME location and SAME problem, mark as duplicate even if descriptions differ slightly.

Respond with JSON only:
{
  "is_duplicate": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation focusing on image comparison"
}`;

            // Prepare images for comparison
            const comparisonContent = [comparisonPrompt];
            
            // Add new issue image
            comparisonContent.push({
              inlineData: {
                mimeType: req.file.mimetype,
                data: imageBase64
              }
            });
            
            // Add existing issue image if available
            if (issue.images && issue.images.length > 0) {
              try {
                // Fetch the existing issue image
                const existingImageUrl = issue.images[0];
                const imageResponse = await fetch(existingImageUrl);
                const imageBuffer = await imageResponse.arrayBuffer();
                const existingImageBase64 = Buffer.from(imageBuffer).toString('base64');
                
                comparisonContent.push({
                  inlineData: {
                    mimeType: 'image/jpeg', // Assume JPEG, adjust if needed
                    data: existingImageBase64
                  }
                });
                
                console.log('Comparing with existing issue image...');
              } catch (imgError) {
                console.error('Error fetching existing image:', imgError.message);
                // Continue without image comparison
              }
            }

            const similarityResult = await workingModel.generateContent(comparisonContent);
            const similarityResponse = await similarityResult.response;
            const similarityText = similarityResponse.text();
            
            const jsonMatch = similarityText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const similarityJson = JSON.parse(jsonMatch[0]);
              
              console.log(`Similarity check: ${similarityJson.is_duplicate ? 'DUPLICATE' : 'Different'} (${Math.round(similarityJson.confidence * 100)}% confidence) - ${similarityJson.reason}`);
              
              // Mark as duplicate if confidence > 70%
              if (similarityJson.is_duplicate && similarityJson.confidence > 0.7) {
                isDuplicate = true;
                duplicateIssueId = issue.id;
                similarityScore = similarityJson.confidence;
                console.log(`✓ Duplicate detected! Issue ID: ${issue.id}`);
                break;
              }
            }
          } catch (e) {
            console.error('AI similarity check error:', e.message);
            // Fallback to distance-only check for very close issues
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
        title: isDuplicate ? '⚠️ Duplicate Issue Detected' : 'New Issue Reported',
        message: isDuplicate 
          ? `A potential duplicate issue has been reported in your department: ${issue.title}. Similarity: ${Math.round(similarityScore * 100)}%. Please review both issues.`
          : `A new ${aiAnalysis.severity} priority issue has been reported in your department: ${issue.title}`,
        type: isDuplicate ? 'duplicate_issue' : 'new_issue',
        related_issue_id: issue.id
      }));

      await supabase.from('notifications').insert(notifications);
      console.log(`✓ Notified ${departmentAdmins.length} admin(s) - Duplicate: ${isDuplicate}`);
    }

    // Notify citizen of successful submission
    await supabase.from('notifications').insert({
      user_id: userId,
      title: isDuplicate ? '⚠️ Possible Duplicate Detected' : 'Issue Reported Successfully',
      message: isDuplicate
        ? `Your issue "${issue.title}" has been reported. Note: A similar issue was reported recently. Admins will review both reports.`
        : `Your issue "${issue.title}" has been reported and assigned to the ${aiAnalysis.department} department.`,
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
router.get('/my-issues', authenticateToken, async (req, res) => {
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

/**
 * @route   PUT /api/issues/:id
 * @desc    Update citizen's own issue (only if pending status)
 * @access  Private (Citizen)
 */
router.put('/:id', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { description, latitude, longitude, address } = req.body;

    // Check if issue exists and belongs to the user
    const { data: existingIssue, error: fetchError } = await supabase
      .from('issues')
      .select('*')
      .eq('id', id)
      .eq('citizen_id', userId)
      .single();

    if (fetchError || !existingIssue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found or you do not have permission to update it'
      });
    }

    // Only allow editing if status is pending
    if (existingIssue.status !== 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Cannot edit issue that is already being processed. Only pending issues can be edited.'
      });
    }

    const updateData = {};
    
    if (description) updateData.description = description;
    if (latitude) updateData.latitude = parseFloat(latitude);
    if (longitude) updateData.longitude = parseFloat(longitude);
    if (address) updateData.address = address;

    // Handle new image upload
    if (req.file) {
      const fileName = `${Date.now()}-${req.file.originalname}`;
      const { error: uploadError } = await supabase.storage
        .from('issue-images')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (uploadError) {
        console.error('Image upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload new image'
        });
      }

      const { data: { publicUrl } } = supabase.storage
        .from('issue-images')
        .getPublicUrl(fileName);

      updateData.images = [publicUrl];
    }

    // Update issue
    const { data: updatedIssue, error: updateError } = await supabase
      .from('issues')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update issue'
      });
    }

    // Log the update
    await supabase.from('issue_updates').insert({
      issue_id: id,
      user_id: userId,
      update_type: 'updated',
      comment: 'Issue details updated by citizen'
    });

    res.json({
      success: true,
      message: 'Issue updated successfully',
      data: { issue: updatedIssue }
    });

  } catch (error) {
    console.error('Update issue error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update issue'
    });
  }
});

/**
 * @route   DELETE /api/issues/:id
 * @desc    Delete citizen's own issue (only if pending status)
 * @access  Private (Citizen)
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    console.log('=== Delete Issue Request ===');
    console.log('Issue ID:', id);
    console.log('User ID:', userId);

    // Check if issue exists and belongs to the user
    const { data: existingIssue, error: fetchError } = await supabase
      .from('issues')
      .select('*')
      .eq('id', id)
      .eq('citizen_id', userId)
      .single();

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      return res.status(404).json({
        success: false,
        message: 'Issue not found or you do not have permission to delete it',
        error: fetchError.message
      });
    }

    if (!existingIssue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found or you do not have permission to delete it'
      });
    }

    console.log('Found issue:', { id: existingIssue.id, status: existingIssue.status });

    // Only allow deleting if status is pending
    if (existingIssue.status !== 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Cannot delete issue that is already being processed. Only pending issues can be deleted.'
      });
    }

    // Delete related notifications first
    console.log('Deleting related notifications...');
    const { error: notifDeleteError } = await supabase
      .from('notifications')
      .delete()
      .eq('related_issue_id', id);

    if (notifDeleteError) {
      console.error('Notification delete error:', notifDeleteError);
      // Continue anyway - not critical
    }

    // Delete issue updates
    console.log('Deleting issue updates...');
    const { error: updatesDeleteError } = await supabase
      .from('issue_updates')
      .delete()
      .eq('issue_id', id);

    if (updatesDeleteError) {
      console.error('Updates delete error:', updatesDeleteError);
      // Continue anyway - not critical
    }

    // Delete the issue
    console.log('Deleting issue...');
    const { error: deleteError } = await supabase
      .from('issues')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete issue: ' + deleteError.message,
        error: deleteError
      });
    }

    // Optional: Delete images from storage
    if (existingIssue.images && existingIssue.images.length > 0) {
      console.log('Deleting images from storage...');
      for (const imageUrl of existingIssue.images) {
        try {
          const fileName = imageUrl.split('/').pop();
          await supabase.storage
            .from('issue-images')
            .remove([fileName]);
        } catch (imgError) {
          console.error('Image delete error:', imgError);
          // Continue anyway - not critical
        }
      }
    }

    console.log('✓ Issue deleted successfully');
    res.json({
      success: true,
      message: 'Issue deleted successfully'
    });

  } catch (error) {
    console.error('Delete issue error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete issue',
      error: error.toString()
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
