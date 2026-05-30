from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    REDIS_URL: str
    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Разрешённые источники CORS (через запятую). По умолчанию — дев-сервер Vite.
    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        """CORS_ORIGINS как список; '*' оставляет доступ открытым."""
        raw = self.CORS_ORIGINS.strip()
        if raw == "*":
            return ["*"]
        return [o.strip() for o in raw.split(",") if o.strip()]

    # Пороги алертов (настраиваемые тренером)
    ALERT_OVERLOAD_TSB_THRESHOLD: float = -30.0
    ALERT_OVERLOAD_RESTING_HR_PCT: float = 7.0
    ALERT_OVERLOAD_HRV_PCT: float = 85.0
    ALERT_UNDERLOAD_CTL_DELTA: float = 2.0
    ALERT_UNDERLOAD_TSB_HIGH: float = 15.0

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
