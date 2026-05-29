from __future__ import annotations

import logging

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQueryResultArticle,
    InputTextMessageContent,
)
from telegram.ext import Application, CommandHandler, ContextTypes

from server.config import settings
from server.games.registry import game_share_label, resolve_game_type
from server.share_links import build_main_mini_app_link, set_bot_username

logger = logging.getLogger(__name__)

_bot_application: Application | None = None


def get_bot_application() -> Application | None:
    return _bot_application


def _play_inline_button(invite_code: str | None = None) -> InlineKeyboardButton:
    link = build_main_mini_app_link(invite_code)
    return InlineKeyboardButton("▶ Грати", url=link)


def _play_markup(invite_code: str | None = None) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[_play_inline_button(invite_code)]])


def _invite_message(game_type: str | None) -> str:
    return f"{game_share_label(game_type)} — приєднуйся до моєї партії!"


async def start_command(update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return

    if context.args:
        payload = context.args[0]
        invite_code = payload[4:].lstrip("_") if payload.startswith("join") else payload
        if invite_code:
            from server.lobby_store import get_lobby_by_invite_code

            lobby = get_lobby_by_invite_code(invite_code)
            game_type = resolve_game_type(
                lobby.get("game_type") if lobby else None,
                lobby.get("grid") if lobby else None,
            )
            await update.message.reply_text(
                _invite_message(game_type),
                reply_markup=_play_markup(invite_code),
            )
            return

    await update.message.reply_text(
        "Mini Games — грай онлайн!\n\n"
        "Натисни кнопку нижче, щоб відкрити застосунок.",
        reply_markup=_play_markup(),
    )


async def play_command(update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message:
        return
    await update.message.reply_text(
        "Відкрий гру:",
        reply_markup=_play_markup(),
    )


def build_bot_application() -> Application:
    global _bot_application

    application = Application.builder().token(settings.bot_token).build()
    application.add_handler(CommandHandler("start", start_command))
    application.add_handler(CommandHandler("play", play_command))
    _bot_application = application
    return application


async def init_bot_username(application: Application) -> None:
    me = await application.bot.get_me()
    if me.username:
        set_bot_username(me.username)


async def fetch_user_chat_profile(telegram_id: int) -> dict | None:
    """Свіжі ім'я та username з Bot API (для ручного оновлення профілю)."""
    application = get_bot_application()
    if not application:
        return None

    try:
        chat = await application.bot.get_chat(chat_id=telegram_id)
        return {
            "id": chat.id,
            "username": chat.username,
            "first_name": chat.first_name or "",
            "last_name": chat.last_name,
        }
    except Exception as exc:
        logger.warning("Failed to fetch chat profile for %s: %s", telegram_id, exc)
        return None


async def fetch_user_photo_url(telegram_id: int) -> str | None:
    application = get_bot_application()
    if not application:
        return None

    try:
        photos = await application.bot.get_user_profile_photos(
            user_id=telegram_id, offset=0, limit=1
        )
        if not photos.total_count or not photos.photos:
            return None

        file_id = photos.photos[0][0].file_id
        file = await application.bot.get_file(file_id)
        if not file.file_path:
            return None

        file_path = file.file_path
        if file_path.startswith("http://") or file_path.startswith("https://"):
            return file_path
        return f"https://api.telegram.org/file/bot{settings.bot_token}/{file_path}"
    except Exception as exc:
        logger.warning("Failed to fetch avatar for %s: %s", telegram_id, exc)
        return None


async def prepare_lobby_share(
    user_id: int,
    share_url: str,
    invite_code: str,
    game_type: str | None = None,
) -> str | None:
    """Mini Apps 2.0 — prepared message для shareMessage (вибір контактів)."""
    application = get_bot_application()
    if not application:
        return None

    label = game_share_label(game_type)

    try:
        result = InlineQueryResultArticle(
            id=f"lobby_{invite_code}"[:64],
            title=f"{label} — грати разом",
            description="Запроси друга в партію",
            input_message_content=InputTextMessageContent(
                message_text=_invite_message(game_type),
            ),
            reply_markup=_play_markup(invite_code),
        )
        prepared = await application.bot.save_prepared_inline_message(
            user_id=user_id,
            result=result,
            allow_user_chats=True,
            allow_group_chats=True,
        )
        return prepared.id
    except Exception as exc:
        logger.warning("prepare_lobby_share failed: %s", exc)
        return None
