const express = require("express");
const { query, executeSqlScript, getDbProvider } = require("../db");
const {
  normalizeSkillName,
  buildSkillMap,
  levelToNumber,
  scoreOpportunity,
  scoreProject
} = require("../services/industryHub");

const router = express.Router();
let ensureIndustryProfilePromise = null;

const INDUSTRY_PROFILE_POSTGRES_SQL = `
CREATE TABLE IF NOT EXISTS industry_student_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  target_job TEXT,
  experience_level TEXT,
  preferred_location TEXT,
  preferred_job_type TEXT,
  expected_salary INTEGER,
  about TEXT,
  career_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_industry_student_profiles_user_id
  ON industry_student_profiles(user_id);
`;

const INDUSTRY_PROFILE_SQLITE_SQL = `
CREATE TABLE IF NOT EXISTS industry_student_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  target_job TEXT,
  experience_level TEXT,
  preferred_location TEXT,
  preferred_job_type TEXT,
  expected_salary INTEGER,
  about TEXT,
  career_summary TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_industry_student_profiles_user_id
  ON industry_student_profiles(user_id);
`;

function toLimit(raw, fallback = 20, max = 100) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function toOffset(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function toArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return String(raw)
    .split(/[,،]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function toNullableInt(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

function normalizeApplicationStatus(raw, fallback = "draft") {
  const allowed = new Set(["draft", "submitted", "viewed", "interview", "rejected", "accepted"]);
  const status = String(raw || fallback).toLowerCase();
  return allowed.has(status) ? status : fallback;
}

async function ensureIndustryProfileTable() {
  if (ensureIndustryProfilePromise) return ensureIndustryProfilePromise;

  ensureIndustryProfilePromise = (async () => {
    const provider = getDbProvider();
    const sql = provider === "postgres" ? INDUSTRY_PROFILE_POSTGRES_SQL : INDUSTRY_PROFILE_SQLITE_SQL;
    await executeSqlScript(sql);
  })().catch((error) => {
    ensureIndustryProfilePromise = null;
    throw error;
  });

  return ensureIndustryProfilePromise;
}

async function getStudentContext(userId) {
  const profileRes = await query(
    `SELECT *
     FROM user_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  const profile = profileRes.rows[0] || null;
  if (!profile) return null;

  const tableSkillsRes = await query(
    `SELECT skill_name, level
     FROM student_skills
     WHERE user_id = $1`,
    [userId]
  );

  const fromProfile = Array.isArray(profile.skills) ? profile.skills : [];
  const mergedSkills = [
    ...tableSkillsRes.rows.map((item) => ({ name: item.skill_name, score: item.level })),
    ...fromProfile
  ];

  const skillMap = buildSkillMap(mergedSkills);

  return {
    userId,
    major: profile.major || null,
    level: profile.skill_level || "beginner",
    levelNum: levelToNumber(profile.skill_level),
    term: profile.term || null,
    city: profile.city || null,
    weeklyHours: Number(profile.weekly_hours || 0),
    skillMap
  };
}

async function listOpportunities(context, filters = {}) {
  const rows = await query(
    `SELECT o.*, c.name AS company_name, c.city AS company_city
     FROM industry_opportunities o
     LEFT JOIN industry_companies c ON c.id = o.company_id
     WHERE o.approval_status = 'approved'
       AND o.status = 'open'
       AND ($1::text IS NULL OR o.level = $1)
       AND ($2::text IS NULL OR o.opportunity_type = $2)
       AND ($3::text IS NULL OR o.location_mode = $3)
       AND ($4::text IS NULL OR o.city = $4 OR o.city IS NULL)
     ORDER BY o.created_at DESC
     LIMIT $5`,
    [
      filters.level || null,
      filters.type || null,
      filters.locationMode || null,
      filters.city || null,
      toLimit(filters.limit, 100, 200)
    ]
  );

  const items = rows.rows.map((item) => ({
    ...item,
    matchScore: scoreOpportunity(item, context)
  }));

  items.sort((a, b) => b.matchScore - a.matchScore);
  return items;
}

async function listProjects(context, filters = {}) {
  const rows = await query(
    `SELECT p.*
     FROM industry_projects p
     WHERE p.status = 'open'
       AND ($1::text IS NULL OR p.type = $1)
       AND ($2::text IS NULL OR p.level = $2)
       AND ($3::text IS NULL OR p.domain = $3)
     ORDER BY p.created_at DESC
     LIMIT $4`,
    [
      filters.type || null,
      filters.level || null,
      filters.domain || null,
      toLimit(filters.limit, 100, 200)
    ]
  );

  const items = rows.rows.map((item) => ({
    ...item,
    matchScore: scoreProject(item, context)
  }));

  items.sort((a, b) => b.matchScore - a.matchScore);
  return items;
}

router.use(async (_req, _res, next) => {
  try {
    await ensureIndustryProfileTable();
    next();
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const context = await getStudentContext(userId);
    if (!context) return res.status(404).json({ error: "User profile not found" });

    const opportunities = await listOpportunities(context, { limit: 50 });
    const projects = await listProjects(context, { limit: 50, type: "portfolio" });

    const roadmapRes = await query(
      `SELECT r.*, cp.name AS career_path_name
       FROM industry_roadmaps r
       LEFT JOIN industry_career_paths cp ON cp.id = r.career_path_id
       WHERE r.is_active = TRUE
         AND ($1::text IS NULL OR cp.name = $1 OR cp.name IS NULL)
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [req.query.pathName || null]
    );

    res.json({
      userId,
      suggestions: {
        todayOrWeek: {
          opportunities: opportunities.slice(0, 3),
          portfolioProjects: projects.slice(0, 2),
          shortRoadmap: roadmapRes.rows[0] || null
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/profile/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const result = await query(
      `SELECT u.id AS user_id,
              COALESCE(isp.target_job, up.short_term_goal) AS target_job,
              COALESCE(isp.experience_level, up.skill_level) AS experience_level,
              COALESCE(isp.preferred_location, up.city) AS preferred_location,
              isp.preferred_job_type,
              isp.expected_salary,
              isp.about,
              isp.career_summary,
              COALESCE(isp.updated_at, up.updated_at, u.created_at) AS updated_at
       FROM users u
       LEFT JOIN industry_student_profiles isp ON isp.user_id = u.id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = $1
       LIMIT 1`,
      [userId]
    );

    if (!result.rows.length) return res.status(404).json({ error: "User not found" });
    res.json({ profile: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.put("/profile/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const bodyUserId = req.body?.userId ? Number(req.body.userId) : userId;
    if (!userId || !bodyUserId || userId !== bodyUserId) {
      return res.status(400).json({ error: "Invalid userId" });
    }

    const userRes = await query(`SELECT id FROM users WHERE id = $1 LIMIT 1`, [userId]);
    if (!userRes.rows.length) return res.status(404).json({ error: "User not found" });

    const targetJob = toNullableString(req.body?.targetJob);
    const experienceLevel = toNullableString(req.body?.experienceLevel);
    const preferredLocation = toNullableString(req.body?.preferredLocation);
    const preferredJobType = toNullableString(req.body?.preferredJobType);
    const expectedSalary = toNullableInt(req.body?.expectedSalary);
    const about = toNullableString(req.body?.about);
    const careerSummary = toNullableString(req.body?.careerSummary);

    const upsert = await query(
      `INSERT INTO industry_student_profiles
       (user_id, target_job, experience_level, preferred_location, preferred_job_type, expected_salary, about, career_summary, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         target_job = EXCLUDED.target_job,
         experience_level = EXCLUDED.experience_level,
         preferred_location = EXCLUDED.preferred_location,
         preferred_job_type = EXCLUDED.preferred_job_type,
         expected_salary = EXCLUDED.expected_salary,
         about = EXCLUDED.about,
         career_summary = EXCLUDED.career_summary,
         updated_at = NOW()
       RETURNING *`,
      [userId, targetJob, experienceLevel, preferredLocation, preferredJobType, expectedSalary, about, careerSummary]
    );

    res.json({ profile: upsert.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/skills/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const rows = await query(
      `SELECT *
       FROM student_skills
       WHERE user_id = $1
       ORDER BY skill_name ASC`,
      [userId]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/skills/upsert", async (req, res, next) => {
  try {
    const userId = Number(req.body?.userId);
    const skills = Array.isArray(req.body?.skills) ? req.body.skills : [];
    if (!userId || !skills.length) {
      return res.status(400).json({ error: "userId and skills[] are required" });
    }

    const updatedItems = [];

    for (const item of skills) {
      const name = String(item?.name || item?.skillName || "").trim();
      if (!name) continue;
      const level = Math.max(0, Math.min(5, Number(item?.level ?? item?.score ?? 1)));

      const upsert = await query(
        `INSERT INTO student_skills
         (user_id, skill_name, level)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, skill_name)
         DO UPDATE SET
           level = EXCLUDED.level,
           updated_at = NOW()
         RETURNING *`,
        [userId, name, level]
      );

      updatedItems.push(upsert.rows[0]);
    }

    res.status(201).json({ items: updatedItems });
  } catch (error) {
    next(error);
  }
});

router.get("/career-paths", async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim().toLowerCase();
    const rows = await query(
      `SELECT *
       FROM industry_career_paths
       WHERE is_active = TRUE
       ORDER BY created_at DESC
       LIMIT $1`,
      [toLimit(req.query.limit, 30, 100)]
    );

    const filtered = rows.rows.filter((item) => {
      if (!q) return true;
      const hay = `${item.name || ""} ${item.description || ""}`.toLowerCase();
      return hay.includes(q);
    });

    res.json({ items: filtered });
  } catch (error) {
    next(error);
  }
});

router.get("/career-paths/:pathId", async (req, res, next) => {
  try {
    const pathId = Number(req.params.pathId);
    const pathRes = await query(`SELECT * FROM industry_career_paths WHERE id = $1 LIMIT 1`, [pathId]);
    if (!pathRes.rows.length) return res.status(404).json({ error: "Career path not found" });

    const roadmapRes = await query(
      `SELECT * FROM industry_roadmaps WHERE career_path_id = $1 AND is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
      [pathId]
    );

    const roadmapId = roadmapRes.rows[0]?.id || null;
    const stepsRes = roadmapId
      ? await query(
          `SELECT * FROM industry_roadmap_steps WHERE roadmap_id = $1 ORDER BY step_order ASC`,
          [roadmapId]
        )
      : { rows: [] };

    const checklistRes = roadmapId
      ? await query(
          `SELECT * FROM industry_checklist_items WHERE roadmap_id = $1 ORDER BY id ASC`,
          [roadmapId]
        )
      : { rows: [] };

    res.json({
      careerPath: pathRes.rows[0],
      roadmap: roadmapRes.rows[0] || null,
      roadmapSteps: stepsRes.rows,
      juniorReadyChecklist: checklistRes.rows
    });
  } catch (error) {
    next(error);
  }
});

router.get("/projects", async (req, res, next) => {
  try {
    const userId = Number(req.query.userId);
    const context = userId ? await getStudentContext(userId) : null;
    const safeContext = context || {
      levelNum: 1,
      city: null,
      weeklyHours: 8,
      skillMap: new Map()
    };

    const items = await listProjects(safeContext, {
      type: req.query.type,
      level: req.query.level,
      domain: req.query.domain,
      limit: toLimit(req.query.limit, 30, 100)
    });

    const maxHours = req.query.maxHours ? Number(req.query.maxHours) : null;
    const skillFilters = toArray(req.query.skills).map(normalizeSkillName);
    const resumeOnly = String(req.query.resumeReady || "").toLowerCase() === "true";

    let filtered = items;
    if (Number.isFinite(maxHours)) filtered = filtered.filter((item) => Number(item.estimated_hours || 0) <= maxHours);
    if (resumeOnly) filtered = filtered.filter((item) => Boolean(item.resume_ready));
    if (skillFilters.length) {
      filtered = filtered.filter((item) => {
        const reqSkills = Array.isArray(item.required_skills) ? item.required_skills : [];
        const names = reqSkills.map((s) => normalizeSkillName(s.name || s.skill_name));
        return skillFilters.every((skill) => names.includes(skill));
      });
    }

    const offset = toOffset(req.query.offset);
    const limit = toLimit(req.query.limit, 20, 100);

    res.json({
      total: filtered.length,
      limit,
      offset,
      items: filtered.slice(offset, offset + limit)
    });
  } catch (error) {
    next(error);
  }
});

router.get("/projects/:projectId", async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const userId = req.query.userId ? Number(req.query.userId) : null;

    const projectRes = await query(
      `SELECT p.*, c.name AS company_name
       FROM industry_projects p
       LEFT JOIN industry_companies c ON c.id = p.company_id
       WHERE p.id = $1
       LIMIT 1`,
      [projectId]
    );
    if (!projectRes.rows.length) return res.status(404).json({ error: "Project not found" });

    const milestonesRes = await query(
      `SELECT *
       FROM industry_project_milestones
       WHERE project_id = $1
       ORDER BY week_no ASC, id ASC`,
      [projectId]
    );

    const milestoneIds = milestonesRes.rows.map((m) => m.id);
    let tasksRows = [];
    for (const mid of milestoneIds) {
      const t = await query(
        `SELECT * FROM industry_project_tasks WHERE milestone_id = $1 ORDER BY id ASC`,
        [mid]
      );
      tasksRows = tasksRows.concat(t.rows);
    }

    const studentProjectRes = userId
      ? await query(
          `SELECT * FROM industry_student_projects WHERE user_id = $1 AND project_id = $2 LIMIT 1`,
          [userId, projectId]
        )
      : { rows: [] };

    res.json({
      project: projectRes.rows[0],
      milestones: milestonesRes.rows,
      tasks: tasksRows,
      studentProject: studentProjectRes.rows[0] || null
    });
  } catch (error) {
    next(error);
  }
});

router.post("/projects/:projectId/start", async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const userId = Number(req.body?.userId);
    if (!projectId || !userId) return res.status(400).json({ error: "projectId and userId are required" });

    const upsert = await query(
      `INSERT INTO industry_student_projects
       (user_id, project_id, status, progress, output_links)
       VALUES ($1, $2, 'in_progress', 0, '[]'::jsonb)
       ON CONFLICT (user_id, project_id)
       DO UPDATE SET
         status = 'in_progress',
         updated_at = NOW()
       RETURNING *`,
      [userId, projectId]
    );

    res.status(201).json({ studentProject: upsert.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/student-projects/:studentProjectId", async (req, res, next) => {
  try {
    const studentProjectId = Number(req.params.studentProjectId);
    const existing = await query(
      `SELECT * FROM industry_student_projects WHERE id = $1 LIMIT 1`,
      [studentProjectId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: "Student project not found" });
    const current = existing.rows[0];

    const outputLinks = Array.isArray(req.body?.outputLinks) ? req.body.outputLinks : (current.output_links || []);
    const updated = await query(
      `UPDATE industry_student_projects
       SET progress = $1,
           status = $2,
           output_links = $3::jsonb,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        req.body?.progress ?? current.progress,
        req.body?.status ?? current.status,
        JSON.stringify(outputLinks),
        studentProjectId
      ]
    );

    res.json({ studentProject: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/opportunities", async (req, res, next) => {
  try {
    const userId = Number(req.query.userId);
    const context = userId ? await getStudentContext(userId) : null;
    const safeContext = context || { levelNum: 1, city: null, skillMap: new Map() };
    const items = await listOpportunities(safeContext, {
      level: req.query.level,
      type: req.query.type,
      locationMode: req.query.locationMode,
      city: req.query.city,
      limit: toLimit(req.query.limit, 40, 120)
    });

    const minHours = req.query.minHours ? Number(req.query.minHours) : null;
    const maxHours = req.query.maxHours ? Number(req.query.maxHours) : null;
    const salaryFrom = req.query.salaryFrom ? Number(req.query.salaryFrom) : null;
    const salaryTo = req.query.salaryTo ? Number(req.query.salaryTo) : null;

    let filtered = items;
    if (Number.isFinite(minHours)) filtered = filtered.filter((item) => Number(item.hours_per_week || 0) >= minHours);
    if (Number.isFinite(maxHours)) filtered = filtered.filter((item) => Number(item.hours_per_week || 0) <= maxHours);
    if (Number.isFinite(salaryFrom)) filtered = filtered.filter((item) => Number(item.salary_min || 0) >= salaryFrom);
    if (Number.isFinite(salaryTo)) filtered = filtered.filter((item) => Number(item.salary_max || 0) <= salaryTo);

    const offset = toOffset(req.query.offset);
    const limit = toLimit(req.query.limit, 20, 120);

    res.json({
      total: filtered.length,
      limit,
      offset,
      items: filtered.slice(offset, offset + limit)
    });
  } catch (error) {
    next(error);
  }
});

router.get("/opportunities/:opportunityId", async (req, res, next) => {
  try {
    const opportunityId = Number(req.params.opportunityId);

    const result = await query(
      `SELECT o.*, c.name AS company_name, c.domain AS company_domain, c.city AS company_city, c.website_url, c.linkedin_url, c.is_verified
       FROM industry_opportunities o
       LEFT JOIN industry_companies c ON c.id = o.company_id
       WHERE o.id = $1
       LIMIT 1`,
      [opportunityId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Opportunity not found" });

    const contacts = await query(
      `SELECT *
       FROM industry_company_contacts
       WHERE company_id = $1
       ORDER BY created_at DESC`,
      [result.rows[0].company_id || 0]
    );

    res.json({
      opportunity: result.rows[0],
      companyContacts: contacts.rows
    });
  } catch (error) {
    next(error);
  }
});

router.get("/saved/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const rows = await query(
      `SELECT s.*, o.title AS opportunity_title, o.opportunity_type, o.level, o.deadline_at
       FROM industry_saved_opportunities s
       JOIN industry_opportunities o ON o.id = s.opportunity_id
       WHERE s.user_id = $1
       ORDER BY s.updated_at DESC`,
      [userId]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/saved-opportunities/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const context = await getStudentContext(userId);
    const safeContext = context || { levelNum: 1, city: null, skillMap: new Map() };
    const rows = await query(
      `SELECT s.id AS saved_id,
              s.follow_up_status,
              s.follow_up_note,
              s.updated_at AS saved_updated_at,
              o.id AS opportunity_id,
              o.title,
              o.description,
              o.opportunity_type,
              o.level,
              o.location_mode,
              o.city,
              o.hours_per_week,
              o.salary_min,
              o.salary_max,
              o.deadline_at,
              o.required_skills,
              c.name AS company_name,
              c.city AS company_city
       FROM industry_saved_opportunities s
       JOIN industry_opportunities o ON o.id = s.opportunity_id
       LEFT JOIN industry_companies c ON c.id = o.company_id
       WHERE s.user_id = $1
       ORDER BY s.updated_at DESC
       LIMIT $2`,
      [userId, toLimit(req.query.limit, 20, 100)]
    );

    const items = rows.rows.map((item) => ({
      id: item.opportunity_id,
      saved_id: item.saved_id,
      title: item.title,
      description: item.description,
      opportunity_type: item.opportunity_type,
      level: item.level,
      location_mode: item.location_mode,
      city: item.city,
      hours_per_week: item.hours_per_week,
      salary_min: item.salary_min,
      salary_max: item.salary_max,
      deadline_at: item.deadline_at,
      required_skills: item.required_skills,
      company_name: item.company_name,
      company_city: item.company_city,
      follow_up_status: item.follow_up_status,
      follow_up_note: item.follow_up_note,
      updated_at: item.saved_updated_at,
      matchScore: scoreOpportunity(item, safeContext)
    }));

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.delete("/saved-opportunities/:opportunityId", async (req, res, next) => {
  try {
    const opportunityId = Number(req.params.opportunityId);
    const userId = Number(req.body?.userId || req.query?.userId);
    if (!opportunityId || !userId) {
      return res.status(400).json({ error: "opportunityId and userId are required" });
    }

    const removed = await query(
      `DELETE FROM industry_saved_opportunities
       WHERE user_id = $1
         AND opportunity_id = $2
       RETURNING *`,
      [userId, opportunityId]
    );

    if (!removed.rows.length) return res.status(404).json({ error: "Saved opportunity not found" });
    res.json({ removed: true, item: removed.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/opportunities/:opportunityId/apply", async (req, res, next) => {
  try {
    const opportunityId = Number(req.params.opportunityId);
    const userId = Number(req.body?.userId);
    if (!opportunityId || !userId) return res.status(400).json({ error: "opportunityId and userId are required" });

    const upsert = await query(
      `INSERT INTO industry_applications
       (user_id, opportunity_id, status, note)
       VALUES ($1, $2, 'submitted', $3)
       ON CONFLICT (user_id, opportunity_id)
       DO UPDATE SET
         status = 'submitted',
         note = EXCLUDED.note,
         updated_at = NOW()
       RETURNING *`,
      [userId, opportunityId, req.body?.note || null]
    );

    res.status(201).json({ application: upsert.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/opportunities/:opportunityId/application", async (req, res, next) => {
  try {
    const opportunityId = Number(req.params.opportunityId);
    const userId = Number(req.body?.userId);
    if (!opportunityId || !userId) return res.status(400).json({ error: "opportunityId and userId are required" });

    const status = normalizeApplicationStatus(req.body?.status, "draft");
    const upsert = await query(
      `INSERT INTO industry_applications
       (user_id, opportunity_id, status, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, opportunity_id)
       DO UPDATE SET
         status = EXCLUDED.status,
         note = EXCLUDED.note,
         updated_at = NOW()
       RETURNING *`,
      [userId, opportunityId, status, req.body?.note || null]
    );

    res.status(201).json({ application: upsert.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/opportunities/:opportunityId/save", async (req, res, next) => {
  try {
    const opportunityId = Number(req.params.opportunityId);
    const userId = Number(req.body?.userId);
    if (!opportunityId || !userId) return res.status(400).json({ error: "opportunityId and userId are required" });

    const upsert = await query(
      `INSERT INTO industry_saved_opportunities
       (user_id, opportunity_id, follow_up_status)
       VALUES ($1, $2, 'saved')
       ON CONFLICT (user_id, opportunity_id)
       DO UPDATE SET
         follow_up_status = 'saved',
         updated_at = NOW()
       RETURNING *`,
      [userId, opportunityId]
    );

    res.status(201).json({ saved: upsert.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/opportunities/:opportunityId/follow-up", async (req, res, next) => {
  try {
    const opportunityId = Number(req.params.opportunityId);
    const userId = Number(req.body?.userId);
    if (!opportunityId || !userId) return res.status(400).json({ error: "opportunityId and userId are required" });

    const updated = await query(
      `UPDATE industry_saved_opportunities
       SET follow_up_status = $1,
           follow_up_note = $2,
           updated_at = NOW()
       WHERE user_id = $3
         AND opportunity_id = $4
       RETURNING *`,
      [
        req.body?.followUpStatus || "pending-follow-up",
        req.body?.followUpNote || null,
        userId,
        opportunityId
      ]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Saved opportunity not found" });
    res.json({ saved: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/applications/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const apps = await query(
      `SELECT a.*, o.title AS opportunity_title, o.opportunity_type, o.level
       FROM industry_applications a
       JOIN industry_opportunities o ON o.id = a.opportunity_id
       WHERE a.user_id = $1
       ORDER BY a.updated_at DESC`,
      [userId]
    );

    res.json({ items: apps.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
