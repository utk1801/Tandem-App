"""
Tandem backend — Supabase edition.
The frontend talks to Supabase Auth directly for signup/login. For each API
call it sends the Supabase access token in the Authorization header. This
backend verifies the token with SUPABASE_JWT_SECRET, then performs all DB
operations using the service-role client (which bypasses RLS) but explicitly
scopes every query by the verified user id.
"""

from fastapi import FastAPI, APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import secrets
import string
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta
import jwt as pyjwt
import httpx
from supabase import create_client, Client
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_SERVICE_ROLE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
SUPABASE_JWT_SECRET = os.environ['SUPABASE_JWT_SECRET']
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
EMERGENT_PUSH_KEY = os.environ.get('EMERGENT_PUSH_KEY', 'placeholder')

sb: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()
api_router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

_push_client = httpx.AsyncClient(
    base_url="https://integrations.emergentagent.com",
    headers={"X-Push-Key": EMERGENT_PUSH_KEY},
    timeout=10.0,
)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def gen_code(n=6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(n))


async def send_push(recipients: List[str], data: dict, idempotency_key: Optional[str] = None) -> None:
    if not recipients or not data.get("title") or not data.get("message"):
        return
    payload: dict = {"recipients": recipients, "data": data}
    if idempotency_key:
        payload["$idempotency_key"] = idempotency_key
    try:
        resp = await _push_client.post("/api/v1/push/trigger", json=payload)
        if resp.status_code >= 400:
            logger.warning(f"Push relay returned {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        logger.warning(f"Push notification failed (non-blocking): {e}")


async def current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = pyjwt.decode(
            creds.credentials,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
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


# ======================= MODELS =======================
class ListCreate(BaseModel):
    name: str
    type: Literal["todo", "grocery", "chores"]


class ListUpdate(BaseModel):
    name: Optional[str] = None


class Recurrence(BaseModel):
    type: str = "none"
    weekdays: Optional[List[int]] = None


class ItemCreate(BaseModel):
    text: str
    qty: Optional[str] = None
    assignee_id: Optional[str] = None
    due_at: Optional[str] = None
    remind_minutes_before: Optional[int] = None
    recurrence: Optional[Recurrence] = None


class ItemUpdate(BaseModel):
    text: Optional[str] = None
    qty: Optional[str] = None
    done: Optional[bool] = None
    assignee_id: Optional[str] = None
    due_at: Optional[str] = None
    remind_minutes_before: Optional[int] = None
    clear_due: Optional[bool] = None
    recurrence: Optional[Recurrence] = None


class ShareReq(BaseModel):
    username_or_email: str


class InviteAcceptReq(BaseModel):
    code: str


class ThoughtCreate(BaseModel):
    text: str
    share_with_partner: bool = False


class JournalCreate(BaseModel):
    title: str
    body: str
    mood: Optional[str] = None
    share_with_partner: bool = False


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


class RegisterPushReq(BaseModel):
    platform: str
    device_token: str


# ======================= AUTH (Supabase-managed) =======================
@api_router.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return user


# ======================= CONNECTIONS =======================
@api_router.get("/connection")
async def get_connection(user: dict = Depends(current_user)):
    pid = user.get("partner_id")
    if not pid:
        return {"partner": None}
    res = sb.table("profiles").select("id,username,email").eq("id", pid).limit(1).execute()
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
    ids = _accessible_user_ids(user)
    q = sb.table("lists").select("*").in_("owner_id", ids).order("created_at", desc=True)
    if type:
        q = q.eq("type", type)
    lists = q.execute().data or []
    # Also include lists shared_with where current user is included
    extra = sb.table("lists").select("*").contains("shared_with", [user["id"]]).execute().data or []
    seen = {l["id"] for l in lists}
    for l in extra:
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


@api_router.post("/lists")
async def create_list(req: ListCreate, user: dict = Depends(current_user)):
    payload = {
        "owner_id": user["id"],
        "name": req.name.strip()[:80] or "Untitled",
        "type": req.type,
        "shared_with": [user["partner_id"]] if user.get("partner_id") else [],
    }
    res = sb.table("lists").insert(payload).execute()
    lst = res.data[0]
    lst["item_count"] = 0
    lst["done_count"] = 0
    if lst["shared_with"]:
        await send_push(
            recipients=[user["partner_id"]],
            data={"title": f"{user['username']} started a new list", "message": lst["name"], "action_url": f"/list/{lst['id']}"},
            idempotency_key=f"list-create-{lst['id']}",
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
    lst["items"] = items
    return lst


@api_router.patch("/lists/{list_id}")
async def update_list(list_id: str, req: ListUpdate, user: dict = Depends(current_user)):
    lst = _get_accessible_list(list_id, user)
    if not lst:
        raise HTTPException(404, "List not found")
    if req.name is not None:
        sb.table("lists").update({"name": req.name.strip()[:80]}).eq("id", list_id).execute()
    res = sb.table("lists").select("*").eq("id", list_id).limit(1).execute()
    return res.data[0]


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
    item = sb.table("list_items").insert(payload).execute().data[0]
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
        if k == "recurrence" and v is not None:
            update[k] = v if isinstance(v, dict) else v.dict()
            continue
        if v is not None or k == "done":
            update[k] = v
    if update:
        sb.table("list_items").update(update).eq("id", item_id).execute()
    updated = sb.table("list_items").select("*").eq("id", item_id).limit(1).execute().data[0]
    if (
        updated.get("done") and update.get("done") is True
        and lst.get("shared_with") and user.get("partner_id")
    ):
        await send_push(
            recipients=[user["partner_id"]],
            data={"title": f"{user['username']} checked off a task", "message": f"{lst['name']}: {updated['text']}", "action_url": f"/list/{item['list_id']}"},
            idempotency_key=f"item-done-{item_id}-{iso(now_utc())[:13]}",
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
    return {"ok": True}


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
        "shared": bool(req.share_with_partner and user.get("partner_id")),
    }
    item = sb.table("thoughts").insert(payload).execute().data[0]
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


@api_router.patch("/events/{eid}")
async def update_event(eid: str, req: EventUpdate, user: dict = Depends(current_user)):
    existing = sb.table("events").select("*").eq("id", eid).eq("owner_id", user["id"]).limit(1).execute().data
    if not existing:
        raise HTTPException(404, "Event not found")
    payload = req.dict(exclude_unset=True)
    if "share_with_partner" in payload:
        payload["shared"] = bool(payload.pop("share_with_partner") and user.get("partner_id"))
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
    # Forward to Emergent push relay (no-op in dev if key is placeholder).
    try:
        resp = await _push_client.post(
            "/api/v1/push/users/register",
            json={"user_id": user["id"], "platform": req.platform, "device_token": req.device_token},
        )
        if resp.status_code >= 500:
            logger.warning(f"push relay register: {resp.status_code}")
    except Exception as e:
        logger.warning(f"push relay register failed (non-blocking): {e}")
    return {"status": "registered"}


# ======================= DAILY QUOTE =======================
@api_router.get("/quote/today")
async def get_today_quote(user: dict = Depends(current_user)):
    today = now_utc().strftime("%Y-%m-%d")
    cached = sb.table("quotes").select("*").eq("user_id", user["id"]).eq("date", today).limit(1).execute().data
    if cached:
        return cached[0]

    quote_text = "Begin with gentleness — the day will meet you where you are."
    author = "Tandem"
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"quote-{user['id']}-{today}",
            system_message=(
                "You are a thoughtful, warm life-quote generator. "
                "Generate ONE original short life quote (max 20 words). "
                "Then a short author tag (use 'Tandem' if you wrote it). "
                "Respond as exactly two lines:\nLine1: the quote (no quotes around it)\nLine2: — author"
            ),
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        msg = UserMessage(text=f"Give me today's life quote for {user['username']}.")
        text_chunks: List[str] = []
        async for ev in chat.stream_message(msg):
            content = getattr(ev, "content", None)
            if isinstance(content, str):
                text_chunks.append(content)
        full = "".join(text_chunks).strip()
        if full:
            lines = [l.strip() for l in full.split("\n") if l.strip()]
            if lines:
                quote_text = lines[0].strip().strip('"').strip("'")[:280]
                if len(lines) > 1:
                    author = lines[1].lstrip("—-– ").strip()[:40] or "Tandem"
    except Exception as e:
        logger.warning(f"LLM quote failed: {e}")

    sb.table("quotes").insert({
        "user_id": user["id"], "date": today, "text": quote_text, "author": author,
    }).execute()
    return sb.table("quotes").select("*").eq("user_id", user["id"]).eq("date", today).limit(1).execute().data[0]


@api_router.get("/")
async def root():
    return {"app": "Tandem API (Supabase)"}


@api_router.get("/health")
async def health():
    try:
        sb.table("profiles").select("id").limit(1).execute()
        return {"db": "ok"}
    except Exception as e:
        return {"db": "error", "detail": str(e)[:200]}


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_clients():
    await _push_client.aclose()
