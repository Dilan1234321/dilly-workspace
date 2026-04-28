"""
Apple Wallet (PassKit) — Career Identity pass.

Generates a signed .pkpass file containing the user's Dilly career
identity (top profile facts, tier, streak). The pass shows on the
lock screen + Wallet app + can be shared via NFC/scan.

Setup (one-time, in Apple Developer portal):
  1. Identifiers → Pass Type IDs → register `pass.com.dilly.app.career`
  2. Edit it → Create Certificate → upload a CSR → download the .cer
  3. Convert: `openssl x509 -in pass.cer -inform DER -out pass.pem`
  4. Export the private key from Keychain as .p12, then:
     `openssl pkcs12 -in pass.p12 -nocerts -out pass.key.pem -nodes`
     `openssl pkcs12 -in pass.p12 -clcerts -nokeys -out pass.cert.pem`
  5. Download the Apple WWDR G4 intermediate cert from
     https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
     `openssl x509 -in AppleWWDRCAG4.cer -inform DER -out wwdr.pem`

Required Railway env vars:
  WALLET_PASS_TYPE_ID = pass.com.dilly.app.career
  WALLET_TEAM_ID       = F46NQK75DK
  WALLET_CERT_PEM      = (paste full PEM of pass.cert.pem)
  WALLET_KEY_PEM       = (paste full PEM of pass.key.pem)
  WALLET_WWDR_PEM      = (paste full PEM of wwdr.pem)
  WALLET_KEY_PASSWORD  = (optional, only if the key is encrypted)

If any of these are missing, GET /wallet/career-pass returns 503 with
a clear setup message — safe to deploy before the certs are in place.

Endpoints:
  GET  /wallet/career-pass             → returns the .pkpass file
  GET  /wallet/career-pass/url         → returns { url, serial } so
                                         the mobile module can fetch
  GET  /wallet/v1/passes/{ptype}/{serial}        → updated pass (iOS)
  POST /wallet/v1/devices/{did}/registrations/{ptype}/{serial} → register
  DELETE /wallet/v1/devices/{did}/registrations/{ptype}/{serial} → unregister
  POST /wallet/v1/log                   → device log endpoint
"""

import datetime
import hashlib
import io
import json
import os
import pathlib
import zipfile
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import StreamingResponse, JSONResponse

from projects.dilly.api import deps


router = APIRouter(tags=["wallet"])


# ─── Cert loading (lazy + cached) ────────────────────────────────────

_CERT_CACHE: Dict[str, Any] = {}


def _is_configured() -> bool:
    return all(
        bool(os.environ.get(k))
        for k in ("WALLET_PASS_TYPE_ID", "WALLET_TEAM_ID", "WALLET_CERT_PEM", "WALLET_KEY_PEM", "WALLET_WWDR_PEM")
    )


def _load_certs() -> Dict[str, Any]:
    """Parse env-provided PEMs once. Returns dict with cert/key/wwdr
    objects from `cryptography`. Raises HTTPException(503) if any are
    missing or malformed."""
    if _CERT_CACHE:
        return _CERT_CACHE
    if not _is_configured():
        raise HTTPException(
            status_code=503,
            detail="Wallet pass signing is not configured. Set WALLET_PASS_TYPE_ID, WALLET_TEAM_ID, WALLET_CERT_PEM, WALLET_KEY_PEM, WALLET_WWDR_PEM.",
        )
    try:
        from cryptography import x509
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.serialization import pkcs12
    except Exception as e:  # pragma: no cover
        raise HTTPException(503, f"cryptography lib unavailable: {e}")

    cert_pem = os.environ["WALLET_CERT_PEM"].encode()
    key_pem = os.environ["WALLET_KEY_PEM"].encode()
    wwdr_pem = os.environ["WALLET_WWDR_PEM"].encode()
    key_password = os.environ.get("WALLET_KEY_PASSWORD")
    key_password_b = key_password.encode() if key_password else None

    cert = x509.load_pem_x509_certificate(cert_pem)
    wwdr = x509.load_pem_x509_certificate(wwdr_pem)
    key = serialization.load_pem_private_key(key_pem, password=key_password_b)

    _CERT_CACHE.update({"cert": cert, "key": key, "wwdr": wwdr})
    return _CERT_CACHE


def _sign_manifest(manifest_bytes: bytes) -> bytes:
    """Build a PKCS#7 detached DER signature over manifest.json."""
    certs = _load_certs()
    from cryptography.hazmat.primitives.serialization import pkcs7, Encoding
    from cryptography.hazmat.primitives import hashes

    builder = (
        pkcs7.PKCS7SignatureBuilder()
        .set_data(manifest_bytes)
        .add_signer(certs["cert"], certs["key"], hashes.SHA256())
        .add_certificate(certs["wwdr"])
    )
    options = [pkcs7.PKCS7Options.DetachedSignature, pkcs7.PKCS7Options.Binary]
    return builder.sign(encoding=Encoding.DER, options=options)


# ─── Asset loading ───────────────────────────────────────────────────

_ASSETS_DIR = pathlib.Path(__file__).resolve().parent.parent / "wallet_assets"


def _load_asset(name: str) -> Optional[bytes]:
    path = _ASSETS_DIR / name
    if not path.exists():
        return None
    return path.read_bytes()


# ─── Pass content ────────────────────────────────────────────────────


def _build_pass_json(
    identity: str,
    serial: str,
    name: str,
    headline: str,
    facts: List[Dict[str, str]],
    tier: str,
) -> Dict[str, Any]:
    """Build the pass.json structure for a generic Career Identity pass."""
    pass_type_id = os.environ["WALLET_PASS_TYPE_ID"]
    team_id = os.environ["WALLET_TEAM_ID"]
    web_service_url = os.environ.get("WALLET_WEB_SERVICE_URL", "https://api.dilly.app/wallet")
    auth_token = hashlib.sha256(f"{identity}:{serial}:wallet".encode()).hexdigest()[:32]

    primary = [{"key": "name", "label": name.split()[0] if name else "Member", "value": headline or "Career identity"}]
    secondary = []
    auxiliary = []
    for i, f in enumerate(facts[:4]):
        target = secondary if i < 2 else auxiliary
        target.append({
            "key": f"fact{i}",
            "label": f.get("label", "")[:40],
            "value": f.get("value", "")[:80],
        })

    back = [
        {"key": "tier", "label": "Tier", "value": tier or "Member"},
        {"key": "issued", "label": "Issued", "value": datetime.date.today().isoformat()},
        {"key": "about", "label": "About", "value": "Your Dilly Career Identity. Refresh anytime by opening Dilly. dilly.app"},
    ]

    return {
        "formatVersion": 1,
        "passTypeIdentifier": pass_type_id,
        "teamIdentifier": team_id,
        "serialNumber": serial,
        "organizationName": "Dilly",
        "description": "Dilly Career Identity",
        "logoText": "Dilly",
        "foregroundColor": "rgb(255, 255, 255)",
        "backgroundColor": "rgb(43, 58, 142)",
        "labelColor": "rgb(220, 224, 245)",
        "webServiceURL": web_service_url,
        "authenticationToken": auth_token,
        "generic": {
            "primaryFields": primary,
            "secondaryFields": secondary,
            "auxiliaryFields": auxiliary,
            "backFields": back,
        },
        "barcodes": [{
            "format": "PKBarcodeFormatQR",
            "message": f"https://dilly.app/p/{serial}",
            "messageEncoding": "iso-8859-1",
            "altText": "dilly.app",
        }],
    }


def _build_pkpass(pass_json: Dict[str, Any]) -> bytes:
    """Bundle pass.json + manifest + signature + assets into a .pkpass zip."""
    files: Dict[str, bytes] = {"pass.json": json.dumps(pass_json, separators=(",", ":")).encode()}

    # Required: icon.png + icon@2x.png. Recommended: logo + logo@2x.
    for asset in ("icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png", "logo@3x.png"):
        data = _load_asset(asset)
        if data:
            files[asset] = data

    if "icon.png" not in files:
        raise HTTPException(500, f"Wallet asset icon.png missing at {_ASSETS_DIR}. Add 29x29 + 58x58 PNGs.")

    # Manifest: SHA-1 of every file.
    manifest = {name: hashlib.sha1(content).hexdigest() for name, content in files.items()}
    manifest_bytes = json.dumps(manifest, separators=(",", ":")).encode()
    files["manifest.json"] = manifest_bytes
    files["signature"] = _sign_manifest(manifest_bytes)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, content in files.items():
            z.writestr(name, content)
    return buf.getvalue()


# ─── User → pass content ─────────────────────────────────────────────


def _facts_from_profile(profile: Dict[str, Any]) -> List[Dict[str, str]]:
    """Pick a small, brag-worthy slice of profile facts for the pass."""
    out: List[Dict[str, str]] = []
    if profile.get("name"):
        out.append({"label": "Name", "value": str(profile["name"])})
    if profile.get("school") or profile.get("college"):
        out.append({"label": "School", "value": str(profile.get("school") or profile.get("college"))})
    if profile.get("major"):
        out.append({"label": "Major", "value": str(profile["major"])})
    if profile.get("track") or profile.get("target"):
        out.append({"label": "Track", "value": str(profile.get("track") or profile.get("target"))})
    return out


# ─── Endpoints ───────────────────────────────────────────────────────


@router.get("/wallet/career-pass")
def get_career_pass(request: Request):
    """Return the .pkpass file directly. Mobile wraps the URL with
    PKAddPassesViewController."""
    user = deps.require_auth(request)
    email = (user.get("email") or "").strip().lower()
    profile = _fetch_profile(email)
    serial = _serial_for(email)
    pass_json = _build_pass_json(
        identity=email,
        serial=serial,
        name=profile.get("name") or "Member",
        headline=profile.get("tagline") or "Career identity",
        facts=_facts_from_profile(profile),
        tier=str(profile.get("tier") or "Member"),
    )
    blob = _build_pkpass(pass_json)
    return Response(
        content=blob,
        media_type="application/vnd.apple.pkpass",
        headers={"Content-Disposition": f'attachment; filename="dilly-{serial}.pkpass"'},
    )


@router.get("/wallet/career-pass/url")
def get_career_pass_url(request: Request):
    """Return a URL the mobile module can fetch + add."""
    user = deps.require_auth(request)
    if not _is_configured():
        return JSONResponse(
            status_code=503,
            content={"error": "wallet_unconfigured", "message": "Wallet pass signing is not configured."},
        )
    email = (user.get("email") or "").strip().lower()
    # Prefer env override but fall back to inferring from the incoming
    # request — earlier the default was the wrong hostname (api.dilly.app
    # instead of api.trydilly.com), causing the iOS Wallet downloader
    # to error with DNS-not-found. Inferring from request is correct
    # because the mobile app already hit the right host to get here.
    base = (os.environ.get("WALLET_PUBLIC_BASE_URL") or "").strip().rstrip("/")
    if not base:
        # Try the Host header first — that's what the client used to
        # reach us. request.url.netloc is unreliable behind a proxy
        # (Railway etc.) where it may resolve to an internal hostname.
        host = (request.headers.get("host") or "").strip()
        if host:
            scheme = (request.headers.get("x-forwarded-proto") or "https").split(",")[0].strip()
            base = f"{scheme}://{host}"
        else:
            # Final fallback to the production hostname.
            base = "https://api.trydilly.com"
    return {
        "url": f"{base}/wallet/career-pass",
        "serial": _serial_for(email),
        "pass_type_id": os.environ.get("WALLET_PASS_TYPE_ID"),
    }


def _serial_for(email: str) -> str:
    """Stable per-user serial. Hash so the email isn't exposed."""
    h = hashlib.sha256(email.encode()).hexdigest()[:12]
    return f"u-{h}-v1"


# ─── webServiceURL endpoints (PassKit polling) ───────────────────────
# These are skeletons. Full implementation requires a passes_devices
# table to track registrations, which we'll add when push refresh
# becomes important. Returning the right HTTP codes keeps iOS quiet.


@router.post("/wallet/v1/devices/{device_id}/registrations/{pass_type_id}/{serial}")
def register_device(device_id: str, pass_type_id: str, serial: str):
    return Response(status_code=201)


@router.delete("/wallet/v1/devices/{device_id}/registrations/{pass_type_id}/{serial}")
def unregister_device(device_id: str, pass_type_id: str, serial: str):
    return Response(status_code=200)


@router.get("/wallet/v1/devices/{device_id}/registrations/{pass_type_id}")
def list_updates(device_id: str, pass_type_id: str):
    # No updates yet → 204 keeps the device quiet.
    return Response(status_code=204)


@router.get("/wallet/v1/passes/{pass_type_id}/{serial}")
def get_updated_pass(pass_type_id: str, serial: str):
    # 304 = no changes since last fetch.
    return Response(status_code=304)


@router.post("/wallet/v1/log")
async def device_log(request: Request):
    # Device-side error log. Swallow.
    try:
        await request.body()
    except Exception:
        pass
    return Response(status_code=200)


# ─── Helpers ─────────────────────────────────────────────────────────


def _fetch_profile(email: str) -> Dict[str, Any]:
    """Pull the user's profile fields needed for the pass."""
    try:
        from projects.dilly.api.profile_store import get_profile
        row = get_profile(email) or {}
        plan = (row.get("plan") or "starter").lower().strip()
        return {
            "name": row.get("name") or row.get("full_name") or row.get("display_name"),
            "school": row.get("school") or row.get("college"),
            "major": row.get("major"),
            "track": row.get("track") or row.get("target"),
            "tier": "Pro" if plan in ("dilly", "pro") else "Member",
            "tagline": row.get("tagline") or "Career identity",
        }
    except Exception:
        return {"name": "Member", "tier": "Member", "tagline": "Career identity"}
