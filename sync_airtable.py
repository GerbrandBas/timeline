import os, json, time
import requests

AIRTABLE_TOKEN = os.environ["AIRTABLE_TOKEN"]
BASE_ID = os.environ["AIRTABLE_BASE_ID"]
TABLE = os.environ["AIRTABLE_TABLE_NAME"]

# Optioneel: Airtable view om te filteren/sorteren aan Airtable-kant
VIEW = os.environ.get("AIRTABLE_VIEW_NAME")

OUT_PATH = os.environ.get("OUT_PATH", "data/events.json")

API_URL = f"https://api.airtable.com/v0/{BASE_ID}/{TABLE}"

def pick_image(fields):
  # Attachment field "Image" → neem eerste attachment.url als beschikbaar
  img = fields.get("Image")
  if isinstance(img, list) and img:
    return img[0].get("url")
  return None

def main():
  headers = {
    "Authorization": f"Bearer {AIRTABLE_TOKEN}",
    "Content-Type": "application/json"
  }

  params = {"pageSize": 100}
  if VIEW:
    params["view"] = VIEW

  records = []
  offset = None

  while True:
    if offset:
      params["offset"] = offset
    r = requests.get(API_URL, headers=headers, params=params, timeout=30)
    r.raise_for_status()
    data = r.json()
    records.extend(data.get("records", []))
    offset = data.get("offset")
    if not offset:
      break
    time.sleep(0.15)  # vriendelijk voor rate limits

  events = []
  for rec in records:
    f = rec.get("fields", {})
    ev = {
      "id": rec.get("id"),
      "title": f.get("Title"),
      "start": f.get("Start"),
      "end": f.get("End"),
      "description": f.get("Description"),
      "category": f.get("Category"),
      "link": f.get("Link"),
      "image": pick_image(f),
      "featured": bool(f.get("Featured", False)),
      "order": f.get("Order"),
    }
    # simpele sanity: skip lege titels zonder datum (mag je aanpassen)
    if not ev["title"] and not ev["start"]:
      continue
    events.append(ev)

  payload = {
    "updatedAt": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
    "events": events
  }

  os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
  with open(OUT_PATH, "w", encoding="utf-8") as fp:
    json.dump(payload, fp, ensure_ascii=False, indent=2)

  print(f"Wrote {len(events)} events to {OUT_PATH}")

if __name__ == "__main__":
  main()
