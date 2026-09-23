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
    // Get total complaints/issues from issues table
    const { data: issues, error: issuesError } = await supabase
      .from('issues')
      .select('status');

    if (issuesError) throw issuesError;

    // Calculate stats
    const stats = {
      total_complaints: issues?.length || 0,
      pending: issues?.filter(c => c.status === 'pending').length || 0,
      in_progress: issues?.filter(c => c.status === 'in_progress').length || 0,
      resolved: issues?.filter(c => c.status === 'resolved').length || 0,
      rejected: issues?.filter(c => c.status === 'rejected').length || 0
    };

    // Get user counts from users table
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('role');

    if (usersError) throw usersError;

    stats.total_admins = users?.filter(u => u.role === 'admin' || (u.role?.includes('admin') && u.role !== 'super_admin')).length || 0;
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
    const { data: issues, error } = await supabase
      .from('issues')
      .select('department, status');

    if (error) throw error;

    // Pre-populate all 4 core departments so all appear on the dashboard
    const deptStats = {
      Road: { total: 0, pending: 0, in_progress: 0, resolved: 0, rejected: 0 },
      Water: { total: 0, pending: 0, in_progress: 0, resolved: 0, rejected: 0 },
      Electricity: { total: 0, pending: 0, in_progress: 0, resolved: 0, rejected: 0 },
      Forest: { total: 0, pending: 0, in_progress: 0, resolved: 0, rejected: 0 }
    };

    // Group issues by department
    issues?.forEach(issue => {
      let deptName = 'Other';
      const rawDept = (issue.department || '').toLowerCase().trim();
      if (rawDept === 'road') deptName = 'Road';
      else if (rawDept === 'water') deptName = 'Water';
      else if (rawDept === 'electric' || rawDept === 'electricity') deptName = 'Electricity';
      else if (rawDept === 'forest') deptName = 'Forest';
      else if (rawDept) deptName = rawDept.charAt(0).toUpperCase() + rawDept.slice(1);

      if (!deptStats[deptName]) {
        deptStats[deptName] = { total: 0, pending: 0, in_progress: 0, resolved: 0, rejected: 0 };
      }
      deptStats[deptName].total++;
      if (issue.status === 'pending') deptStats[deptName].pending++;
      else if (issue.status === 'in_progress') deptStats[deptName].in_progress++;
      else if (issue.status === 'resolved') deptStats[deptName].resolved++;
      else if (issue.status === 'rejected') deptStats[deptName].rejected++;
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

// 14 Civic Issue Departments mapping
const CIVIC_DEPARTMENTS = [
  {
    key: 'road_pwd',
    name: 'Municipal Corporation / PWD',
    category: 'Roads & Potholes',
    icon: '🛣️',
    baseDepartment: 'road'
  },
  {
    key: 'streetlights',
    name: 'Municipal Corporation – Electrical Department',
    category: 'Streetlights',
    icon: '💡',
    baseDepartment: 'electric'
  },
  {
    key: 'water_supply',
    name: 'Municipal Water Supply Department',
    category: 'Water Supply',
    icon: '🚰',
    baseDepartment: 'water'
  },
  {
    key: 'drainage_sewerage',
    name: 'Municipal Corporation – Drainage Department',
    category: 'Drainage & Sewerage',
    icon: '🕳️',
    baseDepartment: 'water'
  },
  {
    key: 'solid_waste',
    name: 'Municipal Corporation – Solid Waste Management Department',
    category: 'Solid Waste / Garbage',
    icon: '🗑️',
    baseDepartment: 'road'
  },
  {
    key: 'trees_parks',
    name: 'Municipal Corporation – Garden / Tree Authority Department',
    category: 'Trees & Parks',
    icon: '🌳',
    baseDepartment: 'forest'
  },
  {
    key: 'traffic_safety',
    name: 'Traffic Police / Municipal Corporation',
    category: 'Traffic & Road Safety',
    icon: '🚦',
    baseDepartment: 'road'
  },
  {
    key: 'illegal_construction',
    name: 'Municipal Corporation – Encroachment / Town Planning Dept',
    category: 'Illegal Construction / Encroachment',
    icon: '🏗️',
    baseDepartment: 'road'
  },
  {
    key: 'health_sanitation',
    name: 'Municipal Corporation – Public Health Department',
    category: 'Public Health & Sanitation',
    icon: '🦟',
    baseDepartment: 'water'
  },
  {
    key: 'pollution_control',
    name: 'State Pollution Control Board (SPCB) / Municipal Corp',
    category: 'Air & Environmental Pollution',
    icon: '🌫️',
    baseDepartment: 'forest'
  },
  {
    key: 'flooding_disaster',
    name: 'Municipal Corporation / Disaster Management Cell',
    category: 'Flooding & Waterlogging',
    icon: '🌊',
    baseDepartment: 'water'
  },
  {
    key: 'stray_animals',
    name: 'Municipal Corporation – Veterinary Department',
    category: 'Stray Animals & Animal Nuisance',
    icon: '🐕',
    baseDepartment: 'forest'
  },
  {
    key: 'electricity_infra',
    name: 'State Electricity Board (MSEDCL / Electricity Dist.)',
    category: 'Electricity Infrastructure',
    icon: '⚡',
    baseDepartment: 'electric'
  },
  {
    key: 'fire_emergency',
    name: 'Municipal Fire & Emergency Services',
    category: 'Fire & Emergency Safety',
    icon: '🔥',
    baseDepartment: 'road'
  }
];

const findCivicDept = (input) => {
  if (!input) return null;
  const lower = String(input).toLowerCase().trim();
  let found = CIVIC_DEPARTMENTS.find(d => d.key.toLowerCase() === lower);
  if (found) return found;
  found = CIVIC_DEPARTMENTS.find(d => d.name.toLowerCase() === lower || d.category.toLowerCase() === lower);
  if (found) return found;
  if (lower === 'road') return CIVIC_DEPARTMENTS.find(d => d.key === 'road_pwd');
  if (lower === 'water') return CIVIC_DEPARTMENTS.find(d => d.key === 'water_supply');
  if (lower === 'electric' || lower === 'electricity') return CIVIC_DEPARTMENTS.find(d => d.key === 'electricity_infra');
  if (lower === 'forest') return CIVIC_DEPARTMENTS.find(d => d.key === 'trees_parks');
  found = CIVIC_DEPARTMENTS.find(d => d.baseDepartment === lower);
  return found || null;
};

// Get list of all supported civic departments
router.get('/departments', authenticateToken, isSuperAdmin, async (req, res) => {
  res.json({
    success: true,
    data: CIVIC_DEPARTMENTS
  });
});

// Get all department admins
router.get('/admins', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email, phone_number, role, department, avatar_url, is_active, created_at')
      .eq('role', 'admin')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Normalize department display with civic metadata
    const adminsWithDept = data?.map(admin => {
      let dept = admin.department || '';
      if (dept === 'electric') dept = 'electricity';

      let meta = null;
      if (admin.avatar_url && typeof admin.avatar_url === 'string' && admin.avatar_url.trim().startsWith('{')) {
        try {
          meta = JSON.parse(admin.avatar_url);
        } catch (e) {
          meta = null;
        }
      }

      if (meta && meta.dept_key) {
        return {
          ...admin,
          department: dept,
          dept_key: meta.dept_key,
          department_display: meta.dept_name,
          civic_category: meta.category,
          icon: meta.icon
        };
      }

      const deptInfo = findCivicDept(admin.department) || findCivicDept(dept);
      return {
        ...admin,
        department: dept || (admin.role ? admin.role.replace('_admin', '') : 'general'),
        dept_key: deptInfo ? deptInfo.key : dept,
        department_display: deptInfo ? deptInfo.name : (dept.charAt(0).toUpperCase() + dept.slice(1) + ' Department'),
        civic_category: deptInfo ? deptInfo.category : 'Civic Administration',
        icon: deptInfo ? deptInfo.icon : '🏛️'
      };
    });

    res.json({
      success: true,
      data: adminsWithDept || []
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
      const cleanPhone = phone_number.replace(/^\+91-?/, '').trim();
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(cleanPhone) && !/^\d{10}$/.test(cleanPhone)) {
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

    // Match department from CIVIC_DEPARTMENTS or legacy
    const deptInfo = findCivicDept(department);
    if (!deptInfo) {
      return res.status(400).json({
        success: false,
        message: 'Invalid department selected'
      });
    }

    // Base enum value for PostgreSQL ('road', 'electric', 'water', 'forest')
    const normalizedDept = deptInfo.baseDepartment;
    const deptMeta = JSON.stringify({
      dept_key: deptInfo.key,
      dept_name: deptInfo.name,
      category: deptInfo.category,
      icon: deptInfo.icon
    });

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

    // Create admin in users table with role 'admin'
    const { data, error } = await supabase
      .from('users')
      .insert({
        full_name: full_name.trim(),
        email: email.toLowerCase().trim(),
        phone_number: phone_number || null,
        password_hash,
        role: 'admin',
        department: normalizedDept,
        avatar_url: deptMeta,
        is_active: true
      })
      .select('id, full_name, email, phone_number, role, department, is_active, created_at')
      .single();

    if (error) throw error;

    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: {
        ...data,
        department: normalizedDept === 'electric' ? 'electricity' : normalizedDept,
        dept_key: deptInfo.key,
        department_display: deptInfo.name,
        civic_category: deptInfo.category,
        icon: deptInfo.icon
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
      const cleanPhone = phone_number.replace(/^\+91-?/, '').trim();
      if (!/^[6-9]\d{9}$/.test(cleanPhone) && !/^\d{10}$/.test(cleanPhone)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid phone number. Must be 10 digits starting with 6-9'
        });
      }
    }

    let normalizedDept = undefined;
    let deptMeta = undefined;
    let deptInfo = null;
    if (department) {
      deptInfo = findCivicDept(department);
      if (!deptInfo) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department selected'
        });
      }
      normalizedDept = deptInfo.baseDepartment;
      deptMeta = JSON.stringify({
        dept_key: deptInfo.key,
        dept_name: deptInfo.name,
        category: deptInfo.category,
        icon: deptInfo.icon
      });
    }

    const updateData = {
      ...(full_name && { full_name: full_name.trim() }),
      ...(email && { email: email.toLowerCase().trim() }),
      ...(phone_number !== undefined && { phone_number }),
      ...(normalizedDept && { department: normalizedDept }),
      ...(deptMeta && { avatar_url: deptMeta }),
      ...(is_active !== undefined && { is_active })
    };

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', id)
      .select('id, full_name, email, phone_number, role, department, is_active, created_at')
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Admin updated successfully',
      data: {
        ...data,
        department: data.department === 'electric' ? 'electricity' : data.department,
        ...(deptInfo && {
          dept_key: deptInfo.key,
          department_display: deptInfo.name,
          civic_category: deptInfo.category,
          icon: deptInfo.icon
        })
      }
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

// Get all complaints (citizen reported issues) with filters
router.get('/complaints', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { status, department } = req.query;

    let query = supabase
      .from('issues')
      .select(`
        *,
        citizen:users!citizen_id(id, full_name, email, phone_number),
        issue_updates(*)
      `)
      .order('created_at', { ascending: false });

    if (status && status !== 'all' && status !== '') {
      query = query.eq('status', status);
    }

    if (department && department !== 'all' && department !== '') {
      const deptNormalized = (department.toLowerCase() === 'electricity' || department.toLowerCase() === 'electric') 
        ? 'electric' 
        : department.toLowerCase();
      query = query.eq('department', deptNormalized);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Map issues to complaint structure expected by frontend
    const complaints = (data || []).map(issue => {
      const deptDisplay = issue.department === 'electric'
        ? 'Electricity'
        : (issue.department ? issue.department.charAt(0).toUpperCase() + issue.department.slice(1) : 'General');

      let resolvedImage = null;
      if (issue.issue_updates && Array.isArray(issue.issue_updates)) {
        for (const update of issue.issue_updates) {
          if (update.comment && update.comment.includes('[PROOF_IMAGE:')) {
            const match = update.comment.match(/\[PROOF_IMAGE:(.*?)\]/);
            if (match && match[1]) {
              resolvedImage = match[1].trim();
              break;
            }
          }
        }
      }
      if (!resolvedImage && (issue.status === 'resolved' || issue.resolved_at) && Array.isArray(issue.images) && issue.images.length > 1) {
        resolvedImage = issue.images[issue.images.length - 1];
      }

      return {
        ...issue,
        category: issue.title || issue.category || 'General Issue',
        reported_image: issue.images?.[0] || null,
        resolved_image: resolvedImage,
        user: issue.citizen ? {
          id: issue.citizen.id,
          full_name: issue.citizen.full_name,
          email: issue.citizen.email,
          phone_number: issue.citizen.phone_number
        } : { full_name: 'Anonymous Citizen', email: 'N/A' },
        department: {
          id: issue.department,
          department_name: deptDisplay
        },
        department_name: deptDisplay
      };
    });

    res.json({
      success: true,
      data: complaints
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
