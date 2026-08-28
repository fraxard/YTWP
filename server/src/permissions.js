const PERMISSIONS = {
  host:        ["play", "pause", "seek", "change_video", "assign_role", "remove_participant"],
  moderator:   ["play", "pause", "seek", "change_video"],
  participant: [],
};

function can(role, action) {
  return PERMISSIONS[role]?.includes(action) ?? false;
}

module.exports = { can };