-- Bharat Niyojak Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User Roles ENUM
CREATE TYPE user_role AS ENUM ('citizen', 'road_admin', 'water_admin', 'electricity_admin', 'forest_admin', 'super_admin');

-- Issue Category ENUM
CREATE TYPE issue_category AS ENUM (
  'pothole', 
  'damaged_road', 
  'garbage', 
  'overflowing_bin', 
  'streetlight', 
  'water_leakage', 
  'water_pipeline', 
  'fallen_tree', 
  'drainage', 
  'open_manhole', 
  'damaged_garden', 
  'traffic_infrastructure',
  'other'
);

-- Severity ENUM
CREATE TYPE severity_level AS ENUM ('low', 'medium', 'high', 'critical');

-- Complaint Status ENUM
CREATE TYPE complaint_status AS ENUM ('submitted', 'assigned', 'in_progress', 'resolved', 'rejected');

-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  mobile VARCHAR(15) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'citizen',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Departments Table
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_name VARCHAR(255) NOT NULL UNIQUE,
  short_name VARCHAR(50) NOT NULL,
  description TEXT,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(15),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert Default Departments
INSERT INTO departments (department_name, short_name, description, contact_email, contact_phone) VALUES
('Public Works Department', 'PWD', 'Responsible for roads, potholes, and infrastructure', 'pwd@bharatniyojak.in', '1234567890'),
('Water Supply Department', 'WSD', 'Responsible for water supply, leakage, and pipelines', 'water@bharatniyojak.in', '1234567891'),
('Electrical Department', 'ED', 'Responsible for streetlights and electrical infrastructure', 'electric@bharatniyojak.in', '1234567892'),
('Forest Department', 'FD', 'Responsible for trees, gardens, and green spaces', 'forest@bharatniyojak.in', '1234567893'),
('Solid Waste Management', 'SWM', 'Responsible for garbage and waste disposal', 'waste@bharatniyojak.in', '1234567894'),
('Drainage Department', 'DD', 'Responsible for drainage and sewerage', 'drainage@bharatniyojak.in', '1234567895');

-- Complaints Table
CREATE TABLE complaints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  address TEXT,
  category issue_category NOT NULL,
  severity severity_level NOT NULL,
  department_id UUID REFERENCES departments(id),
  ai_description TEXT,
  user_description VARCHAR(100) NOT NULL, -- Mandatory 3-4 word problem description by user
  confidence DECIMAL(5, 2),
  priority_score DECIMAL(5, 2),
  status complaint_status DEFAULT 'submitted',
  assigned_to UUID REFERENCES users(id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Status Logs Table
CREATE TABLE status_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE,
  old_status complaint_status,
  new_status complaint_status NOT NULL,
  updated_by UUID REFERENCES users(id),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Complaint Support (Citizens supporting existing complaints)
CREATE TABLE complaint_support (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(complaint_id, user_id)
);

-- Notifications Table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  complaint_id UUID REFERENCES complaints(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes
CREATE INDEX idx_complaints_user ON complaints(user_id);
CREATE INDEX idx_complaints_department ON complaints(department_id);
CREATE INDEX idx_complaints_status ON complaints(status);
CREATE INDEX idx_complaints_location ON complaints(latitude, longitude);
CREATE INDEX idx_complaints_created ON complaints(created_at);
CREATE INDEX idx_status_logs_complaint ON status_logs(complaint_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to users table
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to complaints table
CREATE TRIGGER update_complaints_updated_at
BEFORE UPDATE ON complaints
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view their own data" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own data" ON users
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for complaints table
CREATE POLICY "Anyone can view complaints" ON complaints
  FOR SELECT USING (true);

CREATE POLICY "Citizens can insert complaints" ON complaints
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update complaints" ON complaints
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('road_admin', 'water_admin', 'electricity_admin', 'forest_admin', 'super_admin')
    )
  );

-- RLS Policies for status_logs
CREATE POLICY "Anyone can view status logs" ON status_logs
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert status logs" ON status_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role IN ('road_admin', 'water_admin', 'electricity_admin', 'forest_admin', 'super_admin')
    )
  );

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);
