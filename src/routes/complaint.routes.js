const express = require('express');
const { supabase } = require('../config/supabase');
const { authenticateToken, isAdmin } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');

const router = express.Router();

// Get all complaints (public)
router.get('/', async (req, res) => {
  try {
    const { category, status, severity, department_id } = req.query;
    
    let query = supabase
      .from('complaints')
      .select(`
        *,
        user:users(id, full_name, email, mobile),
        department:departments(id, department_name, short_name)
      `)
      .order('created_at', { ascending: false });

    if (category) query = query.eq('category', category);
    if (status) query = query.eq('status', status);
    if (severity) query = query.eq('severity', severity);
    if (department_id) query = query.eq('department_id', department_id);

    const { data, error } = await query;

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Get complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaints',
      error: error.message
    });
  }
});

// Get single complaint
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('complaints')
      .select(`
        *,
        user:users(id, full_name, email, mobile),
        department:departments(id, department_name, short_name),
        assigned_user:users!assigned_to(id, full_name, email)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaint',
      error: error.message
    });
  }
});

// Create complaint (authenticated citizens)
router.post('/', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { 
      latitude, 
      longitude, 
      address,
      category,
      severity,
      department_id,
      ai_description,
      user_description, // MANDATORY: 3-4 word problem description
      confidence,
      priority_score
    } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Image is required'
      });
    }

    // Validate mandatory user description (3-4 words minimum)
    if (!user_description || user_description.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a brief problem description (minimum 3-4 words)'
      });
    }

    const image_url = `/uploads/${req.file.filename}`;

    const { data, error } = await supabase
      .from('complaints')
      .insert({
        user_id: req.user.id,
        image_url,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        address,
        category,
        severity,
        department_id,
        ai_description,
        user_description,
        confidence: confidence ? parseFloat(confidence) : null,
        priority_score: priority_score ? parseFloat(priority_score) : null,
        status: 'submitted'
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully',
      data
    });
  } catch (error) {
    console.error('Create complaint error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create complaint',
      error: error.message
    });
  }
});

// Update complaint status (admin only)
router.patch('/:id/status', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, remarks } = req.body;

    // Get current complaint
    const { data: currentComplaint } = await supabase
      .from('complaints')
      .select('status')
      .eq('id', id)
      .single();

    // Update complaint
    const updateData = { status, updated_at: new Date().toISOString() };
    if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('complaints')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Log status change
    await supabase
      .from('status_logs')
      .insert({
        complaint_id: id,
        old_status: currentComplaint?.status,
        new_status: status,
        updated_by: req.user.id,
        remarks
      });

    res.json({
      success: true,
      message: 'Complaint status updated',
      data
    });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update status',
      error: error.message
    });
  }
});

// Get complaints by department (admin)
router.get('/department/:department_id', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { department_id } = req.params;

    const { data, error } = await supabase
      .from('complaints')
      .select(`
        *,
        user:users(id, full_name, email, mobile)
      `)
      .eq('department_id', department_id)
      .order('priority_score', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Get department complaints error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch complaints',
      error: error.message
    });
  }
});

module.exports = router;
