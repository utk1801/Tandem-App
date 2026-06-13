from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import secrets
import string
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt as pyjwt
import httpx
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"
JWT_EXP_DAYS = 30
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# ---- Emergent Push relay (SuprSend) -----------------------------------------
PUSH_BASE_URL = "https://integrations.emergentagent.com"
EMERGENT_PUSH_KEY = os.environ.get("EMERGENT_PUSH_KEY", "placeholder")
_push_client = httpx.AsyncClient(
    base_url=PUSH_BASE_URL,
    headers={"X-Push-Key": EMERGENT_PUSH_KEY},
    timeout=10.0,
)


async def send_push(recipients: List[str], data: dict, idempotency_key: Optional[str] = None) -> None:
    """Fire-and-log push. Never raises into the caller."""
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

app = FastAPI()
api_router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": now_utc() + timedelta(days=JWT_EXP_DAYS),
        "iat": now_utc(),
    }
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


async def current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = pyjwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGO])
        uid = payload.get("sub")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def gen_code(n=6) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(alphabet) for _ in range(n))


# ======================= MODELS =======================
class Recurrence(BaseModel):
    type: str = "none"  # none | daily | weekly | monthly | yearly | weekdays
    weekdays: Optional[List[int]] = None  # 0=Sun..6=Sat


class SignupReq(BaseModel):
    email: EmailStr
    username: str
    password: str


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class AuthResp(BaseModel):
    token: str
    user: dict


class ListCreate(BaseModel):
    name: str
    type: Literal["todo", "grocery", "chores"]


class ListUpdate(BaseModel):
    name: Optional[str] = None


class ItemCreate(BaseModel):
    text: str
    qty: Optional[str] = None
    assignee_id: Optional[str] = None
    due_at: Optional[str] = None  # ISO datetime string
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
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    order: int = 0


class RoutineUpdate(BaseModel):
    steps: List[RoutineStep]


class RoutineCheckReq(BaseModel):
    step_id: str
    date: str  # YYYY-MM-DD


class EventCreate(BaseModel):
    title: str
    date: str  # YYYY-MM-DD
    time: Optional[str] = None  # HH:MM
    notes: Optional[str] = None
    location: Optional[str] = None
    remind_minutes_before: Optional[int] = None
    share_with_partner: bool = False
    recurrence: Optional["Recurrence"] = None


class EventUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    notes: Optional[str] = None
    location: Optional[str] = None
    remind_minutes_before: Optional[int] = None
    share_with_partner: Optional[bool] = None


class Recurrence(BaseModel):  # noqa: F811
    type: str = "none"
    weekdays: Optional[List[int]] = None


class RegisterPushReq(BaseModel):
    user_id: str
    platform: str
    device_token: str


# ======================= AUTH =======================
@api_router.post("/auth/signup", response_model=AuthResp)
async def signup(req: SignupReq):
    email = req.email.lower().strip()
    username = req.username.strip()
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    if await db.users.find_one({"username": username}):
        raise HTTPException(400, "Username taken")
    uid = str(uuid.uuid4())
    user = {
        "id": uid,
        "email": email,
        "username": username,
        "password_hash": hash_password(req.password),
        "created_at": iso(now_utc()),
        "partner_id": None,
    }
    await db.users.insert_one(user)
    # Seed empty morning routine
    await db.routines.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "steps": [],
        "created_at": iso(now_utc()),
    })
    safe = {k: v for k, v in user.items() if k not in ("password_hash", "_id")}
    return {"token": make_token(uid), "user": safe}


@api_router.post("/auth/login", response_model=AuthResp)
async def login(req: LoginReq):
    user = await db.users.find_one({"email": req.email.lower().strip()})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    safe = {k: v for k, v in user.items() if k not in ("password_hash", "_id")}
    return {"token": make_token(user["id"]), "user": safe}


@api_router.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    return user


# ======================= SHARING / CONNECTIONS =======================
@api_router.get("/connection")
async def get_connection(user: dict = Depends(current_user)):
    pid = user.get("partner_id")
    if not pid:
        return {"partner": None}
    partner = await db.users.find_one({"id": pid}, {"_id": 0, "password_hash": 0})
    return {"partner": partner}


@api_router.post("/connection/invite-user")
async def invite_user(req: ShareReq, user: dict = Depends(current_user)):
    if user.get("partner_id"):
        raise HTTPException(400, "Already connected to a partner")
    q = req.username_or_email.strip().lower()
    other = await db.users.find_one({"$or": [{"email": q}, {"username": req.username_or_email.strip()}]})
    if not other:
        raise HTTPException(404, "User not found")
    if other["id"] == user["id"]:
        raise HTTPException(400, "Cannot connect to yourself")
    if other.get("partner_id"):
        raise HTTPException(400, "User is already connected to someone")
    # Auto-connect (simple model: bidirectional partnership)
    await db.users.update_one({"id": user["id"]}, {"$set": {"partner_id": other["id"]}})
    await db.users.update_one({"id": other["id"]}, {"$set": {"partner_id": user["id"]}})
    safe = await db.users.find_one({"id": other["id"]}, {"_id": 0, "password_hash": 0})
    return {"partner": safe}


@api_router.post("/connection/code")
async def create_invite_code(user: dict = Depends(current_user)):
    if user.get("partner_id"):
        raise HTTPException(400, "Already connected to a partner")
    code = gen_code(6)
    # Ensure unique
    while await db.invites.find_one({"code": code, "used": False}):
        code = gen_code(6)
    invite = {
        "id": str(uuid.uuid4()),
        "code": code,
        "created_by": user["id"],
        "created_at": iso(now_utc()),
        "expires_at": iso(now_utc() + timedelta(days=7)),
        "used": False,
    }
    await db.invites.insert_one(invite)
    return {"code": code, "expires_at": invite["expires_at"]}


@api_router.post("/connection/accept-code")
async def accept_invite(req: InviteAcceptReq, user: dict = Depends(current_user)):
    if user.get("partner_id"):
        raise HTTPException(400, "Already connected to a partner")
    code = req.code.strip().upper()
    invite = await db.invites.find_one({"code": code, "used": False})
    if not invite:
        raise HTTPException(404, "Invalid or used code")
    creator = await db.users.find_one({"id": invite["created_by"]})
    if not creator:
        raise HTTPException(404, "Inviter no longer exists")
    if creator["id"] == user["id"]:
        raise HTTPException(400, "Cannot accept your own code")
    if creator.get("partner_id"):
        raise HTTPException(400, "Inviter is already connected")
    await db.users.update_one({"id": user["id"]}, {"$set": {"partner_id": creator["id"]}})
    await db.users.update_one({"id": creator["id"]}, {"$set": {"partner_id": user["id"]}})
    await db.invites.update_one({"id": invite["id"]}, {"$set": {"used": True, "used_by": user["id"]}})
    safe = await db.users.find_one({"id": creator["id"]}, {"_id": 0, "password_hash": 0})
    return {"partner": safe}


@api_router.post("/connection/disconnect")
async def disconnect(user: dict = Depends(current_user)):
    pid = user.get("partner_id")
    if pid:
        await db.users.update_one({"id": pid}, {"$set": {"partner_id": None}})
    await db.users.update_one({"id": user["id"]}, {"$set": {"partner_id": None}})
    return {"ok": True}


# ======================= LISTS =======================
async def _accessible_user_ids(user: dict) -> List[str]:
    ids = [user["id"]]
    if user.get("partner_id"):
        ids.append(user["partner_id"])
    return ids


@api_router.get("/lists")
async def get_lists(type: Optional[str] = None, user: dict = Depends(current_user)):
    ids = await _accessible_user_ids(user)
    q: dict = {"$or": [{"owner_id": {"$in": ids}}, {"shared_with": {"$in": ids}}]}
    if type:
        q["type"] = type
    lists = await db.lists.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    if not lists:
        return lists
    # Batch counts via single aggregation to avoid N+1.
    list_ids = [lst["id"] for lst in lists]
    counts_cursor = db.list_items.aggregate([
        {"$match": {"list_id": {"$in": list_ids}}},
        {"$group": {
            "_id": "$list_id",
            "total": {"$sum": 1},
            "done": {"$sum": {"$cond": [{"$eq": ["$done", True]}, 1, 0]}},
        }},
    ])
    counts: dict = {}
    async for row in counts_cursor:
        counts[row["_id"]] = (row["total"], row["done"])
    for lst in lists:
        total, done = counts.get(lst["id"], (0, 0))
        lst["item_count"] = total
        lst["done_count"] = done
    return lists


@api_router.post("/lists")
async def create_list(req: ListCreate, user: dict = Depends(current_user)):
    lst = {
        "id": str(uuid.uuid4()),
        "owner_id": user["id"],
        "name": req.name.strip()[:80] or "Untitled",
        "type": req.type,
        "shared_with": [user["partner_id"]] if user.get("partner_id") else [],
        "created_at": iso(now_utc()),
    }
    await db.lists.insert_one(lst)
    lst.pop("_id", None)
    lst["item_count"] = 0
    lst["done_count"] = 0
    if lst["shared_with"] and user.get("partner_id"):
        await send_push(
            recipients=[user["partner_id"]],
            data={
                "title": f"{user['username']} started a new list",
                "message": lst["name"],
                "action_url": f"/list/{lst['id']}",
            },
            idempotency_key=f"list-create-{lst['id']}",
        )
    return lst


@api_router.get("/lists/{list_id}")
async def get_list(list_id: str, user: dict = Depends(current_user)):
    ids = await _accessible_user_ids(user)
    lst = await db.lists.find_one(
        {"id": list_id, "$or": [{"owner_id": {"$in": ids}}, {"shared_with": {"$in": ids}}]},
        {"_id": 0},
    )
    if not lst:
        raise HTTPException(404, "List not found")
    items = await db.list_items.find({"list_id": list_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    lst["items"] = items
    return lst


@api_router.patch("/lists/{list_id}")
async def update_list(list_id: str, req: ListUpdate, user: dict = Depends(current_user)):
    ids = await _accessible_user_ids(user)
    update = {}
    if req.name is not None:
        update["name"] = req.name.strip()[:80]
    if update:
        await db.lists.update_one(
            {"id": list_id, "$or": [{"owner_id": {"$in": ids}}, {"shared_with": {"$in": ids}}]},
            {"$set": update},
        )
    lst = await db.lists.find_one({"id": list_id}, {"_id": 0})
    return lst


@api_router.delete("/lists/{list_id}")
async def delete_list(list_id: str, user: dict = Depends(current_user)):
    res = await db.lists.delete_one({"id": list_id, "owner_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "List not found or not owner")
    await db.list_items.delete_many({"list_id": list_id})
    return {"ok": True}


@api_router.post("/lists/{list_id}/items")
async def add_item(list_id: str, req: ItemCreate, user: dict = Depends(current_user)):
    ids = await _accessible_user_ids(user)
    lst = await db.lists.find_one(
        {"id": list_id, "$or": [{"owner_id": {"$in": ids}}, {"shared_with": {"$in": ids}}]},
        {"_id": 0},
    )
    if not lst:
        raise HTTPException(404, "List not found")
    item = {
        "id": str(uuid.uuid4()),
        "list_id": list_id,
        "text": req.text.strip()[:200],
        "qty": req.qty,
        "assignee_id": req.assignee_id,
        "done": False,
        "due_at": req.due_at,
        "remind_minutes_before": req.remind_minutes_before,
        "recurrence": req.recurrence.dict() if req.recurrence else None,
        "created_by": user["id"],
        "created_at": iso(now_utc()),
    }
    await db.list_items.insert_one(item)
    item.pop("_id", None)
    # Notify partner if this list is shared
    if lst.get("shared_with") and user.get("partner_id"):
        await send_push(
            recipients=[user["partner_id"]],
            data={
                "title": f"{user['username']} added an item",
                "message": f"{lst['name']}: {item['text']}",
                "action_url": f"/list/{list_id}",
            },
            idempotency_key=f"item-create-{item['id']}",
        )
    return item


@api_router.patch("/items/{item_id}")
async def update_item(item_id: str, req: ItemUpdate, user: dict = Depends(current_user)):
    item = await db.list_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Item not found")
    ids = await _accessible_user_ids(user)
    lst = await db.lists.find_one(
        {"id": item["list_id"], "$or": [{"owner_id": {"$in": ids}}, {"shared_with": {"$in": ids}}]},
        {"_id": 0},
    )
    if not lst:
        raise HTTPException(403, "Not allowed")
    payload = req.dict(exclude_unset=True)
    update: dict = {}
    unset: dict = {}
    for k, v in payload.items():
        if k == "clear_due":
            if v:
                unset["due_at"] = ""
                unset["remind_minutes_before"] = ""
            continue
        if v is not None or k == "done":
            update[k] = v
    ops: dict = {}
    if update:
        ops["$set"] = update
    if unset:
        ops["$unset"] = unset
    if ops:
        await db.list_items.update_one({"id": item_id}, ops)
    updated = await db.list_items.find_one({"id": item_id}, {"_id": 0})
    # Notify partner when a shared item is marked done
    if (
        updated and updated.get("done")
        and lst.get("shared_with") and user.get("partner_id")
        and update.get("done") is True
    ):
        await send_push(
            recipients=[user["partner_id"]],
            data={
                "title": f"{user['username']} checked off a task",
                "message": f"{lst['name']}: {updated['text']}",
                "action_url": f"/list/{item['list_id']}",
            },
            idempotency_key=f"item-done-{item_id}-{iso(now_utc())[:13]}",
        )
    return updated


@api_router.delete("/items/{item_id}")
async def delete_item(item_id: str, user: dict = Depends(current_user)):
    item = await db.list_items.find_one({"id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(404, "Item not found")
    ids = await _accessible_user_ids(user)
    lst = await db.lists.find_one(
        {"id": item["list_id"], "$or": [{"owner_id": {"$in": ids}}, {"shared_with": {"$in": ids}}]},
        {"_id": 0},
    )
    if not lst:
        raise HTTPException(403, "Not allowed")
    await db.list_items.delete_one({"id": item_id})
    return {"ok": True}


# ======================= THOUGHTS =======================
@api_router.get("/thoughts")
async def get_thoughts(user: dict = Depends(current_user)):
    ids = await _accessible_user_ids(user)
    items = await db.thoughts.find(
        {"$or": [{"owner_id": user["id"]}, {"owner_id": {"$in": ids}, "shared": True}]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(500)
    return items


@api_router.post("/thoughts")
async def create_thought(req: ThoughtCreate, user: dict = Depends(current_user)):
    item = {
        "id": str(uuid.uuid4()),
        "owner_id": user["id"],
        "owner_username": user["username"],
        "text": req.text.strip()[:1000],
        "shared": bool(req.share_with_partner and user.get("partner_id")),
        "created_at": iso(now_utc()),
    }
    await db.thoughts.insert_one(item)
    item.pop("_id", None)
    return item


@api_router.delete("/thoughts/{tid}")
async def delete_thought(tid: str, user: dict = Depends(current_user)):
    res = await db.thoughts.delete_one({"id": tid, "owner_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ======================= JOURNAL =======================
@api_router.get("/journal")
async def get_journal(user: dict = Depends(current_user)):
    ids = await _accessible_user_ids(user)
    items = await db.journal.find(
        {"$or": [{"owner_id": user["id"]}, {"owner_id": {"$in": ids}, "shared": True}]},
        {"_id": 0},
    ).sort("created_at", -1).to_list(500)
    return items


@api_router.post("/journal")
async def create_journal(req: JournalCreate, user: dict = Depends(current_user)):
    item = {
        "id": str(uuid.uuid4()),
        "owner_id": user["id"],
        "owner_username": user["username"],
        "title": req.title.strip()[:120] or "Untitled",
        "body": req.body.strip()[:10000],
        "mood": req.mood,
        "shared": bool(req.share_with_partner and user.get("partner_id")),
        "created_at": iso(now_utc()),
    }
    await db.journal.insert_one(item)
    item.pop("_id", None)
    return item


@api_router.delete("/journal/{jid}")
async def delete_journal(jid: str, user: dict = Depends(current_user)):
    res = await db.journal.delete_one({"id": jid, "owner_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ======================= ROUTINE =======================
@api_router.get("/routine")
async def get_routine(user: dict = Depends(current_user)):
    r = await db.routines.find_one({"user_id": user["id"]}, {"_id": 0})
    if not r:
        r = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "steps": [],
            "created_at": iso(now_utc()),
        }
        await db.routines.insert_one(r)
        r.pop("_id", None)
    today = now_utc().strftime("%Y-%m-%d")
    checks = await db.routine_checks.find(
        {"user_id": user["id"], "date": today}, {"_id": 0}
    ).to_list(200)
    r["completed_today"] = [c["step_id"] for c in checks]
    return r


@api_router.put("/routine")
async def update_routine(req: RoutineUpdate, user: dict = Depends(current_user)):
    steps = [s.dict() for s in req.steps]
    for i, s in enumerate(steps):
        s["order"] = i
    await db.routines.update_one(
        {"user_id": user["id"]},
        {"$set": {"steps": steps}},
        upsert=True,
    )
    r = await db.routines.find_one({"user_id": user["id"]}, {"_id": 0})
    return r


@api_router.post("/routine/check")
async def check_step(req: RoutineCheckReq, user: dict = Depends(current_user)):
    existing = await db.routine_checks.find_one(
        {"user_id": user["id"], "step_id": req.step_id, "date": req.date}
    )
    if existing:
        await db.routine_checks.delete_one({"_id": existing["_id"]})
        return {"checked": False}
    await db.routine_checks.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "step_id": req.step_id,
        "date": req.date,
        "created_at": iso(now_utc()),
    })
    return {"checked": True}


@api_router.post("/register-push", status_code=201)
async def register_push(req: RegisterPushReq, user: dict = Depends(current_user)):
    try:
        resp = await _push_client.post(
            "/api/v1/push/users/register",
            json=req.dict(),
        )
        if resp.status_code == 401:
            raise HTTPException(500, "EMERGENT_PUSH_KEY missing or invalid")
        if resp.status_code >= 500:
            raise HTTPException(502, "Push provider unavailable")
        resp.raise_for_status()
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"register_push relay failed: {e}")
        # don't crash the client — token will be retried next app open
    return {"status": "registered"}


# ======================= EVENTS / CALENDAR =======================
@api_router.get("/events")
async def get_events(user: dict = Depends(current_user)):
    ids = await _accessible_user_ids(user)
    events = await db.events.find(
        {"$or": [{"owner_id": user["id"]}, {"owner_id": {"$in": ids}, "shared": True}]},
        {"_id": 0},
    ).sort("date", 1).to_list(1000)
    return events


@api_router.post("/events")
async def create_event(req: EventCreate, user: dict = Depends(current_user)):
    event = {
        "id": str(uuid.uuid4()),
        "owner_id": user["id"],
        "owner_username": user["username"],
        "title": req.title.strip()[:120] or "Untitled",
        "date": req.date,
        "time": req.time,
        "notes": (req.notes or "").strip()[:1000] or None,
        "location": (req.location or "").strip()[:200] or None,
        "remind_minutes_before": req.remind_minutes_before,
        "recurrence": req.recurrence.dict() if req.recurrence else None,
        "shared": bool(req.share_with_partner and user.get("partner_id")),
        "created_at": iso(now_utc()),
    }
    await db.events.insert_one(event)
    event.pop("_id", None)
    if event["shared"] and user.get("partner_id"):
        when_label = event["date"] + (f" · {event['time']}" if event.get("time") else "")
        await send_push(
            recipients=[user["partner_id"]],
            data={
                "title": f"{user['username']} added an event",
                "message": f"{event['title']} — {when_label}",
                "action_url": "/(tabs)/calendar",
            },
            idempotency_key=f"event-create-{event['id']}",
        )
    return event


@api_router.patch("/events/{eid}")
async def update_event(eid: str, req: EventUpdate, user: dict = Depends(current_user)):
    existing = await db.events.find_one({"id": eid, "owner_id": user["id"]}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Event not found")
    payload = req.dict(exclude_unset=True)
    if "share_with_partner" in payload:
        payload["shared"] = bool(payload.pop("share_with_partner") and user.get("partner_id"))
    if payload:
        await db.events.update_one({"id": eid}, {"$set": payload})
    updated = await db.events.find_one({"id": eid}, {"_id": 0})
    return updated


@api_router.delete("/events/{eid}")
async def delete_event(eid: str, user: dict = Depends(current_user)):
    res = await db.events.delete_one({"id": eid, "owner_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Not found")
    return {"ok": True}


# ======================= DAILY QUOTE (AI) =======================
@api_router.get("/quote/today")
async def get_today_quote(user: dict = Depends(current_user)):
    today = now_utc().strftime("%Y-%m-%d")
    cached = await db.quotes.find_one({"user_id": user["id"], "date": today}, {"_id": 0})
    if cached:
        return cached

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
        logger.warning(f"LLM quote generation failed: {e}")

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "date": today,
        "text": quote_text,
        "author": author,
        "created_at": iso(now_utc()),
    }
    await db.quotes.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/")
async def root():
    return {"app": "Tandem API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
