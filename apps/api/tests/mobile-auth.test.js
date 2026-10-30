import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { harness } from "./support/harness.js";

let h;
before(async () => { h = await harness(); });
after(async () => { if (h) await h.close(); });

async function mobile(method, endpoint, payload) {
  return h.app.inject({
    method,
    url: `/api/v1/auth/mobile/${endpoint}`,
    ...(payload === undefined ? {} : { payload }),
  });
}

test("native login and rotating refresh persist without browser cookies", async () => {
  const login = await mobile("POST", "login", {
    email: "employee@example.com",
    password: "Employee123!",
  });
  assert.equal(login.statusCode, 200, login.body);
  const initial = login.json().data;
  assert.ok(initial.accessToken);
  assert.ok(initial.refreshToken);
  assert.equal(login.headers["cache-control"], "no-store");
  assert.equal(login.headers["set-cookie"], undefined);

  const me = await h.app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: { authorization: `Bearer ${initial.accessToken}` },
  });
  assert.equal(me.statusCode, 200, me.body);

  const refresh = await mobile("POST", "refresh", {
    refreshToken: initial.refreshToken,
  });
  assert.equal(refresh.statusCode, 200, refresh.body);
  const rotated = refresh.json().data;
  assert.notEqual(rotated.refreshToken, initial.refreshToken);
  assert.ok(rotated.accessToken);
  assert.equal(
    (await mobile("POST", "refresh", { refreshToken: initial.refreshToken })).statusCode,
    401,
    "already-used mobile refresh token must not be reusable",
  );

  const logout = await mobile("POST", "logout", {
    refreshToken: rotated.refreshToken,
  });
  assert.equal(logout.statusCode, 200, logout.body);
  assert.equal(
    (await mobile("POST", "refresh", { refreshToken: rotated.refreshToken })).statusCode,
    401,
  );
  assert.equal(
    (await mobile("POST", "logout", { refreshToken: rotated.refreshToken })).statusCode,
    200,
    "logout is idempotent",
  );
  assert.equal(
    (await h.app.inject({
      method: "GET",
      url: "/api/v1/auth/me",
      headers: { authorization: `Bearer ${rotated.accessToken}` },
    })).statusCode,
    401,
    "logout must revoke the underlying session, not merely clear the phone",
  );
});

test("mobile login failure cannot return credentials; browser flow remains cookie-only", async () => {
  const invalid = await mobile("POST", "login", {
    email: "employee@example.com",
    password: "WrongPassword",
  });
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.body.includes("refreshToken"), false);

  const web = await h.app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: "employee@example.com",
      password: "Employee123!",
    },
  });
  assert.equal(web.statusCode, 200, web.body);
  assert.equal(typeof web.json().data.refreshToken, "undefined");
  assert.ok(web.headers["set-cookie"]);
  const cookieRefresh = await h.app.inject({
    method: "POST",
    url: "/api/v1/auth/refresh",
    headers: { cookie: web.headers["set-cookie"].split(";")[0] },
  });
  assert.equal(cookieRefresh.statusCode, 200, cookieRefresh.body);
});
