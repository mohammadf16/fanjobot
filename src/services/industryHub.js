function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeSkillName(value) {
  return normalizeText(value);
}

function levelToNumber(value) {
  const normalized = normalizeText(value);
  if (["intern", "beginner", "junior", "مبتدی"].includes(normalized)) return 1;
  if (["mid", "intermediate", "متوسط"].includes(normalized)) return 2;
  if (["senior", "advanced", "پیشرفته"].includes(normalized)) return 3;
  return 1;
}

function buildSkillMap(studentSkills = []) {
  const map = new Map();
  for (const item of studentSkills) {
    const name = normalizeSkillName(item.name || item.skill_name);
    if (!name) continue;
    const score = Number(item.score ?? item.level ?? 1);
    const prev = map.get(name) || 0;
    map.set(name, Math.max(prev, score));
  }
  return map;
}

function parseRequiredSkills(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return value
        .split(/[,،]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .map((name) => ({ name, level: 1, weight: 1 }));
    }
  }
  return [];
}

function computeSkillMatch(requiredSkills, skillMap) {
  if (!requiredSkills.length) return 0.6;

  let totalWeight = 0;
  let earned = 0;

  for (const req of requiredSkills) {
    const name = normalizeSkillName(req.name || req.skill || req.skill_name);
    if (!name) continue;
    const reqLevel = Number(req.level ?? 1);
    const weight = Number(req.weight ?? 1);
    const studentLevel = Number(skillMap.get(name) || 0);

    totalWeight += weight;
    if (studentLevel <= 0) continue;

    const ratio = Math.min(1, studentLevel / Math.max(1, reqLevel));
    earned += ratio * weight;
  }

  if (totalWeight === 0) return 0.6;
  return earned / totalWeight;
}

function scoreOpportunity(item, context) {
  const requiredSkills = parseRequiredSkills(item.required_skills);
  const skillMatch = computeSkillMatch(requiredSkills, context.skillMap);
  const levelMatch = context.levelNum >= levelToNumber(item.level) ? 1 : 0.5;

  let score = skillMatch * 70 + levelMatch * 20;

  if (context.city && item.city && normalizeText(context.city) === normalizeText(item.city)) score += 5;
  if (item.location_mode === "remote") score += 5;

  return Number(score.toFixed(2));
}

function scoreProject(item, context) {
  const requiredSkills = parseRequiredSkills(item.required_skills);
  const skillMatch = computeSkillMatch(requiredSkills, context.skillMap);
  const levelMatch = context.levelNum >= levelToNumber(item.level) ? 1 : 0.6;
  const hoursFit = context.weeklyHours && item.estimated_hours
    ? (Number(item.estimated_hours) <= Number(context.weeklyHours) * 2 ? 1 : 0.7)
    : 0.8;

  let score = skillMatch * 60 + levelMatch * 20 + hoursFit * 20;
  if (item.type === "portfolio") score += 5;
  return Number(score.toFixed(2));
}

module.exports = {
  normalizeSkillName,
  buildSkillMap,
  levelToNumber,
  parseRequiredSkills,
  scoreOpportunity,
  scoreProject
};
