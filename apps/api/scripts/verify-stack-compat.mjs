import assert from 'node:assert/strict';
import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

/**
 * Verify runtime compatibility between Fastify 5, Zod 3.25.76,
 * fastify-type-provider-zod 4.0.2, and `@fastify/swagger` 9.9.5.
 */
async function verifyStackCompatibility() {
  const app = Fastify({ logger: false });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'DirtFit Stack Compatibility Check',
        version: '0.1.0',
      },
    },
    transform: jsonSchemaTransform,
  });

  const RequestSchema = z
    .object({
      heightCm: z.number().min(135).max(220),
      priceVnd: z.number().int().positive(),
    })
    .strict();

  const ResponseSchema = z
    .object({
      ok: z.boolean(),
      heightCm: z.number(),
      priceVnd: z.number(),
    })
    .strict();

  app.post(
    '/compat-check',
    {
      schema: {
        body: RequestSchema,
        response: {
          200: ResponseSchema,
        },
      },
    },
    async (request) => ({
      ok: true,
      heightCm: request.body.heightCm,
      priceVnd: request.body.priceVnd,
    })
  );

  await app.ready();

  // 1. Valid payload succeeds and strips nothing required
  const validRes = await app.inject({
    method: 'POST',
    url: '/compat-check',
    payload: { heightCm: 172, priceVnd: 165000000 },
  });
  assert.equal(validRes.statusCode, 200, 'Expected 200 for valid strict Zod payload');
  assert.deepEqual(validRes.json(), { ok: true, heightCm: 172, priceVnd: 165000000 });

  // 2. Unknown extra field is rejected by Zod .strict()
  const strictRes = await app.inject({
    method: 'POST',
    url: '/compat-check',
    payload: { heightCm: 172, priceVnd: 165000000, injectedField: 'hack' },
  });
  assert.equal(strictRes.statusCode, 400, 'Expected 400 when extra field violates .strict()');

  // 3. OpenAPI 3.0 schema generation succeeds via jsonSchemaTransform
  const openapiDoc = app.swagger();
  assert.ok(openapiDoc.openapi.startsWith('3.'), 'Expected OpenAPI 3.x spec');
  assert.ok(openapiDoc.paths['/compat-check'], 'Expected /compat-check in generated OpenAPI');

  await app.close();
  console.log(
    '[verify:compat] PASSED: Fastify 5 + Zod 3.25.76 + fastify-type-provider-zod 4 + Swagger OpenAPI 3.0 verified.'
  );
}

await verifyStackCompatibility();
