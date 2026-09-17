import { test } from "node:test";
import assert from "node:assert/strict";
import { io } from "socket.io-client";
import { harness } from "./support/harness.js";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const once = (socket, event) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, done);
      reject(new Error(`Timed out waiting for ${event}`));
    }, 4000);
    function done(...args) {
      clearTimeout(timer);
      resolve(args);
    }
    socket.once(event, done);
  });

test("live sockets enforce task recipients, membership, logout and refresh replay", async () => {
  const h = await harness();
  const sockets = [];
  try {
    const address = await h.app.listen({ port: 0, host: "127.0.0.1" });
    async function connect(actor) {
      const socket = io(address, {
        auth: { token: actor.accessToken },
        transports: ["websocket"],
        reconnection: false,
        autoConnect: false,
      });
      sockets.push(socket);
      const ready = once(socket, "connect");
      socket.connect();
      await ready;
      return socket;
    }
    const employee = await connect(h.users.employee);
    const admin = await connect(h.users.admin);
    const otherResponse = await h.call(h.users.admin, "POST", "/users", {
      email: "socket@example.com",
      password: "SocketTest123!",
      firstName: "Other",
      lastName: "Team",
    });
    assert.equal(otherResponse.statusCode, 201, otherResponse.body);
    const outsiderActor = await h.login("socket@example.com", "SocketTest123!");
    const outsider = await connect(outsiderActor);
    const outsiderEvents = [];
    outsider.onAny((event) => outsiderEvents.push(event));
    const created = once(employee, "task:created");
    const task = await h.call(h.users.employee, "POST", "/tasks", {
      title: "Socket private task",
    });
    assert.equal(task.statusCode, 201, task.body);
    assert.equal((await created)[0].id, task.json().data.id);
    const group = await h.call(h.users.employee, "POST", "/conversations", {
      type: "GROUP",
      name: "Socket group",
      memberIds: [h.users.admin.user.id],
    });
    assert.equal(group.statusCode, 201, group.body);
    const id = group.json().data.id;
    // A non-member cannot join a guessed room or inject typing events.
    let forgedTyping = false;
    employee.on("message:typing:start", () => {
      forgedTyping = true;
    });
    outsider.emit("conversation:join", id);
    outsider.emit("message:typing:start", { conversationId: id });
    const delivered = once(admin, "message:created");
    assert.equal(
      (
        await h.call(
          h.users.employee,
          "POST",
          `/conversations/${id}/messages`,
          { content: "Hello team" },
        )
      ).statusCode,
      201,
    );
    await delivered;
    assert.equal(
      (
        await h.call(
          h.users.employee,
          "DELETE",
          `/conversations/${id}/members/${h.users.admin.user.id}`,
        )
      ).statusCode,
      200,
    );
    let removedMemberDelivery = false;
    admin.on("message:created", () => {
      removedMemberDelivery = true;
    });
    assert.equal(
      (
        await h.call(
          h.users.employee,
          "POST",
          `/conversations/${id}/messages`,
          { content: "After removal" },
        )
      ).statusCode,
      201,
    );
    await delay(180);
    assert.equal(forgedTyping, false);
    assert.equal(removedMemberDelivery, false);
    assert.equal(outsiderEvents.includes("task:created"), false);
    assert.equal(outsiderEvents.includes("message:created"), false);
    const disconnected = once(outsider, "disconnect");
    assert.equal(
      (
        await h.app.inject({
          method: "POST",
          url: "/api/v1/auth/logout",
          headers: { cookie: outsiderActor.cookie },
        })
      ).statusCode,
      200,
    );
    await disconnected;
    const unauthorized = once(outsider, "connect_error");
    outsider.connect();
    assert.equal((await unauthorized)[0].message, "Unauthorized");
    const refreshed = await h.app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { cookie: h.users.employee.cookie },
    });
    assert.equal(refreshed.statusCode, 200, refreshed.body);
    assert.equal(
      (
        await h.app.inject({
          method: "POST",
          url: "/api/v1/auth/refresh",
          headers: { cookie: h.users.employee.cookie },
        })
      ).statusCode,
      401,
    );
  } finally {
    sockets.forEach((s) => s.disconnect());
    await h.close();
  }
});
