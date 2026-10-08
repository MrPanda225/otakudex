import type { FastifyInstance } from 'fastify';
import { exportFileSchema } from '../export/schema.ts';
import type { AdminService } from '../auth/admin.ts';
import type { AuthService } from '../auth/service.ts';
import type { BackdropService } from '../backdrop/service.ts';
import type { ExportService } from '../export/service.ts';
import type { LibraryService } from '../library/service.ts';
import type { PickerService } from '../picker/service.ts';
import type { RankingService } from '../ranking/service.ts';
import type { StatsService } from '../stats/service.ts';
import type { TranslationService } from '../translate/service.ts';
import { requireUser, type SessionCookies } from './auth-guard.ts';
import { registerAdminRoutes, registerAuthRoutes } from './auth-routes.ts';
import type { PosterProxy } from './poster-proxy.ts';
import { languageOf, problem } from './problem.ts';
import {
  addFromKitsuBody,
  addManualBody,
  backdropIndexParams,
  candidatesQuery,
  csvQuery,
  idParams,
  langQuery,
  patchEntryBody,
  pickerQuery,
  placeRankBody,
  posterQuery,
  searchQuery,
} from './schemas.ts';

export interface Services {
  backdrop: BackdropService;
  auth: AuthService;
  admin: AdminService;
  library: LibraryService;
  ranking: RankingService;
  stats: StatsService;
  picker: PickerService;
  exporter: ExportService;
  posters: PosterProxy;
  translation: TranslationService;
}

const IMPORT_BODY_LIMIT_BYTES = 25 * 1024 * 1024;
const BACKDROP_IMAGE_CACHE_SECONDS = 24 * 60 * 60;
const POSTER_CACHE_SECONDS = 7 * 24 * 60 * 60;

export function registerRoutes(app: FastifyInstance, services: Services, cookies: SessionCookies): void {
  registerBackdropRoutes(app, services.backdrop);
  registerAuthRoutes(app, services.auth, cookies);
  registerAdminRoutes(app, services.admin);
  registerLibraryRoutes(app, services);
  registerRankingRoutes(app, services);
  registerInsightRoutes(app, services);
  registerDataRoutes(app, services);
}

/**
 * The covers behind the sign-in screens. Public, so deliberately small: the only input is a number, and the
 * answers come from a list the server holds (see server/backdrop/service.ts).
 */
function registerBackdropRoutes(app: FastifyInstance, backdrop: BackdropService): void {
  app.get('/api/backdrop', async () => {
    const { version, count } = await backdrop.list();
    return { images: Array.from({ length: count }, (_, index) => `/api/backdrop/${index}?v=${version}`) };
  });

  app.get('/api/backdrop/:index', async (request, reply) => {
    const { index } = backdropIndexParams.parse(request.params);
    const image = await backdrop.image(index);
    if (!image) return reply.code(404).send(problem(request, 'image.notFound'));
    return reply
      .header('Content-Type', image.contentType)
      .header('Cache-Control', `public, max-age=${BACKDROP_IMAGE_CACHE_SECONDS}`)
      .send(image.body);
  });
}

function registerLibraryRoutes(app: FastifyInstance, { library, translation }: Services): void {
  // The owner always comes from the session (requireUser), never from the URL or the body.
  app.get('/api/library', (request) => library.list(requireUser(request).id));

  app.get('/api/search', (request) => library.search(requireUser(request).id, searchQuery.parse(request.query).q));

  app.post('/api/library', async (request, reply) => {
    const { kitsuId, status } = addFromKitsuBody.parse(request.body);
    return reply.code(201).send(await library.addFromKitsu(requireUser(request).id, kitsuId, status));
  });

  app.post('/api/library/manual', async (request, reply) => {
    return reply.code(201).send(await library.addManual(requireUser(request).id, addManualBody.parse(request.body)));
  });

  app.patch('/api/library/:id', (request) => {
    const { id } = idParams.parse(request.params);
    return library.update(requireUser(request).id, id, patchEntryBody.parse(request.body));
  });

  app.delete('/api/library/:id', async (request, reply) => {
    await library.remove(requireUser(request).id, idParams.parse(request.params).id);
    return reply.code(204).send();
  });

  app.post('/api/library/:id/episode', (request) =>
    library.markEpisode(requireUser(request).id, idParams.parse(request.params).id),
  );

  app.delete('/api/library/:id/episode', (request) =>
    library.undoEpisode(requireUser(request).id, idParams.parse(request.params).id),
  );

  // The synopsis of one of the account's own entries, translated when the language asked for is not the original.
  app.get('/api/library/:id/synopsis', (request) =>
    translation.synopsis(requireUser(request).id, idParams.parse(request.params).id, langQuery.parse(request.query).lang),
  );
}

function registerRankingRoutes(app: FastifyInstance, { library, ranking }: Services): void {
  app.get('/api/ranking/candidates', (request) => {
    const { bucket, exclude } = candidatesQuery.parse(request.query);
    return ranking.listCandidates(requireUser(request).id, bucket, exclude ?? null);
  });

  app.put('/api/ranking/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const { bucket, index } = placeRankBody.parse(request.body);
    const userId = requireUser(request).id;
    await ranking.place(userId, id, bucket, index);
    return library.get(userId, id);
  });

  app.delete('/api/ranking/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const userId = requireUser(request).id;
    await ranking.unrank(userId, id);
    return library.get(userId, id);
  });
}

function registerInsightRoutes(app: FastifyInstance, { stats, picker }: Services): void {
  app.get('/api/stats', (request) => stats.compute(requireUser(request).id));

  app.get('/api/picker', (request) => {
    const { maxMinutes, subtype } = pickerQuery.parse(request.query);
    return picker.pick(requireUser(request).id, {
      ...(maxMinutes !== undefined ? { maxTotalMinutes: maxMinutes } : {}),
      ...(subtype !== undefined ? { subtype } : {}),
    });
  });
}

function registerDataRoutes(app: FastifyInstance, { exporter, posters }: Services): void {
  app.get('/api/health', () => ({ status: 'ok' }));

  app.get('/api/poster', async (request, reply) => {
    const { url } = posterQuery.parse(request.query);
    const { contentType, body } = await posters.fetchPoster(url);
    return reply
      .header('Content-Type', contentType)
      .header('Cache-Control', `public, max-age=${POSTER_CACHE_SECONDS}, immutable`)
      .send(body);
  });

  app.get('/api/export.json', async (request, reply) => {
    const file = await exporter.toJson(requireUser(request).id);
    return reply
      .header('Content-Disposition', 'attachment; filename="otakudex-export.json"')
      .type('application/json')
      .send(JSON.stringify(file, null, 2));
  });

  app.get('/api/export.csv', async (request, reply) => {
    // A plain download link cannot send a header, so the page names its language in the address.
    const lang = csvQuery.parse(request.query).lang ?? languageOf(request);
    return reply
      .header('Content-Disposition', `attachment; filename="otakudex-${lang === 'fr' ? 'bibliotheque' : 'library'}.csv"`)
      .type('text/csv; charset=utf-8')
      .send(await exporter.toCsv(requireUser(request).id, lang));
  });

  app.post('/api/import', { bodyLimit: IMPORT_BODY_LIMIT_BYTES }, (request) =>
    exporter.restore(requireUser(request).id, exportFileSchema.parse(request.body)),
  );
}
