import http from "http";
import net from "net";
import { Application } from "express";

export async function runProcess(): Promise<void> {
  let shutdownInProgress = false;

  return new Promise((resolve) => {
    const shutdown = (signal: string) => {
      if (shutdownInProgress) {
        console.log(`Got ${signal} but shutdown already in progress, ignoring`);
        return;
      }

      console.log(`Received ${signal}, shutting down`);
      shutdownInProgress = true;
      cleanup();
      resolve();
    };

    const onException = (err: any) => {
      console.error(`Uncaught exception: ${err.stack || err}`);
    };

    const onRejection = (err: any) => {
      console.error(`Unhandled rejection: ${err.stack || err}`);
    };

    const cleanup = () => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      process.off('uncaughtException', onException);
      process.off('unhandledRejection', onRejection);
    };

    const onSigint = () => shutdown('SIGINT');
    const onSigterm = () => shutdown('SIGTERM');

    process.on('SIGINT', onSigint);
    process.on('SIGTERM', onSigterm);
    process.on('uncaughtException', onException);
    process.on('unhandledRejection', onRejection);
  });
}

export class ExpressServer {
  private server: http.Server;
  private serverSockets: Set<net.Socket> = new Set();

  constructor(app: Application) {
    this.server = http.createServer(app);
  }

  async start(port: number) {
    this.server.on('connection', socket => {
      this.serverSockets.add(socket);
      socket.on('close', () => {
        this.serverSockets.delete(socket);
      });
    });

    await this.listen(port);
  }

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {

      const onError = (error: NodeJS.ErrnoException) => {
        this.server.off("error", onError);
        this.server.off("listening", onListening);
        reject(error);
      }

      const onListening = () => {
        console.log(`Server is running on port ${port}`);
        this.server.off("error", onError);
        this.server.off("listening", onListening);

        resolve();
      };

      this.server.on("listening", onListening);
      this.server.on("error", onError);

      this.server.listen(port);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      // NOTE: closeSockets() is called immediately after server.close() and always runs before the promise is resolved:
      this.server.close(err => (err ? reject(err) : resolve()));
      this.closeSockets();
    });
  }

  private closeSockets() {
    console.log(`Destroying ${this.serverSockets.size} active sockets`);
    for (const socket of this.serverSockets.values()) {
      socket.destroy();
    }
  }
}
