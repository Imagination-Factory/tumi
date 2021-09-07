import { ApolloServer } from 'apollo-server-express';
import { ApolloServerPluginDrainHttpServer } from 'apollo-server-core';
import * as express from 'express';
import * as http from 'http';
import * as path from 'path';
import { PrismaClient } from '@tumi/models';
import { schema } from '@tumi/graphql';
import { checkJwt, getUser } from './app/auth';

const prisma = new PrismaClient();

// Required logic for integrating with Express
const app = express();
const httpServer = http.createServer(app);

app.use('/', express.static(path.join(__dirname, '..', 'tumi-app', 'browser')));
app.use(checkJwt);
app.use(getUser(prisma));

const server = new ApolloServer({
  schema,
  context({ req }) {
    return {
      prisma,
      user: req.user,
      token: req.token,
    };
  },
  plugins: [ApolloServerPluginDrainHttpServer({ httpServer })],
});

server.start().then(() => {
  server.applyMiddleware({ app });
  httpServer.listen({ port: process.env.PORT ?? 3333 }, () => {
    console.log(`
    🚀 Server ready at http://localhost:3333
    🕵️  GraphQL ready at: http://localhost:3333${server.graphqlPath}
    `);
  });
});
