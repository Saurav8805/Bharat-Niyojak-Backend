const express = require('express');
const bcrypt = require('bcryptjs');
const { supabase } = require('../config/supabase');
const { authenticateToken } = require('../middleware/auth.middleware');

const router = express.Router();

// Middleware to check if user is super admin
const isSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Super admin only.'
    });
  }
  next();
};

// Get dashboard statistics
router.get('/stats', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    // Get total complaints
    const { data: complaints, error: complaintsError } = await supabase
      .from('complaints')
      .select('status');

    if (complaintsError) throw complaintsError;

    // Calculate stats
    const stats = {
      total_complaints: complaints?.length || 0,
      pending: complaints?.filter(c => c.status === 'pending').length || 0,
      in_progress: complaints?.filter(c => c.status === 'in_progress').length || 0,
      resolved: complaints?.filter(c => c.status === 'resolved').length || 0,
      rejected: complaints?.filter(c => c.status === 'rejected').length || 0
    };

    // Get user counts
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('role');

    if (usersError) throw usersError;

    stats.total_admins = users?.filter(u => u.role.includes('admin') && u.role !== 'super_admin').length || 0;
    stats.total_citizens = users?.filter(u => u.role === 'citizen').length || 0;

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

// Get department-wise statistics
router.get('/department-stats', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { data: complaints, error } = await supabase
      .from('complaints')
      .select('department_id, status, departments(department_name)');

    if (error) throw error;

    // Group by department
    const deptStats = {};
    complaints?.forEach(complaint => {
      const deptName = complaint.departments?.department_name || 'Unknown';
      if (!deptStats[deptName]) {
        deptStats[deptName] = { total: 0, pending: 0, resolved: 0, in_progress: 0 };
      }
      deptStats[deptName].total++;
      if (complaint.status === 'pending') deptStats[deptName].pending++;
      if (complaint.status === 'resolved') deptStats[deptName].resolved++;
      if (complaint.status === 'in_progress') deptStats[deptName].in_progress++;
    });

    res.json({
      success: true,
      data: deptStats
    });
  } catch (error) {
    console.error('Get department stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch department statistics',
      error: error.message
    });
  }
});

// Get all admins
router.get('/admins', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, phone_number, role, is_active, created_at')
      .in('role', ['road_admin', 'water_admin', 'electricity_admin', 'forest_admin'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Add department field based on role
    const adminsWithDept = data?.map(admin => ({
      ...admin,
      department: admin.role.replace('_admin', '')
    }));

    res.json({
      success: true,
      data: adminsWithDept
    });
  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admins',
      error: error.message
    });
  }
});

// Create new admin
router.post('/admins', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { full_name, email, phone_number, department, password } = req.body;

    // Validate required fields
    if (!full_name || !email || !department || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, department, and password are required'
      });
    }

    // Validate full name (min 3 characters)
    if (full_name.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Full name must be at least 3 characters'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email format'
      });
    }

    // Validate phone number (10 digits, starting with 6-9)
    if (phone_number) {
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(phone_number)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid phone number. Must be 10 digits starting with 6-9'
        });
      }
    }

    // Validate password (min 6 characters)
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    // Validate department
    const validDepartments = ['road', 'water', 'electricity', 'forest'];
    if (!validDepartments.includes(department)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid department. Must be one of: road, water, electricity, forest'
      });
    }

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Determine role based on department
    const role = `${department}_admin`;

    // Create admin
    const { data, error } = await supabase
      .from('users')
      .insert({
        full_name,
        email,
        phone_number,
        password_hash,
        role,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: {
        ...data,
        department
      }
    });
  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create admin',
      error: error.message
    });
  }
});

// Update admin
router.put('/admins/:id', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, phone_number, department, is_active } = req.body;

    // Validate full name if provided
    if (full_name && full_name.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Full name must be at least 3 characters'
      });
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid email format'
        });
      }

      // Check if email already exists (excluding current user)
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .neq('id', id)
        .single();

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }
    }

    // Validate phone number if provided
    if (phone_number) {
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(phone_number)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid phone number. Must be 10 digits starting with 6-9'
        });
      }
    }

    // Validate department if provided
    if (department) {
      const validDepartments = ['road', 'water', 'electricity', 'forest'];
      if (!validDepartments.includes(department)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department. Must be one of: road, water, electricity, forest'
        });
      }
    }

    const role = department ? `${department}_admin` : undefined;

    const updateData = {
      ...(full_name && { full_name }),
      ...(email && { email }),
      ...(phone_number !== undefined && { phone_number }),
      ...(role && { role }),
      ...(is_active !== undefined && { is_active })
    };

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Admin updated successfully',
      data
    });
  } catch (error) {
    console.error('Update admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update admin',
      error: error.message
    });
  }
});

// Delete admin
router.delete('/admins/:id', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({
      success: true,
      message: 'Admin deleted successfully'
    });
  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete admin',
      error: error.message
    });
  }
});

// Get all complaints with filters
router.get('/complaints', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { status, department } = req.query;

    let query = supabase
      .from('complaints')
      .select(`
        *,
        user:users(id, full_name, email),
        department:departments(id, department_name)
      `)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (department) query = query.eq('department_id', department);

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

module.exports = router;
