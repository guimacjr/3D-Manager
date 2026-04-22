declare namespace NodeJS {
  interface ProcessEnv {
    PORT?: string;
    DB_PATH?: string;
    MEDIA_ROOT?: string;

    ML_APP_ID?: string;
    ML_CLIENT_SECRET?: string;
    ML_REDIRECT_URI?: string;
  }
}

export {};
