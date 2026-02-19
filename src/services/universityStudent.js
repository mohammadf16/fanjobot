function normalizeCourseCode(value) {
  return String(value || "").trim().toUpperCase();
}

function parsePrerequisites(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeCourseCode).filter(Boolean);
  }

  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeCourseCode).filter(Boolean);
      }
    } catch (_error) {
      return value
        .split(/[,،]/)
        .map(normalizeCourseCode)
        .filter(Boolean);
    }
  }

  return [];
}

function asTermNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildTermSuggestion({ chartCourses, offerings, passedCourseCodes, targetTerm, limit = 6 }) {
  const offeredSet = new Set(
    offerings
      .map((item) => normalizeCourseCode(item.course_code))
      .filter(Boolean)
  );

  const passedSet = new Set(
    (passedCourseCodes || [])
      .map(normalizeCourseCode)
      .filter(Boolean)
  );

  const normalizedTargetTerm = asTermNumber(targetTerm, 1);
  const recommended = [];
  const blocked = [];
  const notOffered = [];

  for (const course of chartCourses) {
    const courseCode = normalizeCourseCode(course.course_code);
    if (!courseCode) continue;
    if (passedSet.has(courseCode)) continue;

    const prerequisites = parsePrerequisites(course.prerequisites);
    const missingPrereqs = prerequisites.filter((item) => !passedSet.has(item));

    if (missingPrereqs.length) {
      blocked.push({
        ...course,
        courseCode,
        missingPrerequisites: missingPrereqs
      });
      continue;
    }

    if (!offeredSet.has(courseCode)) {
      notOffered.push({
        ...course,
        courseCode
      });
      continue;
    }

    const recommendedTerm = asTermNumber(course.recommended_term, normalizedTargetTerm);
    const diff = Math.abs(recommendedTerm - normalizedTargetTerm);
    let score = 0;

    if (recommendedTerm === normalizedTargetTerm) score += 5;
    else if (recommendedTerm < normalizedTargetTerm) score += 3;
    else score += 1;

    score += Math.max(0, 3 - diff);
    if (course.is_core) score += 2;
    if (prerequisites.length === 0) score += 1;

    recommended.push({
      ...course,
      courseCode,
      score,
      recommendedTerm,
      prerequisites
    });
  }

  recommended.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.recommendedTerm !== b.recommendedTerm) return a.recommendedTerm - b.recommendedTerm;
    return String(a.courseCode).localeCompare(String(b.courseCode));
  });

  return {
    recommended: recommended.slice(0, limit),
    blocked,
    notOffered
  };
}

function rankResource(item, { skillLevel, term }) {
  let score = 0;
  const now = Date.now();
  const createdAt = item.created_at ? new Date(item.created_at).getTime() : now;
  const ageDays = Math.max(0, Math.floor((now - createdAt) / (24 * 60 * 60 * 1000)));

  if (item.drive_file_id || item.drive_link) score += 3;
  if (item.kind === "note") score += 2;
  if (item.kind === "book") score += 2;
  if (item.kind === "exam-tip") score += 2;

  if (skillLevel && item.skill_level === skillLevel) score += 2;
  if (term && item.term && String(item.term) === String(term)) score += 2;
  if (ageDays <= 30) score += 2;
  else if (ageDays <= 90) score += 1;

  return score;
}

module.exports = {
  normalizeCourseCode,
  parsePrerequisites,
  buildTermSuggestion,
  rankResource
};
