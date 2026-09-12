"""Read-only Atlas connectivity check; credentials never appear in output."""
import argparse
import sys
import tomllib
from pathlib import Path

import certifi
from pymongo import MongoClient
from pymongo.server_api import ServerApi


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--secrets", type=Path, required=True)
    parser.add_argument("--key", default="MONGO_URI")
    args = parser.parse_args()
    secrets = tomllib.loads(args.secrets.read_text(encoding="utf-8"))
    uri = secrets[args.key]
    try:
        with MongoClient(uri, tlsCAFile=certifi.where(), server_api=ServerApi("1"),
                         serverSelectionTimeoutMS=12000, connectTimeoutMS=8000) as client:
            client.admin.command("ping")
            hello = client.admin.command("hello")
            collections = client["brain_racer"].list_collection_names()
            print("Atlas connection: OK")
            print("Replica-set transactions:", bool(hello.get("setName")))
            print("Brain Racer existing collections:", len(collections))
            print("Schema names compatible:", set(collections).issubset({"coordination", "players", "rooms",
                  "room_players", "game_sessions", "game_events", "quiz_answers", "dedications"}))
    except Exception as exc:
        print("Atlas connection failed:", type(exc).__name__, "code:", getattr(exc, "code", None))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
