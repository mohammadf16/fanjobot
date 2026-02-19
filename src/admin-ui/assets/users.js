(function () {
  function el(id) {
    return document.getElementById(id);
  }

  function buildUsersQuery() {
    var query = new URLSearchParams({ limit: "120" });
    var q = String((el("usersSearchInput") || {}).value || "").trim();
    var hasProfile = String((el("usersHasProfileInput") || {}).value || "").trim();
    if (q) query.set("q", q);
    if (hasProfile) query.set("hasProfile", hasProfile);
    return query.toString();
  }

  function buildProfilesQuery() {
    var query = new URLSearchParams({ limit: "80" });
    var q = String((el("usersSearchInput") || {}).value || "").trim();
    var major = String((el("profilesMajorInput") || {}).value || "").trim();
    var level = String((el("profilesLevelInput") || {}).value || "").trim();
    if (q) query.set("q", q);
    if (major) query.set("major", major);
    if (level) query.set("level", level);
    return query.toString();
  }

  function renderUsers(items, total) {
    el("usersTableBody").innerHTML =
      (items || [])
        .map(function (user) {
          return (
            "<tr><td>" +
            user.id +
            "</td><td>" +
            AdminCore.esc(user.full_name || "-") +
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
            "</td><td><button class='btn ghost user-detail-btn' data-id='" +
            user.id +
            "'>Detail</button></td></tr>"
          );
        })
        .join("") || "<tr><td colspan='8'>No users found.</td></tr>";

    el("usersMetaBox").textContent =
      "Total: " + Number(total || 0).toLocaleString("en-US") + " | Showing: " + Number((items || []).length);
  }

  function renderProfiles(items, total) {
    el("profilesTableBody").innerHTML =
      (items || [])
        .map(function (profile) {
          return (
            "<tr><td>" +
            AdminCore.esc(profile.full_name || "-") +
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
      Number((items || []).length);
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
    var data = await AdminCore.api("/api/admin/users/" + userId);
    el("usersDetailBox").textContent = AdminCore.toPretty(data);
  }

  async function loadAll() {
    await Promise.all([loadUsers(), loadProfiles()]);
  }

  function bindActions() {
    var usersLoadBtn = el("usersLoadBtn");
    var profilesLoadBtn = el("profilesLoadBtn");

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

    function maybeLoadDetail(event) {
      var button = event.target.closest(".user-detail-btn");
      if (!button) return;
      var userId = Number(button.dataset.id);
      if (!userId) return;

      loadUserDetail(userId)
        .then(function () {
          AdminCore.setStatus("User detail loaded.", "ok");
        })
        .catch(function (error) {
          AdminCore.setStatus(error.message || "Failed to load user detail.", "bad");
        });
    }

    el("usersTableBody").addEventListener("click", maybeLoadDetail);
    el("profilesTableBody").addEventListener("click", maybeLoadDetail);
  }

  document.addEventListener("DOMContentLoaded", bindActions);

  window.addEventListener("admin:auth-ready", function () {
    loadAll().catch(function (error) {
      AdminCore.setStatus(error.message || "Failed to load users/profiles.", "bad");
    });
  });
})();
