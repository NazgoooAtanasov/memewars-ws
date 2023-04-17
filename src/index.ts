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
    if (!socket.data.userId) return; // when the socket was closed manually, we don't persist any user info, and we cannot look for that in the db, thus returning

    const deletedUser = await prisma.user.delete({
      where: { id: socket.data.userId },
    });

    const room = await prisma.room.findFirst({
      where: { id: deletedUser.roomId },
      include: { users: true },
    });
    if (!room) return;

    await prisma.room.update({
      where: { id: room.id },
      data: { currentPlayers: room.currentPlayers - 1 },
    });

    io.to(room.id).emit("player_left", room.users);
  });

  socket.on("join_request", async (request) => {
    const requestSchema = z.object({
      roomId: z.string(),
      username: z.string(),
    });
    const requestParse = requestSchema.safeParse(request);

    if (!requestParse.success) {
      socket.emit("join_failed", requestParse.error.toString());
      return socket.disconnect(true);
    }

    let room = await prisma.room.findFirst({
      where: {
        id: requestParse.data.roomId,
      },
      include: { users: true },
    });

    if (!room) return socket.emit("join_failed", "No room with that id.");

    if (room.currentPlayers >= room.maxPlayers)
      return socket.emit("join_failed", "Room already full.");

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
    io.to(requestParse.data.roomId).emit("player_joined", room.users);
  });
});

io.listen(parseInt(process.env.SERVER_PORT!));
