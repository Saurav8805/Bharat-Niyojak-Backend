const express = require('express');
const { supabase } = require('../config/supabase');
const { authenticateToken, isSuperAdmin } = require('../middleware/auth.middleware');

const router = express.Router();

// Get all users (super admin only)
router.get('/', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, mobile, role, is_active, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

// Get user profile
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Users can only view their own profile unless they're super admin
    if (req.user.id !== id && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, mobile, role, is_active, created_at')
      .eq('id', id)
      .single();

    if (error) throw error;

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user',
      error: error.message
    });
  }
});

// Update user (super admin only)
router.patch('/:id', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, mobile, role, is_active } = req.body;

    const updateData = {};
    if (full_name) updateData.full_name = full_name;
    if (email) updateData.email = email;
    if (mobile) updateData.mobile = mobile;
    if (role) updateData.role = role;
    if (typeof is_active === 'boolean') updateData.is_active = is_active;

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select('id, full_name, email, mobile, role, is_active, created_at')
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'User updated successfully',
      data
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
});

module.exports = router;
