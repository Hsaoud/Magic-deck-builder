"""
MTG Deckbuilder — Backend (FastAPI)
Étapes 1-3 : Serveur + CSV + Collection + Scryfall proxy + Deck Builder support
"""

import csv
import os
from pathlib import Path
from contextlib import asynccontextmanager
import httpx
from fastapi import FastAPI, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# ---------------------------------------------------------------------------
# CSV loading (read-only, loaded once at startup)
# ---------------------------------------------------------------------------
CSV_PATH = Path(__file__).parent / "ManaBox_Collection.csv"

# In-memory stores
collection: list[dict] = []
collection_names: set[str] = set()        # lowercase card names for fast lookup
collection_scryfall_ids: set[str] = set() # scryfall IDs for exact lookup


def load_collection() -> list[dict]:
    """Parse the ManaBox CSV and return a list of card dicts."""
    cards: list[dict] = []
    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            cards.append({
                "binder_name": row["Binder Name"],
                "binder_type": row["Binder Type"],
                "name": row["Name"],
                "set_code": row["Set code"],
                "set_name": row["Set name"],
                "collector_number": row["Collector number"],
                "foil": row["Foil"].lower() == "foil",
                "rarity": row["Rarity"],
                "quantity": int(row["Quantity"]),
                "manabox_id": row["ManaBox ID"],
                "scryfall_id": row["Scryfall ID"],
                "purchase_price": float(row["Purchase price"]) if row["Purchase price"] else 0.0,
                "misprint": row["Misprint"].lower() == "true",
                "altered": row["Altered"].lower() == "true",
                "condition": row["Condition"],
                "language": row["Language"],
                "currency": row["Purchase price currency"],
                "image_uri": f"https://api.scryfall.com/cards/{row['Set code'].lower()}/{row['Collector number']}/fr?format=image&version=normal",
                "fallback_image_uri": f"https://api.scryfall.com/cards/{row['Scryfall ID']}?format=image&version=normal",
            })
    return cards


# ---------------------------------------------------------------------------
# Lifespan — load CSV once at startup, manage httpx client
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app):
    global collection, collection_names, collection_scryfall_ids
    collection = load_collection()
    collection_names = {c["name"].lower() for c in collection}
    collection_scryfall_ids = {c["scryfall_id"] for c in collection}
    print(f"[OK] Collection loaded: {len(collection)} card entries, {len(collection_names)} unique names")
    # Shared httpx client for Scryfall proxy
    app.state.http_client = httpx.AsyncClient(timeout=15.0)
    yield
    await app.state.http_client.aclose()


app = FastAPI(title="MTG Deckbuilder", version="0.1.0", lifespan=lifespan)


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------
@app.get("/api/collection")
def get_collection(
    search: str = Query(default="", description="Filter cards by name (case-insensitive)"),
    rarity: str = Query(default="", description="Filter by rarity"),
    set_code: str = Query(default="", description="Filter by set code"),
    binder: str = Query(default="", description="Filter by binder name"),
    page: int = Query(default=1, ge=1, description="Page number"),
    page_size: int = Query(default=50, ge=1, le=200, description="Items per page"),
):
    """Return the collection with optional filters and pagination."""
    filtered = collection

    if search:
        search_lower = search.lower()
        filtered = [c for c in filtered if search_lower in c["name"].lower()]

    if rarity:
        rarity_lower = rarity.lower()
        filtered = [c for c in filtered if c["rarity"] == rarity_lower]

    if set_code:
        set_lower = set_code.lower()
        filtered = [c for c in filtered if c["set_code"].lower() == set_lower]

    if binder:
        binder_lower = binder.lower()
        filtered = [c for c in filtered if c["binder_name"].lower() == binder_lower]

    total = len(filtered)
    start = (page - 1) * page_size
    end = start + page_size
    page_items = filtered[start:end]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
        "cards": page_items,
    }


@app.get("/api/collection/stats")
def get_collection_stats():
    """Return aggregate stats about the collection."""
    total_cards = sum(c["quantity"] for c in collection)
    unique_cards = len(collection)
    total_value = sum(c["purchase_price"] * c["quantity"] for c in collection)

    # Rarity breakdown
    rarities: dict[str, int] = {}
    for c in collection:
        rarities[c["rarity"]] = rarities.get(c["rarity"], 0) + c["quantity"]

    # Set breakdown (top 10)
    sets: dict[str, int] = {}
    for c in collection:
        sets[c["set_name"]] = sets.get(c["set_name"], 0) + c["quantity"]
    top_sets = sorted(sets.items(), key=lambda x: x[1], reverse=True)[:10]

    # Binder breakdown
    binders: dict[str, int] = {}
    for c in collection:
        binders[c["binder_name"]] = binders.get(c["binder_name"], 0) + c["quantity"]

    return {
        "total_cards": total_cards,
        "unique_entries": unique_cards,
        "total_value": round(total_value, 2),
        "currency": collection[0]["currency"] if collection else "EUR",
        "rarities": rarities,
        "top_sets": [{"name": s[0], "count": s[1]} for s in top_sets],
        "binders": binders,
    }


@app.get("/api/collection/binders")
def get_binders():
    """Return distinct binder names."""
    binder_names = sorted(set(c["binder_name"] for c in collection))
    return {"binders": binder_names}


# ---------------------------------------------------------------------------
# Scryfall Proxy (avoids CORS issues from browser)
# ---------------------------------------------------------------------------
@app.get("/api/scryfall/search")
async def scryfall_search(
    q: str = Query(..., description="Scryfall search query"),
    page: int = Query(default=1, ge=1),
):
    """Proxy Scryfall card search and annotate results with collection status."""
    client: httpx.AsyncClient = app.state.http_client
    try:
        # Try to search with French language forced
        fr_q = f"({q}) lang:fr"
        resp = await client.get(
            "https://api.scryfall.com/cards/search",
            params={"q": fr_q, "page": page, "order": "name"},
        )
        
        data = {}
        if resp.status_code == 200:
            data = resp.json()
        elif resp.status_code == 404:
            # Fallback to default (English/any) if no French results found
            resp = await client.get(
                "https://api.scryfall.com/cards/search",
                params={"q": q, "page": page, "order": "name"},
            )
            if resp.status_code == 404:
                return {"data": [], "has_more": False, "total_cards": 0}
            resp.raise_for_status()
            data = resp.json()
        else:
            resp.raise_for_status()

        # Annotate each card with collection membership
        cards = []
        for card in data.get("data", []):
            canonical_name = card.get("name", "")
            printed_name = card.get("printed_name", canonical_name)
            
            in_collection = card.get("id", "") in collection_scryfall_ids
            in_collection_by_name = (
                canonical_name.lower() in collection_names or 
                printed_name.lower() in collection_names
            )
            
            image = ""
            if "image_uris" in card:
                image = card["image_uris"].get("normal", card["image_uris"].get("large", ""))
            elif "card_faces" in card and card["card_faces"]:
                face = card["card_faces"][0]
                if "image_uris" in face:
                    image = face["image_uris"].get("normal", "")

            cards.append({
                "scryfall_id": card.get("id", ""),
                "name": printed_name,
                "set_code": card.get("set", ""),
                "set_name": card.get("set_name", ""),
                "collector_number": card.get("collector_number", ""),
                "rarity": card.get("rarity", ""),
                "type_line": card.get("type_line", ""),
                "mana_cost": card.get("mana_cost", ""),
                "cmc": card.get("cmc", 0),
                "oracle_text": card.get("oracle_text", ""),
                "image_uri": image,
                "in_collection": in_collection,
                "in_collection_by_name": in_collection_by_name,
            })

        return {
            "data": cards,
            "has_more": data.get("has_more", False),
            "total_cards": data.get("total_cards", 0),
        }
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Scryfall request timed out")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail="Scryfall error")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/collection/check")
def check_collection(name: str = Query(..., description="Card name to check")):
    """Check if a card name exists in the collection and return matching entries."""
    name_lower = name.lower()
    matches = [c for c in collection if c["name"].lower() == name_lower]
    return {
        "found": len(matches) > 0,
        "total_quantity": sum(c["quantity"] for c in matches),
        "entries": matches,
    }


# ---------------------------------------------------------------------------
# Suggestions System (Étape 4)
# ---------------------------------------------------------------------------
from pydantic import BaseModel, Field
from datetime import datetime

# In-memory suggestions store
suggestions: list[dict] = []


class SuggestionIn(BaseModel):
    """Incoming suggestion from a visitor."""
    author: str = Field(..., min_length=1, max_length=100, description="Visitor name")
    deck_name: str = Field(default="", max_length=200, description="Target deck name (optional)")
    card_name: str = Field(..., min_length=1, max_length=300, description="Suggested card name")
    card_scryfall_id: str = Field(default="", description="Scryfall ID of the card")
    card_image_uri: str = Field(default="", description="Image URL of the card")
    card_set_code: str = Field(default="", description="Set code")


@app.post("/api/suggestions")
def post_suggestion(suggestion: SuggestionIn):
    """Submit a card suggestion for a deck."""
    entry = {
        "id": len(suggestions) + 1,
        "author": suggestion.author.strip(),
        "deck_name": suggestion.deck_name.strip(),
        "card_name": suggestion.card_name.strip(),
        "card_scryfall_id": suggestion.card_scryfall_id,
        "card_image_uri": suggestion.card_image_uri,
        "card_set_code": suggestion.card_set_code,
        "timestamp": datetime.now().isoformat(),
    }
    suggestions.append(entry)
    print(f"[SUGGESTION] {entry['author']} -> {entry['card_name']} for deck '{entry['deck_name']}'")
    return {"ok": True, "suggestion": entry}


@app.get("/api/suggestions")
def get_suggestions(
    since_id: int = Query(default=0, description="Return suggestions with ID > since_id (for polling)"),
):
    """Get suggestions, optionally only new ones since a given ID (for polling)."""
    if since_id > 0:
        new_items = [s for s in suggestions if s["id"] > since_id]
        return {"suggestions": new_items, "total": len(suggestions)}
    return {"suggestions": list(reversed(suggestions)), "total": len(suggestions)}


# ---------------------------------------------------------------------------
# Static files — serve the frontend
# ---------------------------------------------------------------------------
STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def serve_index():
    """Serve the main HTML page."""
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return {"message": "Frontend not yet built. Visit /docs for the API."}


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
