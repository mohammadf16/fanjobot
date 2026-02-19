const express = require("express");
const { query } = require("../db");
const { config } = require("../config");
const { getLogs } = require("../services/logger");

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!config.adminApiKey) {
    return res.status(503).json({ error: "ADMIN_API_KEY is not configured" });
  }

  const token = req.headers["x-admin-key"];
  if (!token || token !== config.adminApiKey) {
    return res.status(401).json({ error: "Unauthorized admin request" });
  }

  if (config.adminUserId) {
    const adminId = String(req.headers["x-admin-id"] || "").trim();
    if (!adminId || adminId !== String(config.adminUserId)) {
      return res.status(401).json({ error: "Unauthorized admin id" });
    }
  }

  return next();
}

function toLimit(raw, fallback = 50, max = 200) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function toStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (value === undefined || value === null || value === "") return [];
  return String(value)
    .split(/[,،]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toSkillsArray(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || "").trim();
      if (!name) return null;
      const parsedScore = Number(item.score);
      const score = Number.isFinite(parsedScore) ? Math.min(10, Math.max(1, parsedScore)) : 5;
      return { name, score };
    })
    .filter(Boolean);
}

function extractDriveMetaFromTags(tags) {
  const values = Array.isArray(tags) ? tags.map((item) => String(item || "")) : [];
  const driveFileId = values.find((item) => item.startsWith("_drive_file_id:"))?.replace("_drive_file_id:", "") || null;
  const mimeType = values.find((item) => item.startsWith("_drive_mime:"))?.replace("_drive_mime:", "") || null;
  const cleanTags = values.filter((item) => !item.startsWith("_drive_file_id:") && !item.startsWith("_drive_mime:"));

  return { driveFileId, mimeType, cleanTags };
}

async function createNotification({ type, title, message, payload }) {
  await query(
    `INSERT INTO admin_notifications
     (type, title, message, payload, status)
     VALUES ($1, $2, $3, $4::jsonb, 'open')`,
    [type, title, message, JSON.stringify(payload || {})]
  );
}

function normalizeProfileForUpsert(rawInput, fallback = null) {
  if (!rawInput || typeof rawInput !== "object") {
    return null;
  }

  const base = fallback || {};
  const major = toNullableString(rawInput.major ?? base.major);
  const level = toNullableString(rawInput.level ?? base.level);
  const term = toNullableString(rawInput.term ?? base.term);
  const skillLevel = toNullableString(rawInput.skillLevel ?? rawInput.skill_level ?? base.skill_level ?? base.skillLevel);
  const shortTermGoal = toNullableString(rawInput.shortTermGoal ?? rawInput.short_term_goal ?? base.short_term_goal ?? base.shortTermGoal);
  const weeklyRaw = rawInput.weeklyHours ?? rawInput.weekly_hours ?? base.weekly_hours ?? base.weeklyHours;
  const weeklyHours = Number(weeklyRaw);

  if (!major || !level || !term || !skillLevel || !shortTermGoal || !Number.isFinite(weeklyHours) || weeklyHours <= 0) {
    throw new Error(
      "Profile requires major, level, term, skillLevel, shortTermGoal and weeklyHours (> 0)."
    );
  }

  return {
    university: toNullableString(rawInput.university ?? base.university),
    city: toNullableString(rawInput.city ?? base.city),
    major,
    level,
    term,
    interests: toStringArray(rawInput.interests ?? base.interests),
    skillLevel,
    shortTermGoal,
    weeklyHours: Math.floor(weeklyHours),
    resumeUrl: toNullableString(rawInput.resumeUrl ?? rawInput.resume_url ?? base.resume_url ?? base.resumeUrl),
    githubUrl: toNullableString(rawInput.githubUrl ?? rawInput.github_url ?? base.github_url ?? base.githubUrl),
    portfolioUrl: toNullableString(rawInput.portfolioUrl ?? rawInput.portfolio_url ?? base.portfolio_url ?? base.portfolioUrl),
    skills: toSkillsArray(rawInput.skills ?? base.skills),
    passedCourses: toStringArray(rawInput.passedCourses ?? rawInput.passed_courses ?? base.passed_courses ?? base.passedCourses)
  };
}

router.use(requireAdmin);

router.get("/notifications", async (req, res, next) => {
  try {
    const status = req.query.status || null;
    const rows = await query(
      `SELECT *
       FROM admin_notifications
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY created_at DESC
       LIMIT $2`,
      [status, toLimit(req.query.limit, 100)]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.patch("/notifications/:notificationId", async (req, res, next) => {
  try {
    const notificationId = Number(req.params.notificationId);
    const status = req.body?.status || "resolved";
    const updated = await query(
      `UPDATE admin_notifications
       SET status = $1,
           resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END
       WHERE id = $2
       RETURNING *`,
      [status, notificationId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Notification not found" });
    res.json({ notification: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/logs", async (req, res, next) => {
  try {
    const result = getLogs({
      level: req.query.level || null,
      search: req.query.search || null,
      limit: req.query.limit || 300
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/overview", async (req, res, next) => {
  try {
    const totalsRes = await query(
      `SELECT
         (SELECT COUNT(*) FROM users) AS total_users,
         (SELECT COUNT(*) FROM user_profiles) AS total_profiles,
         (SELECT COUNT(*) FROM contents) AS total_contents,
         (SELECT COUNT(*) FROM contents WHERE is_published = TRUE) AS published_contents,
         (SELECT COUNT(*) FROM industry_opportunities) AS total_opportunities,
         (SELECT COUNT(*) FROM industry_opportunities WHERE approval_status = 'pending') AS pending_opportunities,
         (SELECT COUNT(*) FROM industry_projects) AS total_projects,
         (SELECT COUNT(*) FROM industry_applications) AS total_applications,
         (SELECT COUNT(*) FROM community_content_submissions) AS total_submissions,
         (SELECT COUNT(*) FROM community_content_submissions WHERE status = 'pending') AS pending_submissions,
         (SELECT COUNT(*) FROM admin_notifications WHERE status = 'open') AS open_notifications`
    );

    const recentUsersRes = await query(
      `SELECT u.id, u.full_name, u.phone_or_email, u.telegram_id, u.created_at,
              CASE WHEN p.user_id IS NULL THEN FALSE ELSE TRUE END AS has_profile
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       ORDER BY u.created_at DESC
       LIMIT 8`
    );

    const totalsRaw = totalsRes.rows[0] || {};
    const totals = Object.fromEntries(
      Object.entries(totalsRaw).map(([key, value]) => [key, Number(value || 0)])
    );

    res.json({
      overview: totals,
      recentUsers: recentUsersRes.rows
    });
  } catch (error) {
    next(error);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const searchText = String(req.query.q || "").trim().toLowerCase();
    const search = searchText ? `%${searchText}%` : null;
    const hasProfile = req.query.hasProfile === undefined ? null : String(req.query.hasProfile).toLowerCase();
    const limit = toLimit(req.query.limit, 100, 300);

    const rows = await query(
      `SELECT u.id, u.full_name, u.phone_or_email, u.telegram_id, u.created_at,
              p.major, p.level, p.term, p.skill_level, p.updated_at AS profile_updated_at,
              CASE WHEN p.user_id IS NULL THEN FALSE ELSE TRUE END AS has_profile
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE ($1::text IS NULL
              OR LOWER(u.full_name) LIKE $1
              OR LOWER(u.phone_or_email) LIKE $1
              OR LOWER(COALESCE(u.telegram_id, '')) LIKE $1)
         AND ($2::text IS NULL
              OR ($2 = 'true' AND p.user_id IS NOT NULL)
              OR ($2 = 'false' AND p.user_id IS NULL))
       ORDER BY u.created_at DESC
       LIMIT $3`,
      [search, hasProfile, limit]
    );

    const count = await query(
      `SELECT COUNT(*) AS total
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE ($1::text IS NULL
              OR LOWER(u.full_name) LIKE $1
              OR LOWER(u.phone_or_email) LIKE $1
              OR LOWER(COALESCE(u.telegram_id, '')) LIKE $1)
         AND ($2::text IS NULL
              OR ($2 = 'true' AND p.user_id IS NOT NULL)
              OR ($2 = 'false' AND p.user_id IS NULL))`,
      [search, hasProfile]
    );

    res.json({
      items: rows.rows,
      total: Number(count.rows[0]?.total || 0),
      limit
    });
  } catch (error) {
    next(error);
  }
});

router.get("/users/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const userRes = await query(
      `SELECT u.id AS user_id, u.full_name, u.phone_or_email, u.telegram_id, u.created_at, p.*
       FROM users u
       LEFT JOIN user_profiles p ON p.user_id = u.id
       WHERE u.id = $1
       LIMIT 1`,
      [userId]
    );

    if (!userRes.rows.length) return res.status(404).json({ error: "User not found" });

    const [eventsRes, applicationsRes, projectsRes, submissionsRes] = await Promise.all([
      query(
        `SELECT id, event_type, payload, created_at
         FROM user_events
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId]
      ),
      query(
        `SELECT a.*, o.title AS opportunity_title
         FROM industry_applications a
         LEFT JOIN industry_opportunities o ON o.id = a.opportunity_id
         WHERE a.user_id = $1
         ORDER BY a.updated_at DESC
         LIMIT 20`,
        [userId]
      ),
      query(
        `SELECT sp.*, p.title AS project_title
         FROM industry_student_projects sp
         LEFT JOIN industry_projects p ON p.id = sp.project_id
         WHERE sp.user_id = $1
         ORDER BY sp.updated_at DESC
         LIMIT 20`,
        [userId]
      ),
      query(
        `SELECT id, section, content_kind, title, status, moderation_reason, created_at, reviewed_at
         FROM community_content_submissions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [userId]
      )
    ]);

    res.json({
      user: userRes.rows[0],
      activity: {
        events: eventsRes.rows,
        applications: applicationsRes.rows,
        studentProjects: projectsRes.rows,
        submissions: submissionsRes.rows
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post("/users/register", async (req, res, next) => {
  try {
    const fullName = toNullableString(req.body?.fullName);
    const phoneOrEmail = toNullableString(req.body?.phoneOrEmail);
    const telegramId = toNullableString(req.body?.telegramId);

    if (!fullName || !phoneOrEmail) {
      return res.status(400).json({ error: "fullName and phoneOrEmail are required" });
    }

    const inserted = await query(
      `INSERT INTO users (full_name, phone_or_email, telegram_id)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, phone_or_email, telegram_id, created_at`,
      [fullName, phoneOrEmail, telegramId]
    );

    const user = inserted.rows[0];
    let profile = null;

    if (req.body?.profile) {
      const normalized = normalizeProfileForUpsert(req.body.profile);
      const profileRes = await query(
        `INSERT INTO user_profiles
         (user_id, university, city, major, level, term, interests, skill_level, short_term_goal, weekly_hours, resume_url, github_url, portfolio_url, skills, passed_courses)
         VALUES
         ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb)
         RETURNING *`,
        [
          user.id,
          normalized.university,
          normalized.city,
          normalized.major,
          normalized.level,
          normalized.term,
          JSON.stringify(normalized.interests),
          normalized.skillLevel,
          normalized.shortTermGoal,
          normalized.weeklyHours,
          normalized.resumeUrl,
          normalized.githubUrl,
          normalized.portfolioUrl,
          JSON.stringify(normalized.skills),
          JSON.stringify(normalized.passedCourses)
        ]
      );

      profile = profileRes.rows[0];
    }

    res.status(201).json({ user, profile });
  } catch (error) {
    if (String(error?.message || "").includes("Profile requires")) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.patch("/users/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const existingUser = await query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [userId]);
    if (!existingUser.rows.length) return res.status(404).json({ error: "User not found" });

    const fields = [];
    const values = [];
    const fullName = req.body?.fullName;
    const phoneOrEmail = req.body?.phoneOrEmail;
    const telegramId = req.body?.telegramId;

    if (fullName !== undefined) {
      const normalized = toNullableString(fullName);
      if (!normalized) return res.status(400).json({ error: "fullName cannot be empty" });
      fields.push(`full_name = $${fields.length + 1}`);
      values.push(normalized);
    }
    if (phoneOrEmail !== undefined) {
      const normalized = toNullableString(phoneOrEmail);
      if (!normalized) return res.status(400).json({ error: "phoneOrEmail cannot be empty" });
      fields.push(`phone_or_email = $${fields.length + 1}`);
      values.push(normalized);
    }
    if (telegramId !== undefined) {
      fields.push(`telegram_id = $${fields.length + 1}`);
      values.push(toNullableString(telegramId));
    }

    let user = existingUser.rows[0];
    if (fields.length) {
      const updated = await query(
        `UPDATE users
         SET ${fields.join(", ")}
         WHERE id = $${fields.length + 1}
         RETURNING id, full_name, phone_or_email, telegram_id, created_at`,
        [...values, userId]
      );
      user = updated.rows[0];
    }

    let profile = null;
    if (req.body?.profile) {
      const existingProfile = await query(`SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1`, [userId]);
      const normalized = normalizeProfileForUpsert(req.body.profile, existingProfile.rows[0] || null);

      const upsert = await query(
        `INSERT INTO user_profiles
         (user_id, university, city, major, level, term, interests, skill_level, short_term_goal, weekly_hours, resume_url, github_url, portfolio_url, skills, passed_courses)
         VALUES
         ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb)
         ON CONFLICT (user_id)
         DO UPDATE SET
           university = EXCLUDED.university,
           city = EXCLUDED.city,
           major = EXCLUDED.major,
           level = EXCLUDED.level,
           term = EXCLUDED.term,
           interests = EXCLUDED.interests,
           skill_level = EXCLUDED.skill_level,
           short_term_goal = EXCLUDED.short_term_goal,
           weekly_hours = EXCLUDED.weekly_hours,
           resume_url = EXCLUDED.resume_url,
           github_url = EXCLUDED.github_url,
           portfolio_url = EXCLUDED.portfolio_url,
           skills = EXCLUDED.skills,
           passed_courses = EXCLUDED.passed_courses,
           updated_at = NOW()
         RETURNING *`,
        [
          userId,
          normalized.university,
          normalized.city,
          normalized.major,
          normalized.level,
          normalized.term,
          JSON.stringify(normalized.interests),
          normalized.skillLevel,
          normalized.shortTermGoal,
          normalized.weeklyHours,
          normalized.resumeUrl,
          normalized.githubUrl,
          normalized.portfolioUrl,
          JSON.stringify(normalized.skills),
          JSON.stringify(normalized.passedCourses)
        ]
      );

      profile = upsert.rows[0];
    } else {
      const current = await query(`SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1`, [userId]);
      profile = current.rows[0] || null;
    }

    res.json({ user, profile });
  } catch (error) {
    if (String(error?.message || "").includes("Profile requires")) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

router.delete("/users/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    if (config.adminUserId && String(userId) === String(config.adminUserId)) {
      return res.status(400).json({ error: "Configured admin user cannot be deleted" });
    }

    const removed = await query(`DELETE FROM users WHERE id = $1 RETURNING id`, [userId]);
    if (!removed.rows.length) return res.status(404).json({ error: "User not found" });

    res.json({ ok: true, userId });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/companies", async (req, res, next) => {
  try {
    const {
      name,
      domain,
      size,
      city,
      websiteUrl,
      linkedinUrl,
      isVerified = false
    } = req.body || {};

    if (!name) return res.status(400).json({ error: "name is required" });

    const inserted = await query(
      `INSERT INTO industry_companies
       (name, domain, size, city, website_url, linkedin_url, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, domain || null, size || null, city || null, websiteUrl || null, linkedinUrl || null, Boolean(isVerified)]
    );

    res.status(201).json({ company: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/companies/:companyId/contacts", async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    const { fullName, email, phone, role } = req.body || {};

    const inserted = await query(
      `INSERT INTO industry_company_contacts
       (company_id, full_name, email, phone, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [companyId, fullName || null, email || null, phone || null, role || null]
    );

    res.status(201).json({ contact: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/opportunities", async (req, res, next) => {
  try {
    const {
      companyId,
      opportunityType,
      title,
      description,
      locationMode,
      city,
      level,
      requiredSkills = [],
      hoursPerWeek,
      salaryMin,
      salaryMax,
      startDate,
      deadlineAt
    } = req.body || {};

    if (!title || !opportunityType) {
      return res.status(400).json({ error: "title and opportunityType are required" });
    }

    const inserted = await query(
      `INSERT INTO industry_opportunities
       (company_id, opportunity_type, title, description, location_mode, city, level, required_skills, hours_per_week, salary_min, salary_max, start_date, deadline_at, approval_status, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, 'pending', 'open')
       RETURNING *`,
      [
        companyId ? Number(companyId) : null,
        opportunityType,
        title,
        description || "",
        locationMode || "remote",
        city || null,
        level || "Intern",
        JSON.stringify(Array.isArray(requiredSkills) ? requiredSkills : []),
        hoursPerWeek ? Number(hoursPerWeek) : null,
        salaryMin ? Number(salaryMin) : null,
        salaryMax ? Number(salaryMax) : null,
        startDate || null,
        deadlineAt || null
      ]
    );

    await createNotification({
      type: "industry-opportunity-pending",
      title: "Opportunity requires approval",
      message: `${title} submitted for moderation`,
      payload: { opportunityId: inserted.rows[0].id }
    });

    res.status(201).json({ opportunity: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/industry/opportunities/:opportunityId/approval", async (req, res, next) => {
  try {
    const opportunityId = Number(req.params.opportunityId);
    const approvalStatus = req.body?.approvalStatus || "approved";

    const updated = await query(
      `UPDATE industry_opportunities
       SET approval_status = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [approvalStatus, opportunityId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Opportunity not found" });
    res.json({ opportunity: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/industry/opportunities/:opportunityId/status", async (req, res, next) => {
  try {
    const opportunityId = Number(req.params.opportunityId);
    const status = req.body?.status || "open";
    const updated = await query(
      `UPDATE industry_opportunities
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, opportunityId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Opportunity not found" });
    res.json({ opportunity: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/projects", async (req, res, next) => {
  try {
    const {
      companyId,
      type,
      title,
      brief,
      domain,
      level,
      estimatedHours,
      requiredSkills = [],
      deliverables = [],
      evaluationCriteria = [],
      resumeReady = true
    } = req.body || {};

    if (!type || !title || !brief) return res.status(400).json({ error: "type, title and brief are required" });

    const inserted = await query(
      `INSERT INTO industry_projects
       (company_id, type, title, brief, domain, level, estimated_hours, required_skills, deliverables, evaluation_criteria, resume_ready, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, 'open')
       RETURNING *`,
      [
        companyId ? Number(companyId) : null,
        type,
        title,
        brief,
        domain || null,
        level || "Intern",
        estimatedHours ? Number(estimatedHours) : null,
        JSON.stringify(Array.isArray(requiredSkills) ? requiredSkills : []),
        JSON.stringify(Array.isArray(deliverables) ? deliverables : []),
        JSON.stringify(Array.isArray(evaluationCriteria) ? evaluationCriteria : []),
        Boolean(resumeReady)
      ]
    );

    res.status(201).json({ project: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/industry/opportunities", async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT o.*, c.name AS company_name
       FROM industry_opportunities o
       LEFT JOIN industry_companies c ON c.id = o.company_id
       WHERE ($1::text IS NULL OR o.approval_status = $1)
         AND ($2::text IS NULL OR o.status = $2)
       ORDER BY o.created_at DESC
       LIMIT $3`,
      [req.query.approvalStatus || null, req.query.status || null, toLimit(req.query.limit, 100)]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.get("/industry/projects", async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT p.*, c.name AS company_name
       FROM industry_projects p
       LEFT JOIN industry_companies c ON c.id = p.company_id
       WHERE ($1::text IS NULL OR p.status = $1)
         AND ($2::text IS NULL OR p.type = $2)
       ORDER BY p.created_at DESC
       LIMIT $3`,
      [req.query.status || null, req.query.type || null, toLimit(req.query.limit, 100)]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.patch("/industry/projects/:projectId/status", async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const status = req.body?.status || "open";
    const updated = await query(
      `UPDATE industry_projects
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, projectId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Project not found" });
    res.json({ project: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/projects/:projectId/milestones", async (req, res, next) => {
  try {
    const projectId = Number(req.params.projectId);
    const { title, description, weekNo } = req.body || {};
    if (!title) return res.status(400).json({ error: "title is required" });

    const inserted = await query(
      `INSERT INTO industry_project_milestones
       (project_id, title, description, week_no)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [projectId, title, description || null, weekNo ? Number(weekNo) : null]
    );

    res.status(201).json({ milestone: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/milestones/:milestoneId/tasks", async (req, res, next) => {
  try {
    const milestoneId = Number(req.params.milestoneId);
    const { title, description, isRequired = true } = req.body || {};
    if (!title) return res.status(400).json({ error: "title is required" });

    const inserted = await query(
      `INSERT INTO industry_project_tasks
       (milestone_id, title, description, is_required)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [milestoneId, title, description || null, Boolean(isRequired)]
    );

    res.status(201).json({ task: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/career-paths", async (req, res, next) => {
  try {
    const { name, description, requiredSkills = [], sampleProjects = [], juniorReadyChecklist = [] } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const inserted = await query(
      `INSERT INTO industry_career_paths
       (name, description, required_skills, sample_projects, junior_ready_checklist, is_active)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, TRUE)
       RETURNING *`,
      [
        name,
        description || "",
        JSON.stringify(Array.isArray(requiredSkills) ? requiredSkills : []),
        JSON.stringify(Array.isArray(sampleProjects) ? sampleProjects : []),
        JSON.stringify(Array.isArray(juniorReadyChecklist) ? juniorReadyChecklist : [])
      ]
    );

    res.status(201).json({ careerPath: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/skills", async (req, res, next) => {
  try {
    const { name, category, isActive = true } = req.body || {};
    if (!name) return res.status(400).json({ error: "name is required" });

    const inserted = await query(
      `INSERT INTO industry_skills
       (name, category, is_active)
       VALUES ($1, $2, $3)
       ON CONFLICT (name)
       DO UPDATE SET
         category = EXCLUDED.category,
         is_active = EXCLUDED.is_active
       RETURNING *`,
      [name, category || null, Boolean(isActive)]
    );

    res.status(201).json({ skill: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/skill-requirements", async (req, res, next) => {
  try {
    const { targetType, targetId, skillId, requiredLevel = 1, weight = 1 } = req.body || {};
    if (!targetType || !targetId || !skillId) {
      return res.status(400).json({ error: "targetType, targetId and skillId are required" });
    }

    const inserted = await query(
      `INSERT INTO industry_skill_requirements
       (target_type, target_id, skill_id, required_level, weight)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [targetType, Number(targetId), Number(skillId), Number(requiredLevel), Number(weight)]
    );

    res.status(201).json({ requirement: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/roadmaps", async (req, res, next) => {
  try {
    const { careerPathId, title, description, isActive = true } = req.body || {};
    if (!careerPathId || !title) return res.status(400).json({ error: "careerPathId and title are required" });

    const inserted = await query(
      `INSERT INTO industry_roadmaps
       (career_path_id, title, description, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [Number(careerPathId), title, description || "", Boolean(isActive)]
    );

    res.status(201).json({ roadmap: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/roadmaps/:roadmapId/steps", async (req, res, next) => {
  try {
    const roadmapId = Number(req.params.roadmapId);
    const { stepOrder, title, skillName, contentRef, projectRef } = req.body || {};
    if (!title) return res.status(400).json({ error: "title is required" });

    const inserted = await query(
      `INSERT INTO industry_roadmap_steps
       (roadmap_id, step_order, title, skill_name, content_ref, project_ref)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [roadmapId, Number(stepOrder || 1), title, skillName || null, contentRef || null, projectRef || null]
    );

    res.status(201).json({ step: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/industry/roadmaps/:roadmapId/checklist", async (req, res, next) => {
  try {
    const roadmapId = Number(req.params.roadmapId);
    const { title } = req.body || {};
    if (!title) return res.status(400).json({ error: "title is required" });

    const inserted = await query(
      `INSERT INTO industry_checklist_items
       (roadmap_id, title, is_active)
       VALUES ($1, $2, TRUE)
       RETURNING *`,
      [roadmapId, title]
    );

    res.status(201).json({ checklistItem: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/industry/applications", async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT a.*, o.title AS opportunity_title, o.opportunity_type, o.level, u.full_name, u.phone_or_email
       FROM industry_applications a
       JOIN industry_opportunities o ON o.id = a.opportunity_id
       JOIN users u ON u.id = a.user_id
       WHERE ($1::text IS NULL OR a.status = $1)
       ORDER BY a.updated_at DESC
       LIMIT $2`,
      [req.query.status || null, toLimit(req.query.limit, 100)]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.patch("/industry/applications/:applicationId/status", async (req, res, next) => {
  try {
    const applicationId = Number(req.params.applicationId);
    const status = String(req.body?.status || "viewed").toLowerCase();
    const allowed = new Set(["draft", "submitted", "viewed", "interview", "rejected", "accepted"]);
    if (!allowed.has(status)) return res.status(400).json({ error: "Invalid application status" });

    const updated = await query(
      `UPDATE industry_applications
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, applicationId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Application not found" });
    res.json({ application: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/content", async (req, res, next) => {
  try {
    const rawPublished = req.query.isPublished;
    const isPublishedFilter =
      rawPublished === undefined
        ? null
        : String(rawPublished).toLowerCase() === "true"
        ? true
        : String(rawPublished).toLowerCase() === "false"
        ? false
        : null;

    const rows = await query(
      `SELECT *
       FROM contents
       WHERE ($1::text IS NULL OR type = $1)
         AND ($2::text IS NULL OR kind = $2)
         AND ($3::boolean IS NULL OR is_published = $3::boolean)
       ORDER BY created_at DESC
       LIMIT $4`,
      [
        req.query.type || null,
        req.query.kind || null,
        isPublishedFilter,
        toLimit(req.query.limit, 150)
      ]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.patch("/content/:contentId/publish", async (req, res, next) => {
  try {
    const contentId = Number(req.params.contentId);
    const isPublished = String(req.body?.isPublished || "true").toLowerCase() === "true";
    const updated = await query(
      `UPDATE contents
       SET is_published = $1
       WHERE id = $2
       RETURNING *`,
      [isPublished, contentId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Content not found" });
    res.json({ content: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/moderation/submissions", async (req, res, next) => {
  try {
    const status = req.query.status || null;
    const section = req.query.section || null;
    const contentKind = req.query.contentKind || null;
    const rows = await query(
      `SELECT *
       FROM community_content_submissions
       WHERE ($1::text IS NULL OR status = $1)
         AND ($2::text IS NULL OR section = $2)
         AND ($3::text IS NULL OR content_kind = $3)
       ORDER BY created_at DESC
       LIMIT $4`,
      [status, section, contentKind, toLimit(req.query.limit, 100)]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.post("/moderation/submissions/:submissionId/review", async (req, res, next) => {
  try {
    const submissionId = Number(req.params.submissionId);
    const action = req.body?.action || "approve";
    const reason = req.body?.reason || null;

    const submissionRes = await query(
      `SELECT *
       FROM community_content_submissions
       WHERE id = $1
       LIMIT 1`,
      [submissionId]
    );
    if (!submissionRes.rows.length) return res.status(404).json({ error: "Submission not found" });
    const submission = submissionRes.rows[0];

    if (action === "approve") {
      const driveMeta = extractDriveMetaFromTags(submission.tags);

      const insertedContent = await query(
        `INSERT INTO contents
         (created_by_user_id, title, description, type, kind, major, term, skill_level, tags, estimated_hours, is_published)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'beginner', $8::jsonb, NULL, TRUE)
         RETURNING *`,
        [
          submission.user_id,
          submission.title,
          submission.description,
          submission.section,
          submission.content_kind,
          submission.major || null,
          submission.term || null,
          JSON.stringify(driveMeta.cleanTags)
        ]
      );

      if (submission.external_link) {
        await query(
          `INSERT INTO content_files
           (content_id, drive_file_id, drive_link, mime_type)
           VALUES ($1, $2, $3, $4)`,
          [
            insertedContent.rows[0].id,
            driveMeta.driveFileId || `community-${submission.id}`,
            submission.external_link,
            driveMeta.mimeType
          ]
        );
      }

      const updated = await query(
        `UPDATE community_content_submissions
         SET status = 'approved',
             moderation_reason = $1,
             reviewed_at = NOW(),
             reviewed_by = 'admin'
         WHERE id = $2
         RETURNING *`,
        [reason, submissionId]
      );

      await createNotification({
        type: "submission-approved",
        title: "Community content approved",
        message: submission.title,
        payload: { submissionId, contentId: insertedContent.rows[0].id }
      });

      return res.json({ submission: updated.rows[0], content: insertedContent.rows[0] });
    }

    const rejected = await query(
      `UPDATE community_content_submissions
       SET status = 'rejected',
           moderation_reason = $1,
           reviewed_at = NOW(),
           reviewed_by = 'admin'
       WHERE id = $2
       RETURNING *`,
      [reason || "Rejected by admin moderation", submissionId]
    );

    await createNotification({
      type: "submission-rejected",
      title: "Community content rejected",
      message: submission.title,
      payload: { submissionId }
    });

    return res.json({ submission: rejected.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
