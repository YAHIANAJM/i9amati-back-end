declare namespace NodeJS {
    interface ProcessEnv {
        NODE_ENV: string;
          PORT: string;
          MONGO_URI: string;
          SESSION_SECRET: string;
          FRONTEND_URL: string;
          JWT_SECRET: string
    } 
}
    