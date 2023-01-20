import { Server, Socket } from "socket.io";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
config();

const prisma = new PrismaClient();
const io = new Server({});

io.on("connection", (socket: Socket) => {
  socket.on("join_request", ({ asdf }) => {
    console.log(asdf);
  });
});

io.listen(parseInt(process.env.SERVER_PORT!));
