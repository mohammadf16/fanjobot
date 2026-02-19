CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  phone_or_email TEXT NOT NULL,
  telegram_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  university TEXT,
  city TEXT,
  major TEXT NOT NULL,
  level TEXT NOT NULL,
  term TEXT NOT NULL,
  interests TEXT NOT NULL DEFAULT '[]',
  skill_level TEXT NOT NULL,
  short_term_goal TEXT NOT NULL,
  weekly_hours INTEGER NOT NULL,
  resume_url TEXT,
  github_url TEXT,
  portfolio_url TEXT,
  skills TEXT NOT NULL DEFAULT '[]',
  passed_courses TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('university', 'industry')),
  kind TEXT NOT NULL,
  major TEXT,
  term TEXT,
  skill_level TEXT NOT NULL CHECK (skill_level IN ('beginner', 'intermediate', 'advanced')),
  tags TEXT NOT NULL DEFAULT '[]',
  estimated_hours INTEGER,
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS content_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,
  drive_link TEXT,
  mime_type TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (full_name, phone_or_email)
SELECT 'System Admin', 'admin@fanjobo.local'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE phone_or_email = 'admin@fanjobo.local');

INSERT INTO contents (created_by_user_id, title, description, type, kind, major, term, skill_level, tags, estimated_hours, is_published)
SELECT
  (SELECT id FROM users WHERE phone_or_email = 'admin@fanjobo.local' LIMIT 1),
  'ساختمان داده - نقشه قبولی و پروژه رزومه',
  'مسیر یادگیری ساختمان داده + پروژه پیاده سازی برای رزومه',
  'university',
  'course',
  'مهندسی کامپیوتر',
  '4',
  'beginner',
  '["exam", "course", "quick-win"]',
  12,
  1
WHERE NOT EXISTS (SELECT 1 FROM contents WHERE title = 'ساختمان داده - نقشه قبولی و پروژه رزومه');

INSERT INTO contents (created_by_user_id, title, description, type, kind, major, term, skill_level, tags, estimated_hours, is_published)
SELECT
  (SELECT id FROM users WHERE phone_or_email = 'admin@fanjobo.local' LIMIT 1),
  'Backend Junior Roadmap',
  'مسیر 12 هفته ای برای رسیدن به سطح Junior Backend',
  'industry',
  'roadmap',
  'مهندسی کامپیوتر',
  NULL,
  'beginner',
  '["job-ready", "portfolio", "junior", "project"]',
  40,
  1
WHERE NOT EXISTS (SELECT 1 FROM contents WHERE title = 'Backend Junior Roadmap');

INSERT INTO contents (created_by_user_id, title, description, type, kind, major, term, skill_level, tags, estimated_hours, is_published)
SELECT
  (SELECT id FROM users WHERE phone_or_email = 'admin@fanjobo.local' LIMIT 1),
  'کارآموز Backend - Remote',
  'فرصت کارآموزی بک اند با تمرکز Node.js و PostgreSQL',
  'industry',
  'internship',
  'مهندسی کامپیوتر',
  NULL,
  'beginner',
  '["internship", "quick-win", "project"]',
  20,
  1
WHERE NOT EXISTS (SELECT 1 FROM contents WHERE title = 'کارآموز Backend - Remote');

INSERT INTO contents (created_by_user_id, title, description, type, kind, major, term, skill_level, tags, estimated_hours, is_published)
SELECT
  (SELECT id FROM users WHERE phone_or_email = 'admin@fanjobo.local' LIMIT 1),
  'استاد الگوریتم های پیشرفته - دکتر محمدی',
  'جلسات رفع اشکال و برنامه مطالعه درس الگوریتم',
  'university',
  'professor',
  'مهندسی کامپیوتر - نرم افزار',
  '5',
  'intermediate',
  '["course", "study-plan"]',
  8,
  1
WHERE NOT EXISTS (SELECT 1 FROM contents WHERE title = 'استاد الگوریتم های پیشرفته - دکتر محمدی');

INSERT INTO contents (created_by_user_id, title, description, type, kind, major, term, skill_level, tags, estimated_hours, is_published)
SELECT
  (SELECT id FROM users WHERE phone_or_email = 'admin@fanjobo.local' LIMIT 1),
  'جزوه ساختمان داده - نسخه جمع بندی',
  'جزوه نکته محور برای میان ترم و پایان ترم',
  'university',
  'note',
  'مهندسی کامپیوتر - نرم افزار',
  '4',
  'beginner',
  '["exam", "quick-win", "course"]',
  6,
  1
WHERE NOT EXISTS (SELECT 1 FROM contents WHERE title = 'جزوه ساختمان داده - نسخه جمع بندی');

INSERT INTO contents (created_by_user_id, title, description, type, kind, major, term, skill_level, tags, estimated_hours, is_published)
SELECT
  (SELECT id FROM users WHERE phone_or_email = 'admin@fanjobo.local' LIMIT 1),
  'کتاب مرجع طراحی الگوریتم (ترجمه فارسی)',
  'کتاب پیشنهادی برای تقویت حل مسئله و درک الگوریتم',
  'university',
  'book',
  'مهندسی کامپیوتر - نرم افزار',
  NULL,
  'intermediate',
  '["book", "course"]',
  20,
  1
WHERE NOT EXISTS (SELECT 1 FROM contents WHERE title = 'کتاب مرجع طراحی الگوریتم (ترجمه فارسی)');

INSERT INTO contents (created_by_user_id, title, description, type, kind, major, term, skill_level, tags, estimated_hours, is_published)
SELECT
  (SELECT id FROM users WHERE phone_or_email = 'admin@fanjobo.local' LIMIT 1),
  'منبع تمرین برنامه نویسی پیشرفته',
  'سری تمرین های هفتگی با پاسخ تشریحی',
  'university',
  'resource',
  'مهندسی کامپیوتر - نرم افزار',
  '5',
  'intermediate',
  '["practice", "project", "course"]',
  10,
  1
WHERE NOT EXISTS (SELECT 1 FROM contents WHERE title = 'منبع تمرین برنامه نویسی پیشرفته');

INSERT INTO contents (created_by_user_id, title, description, type, kind, major, term, skill_level, tags, estimated_hours, is_published)
SELECT
  (SELECT id FROM users WHERE phone_or_email = 'admin@fanjobo.local' LIMIT 1),
  'ویدیو حل تمرین ساختمان داده',
  'ویدیو قدم به قدم برای حل تمرین‌های مهم ساختمان داده',
  'university',
  'video',
  'مهندسی کامپیوتر - نرم افزار',
  '4',
  'beginner',
  '["video", "course", "practice"]',
  5,
  1
WHERE NOT EXISTS (SELECT 1 FROM contents WHERE title = 'ویدیو حل تمرین ساختمان داده');

INSERT INTO contents (created_by_user_id, title, description, type, kind, major, term, skill_level, tags, estimated_hours, is_published)
SELECT
  (SELECT id FROM users WHERE phone_or_email = 'admin@fanjobo.local' LIMIT 1),
  'نمونه سوال پایان ترم طراحی الگوریتم',
  'مجموعه نمونه سوال به همراه پاسخ کلیدی',
  'university',
  'sample-question',
  'مهندسی کامپیوتر - نرم افزار',
  '5',
  'intermediate',
  '["exam", "sample-question"]',
  4,
  1
WHERE NOT EXISTS (SELECT 1 FROM contents WHERE title = 'نمونه سوال پایان ترم طراحی الگوریتم');

INSERT INTO contents (created_by_user_id, title, description, type, kind, major, term, skill_level, tags, estimated_hours, is_published)
SELECT
  (SELECT id FROM users WHERE phone_or_email = 'admin@fanjobo.local' LIMIT 1),
  'خلاصه فصل‌های کلیدی ساختمان داده',
  'جمع بندی مفاهیم اصلی برای مرور سریع قبل از امتحان',
  'university',
  'summary',
  'مهندسی کامپیوتر - نرم افزار',
  '4',
  'beginner',
  '["summary", "quick-win", "exam"]',
  3,
  1
WHERE NOT EXISTS (SELECT 1 FROM contents WHERE title = 'خلاصه فصل‌های کلیدی ساختمان داده');

CREATE TABLE IF NOT EXISTS university_course_chart (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code TEXT NOT NULL,
  course_title TEXT NOT NULL,
  major TEXT,
  recommended_term TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 3,
  prerequisites TEXT NOT NULL DEFAULT '[]',
  is_core INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (course_code, major)
);

CREATE TABLE IF NOT EXISTS university_term_offerings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code TEXT NOT NULL,
  offered_term TEXT NOT NULL,
  major TEXT,
  instructor_name TEXT,
  capacity INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_passed_courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL,
  course_title TEXT,
  grade TEXT,
  passed_term TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, course_code)
);

CREATE TABLE IF NOT EXISTS university_deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT,
  title TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('exam', 'assignment', 'project', 'quiz')),
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS university_professor_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  professor_name TEXT NOT NULL,
  course_code TEXT,
  teaching_style TEXT,
  difficulty_score INTEGER CHECK (difficulty_score BETWEEN 1 AND 5),
  grading_score INTEGER CHECK (grading_score BETWEEN 1 AND 5),
  review_text TEXT NOT NULL,
  is_approved INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS university_study_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT,
  title TEXT NOT NULL,
  task_type TEXT NOT NULL DEFAULT 'study',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
  planned_for TEXT,
  week_label TEXT,
  estimated_minutes INTEGER,
  checklist TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS university_qa_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL,
  chapter TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_resolved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS university_qa_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES university_qa_questions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  votes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO university_course_chart (course_code, course_title, major, recommended_term, credits, prerequisites, is_core)
SELECT 'CS101', 'برنامه نویسی مقدماتی', 'مهندسی کامپیوتر - نرم افزار', '1', 3, '[]', 1
WHERE NOT EXISTS (SELECT 1 FROM university_course_chart WHERE course_code = 'CS101' AND major = 'مهندسی کامپیوتر - نرم افزار');

INSERT INTO university_course_chart (course_code, course_title, major, recommended_term, credits, prerequisites, is_core)
SELECT 'CS102', 'ساختمان داده', 'مهندسی کامپیوتر - نرم افزار', '3', 3, '["CS101"]', 1
WHERE NOT EXISTS (SELECT 1 FROM university_course_chart WHERE course_code = 'CS102' AND major = 'مهندسی کامپیوتر - نرم افزار');

INSERT INTO university_course_chart (course_code, course_title, major, recommended_term, credits, prerequisites, is_core)
SELECT 'CS201', 'طراحی الگوریتم', 'مهندسی کامپیوتر - نرم افزار', '5', 3, '["CS102"]', 1
WHERE NOT EXISTS (SELECT 1 FROM university_course_chart WHERE course_code = 'CS201' AND major = 'مهندسی کامپیوتر - نرم افزار');

INSERT INTO university_course_chart (course_code, course_title, major, recommended_term, credits, prerequisites, is_core)
SELECT 'CS221', 'هوش مصنوعی', 'مهندسی کامپیوتر - نرم افزار', '6', 3, '["CS201"]', 0
WHERE NOT EXISTS (SELECT 1 FROM university_course_chart WHERE course_code = 'CS221' AND major = 'مهندسی کامپیوتر - نرم افزار');

INSERT INTO university_term_offerings (course_code, offered_term, major, instructor_name, capacity, is_active)
SELECT 'CS102', '4', 'مهندسی کامپیوتر - نرم افزار', 'دکتر محمدی', 60, 1
WHERE NOT EXISTS (SELECT 1 FROM university_term_offerings WHERE course_code = 'CS102' AND offered_term = '4' AND major = 'مهندسی کامپیوتر - نرم افزار');

INSERT INTO university_term_offerings (course_code, offered_term, major, instructor_name, capacity, is_active)
SELECT 'CS201', '5', 'مهندسی کامپیوتر - نرم افزار', 'دکتر احمدی', 55, 1
WHERE NOT EXISTS (SELECT 1 FROM university_term_offerings WHERE course_code = 'CS201' AND offered_term = '5' AND major = 'مهندسی کامپیوتر - نرم افزار');

INSERT INTO university_term_offerings (course_code, offered_term, major, instructor_name, capacity, is_active)
SELECT 'CS221', '6', 'مهندسی کامپیوتر - نرم افزار', 'دکتر صالحی', 45, 1
WHERE NOT EXISTS (SELECT 1 FROM university_term_offerings WHERE course_code = 'CS221' AND offered_term = '6' AND major = 'مهندسی کامپیوتر - نرم افزار');

CREATE TABLE IF NOT EXISTS industry_companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  domain TEXT,
  size TEXT,
  city TEXT,
  website_url TEXT,
  linkedin_url TEXT,
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS industry_company_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES industry_companies(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  role TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS industry_opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES industry_companies(id) ON DELETE SET NULL,
  opportunity_type TEXT NOT NULL CHECK (opportunity_type IN ('internship', 'job', 'project-based', 'freelance', 'part-time', 'mentorship', 'challenge')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location_mode TEXT NOT NULL CHECK (location_mode IN ('remote', 'on-site', 'hybrid')),
  city TEXT,
  level TEXT NOT NULL CHECK (level IN ('Intern', 'Junior', 'Mid')),
  required_skills TEXT NOT NULL DEFAULT '[]',
  hours_per_week INTEGER,
  salary_min INTEGER,
  salary_max INTEGER,
  start_date TEXT,
  deadline_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('approved', 'pending', 'rejected')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS industry_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id INTEGER NOT NULL REFERENCES industry_opportunities(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'viewed', 'interview', 'rejected', 'accepted')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, opportunity_id)
);

CREATE TABLE IF NOT EXISTS industry_saved_opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id INTEGER NOT NULL REFERENCES industry_opportunities(id) ON DELETE CASCADE,
  follow_up_status TEXT NOT NULL DEFAULT 'saved',
  follow_up_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, opportunity_id)
);

CREATE TABLE IF NOT EXISTS industry_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES industry_companies(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('industry', 'portfolio', 'open_source')),
  title TEXT NOT NULL,
  brief TEXT NOT NULL,
  domain TEXT,
  level TEXT NOT NULL CHECK (level IN ('Intern', 'Junior', 'Mid')),
  estimated_hours INTEGER,
  required_skills TEXT NOT NULL DEFAULT '[]',
  deliverables TEXT NOT NULL DEFAULT '[]',
  evaluation_criteria TEXT NOT NULL DEFAULT '[]',
  resume_ready INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS industry_project_milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES industry_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  week_no INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS industry_project_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  milestone_id INTEGER NOT NULL REFERENCES industry_project_milestones(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  is_required INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS industry_student_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES industry_projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'completed', 'cancelled')),
  progress INTEGER NOT NULL DEFAULT 0,
  output_links TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, project_id)
);

CREATE TABLE IF NOT EXISTS student_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 0 AND 5),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, skill_name)
);

CREATE TABLE IF NOT EXISTS industry_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  category TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS industry_skill_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL CHECK (target_type IN ('opportunity', 'project', 'career_path', 'roadmap_step')),
  target_id INTEGER NOT NULL,
  skill_id INTEGER NOT NULL REFERENCES industry_skills(id) ON DELETE CASCADE,
  required_level INTEGER NOT NULL DEFAULT 1 CHECK (required_level BETWEEN 0 AND 5),
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 10),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS industry_career_paths (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  required_skills TEXT NOT NULL DEFAULT '[]',
  sample_projects TEXT NOT NULL DEFAULT '[]',
  junior_ready_checklist TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS industry_roadmaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  career_path_id INTEGER REFERENCES industry_career_paths(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS industry_roadmap_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  roadmap_id INTEGER NOT NULL REFERENCES industry_roadmaps(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  skill_name TEXT,
  content_ref TEXT,
  project_ref TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS industry_checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  roadmap_id INTEGER NOT NULL REFERENCES industry_roadmaps(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS community_content_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('university', 'industry')),
  content_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  major TEXT,
  term TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  external_link TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_rejected')),
  moderation_reason TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'answered', 'closed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  category TEXT,
  last_user_message_at TEXT,
  last_admin_reply_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('user', 'admin')),
  sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  message_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_id ON support_ticket_messages(ticket_id);

CREATE TABLE IF NOT EXISTS my_path_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  current_stage TEXT NOT NULL DEFAULT 'university_and_industry',
  four_week_goal TEXT,
  weekly_hours INTEGER NOT NULL DEFAULT 8,
  free_days TEXT NOT NULL DEFAULT '[]',
  university_weight INTEGER NOT NULL DEFAULT 50,
  industry_weight INTEGER NOT NULL DEFAULT 50,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS my_path_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('academic', 'career', 'project', 'application')),
  title TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  priority INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  success_metrics TEXT NOT NULL DEFAULT '[]',
  progress_percent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS my_path_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id INTEGER REFERENCES my_path_goals(id) ON DELETE SET NULL,
  step_label TEXT,
  type TEXT NOT NULL CHECK (type IN ('study', 'practice', 'project', 'apply', 'interview')),
  title TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL DEFAULT 60,
  priority INTEGER NOT NULL DEFAULT 3,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  dependency_task_id INTEGER REFERENCES my_path_tasks(id) ON DELETE SET NULL,
  attachments TEXT NOT NULL DEFAULT '[]',
  planned_week TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS my_path_progress_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id INTEGER REFERENCES my_path_tasks(id) ON DELETE CASCADE,
  actual_minutes INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS my_path_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal_id INTEGER REFERENCES my_path_goals(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('github', 'demo', 'file', 'certificate', 'resume_bullet')),
  title TEXT NOT NULL,
  url TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO industry_companies (name, domain, size, city, website_url, linkedin_url, is_verified)
SELECT 'Fanjobo Labs', 'EdTech', '11-50', 'Tehran', 'https://fanjobo.example', 'https://linkedin.com/company/fanjobo', 1
WHERE NOT EXISTS (SELECT 1 FROM industry_companies WHERE name = 'Fanjobo Labs');

INSERT INTO industry_skills (name, category, is_active)
SELECT 'Node.js', 'backend', 1
WHERE NOT EXISTS (SELECT 1 FROM industry_skills WHERE name = 'Node.js');

INSERT INTO industry_skills (name, category, is_active)
SELECT 'SQL', 'database', 1
WHERE NOT EXISTS (SELECT 1 FROM industry_skills WHERE name = 'SQL');

INSERT INTO industry_skills (name, category, is_active)
SELECT 'Git', 'tools', 1
WHERE NOT EXISTS (SELECT 1 FROM industry_skills WHERE name = 'Git');

INSERT INTO industry_career_paths (name, description, required_skills, sample_projects, junior_ready_checklist, is_active)
SELECT
  'Backend Developer',
  'مسیر ورود به بک اند با تمرکز Node.js، SQL و API Design',
  '["node.js", "sql", "api", "git"]',
  '["REST API for LMS", "Auth Service", "Mini ERP Backend"]',
  '["ساخت API استاندارد", "پوشش تست", "استقرار اولیه", "گیت حرفه ای"]',
  1
WHERE NOT EXISTS (SELECT 1 FROM industry_career_paths WHERE name = 'Backend Developer');

INSERT INTO industry_roadmaps (career_path_id, title, description, is_active)
SELECT
  (SELECT id FROM industry_career_paths WHERE name = 'Backend Developer' LIMIT 1),
  'Backend Junior - 8 Week Sprint',
  'نقشه کوتاه 8 هفته ای برای رسیدن به مصاحبه اول',
  1
WHERE NOT EXISTS (SELECT 1 FROM industry_roadmaps WHERE title = 'Backend Junior - 8 Week Sprint');

INSERT INTO industry_roadmap_steps (roadmap_id, step_order, title, skill_name, content_ref, project_ref)
SELECT
  (SELECT id FROM industry_roadmaps WHERE title = 'Backend Junior - 8 Week Sprint' LIMIT 1),
  1,
  'مبانی API و طراحی قرارداد',
  'api',
  'REST fundamentals',
  'API Boilerplate'
WHERE NOT EXISTS (
  SELECT 1 FROM industry_roadmap_steps
  WHERE roadmap_id = (SELECT id FROM industry_roadmaps WHERE title = 'Backend Junior - 8 Week Sprint' LIMIT 1)
    AND step_order = 1
);

INSERT INTO industry_roadmap_steps (roadmap_id, step_order, title, skill_name, content_ref, project_ref)
SELECT
  (SELECT id FROM industry_roadmaps WHERE title = 'Backend Junior - 8 Week Sprint' LIMIT 1),
  2,
  'دیتابیس و کوئری حرفه ای',
  'sql',
  'SQL tuning',
  'Task Manager DB'
WHERE NOT EXISTS (
  SELECT 1 FROM industry_roadmap_steps
  WHERE roadmap_id = (SELECT id FROM industry_roadmaps WHERE title = 'Backend Junior - 8 Week Sprint' LIMIT 1)
    AND step_order = 2
);

INSERT INTO industry_checklist_items (roadmap_id, title, is_active)
SELECT
  (SELECT id FROM industry_roadmaps WHERE title = 'Backend Junior - 8 Week Sprint' LIMIT 1),
  'یک API واقعی با auth و role پیاده سازی شده باشد',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM industry_checklist_items
  WHERE roadmap_id = (SELECT id FROM industry_roadmaps WHERE title = 'Backend Junior - 8 Week Sprint' LIMIT 1)
    AND title = 'یک API واقعی با auth و role پیاده سازی شده باشد'
);

INSERT INTO industry_projects (company_id, type, title, brief, domain, level, estimated_hours, required_skills, deliverables, evaluation_criteria, resume_ready, status)
SELECT
  (SELECT id FROM industry_companies WHERE name = 'Fanjobo Labs' LIMIT 1),
  'portfolio',
  'Mini ATS Backend',
  'پیاده سازی بک اند ساده برای مدیریت درخواست شغلی',
  'Backend',
  'Junior',
  24,
  '[{"name":"node.js","level":2,"weight":3},{"name":"sql","level":2,"weight":2}]',
  '["API Docs", "DB schema", "Postman collection"]',
  '["Code quality", "Data modeling", "Error handling"]',
  1,
  'open'
WHERE NOT EXISTS (SELECT 1 FROM industry_projects WHERE title = 'Mini ATS Backend');

INSERT INTO industry_projects (company_id, type, title, brief, domain, level, estimated_hours, required_skills, deliverables, evaluation_criteria, resume_ready, status)
SELECT
  (SELECT id FROM industry_companies WHERE name = 'Fanjobo Labs' LIMIT 1),
  'open_source',
  'Fix Docs + Tests for OSS Tool',
  'مشارکت متن باز با تمرکز مستندسازی و تست',
  'OpenSource',
  'Intern',
  10,
  '[{"name":"git","level":1,"weight":2},{"name":"testing","level":1,"weight":1}]',
  '["PR لینک شده", "تست پاس شده"]',
  '["Contribution quality", "Communication"]',
  1,
  'open'
WHERE NOT EXISTS (SELECT 1 FROM industry_projects WHERE title = 'Fix Docs + Tests for OSS Tool');

INSERT INTO industry_opportunities (company_id, opportunity_type, title, description, location_mode, city, level, required_skills, hours_per_week, salary_min, salary_max, start_date, deadline_at, approval_status, status)
SELECT
  (SELECT id FROM industry_companies WHERE name = 'Fanjobo Labs' LIMIT 1),
  'internship',
  'Backend Internship - Node.js',
  'کارآموزی بک اند با مسیر منتورینگ 10 هفته ای',
  'hybrid',
  'Tehran',
  'Intern',
  '[{"name":"node.js","level":1,"weight":3},{"name":"sql","level":1,"weight":2}]',
  20,
  NULL,
  NULL,
  date('now'),
  datetime('now', '+30 day'),
  'approved',
  'open'
WHERE NOT EXISTS (SELECT 1 FROM industry_opportunities WHERE title = 'Backend Internship - Node.js');

INSERT INTO industry_opportunities (company_id, opportunity_type, title, description, location_mode, city, level, required_skills, hours_per_week, salary_min, salary_max, start_date, deadline_at, approval_status, status)
SELECT
  (SELECT id FROM industry_companies WHERE name = 'Fanjobo Labs' LIMIT 1),
  'job',
  'Junior Backend Developer',
  'نقش جونیور بک اند با تمرکز API و PostgreSQL',
  'remote',
  NULL,
  'Junior',
  '[{"name":"node.js","level":2,"weight":3},{"name":"sql","level":2,"weight":2},{"name":"git","level":2,"weight":1}]',
  40,
  25000000,
  35000000,
  date('now'),
  datetime('now', '+45 day'),
  'approved',
  'open'
WHERE NOT EXISTS (SELECT 1 FROM industry_opportunities WHERE title = 'Junior Backend Developer');
