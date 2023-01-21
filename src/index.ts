import z from "zod";
import { config } from "dotenv";
import { Server, Socket } from "socket.io";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

config();

const io = new Server({
  cors: {
    origin: process.env.NEXT_APP,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket: Socket) => {
  socket.on("disconnect", async () => {
    await prisma.user.delete({ where: { id: socket.data.userId } });
  });

  socket.on("join_request", async (request) => {
    const requestSchema = z.object({
      roomId: z.string(),
      username: z.string(),
    });
    const requestParse = requestSchema.safeParse(request);

    if (!requestParse.success) {
      socket.emit("join_failed", { reason: requestParse.error.toString() });
      return socket.disconnect(true);
    }

    let room = await prisma.room.findFirst({
      where: {
        id: requestParse.data.roomId,
      },
      include: { users: true },
    });

    if (!room) {
      // @TODO: throw if there is no room with that id.
      return;
    }

    // if (room.currentPlayers >= room.maxPlayers) {
    //   // @TODO: do not let anyone else in the room.
    //   return;
    // }

    const user = await prisma.user.create({
      data: {
        username: requestParse.data.username,
        roomId: room.id,
      },
    });

    room = await prisma.room.update({
      where: {
        id: requestParse.data.roomId,
      },
      data: {
        currentPlayers: room.currentPlayers + 1,
      },
      include: { users: true },
    });

    socket.join(requestParse.data.roomId);
    socket.data.userId = user.id;
    io.to(requestParse.data.roomId).emit("player_joined", {
      users: room.users,
    });

    socket.on("room_player_action", (request) => {
      const requestSchema = z.object({
        action: z.enum(["THEME_VOTED", "MEME_READY"]),
        user: z.string(),
        roomId: z.string(),
      });
      const requestParse = requestSchema.safeParse(request);
      if (!requestParse.success)
        return socket.emit("action_failed", {
          reason: requestParse.error.toString(),
        });

      switch (requestParse.data.action) {
        case "MEME_READY":
          socket.to(requestParse.data.roomId).emit("meme_ready", {});
          break;

        case "THEME_VOTED":
          socket.to(requestParse.data.roomId).emit("theme_voted", {});
          break;
      }
    });
  });
});

io.listen(parseInt(process.env.SERVER_PORT!));
