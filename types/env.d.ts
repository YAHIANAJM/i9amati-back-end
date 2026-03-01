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
          CMI_OK_URL: string;
          CMI_MOCK_MODE: string;
          CLOUDINARY_CLOUD_NAME: string;
          CLOUDINARY_API_KEY: string;
          CLOUDINARY_API_SECRET: string;
          SMTP_HOST: string;
          SMTP_PORT: string;
          SMTP_SECURE: string;
          SMTP_USER: string;
          SMTP_PASS: string;
          SMTP_FROM: string
    } 
}
    