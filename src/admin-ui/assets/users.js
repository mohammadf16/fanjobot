(function () {
  var usersCache = [];
  var profilesCache = [];
  var usersTotalCache = 0;

  function el(id) {
    return document.getElementById(id);
  }

  function buildUsersQuery() {
    var query = new URLSearchParams({ limit: "160" });
    var q = String((el("usersSearchInput") || {}).value || "").trim();
    var hasProfile = String((el("usersHasProfileInput") || {}).value || "").trim();
    if (q) query.set("q", q);
    if (hasProfile) query.set("hasProfile", hasProfile);
    return query.toString();
  }

  function buildProfilesQuery() {
    var query = new URLSearchParams({ limit: "120" });
    var q = String((el("usersSearchInput") || {}).value || "").trim();
    var major = String((el("profilesMajorInput") || {}).value || "").trim();
    var level = String((el("profilesLevelInput") || {}).value || "").trim();
    if (q) query.set("q", q);
    if (major) query.set("major", major);
    if (level) query.set("level", level);
    return query.toString();
  }

  function userProfileLink(userId, fullName) {
    var id = Number(userId);
    var label = String(fullName || "").trim() || (id ? "User #" + id : "-");
    if (!id) return AdminCore.esc(label);
    return "<a class='entity-link' href='/admin/users/" + id + "'>" + AdminCore.esc(label) + "</a>";
  }

  function sortUsers(items) {
    var sortValue = String((el("usersSortInput") || {}).value || "created_desc").trim();
    var sorted = (items || []).slice();

    if (sortValue === "created_asc") {
      sorted.sort(function (a, b) {
        return String(a.created_at || "").localeCompare(String(b.created_at || ""));
      });
      return sorted;
    }
    if (sortValue === "name_asc") {
      sorted.sort(function (a, b) {
        return String(a.full_name || "").localeCompare(String(b.full_name || ""));
      });
      return sorted;
    }
    if (sortValue === "name_desc") {
      sorted.sort(function (a, b) {
        return String(b.full_name || "").localeCompare(String(a.full_name || ""));
      });
      return sorted;
    }

    sorted.sort(function (a, b) {
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
    return sorted;
  }

  function renderUsers(items, total) {
    var sortedItems = sortUsers(items);
    usersCache = sortedItems;
    usersTotalCache = Number(total || sortedItems.length);

    el("usersTableBody").innerHTML =
      (sortedItems || [])
        .map(function (user) {
          return (
            "<tr><td>" +
            user.id +
            "</td><td>" +
            userProfileLink(user.id, user.full_name) +
            "</td><td>" +
            AdminCore.esc(user.phone_or_email || "-") +
            "</td><td>" +
            AdminCore.esc(user.telegram_id || "-") +
            "</td><td>" +
            (user.has_profile ? AdminCore.statusPill("yes") : AdminCore.statusPill("no")) +
            "</td><td>" +
            AdminCore.esc(user.major || "-") +
            " / " +
            AdminCore.esc(user.term || "-") +
            "</td><td>" +
            AdminCore.esc(user.created_at || "") +
            "</td><td><div class='toolbar'><button class='btn ghost user-detail-btn' data-id='" +
            user.id +
            "'>Detail</button><button class='btn ghost user-copy-btn' data-id='" +
            user.id +
            "'>Copy ID</button></div></td></tr>"
          );
        })
        .join("") || "<tr><td colspan='8'>No users found.</td></tr>";

    var visible = Number((sortedItems || []).length);
    el("usersMetaBox").textContent =
      "Total: " + usersTotalCache.toLocaleString("en-US") + " | Showing: " + visible.toLocaleString("en-US");

    renderSummaryChips(sortedItems, usersTotalCache);
  }

  function renderSummaryChips(items, total) {
    var rows = items || [];
    var withProfile = rows.filter(function (item) {
      return Boolean(item.has_profile);
    }).length;
    var withoutProfile = rows.length - withProfile;
    var uniqueMajors = {};
    rows.forEach(function (item) {
      var major = String(item.major || "").trim();
      if (!major) return;
      uniqueMajors[major] = true;
    });
    var chipHtml = [
      '<span class="chip">Visible users: ' + Number(rows.length).toLocaleString("en-US") + "</span>",
      '<span class="chip ok">With profile: ' + Number(withProfile).toLocaleString("en-US") + "</span>",
      '<span class="chip warn">Without profile: ' + Number(withoutProfile).toLocaleString("en-US") + "</span>",
      '<span class="chip">Unique majors: ' + Number(Object.keys(uniqueMajors).length).toLocaleString("en-US") + "</span>",
      '<span class="chip">Server total: ' + Number(total || 0).toLocaleString("en-US") + "</span>"
    ].join("");
    el("usersSummaryChips").innerHTML = chipHtml;
  }

  function renderProfiles(items, total) {
    profilesCache = (items || []).slice();
    el("profilesTableBody").innerHTML =
      (profilesCache || [])
        .map(function (profile) {
          return (
            "<tr><td>" +
            userProfileLink(profile.user_id, profile.full_name) +
            "</td><td>" +
            AdminCore.esc(profile.major || "-") +
            "</td><td>" +
            AdminCore.esc(profile.level || "-") +
            " / " +
            AdminCore.esc(profile.term || "-") +
            "</td><td>" +
            Number(profile.weekly_hours || 0) +
            "</td><td>" +
            AdminCore.esc(profile.updated_at || "") +
            "</td><td><button class='btn ghost user-detail-btn' data-id='" +
            profile.user_id +
            "'>User Detail</button></td></tr>"
          );
        })
        .join("") || "<tr><td colspan='6'>No profiles found.</td></tr>";

    el("profilesMetaBox").textContent =
      "Profiles total: " +
      Number(total || 0).toLocaleString("en-US") +
      " | Showing: " +
      Number((profilesCache || []).length).toLocaleString("en-US");
  }

  async function loadUsers() {
    var data = await AdminCore.api("/api/admin/users?" + buildUsersQuery());
    renderUsers(data.items || [], data.total || 0);
  }

  async function loadProfiles() {
    var data = await AdminCore.api("/api/admin/profiles?" + buildProfilesQuery());
    renderProfiles(data.items || [], data.total || 0);
  }

  async function loadUserDetail(userId) {
    window.location.assign("/admin/users/" + userId);
  }

  function exportUsers() {
    AdminCore.downloadCsv(
      "users-export.csv",
      [
        { key: "id", label: "id" },
        { key: "full_name", label: "full_name" },
        { key: "phone_or_email", label: "phone_or_email" },
        { key: "telegram_id", label: "telegram_id" },
        { key: "has_profile", label: "has_profile" },
        { key: "major", label: "major" },
        { key: "term", label: "term" },
        { key: "created_at", label: "created_at" }
      ],
      usersCache
    );
  }

  function exportProfiles() {
    AdminCore.downloadCsv(
      "profiles-export.csv",
      [
        { key: "user_id", label: "user_id" },
        { key: "full_name", label: "full_name" },
        { key: "major", label: "major" },
        { key: "level", label: "level" },
        { key: "term", label: "term" },
        { key: "weekly_hours", label: "weekly_hours" },
        { key: "updated_at", label: "updated_at" }
      ],
      profilesCache
    );
  }

  async function loadAll() {
    await Promise.all([loadUsers(), loadProfiles()]);
  }

  function bindActions() {
    var usersLoadBtn = el("usersLoadBtn");
    var profilesLoadBtn = el("profilesLoadBtn");
    var usersExportBtn = el("usersExportBtn");
    var profilesExportBtn = el("profilesExportBtn");
    var usersSortInput = el("usersSortInput");

    if (usersLoadBtn) {
      usersLoadBtn.addEventListener("click", function () {
        loadUsers()
          .then(function () {
            AdminCore.setStatus("Users loaded.", "ok");
          })
          .catch(function (error) {
            AdminCore.setStatus(error.message || "Failed to load users.", "bad");
          });
      });
    }

    if (profilesLoadBtn) {
      profilesLoadBtn.addEventListener("click", function () {
        loadProfiles()
          .then(function () {
            AdminCore.setStatus("Profiles loaded.", "ok");
          })
          .catch(function (error) {
            AdminCore.setStatus(error.message || "Failed to load profiles.", "bad");
          });
      });
    }

    if (usersExportBtn) {
      usersExportBtn.addEventListener("click", function () {
        exportUsers();
        AdminCore.toast("Users CSV exported.", "ok");
      });
    }

    if (profilesExportBtn) {
      profilesExportBtn.addEventListener("click", function () {
        exportProfiles();
        AdminCore.toast("Profiles CSV exported.", "ok");
      });
    }

    if (usersSortInput) {
      usersSortInput.addEventListener("change", function () {
        renderUsers(usersCache, usersTotalCache);
      });
    }

    function maybeLoadDetail(event) {
      var detailBtn = event.target.closest(".user-detail-btn");
      var copyBtn = event.target.closest(".user-copy-btn");
      if (!detailBtn && !copyBtn) return;

      if (copyBtn) {
        var copiedId = String(copyBtn.dataset.id || "").trim();
        if (!copiedId) return;
        AdminCore.copyText(copiedId).then(function () {
          AdminCore.toast("User ID copied: " + copiedId, "ok");
        });
        return;
      }

      var userId = Number(detailBtn.dataset.id);
      if (!userId) return;
      loadUserDetail(userId)
        .then(function () {
          AdminCore.setStatus("Opening user profile page...", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to load user detail.", "bad");
        });
    }

    el("usersTableBody").addEventListener("click", maybeLoadDetail);
    el("profilesTableBody").addEventListener("click", maybeLoadDetail);

    var debouncedLoad = AdminCore.debounce(function () {
      loadUsers().catch(function () {});
    }, 420);

    var searchInput = el("usersSearchInput");
    var hasProfileInput = el("usersHasProfileInput");
    if (searchInput) searchInput.addEventListener("input", debouncedLoad);
    if (hasProfileInput) hasProfileInput.addEventListener("change", debouncedLoad);
  }

  document.addEventListener("DOMContentLoaded", bindActions);

  window.addEventListener("admin:auth-ready", function () {
    loadAll().catch(function (error) {
      AdminCore.setStatus(error.message || "Failed to load users/profiles.", "bad");
    });
  });
})();
