import JWT from 'jsonwebtoken';

const JWT_ALGORITHM = 'HS512';

interface JWTPayload {
  serverId: string;
}

interface Config {
  jwt_max_age: number;
  jwt_key: string;
}

export async function sign(config: Config, payload: JWTPayload): Promise<string|undefined> {
  const expiresIn: number = config.jwt_max_age / 1000; // Convert from milliseconds to seconds

  return new Promise<string | undefined>((resolve, reject) => {
    JWT.sign(
      payload,
      config.jwt_key,
      {
        algorithm: JWT_ALGORITHM,
        expiresIn,
      },
      (err: Error | null, encoded: string | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(encoded);
        }
      },
    );
  });
}

export async function verify(config: Config, jwt: string): Promise<JWTPayload | null> {
  return new Promise<JWTPayload | null>((resolve, reject) => {
    JWT.verify(
      jwt,
      config.jwt_key,
      { algorithms: [JWT_ALGORITHM] },
      (err: Error | null, decoded: any) => {
        if (err) {
          const expired: boolean = err.name === 'TokenExpiredError';
          if (expired) {
            resolve(null);
          } else {
            reject(err);
          }
        } else {
          resolve(decoded);
        }
      },
    );
  });
}

export default {
  sign,
  verify
};
