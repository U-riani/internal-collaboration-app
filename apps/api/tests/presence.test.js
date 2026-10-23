import { test } from "node:test";
import assert from "node:assert/strict";
import { io } from "socket.io-client";
import { harness } from "./support/harness.js";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function awaitSocketEvent(socket, name, check = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, handler);
      reject(new Error(`Timed out waiting for ${name}`));
    }, 5000);
    function handler(payload) {
      if (!check(payload)) return;
      clearTimeout(timer);
      socket.off(name, handler);
      resolve(payload);
    }
    socket.on(name, handler);
  });
}

test("direct-chat presence is scoped and backed by authenticated session state", async () => {
  const h = await harness();
  try {
    const peer = h.users.manager.user.id;
    const created = await h.call(h.users.employee, "POST", "/conversations", {
      type: "DIRECT",
      memberIds: [peer],
    });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().data.id;

    const retrieve = async (actor) => {
      const response = await h.call(actor, "GET", "/conversations");
      assert.equal(response.statusCode, 200, response.body);
      return response.json().data.find((conversation) => conversation.id === id);
    };

    const before = await retrieve(h.users.employee);
    assert.equal(before.members.find((m) => m.userId === peer).user.isOnline, false);
    await h.app.redis.set(`presence:${peer}`, "online", "EX", 90);
    const after = await retrieve(h.users.employee);
    assert.equal(after.members.find((m) => m.userId === peer).user.isOnline, true);

    // Admin privilege does not automatically grant access to private chats.
    assert.equal(await retrieve(h.users.admin), undefined);
    await h.app.redis.del(`presence:${peer}`);
    assert.equal(
      (await retrieve(h.users.employee)).members.find((m) => m.userId === peer).user.isOnline,
      false,
    );
  } finally {
    await h.close();
  }
});

test("authorized conversation peers receive online/offline transitions", async () => {
  const h = await harness();
  const sockets = [];
  try {
    const direct = await h.call(h.users.employee, "POST", "/conversations", {
      type: "DIRECT",
      memberIds: [h.users.manager.user.id],
    });
    assert.equal(direct.statusCode, 201, direct.body);
    const address = await h.app.listen({ port: 0, host: "127.0.0.1" });
    async function connect(actor) {
      const socket = io(address, {
        auth: { token: actor.accessToken },
        transports: ["websocket"],
        reconnection: false,
        autoConnect: false,
      });
      sockets.push(socket);
      const ready = awaitSocketEvent(socket, "connect");
      socket.connect();
      await ready;
      return socket;
    }
    const employee = await connect(h.users.employee);
    // Wait for server-side initial membership rooms to be registered.
    await delay(120);
    const managerOnline = awaitSocketEvent(
      employee,
      "presence:updated",
      (event) => event.userId === h.users.manager.user.id && event.isOnline === true,
    );
    const manager = await connect(h.users.manager);
    await managerOnline;
    const managerOffline = awaitSocketEvent(
      employee,
      "presence:updated",
      (event) => event.userId === h.users.manager.user.id && event.isOnline === false,
    );
    manager.disconnect();
    await managerOffline;
  } finally {
    for (const socket of sockets) socket.disconnect();
    await h.close();
  }
});
