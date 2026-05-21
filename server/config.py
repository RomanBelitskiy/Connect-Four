import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

PLACEHOLDER_TOKENS = {
    "123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
    "YOUR_BOT_TOKEN_HERE",
}


@dataclass(frozen=True)
class Settings:
    bot_token: str
    bot_username: str
    bot_app_short_name: str
    webapp_url: str
    port: int
    database_url: str

    @property
    def is_bot_configured(self) -> bool:
        token = (self.bot_token or "").strip()
        return bool(token and token not in PLACEHOLDER_TOKENS)


def get_settings() -> Settings:
    return Settings(
        bot_token=os.getenv("BOT_TOKEN", ""),
        bot_username=os.getenv("BOT_USERNAME", ""),
        bot_app_short_name=os.getenv("BOT_APP_SHORT_NAME", ""),
        webapp_url=os.getenv("WEBAPP_URL", "https://quopnft.uk"),
        port=int(os.getenv("PORT", "3000")),
        database_url=os.getenv("DATABASE_URL", ""),
    )


settings = get_settings()
