import * as jwt from 'express-jwt';
import * as jwksRsa from 'jwks-rsa';

// Authorization middleware. When used, the
// Access Token must exist and be verified against
// the Auth0 JSON Web Key Set
export const checkJwt = jwt({
  // Dynamically provide a signing key
  // based on the kid in the header and
  // the signing keys provided by the JWKS endpoint.
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://tumi.eu.auth0.com/.well-known/jwks.json`,
  }),

  // Validate the audience and the issuer.
  audience: 'esn.events',
  issuer: [`https://tumi.eu.auth0.com/`],
  algorithms: ['RS256'],
  credentialsRequired: false,
});

export const getUser = (prisma) => (req, res, next) => {
  if (!req.user) {
    return next();
  }
  console.log(req.user);
  req.token = req.user;
  prisma.user
    .findFirst({
      where: {
        authId: req.user.sub,
      },
    })
    .then((user) => {
      if (!user) {
        return next();
      }
      req.user = user;
      next();
    });
};
