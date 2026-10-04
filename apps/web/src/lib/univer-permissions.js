const UNIT_ROLE = {
  READER: 0,
  EDITOR: 1,
  OWNER: 2,
};

const OBJECT_SCOPE = {
  SOME_COLLABORATOR: 0,
  ALL_COLLABORATOR: 1,
  ONE_SELF: 2,
};

const UNIT_ACTION = {
  VIEW: 0,
  EDIT: 1,
  MANAGE_COLLABORATOR: 2,
  PRINT: 3,
  DUPLICATE: 4,
  COMMENT: 5,
  COPY: 6,
  SHARE: 7,
  EXPORT: 8,
  SELECT_PROTECTED_CELLS: 31,
  SELECT_UNPROTECTED_CELLS: 32,
  DELETE: 42,
  CREATE_PERMISSION_OBJECT: 45,
};

const VIEW_ACTIONS = new Set([
  UNIT_ACTION.VIEW,
  UNIT_ACTION.PRINT,
  UNIT_ACTION.DUPLICATE,
  UNIT_ACTION.COMMENT,
  UNIT_ACTION.COPY,
  UNIT_ACTION.EXPORT,
  UNIT_ACTION.SELECT_PROTECTED_CELLS,
  UNIT_ACTION.SELECT_UNPROTECTED_CELLS,
]);

const CREATOR_MARKER = "#gtex-protection-creator=";
const GTEX_CREATOR_RECORD_PREFIX = "__gtex_creator__:";
const GTEX_CREATOR_USER_ID = "__gtexCreatorUserId";
const GTEX_CREATOR_NAME = "__gtexCreatorName";
let protectionCreatorObserver;

function driveRole(access) {
  if (access === "OWNER") return UNIT_ROLE.OWNER;
  if (access === "MANAGER" || access === "EDITOR") return UNIT_ROLE.EDITOR;
  return UNIT_ROLE.READER;
}

function cloneCollaborator(collaborator) {
  return {
    ...collaborator,
    subject: collaborator?.subject ? { ...collaborator.subject } : undefined,
  };
}

function collaboratorFromUser(user) {
  return {
    id: user.id,
    role: driveRole(user.access),
    subject: {
      userID: user.id,
      name: user.displayName || user.email || "User",
      avatar: user.avatar || "",
    },
  };
}

function payloadFor(entry) {
  return entry?.selectRangeObject || entry?.worksheetObject || null;
}

function collaboratorUserId(collaborator) {
  return collaborator?.subject?.userID || collaborator?.id || null;
}

function encodeCreatorRecord(creator) {
  if (!creator?.userID) return "";
  return `${GTEX_CREATOR_RECORD_PREFIX}${encodeURIComponent(creator.userID)}:${encodeURIComponent(creator.name || "")}`;
}

function decodeCreatorRecord(value) {
  const text = String(value || "");
  if (!text.startsWith(GTEX_CREATOR_RECORD_PREFIX)) return null;

  const record = text.slice(GTEX_CREATOR_RECORD_PREFIX.length);
  const separator = record.indexOf(":");
  const encodedUserId = separator >= 0 ? record.slice(0, separator) : record;
  const encodedName = separator >= 0 ? record.slice(separator + 1) : "";

  try {
    return {
      userID: decodeURIComponent(encodedUserId),
      name: decodeURIComponent(encodedName),
    };
  } catch {
    return null;
  }
}

function persistedCreatorUserId(entry) {
  const nativeRecord = decodeCreatorRecord(entry?.name);
  const payload = payloadFor(entry);
  return (
    nativeRecord?.userID ||
    payload?.[GTEX_CREATOR_USER_ID] ||
    entry?.creatorUserId ||
    entry?.creator?.userID ||
    null
  );
}

function creatorUserIdFor(entry, fallbackOwnerId) {
  return persistedCreatorUserId(entry) || fallbackOwnerId || null;
}

function persistedCreatorName(entry) {
  const nativeRecord = decodeCreatorRecord(entry?.name);
  const payload = payloadFor(entry);
  return (
    nativeRecord?.name ||
    payload?.[GTEX_CREATOR_NAME] ||
    entry?.creator?.name ||
    ""
  );
}

function subjectForUser(directory, userId) {
  if (!userId) return undefined;
  const collaborator = directory.find(
    (item) => collaboratorUserId(item) === userId,
  );
  return collaborator?.subject ? { ...collaborator.subject } : undefined;
}

function rememberCreatorMetadata(entry, creator) {
  if (!entry || !creator?.userID) return;
  const payload = payloadFor(entry);
  entry.creatorUserId = creator.userID;
  entry.creator = { ...creator };
  entry.name = encodeCreatorRecord(creator);
  if (payload) {
    payload[GTEX_CREATOR_USER_ID] = creator.userID;
    payload[GTEX_CREATOR_NAME] = creator.name || "";
  }
}

function creatorAvatarWithMarker(creator) {
  if (!creator) return creator;
  const name = String(creator.name || "").trim();
  if (!name) return { ...creator };

  const fallbackAvatar =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='12' fill='%23cbd5e1'/%3E%3Ccircle cx='12' cy='9' r='4' fill='%2364758b'/%3E%3Cpath d='M5 22c.8-5 3.1-7 7-7s6.2 2 7 7' fill='%2364758b'/%3E%3C/svg%3E";
  const baseAvatar = String(creator.avatar || fallbackAvatar).split("#")[0];

  return {
    ...creator,
    avatar: `${baseAvatar}${CREATOR_MARKER}${encodeURIComponent(name)}`,
  };
}

function decodeCreatorName(src) {
  const markerIndex = String(src || "").indexOf(CREATOR_MARKER);
  if (markerIndex < 0) return "";
  const encoded = String(src).slice(markerIndex + CREATOR_MARKER.length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function applyProtectionCreatorLabels(root = document) {
  if (typeof document === "undefined") return;
  const images = root.querySelectorAll?.(`img[src*="${CREATOR_MARKER}"]`);
  if (!images) return;

  for (const image of images) {
    const creatorName = decodeCreatorName(image.getAttribute("src"));
    if (!creatorName) continue;

    const row = image.closest(".univer-flex.univer-items-center");
    if (!row) continue;

    const directSpans = [...row.children].filter(
      (child) => child.tagName === "SPAN",
    );
    const createdLabel = directSpans[1];
    if (!createdLabel) continue;

    let nameLabel = createdLabel.querySelector(
      "[data-gtex-protection-creator-name]",
    );
    if (!nameLabel) {
      nameLabel = document.createElement("span");
      nameLabel.setAttribute("data-gtex-protection-creator-name", "true");
      nameLabel.style.marginLeft = "4px";
      nameLabel.style.fontWeight = "600";
      nameLabel.style.color = "inherit";
      nameLabel.style.whiteSpace = "nowrap";
      nameLabel.style.overflow = "hidden";
      nameLabel.style.textOverflow = "ellipsis";
      createdLabel.appendChild(nameLabel);
    }
    nameLabel.textContent = `· ${creatorName}`;
    nameLabel.title = creatorName;
  }
}

function installProtectionCreatorLabels() {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return;
  }

  protectionCreatorObserver?.disconnect();
  let scheduled = false;
  const refresh = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyProtectionCreatorLabels(document);
    });
  };

  protectionCreatorObserver = new MutationObserver(refresh);
  protectionCreatorObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
  refresh();
}

function clonePermissionEntry(entry) {
  if (!entry) return null;
  const copy = {
    ...entry,
    creator: entry.creator ? { ...entry.creator } : undefined,
    strategies: (entry.strategies || []).map((strategy) => ({ ...strategy })),
  };

  if (entry.selectRangeObject) {
    copy.selectRangeObject = {
      ...entry.selectRangeObject,
      collaborators: (entry.selectRangeObject.collaborators || []).map(
        cloneCollaborator,
      ),
      scope: entry.selectRangeObject.scope
        ? { ...entry.selectRangeObject.scope }
        : undefined,
    };
  }

  if (entry.worksheetObject) {
    copy.worksheetObject = {
      ...entry.worksheetObject,
      collaborators: (entry.worksheetObject.collaborators || []).map(
        cloneCollaborator,
      ),
      strategies: (entry.worksheetObject.strategies || []).map((strategy) => ({
        ...strategy,
      })),
      scope: entry.worksheetObject.scope
        ? { ...entry.worksheetObject.scope }
        : undefined,
    };
  }

  return copy;
}

function replaceCollaborators(entry, collaborators) {
  const payload = payloadFor(entry);
  if (!payload) return;
  payload.collaborators = (collaborators || []).map(cloneCollaborator);
}

function effectiveRole({ entry, userId, directoryRole, fallbackOwnerId }) {
  const payload = payloadFor(entry);
  const creatorUserId = creatorUserIdFor(entry, fallbackOwnerId);
  if (creatorUserId && userId === creatorUserId) return UNIT_ROLE.OWNER;

  const scope = payload?.scope;
  if (scope?.edit === OBJECT_SCOPE.ALL_COLLABORATOR) return directoryRole;

  const collaborator = payload?.collaborators?.find(
    (item) => collaboratorUserId(item) === userId,
  );
  return collaborator?.role ?? UNIT_ROLE.READER;
}

function canView({ entry, userId, directoryRole, fallbackOwnerId }) {
  if (!entry) return directoryRole >= UNIT_ROLE.READER;
  const payload = payloadFor(entry);
  const creatorUserId = creatorUserIdFor(entry, fallbackOwnerId);
  if (creatorUserId && creatorUserId === userId) return true;

  const readScope = payload?.scope?.read;
  if (readScope === undefined || readScope === OBJECT_SCOPE.ALL_COLLABORATOR) {
    return true;
  }

  if (readScope === OBJECT_SCOPE.ONE_SELF) return false;
  return Boolean(
    payload?.collaborators?.some(
      (item) => collaboratorUserId(item) === userId,
    ),
  );
}

function canEdit({ entry, userId, directoryRole, fallbackOwnerId }) {
  if (directoryRole < UNIT_ROLE.EDITOR) return false;
  if (!entry) return true;

  const payload = payloadFor(entry);
  const creatorUserId = creatorUserIdFor(entry, fallbackOwnerId);
  if (creatorUserId && creatorUserId === userId) return true;

  const editScope = payload?.scope?.edit;
  if (editScope === undefined || editScope === OBJECT_SCOPE.ALL_COLLABORATOR) {
    return true;
  }
  if (editScope === OBJECT_SCOPE.ONE_SELF) return false;

  return Boolean(
    payload?.collaborators?.some(
      (item) =>
        collaboratorUserId(item) === userId && item.role >= UNIT_ROLE.EDITOR,
    ),
  );
}

function configureAuthzService(authz, directory, options) {
  const { currentUserId, currentAccess, fallbackOwnerId } = options;
  const permissionMap = authz._permissionMap;
  if (!(permissionMap instanceof Map)) {
    throw new Error("Univer authorization storage is unavailable");
  }

  const originalCreate = authz.create.bind(authz);
  const originalUpdate = authz.update.bind(authz);
  const protectionState = new Map();

  function normalizeCreator(entry) {
    if (!entry) return entry;

    const persistedUserId = persistedCreatorUserId(entry);
    if (persistedUserId) {
      const directorySubject = subjectForUser(directory, persistedUserId);
      const storedName = persistedCreatorName(entry);
      const creator = {
        ...(entry.creator || {}),
        ...(directorySubject || {}),
        userID: persistedUserId,
      };
      if (!creator.name && storedName) creator.name = storedName;
      rememberCreatorMetadata(entry, creator);
    }

    return entry;
  }

  function rememberEntry(objectID, entry) {
    if (!objectID || !entry) return;
    normalizeCreator(entry);
    protectionState.set(objectID, clonePermissionEntry(entry));
  }

  function resolveEntry(objectID) {
    if (!objectID) return null;
    const liveEntry = permissionMap.get(objectID);
    if (liveEntry) {
      normalizeCreator(liveEntry);
      rememberEntry(objectID, liveEntry);
      return liveEntry;
    }
    return protectionState.get(objectID) || null;
  }

  for (const [objectID, entry] of permissionMap.entries()) {
    rememberEntry(objectID, entry);
  }

  authz.__gtexDirectory = directory.map(cloneCollaborator);
  authz.__gtexCurrentUserId = currentUserId;
  authz.__gtexCurrentAccess = currentAccess;
  authz.__gtexFallbackOwnerId = fallbackOwnerId;
  authz.__gtexProtectionState = protectionState;

  authz.listCollaborators = async ({ objectID, unitID } = {}) => {
    if (!objectID || objectID === unitID) {
      return authz.__gtexDirectory.map(cloneCollaborator);
    }

    const entry = resolveEntry(objectID);
    return (payloadFor(entry)?.collaborators || []).map(cloneCollaborator);
  };

  authz.create = async (config) => {
    const objectID = await originalCreate(config);
    const source = config.selectRangeObject || config.worksheetObject || {};
    const entry = permissionMap.get(objectID) || {
      objectType: config.objectType,
      unitID: source.unitID || "",
      name: source.name || "",
      strategies: [],
    };

    const creator =
      subjectForUser(directory, authz.__gtexCurrentUserId) || {
        userID: authz.__gtexCurrentUserId,
        name: "",
        avatar: "",
      };

    if (config.selectRangeObject) {
      entry.selectRangeObject = {
        ...config.selectRangeObject,
        [GTEX_CREATOR_USER_ID]: creator.userID,
        [GTEX_CREATOR_NAME]: creator.name || "",
        collaborators: (config.selectRangeObject.collaborators || []).map(
          cloneCollaborator,
        ),
        scope: config.selectRangeObject.scope
          ? { ...config.selectRangeObject.scope }
          : undefined,
      };
    }

    if (config.worksheetObject) {
      entry.worksheetObject = {
        ...config.worksheetObject,
        [GTEX_CREATOR_USER_ID]: creator.userID,
        [GTEX_CREATOR_NAME]: creator.name || "",
        collaborators: (config.worksheetObject.collaborators || []).map(
          cloneCollaborator,
        ),
        strategies: (config.worksheetObject.strategies || []).map(
          (strategy) => ({ ...strategy }),
        ),
        scope: config.worksheetObject.scope
          ? { ...config.worksheetObject.scope }
          : undefined,
      };
      if (config.worksheetObject.strategies?.length) {
        entry.strategies = config.worksheetObject.strategies.map((strategy) => ({
          ...strategy,
        }));
      }
    }

    rememberCreatorMetadata(entry, creator);
    permissionMap.set(objectID, entry);
    rememberEntry(objectID, entry);
    return objectID;
  };

  authz.update = async (config) => {
    await originalUpdate(config);
    const entry = resolveEntry(config.objectID);
    if (!entry) return;

    const payload = payloadFor(entry);
    if (config.name !== undefined && payload) {
      payload.name = config.name;
    }
    if (config.scope && payload) payload.scope = { ...config.scope };
    if (config.collaborators?.collaborators) {
      replaceCollaborators(entry, config.collaborators.collaborators);
    }

    const persistedUserId = persistedCreatorUserId(entry);
    if (persistedUserId) {
      const creator =
        subjectForUser(directory, persistedUserId) || entry.creator || {
          userID: persistedUserId,
          name: persistedCreatorName(entry),
          avatar: "",
        };
      rememberCreatorMetadata(entry, creator);
    }

    permissionMap.set(config.objectID, entry);
    rememberEntry(config.objectID, entry);
  };

  authz.putCollaborators = async ({ objectID, collaborators }) => {
    const entry = resolveEntry(objectID);
    if (!entry) return;
    replaceCollaborators(entry, collaborators);
    permissionMap.set(objectID, entry);
    rememberEntry(objectID, entry);
  };

  authz.createCollaborator = async ({ objectID, collaborators }) => {
    const entry = resolveEntry(objectID);
    if (!entry) return;
    const current = payloadFor(entry)?.collaborators || [];
    const byUser = new Map(
      current.map((item) => [collaboratorUserId(item), cloneCollaborator(item)]),
    );
    for (const collaborator of collaborators || []) {
      byUser.set(collaboratorUserId(collaborator), cloneCollaborator(collaborator));
    }
    replaceCollaborators(entry, [...byUser.values()]);
    permissionMap.set(objectID, entry);
    rememberEntry(objectID, entry);
  };

  authz.updateCollaborator = async ({ objectID, collaborator }) => {
    const entry = resolveEntry(objectID);
    if (!entry || !collaborator) return;
    const userId = collaboratorUserId(collaborator);
    const current = payloadFor(entry)?.collaborators || [];
    replaceCollaborators(
      entry,
      current.map((item) =>
        collaboratorUserId(item) === userId ? collaborator : item,
      ),
    );
    permissionMap.set(objectID, entry);
    rememberEntry(objectID, entry);
  };

  authz.deleteCollaborator = async ({ objectID, collaboratorID }) => {
    const entry = resolveEntry(objectID);
    if (!entry) return;
    replaceCollaborators(
      entry,
      (payloadFor(entry)?.collaborators || []).filter(
        (item) =>
          item.id !== collaboratorID &&
          collaboratorUserId(item) !== collaboratorID,
      ),
    );
    permissionMap.set(objectID, entry);
    rememberEntry(objectID, entry);
  };

  authz.allowed = async ({ objectID, unitID, actions }) => {
    const entry = resolveEntry(objectID);
    const userId = authz.__gtexCurrentUserId;
    const directoryRole = driveRole(authz.__gtexCurrentAccess);
    const isWorkbookRequest = !objectID || objectID === unitID;

    if (!entry && !isWorkbookRequest) {
      return (actions || []).map((action) => ({
        action,
        allowed: VIEW_ACTIONS.has(action) && directoryRole >= UNIT_ROLE.READER,
      }));
    }

    const args = {
      entry,
      userId,
      directoryRole,
      fallbackOwnerId: authz.__gtexFallbackOwnerId,
    };
    const role = effectiveRole(args);
    const editable = canEdit(args);
    const viewable = canView(args);
    const payload = payloadFor(entry);
    const scopedEdit =
      payload?.scope?.edit !== undefined &&
      payload.scope.edit !== OBJECT_SCOPE.ALL_COLLABORATOR;
    const canManage =
      userId === creatorUserIdFor(entry, authz.__gtexFallbackOwnerId) ||
      authz.__gtexCurrentAccess === "OWNER" ||
      authz.__gtexCurrentAccess === "MANAGER";

    return (actions || []).map((action) => {
      const strategy = entry?.strategies?.find((item) => item.action === action);
      let allowed;

      if (
        action === UNIT_ACTION.MANAGE_COLLABORATOR ||
        action === UNIT_ACTION.SHARE ||
        action === UNIT_ACTION.DELETE
      ) {
        allowed = canManage;
      } else if (action === UNIT_ACTION.CREATE_PERMISSION_OBJECT) {
        allowed = editable;
      } else if (scopedEdit && !VIEW_ACTIONS.has(action)) {
        allowed = editable;
      } else if (strategy) {
        allowed = role >= strategy.role;
      } else if (VIEW_ACTIONS.has(action)) {
        allowed = viewable;
      } else {
        allowed = editable;
      }

      return { action, allowed };
    });
  };

  authz.batchAllowed = async (configs) => {
    const objectActions = await Promise.all(
      configs.map(async (config) => ({
        unitID: config.unitID,
        objectID: config.objectID,
        actions: await authz.allowed(config),
      })),
    );
    return objectActions;
  };

  authz.list = async ({ unitID, objectIDs, actions }) =>
    Promise.all(
      objectIDs.map(async (objectID) => {
        const entry = resolveEntry(objectID);
        const strategies = (entry?.strategies || []).map((strategy) => ({
          ...strategy,
        }));
        const creatorUserId = creatorUserIdFor(
          entry,
          authz.__gtexFallbackOwnerId,
        );
        const creator =
          subjectForUser(authz.__gtexDirectory, creatorUserId) ||
          entry?.creator || {
            userID: creatorUserId || "",
            name: persistedCreatorName(entry),
            avatar: "",
          };

        return {
          objectID,
          unitID,
          objectType: entry?.objectType || 3,
          name: payloadFor(entry)?.name || "",
          shareOn: false,
          shareRole: UNIT_ROLE.OWNER,
          shareScope: -1,
          scope: payloadFor(entry)?.scope || {
            read: OBJECT_SCOPE.ALL_COLLABORATOR,
            edit: OBJECT_SCOPE.ALL_COLLABORATOR,
          },
          creator: creatorAvatarWithMarker(creator),
          strategies,
          actions: await authz.allowed({ objectID, unitID, actions }),
        };
      }),
    );

  authz.listRoles = async () => ({
    roles: [
      { role: UNIT_ROLE.READER, name: "Reader" },
      { role: UNIT_ROLE.EDITOR, name: "Editor" },
      { role: UNIT_ROLE.OWNER, name: "Owner" },
    ],
    actions: [],
  });

  authz.getCfgEnableObjInherit = () => false;
  authz.setCfgEnableObjInherit = () => undefined;
}

export function connectUniverPermissions({
  runtime,
  modules,
  currentUser,
  users,
  ownerUserId,
}) {
  if (!runtime?.univer || !modules?.IAuthzIoService || !modules?.UserManagerService) {
    throw new Error("Univer permission services are unavailable");
  }
  if (!currentUser?.id) {
    throw new Error("Current application user is unavailable");
  }

  const directory = (users || []).map(collaboratorFromUser);
  const currentDirectoryUser = directory.find(
    (item) => collaboratorUserId(item) === currentUser.id,
  );
  const currentAccess =
    users?.find((item) => item.id === currentUser.id)?.access || "VIEWER";
  const currentSubject = currentDirectoryUser?.subject || {
    userID: currentUser.id,
    name: currentUser.displayName || currentUser.email || "User",
    avatar: "",
  };

  const injector = runtime.univer.__getInjector();
  const userManager = injector.get(modules.UserManagerService);
  for (const collaborator of directory) {
    if (collaborator.subject) userManager.addUser(collaborator.subject);
  }

  const authz = injector.get(modules.IAuthzIoService);
  configureAuthzService(authz, directory, {
    currentUserId: currentUser.id,
    currentAccess,
    fallbackOwnerId: ownerUserId || null,
  });
  installProtectionCreatorLabels();
  userManager.setCurrentUser(currentSubject);
}
