const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

/**
 * @route   GET /api/admin/stats
 * @desc    Get system-wide statistics
 * @access  Private (Super Admin)
 */
router.get('/stats', async (req, res) => {
  try {
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, role');

    const { data: issues, error: issuesError } = await supabase
      .from('issues')
      .select('id, status');

    if (usersError || issuesError) {
      throw usersError || issuesError;
    }

    const stats = {
      total_users: users?.length || 0,
      total_citizens: users?.filter(u => u.role === 'citizen').length || 0,
      total_admins: users?.filter(u => u.role === 'admin').length || 0,
      total_issues: issues?.length || 0,
      pending_issues: issues?.filter(i => i.status === 'pending').length || 0,
      resolved_issues: issues?.filter(i => i.status === 'resolved').length || 0
    };

    res.json({
      success: true,
      data: { stats }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

/**
 * @route   GET /api/users/all
 * @desc    Get all users
 * @access  Private (Super Admin)
 */
router.get('/users/all', async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: { users }
    });

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

/**
 * @route   PATCH /api/users/:id/role
 * @desc    Update user role
 * @access  Private (Super Admin)
 */
router.patch('/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role, department } = req.body;

    const updateData = { role };
    if (role === 'admin' && department) {
      updateData.department = department;
    } else if (role !== 'admin') {
      updateData.department = null;
    }

    const { data: user, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'User role updated successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user role'
    });
  }
});

/**
 * @route   PATCH /api/users/:id/status
 * @desc    Toggle user active status
 * @access  Private (Super Admin)
 */
router.patch('/users/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const { data: user, error } = await supabase
      .from('users')
      .update({ is_active })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'User status updated successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
});

/**
 * @route   GET /api/departments
 * @desc    Get all departments
 * @access  Public
 */
router.get('/departments', async (req, res) => {
  try {
    const { data: departments, error } = await supabase
      .from('departments')
      .select('*')
      .order('name');

    if (error) throw error;

    res.json({
      success: true,
      data: { departments }
    });

  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch departments'
    });
  }
});

/**
 * @route   PATCH /api/departments/:id/status
 * @desc    Toggle department active status
 * @access  Private (Super Admin)
 */
router.patch('/departments/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const { data: department, error } = await supabase
      .from('departments')
      .update({ is_active })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Department status updated successfully',
      data: { department }
    });

  } catch (error) {
    console.error('Update department status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update department status'
    });
  }
});

/**
 * @route   POST /api/departments
 * @desc    Create new department
 * @access  Private (Super Admin)
 */
router.post('/departments', async (req, res) => {
  try {
    const { name, display_name, description } = req.body;

    const { data: department, error } = await supabase
      .from('departments')
      .insert({
        name,
        display_name,
        description,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: { department }
    });

  } catch (error) {
    console.error('Create department error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create department'
    });
  }
});

/**
 * @route   DELETE /api/departments/:id
 * @desc    Delete department
 * @access  Private (Super Admin)
 */
router.delete('/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if department has any assigned admins or issues
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .eq('department', id)
      .eq('role', 'admin');

    if (admins && admins.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete department with assigned admins. Reassign admins first.'
      });
    }

    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Department deleted successfully'
    });

  } catch (error) {
    console.error('Delete department error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete department'
    });
  }
});

module.exports = router;
