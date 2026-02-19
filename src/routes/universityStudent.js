const express = require("express");
const { query } = require("../db");
const {
  buildTermSuggestion,
  normalizeCourseCode,
  parsePrerequisites,
  rankResource
} = require("../services/universityStudent");

const router = express.Router();
const RESOURCE_KINDS = new Set([
  "resource",
  "note",
  "book",
  "video",
  "sample-question",
  "summary",
  "exam-tip",
  "course"
]);

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

function normalizeTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);

  return String(value)
    .split(/[,،]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function asBool(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return String(value).toLowerCase() === "true";
}

function groupBy(items, key) {
  const grouped = {};
  for (const item of items) {
    const value = item[key] || "unknown";
    if (!grouped[value]) grouped[value] = [];
    grouped[value].push(item);
  }
  return grouped;
}

async function getUserProfile(userId) {
  const res = await query(
    `SELECT user_id, major, term, level, skill_level, passed_courses
     FROM user_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  return res.rows[0] || null;
}

async function getPassedCourseCodes(userId, profile) {
  const passedFromProfile = Array.isArray(profile?.passed_courses)
    ? profile.passed_courses
    : [];

  const passedRows = await query(
    `SELECT course_code
     FROM user_passed_courses
     WHERE user_id = $1`,
    [userId]
  );

  const merged = [
    ...passedFromProfile.map((item) => String(item)),
    ...passedRows.rows.map((item) => String(item.course_code))
  ];

  return [...new Set(merged.map(normalizeCourseCode).filter(Boolean))];
}

async function getChartCourses(major) {
  const chartRes = await query(
    `SELECT *
     FROM university_course_chart
     WHERE ($1::text IS NULL OR major = $1 OR major IS NULL)
     ORDER BY recommended_term ASC, course_code ASC`,
    [major || null]
  );

  return chartRes.rows;
}

async function getOfferingsByTerm(term, major) {
  const offeringRes = await query(
    `SELECT o.*
     FROM university_term_offerings o
     WHERE o.offered_term = $1
       AND o.is_active = TRUE
       AND ($2::text IS NULL OR o.major = $2 OR o.major IS NULL)
     ORDER BY o.course_code ASC`,
    [String(term), major || null]
  );

  return offeringRes.rows;
}

async function resolveSuggestion(userId, term, limit = 6) {
  const profile = await getUserProfile(userId);
  if (!profile) return null;

  const targetTerm = String(term || profile.term || "1");
  const chartCourses = await getChartCourses(profile.major);
  const offerings = await getOfferingsByTerm(targetTerm, profile.major);
  const passedCourseCodes = await getPassedCourseCodes(userId, profile);
  const suggestion = buildTermSuggestion({
    chartCourses,
    offerings,
    passedCourseCodes,
    targetTerm: Number(targetTerm),
    limit
  });

  return {
    profile,
    targetTerm,
    passedCourseCodes,
    offerings,
    ...suggestion
  };
}

router.post("/course-chart", async (req, res, next) => {
  try {
    const {
      courseCode,
      courseTitle,
      major,
      recommendedTerm,
      credits,
      prerequisites = [],
      isCore = true
    } = req.body || {};

    if (!courseCode || !courseTitle) {
      return res.status(400).json({ error: "courseCode and courseTitle are required" });
    }

    const upsert = await query(
      `INSERT INTO university_course_chart
       (course_code, course_title, major, recommended_term, credits, prerequisites, is_core)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (course_code, major)
       DO UPDATE SET
         course_title = EXCLUDED.course_title,
         recommended_term = EXCLUDED.recommended_term,
         credits = EXCLUDED.credits,
         prerequisites = EXCLUDED.prerequisites,
         is_core = EXCLUDED.is_core,
         updated_at = NOW()
       RETURNING *`,
      [
        normalizeCourseCode(courseCode),
        String(courseTitle).trim(),
        major || null,
        String(recommendedTerm || "1"),
        Number(credits || 3),
        JSON.stringify(prerequisites.map(normalizeCourseCode).filter(Boolean)),
        Boolean(isCore)
      ]
    );

    res.status(201).json({ course: upsert.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/term-offerings", async (req, res, next) => {
  try {
    const {
      courseCode,
      offeredTerm,
      major,
      instructorName,
      capacity,
      isActive = true
    } = req.body || {};

    if (!courseCode || !offeredTerm) {
      return res.status(400).json({ error: "courseCode and offeredTerm are required" });
    }

    const inserted = await query(
      `INSERT INTO university_term_offerings
       (course_code, offered_term, major, instructor_name, capacity, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        normalizeCourseCode(courseCode),
        String(offeredTerm),
        major || null,
        instructorName || null,
        capacity ? Number(capacity) : null,
        Boolean(isActive)
      ]
    );

    res.status(201).json({ offering: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/passed-courses", async (req, res, next) => {
  try {
    const { userId, courses } = req.body || {};
    if (!userId || !Array.isArray(courses) || !courses.length) {
      return res.status(400).json({ error: "userId and courses[] are required" });
    }

    const upserts = [];

    for (const item of courses) {
      if (!item?.courseCode) continue;
      const result = await query(
        `INSERT INTO user_passed_courses
         (user_id, course_code, course_title, grade, passed_term)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, course_code)
         DO UPDATE SET
           course_title = EXCLUDED.course_title,
           grade = EXCLUDED.grade,
           passed_term = EXCLUDED.passed_term,
           updated_at = NOW()
         RETURNING *`,
        [
          Number(userId),
          normalizeCourseCode(item.courseCode),
          item.courseTitle || null,
          item.grade || null,
          item.passedTerm || null
        ]
      );
      upserts.push(result.rows[0]);
    }

    res.status(201).json({ items: upserts });
  } catch (error) {
    next(error);
  }
});

router.get("/term-suggestion/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const limit = toLimit(req.query.limit, 6, 20);
    const data = await resolveSuggestion(userId, req.query.term, limit);

    if (!data) {
      return res.status(404).json({ error: "User profile not found" });
    }

    res.json({
      userId,
      major: data.profile.major,
      currentTerm: data.profile.term,
      targetTerm: data.targetTerm,
      recommendedCourses: data.recommended,
      blockedCourses: data.blocked,
      notOfferedCourses: data.notOffered
    });
  } catch (error) {
    next(error);
  }
});

router.get("/dashboard/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const suggestion = await resolveSuggestion(userId, req.query.term, 5);

    if (!suggestion) {
      return res.status(404).json({ error: "User profile not found" });
    }

    const upcoming = await query(
      `SELECT *
       FROM university_deadlines
       WHERE user_id = $1
         AND status = 'open'
       ORDER BY due_at ASC
       LIMIT 10`,
      [userId]
    );

    const resources = await query(
      `SELECT id, title, kind, term, major, skill_level, tags, created_at
       FROM contents
       WHERE type = 'university'
         AND kind IN ('note', 'book', 'resource', 'exam-tip')
         AND is_published = TRUE
         AND ($1::text IS NULL OR major = $1 OR major IS NULL)
         AND ($2::text IS NULL OR term = $2 OR term IS NULL)
       ORDER BY created_at DESC
       LIMIT 60`,
      [suggestion.profile.major || null, suggestion.targetTerm || null]
    );

    const rankedResources = resources.rows
      .map((item) => ({
        ...item,
        score: rankResource(item, {
          skillLevel: suggestion.profile.skill_level,
          term: suggestion.targetTerm
        })
      }))
      .sort((a, b) => b.score - a.score);

    const personalSuggestions = suggestion.recommended.slice(0, 3).map((course, index) => {
      const linked = rankedResources[index];
      if (linked) {
        return {
          courseCode: course.courseCode,
          message: `برای ${course.course_title} اول ${linked.kind} «${linked.title}» را مطالعه کنید.`
        };
      }

      return {
        courseCode: course.courseCode,
        message: `برای ${course.course_title}، تمرین هفتگی و مرور پیش‌نیازها را در اولویت بگذارید.`
      };
    });

    res.json({
      userId,
      dashboard: {
        myTerm: suggestion.targetTerm,
        major: suggestion.profile.major,
        termCourses: suggestion.recommended,
        upcomingWorks: upcoming.rows,
        personalSuggestions
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/courses", async (req, res, next) => {
  try {
    const userId = Number(req.query.userId);
    if (!userId) return res.status(400).json({ error: "userId is required" });

    const suggestion = await resolveSuggestion(userId, req.query.term, toLimit(req.query.limit, 8, 30));
    if (!suggestion) {
      return res.status(404).json({ error: "User profile not found" });
    }

    const offeredThisTerm = await getOfferingsByTerm(suggestion.targetTerm, suggestion.profile.major);

    res.json({
      userId,
      major: suggestion.profile.major,
      targetTerm: suggestion.targetTerm,
      passedCourseCodes: suggestion.passedCourseCodes,
      offeredThisTerm,
      recommendedCourses: suggestion.recommended,
      blockedCourses: suggestion.blocked
    });
  } catch (error) {
    next(error);
  }
});

router.get("/courses/:courseCode", async (req, res, next) => {
  try {
    const courseCode = normalizeCourseCode(req.params.courseCode);
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const profile = userId ? await getUserProfile(userId) : null;

    const courseRes = await query(
      `SELECT *
       FROM university_course_chart
       WHERE course_code = $1
         AND ($2::text IS NULL OR major = $2 OR major IS NULL)
       ORDER BY major DESC
       LIMIT 1`,
      [courseCode, profile?.major || null]
    );

    if (!courseRes.rows.length) {
      return res.status(404).json({ error: "Course not found in chart" });
    }

    const course = courseRes.rows[0];
    const prerequisites = parsePrerequisites(course.prerequisites);
    const passedCodes = userId ? await getPassedCourseCodes(userId, profile) : [];

    const resources = await query(
      `SELECT id, title, description, kind, tags, created_at
       FROM contents
       WHERE type = 'university'
         AND kind IN ('resource', 'note', 'book', 'video', 'sample-question', 'summary', 'exam-tip', 'course')
         AND is_published = TRUE
         AND ($1::text IS NULL OR major = $1 OR major IS NULL)
         AND (LOWER(title) LIKE $2 OR LOWER(description) LIKE $2)
       ORDER BY created_at DESC
       LIMIT 100`,
      [profile?.major || course.major || null, `%${(course.course_title || "").toLowerCase()}%`]
    );

    const groupedResources = groupBy(resources.rows, "kind");

    res.json({
      course: {
        ...course,
        courseCode,
        prerequisites: prerequisites.map((code) => ({
          code,
          passed: passedCodes.includes(code)
        }))
      },
      studyPath: [
        "1) مرور پیش‌نیازها",
        "2) مطالعه جزوه اصلی",
        "3) حل تمرین‌های منتخب",
        "4) بررسی نمونه‌سوال و نکات امتحانی"
      ],
      resources: {
        notes: groupedResources.note || [],
        books: groupedResources.book || [],
        examTips: groupedResources["exam-tip"] || [],
        sampleQuestions: groupedResources["sample-question"] || [],
        summaries: groupedResources.summary || [],
        practice: groupedResources.resource || [],
        videos: groupedResources.video || []
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get("/professors", async (req, res, next) => {
  try {
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const profile = userId ? await getUserProfile(userId) : null;
    const q = String(req.query.q || "").trim().toLowerCase();
    const limit = toLimit(req.query.limit);

    const professors = await query(
      `SELECT id, title, description, major, term, created_at
       FROM contents
       WHERE type = 'university'
         AND kind = 'professor'
         AND is_published = TRUE
         AND ($1::text IS NULL OR major = $1 OR major IS NULL)
       ORDER BY created_at DESC
       LIMIT $2`,
      [profile?.major || req.query.major || null, limit]
    );

    const filtered = professors.rows.filter((item) => {
      if (!q) return true;
      return String(item.title || "").toLowerCase().includes(q) || String(item.description || "").toLowerCase().includes(q);
    });

    const items = [];
    for (const item of filtered) {
      const stats = await query(
        `SELECT
          COUNT(*) AS review_count,
          AVG(difficulty_score) AS avg_difficulty,
          AVG(grading_score) AS avg_grading
         FROM university_professor_reviews
         WHERE professor_name = $1
           AND is_approved = TRUE`,
        [item.title]
      );

      items.push({
        ...item,
        reviewCount: Number(stats.rows[0]?.review_count || 0),
        averageDifficulty: Number(stats.rows[0]?.avg_difficulty || 0),
        averageGrading: Number(stats.rows[0]?.avg_grading || 0)
      });
    }

    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.get("/professors/:professorName", async (req, res, next) => {
  try {
    const professorName = decodeURIComponent(req.params.professorName);

    const profileRes = await query(
      `SELECT *
       FROM contents
       WHERE type = 'university'
         AND kind = 'professor'
         AND title = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [professorName]
    );

    const reviewsRes = await query(
      `SELECT *
       FROM university_professor_reviews
       WHERE professor_name = $1
         AND is_approved = TRUE
       ORDER BY created_at DESC
       LIMIT 100`,
      [professorName]
    );

    const resourceRes = await query(
      `SELECT id, title, description, kind, created_at
       FROM contents
       WHERE type = 'university'
         AND kind IN ('note', 'book', 'resource', 'video')
         AND is_published = TRUE
         AND (LOWER(title) LIKE $1 OR LOWER(description) LIKE $1)
       ORDER BY created_at DESC
       LIMIT 20`,
      [`%${professorName.toLowerCase()}%`]
    );

    if (!profileRes.rows.length) {
      return res.status(404).json({ error: "Professor profile not found" });
    }

    const reviews = reviewsRes.rows;
    const avgDifficulty = reviews.length
      ? reviews.reduce((acc, item) => acc + Number(item.difficulty_score || 0), 0) / reviews.length
      : 0;
    const avgGrading = reviews.length
      ? reviews.reduce((acc, item) => acc + Number(item.grading_score || 0), 0) / reviews.length
      : 0;

    res.json({
      professor: profileRes.rows[0],
      quality: {
        reviewCount: reviews.length,
        averageDifficulty: Number(avgDifficulty.toFixed(2)),
        averageGrading: Number(avgGrading.toFixed(2))
      },
      recommendedResources: resourceRes.rows,
      reviews
    });
  } catch (error) {
    next(error);
  }
});

router.post("/professors/reviews", async (req, res, next) => {
  try {
    const {
      userId,
      professorName,
      courseCode,
      teachingStyle,
      difficultyScore,
      gradingScore,
      reviewText
    } = req.body || {};

    if (!userId || !professorName || !reviewText) {
      return res.status(400).json({ error: "userId, professorName and reviewText are required" });
    }

    const inserted = await query(
      `INSERT INTO university_professor_reviews
       (user_id, professor_name, course_code, teaching_style, difficulty_score, grading_score, review_text, is_approved)
       VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE)
       RETURNING *`,
      [
        Number(userId),
        String(professorName),
        courseCode ? normalizeCourseCode(courseCode) : null,
        teachingStyle || null,
        difficultyScore ? Number(difficultyScore) : null,
        gradingScore ? Number(gradingScore) : null,
        String(reviewText)
      ]
    );

    res.status(201).json({
      review: inserted.rows[0],
      message: "Review submitted and waiting for quality approval."
    });
  } catch (error) {
    next(error);
  }
});

router.post("/professors/reviews/:reviewId/approve", async (req, res, next) => {
  try {
    const reviewId = Number(req.params.reviewId);
    const updated = await query(
      `UPDATE university_professor_reviews
       SET is_approved = TRUE, approved_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [reviewId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Review not found" });
    res.json({ review: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/resources", async (req, res, next) => {
  try {
    const userId = req.query.userId ? Number(req.query.userId) : null;
    const profile = userId ? await getUserProfile(userId) : null;
    const major = req.query.major || profile?.major || null;
    const term = req.query.term || profile?.term || null;
    const skillLevel = req.query.level || profile?.skill_level || null;
    const q = String(req.query.q || "").trim().toLowerCase();
    const kind = req.query.kind ? String(req.query.kind).trim() : "";
    const sort = String(req.query.sort || "quality");
    const tagFilters = normalizeTags(req.query.tags);
    const limit = toLimit(req.query.limit, 20, 80);
    const offset = toOffset(req.query.offset);

    const resources = await query(
      `SELECT c.*, cf.drive_file_id, cf.drive_link, cf.mime_type
       FROM contents c
       LEFT JOIN content_files cf ON cf.content_id = c.id
       WHERE c.type = 'university'
         AND c.kind IN ('resource', 'note', 'book', 'video', 'sample-question', 'summary', 'exam-tip', 'course')
         AND c.is_published = TRUE
         AND ($1::text IS NULL OR c.major = $1 OR c.major IS NULL)
         AND ($2::text IS NULL OR c.term = $2 OR c.term IS NULL)
       ORDER BY c.created_at DESC
       LIMIT 400`,
      [major, term]
    );

    let filtered = resources.rows.filter((item) => {
      if (kind && item.kind !== kind) return false;

      if (q) {
        const haystack = `${item.title || ""} ${item.description || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (tagFilters.length) {
        const itemTags = normalizeTags(item.tags);
        for (const tag of tagFilters) {
          if (!itemTags.includes(tag)) return false;
        }
      }

      return RESOURCE_KINDS.has(item.kind);
    });

    filtered = filtered.map((item) => ({
      ...item,
      qualityScore: rankResource(item, { skillLevel, term })
    }));

    if (sort === "recent") {
      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sort === "level") {
      filtered.sort((a, b) => String(a.skill_level || "").localeCompare(String(b.skill_level || "")));
    } else {
      filtered.sort((a, b) => b.qualityScore - a.qualityScore);
    }

    const paged = filtered.slice(offset, offset + limit);

    res.json({
      total: filtered.length,
      limit,
      offset,
      items: paged
    });
  } catch (error) {
    next(error);
  }
});

router.get("/study-plan/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const period = String(req.query.period || "weekly").toLowerCase();
    const limit = toLimit(req.query.limit, 100, 300);

    const tasksRes = await query(
      `SELECT *
       FROM university_study_tasks
       WHERE user_id = $1
       ORDER BY planned_for ASC, created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    const tasks = tasksRes.rows;
    const completed = tasks.filter((item) => item.status === "done").length;

    res.json({
      userId,
      period,
      summary: {
        totalTasks: tasks.length,
        completedTasks: completed,
        completionRate: tasks.length ? Number(((completed / tasks.length) * 100).toFixed(2)) : 0
      },
      grouped: period === "daily" ? groupBy(tasks, "planned_for") : groupBy(tasks, "week_label"),
      tasks
    });
  } catch (error) {
    next(error);
  }
});

router.post("/study-plan/tasks", async (req, res, next) => {
  try {
    const {
      userId,
      courseCode,
      title,
      taskType,
      plannedFor,
      weekLabel,
      estimatedMinutes,
      checklist = []
    } = req.body || {};

    if (!userId || !title) {
      return res.status(400).json({ error: "userId and title are required" });
    }

    const inserted = await query(
      `INSERT INTO university_study_tasks
       (user_id, course_code, title, task_type, status, planned_for, week_label, estimated_minutes, checklist)
       VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8::jsonb)
       RETURNING *`,
      [
        Number(userId),
        courseCode ? normalizeCourseCode(courseCode) : null,
        String(title),
        taskType || "study",
        plannedFor || null,
        weekLabel || null,
        estimatedMinutes ? Number(estimatedMinutes) : null,
        JSON.stringify(Array.isArray(checklist) ? checklist : [])
      ]
    );

    res.status(201).json({ task: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/study-plan/tasks/:taskId", async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    const existing = await query(`SELECT * FROM university_study_tasks WHERE id = $1 LIMIT 1`, [taskId]);
    if (!existing.rows.length) return res.status(404).json({ error: "Task not found" });

    const current = existing.rows[0];
    const {
      title,
      status,
      plannedFor,
      weekLabel,
      estimatedMinutes,
      checklist
    } = req.body || {};

    const updated = await query(
      `UPDATE university_study_tasks
       SET title = $1,
           status = $2,
           planned_for = $3,
           week_label = $4,
           estimated_minutes = $5,
           checklist = $6::jsonb,
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        title ?? current.title,
        status ?? current.status,
        plannedFor ?? current.planned_for,
        weekLabel ?? current.week_label,
        estimatedMinutes ?? current.estimated_minutes,
        JSON.stringify(Array.isArray(checklist) ? checklist : (current.checklist || [])),
        taskId
      ]
    );

    res.json({ task: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/deadlines", async (req, res, next) => {
  try {
    const { userId, courseCode, title, itemType, dueAt } = req.body || {};
    if (!userId || !title || !itemType || !dueAt) {
      return res.status(400).json({ error: "userId, title, itemType and dueAt are required" });
    }

    const inserted = await query(
      `INSERT INTO university_deadlines
       (user_id, course_code, title, item_type, due_at, status)
       VALUES ($1, $2, $3, $4, $5, 'open')
       RETURNING *`,
      [Number(userId), courseCode ? normalizeCourseCode(courseCode) : null, title, itemType, dueAt]
    );

    res.status(201).json({ deadline: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/deadlines/:userId", async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);
    const status = req.query.status || "open";
    const rows = await query(
      `SELECT *
       FROM university_deadlines
       WHERE user_id = $1
         AND ($2::text IS NULL OR status = $2)
       ORDER BY due_at ASC
       LIMIT $3`,
      [userId, status || null, toLimit(req.query.limit, 30, 100)]
    );

    res.json({ items: rows.rows });
  } catch (error) {
    next(error);
  }
});

router.patch("/deadlines/:deadlineId", async (req, res, next) => {
  try {
    const deadlineId = Number(req.params.deadlineId);
    const { status } = req.body || {};
    const updated = await query(
      `UPDATE university_deadlines
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status || "open", deadlineId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Deadline not found" });
    res.json({ deadline: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/qna/questions", async (req, res, next) => {
  try {
    const { userId, courseCode, chapter, title, body } = req.body || {};
    if (!userId || !courseCode || !title || !body) {
      return res.status(400).json({ error: "userId, courseCode, title and body are required" });
    }

    const inserted = await query(
      `INSERT INTO university_qa_questions
       (user_id, course_code, chapter, title, body, is_resolved)
       VALUES ($1, $2, $3, $4, $5, FALSE)
       RETURNING *`,
      [Number(userId), normalizeCourseCode(courseCode), chapter || null, title, body]
    );

    res.status(201).json({ question: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get("/qna/questions", async (req, res, next) => {
  try {
    const courseCode = req.query.courseCode ? normalizeCourseCode(req.query.courseCode) : null;
    const chapter = req.query.chapter || null;
    const q = String(req.query.q || "").trim().toLowerCase();
    const limit = toLimit(req.query.limit, 20, 80);

    const questions = await query(
      `SELECT *
       FROM university_qa_questions
       WHERE ($1::text IS NULL OR course_code = $1)
         AND ($2::text IS NULL OR chapter = $2)
       ORDER BY created_at DESC
       LIMIT $3`,
      [courseCode, chapter, limit]
    );

    const rows = questions.rows.filter((item) => {
      if (!q) return true;
      const text = `${item.title || ""} ${item.body || ""}`.toLowerCase();
      return text.includes(q);
    });

    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
});

router.get("/qna/questions/:questionId", async (req, res, next) => {
  try {
    const questionId = Number(req.params.questionId);
    const questionRes = await query(
      `SELECT *
       FROM university_qa_questions
       WHERE id = $1
       LIMIT 1`,
      [questionId]
    );

    if (!questionRes.rows.length) return res.status(404).json({ error: "Question not found" });

    const answersRes = await query(
      `SELECT *
       FROM university_qa_answers
       WHERE question_id = $1
       ORDER BY is_verified DESC, votes DESC, created_at DESC
       LIMIT 200`,
      [questionId]
    );

    res.json({
      question: questionRes.rows[0],
      answers: answersRes.rows
    });
  } catch (error) {
    next(error);
  }
});

router.post("/qna/questions/:questionId/answers", async (req, res, next) => {
  try {
    const questionId = Number(req.params.questionId);
    const { userId, body } = req.body || {};
    if (!userId || !body) return res.status(400).json({ error: "userId and body are required" });

    const inserted = await query(
      `INSERT INTO university_qa_answers
       (question_id, user_id, body, is_verified, votes)
       VALUES ($1, $2, $3, FALSE, 0)
       RETURNING *`,
      [questionId, Number(userId), String(body)]
    );

    res.status(201).json({ answer: inserted.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/qna/answers/:answerId/vote", async (req, res, next) => {
  try {
    const answerId = Number(req.params.answerId);
    const value = Number(req.body?.value || 1);
    if (![1, -1].includes(value)) return res.status(400).json({ error: "value must be 1 or -1" });

    const updated = await query(
      `UPDATE university_qa_answers
       SET votes = votes + $1
       WHERE id = $2
       RETURNING *`,
      [value, answerId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Answer not found" });
    res.json({ answer: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post("/qna/answers/:answerId/verify", async (req, res, next) => {
  try {
    const answerId = Number(req.params.answerId);
    const verified = asBool(req.body?.verified, true);

    const updated = await query(
      `UPDATE university_qa_answers
       SET is_verified = $1, verified_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [verified, answerId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Answer not found" });
    res.json({ answer: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.patch("/qna/questions/:questionId/resolve", async (req, res, next) => {
  try {
    const questionId = Number(req.params.questionId);
    const resolved = asBool(req.body?.resolved, true);
    const updated = await query(
      `UPDATE university_qa_questions
       SET is_resolved = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [resolved, questionId]
    );

    if (!updated.rows.length) return res.status(404).json({ error: "Question not found" });
    res.json({ question: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
