import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AdminService } from '../auth/admin.ts';
import type { AuthService } from '../auth/service.ts';
import { requireUser, type SessionCookies } from './auth-guard.ts';
import { idParams } from './schemas.ts';

const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 60;
const MAX_PASSWORD_INPUT_LENGTH = 256; // the policy refuses long ones with a message; this only bounds the work
const MAX_TOKEN_INPUT_LENGTH = 100;

const email = z.string().trim().toLowerCase().max(MAX_EMAIL_LENGTH).pipe(z.email());
const displayName = z.string().trim().min(1).max(MAX_NAME_LENGTH);
const password = z.string().min(1).max(MAX_PASSWORD_INPUT_LENGTH);
const token = z.string().max(MAX_TOKEN_INPUT_LENGTH);

const setupBody = z.strictObject({ displayName, email, password, setupCode: z.string().max(MAX_TOKEN_INPUT_LENGTH).optional() });
const loginBody = z.strictObject({ email, password });
const joinBody = z.strictObject({ token, displayName, email, password });
const resetBody = z.strictObject({ token, password });
const linkCheckBody = z.strictObject({ token, kind: z.enum(['invitation', 'reset']) });
const changePasswordBody = z.strictObject({ currentPassword: password, newPassword: password });
const createInvitationBody = z.strictObject({
  label: z.string().trim().max(MAX_NAME_LENGTH).transform((value) => (value === '' ? null : value)).nullable().default(null),
});
const setDisabledBody = z.strictObject({ isDisabled: z.boolean() });

export function registerAuthRoutes(app: FastifyInstance, auth: AuthService, cookies: SessionCookies): void {
  app.get('/api/auth/state', (request) => auth.getState(cookies.read(request)));

  app.post('/api/auth/setup', async (request, reply) => {
    const session = await auth.setup(setupBody.parse(request.body));
    cookies.start(reply, session.token);
    return reply.code(201).send({ user: session.user });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const session = await auth.login(loginBody.parse(request.body));
    cookies.start(reply, session.token);
    return { user: session.user };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    await auth.logout(cookies.read(request));
    cookies.end(reply);
    return reply.code(204).send();
  });

  app.post('/api/auth/link/check', (request) => {
    const { token: linkToken, kind } = linkCheckBody.parse(request.body);
    return auth.previewLink(linkToken, kind);
  });

  app.post('/api/auth/join', async (request, reply) => {
    const session = await auth.join(joinBody.parse(request.body));
    cookies.start(reply, session.token);
    return reply.code(201).send({ user: session.user });
  });

  app.post('/api/auth/reset', async (request, reply) => {
    const session = await auth.resetPassword(resetBody.parse(request.body));
    cookies.start(reply, session.token);
    return { user: session.user };
  });

  app.post('/api/auth/password', async (request, reply) => {
    const session = await auth.changePassword(requireUser(request).id, changePasswordBody.parse(request.body));
    cookies.start(reply, session.token); // every session was closed, this browser gets a fresh one
    return { user: session.user };
  });
}

export function registerAdminRoutes(app: FastifyInstance, admin: AdminService): void {
  app.get('/api/admin/members', () => admin.listMembers());

  app.patch('/api/admin/members/:id', (request) => {
    const { id } = idParams.parse(request.params);
    return admin.setDisabled(id, setDisabledBody.parse(request.body).isDisabled);
  });

  app.post('/api/admin/members/:id/reset-link', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    return reply.code(201).send(await admin.createResetLink(requireUser(request).id, id));
  });

  app.get('/api/admin/invitations', () => admin.listInvitations());

  app.post('/api/admin/invitations', async (request, reply) => {
    const { label } = createInvitationBody.parse(request.body ?? {});
    return reply.code(201).send(await admin.createInvitation(requireUser(request).id, label));
  });

  app.delete('/api/admin/invitations/:id', async (request, reply) => {
    await admin.revokeInvitation(idParams.parse(request.params).id);
    return reply.code(204).send();
  });
}
