// Pure helpers shared by the Conversation Members picker and its regression tests.
export function filterAvailableColleagues(users = [], members = [], query = "") {
  const currentIds = new Set(members.map((member) => member.userId));
  const needle = query.trim().toLocaleLowerCase();
  return users.filter((person) => {
    if (person.status !== "ACTIVE" || currentIds.has(person.id)) return false;
    return !needle || [
      person.displayName,
      person.email,
      person.jobTitle,
      person.department?.name,
    ].some((value) => value?.toLocaleLowerCase().includes(needle));
  });
}

export function toggleColleagueSelection(ids, id) {
  return ids.includes(id) ? ids.filter((selected) => selected !== id) : [...ids, id];
}

// The existing endpoint adds one user at a time. Keep successful additions even
// when another request fails so the UI can offer an accurate retry.
export async function addSelectedColleagues(ids, addOne) {
  const addedIds = [];
  const failed = [];
  for (const id of new Set(ids)) {
    try {
      await addOne(id);
      addedIds.push(id);
    } catch (error) {
      failed.push({ id, error });
    }
  }
  return { addedIds, failed };
}
