// Search is local to the already-loaded conversation members.
// Normalizing whitespace supports multi-part names and Georgian text.
const normalizedName = (value) =>
  String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();

export function filterConversationMembers(members = [], query = "") {
  const term = normalizedName(query);
  if (!term) return members;
  return members.filter((member) =>
    normalizedName(member.user?.displayName).includes(term),
  );
}
