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

function clonePermissionEntry(entry) {
  if (!entry) return null;
  const copy = {
    ...entry,
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
  const creatorUserId = entry?.creatorUserId || fallbackOwnerId || null;
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
  const creatorUserId = entry.creatorUserId || fallbackOwnerId || null;
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
  const creatorUserId = entry.creatorUserId || fallbackOwnerId || null;
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

  function rememberEntry(objectID, entry) {
    if (!objectID || !entry) return;
    protectionState.set(objectID, clonePermissionEntry(entry));
  }

  function resolveEntry(objectID) {
    if (!objectID) return null;
    const liveEntry = permissionMap.get(objectID);
    if (liveEntry) {
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
    // Univer calls with the workbook ID when opening "Add person". Only that
    // workbook-level request is allowed to see the full application directory.
    if (!objectID || objectID === unitID) {
      return authz.__gtexDirectory.map(cloneCollaborator);
    }

    // A permission object must only return collaborators assigned to that
    // specific protected range/sheet. Never fall back to the full directory,
    // because Univer interprets the returned users as selected editors.
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

    entry.creatorUserId = authz.__gtexCurrentUserId;

    if (config.selectRangeObject) {
      entry.selectRangeObject = {
        ...config.selectRangeObject,
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

    permissionMap.set(objectID, entry);
    rememberEntry(objectID, entry);
    return objectID;
  };

  authz.update = async (config) => {
    await originalUpdate(config);
    const entry = resolveEntry(config.objectID);
    if (!entry) return;

    const payload = payloadFor(entry);
    if (config.name !== undefined) {
      entry.name = config.name;
      if (payload) payload.name = config.name;
    }
    if (config.scope && payload) payload.scope = { ...config.scope };
    if (config.collaborators?.collaborators) {
      replaceCollaborators(entry, config.collaborators.collaborators);
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

    // If a protection rule exists in Univer but its authorization payload is
    // temporarily unavailable, fail closed for edits instead of silently
    // granting every Drive editor access to the protected cells.
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
      userId === (entry?.creatorUserId || authz.__gtexFallbackOwnerId) ||
      authz.__gtexCurrentAccess === "OWNER" ||
      authz.__gtexCurrentAccess === "MANAGER";

    return (actions || []).map((action) => {
      const strategy = entry?.strategies?.find((item) => item.action === action);
      let allowed;
      if (action === UNIT_ACTION.MANAGE_COLLABORATOR || action === UNIT_ACTION.SHARE) {
        allowed = canManage;
      } else if (action === UNIT_ACTION.CREATE_PERMISSION_OBJECT) {
        allowed = editable;
      } else if (scopedEdit && !VIEW_ACTIONS.has(action)) {
        // For explicit protected-range collaborators, membership in the rule is
        // the edit authority. The workbook's general EDITOR role is not enough.
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
        return {
          objectID,
          unitID,
          objectType: entry?.objectType || 3,
          name: entry?.name || "",
          shareOn: false,
          shareRole: UNIT_ROLE.OWNER,
          shareScope: -1,
          scope: payloadFor(entry)?.scope || {
            read: OBJECT_SCOPE.ALL_COLLABORATOR,
            edit: OBJECT_SCOPE.ALL_COLLABORATOR,
          },
          creator: undefined,
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
  userManager.setCurrentUser(currentSubject);

  const authz = injector.get(modules.IAuthzIoService);
  configureAuthzService(authz, directory, {
    currentUserId: currentUser.id,
    currentAccess,
    fallbackOwnerId: ownerUserId || null,
  });
}
