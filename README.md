# Bharat Niyojak

## AI-Powered Civic Issue Reporting, Routing and Resolution System

**Tagline**: "One Photo. One Click. The Right Authority."

---

## 🚀 Features

- **AI-Powered Issue Detection**: Upload a photo and let AI identify the issue category, severity, and responsible department
- **Role-Based Access Control**: 
  - Citizens
  - Department Admins (Road, Water, Electricity, Forest)
  - Super Admin
- **Smart Department Routing**: Automatically route complaints to the correct department
- **GIS Mapping**: Interactive map showing all civic issues with location-based filtering
- **Real-time Status Tracking**: Track complaint status from submission to resolution
- **Duplicate Detection**: AI identifies similar complaints to reduce redundancy
- **Priority Scoring**: Intelligent prioritization based on severity and community support
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices

---

## 🛠️ Technology Stack

### Frontend
- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **React Leaflet** - Interactive maps

### Backend
- **Supabase** - Database and authentication
- **PostgreSQL** - Relational database
- **Node.js** - Server runtime

### AI & APIs
- **Google Gemini Vision API** - AI image analysis
- **Google Maps API** - Geolocation services

---

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js** 18+ installed
- **npm** or **yarn** package manager
- **Supabase** account (free tier available)
- **Google Cloud** account for API keys

---

## 🔧 Installation

### 1. Navigate to Project

```bash
cd "D:\Bharat Niyojak"
```

### 2. Setup Backend

```bash
cd Backend
npm install
```

Create `.env` file in Backend folder:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Google Gemini AI API
GEMINI_API_KEY=your_gemini_api_key

# JWT Secret (generate a random string)
JWT_SECRET=your_random_secret_key_minimum_32_characters

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

### 3. Setup Frontend

```bash
cd ../Frontend
npm install
```

Create `.env.local` file in Frontend folder:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Google Maps API
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key

# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### 4. Database Setup

1. Create a **NEW** Supabase project at https://supabase.com (don't reuse Foster credentials!)
2. Get your project URL and keys from Project Settings > API
3. Go to SQL Editor in your Supabase dashboard
4. Run the SQL script from `Backend/database/schema.sql`

### 5. API Keys Setup

#### Gemini API Key (Free)
1. Go to https://aistudio.google.com/app/apikey
2. Click "Create API Key"
3. Select "Create API key in new project"
4. Copy and paste into Backend `.env`

#### Google Maps API Key (Free)
1. Go to https://console.cloud.google.com
2. Create a new project (e.g., "Bharat-Niyojak")
3. Enable "Maps JavaScript API" and "Geocoding API"
4. Go to Credentials > Create Credentials > API Key
5. Copy and paste into Frontend `.env.local`

### 6. Run Development Servers

**Terminal 1 - Backend:**
```bash
cd Backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd Frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 👥 User Roles

### 1. **Citizen**
- Register and login
- Upload civic issue images
- View nearby complaints
- Track complaint status
- Support existing complaints

### 2. **Department Admins**
- **Road Department Admin** (`road_admin`)
  - Manages: Potholes, damaged roads, traffic infrastructure
- **Water Department Admin** (`water_admin`)
  - Manages: Water leakage, pipeline issues
- **Electricity Department Admin** (`electricity_admin`)
  - Manages: Streetlight issues, electrical infrastructure
- **Forest Department Admin** (`forest_admin`)
  - Manages: Fallen trees, damaged gardens

### 3. **Super Admin**
- Full system access
- User management
- Department management
- System analytics

---

## 📱 Default Login Credentials

After running the database schema, create default users manually or use the registration page.

### Example Admin User Creation (SQL)

**Important:** Use your own secure passwords! Run this in Supabase SQL Editor after setting up the database.

```sql
-- First, hash your passwords using bcrypt (you can use online bcrypt generators)
-- For demo purposes, these examples use 'Admin@123' hashed

-- Insert Super Admin
INSERT INTO users (full_name, email, mobile, password_hash, role, is_active)
VALUES (
  'Super Administrator',
  'superadmin@bharatniyojak.gov.in',
  '9876543210',
  '$2a$10$XYZ...your_hashed_password_here',
  'super_admin',
  true
);

-- Insert Road Department Admin
INSERT INTO users (full_name, email, mobile, password_hash, role, is_active)
VALUES (
  'Road Department Admin',
  'road.admin@bharatniyojak.gov.in',
  '9876543211',
  '$2a$10$XYZ...your_hashed_password_here',
  'road_admin',
  true
);

-- Insert Water Department Admin
INSERT INTO users (full_name, email, mobile, password_hash, role, is_active)
VALUES (
  'Water Department Admin',
  'water.admin@bharatniyojak.gov.in',
  '9876543212',
  '$2a$10$XYZ...your_hashed_password_here',
  'water_admin',
  true
);

-- Insert Electricity Department Admin
INSERT INTO users (full_name, email, mobile, password_hash, role, is_active)
VALUES (
  'Electricity Department Admin',
  'electricity.admin@bharatniyojak.gov.in',
  '9876543213',
  '$2a$10$XYZ...your_hashed_password_here',
  'electricity_admin',
  true
);

-- Insert Forest Department Admin
INSERT INTO users (full_name, email, mobile, password_hash, role, is_active)
VALUES (
  'Forest Department Admin',
  'forest.admin@bharatniyojak.gov.in',
  '9876543214',
  '$2a$10$XYZ...your_hashed_password_here',
  'forest_admin',
  true
);
```

**To generate password hashes:**
1. Use online tool: https://bcrypt-generator.com/
2. Enter your password
3. Use 10 rounds
4. Copy the hash and replace in SQL above

---

## 🎨 Design Theme

- **Primary Color**: Official Blue (#0066ff)
- **Background**: White (#FFFFFF)
- **Text**: Dark Gray (#1a202c)
- **Accent Colors**: India tri-color palette (Saffron, White, Green)

---

## 🗺️ Complaint Categories

| Category | Department | Examples |
|----------|-----------|----------|
| Pothole | Road | Road damage, potholes |
| Damaged Road | Road | Broken roads, cracks |
| Garbage | Solid Waste Management | Garbage accumulation |
| Streetlight | Electricity | Broken streetlights |
| Water Leakage | Water Supply | Pipeline leaks |
| Fallen Tree | Forest | Tree-related issues |
| Drainage | Drainage | Drainage blockages |
| Open Manhole | Drainage | Uncovered manholes |

---

## 📊 Project Structure

```
Bharat Niyojak/
├── Backend/
│   ├── database/
│   │   └── schema.sql
│   ├── src/
│   │   ├── config/
│   │   │   ├── supabase.js
│   │   │   └── gemini.js
│   │   ├── middleware/
│   │   │   ├── auth.middleware.js
│   │   │   └── upload.middleware.js
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── complaint.routes.js
│   │   │   ├── user.routes.js
│   │   │   ├── department.routes.js
│   │   │   └── ai.routes.js
│   │   └── server.js
│   ├── uploads/
│   ├── .env
│   ├── .gitignore
│   └── package.json
├── Frontend/
│   ├── public/
│   │   └── logo.png
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   ├── layout.tsx
│   │   │   ├── globals.css
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   ├── citizen/
│   │   │   └── admin/
│   │   ├── components/
│   │   ├── lib/
│   │   │   └── supabase.ts
│   │   └── types/
│   │       └── index.ts
│   ├── .env.local
│   ├── .gitignore
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── next.config.js
└── README.md
```

## 🚀 Deployment

### Frontend - Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "New Project"
4. Import your GitHub repository
5. Set root directory to `Frontend`
6. Add environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_maps_key
   NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api
   ```
7. Deploy

### Backend - Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com)
3. Click "New Web Service"
4. Connect your GitHub repository
5. Set root directory to `Backend`
6. Build Command: `npm install`
7. Start Command: `npm start`
8. Add environment variables:
   ```
   PORT=5000
   NODE_ENV=production
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_key
   GEMINI_API_KEY=your_gemini_key
   JWT_SECRET=your_secret
   FRONTEND_URL=https://your-frontend.vercel.app
   ```
9. Deploy

### Phase 1 - Core Features ✅
- [x] Database schema
- [x] Authentication system
- [x] Role-based access control
- [ ] AI image analysis integration
- [ ] Complaint submission
- [ ] Department dashboards

### Phase 2 - Advanced Features
- [ ] Duplicate detection
- [ ] Priority scoring
- [ ] Push notifications
- [ ] Advanced analytics
- [ ] Mobile app

### Phase 3 - Smart City Integration
- [ ] IoT integration
- [ ] Predictive maintenance
- [ ] Multilingual support
- [ ] Voice complaints

---

## 🤝 Contributing

This project is part of an academic research initiative. Contributions are welcome!

---

## 📄 License

This project is developed for educational and research purposes.

---

## 📧 Contact

For queries and support:
- Email: support@bharatniyojak.in
- Website: Coming Soon

---

## 🙏 Acknowledgments

- Google Gemini AI for vision capabilities
- Supabase for backend infrastructure
- Next.js team for the amazing framework

---

**Bharat Niyojak** - Making civic reporting intelligent, simple, and effective.
