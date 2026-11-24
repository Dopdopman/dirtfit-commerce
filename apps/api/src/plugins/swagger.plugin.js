import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export default fp(
  async function swaggerPlugin(app, opts) {
    const { env } = opts;
    if (!env.SWAGGER_ENABLED) {
      return;
    }

    await app.register(swagger, {
      openapi: {
        openapi: '3.0.3',
        info: {
          title: 'DirtFit Commerce API',
          description: 'Off-road motorcycle e-commerce & 2D Rider Fit API (v1)',
          version: '1.0.0',
        },
        servers: [{ url: env.API_URL }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
      },
      transform: jsonSchemaTransform,
    });

    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  },
  { name: 'swagger-plugin' }
);
