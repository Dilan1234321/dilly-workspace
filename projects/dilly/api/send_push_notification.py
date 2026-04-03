"""Push delivery via FCM (Android) and APNS (iOS)."""

from __future__ import annotations

import json
import os
from typing import Any

from projects.dilly.api.notification_store import get_push_token


def _parse_token(raw_token: str) -> tuple[str, str]:
    token = (raw_token or "").strip()
    if not token:
        return ("", "")
    if ":" in token:
        prefix, value = token.split(":", 1)
        platform = prefix.strip().lower()
        if platform in {"fcm", "apns"}:
            return (platform, value.strip())
    # If no explicit prefix, default to FCM token.
    return ("fcm", token)


def _send_fcm(token: str, message: str, data: dict[str, str]) -> None:
    try:
        import firebase_admin
        from firebase_admin import credentials, messaging
    except ImportError as exc:
        raise RuntimeError("firebase-admin is not installed.") from exc

    if not firebase_admin._apps:
        creds_path = (os.environ.get("FIREBASE_CREDENTIALS_PATH") or "").strip()
        creds_json = (os.environ.get("FIREBASE_CREDENTIALS_JSON") or "").strip()
        if creds_json:
            cert = credentials.Certificate(json.loads(creds_json))
            firebase_admin.initialize_app(cert)
        elif creds_path:
            cert = credentials.Certificate(creds_path)
            firebase_admin.initialize_app(cert)
        else:
            firebase_admin.initialize_app()

    payload = messaging.Message(
        token=token,
        notification=messaging.Notification(title=message, body=message),
        data=data,
    )
    messaging.send(payload)


def _send_apns(token: str, message: str, data: dict[str, str]) -> None:
    try:
        from apns2.client import APNsClient
        from apns2.credentials import TokenCredentials
        from apns2.payload import Payload
    except ImportError as exc:
        raise RuntimeError("apns2 is not installed.") from exc

    key_path = (os.environ.get("APNS_AUTH_KEY_PATH") or "").strip()
    key_id = (os.environ.get("APNS_KEY_ID") or "").strip()
    team_id = (os.environ.get("APNS_TEAM_ID") or "").strip()
    bundle_id = (os.environ.get("APNS_BUNDLE_ID") or "").strip()
    use_sandbox = (os.environ.get("APNS_USE_SANDBOX") or "false").strip().lower() == "true"
    if not (key_path and key_id and team_id and bundle_id):
        raise RuntimeError("APNS environment is not fully configured.")

    credentials = TokenCredentials(auth_key_path=key_path, auth_key_id=key_id, team_id=team_id)
    client = APNsClient(credentials=credentials, use_sandbox=use_sandbox)
    payload = Payload(alert=message, sound="default", custom=data)
    client.send_notification(token, payload, topic=bundle_id)


def send_push_notification(uid: str, message: str, payload: dict[str, Any]) -> bool:
    """
    Send push notification for user.
    Returns True on success, False on skipped (e.g., no push token).
    Raises on transport failures.
    """
    push_token = get_push_token(uid)
    if not push_token:
        return False

    platform, token_value = _parse_token(push_token)
    if not token_value:
        return False

    data = {
        "trigger_id": str(payload.get("trigger_id") or ""),
        "deep_link": str(payload.get("deep_link") or "/dashboard"),
    }
    if payload.get("notification_id"):
        data["notification_id"] = str(payload.get("notification_id"))

    if platform == "apns":
        _send_apns(token_value, message, data)
    else:
        _send_fcm(token_value, message, data)
    return True

