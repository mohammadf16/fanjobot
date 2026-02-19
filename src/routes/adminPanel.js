const express = require("express");
const { query } = require("../db");
const { config } = require("../config");

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!config.adminApiKey) {
    return res.status(503).json({ error: "ADMIN_API_KEY is not configured" });
  }

  const token = req.headers["x-admin-key"];
  if (!token || token !== config.adminApiKey) {
    return res.status(401).json({ error: "Unauthorized admin request" });
  }

  return next();
}

function toLimit(raw, fallback = 50, max = 200) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

async function createNotification({ type, title, message, payload }) {
  await query(
    `INSERT INTO admin_notifications
     (type, title, message, payload, status)
     VALUES ($1, $2, $3, $4::jsonb, 'open')`,
    [type, title, message, JSON.stringify(payload || {})]
  );
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
    const rows = await query(
      `SELECT *
       FROM contents
       WHERE ($1::text IS NULL OR type = $1)
         AND ($2::text IS NULL OR kind = $2)
         AND ($3::text IS NULL OR is_published = $3)
       ORDER BY created_at DESC
       LIMIT $4`,
      [
        req.query.type || null,
        req.query.kind || null,
        req.query.isPublished === undefined ? null : String(req.query.isPublished).toLowerCase() === "true",
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
          JSON.stringify(Array.isArray(submission.tags) ? submission.tags : [])
        ]
      );

      if (submission.external_link) {
        await query(
          `INSERT INTO content_files
           (content_id, drive_file_id, drive_link, mime_type)
           VALUES ($1, $2, $3, $4)`,
          [insertedContent.rows[0].id, `community-${submission.id}`, submission.external_link, null]
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
