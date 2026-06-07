export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === "/api/register" && request.method === "POST") {
      const { userId } = await request.json();
      await env.DB.prepare("INSERT OR IGNORE INTO users (userId) VALUES (?)").bind(userId).run();
      return new Response(JSON.stringify({ success: true }));
    }

    // 【核心修复】加好友时，同时写入两条记录，让双方的列表同时刷新
    if (path === "/api/add-friend" && request.method === "POST") {
      const { userId, friendId } = await request.json();
      
      // 第一条：让发起人（userId）列表里出现对方（friendId）
      await env.DB.prepare("INSERT OR IGNORE INTO friends (userId, friendId) VALUES (?, ?)").bind(userId, friendId).run();
      // 第二条：让被添加人（friendId）列表里也立刻出现发起人（userId）
      await env.DB.prepare("INSERT OR IGNORE INTO friends (userId, friendId) VALUES (?, ?)").bind(friendId, userId).run();
      
      return new Response(JSON.stringify({ success: true }));
    }

    if (path === "/api/join-group" && request.method === "POST") {
      const { userId, groupId } = await request.json();
      await env.DB.prepare("INSERT OR IGNORE INTO groups (userId, groupId) VALUES (?, ?)").bind(userId, groupId).run();
      return new Response(JSON.stringify({ success: true }));
    }

    if (path === "/api/list" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      const friends = await env.DB.prepare("SELECT friendId FROM friends WHERE userId = ?").bind(userId).all();
      const groups = await env.DB.prepare("SELECT groupId FROM groups WHERE userId = ?").bind(userId).all();
      return new Response(JSON.stringify({
        friends: friends ? friends.results.map(r => r.friendId) : [],
        groups: groups ? groups.results.map(r => r.groupId) : []
      }));
    }

    if (path === "/api/send" && request.method === "POST") {
      const { from, to, type, text } = await request.json();
      await env.DB.prepare("INSERT INTO messages (from_user, to_id, type, content) VALUES (?, ?, ?, ?)").bind(from, to, type, text).run();
      return new Response(JSON.stringify({ success: true }));
    }

    if (path === "/api/messages" && request.method === "GET") {
      const userId = url.searchParams.get("userId");
      const targetId = url.searchParams.get("targetId");
      const type = url.searchParams.get("type");
      let messages;
      if (type === "private") {
        messages = await env.DB.prepare("SELECT * FROM messages WHERE (from_user = ? AND to_id = ? AND type='private') OR (from_user = ? AND to_id = ? AND type='private') ORDER BY timestamp ASC").bind(userId, targetId, targetId, userId).all();
      } else {
        messages = await env.DB.prepare("SELECT * FROM messages WHERE to_id = ? AND type='group' ORDER BY timestamp ASC").bind(targetId).all();
      }
      return new Response(JSON.stringify(messages ? messages.results : []));
    }

    return new Response("API Not Found", { status: 404 });
  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
}