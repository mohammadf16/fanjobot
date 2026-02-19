const { Telegraf, Markup } = require("telegraf");
const { config } = require("./config");
const { query } = require("./db");

const profileSessions = new Map();

const MAJOR_FAMILIES = [
  "مهندسی صنایع",
  "مهندسی برق",
  "مهندسی مکانیک",
  "مهندسی شیمی",
  "مهندسی مواد",
  "مهندسی نقشه برداری",
  "مهندسی عمران",
  "علوم پایه",
  "مهندسی کامپیوتر",
  "مهندسی دریا",
  "مهندسی معماری",
  "مهندسی پزشکی"
];

const MAJOR_TRACKS = {
  "مهندسی مکانیک": [
    "مهندسی مکانیک - مکاترونیک",
    "مهندسی مکانیک - کشتی",
    "مهندسی مکانیک - معماری کشتی - سازه",
    "مهندسی مکانیک - طراحی کاربردی",
    "مهندسی مکانیک - تبدیل انرژی",
    "مهندسی مکانیک - مهندسی دریا",
    "مهندسی مکانیک - ساخت و تولید"
  ],
  "مهندسی معماری": ["مهندسی معماری"],
  "مهندسی نقشه برداری": ["مهندسی نقشه برداری"],
  "مهندسی عمران": ["مهندسی عمران"],
  "مهندسی کامپیوتر": [
    "مهندسی کامپیوتر - هوش مصنوعی و رباتیک",
    "مهندسی کامپیوتر - نرم افزار",
    "مهندسی کامپیوتر - معماری سیستم های کامپیوتری"
  ],
  "مهندسی پزشکی": ["مهندسی پزشکی - بیوالکتریک"],
  "مهندسی برق": [
    "مهندسی برق - مخابرات",
    "مهندسی برق - کنترل",
    "مهندسی برق - قدرت",
    "مهندسی برق - الکترونیک"
  ],
  "مهندسی شیمی": [
    "مهندسی شیمی - طراحی فرایند",
    "مهندسی شیمی - فرآیندهای جداسازی",
    "مهندسی شیمی - ترموسینتیک و کاتالیست",
    "مهندسی شیمی - بیوتکنولوژی"
  ],
  "مهندسی صنایع": ["مهندسی صنایع"],
  "مهندسی مواد": ["مهندسی مواد"],
  "علوم پایه": ["علوم پایه"],
  "مهندسی دریا": ["مهندسی دریا"]
};

const LEVEL_OPTIONS = ["کاردانی", "کارشناسی", "کارشناسی ارشد", "دکتری"];
const TERM_OPTIONS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const GOAL_OPTIONS = ["کارآموزی", "شغل", "پروژه رزومه", "قبولی دروس"];
const HOURS_OPTIONS = ["6", "10", "15", "20"];
const INTEREST_OPTIONS = ["ai", "web", "backend", "frontend", "data", "robotics"];
const DONE_GOALS = "ثبت اهداف";
const DONE_INTERESTS = "ثبت علاقه ها";
const MAJOR_PREV_PAGE = "⬅️ قبلی";
const MAJOR_NEXT_PAGE = "بعدی ➡️";
const MAJOR_PAGE_SIZE = 4;
const UNI_MENU_BACK = "بازگشت به منوی اصلی";
const UNI_MENU = [
  ["دروس دانشگاه", "اساتید دانشگاه"],
  ["جزوه های دانشگاه", "کتاب های دانشگاه"],
  ["منابع دانشگاه", "نکات امتحان دانشگاه"],
  [UNI_MENU_BACK]
];

const PROFILE_STEPS = [
  { key: "fullName", section: "پایه", question: "لطفا نام و نام خانوادگی خود را وارد کنید.", required: true },
  { key: "phoneOrEmail", section: "پایه", question: "لطفا شماره تماس یا ایمیل خود را وارد کنید.", required: true },
  { key: "university", section: "تحصیل", question: "نام دانشگاه خود را وارد کنید. (اختیاری)", required: false },
  { key: "city", section: "تحصیل", question: "شهر محل تحصیل را وارد کنید. (اختیاری)", required: false },
  { key: "majorFamily", section: "تحصیل", question: "لطفا حوزه اصلی رشته خود را انتخاب کنید.", required: true },
  { key: "major", section: "تحصیل", question: "لطفا گرایش خود را انتخاب کنید.", required: true },
  { key: "level", section: "تحصیل", question: "لطفا مقطع تحصیلی خود را انتخاب کنید.", required: true },
  { key: "term", section: "تحصیل", question: "لطفا ترم فعلی خود را انتخاب کنید.", required: true },
  { key: "skillLevel", section: "مهارت", question: "سطح مهارت فعلی شما در این حوزه چیست؟", required: true },
  { key: "shortTermGoal", section: "هدف", question: "اهداف کوتاه مدت خود را انتخاب کنید. (چند گزینه مجاز است، سپس «ثبت اهداف»)", required: true },
  { key: "weeklyHours", section: "هدف", question: "به طور متوسط هفته ای چند ساعت زمان آزاد دارید؟", required: true },
  { key: "interests", section: "هدف", question: "علاقه مندی های خود را انتخاب کنید. (چند گزینه مجاز است، سپس «ثبت علاقه ها»)", required: false },
  { key: "skills", section: "حرفه ای", question: "در صورت تمایل، مهارت های فعلی خود را بنویسید. (مثال: برنامه نویسی، تحلیل داده)", required: false },
  { key: "passedCourses", section: "حرفه ای", question: "در صورت تمایل دروس مهم پاس شده را وارد کنید.", required: false },
  { key: "resumeUrl", section: "حرفه ای", question: "در صورت تمایل لینک رزومه را وارد کنید.", required: false },
  { key: "githubUrl", section: "حرفه ای", question: "در صورت تمایل لینک گیتهاب را وارد کنید.", required: false },
  { key: "portfolioUrl", section: "حرفه ای", question: "در صورت تمایل لینک پورتفولیو را وارد کنید.", required: false }
];

function mainMenu() {
  return Markup.keyboard([
    ["شروع", "تکمیل پروفایل"],
    ["دانشگاه", "صنعت"],
    ["مسیر من"]
  ]).resize();
}

function universityMenu() {
  return Markup.keyboard(UNI_MENU).resize();
}

function buildWebhookPath() {
  if (config.telegramWebhookPath) {
    return config.telegramWebhookPath.startsWith("/")
      ? config.telegramWebhookPath
      : `/${config.telegramWebhookPath}`;
  }

  const tokenPrefix = (config.telegramBotToken || "bot").split(":")[0];
  return `/telegram/webhook/${tokenPrefix}`;
}

function buildWebhookUrl(pathname) {
  const rawDomain = String(config.telegramWebhookDomain || "").trim();
  const normalizedDomain = /^https?:\/\//i.test(rawDomain) ? rawDomain : `https://${rawDomain}`;
  const domain = normalizedDomain.replace(/\/$/, "");
  return `${domain}${pathname}`;
}

function isSkipText(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "رد" || normalized === "ندارم" || normalized === "-";
}

function parseList(value) {
  return String(value || "")
    .split(/[,،]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSkillLevel(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (["beginner", "مبتدی"].includes(normalized)) return "beginner";
  if (["intermediate", "متوسط"].includes(normalized)) return "intermediate";
  if (["advanced", "پیشرفته"].includes(normalized)) return "advanced";

  return null;
}

function parseSkills(value) {
  const items = parseList(value);
  if (!items.length) return [];

  return items
    .map((item) => {
      const parts = item.split(":").map((part) => part.trim());
      const name = parts[0];

      if (!name) return null;

      const parsedScore = Number(parts[1]);
      const score = Number.isFinite(parsedScore) ? Math.min(10, Math.max(1, parsedScore)) : 5;

      return { name, score };
    })
    .filter(Boolean);
}

function validateUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function chunkOptions(items, size = 2) {
  const rows = [];

  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }

  return rows;
}

function getTracksForFamily(session) {
  const selectedFamily = session?.answers?.majorFamily;
  return MAJOR_TRACKS[selectedFamily] || [selectedFamily].filter(Boolean);
}

function getMajorPageInfo(session) {
  const tracks = getTracksForFamily(session);
  const totalPages = Math.max(1, Math.ceil(tracks.length / MAJOR_PAGE_SIZE));
  const currentPage = Math.max(0, Math.min(session?.ui?.majorPage || 0, totalPages - 1));
  const start = currentPage * MAJOR_PAGE_SIZE;
  const pagedTracks = tracks.slice(start, start + MAJOR_PAGE_SIZE);

  return {
    tracks,
    pagedTracks,
    currentPage,
    totalPages
  };
}

function createStepKeyboard(step, session) {
  if (step.key === "majorFamily") {
    return Markup.keyboard([
      ...chunkOptions(MAJOR_FAMILIES, 2),
      ["لغو"]
    ]).resize();
  }

  if (step.key === "major") {
    const { pagedTracks, currentPage, totalPages } = getMajorPageInfo(session);
    const rows = chunkOptions(pagedTracks, 1);
    const navRow = [];

    if (currentPage > 0) navRow.push(MAJOR_PREV_PAGE);
    if (currentPage < totalPages - 1) navRow.push(MAJOR_NEXT_PAGE);
    if (navRow.length) rows.push(navRow);

    rows.push(["لغو"]);
    return Markup.keyboard(rows).resize();
  }

  if (step.key === "level") {
    return Markup.keyboard([
      ...chunkOptions(LEVEL_OPTIONS, 2),
      ["لغو"]
    ]).resize();
  }

  if (step.key === "term") {
    return Markup.keyboard([
      ...chunkOptions(TERM_OPTIONS, 3),
      ["لغو"]
    ]).resize();
  }

  if (step.key === "skillLevel") {
    return Markup.keyboard([
      ["مبتدی", "متوسط"],
      ["پیشرفته", "لغو"]
    ]).resize();
  }

  if (step.key === "shortTermGoal") {
    const selected = session?.answers?.shortTermGoalSelections || [];
    const options = GOAL_OPTIONS.map((item) => (selected.includes(item) ? `✅ ${item}` : item));
    return Markup.keyboard([
      ...chunkOptions(options, 2),
      [DONE_GOALS],
      ["لغو"]
    ]).resize();
  }

  if (step.key === "weeklyHours") {
    return Markup.keyboard([
      HOURS_OPTIONS,
      ["لغو"]
    ]).resize();
  }

  if (step.key === "interests") {
    const selected = session?.answers?.interests || [];
    const options = INTEREST_OPTIONS.map((item) => (selected.includes(item) ? `✅ ${item}` : item));
    return Markup.keyboard([
      ...chunkOptions(options, 3),
      [DONE_INTERESTS],
      ["رد", "لغو"]
    ]).resize();
  }

  if (step.required) {
    return Markup.keyboard([["لغو"]]).resize();
  }

  return Markup.keyboard([["رد", "لغو"]]).resize();
}

function getSessionKey(ctx) {
  return String(ctx.from.id);
}

async function loadUserAcademicProfile(ctx) {
  const userId = await ensureUser(ctx);
  const profileRes = await query(
    `SELECT p.major, p.term FROM user_profiles p WHERE p.user_id = $1 LIMIT 1`,
    [userId]
  );

  const major = profileRes.rows[0]?.major || null;
  const term = profileRes.rows[0]?.term || null;

  return { userId, major, term };
}

async function getUniversityItemsByKind({ major, term, kind, limit = 5 }) {
  const res = await query(
    `SELECT title
     FROM contents
     WHERE type = 'university'
       AND kind = $1
       AND is_published = TRUE
       AND ($2::text IS NULL OR major = $2 OR major IS NULL)
       AND ($3::text IS NULL OR term = $3 OR term IS NULL)
     ORDER BY created_at DESC
     LIMIT $4`,
    [kind, major || null, term || null, limit]
  );

  return res.rows;
}

function formatList(items) {
  if (!items.length) return "موردی ثبت نشده.";
  return items.map((item, index) => `${index + 1}. ${item.title}`).join("\n");
}

async function showUniversityKind(ctx, kind, title) {
  const { major, term } = await loadUserAcademicProfile(ctx);

  if (!major) {
    await ctx.reply("برای دریافت محتوای دقیق دانشگاه، ابتدا پروفایل تحصیلی خود را کامل کنید.", mainMenu());
    return;
  }

  const items = await getUniversityItemsByKind({ major, term, kind, limit: 7 });
  const header = `${title}\nرشته: ${major}${term ? ` | ترم: ${term}` : ""}`;
  await ctx.reply(`${header}\n\n${formatList(items)}`, universityMenu());
}

async function ensureUser(ctx) {
  const telegramId = String(ctx.from.id);
  const fullName = `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim() || "Student";

  const existing = await query(`SELECT id FROM users WHERE telegram_id = $1`, [telegramId]);
  if (existing.rows.length) return existing.rows[0].id;

  const created = await query(
    `INSERT INTO users (full_name, phone_or_email, telegram_id)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [fullName, `telegram:${telegramId}`, telegramId]
  );

  return created.rows[0].id;
}

async function askCurrentStep(ctx, session) {
  const step = PROFILE_STEPS[session.stepIndex];
  if (!step) return;

  await ctx.reply(
    `(${session.stepIndex + 1}/${PROFILE_STEPS.length}) ${step.question}`,
    createStepKeyboard(step, session)
  );
}

async function startProfileWizard(ctx) {
  const userId = await ensureUser(ctx);
  const key = getSessionKey(ctx);

  profileSessions.set(key, {
    userId,
    stepIndex: 0,
    answers: {},
    ui: { majorPage: 0 }
  });

  await ctx.reply("فرآیند تکمیل پروفایل شروع شد. برای رد کردن سوال های اختیاری: رد | برای انصراف: لغو");
  await askCurrentStep(ctx, profileSessions.get(key));
}

function parseStepValue(step, text, session) {
  const raw = String(text || "").trim();

  if (!step.required && isSkipText(raw)) {
    if (["interests", "skills", "passedCourses"].includes(step.key)) return { ok: true, value: [] };
    return { ok: true, value: null };
  }

  if (step.required && !raw) {
    return { ok: false, message: "این فیلد الزامی است." };
  }

  if (step.key === "majorFamily") {
    if (!MAJOR_FAMILIES.includes(raw)) {
      return { ok: false, message: "از دکمه های رشته استفاده کن." };
    }
    return { ok: true, value: raw };
  }

  if (step.key === "major") {
    const validTracks = getTracksForFamily(session);

    if (!validTracks.includes(raw)) {
      return { ok: false, message: "از دکمه های گرایش استفاده کن." };
    }
    return { ok: true, value: raw };
  }

  if (step.key === "level") {
    if (!LEVEL_OPTIONS.includes(raw)) {
      return { ok: false, message: "مقطع را از دکمه ها انتخاب کن." };
    }
    return { ok: true, value: raw };
  }

  if (step.key === "term") {
    if (!TERM_OPTIONS.includes(raw)) {
      return { ok: false, message: "ترم را از دکمه ها انتخاب کن." };
    }
    return { ok: true, value: raw };
  }

  if (step.key === "skillLevel") {
    const parsed = parseSkillLevel(raw);
    if (!parsed) return { ok: false, message: "سطح را از دکمه ها انتخاب کن." };
    return { ok: true, value: parsed };
  }

  if (step.key === "weeklyHours") {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 80) {
      return { ok: false, message: "عدد معتبر وارد کن (بین 1 تا 80)." };
    }
    return { ok: true, value: parsed };
  }

  if (step.key === "interests") {
    return { ok: true, value: parseList(raw) };
  }

  if (step.key === "shortTermGoal") {
    return { ok: true, value: raw };
  }

  if (step.key === "skills") {
    return { ok: true, value: parseSkills(raw) };
  }

  if (step.key === "passedCourses") {
    return { ok: true, value: parseList(raw) };
  }

  if (["resumeUrl", "githubUrl", "portfolioUrl"].includes(step.key)) {
    if (!validateUrl(raw)) {
      return { ok: false, message: "لینک معتبر نیست. با http:// یا https:// شروع کن." };
    }
    return { ok: true, value: raw };
  }

  if (raw.length < 2 && step.required) {
    return { ok: false, message: "پاسخ خیلی کوتاه است." };
  }

  return { ok: true, value: raw || null };
}

function normalizePickedOption(text) {
  return String(text || "").replace(/^✅\s*/, "").trim();
}

function toggleSelection(values, option) {
  const current = Array.isArray(values) ? [...values] : [];
  if (current.includes(option)) {
    return current.filter((item) => item !== option);
  }
  current.push(option);
  return current;
}

async function saveProfileAnswers(session) {
  const data = session.answers;

  await query(
    `UPDATE users
     SET full_name = $1,
         phone_or_email = $2
     WHERE id = $3`,
    [data.fullName, data.phoneOrEmail, session.userId]
  );

  await query(
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
        updated_at = NOW()`,
    [
      session.userId,
      data.university,
      data.city,
      data.major,
      data.level,
      data.term,
      JSON.stringify(data.interests || []),
      data.skillLevel,
      data.shortTermGoal,
      data.weeklyHours,
      data.resumeUrl,
      data.githubUrl,
      data.portfolioUrl,
      JSON.stringify(data.skills || []),
      JSON.stringify(data.passedCourses || [])
    ]
  );
}

async function handleProfileWizardInput(ctx) {
  const key = getSessionKey(ctx);
  const session = profileSessions.get(key);

  if (!session) return false;

  const text = String(ctx.message?.text || "").trim();
  const menuActions = new Set([
    "شروع",
    "تکمیل پروفایل",
    "دانشگاه",
    "صنعت",
    "مسیر من",
    "دروس دانشگاه",
    "اساتید دانشگاه",
    "جزوه های دانشگاه",
    "کتاب های دانشگاه",
    "منابع دانشگاه",
    "نکات امتحان دانشگاه",
    UNI_MENU_BACK
  ]);

  if (text === "لغو") {
    profileSessions.delete(key);
    await ctx.reply("تکمیل پروفایل لغو شد.", mainMenu());
    return true;
  }

  if (menuActions.has(text)) {
    await ctx.reply("الان در حال تکمیل پروفایل هستیم. پاسخ همین سوال را بده یا بنویس: لغو");
    return true;
  }

  const step = PROFILE_STEPS[session.stepIndex];

  if (!step) {
    profileSessions.delete(key);
    await ctx.reply("نشست نامعتبر بود. دوباره روی تکمیل پروفایل بزن.", mainMenu());
    return true;
  }

  if (step.key === "major") {
    if (text === MAJOR_NEXT_PAGE || text === MAJOR_PREV_PAGE) {
      const { totalPages, currentPage } = getMajorPageInfo(session);
      let nextPage = currentPage;

      if (text === MAJOR_NEXT_PAGE && currentPage < totalPages - 1) nextPage += 1;
      if (text === MAJOR_PREV_PAGE && currentPage > 0) nextPage -= 1;

      session.ui = session.ui || {};
      session.ui.majorPage = nextPage;
      profileSessions.set(key, session);

      await ctx.reply(
        `صفحه ${nextPage + 1} از ${totalPages} گرایش ها`,
        createStepKeyboard(step, session)
      );
      return true;
    }
  }

  if (step.key === "shortTermGoal") {
    const picked = normalizePickedOption(text);

    if (picked === DONE_GOALS) {
      const selected = session.answers.shortTermGoalSelections || [];
      if (!selected.length) {
        await ctx.reply("حداقل یک هدف انتخاب کن.", createStepKeyboard(step, session));
        return true;
      }

      session.answers.shortTermGoal = selected.join(" | ");
      session.stepIndex += 1;
      profileSessions.set(key, session);
      await askCurrentStep(ctx, session);
      return true;
    }

    if (!GOAL_OPTIONS.includes(picked)) {
      await ctx.reply("از دکمه ها انتخاب کن یا بزن: ثبت اهداف", createStepKeyboard(step, session));
      return true;
    }

    session.answers.shortTermGoalSelections = toggleSelection(session.answers.shortTermGoalSelections, picked);
    profileSessions.set(key, session);

    const selectedText = session.answers.shortTermGoalSelections.length
      ? session.answers.shortTermGoalSelections.join("، ")
      : "هیچ موردی";

    await ctx.reply(`اهداف انتخاب شده: ${selectedText}`, createStepKeyboard(step, session));
    return true;
  }

  if (step.key === "interests") {
    if (isSkipText(text)) {
      session.answers.interests = [];
      session.stepIndex += 1;
      profileSessions.set(key, session);
      await askCurrentStep(ctx, session);
      return true;
    }

    const picked = normalizePickedOption(text);

    if (picked === DONE_INTERESTS) {
      session.stepIndex += 1;
      profileSessions.set(key, session);
      await askCurrentStep(ctx, session);
      return true;
    }

    if (!INTEREST_OPTIONS.includes(picked)) {
      const parsedList = parseList(text);
      if (parsedList.length) {
        session.answers.interests = parsedList;
        session.stepIndex += 1;
        profileSessions.set(key, session);
        await askCurrentStep(ctx, session);
        return true;
      }
      await ctx.reply("از دکمه ها انتخاب کن یا بزن: ثبت علاقه ها", createStepKeyboard(step, session));
      return true;
    }

    session.answers.interests = toggleSelection(session.answers.interests, picked);
    profileSessions.set(key, session);

    const selectedText = session.answers.interests.length
      ? session.answers.interests.join("، ")
      : "هیچ موردی";

    await ctx.reply(`علاقه ها: ${selectedText}`, createStepKeyboard(step, session));
    return true;
  }

  const parsed = parseStepValue(step, text, session);

  if (!parsed.ok) {
    await ctx.reply(parsed.message, createStepKeyboard(step, session));
    return true;
  }

  session.answers[step.key] = parsed.value;
  if (step.key === "majorFamily") {
    session.ui = session.ui || {};
    session.ui.majorPage = 0;
  }
  session.stepIndex += 1;

  if (session.stepIndex < PROFILE_STEPS.length) {
    profileSessions.set(key, session);
    await askCurrentStep(ctx, session);
    return true;
  }

  try {
    await saveProfileAnswers(session);
    profileSessions.delete(key);
    await ctx.reply("پروفایل کامل ذخیره شد.", mainMenu());
  } catch (error) {
    console.error(error);
    profileSessions.delete(key);
    await ctx.reply("خطا در ذخیره پروفایل. دوباره تلاش کن.", mainMenu());
  }

  return true;
}

function registerHandlers(bot) {
  bot.on("text", async (ctx, next) => {
    const handled = await handleProfileWizardInput(ctx);
    if (handled) return;
    return next();
  });

  bot.start(async (ctx) => {
    await ensureUser(ctx);

    await ctx.reply(
      "به فنجو خوش اومدی.\nمنوی اصلی فعال شد.",
      mainMenu()
    );
  });

  bot.hears("شروع", async (ctx) => {
    await ctx.reply("منو آماده است.", mainMenu());
  });

  bot.hears("تکمیل پروفایل", async (ctx) => {
    await startProfileWizard(ctx);
  });

  bot.command("profile", async (ctx) => {
    await ctx.reply("برای ثبت پروفایل، روی تکمیل پروفایل بزن تا سوال به سوال جلو بریم.", mainMenu());
  });

  bot.hears("دانشگاه", async (ctx) => {
    const { major, term } = await loadUserAcademicProfile(ctx);

    if (!major) {
      await ctx.reply("برای فعال شدن ماژول دانشگاه، ابتدا پروفایل تحصیلی را تکمیل کنید.", mainMenu());
      return;
    }

    await ctx.reply(
      `ماژول دانشگاه فعال شد.\nرشته: ${major}${term ? ` | ترم: ${term}` : ""}\nبخش موردنظر را انتخاب کنید:`,
      universityMenu()
    );
  });

  bot.hears("دروس دانشگاه", async (ctx) => {
    await showUniversityKind(ctx, "course", "دروس دانشگاه");
  });

  bot.hears("اساتید دانشگاه", async (ctx) => {
    await showUniversityKind(ctx, "professor", "اساتید دانشگاه");
  });

  bot.hears("جزوه های دانشگاه", async (ctx) => {
    await showUniversityKind(ctx, "note", "جزوه های دانشگاه");
  });

  bot.hears("کتاب های دانشگاه", async (ctx) => {
    await showUniversityKind(ctx, "book", "کتاب های دانشگاه");
  });

  bot.hears("منابع دانشگاه", async (ctx) => {
    await showUniversityKind(ctx, "resource", "منابع دانشگاه");
  });

  bot.hears("نکات امتحان دانشگاه", async (ctx) => {
    await showUniversityKind(ctx, "exam-tip", "نکات امتحان دانشگاه");
  });

  bot.hears(UNI_MENU_BACK, async (ctx) => {
    await ctx.reply("به منوی اصلی برگشتید.", mainMenu());
  });

  bot.hears("صنعت", async (ctx) => {
    const items = await query(
      `SELECT title, kind FROM contents
       WHERE type = 'industry' AND is_published = TRUE
       ORDER BY created_at DESC
       LIMIT 5`
    );

    if (!items.rows.length) {
      await ctx.reply("هنوز فرصت صنعتی ثبت نشده.");
      return;
    }

    const text = items.rows
      .map((item, index) => `${index + 1}. [${item.kind}] ${item.title}`)
      .join("\n");

    await ctx.reply(`فرصت های صنعتی:\n${text}`);
  });

  bot.hears("مسیر من", async (ctx) => {
    const userId = await ensureUser(ctx);
    const profileRes = await query(`SELECT * FROM user_profiles WHERE user_id = $1`, [userId]);

    if (!profileRes.rows.length) {
      await ctx.reply("اول پروفایل را کامل کن.");
      return;
    }

    const profile = profileRes.rows[0];
    const roadmapRes = await query(
      `SELECT title FROM contents
       WHERE kind = 'roadmap' AND is_published = TRUE AND (major = $1 OR major IS NULL)
       ORDER BY created_at DESC LIMIT 3`,
      [profile.major]
    );

    const roadmaps = roadmapRes.rows.map((r, i) => `${i + 1}. ${r.title}`).join("\n") || "مسیری ثبت نشده";

    await ctx.reply(
      `مسیر شخصی تو:\nهدف: ${profile.short_term_goal}\nساعت آزاد: ${profile.weekly_hours}\n\nRoadmap:\n${roadmaps}\n\nبرنامه هفتگی:\n- 2h درس\n- 2h پروژه\n- 1h مرور\n- 1h آماده سازی بازار کار`
    );
  });

  bot.catch((error) => {
    console.error("Telegram bot error:", error);
  });
}

async function attachBot(app) {
  if (!config.telegramBotToken) {
    console.log("TELEGRAM_BOT_TOKEN missing; bot startup skipped.");
    return null;
  }

  const bot = new Telegraf(config.telegramBotToken);
  registerHandlers(bot);

  const shouldUseWebhook = config.telegramUseWebhook || Boolean(config.telegramWebhookDomain);

  if (shouldUseWebhook) {
    if (!config.telegramWebhookDomain) {
      throw new Error("TELEGRAM_WEBHOOK_DOMAIN is required when webhook mode is enabled.");
    }

    const webhookPath = buildWebhookPath();
    const webhookUrl = buildWebhookUrl(webhookPath);

    // Handle Telegram updates only on exact webhook path; callback path filter
    // is omitted to avoid framework-specific URL rewriting mismatches.
    app.post(webhookPath, bot.webhookCallback());
    await bot.telegram.setWebhook(webhookUrl);

    console.log(`Telegram bot webhook set: ${webhookUrl}`);

    return { bot, mode: "webhook", webhookPath, webhookUrl };
  }

  await bot.launch();
  console.log("Telegram bot polling is running.");

  return { bot, mode: "polling" };
}

module.exports = {
  attachBot
};
