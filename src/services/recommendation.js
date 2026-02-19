const levelWeight = {
  beginner: 1,
  intermediate: 2,
  advanced: 3
};

function mapGoalToTags(goal) {
  if (!goal) return [];

  const normalized = goal.toLowerCase();
  const tags = new Set();

  if (normalized.includes("intern") || normalized.includes("کارآموز")) {
    tags.add("internship");
    tags.add("portfolio");
    tags.add("project");
  }

  if (normalized.includes("job") || normalized.includes("شغل")) {
    tags.add("job-ready");
    tags.add("portfolio");
    tags.add("junior");
  }

  if (normalized.includes("exam") || normalized.includes("قبولی") || normalized.includes("درس")) {
    tags.add("exam");
    tags.add("study-plan");
    tags.add("course");
  }

  if (normalized.includes("پروژه")) {
    tags.add("project");
    tags.add("portfolio");
  }

  if (!tags.size) {
    tags.add("project");
    tags.add("course");
  }

  return [...tags];
}

function calculateContentScore(profile, content) {
  let score = 0;
  const tags = content.tags || [];

  if (content.major && profile.major && content.major === profile.major) score += 4;
  if (content.term && profile.term && content.term === profile.term) score += 3;

  for (const interest of profile.interests || []) {
    if (tags.includes(interest)) score += 2;
  }

  const profileLevel = levelWeight[profile.skillLevel] || 1;
  const contentLevel = levelWeight[content.skillLevel] || 1;
  if (profileLevel >= contentLevel) score += 2;

  for (const gTag of mapGoalToTags(profile.shortTermGoal)) {
    if (tags.includes(gTag)) score += 2;
  }

  if ((profile.weeklyHours || 0) < 6 && tags.includes("quick-win")) score += 2;

  return score;
}

function rankContents(profile, contents) {
  return contents
    .map((item) => ({
      ...item,
      score: calculateContentScore(profile, item)
    }))
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  rankContents
};
