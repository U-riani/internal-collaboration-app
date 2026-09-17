import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to seed the database.');
}

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const permissions = [
  ['drive.use', 'Use private and shared Drive folders'],
  ['users.read', 'View users and organization structure'],
  ['users.manage', 'Create and manage users and departments'],
  ['roles.manage', 'Manage roles and permissions'],
  ['conversations.create', 'Create direct and group conversations'],
  ['messages.send', 'Send chat messages'],
  ['tasks.create', 'Create tasks'],
  ['tasks.assign', 'Assign tasks to other employees'],
  ['tasks.manage_department', 'Manage department tasks'],
  ['approvals.submit', 'Create and submit approval requests'],
  ['approvals.configure', 'Configure approval workflows'],
  ['approvals.audit', 'Read approval audit information'],
  ['system.audit.read', 'Read system audit logs'],
];

const roleDefinitions = {
  SYSTEM_ADMIN: permissions.map(([code]) => code),
  MANAGER: ['drive.use', 'users.read', 'conversations.create', 'messages.send', 'tasks.create', 'tasks.assign', 'tasks.manage_department', 'approvals.submit'],
  EMPLOYEE: ['drive.use', 'users.read', 'conversations.create', 'messages.send', 'tasks.create', 'approvals.submit'],
  AUDITOR: ['users.read', 'approvals.audit', 'system.audit.read'],
};

async function upsertUser({ email, password, firstName, lastName, roleCode, departmentId, jobTitle }) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`,
      departmentId,
      jobTitle,
      roles: { create: [{ roleId: role.id }] },
    },
  });
}

async function main() {
  for (const [code, description] of permissions) {
    await prisma.permission.upsert({ where: { code }, update: { description }, create: { code, description } });
  }

  for (const [code, permissionCodes] of Object.entries(roleDefinitions)) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: code.replaceAll('_', ' '), isSystem: true },
      create: { code, name: code.replaceAll('_', ' '), isSystem: true },
    });
    const found = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({ data: found.map((permission) => ({ roleId: role.id, permissionId: permission.id })) });
  }

  if (await prisma.user.count()) { console.log('Permissions synchronized; existing users and content preserved.'); return; }

  const department = await prisma.department.upsert({
    where: { code: 'IT' },
    update: { name: 'Information Technology' },
    create: { code: 'IT', name: 'Information Technology' },
  });

  const initialPassword = process.env.SEED_ADMIN_PASSWORD;
  if (process.env.SEED_DEMO !== 'true' && (!initialPassword || initialPassword.length < 12 || initialPassword.startsWith('replace_with_'))) throw new Error('Set a unique SEED_ADMIN_PASSWORD of at least 12 characters, or run node scripts/setup.mjs.');
  const admin = await upsertUser({
    email: process.env.SEED_ADMIN_EMAIL || 'admin@example.com',
    password: process.env.SEED_ADMIN_PASSWORD || 'Admin123!',
    firstName: 'System', lastName: 'Administrator', roleCode: 'SYSTEM_ADMIN', departmentId: department.id, jobTitle: 'System Administrator',
  });
  if (process.env.SEED_DEMO !== 'true') { console.log('Initial administrator created.'); return; }
  const manager = await upsertUser({
    email: process.env.SEED_MANAGER_EMAIL || 'manager@example.com',
    password: process.env.SEED_MANAGER_PASSWORD || 'Manager123!',
    firstName: 'Demo', lastName: 'Manager', roleCode: 'MANAGER', departmentId: department.id, jobTitle: 'Department Manager',
  });
  const employee = await upsertUser({
    email: process.env.SEED_EMPLOYEE_EMAIL || 'employee@example.com',
    password: process.env.SEED_EMPLOYEE_PASSWORD || 'Employee123!',
    firstName: 'Demo', lastName: 'Employee', roleCode: 'EMPLOYEE', departmentId: department.id, jobTitle: 'ERP Specialist',
  });

  await prisma.department.update({ where: { id: department.id }, data: { managerId: manager.id } });
  await prisma.user.update({ where: { id: employee.id }, data: { managerId: manager.id } });

  const channel = await prisma.conversation.upsert({
    where: { directKey: 'seed:it-department' },
    update: { name: 'IT Department', departmentId: department.id },
    create: {
      type: 'DEPARTMENT', name: 'IT Department', description: 'Default department channel',
      directKey: 'seed:it-department', departmentId: department.id, ownerId: manager.id,
    },
  });
  for (const [user, role] of [[admin, 'MEMBER'], [manager, 'OWNER'], [employee, 'MEMBER']]) {
    await prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId: channel.id, userId: user.id } },
      update: { leftAt: null, role },
      create: { conversationId: channel.id, userId: user.id, role },
    });
  }

  if ((await prisma.message.count({ where: { conversationId: channel.id } })) === 0) {
    await prisma.message.create({
      data: { conversationId: channel.id, senderId: manager.id, content: 'Welcome to the internal collaboration application.' },
    });
  }

  const equipmentType = await prisma.approvalType.upsert({
    where: { code: 'EQUIPMENT_REQUEST' },
    update: {
      name: 'Equipment Request', status: 'ACTIVE',
      formSchema: {
        equipmentType: { type: 'text', label: 'Equipment type', required: true },
        businessReason: { type: 'textarea', label: 'Business reason', required: true },
        estimatedCost: { type: 'number', label: 'Estimated cost', required: false },
      },
    },
    create: {
      code: 'EQUIPMENT_REQUEST', name: 'Equipment Request', status: 'ACTIVE', createdById: admin.id,
      description: 'Employee equipment request requiring manager and IT approval.',
      formSchema: {
        equipmentType: { type: 'text', label: 'Equipment type', required: true },
        businessReason: { type: 'textarea', label: 'Business reason', required: true },
        estimatedCost: { type: 'number', label: 'Estimated cost', required: false },
      },
    },
  });
  await prisma.approvalTypeStep.deleteMany({ where: { approvalTypeId: equipmentType.id } });
  await prisma.approvalTypeStep.createMany({
    data: [
      { approvalTypeId: equipmentType.id, stepNumber: 1, name: 'Department Manager', approverRule: 'REQUESTER_MANAGER' },
      { approvalTypeId: equipmentType.id, stepNumber: 2, name: 'System Administrator', approverRule: 'USER', approverValue: admin.id },
    ],
  });

  if ((await prisma.task.count({ where: { title: 'Review collaboration MVP' } })) === 0) {
    await prisma.task.create({
      data: {
        title: 'Review collaboration MVP',
        description: 'Review tasks, approvals, chat, and notification workflows.',
        creatorId: manager.id,
        assigneeId: employee.id,
        departmentId: department.id,
        priority: 'HIGH',
        dueDate: new Date(Date.now() + 3 * 86400000),
        history: { create: { actorId: manager.id, actionType: 'TASK_CREATED', newValue: { seeded: true } } },
      },
    });
  }

  console.log('Seed completed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
