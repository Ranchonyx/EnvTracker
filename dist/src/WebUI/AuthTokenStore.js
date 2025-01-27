import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
export default class AuthTokenStore {
    SECRET = Buffer.from([0xCA, 0xFE, 0xBA, 0xBE, ...randomBytes(1020)]);
    TokenExpiryMap = new Map();
    realm;
    issuer;
    audience;
    TokenTimer;
    signFunction;
    decodeFunction;
    verifyFunction;
    log;
    //Expires by default after 15m
    RequestToken(identifyingData, expiresInMs = 90000000) {
        const token = this.signFunction({ realm: this.realm, credentials: identifyingData }, this.SECRET, {
            algorithm: "HS512",
            issuer: this.issuer,
            audience: this.audience,
            expiresIn: `${Math.floor(expiresInMs / 1000)}s`
        });
        this.TokenExpiryMap.set(token, expiresInMs / 10);
        return token;
    }
    IsTokenValid(token) {
        try {
            const verifyResult = this.verifyFunction(token, this.SECRET);
            this.log(`Verification result:`, verifyResult);
        }
        catch (ex) {
            this.log(`A client attempted to verify a bearer token with an old secret!`);
            return false;
        }
        return this.TokenExpiryMap.has(token);
    }
    TokenDecayFunction() {
        for (const [token, lifetime] of this.TokenExpiryMap.entries()) {
            if (lifetime <= 0) {
                this.TokenExpiryMap.delete(token);
                this.log(`Purged token ${token}`);
            }
            else {
                this.TokenExpiryMap.set(token, lifetime - 1);
                //console.warn(`${lifetime}`);
            }
        }
    }
    Destroy() {
        this.TokenExpiryMap.forEach((v, k) => {
            this.TokenExpiryMap.delete(k);
        });
    }
    constructor(pRealm, pIssuer, pAudience, logFn) {
        this.realm = pRealm;
        this.issuer = pIssuer;
        this.audience = pAudience;
        this.TokenTimer = setInterval(this.TokenDecayFunction.bind(this), 1);
        const require = createRequire(import.meta.url);
        const { sign, decode, verify } = require("jsonwebtoken");
        this.signFunction = sign;
        this.decodeFunction = decode;
        this.verifyFunction = verify;
        this.log = logFn;
        this.log(`[[AuthTokenStore]] -> Secret : [[${this.SECRET.toString("hex")}]]`);
    }
}
//# sourceMappingURL=AuthTokenStore.js.map