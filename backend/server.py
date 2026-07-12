"""
Tandem backend — Supabase edition.
The frontend talks to Supabase Auth directly for signup/login. For each API
call it sends the Supabase access token in the Authorization header. This
backend verifies the token via Supabase JWKS (ES256/RS256) or legacy
SUPABASE_JWT_SECRET (HS256), then performs all DB
operations using the service-role client (which bypasses RLS) but explicitly
scopes every query by the verified user id.
"""

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import RedirectResponse, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
import os
import logging
import secrets
import string
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import jwt as pyjwt
from jwt import PyJWKClient
from supabase import create_client, Client
import anthropic
import firebase_admin
from firebase_admin import credentials, messaging
import json
import re

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
load_dotenv(ROOT_DIR.parent / '.env')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_SERVICE_ROLE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
SUPABASE_JWT_SECRET = os.environ['SUPABASE_JWT_SECRET']
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID', '')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY', '')
AWS_REGION = os.environ.get('AWS_REGION', 'us-west-2')
FIREBASE_SERVICE_ACCOUNT_KEY = os.environ.get('FIREBASE_SERVICE_ACCOUNT_KEY', '')
FIREBASE_SERVICE_ACCOUNT_KEY_PATH = os.environ.get('FIREBASE_SERVICE_ACCOUNT_KEY_PATH', '')
FIREBASE_PROJECT_ID = os.environ.get('FIREBASE_PROJECT_ID', '')


def _load_firebase_service_account() -> Optional[dict]:
    if FIREBASE_SERVICE_ACCOUNT_KEY:
        return json.loads(FIREBASE_SERVICE_ACCOUNT_KEY)
    key_path = FIREBASE_SERVICE_ACCOUNT_KEY_PATH
    if not key_path:
        default = ROOT_DIR / 'firebase-service-account.json'
        if default.exists():
            key_path = str(default)
    if key_path:
        path = Path(key_path)
        if not path.is_absolute():
            path = (ROOT_DIR.parent / path).resolve() if not (ROOT_DIR / path).exists() else (ROOT_DIR / path).resolve()
        return json.loads(path.read_text())
    return None


sb: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
_jwks_client = PyJWKClient(f"{SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json", cache_keys=True)

MEDIA_BUCKET = "list-media"
SIGNED_URL_TTL = 60 * 60 * 24 * 7  # 7 days
QUOTE_TZ = ZoneInfo("America/Los_Angeles")

# Firebase Admin init
if not firebase_admin._apps:
    try:
        _sa = _load_firebase_service_account()
        if _sa:
            firebase_admin.initialize_app(credentials.Certificate(_sa))
            logger.info("Firebase initialized OK")
        else:
            logger.warning("Firebase NOT initialized — no service account key found (push notifications disabled)")
    except Exception as _e:
        logger.warning(f"Firebase init failed: {_e}")

app = FastAPI()
api_router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)



def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def today_quote_date() -> str:
    """Quote cache key — rolls over at midnight Pacific time."""
    return datetime.now(QUOTE_TZ).strftime("%Y-%m-%d")


def _first_name(user: dict) -> str:
    """Derive a friendly first name from username or email."""
    raw = (user.get("username") or user.get("email") or "friend").split("@")[0]
    for sep in ("_", ".", "-", " "):
        if sep in raw:
            raw = raw.split(sep)[0]
            break
    name = raw.strip()
    if not name:
        return "Friend"
    return name[0].upper() + name[1:].lower() if len(name) > 1 else name.upper()


def iso(dt: datetime) -> str:
    return dt.isoformat()


def gen_code(n=6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(n))


async def send_push(recipients: List[str], data: dict, idempotency_key: Optional[str] = None) -> None:
    if not recipients or not data.get("title") or not data.get("message"):
        return
    if not firebase_admin._apps:
        logger.warning("Firebase not initialized — skipping push")
        return
    try:
        rows = sb.table("push_tokens").select("device_token").in_("user_id", recipients).execute().data or []
        tokens = [r["device_token"] for r in rows if r.get("device_token")]
        logger.info(f"[push-debug] send_push: recipients={recipients} tokens_found={len(tokens)}")
        if not tokens:
            logger.warning(f"[push-debug] no push tokens found for recipients={recipients}")
            return
        notification = messaging.Notification(title=data["title"], body=data["message"])
        msgs = [
            messaging.Message(
                notification=notification,
                data={"action_url": data.get("action_url", "")},
                token=token,
            )
            for token in tokens
        ]
        result = messaging.send_each(msgs)
        if result.failure_count:
            # Log error codes and purge invalid tokens so they don't block future pushes
            failed_tokens = []
            for i, resp in enumerate(result.responses):
                if not resp.success:
                    err = resp.exception
                    logger.warning(f"Push failed for token[{i}]: {err}")
                    # registration-not-found and invalid-registration = stale token, safe to delete
                    if hasattr(err, 'code') and err.code in (
                        'registration-token-not-registered',
                        'invalid-registration-token',
                        'messaging/registration-token-not-registered',
                        'messaging/invalid-registration-token',
                    ):
                        failed_tokens.append(tokens[i])
            if failed_tokens:
                sb.table("push_tokens").delete().in_("device_token", failed_tokens).execute()
                logger.info(f"Purged {len(failed_tokens)} stale push token(s)")
    except Exception as e:
        logger.warning(f"Push notification failed (non-blocking): {e}")


def _decode_supabase_jwt(token: str) -> dict:
    """Verify Supabase access tokens (ES256/RS256 via JWKS, or legacy HS256)."""
    decode_opts = {"verify_aud": False}
    header = pyjwt.get_unverified_header(token)
    alg = header.get("alg", "HS256")
    if alg in ("ES256", "RS256"):
        key = _jwks_client.get_signing_key_from_jwt(token).key
        return pyjwt.decode(token, key, algorithms=[alg], options=decode_opts)
    return pyjwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], options=decode_opts)


async def current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = _decode_supabase_jwt(creds.credentials)
        uid = payload.get("sub")
        email = payload.get("email")
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    # Ensure a profile row exists (the auth trigger should have created it).
    res = sb.table("profiles").select("*").eq("id", uid).limit(1).execute()
    if res.data:
        return res.data[0]
    # Fallback: trigger missed; create one ourselves.
    username = (email or "user").split("@")[0]
    sb.table("profiles").upsert({"id": uid, "email": email, "username": username}).execute()
    sb.table("routines").upsert({"user_id": uid, "steps": []}).execute()
    res = sb.table("profiles").select("*").eq("id", uid).limit(1).execute()
    return res.data[0] if res.data else {"id": uid, "email": email, "username": username, "partner_id": None}


def _accessible_user_ids(user: dict) -> List[str]:
    ids = [user["id"]]
    if user.get("partner_id"):
        ids.append(user["partner_id"])
    return ids


def _is_storage_path(uri: str) -> bool:
    return bool(uri) and not uri.startswith(("http://", "https://", "file://", "ph://", "content://"))


def _signed_media_url(path: str) -> str:
    try:
        res = sb.storage.from_(MEDIA_BUCKET).create_signed_url(path, SIGNED_URL_TTL)
        if isinstance(res, dict):
            return res.get("signedURL") or res.get("signedUrl") or ""
        return ""
    except Exception as e:
        logger.warning(f"Signed URL failed for {path}: {e}")
        return ""


def _resolve_media_uri(uri: Optional[str]) -> Optional[str]:
    if not uri:
        return None
    if _is_storage_path(uri):
        return _signed_media_url(uri) or uri
    return uri


def _resolve_items_media(items: list) -> None:
    for it in items:
        if it.get("media_uri"):
            it["media_uri"] = _resolve_media_uri(it["media_uri"])


# ======================= MODELS =======================
class ListCreate(BaseModel):
    name: str
    type: Literal["todo", "grocery", "chores", "custom"]
    custom_label: Optional[str] = None
    share_with_partner: bool = False


class ListUpdate(BaseModel):
    name: Optional[str] = None
    custom_label: Optional[str] = None
    share_with_partner: Optional[bool] = None


class ParseNaturalLanguageReq(BaseModel):
    text: str
    list_id: Optional[str] = None


class ParsedNLItem(BaseModel):
    text: str
    qty: Optional[str] = None


class Recurrence(BaseModel):
    type: Literal["none", "daily", "weekly", "monthly", "yearly"] = "none"
    weekdays: Optional[List[int]] = None
    interval: Optional[int] = 1
    end_date: Optional[str] = None


class ItemCreate(BaseModel):
    text: str
    qty: Optional[str] = None
    assignee_id: Optional[str] = None
    due_at: Optional[str] = None
    remind_minutes_before: Optional[int] = None
    recurrence: Optional[Recurrence] = None
    kind: Optional[Literal["text", "link", "video", "image"]] = "text"
    url: Optional[str] = None
    media_uri: Optional[str] = None


class ItemUpdate(BaseModel):
    text: Optional[str] = None
    qty: Optional[str] = None
    done: Optional[bool] = None
    assignee_id: Optional[str] = None
    due_at: Optional[str] = None
    remind_minutes_before: Optional[int] = None
    clear_due: Optional[bool] = None
    recurrence: Optional[Recurrence] = None
    kind: Optional[Literal["text", "link", "video", "image"]] = None
    url: Optional[str] = None
    media_uri: Optional[str] = None


class ShareReq(BaseModel):
    username_or_email: str


class InviteAcceptReq(BaseModel):
    code: str


class ThoughtCreate(BaseModel):
    text: str
    mood: Optional[str] = None
    share_with_partner: bool = False


class ThoughtUpdate(BaseModel):
    text: Optional[str] = None
    mood: Optional[str] = None
    share_with_partner: Optional[bool] = None


class JournalCreate(BaseModel):
    title: str
    body: str
    mood: Optional[str] = None
    share_with_partner: bool = False


class JournalUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    mood: Optional[str] = None
    share_with_partner: Optional[bool] = None


class RoutineStep(BaseModel):
    id: str = Field(default_factory=lambda: secrets.token_hex(8))
    text: str
    order: int = 0


class RoutineUpdate(BaseModel):
    steps: List[RoutineStep]


class RoutineCheckReq(BaseModel):
    step_id: str
    date: str


class EventCreate(BaseModel):
    title: str
    date: str
    time: Optional[str] = None
    notes: Optional[str] = None
    location: Optional[str] = None
    remind_minutes_before: Optional[int] = None
    share_with_partner: bool = False
    recurrence: Optional[Recurrence] = None


class EventUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    notes: Optional[str] = None
    location: Optional[str] = None
    remind_minutes_before: Optional[int] = None
    share_with_partner: Optional[bool] = None
    recurrence: Optional[Recurrence] = None


class ProfileUpdate(BaseModel):
    birthday: Optional[str] = None
    anniversary: Optional[str] = None
    clear_birthday: Optional[bool] = None
    clear_anniversary: Optional[bool] = None


class RegisterPushReq(BaseModel):
    platform: str
    device_token: str


class DateNightPlanReq(BaseModel):
    budget: str
    vibe: str
    location: str


class CommentCreate(BaseModel):
    body: str


# ======================= AUTH (Supabase-managed) =======================
@api_router.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return user


@api_router.patch("/profile")
async def update_profile(req: ProfileUpdate, user: dict = Depends(current_user)):
    payload: dict = {}
    if req.clear_birthday:
        payload["birthday"] = None
    elif req.birthday is not None:
        payload["birthday"] = req.birthday
    if req.clear_anniversary:
        payload["anniversary"] = None
    elif req.anniversary is not None:
        payload["anniversary"] = req.anniversary
    if payload:
        sb.table("profiles").update(payload).eq("id", user["id"]).execute()
    return sb.table("profiles").select("*").eq("id", user["id"]).limit(1).execute().data[0]


# ======================= CONNECTIONS =======================
@api_router.get("/connection")
async def get_connection(user: dict = Depends(current_user)):
    pid = user.get("partner_id")
    if not pid:
        return {"partner": None}
    res = sb.table("profiles").select("id,username,email,birthday,anniversary").eq("id", pid).limit(1).execute()
    return {"partner": res.data[0] if res.data else None}


@api_router.post("/connection/invite-user")
async def invite_user(req: ShareReq, user: dict = Depends(current_user)):
    if user.get("partner_id"):
        raise HTTPException(400, "Already connected to a partner")
    q = req.username_or_email.strip()
    res = sb.table("profiles").select("*").or_(f"email.eq.{q.lower()},username.eq.{q}").limit(1).execute()
    other = res.data[0] if res.data else None
    if not other:
        raise HTTPException(404, "User not found")
    if other["id"] == user["id"]:
        raise HTTPException(400, "Cannot connect to yourself")
    if other.get("partner_id"):
        raise HTTPException(400, "User is already connected to someone")
    sb.table("profiles").update({"partner_id": other["id"]}).eq("id", user["id"]).execute()
    sb.table("profiles").update({"partner_id": user["id"]}).eq("id", other["id"]).execute()
    return {"partner": {"id": other["id"], "username": other["username"], "email": other.get("email")}}


@api_router.post("/connection/code")
async def create_invite_code(user: dict = Depends(current_user)):
    if user.get("partner_id"):
        raise HTTPException(400, "Already connected to a partner")
    code = gen_code(6)
    while sb.table("invites").select("code").eq("code", code).eq("used", False).execute().data:
        code = gen_code(6)
    expires = iso(now_utc() + timedelta(days=7))
    sb.table("invites").insert({
        "code": code, "created_by": user["id"], "expires_at": expires, "used": False,
    }).execute()
    return {"code": code, "expires_at": expires}


@api_router.post("/connection/accept-code")
async def accept_invite(req: InviteAcceptReq, user: dict = Depends(current_user)):
    if user.get("partner_id"):
        raise HTTPException(400, "Already connected to a partner")
    code = req.code.strip().upper()
    res = sb.table("invites").select("*").eq("code", code).eq("used", False).limit(1).execute()
    invite = res.data[0] if res.data else None
    if not invite:
        raise HTTPException(404, "Invalid or used code")
    if invite["created_by"] == user["id"]:
        raise HTTPException(400, "Cannot accept your own code")
    creator_res = sb.table("profiles").select("*").eq("id", invite["created_by"]).limit(1).execute()
    creator = creator_res.data[0] if creator_res.data else None
    if not creator:
        raise HTTPException(404, "Inviter no longer exists")
    if creator.get("partner_id"):
        raise HTTPException(400, "Inviter is already connected")
    sb.table("profiles").update({"partner_id": creator["id"]}).eq("id", user["id"]).execute()
    sb.table("profiles").update({"partner_id": user["id"]}).eq("id", creator["id"]).execute()
    sb.table("invites").update({"used": True, "used_by": user["id"]}).eq("id", invite["id"]).execute()
    return {"partner": {"id": creator["id"], "username": creator["username"], "email": creator.get("email")}}


@api_router.post("/connection/disconnect")
async def disconnect(user: dict = Depends(current_user)):
    pid = user.get("partner_id")
    if pid:
        sb.table("profiles").update({"partner_id": None}).eq("id", pid).execute()
    sb.table("profiles").update({"partner_id": None}).eq("id", user["id"]).execute()
    return {"ok": True}


# ======================= LISTS =======================
@api_router.get("/lists")
async def get_lists(type: Optional[str] = None, user: dict = Depends(current_user)):
    q = sb.table("lists").select("*").eq("owner_id", user["id"]).order("created_at", desc=True)
    if type:
        q = q.eq("type", type)
    lists = q.execute().data or []
    if user.get("partner_id"):
        pq = sb.table("lists").select("*").eq("owner_id", user["partner_id"]).contains("shared_with", [user["id"]]).order("created_at", desc=True)
        if type:
            pq = pq.eq("type", type)
        seen = {l["id"] for l in lists}
        for l in pq.execute().data or []:
            if l["id"] not in seen:
                lists.append(l)
                seen.add(l["id"])
    list_ids = [l["id"] for l in lists]
    counts: dict = {}
    if list_ids:
        all_items = sb.table("list_items").select("list_id,done").in_("list_id", list_ids).execute().data or []
        for it in all_items:
            t, d = counts.get(it["list_id"], (0, 0))
            counts[it["list_id"]] = (t + 1, d + (1 if it.get("done") else 0))
    for l in lists:
        total, done = counts.get(l["id"], (0, 0))
        l["item_count"] = total
        l["done_count"] = done
    return lists


def _extract_json_object(raw: str) -> Optional[dict]:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", raw)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    return None


def _normalize_parsed_list(data: dict, existing_type: Optional[str] = None) -> dict:
    list_type = data.get("type") or existing_type or "todo"
    if list_type not in ("todo", "grocery", "chores", "custom"):
        list_type = existing_type or "todo"
    if existing_type:
        list_type = existing_type

    items_raw = data.get("items") or []
    items: list = []
    if isinstance(items_raw, list):
        for it in items_raw:
            if isinstance(it, str):
                text = it.strip()
                if text:
                    items.append({"text": text[:200], "qty": None})
            elif isinstance(it, dict):
                text = str(it.get("text") or "").strip()
                if text:
                    qty = it.get("qty")
                    items.append({
                        "text": text[:200],
                        "qty": str(qty).strip()[:40] if qty else None,
                    })

    custom_label = data.get("custom_label")
    if list_type == "custom":
        custom_label = (str(custom_label).strip()[:40] if custom_label else None) or "Custom"
    else:
        custom_label = None

    list_name = str(data.get("list_name") or "").strip()[:80] or None

    return {
        "list_name": list_name,
        "type": list_type,
        "custom_label": custom_label,
        "items": items,
    }


def _parse_nl_heuristic(text: str, existing_type: Optional[str] = None) -> dict:
    lower = text.lower()
    list_type = existing_type or "todo"
    custom_label = None
    list_name = None

    if not existing_type:
        if any(w in lower for w in ("grocery", "groceries", "shopping list", "buy at")):
            list_type = "grocery"
            list_name = "Groceries"
        elif any(w in lower for w in ("chore", "chores", "cleaning", "housework")):
            list_type = "chores"
            list_name = "Chores"
        elif "weekend" in lower and "todo" not in lower:
            list_type = "todo"
            list_name = "Weekend to-dos"

    cleaned = text.strip()
    cleaned = re.sub(r"^(please\s+)?(add|put|include)\s+", "", cleaned, flags=re.I)
    parts = re.split(r"[,;\n]+|\band\b", cleaned, flags=re.I)
    items: list = []
    for part in parts:
        chunk = part.strip()
        chunk = re.sub(r"^(to\s+)?(my\s+)?(the\s+)?(\w+\s+list\s*)", "", chunk, flags=re.I).strip()
        chunk = re.sub(r"^(add|get|pick up|buy)\s+", "", chunk, flags=re.I).strip()
        if len(chunk) >= 2 and chunk.lower() not in ("todo", "grocery", "chores"):
            items.append({"text": chunk[:200], "qty": None})

    return _normalize_parsed_list({
        "list_name": list_name,
        "type": list_type,
        "custom_label": custom_label,
        "items": items,
    }, existing_type=existing_type)


async def _parse_nl_with_ai(
    text: str,
    existing_type: Optional[str] = None,
    existing_name: Optional[str] = None,
) -> Optional[dict]:
    if not AWS_ACCESS_KEY_ID or not AWS_SECRET_ACCESS_KEY:
        return None
    context = ""
    if existing_type and existing_name:
        context = (
            f"The user is adding items to an existing list named \"{existing_name}\" "
            f"(type: {existing_type}). Infer ONLY items; set type to \"{existing_type}\"."
        )
    else:
        context = (
            "Infer list_name, type (todo|grocery|chores|custom), optional custom_label when type is custom, "
            "and items array."
        )
    try:
        ac = anthropic.AsyncAnthropicBedrock(
            aws_access_key=AWS_ACCESS_KEY_ID,
            aws_secret_key=AWS_SECRET_ACCESS_KEY,
            aws_region=AWS_REGION,
        )
        response = await ac.messages.create(
            model="arn:aws:bedrock:us-west-2:598451516178:inference-profile/global.anthropic.claude-sonnet-4-6",
            max_tokens=512,
            system=(
                "You parse natural language into structured list data for a couple companion app. "
                f"{context} "
                "Return ONLY valid JSON (no markdown) with this shape:\n"
                '{"list_name":"string or null","type":"todo|grocery|chores|custom",'
                '"custom_label":"string or null","items":[{"text":"string","qty":"string or null"}]}\n'
                "Rules: split compound requests into separate items; grocery items may include qty; "
                "ignore filler words; max 30 items."
            ),
            messages=[{"role": "user", "content": text.strip()[:2000]}],
        )
        full = response.content[0].text.strip() if response.content else ""
        parsed = _extract_json_object(full)
        if not parsed:
            return None
        return _normalize_parsed_list(parsed, existing_type=existing_type)
    except Exception as e:
        logger.warning(f"NL list parse AI failed: {e}")
        return None


@api_router.post("/lists/parse-natural-language")
async def parse_natural_language_list(req: ParseNaturalLanguageReq, user: dict = Depends(current_user)):
    text = req.text.strip()
    if not text:
        raise HTTPException(400, "Text is required")
    if len(text) > 2000:
        raise HTTPException(400, "Text too long (max 2000 characters)")

    existing_type: Optional[str] = None
    existing_name: Optional[str] = None
    if req.list_id:
        lst = _get_accessible_list(req.list_id, user)
        if not lst:
            raise HTTPException(404, "List not found")
        existing_type = lst.get("type")
        existing_name = lst.get("name")

    parsed = await _parse_nl_with_ai(text, existing_type, existing_name)
    used_ai = parsed is not None
    if not parsed:
        parsed = _parse_nl_heuristic(text, existing_type)

    if not parsed["items"]:
        raise HTTPException(400, "Could not find any list items in that text")

    parsed["used_ai"] = used_ai
    return parsed


@api_router.post("/lists")
async def create_list(req: ListCreate, user: dict = Depends(current_user)):
    payload = {
        "owner_id": user["id"],
        "name": req.name.strip()[:80] or "Untitled",
        "type": req.type,
        "shared_with": [user["partner_id"]] if (req.share_with_partner and user.get("partner_id")) else [],
    }
    if req.type == "custom":
        payload["custom_label"] = (req.custom_label or req.name).strip()[:40] or "Custom"
    res = sb.table("lists").insert(payload).execute()
    lst = res.data[0]
    lst["item_count"] = 0
    lst["done_count"] = 0
    if lst["shared_with"]:
        await send_push(
            recipients=[user["partner_id"]],
            data={"title": f"{user['username']} shared a list", "message": lst["name"], "action_url": f"/list/{lst['id']}"},
            idempotency_key=f"list-share-{lst['id']}",
        )
    return lst


def _get_accessible_list(list_id: str, user: dict) -> Optional[dict]:
    res = sb.table("lists").select("*").eq("id", list_id).limit(1).execute()
    lst = res.data[0] if res.data else None
    if not lst:
        return None
    if lst["owner_id"] == user["id"] or user["id"] in (lst.get("shared_with") or []):
        return lst
    if user.get("partner_id") and lst["owner_id"] == user["partner_id"] and user["id"] in (lst.get("shared_with") or []):
        return lst
    return None


@api_router.get("/lists/{list_id}")
async def get_list(list_id: str, user: dict = Depends(current_user)):
    lst = _get_accessible_list(list_id, user)
    if not lst:
        raise HTTPException(404, "List not found")
    items = sb.table("list_items").select("*").eq("list_id", list_id).order("created_at").execute().data or []
    _resolve_items_media(items)
    lst["items"] = items
    return lst


@api_router.patch("/lists/{list_id}")
async def update_list(list_id: str, req: ListUpdate, user: dict = Depends(current_user)):
    lst = _get_accessible_list(list_id, user)
    if not lst:
        raise HTTPException(404, "List not found")
    update: dict = {}
    was_shared = bool(lst.get("shared_with"))
    if req.name is not None:
        update["name"] = req.name.strip()[:80]
    if req.custom_label is not None and lst.get("type") == "custom":
        update["custom_label"] = req.custom_label.strip()[:40] or "Custom"
    if req.share_with_partner is not None:
        if lst["owner_id"] != user["id"]:
            raise HTTPException(403, "Only the list owner can change sharing")
        if req.share_with_partner and user.get("partner_id"):
            update["shared_with"] = [user["partner_id"]]
        else:
            update["shared_with"] = []
    if update:
        sb.table("lists").update(update).eq("id", list_id).execute()
    res = sb.table("lists").select("*").eq("id", list_id).limit(1).execute()
    updated = res.data[0]
    if req.share_with_partner and user.get("partner_id") and not was_shared and updated.get("shared_with"):
        await send_push(
            recipients=[user["partner_id"]],
            data={"title": f"{user['username']} shared a list", "message": updated["name"], "action_url": f"/list/{list_id}"},
            idempotency_key=f"list-share-{list_id}",
        )
    return updated


@api_router.delete("/lists/{list_id}")
async def delete_list(list_id: str, user: dict = Depends(current_user)):
    res = sb.table("lists").delete().eq("id", list_id).eq("owner_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "List not found or not owner")
    return {"ok": True}


@api_router.post("/lists/{list_id}/items")
async def add_item(list_id: str, req: ItemCreate, user: dict = Depends(current_user)):
    lst = _get_accessible_list(list_id, user)
    if not lst:
        raise HTTPException(404, "List not found")
    payload = {
        "list_id": list_id,
        "text": req.text.strip()[:200],
        "qty": req.qty,
        "assignee_id": req.assignee_id,
        "done": False,
        "due_at": req.due_at,
        "remind_minutes_before": req.remind_minutes_before,
        "recurrence": req.recurrence.dict() if req.recurrence else None,
        "created_by": user["id"],
    }
    if req.kind:
        payload["kind"] = req.kind
    if req.url:
        payload["url"] = req.url.strip()[:2000]
    if req.media_uri:
        payload["media_uri"] = req.media_uri.strip()[:2000]
    item = sb.table("list_items").insert(payload).execute().data[0]
    if item.get("media_uri"):
        item["media_uri"] = _resolve_media_uri(item["media_uri"])
    logger.info(f"[push-debug] add_item: shared_with={lst.get('shared_with')} partner_id={user.get('partner_id')}")
    if lst.get("shared_with") and user.get("partner_id"):
        await send_push(
            recipients=[user["partner_id"]],
            data={"title": f"{user['username']} added an item", "message": f"{lst['name']}: {item['text']}", "action_url": f"/list/{list_id}"},
            idempotency_key=f"item-create-{item['id']}",
        )
    return item


@api_router.patch("/items/{item_id}")
async def update_item(item_id: str, req: ItemUpdate, user: dict = Depends(current_user)):
    item_res = sb.table("list_items").select("*").eq("id", item_id).limit(1).execute()
    item = item_res.data[0] if item_res.data else None
    if not item:
        raise HTTPException(404, "Item not found")
    lst = _get_accessible_list(item["list_id"], user)
    if not lst:
        raise HTTPException(403, "Not allowed")
    payload = req.dict(exclude_unset=True)
    update: dict = {}
    for k, v in payload.items():
        if k == "clear_due":
            if v:
                update["due_at"] = None
                update["remind_minutes_before"] = None
            continue
        if k == "recurrence":
            update[k] = None if v is None else (v if isinstance(v, dict) else v.dict())
            continue
        if v is not None or k == "done":
            update[k] = v
    if update:
        sb.table("list_items").update(update).eq("id", item_id).execute()
    updated = sb.table("list_items").select("*").eq("id", item_id).limit(1).execute().data[0]
    if updated.get("media_uri"):
        updated["media_uri"] = _resolve_media_uri(updated["media_uri"])
    if lst.get("shared_with") and user.get("partner_id"):
        if update.get("done") is True:
            await send_push(
                recipients=[user["partner_id"]],
                data={"title": f"{user['username']} checked off an item", "message": f"{lst['name']}: {updated['text']}", "action_url": f"/list/{item['list_id']}"},
                idempotency_key=f"item-done-{item_id}-{iso(now_utc())[:13]}",
            )
        elif update.get("done") is False:
            await send_push(
                recipients=[user["partner_id"]],
                data={"title": f"{user['username']} unchecked an item", "message": f"{lst['name']}: {updated['text']}", "action_url": f"/list/{item['list_id']}"},
                idempotency_key=f"item-undone-{item_id}-{iso(now_utc())[:13]}",
            )
        elif "text" in update:
            await send_push(
                recipients=[user["partner_id"]],
                data={"title": f"{user['username']} edited an item", "message": f"{lst['name']}: {updated['text']}", "action_url": f"/list/{item['list_id']}"},
                idempotency_key=f"item-edit-{item_id}-{iso(now_utc())[:13]}",
            )
    return updated


@api_router.delete("/items/{item_id}")
async def delete_item(item_id: str, user: dict = Depends(current_user)):
    item_res = sb.table("list_items").select("*").eq("id", item_id).limit(1).execute()
    item = item_res.data[0] if item_res.data else None
    if not item:
        raise HTTPException(404, "Item not found")
    lst = _get_accessible_list(item["list_id"], user)
    if not lst:
        raise HTTPException(403, "Not allowed")
    sb.table("list_items").delete().eq("id", item_id).execute()
    if lst.get("shared_with") and user.get("partner_id"):
        await send_push(
            recipients=[user["partner_id"]],
            data={"title": f"{user['username']} removed an item", "message": f"{lst['name']}: {item['text']}", "action_url": f"/list/{item['list_id']}"},
            idempotency_key=f"item-delete-{item_id}",
        )
    return {"ok": True}


@api_router.get("/items/{item_id}")
async def get_item(item_id: str, user: dict = Depends(current_user)):
    item_res = sb.table("list_items").select("*").eq("id", item_id).limit(1).execute()
    item = item_res.data[0] if item_res.data else None
    if not item:
        raise HTTPException(404, "Item not found")
    lst = _get_accessible_list(item["list_id"], user)
    if not lst:
        raise HTTPException(403, "Not allowed")
    item["list_name"] = lst.get("name")
    item["list_type"] = lst.get("type")
    item["list_custom_label"] = lst.get("custom_label")
    if item.get("media_uri"):
        item["media_uri"] = _resolve_media_uri(item["media_uri"])
    return item


def _get_accessible_item(item_id: str, user: dict) -> tuple[Optional[dict], Optional[dict]]:
    item_res = sb.table("list_items").select("*").eq("id", item_id).limit(1).execute()
    item = item_res.data[0] if item_res.data else None
    if not item:
        return None, None
    lst = _get_accessible_list(item["list_id"], user)
    if not lst:
        return None, None
    return item, lst


def _attach_comment_authors(comments: list) -> None:
    pids = {c["author_id"] for c in comments}
    if not pids:
        return
    profiles = sb.table("profiles").select("id,username").in_("id", list(pids)).execute().data or []
    name_by_id = {p["id"]: p["username"] for p in profiles}
    for c in comments:
        c["author_username"] = name_by_id.get(c["author_id"], "")


@api_router.get("/items/{item_id}/comments")
async def get_item_comments(item_id: str, user: dict = Depends(current_user)):
    item, lst = _get_accessible_item(item_id, user)
    if not item:
        raise HTTPException(404, "Item not found")
    comments = sb.table("item_comments").select("*").eq("item_id", item_id).order("created_at").execute().data or []
    _attach_comment_authors(comments)
    return comments


@api_router.post("/items/{item_id}/comments")
async def create_item_comment(item_id: str, req: CommentCreate, user: dict = Depends(current_user)):
    item, lst = _get_accessible_item(item_id, user)
    if not item:
        raise HTTPException(404, "Item not found")
    body = req.body.strip()[:1000]
    if not body:
        raise HTTPException(400, "Comment cannot be empty")
    comment = sb.table("item_comments").insert({
        "item_id": item_id,
        "author_id": user["id"],
        "body": body,
    }).execute().data[0]
    comment["author_username"] = user["username"]
    if lst.get("shared_with") and user.get("partner_id"):
        partner_id = user["partner_id"]
        if partner_id != user["id"]:
            await send_push(
                recipients=[partner_id],
                data={
                    "title": f"{user['username']} commented",
                    "message": f"{lst['name']}: {item['text'][:80]}",
                    "action_url": f"/item/{item_id}",
                },
                idempotency_key=f"comment-{comment['id']}",
            )
    return comment


@api_router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, user: dict = Depends(current_user)):
    res = sb.table("item_comments").select("*").eq("id", comment_id).limit(1).execute()
    comment = res.data[0] if res.data else None
    if not comment:
        raise HTTPException(404, "Comment not found")
    if comment["author_id"] != user["id"]:
        raise HTTPException(403, "You can only delete your own comments")
    sb.table("item_comments").delete().eq("id", comment_id).execute()
    return {"ok": True}


@api_router.post("/upload/image")
async def upload_image(file: UploadFile = File(...), user: dict = Depends(current_user)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")
    data = await file.read()
    if len(data) > 5_000_000:
        raise HTTPException(400, "Image too large (max 5 MB)")
    ext = file.content_type.split("/")[-1].replace("jpeg", "jpg")
    path = f"{user['id']}/{secrets.token_hex(8)}.{ext}"
    try:
        sb.storage.from_(MEDIA_BUCKET).upload(
            path,
            data,
            {"content-type": file.content_type, "upsert": "false"},
        )
    except Exception as e:
        logger.warning(f"Storage upload failed: {e}")
        raise HTTPException(500, "Image upload failed")
    url = _signed_media_url(path)
    return {"path": path, "url": url}


# ======================= THOUGHTS =======================
@api_router.get("/thoughts")
async def get_thoughts(user: dict = Depends(current_user)):
    own = sb.table("thoughts").select("*").eq("owner_id", user["id"]).execute().data or []
    shared = []
    if user.get("partner_id"):
        shared = sb.table("thoughts").select("*").eq("owner_id", user["partner_id"]).eq("shared", True).execute().data or []
    combined = own + shared
    combined.sort(key=lambda x: x["created_at"], reverse=True)
    # Resolve owner_username for display
    pids = {x["owner_id"] for x in combined}
    if pids:
        profiles = sb.table("profiles").select("id,username").in_("id", list(pids)).execute().data or []
        name_by_id = {p["id"]: p["username"] for p in profiles}
        for x in combined:
            x["owner_username"] = name_by_id.get(x["owner_id"], "")
    return combined


@api_router.post("/thoughts")
async def create_thought(req: ThoughtCreate, user: dict = Depends(current_user)):
    payload = {
        "owner_id": user["id"],
        "text": req.text.strip()[:1000],
        "mood": req.mood or None,
        "shared": bool(req.share_with_partner and user.get("partner_id")),
    }
    item = sb.table("thoughts").insert(payload).execute().data[0]
    item["owner_username"] = user["username"]
    return item


@api_router.get("/thoughts/{tid}")
async def get_thought(tid: str, user: dict = Depends(current_user)):
    res = sb.table("thoughts").select("*").eq("id", tid).limit(1).execute()
    item = res.data[0] if res.data else None
    if not item:
        raise HTTPException(404, "Not found")
    if item["owner_id"] != user["id"] and not (user.get("partner_id") and item["owner_id"] == user["partner_id"] and item.get("shared")):
        raise HTTPException(403, "Not allowed")
    prof = sb.table("profiles").select("username").eq("id", item["owner_id"]).limit(1).execute()
    item["owner_username"] = prof.data[0]["username"] if prof.data else ""
    return item


@api_router.patch("/thoughts/{tid}")
async def update_thought(tid: str, req: ThoughtUpdate, user: dict = Depends(current_user)):
    res = sb.table("thoughts").select("*").eq("id", tid).eq("owner_id", user["id"]).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    update: dict = {}
    if req.text is not None:
        update["text"] = req.text.strip()[:1000]
    if req.mood is not None:
        update["mood"] = req.mood or None
    if req.share_with_partner is not None:
        update["shared"] = bool(req.share_with_partner and user.get("partner_id"))
    if update:
        sb.table("thoughts").update(update).eq("id", tid).execute()
    item = sb.table("thoughts").select("*").eq("id", tid).limit(1).execute().data[0]
    item["owner_username"] = user["username"]
    return item


@api_router.delete("/thoughts/{tid}")
async def delete_thought(tid: str, user: dict = Depends(current_user)):
    res = sb.table("thoughts").delete().eq("id", tid).eq("owner_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ======================= JOURNAL =======================
@api_router.get("/journal")
async def get_journal(user: dict = Depends(current_user)):
    own = sb.table("journal_entries").select("*").eq("owner_id", user["id"]).execute().data or []
    shared = []
    if user.get("partner_id"):
        shared = sb.table("journal_entries").select("*").eq("owner_id", user["partner_id"]).eq("shared", True).execute().data or []
    combined = own + shared
    combined.sort(key=lambda x: x["created_at"], reverse=True)
    pids = {x["owner_id"] for x in combined}
    if pids:
        profiles = sb.table("profiles").select("id,username").in_("id", list(pids)).execute().data or []
        name_by_id = {p["id"]: p["username"] for p in profiles}
        for x in combined:
            x["owner_username"] = name_by_id.get(x["owner_id"], "")
    return combined


@api_router.post("/journal")
async def create_journal(req: JournalCreate, user: dict = Depends(current_user)):
    payload = {
        "owner_id": user["id"],
        "title": req.title.strip()[:120] or "Untitled",
        "body": req.body.strip()[:10000],
        "mood": req.mood,
        "shared": bool(req.share_with_partner and user.get("partner_id")),
    }
    item = sb.table("journal_entries").insert(payload).execute().data[0]
    item["owner_username"] = user["username"]
    return item


@api_router.get("/journal/{jid}")
async def get_journal_entry(jid: str, user: dict = Depends(current_user)):
    res = sb.table("journal_entries").select("*").eq("id", jid).limit(1).execute()
    item = res.data[0] if res.data else None
    if not item:
        raise HTTPException(404, "Not found")
    if item["owner_id"] != user["id"] and not (user.get("partner_id") and item["owner_id"] == user["partner_id"] and item.get("shared")):
        raise HTTPException(403, "Not allowed")
    prof = sb.table("profiles").select("username").eq("id", item["owner_id"]).limit(1).execute()
    item["owner_username"] = prof.data[0]["username"] if prof.data else ""
    return item


@api_router.patch("/journal/{jid}")
async def update_journal(jid: str, req: JournalUpdate, user: dict = Depends(current_user)):
    res = sb.table("journal_entries").select("*").eq("id", jid).eq("owner_id", user["id"]).limit(1).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    update: dict = {}
    if req.title is not None:
        update["title"] = req.title.strip()[:120] or "Untitled"
    if req.body is not None:
        update["body"] = req.body.strip()[:10000]
    if req.mood is not None:
        update["mood"] = req.mood
    if req.share_with_partner is not None:
        update["shared"] = bool(req.share_with_partner and user.get("partner_id"))
    if update:
        sb.table("journal_entries").update(update).eq("id", jid).execute()
    item = sb.table("journal_entries").select("*").eq("id", jid).limit(1).execute().data[0]
    item["owner_username"] = user["username"]
    return item


@api_router.delete("/journal/{jid}")
async def delete_journal(jid: str, user: dict = Depends(current_user)):
    res = sb.table("journal_entries").delete().eq("id", jid).eq("owner_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ======================= ROUTINE =======================
@api_router.get("/routine")
async def get_routine(user: dict = Depends(current_user)):
    res = sb.table("routines").select("*").eq("user_id", user["id"]).limit(1).execute()
    r = res.data[0] if res.data else None
    if not r:
        sb.table("routines").upsert({"user_id": user["id"], "steps": []}).execute()
        r = sb.table("routines").select("*").eq("user_id", user["id"]).limit(1).execute().data[0]
    today = now_utc().strftime("%Y-%m-%d")
    checks = sb.table("routine_checks").select("step_id").eq("user_id", user["id"]).eq("date", today).execute().data or []
    r["completed_today"] = [c["step_id"] for c in checks]
    return r


@api_router.put("/routine")
async def update_routine(req: RoutineUpdate, user: dict = Depends(current_user)):
    steps = [s.dict() for s in req.steps]
    for i, s in enumerate(steps):
        s["order"] = i
    sb.table("routines").upsert({"user_id": user["id"], "steps": steps}).execute()
    return sb.table("routines").select("*").eq("user_id", user["id"]).limit(1).execute().data[0]


@api_router.post("/routine/check")
async def check_step(req: RoutineCheckReq, user: dict = Depends(current_user)):
    existing = sb.table("routine_checks").select("id").eq("user_id", user["id"]).eq("step_id", req.step_id).eq("date", req.date).limit(1).execute().data
    if existing:
        sb.table("routine_checks").delete().eq("id", existing[0]["id"]).execute()
        return {"checked": False}
    sb.table("routine_checks").insert({"user_id": user["id"], "step_id": req.step_id, "date": req.date}).execute()
    return {"checked": True}


# ======================= EVENTS =======================
@api_router.get("/events")
async def get_events(user: dict = Depends(current_user)):
    own = sb.table("events").select("*").eq("owner_id", user["id"]).execute().data or []
    shared = []
    if user.get("partner_id"):
        shared = sb.table("events").select("*").eq("owner_id", user["partner_id"]).eq("shared", True).execute().data or []
    combined = own + shared
    combined.sort(key=lambda x: (x["date"], x.get("time") or ""))
    pids = {x["owner_id"] for x in combined}
    if pids:
        profiles = sb.table("profiles").select("id,username").in_("id", list(pids)).execute().data or []
        name_by_id = {p["id"]: p["username"] for p in profiles}
        for x in combined:
            x["owner_username"] = name_by_id.get(x["owner_id"], "")
    return combined


@api_router.post("/events")
async def create_event(req: EventCreate, user: dict = Depends(current_user)):
    payload = {
        "owner_id": user["id"],
        "title": req.title.strip()[:120] or "Untitled",
        "date": req.date,
        "time": req.time,
        "notes": (req.notes or "").strip()[:1000] or None,
        "location": (req.location or "").strip()[:200] or None,
        "remind_minutes_before": req.remind_minutes_before,
        "recurrence": req.recurrence.dict() if req.recurrence else None,
        "shared": bool(req.share_with_partner and user.get("partner_id")),
    }
    ev = sb.table("events").insert(payload).execute().data[0]
    ev["owner_username"] = user["username"]
    if ev["shared"] and user.get("partner_id"):
        when_label = ev["date"] + (f" · {ev['time']}" if ev.get("time") else "")
        await send_push(
            recipients=[user["partner_id"]],
            data={"title": f"{user['username']} added an event", "message": f"{ev['title']} — {when_label}", "action_url": "/(tabs)/calendar"},
            idempotency_key=f"event-create-{ev['id']}",
        )
    return ev


@api_router.get("/events/{eid}")
async def get_event(eid: str, user: dict = Depends(current_user)):
    res = sb.table("events").select("*").eq("id", eid).limit(1).execute()
    ev = res.data[0] if res.data else None
    if not ev:
        raise HTTPException(404, "Not found")
    if ev["owner_id"] != user["id"] and not (user.get("partner_id") and ev["owner_id"] == user["partner_id"] and ev.get("shared")):
        raise HTTPException(403, "Not allowed")
    prof = sb.table("profiles").select("username").eq("id", ev["owner_id"]).limit(1).execute()
    ev["owner_username"] = prof.data[0]["username"] if prof.data else ""
    return ev


@api_router.patch("/events/{eid}")
async def update_event(eid: str, req: EventUpdate, user: dict = Depends(current_user)):
    existing = sb.table("events").select("*").eq("id", eid).eq("owner_id", user["id"]).limit(1).execute().data
    if not existing:
        raise HTTPException(404, "Event not found")
    payload = req.dict(exclude_unset=True)
    if "share_with_partner" in payload:
        payload["shared"] = bool(payload.pop("share_with_partner") and user.get("partner_id"))
    if "recurrence" in payload:
        rec = payload["recurrence"]
        payload["recurrence"] = None if rec is None else (rec if isinstance(rec, dict) else rec.dict())
    if payload:
        sb.table("events").update(payload).eq("id", eid).execute()
    return sb.table("events").select("*").eq("id", eid).limit(1).execute().data[0]


@api_router.delete("/events/{eid}")
async def delete_event(eid: str, user: dict = Depends(current_user)):
    res = sb.table("events").delete().eq("id", eid).eq("owner_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ======================= PUSH REGISTRATION =======================
@api_router.post("/register-push", status_code=201)
async def register_push(req: RegisterPushReq, user: dict = Depends(current_user)):
    # Upsert by device_token so reinstall replaces the row cleanly.
    sb.table("push_tokens").upsert(
        {"user_id": user["id"], "platform": req.platform, "device_token": req.device_token},
        on_conflict="device_token",
    ).execute()
    return {"status": "registered"}


# ======================= DAILY QUOTE =======================
# In-memory cache: { "user_id:YYYY-MM-DD": {"text": ..., "author": ...} }
# Clears on server restart (acceptable — one extra LLM call per deploy per user).
_quote_cache: dict[str, dict] = {}

FALLBACK_QUOTES = [
    ("In the middle of every difficulty lies opportunity.", "Albert Einstein"),
    ("You do not find the happy life. You make it.", "Camilla Eyring Kimball"),
    ("The purpose of life is to live it, to taste experience to the utmost.", "Eleanor Roosevelt"),
    ("We know what we are, but know not what we may be.", "William Shakespeare"),
    ("It does not matter how slowly you go as long as you do not stop.", "Confucius"),
    ("You can never cross the ocean unless you have the courage to lose sight of the shore.", "André Gide"),
    ("Life is what happens when you're busy making other plans.", "John Lennon"),
    ("In three words I can sum up everything I've learned about life: it goes on.", "Robert Frost"),
    ("To love and be loved is to feel the sun from both sides.", "David Viscott"),
    ("The best time to plant a tree was 20 years ago. The second best time is now.", "Chinese Proverb"),
]

@api_router.get("/quote/today")
async def get_today_quote(user: dict = Depends(current_user)):
    today = today_quote_date()
    first_name = _first_name(user)
    cache_key = f"{user['id']}:{today}"

    if cache_key in _quote_cache:
        return {**_quote_cache[cache_key], "first_name": first_name}

    import random
    fallback_text, fallback_author = random.choice(FALLBACK_QUOTES)
    quote_text, author = fallback_text, fallback_author

    try:
        ac = anthropic.AsyncAnthropicBedrock(
            aws_access_key=AWS_ACCESS_KEY_ID,
            aws_secret_key=AWS_SECRET_ACCESS_KEY,
            aws_region=AWS_REGION,
        )
        # Rotate source category daily so quotes feel varied
        categories = [
            "stoic philosophers (Marcus Aurelius, Epictetus, Seneca)",
            "modern writers and authors (Maya Angelou, Toni Morrison, Hemingway, Baldwin)",
            "scientists and thinkers (Einstein, Feynman, Sagan, Curie)",
            "poets (Rumi, Mary Oliver, Rilke, Whitman)",
            "world leaders and activists (Mandela, MLK, Roosevelt, Gandhi)",
            "artists and creatives (Picasso, O'Keeffe, da Vinci, Frida Kahlo)",
            "comedians and entertainers (Twain, Wilde, Chaplin, Carlin)",
            "entrepreneurs and innovators (Jobs, Winfrey, Bezos, Musk)",
        ]
        category = categories[hash(cache_key) % len(categories)]
        response = await ac.messages.create(
            model="arn:aws:bedrock:us-west-2:598451516178:inference-profile/global.anthropic.claude-sonnet-4-6",
            max_tokens=160,
            system=(
                "You are a quote curator for Tandem, a couple companion app. "
                f"Pick ONE real, well-known life quote from {category}. "
                "The quote should feel meaningful and universal — about life, love, growth, courage, or relationships. "
                "Use the actual quote verbatim as it was said or written. Vary length naturally — some quotes are short, some longer. "
                "Do NOT generate original quotes. Do NOT use romantic clichés. "
                "Respond as exactly two lines:\nLine1: the quote (no quotation marks)\nLine2: — Firstname Lastname"
            ),
            messages=[{"role": "user", "content": f"Today's quote for {first_name}."}],
        )
        full = response.content[0].text.strip() if response.content else ""
        if full:
            lines = [l.strip() for l in full.split("\n") if l.strip()]
            if lines:
                quote_text = lines[0].strip().strip('"').strip("'")[:280]
                author = lines[1].lstrip("—-– ").strip()[:40] or "Tandem" if len(lines) > 1 else "Tandem"
    except Exception as e:
        logger.warning(f"LLM quote failed: {e}")

    result = {"text": quote_text, "author": author}
    _quote_cache[cache_key] = result

    # Evict stale keys (yesterday and older) to prevent unbounded growth
    for k in list(_quote_cache.keys()):
        if not k.endswith(today):
            del _quote_cache[k]

    return {**result, "first_name": first_name}


# ======================= DATE NIGHT PLANNER =======================
@api_router.post("/date-night/plan")
async def plan_date_night(req: DateNightPlanReq, user: dict = Depends(current_user)):
    first_name = _first_name(user)
    prompt = (
        f"Budget: {req.budget}\n"
        f"Vibe: {req.vibe}\n"
        f"Location/area: {req.location}"
    )
    fallback = [
        {
            "title": "Cozy Home Cinema",
            "description": "Pick a film you've both been putting off, dim the lights, make popcorn from scratch.",
            "checklist": ["Pick the film together", "Make popcorn", "Dim the lights", "Phones on silent"],
        },
        {
            "title": "Neighbourhood Food Walk",
            "description": "Pick three local spots and order one thing at each — appetiser, main, dessert.",
            "checklist": ["Pick three spots", "Walk there", "Order one dish each stop", "Share everything"],
        },
        {
            "title": "Sunset Picnic",
            "description": "Pack a simple spread and find your nearest outdoor spot before golden hour.",
            "checklist": ["Pack blanket", "Prepare snacks", "Find a good spot", "Leave phones in pockets"],
        },
    ]
    try:
        ac = anthropic.AsyncAnthropicBedrock(
            aws_access_key=AWS_ACCESS_KEY_ID,
            aws_secret_key=AWS_SECRET_ACCESS_KEY,
            aws_region=AWS_REGION,
        )
        response = await ac.messages.create(
            model="arn:aws:bedrock:us-west-2:598451516178:inference-profile/global.anthropic.claude-sonnet-4-6",
            max_tokens=1024,
            system=(
                f"You are a warm, creative date planner for {first_name} and their partner. "
                "Given budget, vibe, and location, generate exactly 3 date night ideas. "
                "Each idea must be specific, actionable, and feel personal — not generic. "
                "Return ONLY valid JSON (no markdown) with this exact shape:\n"
                '[{"title":"string","description":"string (1-2 sentences, warm tone)","checklist":["string","string","string","string"]}]\n'
                "Rules: checklist has 3-5 concrete action items; ideas vary in energy level (one chill, one active, one romantic); "
                "respect the budget constraint strictly; keep location-specific where possible."
            ),
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip() if response.content else ""
        parsed = _extract_json_array(raw)
        if parsed and len(parsed) >= 2:
            return {"ideas": parsed[:3]}
    except Exception as e:
        logger.warning(f"Date night plan AI failed: {e}")
    return {"ideas": fallback}


def _extract_json_array(text: str) -> Optional[list]:
    try:
        s = text.find("[")
        e = text.rfind("]")
        if s == -1 or e == -1:
            return None
        return json.loads(text[s:e+1])
    except Exception:
        return None


@api_router.get("/")
async def root():
    return {"app": "Tandem API (Supabase)"}


@api_router.post("/test-push")
async def test_push(
    user_id: str = Query(..., description="User ID from push_tokens table"),
    title: str = "Test push",
    message: str = "Push is working!",
):
    """Send a test push notification. Open endpoint — for debugging only. Delete in production."""
    await send_push(
        recipients=[user_id],
        data={"title": title, "message": message, "action_url": "/(tabs)/"},
    )
    return {"ok": True, "target_user_id": user_id}


@api_router.get("/health")
async def health():
    try:
        sb.table("profiles").select("id").limit(1).execute()
        return {"db": "ok"}
    except Exception as e:
        return {"db": "error", "detail": str(e)[:200]}


# ======================= STATS =======================
@api_router.get("/stats")
async def get_stats(user: dict = Depends(current_user)):
    uid = user["id"]

    lists_count = len(sb.table("lists").select("id").eq("owner_id", uid).execute().data or [])
    items_done = len(sb.table("list_items").select("id").eq("created_by", uid).eq("done", True).execute().data or [])
    thoughts_count = len(sb.table("thoughts").select("id").eq("owner_id", uid).execute().data or [])
    journal_count = len(sb.table("journal_entries").select("id").eq("owner_id", uid).execute().data or [])

    # routine streak: count consecutive days ending today with at least one check
    from datetime import date, timedelta
    checks = sb.table("routine_checks").select("date").eq("user_id", uid).order("date", desc=True).execute().data or []
    checked_dates = sorted({r["date"] for r in checks}, reverse=True)
    streak = 0
    cursor = date.today()
    for d in checked_dates:
        if d == str(cursor):
            streak += 1
            cursor -= timedelta(days=1)
        elif d < str(cursor):
            break

    # days since joined
    profile = sb.table("profiles").select("created_at").eq("id", uid).single().execute().data
    days_using = 0
    if profile and profile.get("created_at"):
        from datetime import datetime, timezone
        joined = datetime.fromisoformat(profile["created_at"].replace("Z", "+00:00"))
        days_using = (datetime.now(timezone.utc) - joined).days + 1

    return {
        "lists_created": lists_count,
        "tasks_checked": items_done,
        "thoughts_shared": thoughts_count,
        "journal_entries": journal_count,
        "routine_streak": streak,
        "days_using": days_using,
    }


# ======================= FREE TIER KEEPALIVE =======================
@api_router.get("/ping")
def ping():
    """No-auth endpoint for external cron services. Prevents Render free-tier sleep and Supabase pause."""
    try:
        sb.table("profiles").select("id").limit(1).execute()
    except Exception:
        pass
    return {"pong": True}


app.include_router(api_router)


@app.get("/", include_in_schema=False)
async def index():
    return RedirectResponse(url="/api/")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        logger.info("%s %s", request.method, request.url.path)
        response = await call_next(request)
        logger.info("%s %s -> %s", request.method, request.url.path, response.status_code)
        return response


app.add_middleware(RequestLogMiddleware)


