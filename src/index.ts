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

// @TODO: handle player disconnect - it should be only event dispatch to all the listeners to update the users list.
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

    if (!room)
      return socket.emit("join_failed", { reason: "No room with that id." });

    if (room.currentPlayers >= room.maxPlayers)
      return socket.emit("join_failed", { reason: "Room already full." });

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
  });
});

io.listen(parseInt(process.env.SERVER_PORT!));
