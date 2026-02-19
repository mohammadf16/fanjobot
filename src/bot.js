const { Telegraf, Markup } = require("telegraf");
const { config } = require("./config");
const { query } = require("./db");
const { uploadBufferToDrive } = require("./services/googleDrive");
const { logInfo, logError } = require("./services/logger");
const {
  buildSkillMap,
  levelToNumber,
  parseRequiredSkills,
  scoreOpportunity,
  scoreProject,
  normalizeSkillName
} = require("./services/industryHub");

const profileSessions = new Map();
const submissionSessions = new Map();

const LABEL_START = "🚀 شروع";
const LABEL_PROFILE = "🧾 تکمیل پروفایل";
const LABEL_UNIVERSITY = "🏫 دانشگاه";
const LABEL_INDUSTRY = "🏭 صنعت";
const LABEL_MY_PATH = "🧭 مسیر من";

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
const UNI_MENU_BACK = "🔙 بازگشت به منوی اصلی";
const UNI_MENU = [
  ["📘 دروس دانشگاه", "👨‍🏫 اساتید دانشگاه"],
  ["📝 جزوه های دانشگاه", "📚 کتاب های دانشگاه"],
  ["🔎 منابع دانشگاه", "🎯 نکات امتحان دانشگاه"],
  ["📤 ارسال محتوای دانشگاه"],
  [UNI_MENU_BACK]
];
const INDUSTRY_MENU = [
  ["🧑‍💼 پروفایل صنعتی", "🎯 پیشنهاد فرصت ها"],
  ["📌 برد فرصت ها", "📍 پیگیری درخواست ها"],
  ["🧪 هاب پروژه ها", "🛠️ اجرای پروژه"],
  ["🗺️ مسیر شغلی", "🎓 منابع صنعتی"],
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

const UNIVERSITY_SUBMISSION_BACK = "❌ لغو ارسال محتوا";
const UNIVERSITY_SUBMISSION_DONE = "✅ ثبت نهایی ارسال";
const UNIVERSITY_SUBMISSION_KINDS = [
  { key: "course", label: "📘 دروس دانشگاه" },
  { key: "professor", label: "👨‍🏫 اساتید دانشگاه" },
  { key: "note", label: "📝 جزوه های دانشگاه" },
  { key: "book", label: "📚 کتاب های دانشگاه" },
  { key: "resource", label: "🔎 منابع دانشگاه" },
  { key: "exam-tip", label: "🎯 نکات امتحان دانشگاه" }
];

const UNIVERSITY_SUBMISSION_STEPS = [
  {
    key: "contentKind",
    question: "محتوای ارسالی مناسب کدام بخش دانشگاه است؟"
  },
  {
    key: "courseName",
    question: "این محتوا برای کدام درس است؟ (مثلا: ساختمان داده)"
  },
  {
    key: "professorName",
    question: "این محتوا برای کدام استاد است؟ (اختیاری - برای رد: «رد»)"
  },
  {
    key: "title",
    question: "عنوان محتوا را بنویس:"
  },
  {
    key: "purpose",
    question: "این محتوا برای چه کاری مفید است؟ (مثلا جمع بندی قبل امتحان)"
  },
  {
    key: "fileUpload",
    question: "فایل محتوا را آپلود کن (PDF/DOCX/ZIP/عکس)."
  },
  {
    key: "tags",
    question: "تگ ها را بنویس (اختیاری، با کاما جدا کن - مثال: الگوریتم, امتحان)"
  },
  {
    key: "confirm",
    question: "برای ثبت نهایی دکمه «ثبت نهایی ارسال» را بزن."
  }
];

function mainMenu() {
  return Markup.keyboard([
    [LABEL_START, LABEL_PROFILE],
    [LABEL_UNIVERSITY, LABEL_INDUSTRY],
    [LABEL_MY_PATH]
  ]).resize();
}

function universityMenu() {
  return Markup.keyboard(UNI_MENU).resize();
}

function industryMenu() {
  return Markup.keyboard(INDUSTRY_MENU).resize();
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

function getSubmissionKindByLabel(label) {
  return UNIVERSITY_SUBMISSION_KINDS.find((item) => item.label === label) || null;
}

function submissionKindKeyboard() {
  const options = UNIVERSITY_SUBMISSION_KINDS.map((item) => item.label);
  return Markup.keyboard([
    ...chunkOptions(options, 3),
    [UNIVERSITY_SUBMISSION_BACK]
  ]).resize();
}

function submissionSimpleKeyboard() {
  return Markup.keyboard([["رد"], [UNIVERSITY_SUBMISSION_BACK]]).resize();
}

async function askSubmissionStep(ctx, session) {
  const step = UNIVERSITY_SUBMISSION_STEPS[session.stepIndex];
  if (!step) return;

  if (step.key === "contentKind") {
    await ctx.reply(step.question, submissionKindKeyboard());
    return;
  }

  if (step.key === "confirm") {
    await ctx.reply(
      `${step.question}\n\n` +
      `نوع: ${session.answers.contentKindLabel}\n` +
      `درس مرتبط: ${session.answers.courseName || "ثبت نشده"}\n` +
      `استاد مرتبط: ${session.answers.professorName || "ثبت نشده"}\n` +
      `عنوان: ${session.answers.title}\n` +
      `هدف: ${session.answers.purpose}\n` +
      `فایل: ${session.answers.fileName || "ثبت نشده"}`,
      Markup.keyboard([[UNIVERSITY_SUBMISSION_DONE], [UNIVERSITY_SUBMISSION_BACK]]).resize()
    );
    return;
  }

  if (step.key === "professorName" || step.key === "tags") {
    await ctx.reply(step.question, submissionSimpleKeyboard());
    return;
  }

  if (step.key === "fileUpload") {
    await ctx.reply(step.question, Markup.keyboard([[UNIVERSITY_SUBMISSION_BACK]]).resize());
    return;
  }

  await ctx.reply(step.question, Markup.keyboard([[UNIVERSITY_SUBMISSION_BACK]]).resize());
}

async function startUniversitySubmissionWizard(ctx) {
  const userId = await ensureUser(ctx);
  const key = getSessionKey(ctx);

  submissionSessions.set(key, {
    userId,
    stepIndex: 0,
    answers: {}
  });

  await ctx.reply(
    "فرم ارسال محتوای دانشگاه شروع شد. اطلاعات کامل بفرست تا برای ادمین در صف بررسی ثبت شود."
  );
  logInfo("University submission wizard started", { userId, telegramId: String(ctx.from?.id || "") });
  await askSubmissionStep(ctx, submissionSessions.get(key));
}

function parseSubmissionStepValue(step, text) {
  const raw = String(text || "").trim();
  if (!raw && !["professorName", "tags"].includes(step.key)) {
    return { ok: false, message: "این فیلد الزامی است." };
  }

  if (step.key === "contentKind") {
    const kind = getSubmissionKindByLabel(raw);
    if (!kind) return { ok: false, message: "نوع محتوا را از دکمه ها انتخاب کن." };
    return { ok: true, value: { contentKind: kind.key, contentKindLabel: kind.label } };
  }

  if (step.key === "courseName") {
    if (raw.length < 2) return { ok: false, message: "نام درس معتبر وارد کن." };
    return { ok: true, value: raw };
  }

  if (step.key === "professorName") {
    if (isSkipText(raw)) return { ok: true, value: null };
    if (raw.length < 2) return { ok: false, message: "نام استاد معتبر وارد کن یا بزن: رد" };
    return { ok: true, value: raw };
  }

  if (step.key === "title") {
    if (raw.length < 6) return { ok: false, message: "عنوان باید حداقل 6 کاراکتر باشد." };
    return { ok: true, value: raw };
  }

  if (step.key === "fileUpload") {
    return { ok: false, message: "در این مرحله فایل را ارسال کن (به صورت document/photo)." };
  }

  if (step.key === "tags") {
    if (isSkipText(raw)) return { ok: true, value: [] };
    const tags = parseList(raw).map((item) => item.toLowerCase()).slice(0, 10);
    return { ok: true, value: tags };
  }

  if (step.key === "confirm") {
    if (raw !== UNIVERSITY_SUBMISSION_DONE) {
      return { ok: false, message: `برای ثبت، دکمه «${UNIVERSITY_SUBMISSION_DONE}» را بزن.` };
    }
    return { ok: true, value: true };
  }

  return { ok: true, value: raw };
}

async function saveUniversitySubmission(session) {
  const profileRes = await query(
    `SELECT major, term
     FROM user_profiles
     WHERE user_id = $1
     LIMIT 1`,
    [session.userId]
  );
  const major = profileRes.rows[0]?.major || null;
  const term = profileRes.rows[0]?.term || null;

  const composedDescription = [
    `بخش مقصد: ${session.answers.contentKindLabel}`,
    `درس مرتبط: ${session.answers.courseName || "ثبت نشده"}`,
    `استاد مرتبط: ${session.answers.professorName || "ثبت نشده"}`,
    `هدف: ${session.answers.purpose}`
  ].join("\n\n");

  const inserted = await query(
    `INSERT INTO community_content_submissions
     (user_id, section, content_kind, title, description, major, term, tags, external_link, status)
     VALUES ($1, 'university', $2, $3, $4, $5, $6, $7::jsonb, $8, 'pending')
     RETURNING *`,
    [
      session.userId,
      session.answers.contentKind,
      session.answers.title,
      composedDescription,
      major,
      term,
      JSON.stringify([
        ...(session.answers.tags || []),
        session.answers.driveFileId ? `_drive_file_id:${session.answers.driveFileId}` : null,
        session.answers.mimeType ? `_drive_mime:${session.answers.mimeType}` : null
      ].filter(Boolean)),
      session.answers.driveLink || null
    ]
  );

  await query(
    `INSERT INTO admin_notifications
     (type, title, message, payload, status)
     VALUES ('submission-pending', $1, $2, $3::jsonb, 'open')`,
    [
      "University submission pending",
      `${session.answers.title} requires moderation`,
      JSON.stringify({
        submissionId: inserted.rows[0].id,
        userId: session.userId,
        section: "university",
        contentKind: session.answers.contentKind
      })
    ]
  );

  return inserted.rows[0];
}

function extractSubmissionFile(ctx) {
  const doc = ctx.message?.document;
  if (doc) {
    return {
      fileId: doc.file_id,
      fileName: doc.file_name || `telegram-file-${Date.now()}`,
      mimeType: doc.mime_type || "application/octet-stream"
    };
  }

  const photos = Array.isArray(ctx.message?.photo) ? ctx.message.photo : [];
  if (photos.length) {
    const best = photos[photos.length - 1];
    return {
      fileId: best.file_id,
      fileName: `telegram-photo-${Date.now()}.jpg`,
      mimeType: "image/jpeg"
    };
  }

  return null;
}

async function handleSubmissionWizardMediaInput(ctx) {
  const key = getSessionKey(ctx);
  const session = submissionSessions.get(key);
  if (!session) return false;

  const step = UNIVERSITY_SUBMISSION_STEPS[session.stepIndex];
  if (!step || step.key !== "fileUpload") return false;

  const media = extractSubmissionFile(ctx);
  if (!media) {
    await ctx.reply("فایل معتبر نیست. لطفا فایل را به صورت document یا photo بفرست.");
    return true;
  }

  try {
    const fileUrl = await ctx.telegram.getFileLink(media.fileId);
    const response = await fetch(String(fileUrl));
    if (!response.ok) {
      throw new Error(`Telegram file download failed with status ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);

    const drive = await uploadBufferToDrive({
      fileBuffer,
      fileName: media.fileName,
      mimeType: media.mimeType,
      contentType: "university",
      makePublic: true
    });

    session.answers.fileName = media.fileName;
    session.answers.mimeType = media.mimeType;
    session.answers.driveFileId = drive.fileId;
    session.answers.driveLink = drive.webViewLink || drive.webContentLink || null;

    session.stepIndex += 1;
    submissionSessions.set(key, session);

    await ctx.reply("فایل با موفقیت آپلود شد.");
    await askSubmissionStep(ctx, session);
    return true;
  } catch (error) {
    console.error(error);
    logError("University submission file upload failed", {
      error: error?.message || String(error),
      userId: session.userId,
      fileName: media.fileName
    });
    await ctx.reply("آپلود فایل انجام نشد. دوباره فایل را ارسال کن.");
    return true;
  }
}

async function handleSubmissionWizardInput(ctx) {
  const key = getSessionKey(ctx);
  const session = submissionSessions.get(key);
  if (!session) return false;

  const text = String(ctx.message?.text || "").trim();
  if (text === UNIVERSITY_SUBMISSION_BACK) {
    submissionSessions.delete(key);
    await ctx.reply("ارسال محتوا لغو شد.", universityMenu());
    return true;
  }

  const step = UNIVERSITY_SUBMISSION_STEPS[session.stepIndex];
  if (!step) {
    submissionSessions.delete(key);
    await ctx.reply("نشست ارسال محتوا نامعتبر بود. دوباره شروع کن.", universityMenu());
    return true;
  }

  if (step.key === "fileUpload") {
    await ctx.reply("در این مرحله باید فایل را ارسال کنی (document/photo).");
    return true;
  }

  const parsed = parseSubmissionStepValue(step, text);
  if (!parsed.ok) {
    await ctx.reply(parsed.message);
    await askSubmissionStep(ctx, session);
    return true;
  }

  if (step.key === "contentKind") {
    session.answers.contentKind = parsed.value.contentKind;
    session.answers.contentKindLabel = parsed.value.contentKindLabel;
  } else if (step.key === "confirm") {
    if (!session.answers.driveLink) {
      await ctx.reply("قبل از ثبت نهایی، فایل را آپلود کن.");
      return true;
    }

    try {
      const saved = await saveUniversitySubmission(session);
      submissionSessions.delete(key);
      logInfo("University submission saved", { submissionId: saved.id, userId: session.userId });
      await ctx.reply(
        `ارسال شما ثبت شد و برای ادمین رفت.\nشناسه ارسال: #${saved.id}\nوضعیت: در انتظار بررسی`,
        universityMenu()
      );
    } catch (error) {
      console.error(error);
      logError("University submission save failed", { error: error?.message || String(error), userId: session.userId });
      submissionSessions.delete(key);
      await ctx.reply("خطا در ثبت ارسال. دوباره تلاش کن.", universityMenu());
    }
    return true;
  } else {
    session.answers[step.key] = parsed.value;
  }

  session.stepIndex += 1;
  submissionSessions.set(key, session);
  await askSubmissionStep(ctx, session);
  return true;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function toFaDate(value) {
  if (!value) return "نامشخص";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "نامشخص";
  return parsed.toLocaleDateString("fa-IR");
}

function formatOpportunityType(type) {
  const map = {
    internship: "کارآموزی",
    job: "استخدام",
    "project-based": "پروژه ای",
    freelance: "فریلنس",
    "part-time": "پاره وقت",
    mentorship: "منتورشیپ",
    challenge: "چالش"
  };
  return map[type] || type || "نامشخص";
}

function formatProjectType(type) {
  const map = {
    industry: "پروژه واقعی شرکت",
    portfolio: "پروژه رزومه ای",
    open_source: "تسک متن باز"
  };
  return map[type] || type || "نامشخص";
}

function formatLocation(locationMode, city) {
  const modeMap = {
    remote: "ریموت",
    "on-site": "حضوری",
    hybrid: "هیبرید"
  };
  const mode = modeMap[locationMode] || "نامشخص";
  if (!city) return mode;
  return `${mode} - ${city}`;
}

function formatApplicationStatus(status) {
  const map = {
    draft: "پیش نویس",
    submitted: "ارسال شده",
    viewed: "دیده شده",
    interview: "مصاحبه",
    rejected: "رد شده",
    accepted: "قبول شده"
  };
  return map[status] || status || "نامشخص";
}

function formatStudentProjectStatus(status) {
  const map = {
    in_progress: "در حال انجام",
    submitted: "تحویل شده",
    completed: "تکمیل شده",
    cancelled: "لغو شده"
  };
  return map[status] || status || "نامشخص";
}

function parseProfileSkills(profileSkills) {
  return asArray(profileSkills)
    .map((item) => {
      if (typeof item === "string") {
        return { name: item, score: 1 };
      }

      const name = String(item?.name || item?.skill_name || "").trim();
      if (!name) return null;

      return {
        name,
        score: Number(item?.score ?? item?.level ?? 1)
      };
    })
    .filter(Boolean);
}

function sortSkillEntries(skillMap, limit = 6) {
  return [...skillMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, score]) => `${name}(${score})`);
}

function extractRequiredSkillNames(requiredSkills, limit = 20) {
  const parsed = parseRequiredSkills(requiredSkills);
  const names = [];
  const seen = new Set();

  for (const item of parsed) {
    const name = String(item?.name || item?.skill || item?.skill_name || "").trim();
    if (!name) continue;
    const normalized = normalizeSkillName(name);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    names.push(name);
    if (names.length >= limit) break;
  }

  return names;
}

function getMatchedSkills(requiredSkills, skillMap, limit = 3) {
  const names = extractRequiredSkillNames(requiredSkills, 30);
  return names.filter((name) => Number(skillMap.get(normalizeSkillName(name)) || 0) > 0).slice(0, limit);
}

function getMissingSkills(requiredSkills, skillMap, limit = 3) {
  const names = extractRequiredSkillNames(requiredSkills, 30);
  return names.filter((name) => Number(skillMap.get(normalizeSkillName(name)) || 0) <= 0).slice(0, limit);
}

function goalMatchesOpportunity(goal, opportunityType) {
  const value = String(goal || "").toLowerCase();
  if (!value) return false;

  if (value.includes("کارآموز") && opportunityType === "internship") return true;
  if (value.includes("شغل") && opportunityType === "job") return true;
  if (value.includes("پروژه") && ["project-based", "freelance", "part-time", "challenge"].includes(opportunityType)) {
    return true;
  }

  return false;
}

function buildOpportunityReason(item, profile, context) {
  const reasons = [];
  const matchedSkills = getMatchedSkills(item.required_skills, context.skillMap, 2);
  const missingSkills = getMissingSkills(item.required_skills, context.skillMap, 2);

  if (matchedSkills.length) reasons.push(`مهارت مشترک: ${matchedSkills.join(" + ")}`);
  if (goalMatchesOpportunity(profile?.short_term_goal, item.opportunity_type)) reasons.push("همسو با هدف کوتاه مدت");
  if (context.city && item.city && normalizeSkillName(context.city) === normalizeSkillName(item.city)) {
    reasons.push("همسو با شهر انتخابی");
  }
  if (item.location_mode === "remote") reasons.push("قابل انجام به صورت ریموت");
  if (context.weeklyHours && item.hours_per_week && Number(item.hours_per_week) <= Number(context.weeklyHours)) {
    reasons.push("متناسب با زمان آزاد هفتگی");
  }
  if (!reasons.length && missingSkills.length) reasons.push(`گپ مهارتی کم: ${missingSkills.join(" + ")}`);
  if (!reasons.length) reasons.push("سطح و شرایط کلی مناسب پروفایل تو است");

  return reasons.slice(0, 2).join(" | ");
}

async function loadIndustryContext(ctx) {
  const userId = await ensureUser(ctx);
  const profileRes = await query(`SELECT * FROM user_profiles WHERE user_id = $1 LIMIT 1`, [userId]);
  const profile = profileRes.rows[0] || null;

  const dbSkillsRes = await query(
    `SELECT skill_name, level
     FROM student_skills
     WHERE user_id = $1
     ORDER BY level DESC, skill_name ASC`,
    [userId]
  );

  const mergedSkills = [
    ...dbSkillsRes.rows.map((item) => ({ name: item.skill_name, score: Number(item.level || 0) })),
    ...parseProfileSkills(profile?.skills)
  ];

  const skillMap = buildSkillMap(mergedSkills);
  const context = {
    userId,
    levelNum: levelToNumber(profile?.skill_level),
    city: profile?.city || null,
    weeklyHours: Number(profile?.weekly_hours || 0),
    skillMap
  };

  return {
    userId,
    profile,
    context
  };
}

async function listOpenOpportunities(limit = 40) {
  const rows = await query(
    `SELECT o.*, c.name AS company_name
     FROM industry_opportunities o
     LEFT JOIN industry_companies c ON c.id = o.company_id
     WHERE o.approval_status = 'approved'
       AND o.status = 'open'
     ORDER BY o.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.rows;
}

async function listOpenProjects(limit = 40) {
  const rows = await query(
    `SELECT p.*, c.name AS company_name
     FROM industry_projects p
     LEFT JOIN industry_companies c ON c.id = p.company_id
     WHERE p.status = 'open'
     ORDER BY p.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.rows;
}

async function showIndustryHome(ctx) {
  const { profile } = await loadIndustryContext(ctx);
  const profileHint = profile
    ? "پروفایل صنعتی شما آماده است. یکی از ماژول ها را انتخاب کن."
    : "برای خروجی دقیق تر، اول پروفایل را از بخش «تکمیل پروفایل» ثبت کن.";

  await ctx.reply(`پنل صنعت فعال شد.\n${profileHint}`, industryMenu());
}

async function showIndustryProfileModule(ctx) {
  const { profile, context } = await loadIndustryContext(ctx);
  if (!profile) {
    await ctx.reply("پروفایل صنعتی پیدا نشد. اول «تکمیل پروفایل» را انجام بده.", industryMenu());
    return;
  }

  const interests = asArray(profile.interests).join("، ") || "ثبت نشده";
  const skills = sortSkillEntries(context.skillMap, 8).join("، ") || "ثبت نشده";
  const links = [
    profile.github_url ? `Git: ${profile.github_url}` : null,
    profile.portfolio_url ? `Portfolio: ${profile.portfolio_url}` : null,
    profile.resume_url ? `Resume: ${profile.resume_url}` : null
  ].filter(Boolean).join(" | ") || "ثبت نشده";

  await ctx.reply(
    `ماژول 1 - پروفایل صنعتی\n` +
    `هدف: ${profile.short_term_goal || "ثبت نشده"}\n` +
    `علاقه ها: ${interests}\n` +
    `زمان آزاد هفتگی: ${profile.weekly_hours || "ثبت نشده"} ساعت\n` +
    `شهر/ریموت: ${profile.city || "ثبت نشده"}\n` +
    `مهارت ها: ${skills}\n` +
    `نمونه کارها: ${links}\n\n` +
    `این اطلاعات برای پیشنهاددهی فرصت ها استفاده می شود.`,
    industryMenu()
  );
}

async function showIndustryRecommenderModule(ctx) {
  const { profile, context } = await loadIndustryContext(ctx);
  if (!profile) {
    await ctx.reply("برای پیشنهاد شخصی، اول «تکمیل پروفایل» را انجام بده.", industryMenu());
    return;
  }

  const opportunities = await listOpenOpportunities(120);
  if (!opportunities.length) {
    await ctx.reply("فعلا فرصت صنعتی تاییدشده ای ثبت نشده.", industryMenu());
    return;
  }

  const top = opportunities
    .map((item) => ({ ...item, matchScore: scoreOpportunity(item, context) }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10);

  const text = top
    .map((item, index) =>
      `${index + 1}. #${item.id} ${item.title} | ${formatOpportunityType(item.opportunity_type)} | ${item.level} | امتیاز ${item.matchScore}\n` +
      `دلیل: ${buildOpportunityReason(item, profile, context)}`
    )
    .join("\n\n");

  await ctx.reply(`ماژول 2 - موتور پیشنهاددهی\nTop 10 پیشنهاد شخصی:\n\n${text}`, industryMenu());
}

async function showIndustryOpportunityBoardModule(ctx) {
  const { profile, context } = await loadIndustryContext(ctx);
  const opportunities = await listOpenOpportunities(20);

  if (!opportunities.length) {
    await ctx.reply("در حال حاضر فرصت باز برای نمایش وجود ندارد.", industryMenu());
    return;
  }

  const ranked = profile
    ? opportunities
        .map((item) => ({ ...item, matchScore: scoreOpportunity(item, context) }))
        .sort((a, b) => b.matchScore - a.matchScore)
    : opportunities;

  const text = ranked.slice(0, 10).map((item, index) => {
    const gap = profile ? getMissingSkills(item.required_skills, context.skillMap, 2) : [];
    const gapText = gap.length ? ` | شکاف: ${gap.join(", ")}` : "";
    const scoreText = profile ? ` | امتیاز: ${item.matchScore}` : "";

    return (
      `${index + 1}. #${item.id} ${item.title}` +
      ` | ${formatOpportunityType(item.opportunity_type)}` +
      ` | ${item.level}` +
      ` | ${formatLocation(item.location_mode, item.city)}` +
      ` | ددلاین: ${toFaDate(item.deadline_at)}` +
      `${scoreText}${gapText}`
    );
  }).join("\n");

  await ctx.reply(
    `ماژول 3 - برد فرصت ها\n${text}\n\n` +
    `جزئیات فرصت: جزئیات فرصت <id>\n` +
    `درخواست: درخواست فرصت <id>\n` +
    `ذخیره: ذخیره فرصت <id>`,
    industryMenu()
  );
}

async function findOpportunityById(opportunityId) {
  const result = await query(
    `SELECT o.*, c.name AS company_name, c.city AS company_city
     FROM industry_opportunities o
     LEFT JOIN industry_companies c ON c.id = o.company_id
     WHERE o.id = $1
     LIMIT 1`,
    [opportunityId]
  );

  return result.rows[0] || null;
}

function contentMatchScore(item, keywords) {
  if (!keywords.length) return 0;
  const haystack = `${item.title || ""} ${item.description || ""} ${asArray(item.tags).join(" ")}`.toLowerCase();
  let score = 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) score += 1;
  }
  return score;
}

function projectMatchScore(item, keywords) {
  if (!keywords.length) return item.type === "portfolio" ? 1 : 0;
  const required = extractRequiredSkillNames(item.required_skills, 20).map((skill) => normalizeSkillName(skill));
  const haystack = `${item.title || ""} ${item.brief || ""} ${required.join(" ")}`.toLowerCase();
  let score = item.type === "portfolio" ? 1 : 0;
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) score += 1;
  }
  return score;
}

async function buildPreparationTips(requiredSkills, gapSkills) {
  const keywords = [...gapSkills, ...requiredSkills]
    .map((item) => normalizeSkillName(item))
    .filter(Boolean)
    .slice(0, 4);

  const resourcesRes = await query(
    `SELECT title, kind, description, tags
     FROM contents
     WHERE type = 'industry'
       AND is_published = TRUE
       AND kind IN ('resource', 'video')
     ORDER BY created_at DESC
     LIMIT 30`
  );

  const scoredResources = resourcesRes.rows
    .map((item) => ({ item, score: contentMatchScore(item, keywords) }))
    .sort((a, b) => b.score - a.score);

  const pickedResources = scoredResources
    .filter((entry) => entry.score > 0)
    .slice(0, 2)
    .map((entry) => entry.item);

  if (pickedResources.length < 2) {
    for (const item of resourcesRes.rows) {
      if (pickedResources.find((entry) => entry.title === item.title && entry.kind === item.kind)) continue;
      pickedResources.push(item);
      if (pickedResources.length >= 2) break;
    }
  }

  const projects = await listOpenProjects(30);
  const pickedProject = projects
    .map((item) => ({ item, score: projectMatchScore(item, keywords) }))
    .sort((a, b) => b.score - a.score)[0]?.item || null;

  return {
    resources: pickedResources,
    project: pickedProject
  };
}

async function showOpportunityDetailsById(ctx, opportunityId) {
  const { profile, context } = await loadIndustryContext(ctx);
  const item = await findOpportunityById(opportunityId);

  if (!item || item.approval_status !== "approved" || item.status !== "open") {
    await ctx.reply("فرصت معتبری با این شناسه پیدا نشد.", industryMenu());
    return;
  }

  const requiredSkills = extractRequiredSkillNames(item.required_skills, 6);
  const missingSkills = profile ? getMissingSkills(item.required_skills, context.skillMap, 4) : [];
  const prep = await buildPreparationTips(requiredSkills, missingSkills);

  const resourcesText = prep.resources.length
    ? prep.resources.map((res, idx) => `${idx + 1}. [${res.kind}] ${res.title}`).join("\n")
    : "1. منبعی ثبت نشده";

  const resumeProjectText = prep.project
    ? `#${prep.project.id} ${prep.project.title}`
    : "پروژه رزومه ای مرتبط فعلا ثبت نشده";

  await ctx.reply(
    `فرصت #${item.id} - ${item.title}\n` +
    `شرکت: ${item.company_name || "نامشخص"}\n` +
    `نوع: ${formatOpportunityType(item.opportunity_type)} | سطح: ${item.level}\n` +
    `موقعیت: ${formatLocation(item.location_mode, item.city || item.company_city)}\n` +
    `ددلاین: ${toFaDate(item.deadline_at)}\n` +
    `مهارت های لازم: ${requiredSkills.join("، ") || "ثبت نشده"}\n` +
    `شکاف مهارتی شما: ${missingSkills.join("، ") || "شکاف خاصی دیده نشد"}\n\n` +
    `شرح:\n${String(item.description || "").slice(0, 600)}\n\n` +
    `برای آماده شدن:\n${resourcesText}\n` +
    `پروژه رزومه ای پیشنهادی: ${resumeProjectText}\n\n` +
    `Apply: درخواست فرصت ${item.id}\nSave: ذخیره فرصت ${item.id}`,
    industryMenu()
  );
}

async function applyOpportunityById(ctx, opportunityId) {
  const { userId } = await loadIndustryContext(ctx);
  const item = await findOpportunityById(opportunityId);

  if (!item || item.approval_status !== "approved" || item.status !== "open") {
    await ctx.reply("این فرصت در حال حاضر قابل درخواست نیست.", industryMenu());
    return;
  }

  const upsert = await query(
    `INSERT INTO industry_applications
     (user_id, opportunity_id, status, note)
     VALUES ($1, $2, 'submitted', NULL)
     ON CONFLICT (user_id, opportunity_id)
     DO UPDATE SET
       status = 'submitted',
       updated_at = NOW()
     RETURNING *`,
    [userId, opportunityId]
  );

  await ctx.reply(
    `درخواست برای فرصت #${opportunityId} ثبت شد.\nوضعیت: ${formatApplicationStatus(upsert.rows[0]?.status)}`,
    industryMenu()
  );
}

async function saveOpportunityById(ctx, opportunityId) {
  const { userId } = await loadIndustryContext(ctx);
  const item = await findOpportunityById(opportunityId);

  if (!item || item.approval_status !== "approved" || item.status !== "open") {
    await ctx.reply("این فرصت برای ذخیره در دسترس نیست.", industryMenu());
    return;
  }

  await query(
    `INSERT INTO industry_saved_opportunities
     (user_id, opportunity_id, follow_up_status)
     VALUES ($1, $2, 'saved')
     ON CONFLICT (user_id, opportunity_id)
     DO UPDATE SET
       follow_up_status = 'saved',
       updated_at = NOW()`,
    [userId, opportunityId]
  );

  await ctx.reply(`فرصت #${opportunityId} ذخیره شد.`, industryMenu());
}

async function showIndustryApplicationTrackerModule(ctx) {
  const { userId } = await loadIndustryContext(ctx);
  const appsRes = await query(
    `SELECT a.id, a.status, a.note, a.updated_at, o.id AS opportunity_id, o.title AS opportunity_title, o.deadline_at
     FROM industry_applications a
     JOIN industry_opportunities o ON o.id = a.opportunity_id
     WHERE a.user_id = $1
     ORDER BY a.updated_at DESC
     LIMIT 10`,
    [userId]
  );

  const savedRes = await query(
    `SELECT s.follow_up_status, s.follow_up_note, s.updated_at, o.id AS opportunity_id, o.title AS opportunity_title, o.deadline_at
     FROM industry_saved_opportunities s
     JOIN industry_opportunities o ON o.id = s.opportunity_id
     WHERE s.user_id = $1
     ORDER BY s.updated_at DESC
     LIMIT 10`,
    [userId]
  );

  const now = Date.now();
  const reminders = [];

  for (const app of appsRes.rows) {
    const deadline = app.deadline_at ? new Date(app.deadline_at).getTime() : NaN;
    if (Number.isFinite(deadline)) {
      const days = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
      if (days >= 0 && days <= 7 && !["accepted", "rejected"].includes(app.status)) {
        reminders.push(`${app.opportunity_title} (${days} روز تا ددلاین)`);
      }
    }
  }

  const applicationsText = appsRes.rows.length
    ? appsRes.rows.map((item) =>
      `#${item.id} | فرصت #${item.opportunity_id} ${item.opportunity_title} | ${formatApplicationStatus(item.status)}`
    ).join("\n")
    : "درخواستی ثبت نشده";

  const savedText = savedRes.rows.length
    ? savedRes.rows.map((item) =>
      `فرصت #${item.opportunity_id} ${item.opportunity_title} | پیگیری: ${item.follow_up_status || "saved"}`
    ).join("\n")
    : "فرصت ذخیره شده ای ندارید";

  await ctx.reply(
    `ماژول 4 - پیگیری درخواست ها\n` +
    `وضعیت درخواست ها:\n${applicationsText}\n\n` +
    `فرصت های ذخیره شده:\n${savedText}\n\n` +
    `یادآور پیگیری:\n${reminders.join("\n") || "مورد فوری نداری"}\n\n` +
    `ثبت یادداشت: یادداشت درخواست <applicationId>: <متن>\n` +
    `ثبت پیگیری: پیگیری فرصت <opportunityId>: <متن>`,
    industryMenu()
  );
}

async function addApplicationNote(ctx, applicationId, note) {
  const { userId } = await loadIndustryContext(ctx);
  const updated = await query(
    `UPDATE industry_applications
     SET note = $1,
         updated_at = NOW()
     WHERE id = $2
       AND user_id = $3
     RETURNING *`,
    [note, applicationId, userId]
  );

  if (!updated.rows.length) {
    await ctx.reply("درخواستی با این شناسه برای شما پیدا نشد.", industryMenu());
    return;
  }

  await ctx.reply(`یادداشت برای درخواست #${applicationId} ذخیره شد.`, industryMenu());
}

async function addSavedOpportunityFollowUp(ctx, opportunityId, note) {
  const { userId } = await loadIndustryContext(ctx);
  const item = await findOpportunityById(opportunityId);
  if (!item) {
    await ctx.reply("فرصتی با این شناسه پیدا نشد.", industryMenu());
    return;
  }

  const updated = await query(
    `UPDATE industry_saved_opportunities
     SET follow_up_status = 'pending-follow-up',
         follow_up_note = $1,
         updated_at = NOW()
     WHERE user_id = $2
       AND opportunity_id = $3
     RETURNING *`,
    [note, userId, opportunityId]
  );

  if (!updated.rows.length) {
    await query(
      `INSERT INTO industry_saved_opportunities
       (user_id, opportunity_id, follow_up_status, follow_up_note)
       VALUES ($1, $2, 'pending-follow-up', $3)
       ON CONFLICT (user_id, opportunity_id)
       DO UPDATE SET
         follow_up_status = 'pending-follow-up',
         follow_up_note = EXCLUDED.follow_up_note,
         updated_at = NOW()`,
      [userId, opportunityId, note]
    );
  }

  await ctx.reply(`پیگیری برای فرصت #${opportunityId} ثبت شد.`, industryMenu());
}

async function showIndustryProjectHubModule(ctx) {
  const { profile, context } = await loadIndustryContext(ctx);
  const projects = await listOpenProjects(60);

  if (!projects.length) {
    await ctx.reply("فعلا پروژه باز برای نمایش نداریم.", industryMenu());
    return;
  }

  const ranked = profile
    ? projects
        .map((item) => ({ ...item, matchScore: scoreProject(item, context) }))
        .sort((a, b) => b.matchScore - a.matchScore)
    : projects;

  const byType = {
    industry: [],
    portfolio: [],
    open_source: []
  };

  for (const item of ranked) {
    if (byType[item.type]) byType[item.type].push(item);
  }

  const sections = [
    ["industry", "پروژه های واقعی شرکت ها"],
    ["portfolio", "پروژه های رزومه ای فنجو"],
    ["open_source", "تسک های متن باز"]
  ].map(([type, title]) => {
    const items = byType[type].slice(0, 3);
    const body = items.length
      ? items.map((item) =>
        `#${item.id} ${item.title} | ${item.level} | ${item.estimated_hours || "?"}h${profile ? ` | امتیاز ${item.matchScore}` : ""}`
      ).join("\n")
      : "موردی ثبت نشده";

    return `${title}:\n${body}`;
  }).join("\n\n");

  await ctx.reply(
    `ماژول 5 - هاب پروژه ها\n${sections}\n\n` +
    `جزئیات پروژه: جزئیات پروژه <id>\n` +
    `شروع پروژه: شروع پروژه <id>`,
    industryMenu()
  );
}

async function showProjectDetailsById(ctx, projectId) {
  const projectRes = await query(
    `SELECT p.*, c.name AS company_name
     FROM industry_projects p
     LEFT JOIN industry_companies c ON c.id = p.company_id
     WHERE p.id = $1
     LIMIT 1`,
    [projectId]
  );
  const project = projectRes.rows[0] || null;

  if (!project || project.status !== "open") {
    await ctx.reply("پروژه معتبری با این شناسه پیدا نشد.", industryMenu());
    return;
  }

  const milestonesRes = await query(
    `SELECT title, description, week_no
     FROM industry_project_milestones
     WHERE project_id = $1
     ORDER BY week_no ASC, id ASC
     LIMIT 4`,
    [projectId]
  );

  const required = extractRequiredSkillNames(project.required_skills, 6).join("، ") || "ثبت نشده";
  const deliverables = asArray(project.deliverables)
    .map((item) => (typeof item === "string" ? item : String(item?.title || item?.name || "").trim()))
    .filter(Boolean)
    .slice(0, 4)
    .join(" | ") || "ثبت نشده";
  const criteria = asArray(project.evaluation_criteria)
    .map((item) => (typeof item === "string" ? item : String(item?.title || item?.name || "").trim()))
    .filter(Boolean)
    .slice(0, 3)
    .join(" | ") || "ثبت نشده";

  const milestones = milestonesRes.rows.length
    ? milestonesRes.rows.map((m, idx) => `${idx + 1}. هفته ${m.week_no || "?"}: ${m.title}`).join("\n")
    : "مایلستونی تعریف نشده";

  await ctx.reply(
    `پروژه #${project.id} - ${project.title}\n` +
    `نوع: ${formatProjectType(project.type)} | سطح: ${project.level}\n` +
    `شرکت: ${project.company_name || "نامشخص"}\n` +
    `مهارت های لازم: ${required}\n` +
    `Brief: ${String(project.brief || "").slice(0, 500)}\n\n` +
    `Deliverables: ${deliverables}\n` +
    `معیار ارزیابی: ${criteria}\n` +
    `خروجی رزومه ای: ${project.resume_ready ? "دارد" : "ندارد"}\n\n` +
    `Milestones:\n${milestones}\n\n` +
    `برای شروع: شروع پروژه ${project.id}`,
    industryMenu()
  );
}

async function startStudentProjectById(ctx, projectId) {
  const { userId } = await loadIndustryContext(ctx);
  const projectRes = await query(`SELECT id, title FROM industry_projects WHERE id = $1 AND status = 'open' LIMIT 1`, [projectId]);
  if (!projectRes.rows.length) {
    await ctx.reply("پروژه باز معتبری با این شناسه پیدا نشد.", industryMenu());
    return;
  }

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

  await ctx.reply(
    `پروژه #${projectId} شروع شد.\nشناسه فضای کاری: ${upsert.rows[0].id}\n` +
    `برای ثبت پیشرفت: پیشرفت پروژه ${upsert.rows[0].id} 30`,
    industryMenu()
  );
}

async function updateStudentProjectProgress(ctx, studentProjectId, progressRaw) {
  const { userId } = await loadIndustryContext(ctx);
  const progress = Math.max(0, Math.min(100, Number(progressRaw)));
  if (!Number.isFinite(progress)) {
    await ctx.reply("درصد پیشرفت نامعتبر است.", industryMenu());
    return;
  }

  const currentRes = await query(
    `SELECT *
     FROM industry_student_projects
     WHERE id = $1
       AND user_id = $2
     LIMIT 1`,
    [studentProjectId, userId]
  );
  if (!currentRes.rows.length) {
    await ctx.reply("فضای کاری پروژه برای شما پیدا نشد.", industryMenu());
    return;
  }

  const current = currentRes.rows[0];
  const nextStatus = progress >= 100
    ? "completed"
    : (current.status === "completed" ? "in_progress" : current.status);

  const updated = await query(
    `UPDATE industry_student_projects
     SET progress = $1,
         status = $2,
         updated_at = NOW()
     WHERE id = $3
       AND user_id = $4
     RETURNING *`,
    [progress, nextStatus, studentProjectId, userId]
  );

  await ctx.reply(
    `پیشرفت پروژه #${studentProjectId} ثبت شد: ${updated.rows[0].progress}% | ${formatStudentProjectStatus(updated.rows[0].status)}`,
    industryMenu()
  );
}

async function addStudentProjectLink(ctx, studentProjectId, url) {
  const { userId } = await loadIndustryContext(ctx);

  if (!validateUrl(url)) {
    await ctx.reply("لینک معتبر نیست. باید با http:// یا https:// شروع شود.", industryMenu());
    return;
  }

  const currentRes = await query(
    `SELECT *
     FROM industry_student_projects
     WHERE id = $1
       AND user_id = $2
     LIMIT 1`,
    [studentProjectId, userId]
  );
  if (!currentRes.rows.length) {
    await ctx.reply("فضای کاری پروژه برای شما پیدا نشد.", industryMenu());
    return;
  }

  const current = currentRes.rows[0];
  const links = asArray(current.output_links).map((item) => String(item)).filter(Boolean);
  if (!links.includes(url)) links.push(url);

  const updated = await query(
    `UPDATE industry_student_projects
     SET output_links = $1::jsonb,
         updated_at = NOW()
     WHERE id = $2
       AND user_id = $3
     RETURNING *`,
    [JSON.stringify(links), studentProjectId, userId]
  );

  await ctx.reply(
    `لینک خروجی اضافه شد. تعداد لینک ها: ${asArray(updated.rows[0].output_links).length}`,
    industryMenu()
  );
}

async function showIndustryWorkspaceModule(ctx) {
  const { userId } = await loadIndustryContext(ctx);
  const rows = await query(
    `SELECT sp.id, sp.project_id, sp.status, sp.progress, sp.output_links, p.title, p.estimated_hours
     FROM industry_student_projects sp
     JOIN industry_projects p ON p.id = sp.project_id
     WHERE sp.user_id = $1
     ORDER BY sp.updated_at DESC
     LIMIT 10`,
    [userId]
  );

  if (!rows.rows.length) {
    await ctx.reply(
      `ماژول 6 - اجرای پروژه\nفعلا پروژه فعالی نداری.\nبرای شروع: شروع پروژه <projectId>`,
      industryMenu()
    );
    return;
  }

  const text = rows.rows.map((item) =>
    `#${item.id} | پروژه #${item.project_id} ${item.title} | ${item.progress}% | ${formatStudentProjectStatus(item.status)} | لینک خروجی: ${asArray(item.output_links).length}`
  ).join("\n");

  await ctx.reply(
    `ماژول 6 - اجرای پروژه\n${text}\n\n` +
    `ثبت پیشرفت: پیشرفت پروژه <studentProjectId> <0-100>\n` +
    `ثبت لینک خروجی: لینک پروژه <studentProjectId> <url>`,
    industryMenu()
  );
}

async function showIndustryCareerPathModule(ctx) {
  const { profile, context } = await loadIndustryContext(ctx);
  const pathsRes = await query(
    `SELECT *
     FROM industry_career_paths
     WHERE is_active = TRUE
     ORDER BY created_at DESC
     LIMIT 20`
  );

  if (!pathsRes.rows.length) {
    await ctx.reply("مسیر شغلی فعالی ثبت نشده.", industryMenu());
    return;
  }

  const ranked = pathsRes.rows
    .map((path) => {
      const required = asArray(path.required_skills).map((item) => String(item).trim()).filter(Boolean);
      const matched = required.filter((item) => Number(context.skillMap.get(normalizeSkillName(item)) || 0) > 0);
      const gaps = required.filter((item) => Number(context.skillMap.get(normalizeSkillName(item)) || 0) <= 0);
      const coverage = required.length ? Math.round((matched.length / required.length) * 100) : 50;

      return { ...path, required, gaps, coverage };
    })
    .sort((a, b) => b.coverage - a.coverage);

  const top = ranked.slice(0, 3);
  const lines = top.map((item, index) =>
    `${index + 1}. ${item.name} | پوشش مهارتی: ${item.coverage}% | شکاف: ${item.gaps.slice(0, 3).join("، ") || "ندارد"}`
  ).join("\n");

  const selected = top[0];
  const roadmapRes = await query(
    `SELECT id, title
     FROM industry_roadmaps
     WHERE career_path_id = $1
       AND is_active = TRUE
     ORDER BY created_at DESC
     LIMIT 1`,
    [selected.id]
  );

  const roadmap = roadmapRes.rows[0] || null;
  const stepsRes = roadmap
    ? await query(
        `SELECT step_order, title
         FROM industry_roadmap_steps
         WHERE roadmap_id = $1
         ORDER BY step_order ASC
         LIMIT 3`,
        [roadmap.id]
      )
    : { rows: [] };

  const checklist = asArray(selected.junior_ready_checklist).slice(0, 4).join(" | ") || "چک لیستی ثبت نشده";
  const nextSteps = stepsRes.rows.length
    ? stepsRes.rows.map((item) => `${item.step_order}. ${item.title}`).join("\n")
    : "گام مشخصی ثبت نشده";

  await ctx.reply(
    `ماژول 7 - مسیر شغلی\n${profile ? `هدف فعلی: ${profile.short_term_goal || "ثبت نشده"}\n` : ""}` +
    `${lines}\n\n` +
    `مسیر پیشنهادی: ${selected.name}\n` +
    `Roadmap: ${roadmap?.title || "ثبت نشده"}\n` +
    `قدم بعدی:\n${nextSteps}\n\n` +
    `Junior-ready checklist:\n${checklist}`,
    industryMenu()
  );
}

async function showIndustryLearningLibraryModule(ctx) {
  const { profile } = await loadIndustryContext(ctx);
  const interests = asArray(profile?.interests).map((item) => normalizeSkillName(item)).filter(Boolean);

  const contentsRes = await query(
    `SELECT title, kind, description, tags
     FROM contents
     WHERE type = 'industry'
       AND is_published = TRUE
       AND kind IN ('resource', 'video', 'roadmap', 'project')
     ORDER BY created_at DESC
     LIMIT 40`
  );

  const rankedContents = contentsRes.rows
    .map((item) => ({ item, score: contentMatchScore(item, interests) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item)
    .slice(0, 8);

  const resourcesText = rankedContents.length
    ? rankedContents.map((item, index) => `${index + 1}. [${item.kind}] ${item.title}`).join("\n")
    : "منبعی برای نمایش ثبت نشده";

  const miniProjects = await query(
    `SELECT id, title, type
     FROM industry_projects
     WHERE status = 'open'
       AND type IN ('portfolio', 'open_source')
     ORDER BY created_at DESC
     LIMIT 2`
  );

  const miniText = miniProjects.rows.length
    ? miniProjects.rows.map((item) => `- #${item.id} ${item.title} (${formatProjectType(item.type)})`).join("\n")
    : "- مینی پروژه ای ثبت نشده";

  await ctx.reply(
    `ماژول 8 - کتابخانه منابع صنعتی\n${resourcesText}\n\n` +
    `تمرین و mini-project پیشنهادی:\n${miniText}`,
    industryMenu()
  );
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

const menuLabelAliases = new Map([
  [LABEL_START, "شروع"],
  [LABEL_PROFILE, "تکمیل پروفایل"],
  [LABEL_UNIVERSITY, "دانشگاه"],
  [LABEL_INDUSTRY, "صنعت"],
  [LABEL_MY_PATH, "مسیر من"],
  ["📘 دروس دانشگاه", "دروس دانشگاه"],
  ["دروس دانشگاه", "📘 دروس دانشگاه"],
  ["👨‍🏫 اساتید دانشگاه", "اساتید دانشگاه"],
  ["اساتید دانشگاه", "👨‍🏫 اساتید دانشگاه"],
  ["📝 جزوه های دانشگاه", "جزوه های دانشگاه"],
  ["جزوه های دانشگاه", "📝 جزوه های دانشگاه"],
  ["📚 کتاب های دانشگاه", "کتاب های دانشگاه"],
  ["کتاب های دانشگاه", "📚 کتاب های دانشگاه"],
  ["🔎 منابع دانشگاه", "منابع دانشگاه"],
  ["منابع دانشگاه", "🔎 منابع دانشگاه"],
  ["🎯 نکات امتحان دانشگاه", "نکات امتحان دانشگاه"],
  ["نکات امتحان دانشگاه", "🎯 نکات امتحان دانشگاه"],
  ["📤 ارسال محتوای دانشگاه", "ارسال محتوای دانشگاه"],
  ["🧑‍💼 پروفایل صنعتی", "پروفایل صنعتی"],
  ["🎯 پیشنهاد فرصت ها", "پیشنهاد فرصت ها"],
  ["📌 برد فرصت ها", "برد فرصت ها"],
  ["📍 پیگیری درخواست ها", "پیگیری درخواست ها"],
  ["🧪 هاب پروژه ها", "هاب پروژه ها"],
  ["🛠️ اجرای پروژه", "اجرای پروژه"],
  ["🗺️ مسیر شغلی", "مسیر شغلی"],
  ["🎓 منابع صنعتی", "منابع صنعتی"],
  ["بازگشت به منوی اصلی", UNI_MENU_BACK],
  ["لغو ارسال محتوا", UNIVERSITY_SUBMISSION_BACK],
  ["ثبت نهایی ارسال", UNIVERSITY_SUBMISSION_DONE]
]);

function normalizeMenuText(text) {
  const raw = String(text || "").trim();
  return menuLabelAliases.get(raw) || raw;
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
    "ارسال محتوای دانشگاه",
    "پروفایل صنعتی",
    "پیشنهاد فرصت ها",
    "برد فرصت ها",
    "پیگیری درخواست ها",
    "هاب پروژه ها",
    "اجرای پروژه",
    "مسیر شغلی",
    "منابع صنعتی",
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
  bot.on(["document", "photo"], async (ctx, next) => {
    const handledMedia = await handleSubmissionWizardMediaInput(ctx);
    if (handledMedia) return;
    return next();
  });

  bot.on("text", async (ctx, next) => {
    if (ctx.message?.text) {
      ctx.message.text = normalizeMenuText(ctx.message.text);
    }

    const handledSubmission = await handleSubmissionWizardInput(ctx);
    if (handledSubmission) return;

    const handled = await handleProfileWizardInput(ctx);
    if (handled) return;
    return next();
  });

  bot.start(async (ctx) => {
    await ensureUser(ctx);

    await ctx.reply(
      "👋 به فنجو خوش اومدی.\n✅ منوی اصلی فعال شد.",
      mainMenu()
    );
  });

  bot.hears("شروع", async (ctx) => {
    await ctx.reply("🚀 منو آماده است.", mainMenu());
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
      `🏫 ماژول دانشگاه فعال شد.\n🎓 رشته: ${major}${term ? ` | ترم: ${term}` : ""}\n👇 بخش موردنظر را انتخاب کنید:`,
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

  bot.hears("ارسال محتوای دانشگاه", async (ctx) => {
    await startUniversitySubmissionWizard(ctx);
  });

  bot.hears(UNI_MENU_BACK, async (ctx) => {
    await ctx.reply("به منوی اصلی برگشتید.", mainMenu());
  });

  bot.hears("صنعت", async (ctx) => {
    await showIndustryHome(ctx);
  });

  bot.hears("پروفایل صنعتی", async (ctx) => {
    await showIndustryProfileModule(ctx);
  });

  bot.hears("پیشنهاد فرصت ها", async (ctx) => {
    await showIndustryRecommenderModule(ctx);
  });

  bot.hears("برد فرصت ها", async (ctx) => {
    await showIndustryOpportunityBoardModule(ctx);
  });

  bot.hears("پیگیری درخواست ها", async (ctx) => {
    await showIndustryApplicationTrackerModule(ctx);
  });

  bot.hears("هاب پروژه ها", async (ctx) => {
    await showIndustryProjectHubModule(ctx);
  });

  bot.hears("اجرای پروژه", async (ctx) => {
    await showIndustryWorkspaceModule(ctx);
  });

  bot.hears("مسیر شغلی", async (ctx) => {
    await showIndustryCareerPathModule(ctx);
  });

  bot.hears("منابع صنعتی", async (ctx) => {
    await showIndustryLearningLibraryModule(ctx);
  });

  bot.hears(/^جزئیات فرصت\s+(\d+)$/, async (ctx) => {
    const opportunityId = Number(ctx.match[1]);
    if (!opportunityId) {
      await ctx.reply("شناسه فرصت نامعتبر است.", industryMenu());
      return;
    }
    await showOpportunityDetailsById(ctx, opportunityId);
  });

  bot.hears(/^درخواست فرصت\s+(\d+)$/, async (ctx) => {
    const opportunityId = Number(ctx.match[1]);
    if (!opportunityId) {
      await ctx.reply("شناسه فرصت نامعتبر است.", industryMenu());
      return;
    }
    await applyOpportunityById(ctx, opportunityId);
  });

  bot.hears(/^ذخیره فرصت\s+(\d+)$/, async (ctx) => {
    const opportunityId = Number(ctx.match[1]);
    if (!opportunityId) {
      await ctx.reply("شناسه فرصت نامعتبر است.", industryMenu());
      return;
    }
    await saveOpportunityById(ctx, opportunityId);
  });

  bot.hears(/^یادداشت درخواست\s+(\d+)\s*[:：]\s*(.+)$/i, async (ctx) => {
    const applicationId = Number(ctx.match[1]);
    const note = String(ctx.match[2] || "").trim();
    if (!applicationId || !note) {
      await ctx.reply("فرمت درست: یادداشت درخواست <applicationId>: <متن>", industryMenu());
      return;
    }
    await addApplicationNote(ctx, applicationId, note);
  });

  bot.hears(/^پیگیری فرصت\s+(\d+)\s*[:：]\s*(.+)$/i, async (ctx) => {
    const opportunityId = Number(ctx.match[1]);
    const note = String(ctx.match[2] || "").trim();
    if (!opportunityId || !note) {
      await ctx.reply("فرمت درست: پیگیری فرصت <opportunityId>: <متن>", industryMenu());
      return;
    }
    await addSavedOpportunityFollowUp(ctx, opportunityId, note);
  });

  bot.hears(/^جزئیات پروژه\s+(\d+)$/, async (ctx) => {
    const projectId = Number(ctx.match[1]);
    if (!projectId) {
      await ctx.reply("شناسه پروژه نامعتبر است.", industryMenu());
      return;
    }
    await showProjectDetailsById(ctx, projectId);
  });

  bot.hears(/^شروع پروژه\s+(\d+)$/, async (ctx) => {
    const projectId = Number(ctx.match[1]);
    if (!projectId) {
      await ctx.reply("شناسه پروژه نامعتبر است.", industryMenu());
      return;
    }
    await startStudentProjectById(ctx, projectId);
  });

  bot.hears(/^پیشرفت پروژه\s+(\d+)\s+(\d{1,3})$/, async (ctx) => {
    const studentProjectId = Number(ctx.match[1]);
    const progress = Number(ctx.match[2]);
    if (!studentProjectId || !Number.isFinite(progress)) {
      await ctx.reply("فرمت درست: پیشرفت پروژه <studentProjectId> <0-100>", industryMenu());
      return;
    }
    await updateStudentProjectProgress(ctx, studentProjectId, progress);
  });

  bot.hears(/^لینک پروژه\s+(\d+)\s+(\S+)$/i, async (ctx) => {
    const studentProjectId = Number(ctx.match[1]);
    const url = String(ctx.match[2] || "").trim();
    if (!studentProjectId || !url) {
      await ctx.reply("فرمت درست: لینک پروژه <studentProjectId> <url>", industryMenu());
      return;
    }
    await addStudentProjectLink(ctx, studentProjectId, url);
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
    logError("Telegram bot runtime error", { error: error?.message || String(error) });
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

    // Telegraf compares req.url with the provided webhook path. Keep route and
    // callback path aligned to avoid false 404 responses.
    app.post(webhookPath, bot.webhookCallback(webhookPath));
    await bot.telegram.setWebhook(webhookUrl);

    console.log(`Telegram bot webhook set: ${webhookUrl}`);
    logInfo("Telegram bot webhook configured", { webhookUrl, webhookPath });

    return { bot, mode: "webhook", webhookPath, webhookUrl };
  }

  await bot.launch();
  console.log("Telegram bot polling is running.");
  logInfo("Telegram bot polling is running");

  return { bot, mode: "polling" };
}

module.exports = {
  attachBot
};
