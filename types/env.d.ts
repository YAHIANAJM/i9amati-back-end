declare namespace NodeJS {
    interface ProcessEnv {
        NODE_ENV: string;
          PORT: string;
          MONGO_URI: string;
          SESSION_SECRET: string;
          FRONTEND_URL: string;
          JWT_SECRET: string;
          CMI_MERCHANT_ID: string;
          CMI_STORE_KEY: string;
          CMI_API_KEY: string;
          CMI_GATEWAY_URL: string;
          CMI_CALLBACK_URL: string;
          CMI_FAIL_URL: string;
          CMI_OK_URL: string
    } 
}
    